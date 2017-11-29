const fs = require('fs-extra')
const path = require('path')
const request = require('superagent')
const kue = require('kue')
const lib = require('./lib.js')
const redis = require("redis")
const options = require('./options.js')
const Promise = require('bluebird')
const asy = require('async')
Promise.promisifyAll(fs)
Promise.promisifyAll(redis)

let start_at = process.hrtime()
let dataPath = options.data_path
let kueport = Math.floor(Math.random() * 10000) + 3000
fs.ensureDirSync(`${dataPath}/logs`)
let logger = new console.Console(
    fs.createWriteStream(`${dataPath}/logs/url_failed_${kueport}.log`),
    fs.createWriteStream(`${dataPath}/logs/url_failed_${kueport}.error.log`)
)

let redisOptions = options.redis
let client = redis.createClient(redisOptions)
let key = options.key_original_url

const c_url = process.argv[2] || 100

let imageCount = 0
let nextUrlCount = 0

let q = kue.createQueue({
    prefix: 'url' + kueport,
    redis: redisOptions
})

q.process('URL', c_url, async function (job, done) {
    let u = 'http://' + job.data.url
    try {
        let res = await request.get(u)
            .ok(res => res.status === 200)
            .set('User-Agent', lib.getUserAgent())
            .timeout({
                response: 30 * 1000,
                deadline: 60 * 1000
            })

        if (!res.text) {
            job.log('response.text is empty')
            return done()
        }

        let nextUrls = lib.getNextUrls(res.text, job.data.url)
        if (nextUrls && nextUrls.length) {
            pushNextUrls(nextUrls, job.data.url)
            nextUrlCount += nextUrls.length
        }

        let dirname = job.data.url.replace(':', '_')
        let p = path.join(dataPath, "htmls", dirname)
        let filepath = path.join(p, `${dirname}.html`)
        await lib.saveHtml(filepath, res.text)

        let imgurls = lib.getImages(res.text, 'http://' + job.data.url)
        job.log(`images count: ${imgurls.length}`)

        if (imgurls && imgurls.length) {
            pushImgUrl(imgurls, job.data.url)
            imageCount += imgurls.length
        }
        done()
    } catch (err) {
        job.delay(60 * 1000).backoff(true)
        logger.log(job.data.url)
        logger.error(job.data.url + ',' + (err.status || err.code || err.message))
        return done(err)
    }
})

async function main() {

    // Kue Web UI
    kue.app.listen(kueport, err => {
        if (err) return console.error(err)
        console.log('listening on port ' + kueport)
    })

    // Exit & Exception
    process
        .on('exit', code => {
            let end_at = process.hrtime(start_at)
            console.log(end_at[0] + 's, ' + end_at[1] + 'ns')
        })
        .on('uncaughtException', err => {
            console.error(err)
        })

    // Report Loop
    setInterval(async() => {
        let mem = process.memoryUsage()
        let rets = await statsQueue(q)
        let duration = process.hrtime(start_at)[0]
        let total = rets.url_complete + rets.url_failed

        console.log(`[1.URL.js]******************** Cost time: ${duration}s  Port: ${kueport} ******************* `)
        console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
        console.log(`Images: ${imageCount} [${imageCount / duration}/s] NextUrls: ${nextUrlCount}`)
        console.log(`Total: ${total} [${total / duration}/s] Complete: ${rets.url_complete / duration}/s`)
        console.log('{')
        console.log(`
            Inactive: ${rets.url_inactive}
              Active: ${rets.url_active}
             Delayed: ${rets.url_delayed}
            Complete: ${rets.url_complete}  [${rets.url_complete / total * 100}%]
              Failed: ${rets.url_failed}   [${rets.url_failed / total * 100}%]
        `)
        console.log('}\n')
    }, 5000)

    // Input Loop
    try {
        while (true) {
            let rets = await statsQueue(q)

            if (rets.url_inactive > 2000) {
                console.log('Taking a break: 5s...')
                await Promise.delay(5000)
                continue
            }

            let res = await client.rpopAsync(key)
            if (!res) {
                console.log("Failed to get orignal url from Redis, delay 10s then try again.")
                await Promise.delay(10 * 1000)
                continue
            }

            let data = {
                title: 'URL:' + res,
                url: res
            }
            let job = q.create('URL', data).attempts(3).ttl(3 * 60 * 1000)
            await lib.kue_save(job)
        }
    } catch (err) {
        console.error(err)
    }

}

main()

function pushImgUrl(imgurls, orignurl) {
    imgurls = imgurls || []
    let arr = imgurls.map(u => `${u}#:_:#${orignurl}`)
    let key = options.key_img_url
    arr.unshift(key)
    client.lpush(arr)
}

function pushNextUrls(urls, fromUrl) {
    urls = urls || []
    let arr = urls.map(u => `${u}#:_:#${fromUrl}`)
    let key = options.key_next_url
    arr.unshift(key)
    client.lpush(arr)
}

function statsQueue(queue) {
    return new Promise((resolve, reject) => {
        asy.parallel({
            url_inactive: cb => queue.inactiveCount('URL', cb),
            url_failed: cb => queue.failedCount('URL', cb),
            url_active: cb => queue.activeCount('URL', cb),
            url_complete: cb => queue.completeCount('URL', cb),
            url_delayed: cb => queue.delayedCount('URL', cb)
        }, (err, rets) => {
            if (err) return reject(err)
            resolve(rets)
        })
    })
}