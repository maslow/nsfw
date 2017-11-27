var fs = require('fs-extra')
var path = require('path')
var request = require('superagent')
const xlsx = require('node-xlsx').default;
const kue = require('kue')
const async = require('async')
const domain = require('domain')
const lib = require('./lib.js')
const klaw = require('klaw')
const opts = require('./options.js')

let dataPath = path.join(opts.data_path, 'htmls')


let logger = new console.Console(
    fs.createWriteStream(path.join(__dirname, "html.txt"))
)

let count = 0
let urlcount = 0

klaw(dataPath)
    .on('data', item => {
        fs.stat(item.path, (err, stats) => {
            if (stats.isDirectory())
                return count++;
            fs.readFile(item.path, (err, data) => {
                if (err) return;
                let arr = lib.getNextUrls(data.toString(), 'http://www.baidu.com')
                count += arr.length
                urlcount++
            })
        })
    })
    .on('end', () => {
        process.exit(0)
    })

setInterval(() => {
    console.log(`urls: ${urlcount}, nexturls: ${count}, rate: ${count / urlcount}`)
}, 2000)
