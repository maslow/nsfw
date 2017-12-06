const cheerio = require('cheerio')
const uuid = require('node-uuid')
const _ = require('lodash')
const path = require('path')
const fs = require('fs-extra')
const url = require('url')
const async = require('async')
const redis = require('redis')
const crypto = require('crypto')
const Promise = require('bluebird')
const options = require('./options.js')
Promise.promisifyAll(redis)
Promise.promisifyAll(fs)
const client = redis.createClient(options.redis)
const cacheClient = redis.createClient({
    port: options.redis.port,
    host: options.redis.host,
    db: 1
})
module.exports = {
    getImages: function (html, fromUrl) {
        let $ = cheerio.load(html)
        let imgs = $("img").toArray() || []
        imgurls = imgs
            .map(img => img.attribs.src)
            .map(img => dealUrl(img, fromUrl))
            .filter(img => img)

        return _.uniq(imgurls)
    },
    getNextUrls: function (html, fromUrl) {
        let $ = cheerio.load(html)
        let nUrls = $("a").toArray() || []
        nextUrls = nUrls
            .map(nUrl => nUrl.attribs.href)
            .map(nUrl => dealUrl(nUrl, fromUrl))
            .filter(nUrl => nUrl)

        return _.uniq(nextUrls)
    },
    saveHtml: async function (filepath, html) {
        await fs.ensureDirAsync(path.dirname(filepath))
        await fs.writeFileAsync(filepath, html)
    },
    getUserAgent: function () {
        //return 'Baidu Spider v720.101'
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
    },
    getFilenameByUrl: function (urlstr) {
        return _.words(urlstr).join('_')
    },
    getImgExt,
    statsQueue,
    md5,
    cacheImgFile,
    getImgFromCache,
    delay,
    kue_save,
    file_exists,
    getUrl2FromCache,
    cacheUrl2,
    save_csv,
    SaveImageToScannerQueue
}

function file_exists(filepath) {
    return new Promise((resolve, reject) => {
        fs.exists(filepath, resolve)
    })
}

function kue_save(job) {
    return new Promise((resolve, reject) => {
        job.save(err => err ? reject(err) : resolve())
    })
}

function delay(time) {
    return Promise.delay(time)
}

function cacheImgFile(imgUrlHash, lastModified, originalUrl, extname) {
    cacheClient.hmset(`${options.key_imgcache_prefix}${imgUrlHash}`, `orignurl`, originalUrl, `last-modified`, lastModified, 'extname', extname)
}

function getImgFromCache(imgUrlHash) {
    return new Promise((resolve, reject) => {
        cacheClient.hgetall(`${options.key_imgcache_prefix}${imgUrlHash}`, (err, res) => {
            if (err) return reject(err)
            resolve(res)
        })
    })
}

function cacheUrl2(urlHash, originalUrl) {
    client.hmset(`${options.key_url2cache_prefix}${urlHash}`, `orignurl`, originalUrl)
}

function getUrl2FromCache(urlHash) {
    return new Promise((resolve, reject) => {
        client.hgetall(`${options.key_url2cache_prefix}${urlHash}`, (err, res) => {
            if (err) return reject(err)
            resolve(res)
        })
    });
}

function statsQueue(queue) {
    return new Promise((resolve, reject) => {
        async.parallel({
            url_inactive: cb => queue.inactiveCount('URL', cb),
            url_failed: cb => queue.failedCount('URL', cb),
            url_active: cb => queue.activeCount('URL', cb),
            url_complete: cb => queue.completeCount('URL', cb),
            url_delayed: cb => queue.delayedCount('URL', cb),

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

function getImgExt(contentType) {
    try {
        let ext = contentType.split('/').pop()
        if (ext != 'jpg' || ext != 'jpeg' || ext != 'png' || ext != 'gif' || ext != 'bmp')
            ext = 'jpg'
        return ext
    } catch (err) {
        return 'jpg'
    }
}

function md5(str) {
    return crypto.createHash('md5')
        .update(str)
        .digest('hex')
}

//处理Url
function dealUrl(strurl, originalUrl) {
    var urlObject = url.parse(originalUrl)
    if ((!strurl) || (strurl.length < 5)) return null;
    let urlPrefix = urlObject.protocol + '//' + urlObject.hostname

    if (strurl.indexOf('about:blank') >= 0)
        return null
    if (strurl.indexOf('javascript:') >= 0)
        return null
    if (strurl.indexOf('base64') > 0)
        return null
    if (strurl.indexOf('tel:') >= 0)
        return null
    if (strurl.indexOf("//") == 0)
        return urlObject.protocol + strurl
    if (strurl.indexOf('http') == 0)
        return strurl
    if (strurl.indexOf('/') || strurl.indexOf('./') || strurl.indexOf('../'))
        return url.resolve(urlPrefix, strurl)

    return url.resolve(urlPrefix, strurl)
}

async function save_csv(type, selfUrl, rootUrl, parentUrl = null) {
    let dataPath = options.data_path
    let filepath = path.join(dataPath, type, rootUrl, `${rootUrl}.csv`)
    let UrlHash = md5(selfUrl)
    let data = `${UrlHash},${selfUrl}`
    if (parentUrl)
        data += `,${parentUrl}`
    data += '\n'
    if (await file_exists(filepath))
        await fs.appendFileAsync(filepath, data)
    else {
        await fs.ensureFileAsync(filepath)
        await fs.appendFileAsync(filepath, data)
    }
}

function SaveImageToScannerQueue(imageUrlHash, url1, url2, imageUrl, imagePath) {
    const task = `${imageUrlHash}#_#${url1}#_#${url2}#_#${imageUrl}#_#${imagePath}`
    client.lpush(`ImageScannerQueue`, task, (err, ret) => {
        if (err) console.log(err)
    })
}