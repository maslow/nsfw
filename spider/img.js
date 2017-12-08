const fs = require('fs-extra')
const path = require('path')
const request = require('superagent')
const asy = require('async')
const redis = require("redis")
const Promise = require('bluebird')
const commander = require("commander")
const debug = require("debug")("img")
const options = require('./options.js')
const tools = require('./tools.js')

// Command Line Parameters Parsing
commander.version("2.0")
    .option('-c, --concurrency [value]', 'Concurrency Number of Requesting url', 100)
    .option('-w, --waiting [value]', 'The Number of tasks waiting in Queue', 10)
    .parse(process.argv)

Promise.promisifyAll(redis)

// New a Redis Client
const client = redis.createClient(options.redis)

// Ensure IMAGE_DATA_PATH exists
const IMAGE_DATA_PATH = path.join(options.data_path, 'images')
fs.ensureDirSync(IMAGE_DATA_PATH)

// Statstistic Status
const stats = {
    skipped: 0,
    completed: 0,
    failed: 0,
    cached: 0,
    start_at: process.hrtime()
}

// Create Task Queue
const q = asy.queue(QueueWorker, commander.concurrency)

// Set Queue Error Handler
q.error = QueueErrorHandler

// Exit & Exception
process.on('uncaughtException', err => console.error(err))

// Queue Statistics Reporter Loop
setInterval(QueueStatisticsReporter, 5000)

Run()

async function Run() {
    // Task-pushing Loop
    while (true) {
        if (q.length() > commander.waiting) {
            await Promise.delay(1000)
            continue
        }

        const raw_url = await client.rpopAsync(options.key_img_url)
        if (!raw_url) {
            console.log("Failed to get image url from Redis, delay 10s then try again.")
            await Promise.delay(10 * 1000)
            continue
        }

        const [imgurl] = raw_url.split(options.sep)

        const task = {
            imgurl,
            raw_url,
            tries: 2,
            delay: 1000
        }

        q.push(task, err => err ? null : stats.completed++)
    }
}

/**************************************************************/
/******************* Queue relevant Functions *****************/
/**************************************************************/

async function QueueWorker(task) {
    debug("QueueWorker(), task %o", task)

    const img_url_hash = tools.md5(task.imgurl)

    const response = await download_image(task.imgurl)

    // Ignore images whose file-size is less than 6 * 1024 bytes
    const img_length = Number(response.headers['content-length'])
    if (img_length <= 6 * 1024) {
        debug("QueueWorker(), image raw url: %s", task.raw_url)
        stats.skipped++
        return
    }

    // Ignore images not have an legal extension
    const img_file_ext = get_image_ext(response.headers['content-type'])
    if (!img_file_ext) {
        debug("QueueWorker(), content-type: %s, image url: %s", response.headers['content-type'], task.imgurl)
        stats.skipped++
        return
    }

    // Write image data to file
    const img_file_path = path.join(IMAGE_DATA_PATH, `${img_url_hash}.${img_file_ext}`)
    await fs.writeFile(img_file_path, response.body)
    debug("QueueWorker() > Write image to file successfully")

    // Push image information to Scanner Queue
    push_image_to_scanner_queue(task.raw_url, img_file_path)
    debug("QueueWorker() > Push image information to Scanner Queue successfully")
}

function QueueErrorHandler(err, task) {
    if (task.tries-- > 0)
        return setTimeout(() => q.push(task), task.delay || 0)
    else
        stats.failed++

    if (!err.status && !err.code && !err.statusCode && !err.host)
        console.error(err)
    else
        debug("QueueErrorHandler() , Error: %O , Task: %O)", err, task)
}

function QueueStatisticsReporter() {
    const mem = process.memoryUsage()
    const duration = process.hrtime(stats.start_at)[0]

    console.log(`[IMG.js]******************** Cost time: ${duration}s  ******************* `)
    console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
    console.log(`Running: ${q.running()} Waiting: ${q.length()}`)
    console.log(`Completed: ${stats.completed} [${stats.completed / duration}/s] `)
    console.log(`Failed: ${stats.failed} [${stats.failed / duration}/s] `)
    console.log(`Cached: ${stats.cached} [${stats.cached / duration}/s] `)
}

/**************************************************************/
/******************** Image-dealing Functions *******************/
/**************************************************************/

function download_image(imgurl) {
    const headers = {
        'User-Agent': tools.get_user_agent()
    }

    const timeoutOptions = {
        response: 15 * 1000,
        deadline: 60 * 1000
    }

    return new Promise((resolve, reject) => {
        request.get(imgurl)
            .ok(res => res.status === 200 || res.status === 304)
            .set(headers).timeout(timeoutOptions)
            .end((err, res) => {
                if (err) return reject(err)
                resolve(res)
            })
    })
}

function get_image_ext(content_type) {
    try {
        const ext = content_type.split('/').pop()
        if (ext != 'jpg' || ext != 'jpeg' || ext != 'png' || ext != 'gif' || ext != 'bmp')
            ext = 'jpg'
        return ext
    } catch (err) {
        return null
    }
}

function push_image_to_scanner_queue(image_raw_url, image_path) {
    const task = `${image_path}${options.seq}${image_raw_url}`
    client.lpush(options.key_scanning, task, (err, ret) => {
        if (err) console.log(err)
    })
}