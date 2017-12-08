const xlsx = require("node-xlsx").default
const redis = require("redis")
const _ = require('lodash')
const commander = require('commander')
const options = require('./options.js')

// Command Line Paramenters Parsing
commander
    .version("2.0")
    .option("-s, --start [value]", "Start Position (processing from)", 0)
    .option("-e, --end [value]", "End Position, -1 indicate the tail of url list", -1)
    .parse(process.argv)

const start = commander.start
const end = commander.end
    
// New a Redis Client
const client = redis.createClient(options.redis)

// Load & Parse URL LIST
const sheets = xlsx.parse(options.xlsx_file);
let urls = sheets[0].data.map(data => `http://${data[0]}`)
urls = urls.slice(start, end)
urls = _.uniq(urls)

// Push urls to URL QUEUE (in redis)
urls.unshift(options.key_url)
client.lpush(urls, (err, res) => {
    if (err) return console.log("PushErr: " + err)
    console.log(res + " urls push success!")
    process.exit(0)
})

process.on('exit', () => console.log('OK!'))