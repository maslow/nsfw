var fs = require('fs-extra')
var path = require('path')
var request = require('superagent')
const kue = require('kue')
const domain = require('domain')
const lib = require('./lib.js')
const redis = require("redis")
const options = require('./options.js')
const Promise = require('bluebird')
const asy = require('async')
Promise.promisifyAll(fs)
Promise.promisifyAll(redis)

let start_at = process.hrtime()
let kueport = Math.floor(Math.random() * 10000) + 3000
let dataPath = options.data_path

fs.ensureDirSync(`${dataPath}/logs`)
let logger = new console.Console(
    fs.createWriteStream(`${dataPath}/logs/nexturl_failed_${kueport}.log`),
    fs.createWriteStream(`${dataPath}/logs/nexturl_failed_${kueport}.error.log`)
)

let redisOptions = options.redis
let client = redis.createClient(redisOptions)
let key = options.key_url_2

const c_nexturl = process.argv[2] || 1000


let imageCount = 0
let lastUrlCount = 0
let cachedCount = 0
let nexturl_complete = 0
let nexturl_failed = 0

let q = kue.createQueue({
    prefix: 'nexturl' + kueport,
    redis: redisOptions
})

q.process('NEXTURL', c_nexturl, async function (job, done) {
    try {
        let urlHash = lib.md5(job.data.url)
        let dirname = job.data.orignurl.replace(':', '_')
        let p_des = path.join(dataPath, "htmls", dirname, `${urlHash}.html`)
        await fs.ensureDirAsync(path.dirname(p_des))

        let ret = await lib.getUrl2FromCache(urlHash)
        if (ret) {
            let p_src = path.join(dataPath, "htmls", ret.orignurl.replace(':', '_'), `${urlHash}.html`)
            if (fs.existsSync(p_des)) {
                cachedCount++
                return done()
            }
            if (fs.existsSync(p_src)) {
                let stats = fs.statSync(p_src)
                stats.nlink < 1024 ?
                    fs.linkSync(p_src, p_des) : fs.copySync(p_src, p_des)

                let content = await fs.readFileAsync(p_des)
                let imgurls = lib.getImages(content.toString(), job.data.url)
                job.log(`images count: ${imgurls.length}`)

                if (imgurls && imgurls.length) {
                    pushImgUrl(imgurls, job.data.url, job.data.orignurl)
                    imageCount += imgurls.length
                }
                cachedCount++
                return done()
            }
        }
        let res = await request.get(job.data.url)
            .ok(res => res.status === 200)
            .set('User-Agent', lib.getUserAgent())
            .timeout({
                response: 15 * 1000,
                deadline: 30 * 1000
            })
        if (!res.text) {
            job.log('response.text is empty')
            return done()
        }

        await lib.saveHtml(p_des, res.text)
        await lib.cacheUrl2(urlHash, job.data.orignurl)

        let imgurls = lib.getImages(res.text, job.data.url)
        job.log(`images count: ${imgurls.length}`)

        if (imgurls && imgurls.length) {
            pushImgUrl(imgurls, job.data.url, job.data.orignurl)
            imageCount += imgurls.length
        }
        done()
    } catch (err) {
        job.delay(10 * 1000).backoff(true)
        logger.log(job.data.url)
        logger.error(job.data.url + ',' + (err.status || err.code || err.message))
        return done(err)
    }

})

q.on("job complete", (id, result) => {
    kue.Job.get(id, async(err, job) => {
        if (err) return console.log(err)
        await lib.save_csv('htmls', job.data.url, job.data.orignurl, job.data.parentUrl)
        job.remove(err => {
            if (err) return console.error(err)
            nexturl_complete++
        })
    })
})

q.on("job failed", (id, result) => {
    kue.Job.get(id, async(err, job) => {
        if (err) return console.log(err)
        job.remove(err => {
            if (err) return console.error(err)
            nexturl_failed++
        })
    })
})

