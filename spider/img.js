var fs = require('fs-extra')
var path = require('path')
var request = require('superagent')
const kue = require('kue')
const asy = require('async')
const domain = require('domain')
const lib = require('./lib.js')
const redis = require("redis")
const options = require('./options.js')
const Promise = require('bluebird')
Promise.promisifyAll(fs)
Promise.promisifyAll(redis)

let start_at = process.hrtime()
let dataPath = options.data_path
let kueport = Math.floor(Math.random() * 10000) + 3000
fs.ensureDirSync(`${dataPath}/logs`)
let imglogger = new console.Console(
    fs.createWriteStream(`${dataPath}/logs/img_${kueport}.log`),
    fs.createWriteStream(`${dataPath}/logs/img_${kueport}.error.log`)
)
let redisOptions = options.redis
let client = redis.createClient(redisOptions)

const c_img = process.argv[2] || 100
const c_slow_img = process.argv[3] || 100

let imageCount = 0
let cachedCount = 0
let image_complete = 0
let slow_image_complete = 0
let image_failed = 0
let slow_image_failed = 0

let q = kue.createQueue({
    prefix: 'img' + kueport,
    redis: redisOptions
})

q.process('IMAGE', c_img, async(job, done) => {
    try {
        imglogger.log(job.data.imgurl)
        let imgUrlHash = lib.md5(job.data.imgurl)

        // Deal with cache
        let ret = await lib.getImgFromCache(imgUrlHash)
        if (ret) {
            cachedCount++
            return done();
            /*
            try {
                let imgfilename = `${imgUrlHash}.${ret.extname}`
                let p_src = path.join(dataPath, 'images', ret.orignurl.replace(':', '_'), imgfilename)
                let p_des = path.join(dataPath, 'images', job.data.orignurl.replace(':', '_'), imgfilename)
                await fs.ensureDirAsync(path.dirname(p_des))

                if (fs.existsSync(p_des)) {
                    return done()
                }
                if (false === fs.existsSync(p_src))
                    p_src = path.join(options.cached_path, 'images', ret.orignurl.replace(':', '_'), imgfilename)

                if (fs.existsSync(p_src)) {
                    let stats = fs.statSync(p_src)
                    stats.nlink < 1024 ?
                        fs.linkSync(p_src, p_des) : fs.copySync(p_src, p_des)
                    return done()
                }
            } catch (err) {
                //console.error(err)
                //console.log(ret)
                return done()
            }
            */
        }

        // Download directly if no cache hits
        let headers = {
            'User-Agent': lib.getUserAgent()
        }

        let timeoutOptions = {
            response: 15 * 1000,
            deadline: 30 * 1000
        }
        let res = await download_image(job.data.imgurl, timeoutOptions, headers)

        const imgType = res.headers['content-type']
        let ext = lib.getImgExt(imgType)
        imgfilename = `${imgUrlHash}.${ext}`
        let p_des = path.join(dataPath, 'images', job.data.orignurl.replace(':', '_'), imgfilename)
        await fs.ensureDirAsync(path.dirname(p_des))

        // Last-modified strategy is deprecated, just ignore it
        lib.cacheImgFile(imgUrlHash, res.headers['last-modified'] || "", job.data.orignurl, ext)
        const imgLength = Number(res.headers['content-length'])
        if (imgLength > 6 * 1024) {
            await fs.writeFileAsync(p_des, res.body)
            lib.SaveImageToScannerQueue(imgUrlHash, job.data.orignurl, job.data.parentUrl, job.data.imgurl, p_des)
        }
        done()
    } catch (err) {
        if (err.timeout) {
            let slowJob = q.create("SLOW_IMAGE", {
                title: "SlowImageURL: " + job.data.imgurl,
                orignurl: job.data.orignurl,
                imgurl: job.data.imgurl,
                parentUrl: job.data.parentUrl
            }).attempts(2)
            await lib.kue_save(slowJob)
            return done()
        }
        imglogger.error(job.data.imgurl)
        imglogger.error(err.status || err.code || err.message)
        return done(err)
    }
})

q.process('SLOW_IMAGE', c_slow_img, (job, done) => {
    domain.create()
        .on('error', done)
        .run(async() => {
            try {
                let headers = {
                    'User-Agent': lib.getUserAgent()
                }
                let timeoutOptions = {
                    response: 30 * 1000,
                    deadline: 120 * 1000
                }
                let res = await download_image(job.data.imgurl, timeoutOptions, headers)
                let ext = lib.getImgExt(res.headers['content-type'])

                let imgUrlHash = lib.md5(job.data.imgurl)
                let imgfilename = `${imgUrlHash}.${ext}`
                let p = path.join(dataPath, "images", job.data.orignurl.replace(':', '_'), imgfilename)
                await fs.ensureDirAsync(path.dirname(p))
                const imgLength = Number(res.headers['content-length'])
                if (imgLength > 6 * 1024) {
                    await fs.writeFileAsync(p, res.body)
                    lib.SaveImageToScannerQueue(imgUrlHash, job.data.orignurl, job.data.parentUrl, job.data.imgurl, p)
                }
                done()
            } catch (err) {
                job.delay(10 * 1000).backoff(true)
                return done(err)
            }
        })
})

