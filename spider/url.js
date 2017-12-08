const path = require('path')
const request = require('superagent')
const redis = require("redis")
const Promise = require('bluebird')
const cheerio = require('cheerio')
const _ = require('lodash')
const asy = require('async')
const commander = require("commander")

const tools = require('./tools.js')
const options = require('./options.js')

// Command Line Parameters Parsing
commander.version("2.0")
    .option('-c, --concurrency [value]', 'Concurrency Number of Requesting url', 100)
    .option('-w, --waiting [value]', 'The Number of tasks waiting in Queue', 10)
    .parse(process.argv)

Promise.promisifyAll(redis)

// New a Redis Client
const client = redis.createClient(options.redis)

// Statstistic Status
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
        const depth = get_raw_url_depth(raw_url)

        const task = {
            url: url0,
            raw_url,
            tries: 2 / depth | 0,
            delay: 2 / depth * 1000 | 0
        }

        q.push(task, err => err ? null : stats.completed++)
    }
}

/**************************************************************/
/******************* Queue relevant Functions *****************/
/**************************************************************/

async function QueueWorker(task) {
    // Request the Url
    const res = await request.get(task.url)
        .ok(res => res.status === 200)
        .set('User-Agent', tools.get_user_agent())
        .timeout({
            response: 30 * 1000,
            deadline: 60 * 1000
        })

    if (!res.text)
        return

    // Get & Push NextUrls
    const depth = get_raw_url_depth(task.raw_url)
    if (depth < options.depth) {
        const nextUrls = retrieve_sub_urls(res.text, task.url)
        if (nextUrls && nextUrls.length) {
            push_sub_urls(nextUrls, task.raw_url)
            stats.nextUrlCount += nextUrls.length
        }
    }

    // Get & Push Images
    const imgurls = retrieve_image_urls(res.text, task.url)
    if (imgurls && imgurls.length) {
        push_image_urls(imgurls, task.raw_url)
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
    const mem = process.memoryUsage()
    const duration = process.hrtime(stats.start_at)[0]

    console.log(`[URL.js]******************** Cost time: ${duration}s  ******************* `)
    console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
    console.log(`Running: ${q.running()} Waiting: ${q.length()}`)
    console.log(`Completed: ${stats.completed} [${stats.completed / duration}/s] `)
    console.log(`Failed: ${stats.failed} [${stats.failed / duration}/s] `)
    console.log(`Images: ${stats.imageCount} [${stats.imageCount / duration}/s] `)
    console.log(`NextUrls: ${stats.nextUrlCount} [${stats.nextUrlCount / duration}/s] `)
}

/**************************************************************/
/******************** Url-dealing Functions *******************/
/**************************************************************/

function retrieve_sub_urls(html_text, fromUrl) {
    const $ = cheerio.load(html_text)
    const nUrls = $("a").toArray() || []
    nextUrls = nUrls
        .map(nUrl => nUrl.attribs.href)
        .map(nUrl => tools.resolve_url(nUrl, fromUrl))
        .filter(nUrl => nUrl)

    return _.uniq(nextUrls)
}

function retrieve_image_urls(html_text, fromUrl) {
    const $ = cheerio.load(html_text)
    const imgs = $("img").toArray() || []
    imgurls = imgs
        .map(img => img.attribs.src)
        .map(img => tools.resolve_url(img, fromUrl))
        .filter(img => img)

    return _.uniq(imgurls)
}

function push_image_urls(img_urls, url_str) {
    if (!img_urls || !img_urls.length)
        return
    const params = img_urls.map(img_url => `${img_url}${options.sep}${url_str}`)
    params.unshift(options.key_img_url)
    client.lpush(params)
}

function push_sub_urls(urls, url_str) {
    if (!urls || !urls.length)
        return
    const params = urls.map(u => `${u}${options.sep}${url_str}`)
    params.unshift(options.key_url)
    client.lpush(params)
}

function get_raw_url_depth(raw_url) {
    return raw_url.split(options.sep).length
}