const cheerio = require('cheerio')
const uuid = require('node-uuid')
const path = require('path')
const url = require('url')
const crypto = require('crypto')
const Promise = require('bluebird')
const options = require('./options.js')


module.exports = {
    get_user_agent,
    md5,
    resolve_url
}

/************* Export Functions **************/

function get_user_agent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
}
function md5(data) {
    return crypto.createHash('md5')
        .update(data)
        .digest('hex')
}
function resolve_url(strurl, originalUrl) {
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
