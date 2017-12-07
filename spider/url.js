const path = require('path')
const request = require('superagent')
const redis = require("redis")
const Promise = require('bluebird')
const asy = require('async')
const commander = require("commander")

Promise.promisifyAll(redis)

const lib = require('./lib.js')
const options = require('./options.js')

commander.version("2.0")
    .option('-c, --concurrency [value]', 'Concurrency Number of Requesting url', 100)
    .option('-w, --waiting [value]', 'The Number of tasks waiting in Queue', 10)
    .parse(process.argv)


let client = redis.createClient(options.redis)

const stats = {
    completed: 0,
    failed: 0,
    imageCount: 0,
    nextUrlCount: 0,
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

        const raw_url = await client.rpopAsync(options.key_url)
        if (!raw_url) {
            console.log("Failed to get orignal url from Redis, delay 10s then try again.")
            await Promise.delay(10 * 1000)
            continue
        }

        const [url0] = raw_url.split(options.sep)
        const depth = getRawUrlDepth(raw_url)

        const task = {
            url: url0,
            raw_url,
            tries: 2 / depth | 0,
            delay: 2 / depth * 1000 | 0
        }

        q.push(task, err => err ? null : stats.completed++)
    }
    console.log("Done!")
}

async function QueueWorker(task) {
    // Request the Url
    let res = await request.get(task.url)
        .ok(res => res.status === 200)
        .set('User-Agent', lib.getUserAgent())
        .timeout({
            response: 30 * 1000,
            deadline: 60 * 1000
        })

    if (!res.text)
        return

    // Get & Push NextUrls
    const depth = getRawUrlDepth(task.raw_url)
    if (depth < options.depth) {
        let nextUrls = lib.getNextUrls(res.text, task.url)
        if (nextUrls && nextUrls.length) {
            pushNextUrls(nextUrls, task.raw_url)
            stats.nextUrlCount += nextUrls.length
        }
    }

    // Get & Push Images
    let imgurls = lib.getImages(res.text, task.url)
    if (imgurls && imgurls.length) {
        pushImgUrl(imgurls, task.raw_url)
        stats.imageCount += imgurls.length
    }
}

function QueueErrorHandler(err, task) {
    if (task.tries-- > 0)
        return setTimeout(() => q.push(task), task.delay || 0)
    else
        stats.failed++

    if (!err.status && !err.code && !err.statusCode && !err.host)
        console.error(err)
}

function QueueStatisticsReporter() {
    let mem = process.memoryUsage()
    let duration = process.hrtime(stats.start_at)[0]

    console.log(`[URL.js]******************** Cost time: ${duration}s  ******************* `)
    console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
    console.log(`Running: ${q.running()} Waiting: ${q.length()}`)
    console.log(`Completed: ${stats.completed} [${stats.completed / duration}/s] `)
    console.log(`Failed: ${stats.failed} [${stats.failed / duration}/s] `)
    console.log(`Images: ${stats.imageCount} [${stats.imageCount / duration}/s] `)
    console.log(`NextUrls: ${stats.nextUrlCount} [${stats.nextUrlCount / duration}/s] `)
}

function pushImgUrl(img_urls, url_str) {
    imgurls = imgurls || []
    let arr = img_urls.map(img_url => `${img_url}${options.sep}${url_str}`)
    arr.unshift(options.key_img_url)
    client.lpush(arr)
}

function pushNextUrls(urls, url_str) {
    urls = urls || []
    let arr = urls.map(u => `${u}${options.sep}${url_str}`)
    let key = options.key_url
    arr.unshift(key)
    client.lpush(arr)
}

function getRawUrlDepth(raw_url) {
    return raw_url.split(options.sep).length
}