async function main() {

    // Exit & Exception
    process
        .on('exit', code => {
            let end_at = process.hrtime(start_at)
            console.log(end_at[0] + 's, ' + end_at[1] + 'ns')
        })
        .on('uncaughtException', err => console.error(err))


    // Report Loop
    setInterval(async() => {
        let mem = process.memoryUsage()
        let rets = await statsQueue(q)
        let duration = process.hrtime(start_at)[0]
        let total = nexturl_complete + nexturl_failed

        console.log(`[2.URL.js]******************** Cost time: ${duration}s  Port: ${kueport} ******************* `)
        console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
        console.log(`Images: ${imageCount} [${imageCount / duration}/s] LastUrls: ${lastUrlCount}`)
        console.log(`Total: ${total} [${total / duration}/s] Complete: ${nexturl_complete / duration}/s`)
        console.log(`Cached: ${cachedCount} [${cachedCount / nexturl_complete * 100}%]`)
        console.log('{')
        console.log(`
            Inactive:${rets.nexturl_inactive}
              Active:${rets.nexturl_active}
             Delayed:${rets.nexturl_delayed}
            Complete:${nexturl_complete}  [${nexturl_complete / total * 100}%]
              Failed:${nexturl_failed}   [${nexturl_failed / total * 100}%]
        `)
        console.log('}\n')
    }, 5000)

    // Input Loop
    try {
        while (true) {
            let rets = await statsQueue(q)
            
            if (rets.nexturl_inactive > 2000) {
                console.log("Taking a break: 3s...")
                await Promise.delay(3000)
                continue
            }

            let res = await popUrl()
            if (!res) {
                console.log(`Failed to get url from redis, delaying 10s and then try again.`)
                await Promise.delay(10 * 1000)
                continue
            }

            let data = {
                title: 'NEXTURL:' + res.url,
                orignurl: res.orignurl,
                url: res.url
            }
            let job = q.create('NEXTURL', data).attempts(2)
            await lib.kue_save(job)
        }
    } catch (err) {
        console.error(err)
    }
}

main()

function pushImgUrl(imgurls, fatherurl, rooturl) {
    imgurls = imgurls || []
    let arr = imgurls.map(u => `${u}#:_:#${rooturl}#:_:#${fatherurl}`)
    let key = options.key_img_url
    arr.unshift(key)
    client.lpush(arr)
}

function pushLastUrls(urls, fatherUrl, rootUrl) {
    urls = urls || []
    let arr = urls.map(u => `${rootUrl}#:_:#${fatherUrl}#:_:#${u}`)
    let key = options.key_url_3
    arr.unshift(key)
    client.lpush(arr)
}

async function popUrl() {
    let res = await client.rpopAsync(key)
    if (!res) {
        return null
    }
    let [nextUrl, originalUrl] = res.split("#:_:#")
    return {
        orignurl: originalUrl,
        url: nextUrl
    }
}

function statsQueue(queue) {
    return new Promise((resolve, reject) => {
        asy.parallel({
            nexturl_inactive: cb => queue.inactiveCount('NEXTURL', cb),
            nexturl_failed: cb => queue.failedCount('NEXTURL', cb),
            nexturl_active: cb => queue.activeCount('NEXTURL', cb),
            nexturl_complete: cb => queue.completeCount('NEXTURL', cb),
            nexturl_delayed: cb => queue.delayedCount('NEXTURL', cb)
        }, (err, rets) => {
            if (err) return reject(err)
            resolve(rets)
        })
    })
}

async function save_html_csv(type, selfUrl, rootUrl, parentUrl = null) {
    let filepath = path.join(dataPath, 'htmls', rootUrl, `${rootUrl}.csv`)
    let imgUrlHash = lib.md5(selfUrl)
    let data = `${imgUrlHash},${selfUrl}`
    if (parentUrl)
        data += `,${parentUrl}`
    data += '\n'
    if (await lib.file_exists(filepath))
        await fs.appendFileAsync(filepath, data)
    else {
        await fs.ensureFileAsync(filepath)
        await fs.appendFileAsync(filepath, data)
    }
}