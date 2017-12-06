const fs = require('fs-extra')
const path = require('path')
const request = require('superagent')
const kue = require('kue')
const redis = require("redis")
const Promise = require('bluebird')
const asy = require('async')
Promise.promisifyAll(fs)
Promise.promisifyAll(redis)

const lib = require('./lib.js')
const options = require('./options.js')

let start_at = process.hrtime()
let dataPath = options.data_path

fs.ensureDirSync(`${dataPath}/logs`)
let logger = new console.Console(
    fs.createWriteStream(`${dataPath}/logs/url_failed.log`),
    fs.createWriteStream(`${dataPath}/logs/url_failed.error.log`)
)

let client = redis.createClient(options.redis)

const c_url = process.argv[2] || 1000

let completed = 0
let failed = 0
let imageCount = 0
let nextUrlCount = 0

// Create Task Queue
const q = asy.queue(worker, c_url)

async function main() {
    // Exit & Exception
    process.on('uncaughtException', err => console.error(err))

    // Report Loop
    setInterval(async () => {
        let mem = process.memoryUsage()
        let duration = process.hrtime(start_at)[0]

        console.log(`[1.URL.js]******************** Cost time: ${duration}s  ******************* `)
        console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
        console.log(`Running: ${q.running()} Waiting: ${q.length()}`)
        console.log(`Completed: ${completed} [${completed / duration}/s] `)
        console.log(`Failed: ${failed} [${failed / duration}/s] `)
        console.log(`Images: ${imageCount} [${imageCount / duration}/s] `)
        console.log(`NextUrls: ${nextUrlCount} [${nextUrlCount / duration}/s] `)
    }, 5000)

    while (true) {
        if (q.length() > 100) {
            await Promise.delay(1000)
            continue
        }

        const raw_url = await client.rpopAsync(options.key_url)

        if (!raw_url) {
            console.log("Failed to get orignal url from Redis, delay 10s then try again.")
            await Promise.delay(10 * 1000)
            continue
        }
        const arr = raw_url.split(options.sep)
        const depth = arr.length

        const task = {
            url: arr[0],
            raw_url,
            tries: 2 / depth | 0,
            delay: 2 / depth * 1000 | 0
        }

        q.push(task, err => err ? null : completed++)
    }
}

main()

async function worker(job) {
    // Request the Url
    let res = await request.get(job.url)
        .ok(res => res.status === 200)
        .set('User-Agent', lib.getUserAgent())
        .timeout({
            response: 30 * 1000,
            deadline: 60 * 1000
        })

    if (!res.text)
        return

    // Get & Push NextUrls
    const depth = getRawUrlDepth(job.raw_url)
    if(depth < options.depth){
        let nextUrls = lib.getNextUrls(res.text, job.url)
        if (nextUrls && nextUrls.length) {
            pushNextUrls(nextUrls, job.raw_url)
            nextUrlCount += nextUrls.length
        }
    }

    // Save Html to File
    // let dirname = job.url.replace(':', '_')
    // let p = path.join(dataPath, "htmls", dirname)
    // let filepath = path.join(p, `${dirname}.html`)
    // await lib.saveHtml(filepath, res.text)

    // Get & Push Images
    let imgurls = lib.getImages(res.text, job.url)
    if (imgurls && imgurls.length) {
        pushImgUrl(imgurls, job.raw_url)
        imageCount += imgurls.length
    }

}

q.error = function (err, task) {
    if (task.tries-- > 0)
        return setTimeout(() => q.push(task), task.delay || 0)
    else
        failed++

    if (!err.status && !err.code && !err.statusCode && !err.host)
        console.error(err)
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