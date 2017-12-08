const path = require('path')
const request = require('superagent')
const redis = require("redis")
const Promise = require('bluebird')
const cheerio = require('cheerio')
const _ = require('lodash')
const fs = require('fs-extra')
const asy = require('async')
const commander = require("commander")
const debug = require("debug")

const tools = require('./tools.js')
const options = require('./options.js')

const trace = debug('trace')
const error = debug('error')

const URL_HTML_DATA_PATH = path.join(options.data_path, 'htmls')
fs.ensureDirSync(URL_HTML_DATA_PATH)

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
    cached: 0,
    image_count: 0,
    sub_url_count: 0,
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

        try {
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

        } catch (err) {
            debug("url:Run")("error: %o", err)
            console.log(err)
            process.exit(1)
        }
    }
    console.log('END')
    process.exit(1)
}

/**************************************************************/
/******************* Queue relevant Functions *****************/
/**************************************************************/

async function QueueWorker(task) {
    // Check if cached
    const cached = await get_url_cached(task.url)
    if (cached)
        return stats.cached++

    const res = await request.get(task.url)
        .ok(res => res.status === 200)
        .set('User-Agent', tools.get_user_agent())
        .timeout({
            response: 30 * 1000,
            deadline: 60 * 1000
        })
    if (!res.text) return   // skip it

    await cache_url(task.url, res.text)  // cache it
    html_text = res.text

    // Parse & Push Sub Urls
    const depth = get_raw_url_depth(task.raw_url)
    if (depth < options.depth) {
        const nextUrls = retrieve_sub_urls(html_text, task.url)
        if (nextUrls && nextUrls.length) {
            push_sub_urls(nextUrls, task.raw_url)
            stats.sub_url_count += nextUrls.length
        }
    }

    // Parse & Push Image Urls
    const imgurls = retrieve_image_urls(html_text, task.url)
    if (imgurls && imgurls.length) {
        push_image_urls(imgurls, task.raw_url)
        stats.image_count += imgurls.length
    }
}

function QueueErrorHandler(err, task) {
    if (task.tries-- > 0)
        return setTimeout(() => q.push(task), task.delay || 0)
    else
        stats.failed++

    if (!err.status && !err.code && !err.statusCode && !err.host) {
        console.error(err)
        debug("url:error")("error:%O, task: %O", err, task)
    }
}

function QueueStatisticsReporter() {
    const mem = process.memoryUsage()
    const duration = process.hrtime(stats.start_at)[0]
    const total = stats.completed + stats.failed

    console.log(`[URL.js]******************** Cost time: ${duration}s  ******************* `)
    console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
    console.log(`Running: ${q.running()} Waiting: ${q.length()}`)
    console.log(`Total: ${total} [${total / duration}/s] `)
    console.log(`Failed: ${stats.failed} (${stats.failed / total * 100}%)`)
    console.log(`Cached: ${stats.cached} (${stats.cached / total * 100}%)`)
    console.log(`Image Urls: ${stats.image_count} [${stats.image_count / duration}/s] `)
    console.log(`Sub Urls: ${stats.sub_url_count} [${stats.sub_url_count / duration}/s] `)
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

async function get_url_cached(task_url) {
    const file_name = tools.md5(task_url) + ".html"
    const file_path = path.join(URL_HTML_DATA_PATH, file_name)
    if (!await fs.pathExists(file_path))
        return null

    const data = await fs.readFile(file_path)
    return data.toString()
}

async function cache_url(task_url, html_text) {
    const file_name = tools.md5(task_url) + ".html"
    const file_path = path.join(URL_HTML_DATA_PATH, file_name)
    await fs.writeFile(file_path, html_text)
}