q.on("job complete", (id, result) => {
    kue.Job.get(id, async(err, job) => {
        if (err) return console.log(err)
        await lib.save_csv('images', job.data.imgurl, job.data.orignurl, job.data.parentUrl)
        job.remove(err => {
            if (err) return console.log(err)
            if (job.workerId.indexOf("SLOW_IMAGE") > 0)
                slow_image_complete++
            else
                image_complete++
        })
    })
})

q.on("job failed", (id, result) => {
    kue.Job.get(id, async(err, job) => {
        if (err) return console.log(err)
        job.remove(err => {
            if (err) return console.log(err)
            if (job.workerId.indexOf("SLOW_IMAGE") > 0)
                slow_image_failed++
                else
                    image_failed++
        })
    })
})

async function main() {

    // Kue Web UI
    kue.app.listen(kueport, err => {
        if (err) return console.error(err)
        console.log('listening on port ' + kueport)
    })

    // Report Loop
    let should_exit = false
    setInterval(async() => {
        let mem = process.memoryUsage()
        let rets = await statsQueue(q)
        let duration = process.hrtime(start_at)[0]
        let total = image_complete + image_failed

        console.log(`******************** Cost time: ${duration}s  Port: ${kueport} ******************* `)
        console.log(`Memory: ${mem.rss / 1024 / 1024}mb ${mem.heapTotal / 1024 / 1024}mb ${mem.heapUsed / 1024 / 1024}mb`)
        console.log(`Images: ${total} [${total / duration}/s]`)
        console.log(`Complete: ${image_complete / duration}/s`)
        console.log(`Cache Hits: ${cachedCount} [${cachedCount / image_complete * 100}%]`)
        console.log(`

    [Image Queue]
            Inactive: ${rets.image_inactive}
              Active: ${rets.image_active}
             Delayed: ${rets.image_delayed}
            Complete: ${image_complete}  [${image_complete / total * 100}%]
              Failed: ${image_failed}   [${image_failed / total * 100}%]

    [Slow Image Queue]
            Inactive: ${rets.slow_image_inactive}
              Active: ${rets.slow_image_active}
             Delayed: ${rets.slow_image_delayed}
            Complete: ${slow_image_complete}
              Failed: ${slow_image_failed}

        `)

        let r = rets.image_active + rets.image_inactive
        r += rets.slow_image_active + rets.slow_image_inactive + rets.slow_image_delayed
        if (r === 0 && should_exit)
            process.exit(0)

    }, 5000)

    // Input Loop
    try {
        let try_times = 0
        while (!should_exit) {
            let res = await client.rpopAsync(options.key_img_url)
            if (!res) {
                if (++try_times > 100)
                    should_exit = true
                console.log(`Failed to get imgurl from redis, delaying 5s and then try again. Attempts: ${try_times}/100`)
                await Promise.delay(5000)
                continue
            }
            try_times = 0
            imageCount++
            let rets = await statsQueue(q)
            let mem = process.memoryUsage()

            if (rets.image_inactive > 1000 /* || mem.heapUsed > 600 * 1024 * 1024 */ ) {
                await Promise.delay(3000)
                console.log("pausing 3s...")
                continue
            }
            let [imgurl, orignurl, parentUrl] = res.split('#:_:#')

            parentUrl = parentUrl || orignurl
            let data = {
                title: 'IMAGE:' + imgurl,
                imgurl,
                orignurl,
                parentUrl
            }
            let job = q.create('IMAGE', data)
            await lib.kue_save(job)
        }
    } catch (err) {
        console.error(err)
    }
}

main()

process
    .on('exit', code => {
        let end_at = process.hrtime(start_at)
        console.log(end_at[0] + 's, ' + end_at[1] + 'ns')
    })
    .on('uncaughtException', err => console.error(err))


function statsQueue(queue) {
    return new Promise((resolve, reject) => {
        asy.parallel({
            image_inactive: cb => queue.inactiveCount('IMAGE', cb),
            image_failed: cb => queue.failedCount('IMAGE', cb),
            image_active: cb => queue.activeCount('IMAGE', cb),
            image_complete: cb => queue.completeCount('IMAGE', cb),
            image_delayed: cb => queue.delayedCount('IMAGE', cb),

            slow_image_inactive: cb => queue.inactiveCount('SLOW_IMAGE', cb),
            slow_image_failed: cb => queue.failedCount('SLOW_IMAGE', cb),
            slow_image_active: cb => queue.activeCount('SLOW_IMAGE', cb),
            slow_image_complete: cb => queue.completeCount('SLOW_IMAGE', cb),
            slow_image_delayed: cb => queue.delayedCount('SLOW_IMAGE', cb),

        }, (err, rets) => {
            if (err) return reject(err)
            resolve(rets)
        })
    })
}

function download_image(imgurl, timeout, headers) {
    return new Promise((resolve, reject) => {
        request.get(imgurl)
            .ok(res => res.status === 200 || res.status === 304)
            .set(headers).timeout(timeout)
            .end((err, res) => {
                if (err) return reject(err)
                resolve(res)
            })
    })
}