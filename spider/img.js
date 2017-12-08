const fs = require('fs-extra')
const path = require('path')
const request = require('superagent')
const asy = require('async')
const redis = require("redis")
const Promise = require('bluebird')
const commander = require("commander")
const debug = require("debug")
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

// Ensure PATHs exists
const IMAGE_DATA_PATH = path.join(options.data_path, 'images')
fs.ensureDirSync(IMAGE_DATA_PATH)
const IMAGE_CACHE_PATH = path.join(options.data_path, 'image.cache')
fs.ensureDirSync(IMAGE_CACHE_PATH)

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
    const _trace = debug('img:worker')
    _trace("Start: task %o", task)

    const img_url_hash = tools.md5(task.imgurl)

    // Check if cached
    const cached = await get_image_cached(task.imgurl)
    if (cached)
        return stats.cached++

    // Download Image
    const response = await download_image(task.imgurl)

    // Ignore images whose file-size is less than 6 * 1024 bytes
    const image_length = Number(response.headers['content-length'])
    if (image_length <= 6 * 1024) {
        _trace("Ignore! length: %d, image raw url: %s", image_length, task.raw_url)
        stats.skipped++
        return
    }

    // Ignore images not have an legal extension
    const image_file_ext = get_image_ext(response.headers['content-type'])
    if (!image_file_ext) {
        _trace("Ignore! content-type: %s, image url: %s", response.headers['content-type'], task.imgurl)
        stats.skipped++
        return
    }

    // Write image data to file
    const image_file_path = await write_image_file(task.imgurl, image_file_ext, response.body)
    _trace("Write image to file successfully")

    // Cahce it
    await cache_image(task.imgurl)

    // Push image information to Scanner Queue
    push_image_to_scanner_queue(task.raw_url, image_file_path)
    _trace("Push image information to Scanner Queue successfully")
}

function QueueErrorHandler(err, task) {
    const _trace = debug('img:error')
    const _try = debug('img:error:failed')

    _trace('Error: %O, Task: %o', err, task)

    if (task.tries-- > 0) {
        _try("Trying, task: %o", task)
        return setTimeout(() => q.push(task), task.delay || 0)
    } else {
        _try("Failed, task: %o", task)
        stats.failed++
    }

    if (!err.status && !err.code && !err.statusCode && !err.host)
        console.error(err)
    else
        debug('img:error:http')("Http error: %O, task: %o", err, task)
}

function QueueStatisticsReporter() {
    const mem = process.memoryUsage()
    const duration = process.hrtime(stats.start_at)[0]
    const total = stats.completed + stats.failed

    console.log(`[IMG.js]******************** Cost time: ${duration}s  ******************* `)
    console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
    console.log(`Running: ${q.running()} Waiting: ${q.length()}`)
    console.log(`Total: ${total} [${total / duration}/s] `)
    console.log(`Failed: ${stats.failed} (${stats.failed / total * 100}%) `)
    console.log(`Cached: ${stats.cached} (${stats.cached / total * 100}%) `)
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
    const _trace = debug('img:get_image_ext')
    try {
        let ext = content_type.split('/').pop()
        if (ext != 'jpg' || ext != 'png' || ext != 'gif' || ext != 'bmp')
            ext = 'jpg'

        _trace("Done, ext :%s", ext)
        return ext
    } catch (err) {
        _trace("Err: %O", err)
        return null
    }
}

function push_image_to_scanner_queue(image_raw_url, image_path) {
    const task = `${image_path}${options.sep}${image_raw_url}`
    client.lpush(options.key_scanning, task, (err, ret) => {
        if (err) console.log(err)
    })
}

async function write_image_file(image_url, image_ext, image_data) {
    const image_file_name = tools.md5(image_url) + "." + image_ext
    const image_file_path = path.join(IMAGE_DATA_PATH, image_file_name)
    await fs.writeFile(image_file_path, image_data)
    return image_file_path
}

async function get_image_cached(image_url) {
    const cached_file_path = path.join(IMAGE_CACHE_PATH, tools.md5(image_url) + '.meta')
    const exists = await fs.pathExists(cached_file_path)
    if (!exists)
        return false

    const score = await fs.readFile(cached_file_path)
    return Number(score) < 0.8
}

async function cache_image(image_url) {
    const cache_file_name = tools.md5(image_url) + `.meta`
    const cache_file_path = path.join(IMAGE_CACHE_PATH, cache_file_name)
    await fs.writeFile(cache_file_path, '0')
}