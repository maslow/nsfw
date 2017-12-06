const lib = require("./lib.js")
const cheerio = require("cheerio")
const fs = require("fs-extra")
const path = require("path")
const xlsx = require("node-xlsx").default
const redis = require("redis")
const _ = require('lodash')
const options = require('./options.js')
let redisOptions = options.redis
let client = redis.createClient(redisOptions)
let key = options.key_url_1

if (process.argv.length !== 4) {
    console.error('ERROR: param missing (start end)')
    process.exit(1)
}

let start = process.argv[2]
let end = process.argv[3]

let sheets = xlsx.parse(options.xlsx_file);
let sheet_data = sheets[0].data.map(data => data[0])
sheet_data = sheet_data.slice(start, end)
sheet_data = _.uniq(sheet_data)

pushUrl(sheet_data, (err, res) => {
    if (err) return console.log("PushErr: " + err)
    console.log(res + " urls push success!")
    process.exit(0)
})

function pushUrl(urls, cb) {
    urls = urls || []
    urls.unshift(key)
    client.lpush(urls, cb)
}

process.on('exit', () => {
    console.log('OK!')
})