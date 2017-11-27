var fs = require('fs-extra')
var path = require('path')
const klaw = require('klaw')
const opts = require('./options.js')

let dataPath = path.join(opts.data_path, 'images')

let dirs = 0
let total = 0
let s0_2kb = 0
let s2_5kb = 0
let s5_10kb = 0
let s10_50kb = 0
let s50_100kb = 0
let s100_500kb = 0
let s500_kb = 0

klaw(dataPath)
    .on('data', item => {
        fs.stat(item.path, (err, stats) => {
            if (stats.isDirectory()) {
                return dirs++;
            }
            total++
            let s = stats.size / 1024.0
            if (s < 2)
                s0_2kb++
            else if (s < 5)
                s2_5kb++
            else if (s < 10)
                s5_10kb++
            else if (s < 50)
                s10_50kb++
            else if (s < 100)
                s50_100kb++
            else if (s < 500)
                s100_500kb++
            else
                s500_kb++
        })
    })
    .on('end', () => {
        console.log('Total:' + total)
    })

setInterval(() => {
    console.log(`dirs: ${dirs}`)
    console.log(`size < 2: ${s0_2kb} ,total: ${total}, rate: ${s0_2kb / total}`)
    console.log(`size < 5: ${s2_5kb} ,total: ${total}, rate: ${s2_5kb / total}`)
    console.log(`size < 10: ${s5_10kb} ,total: ${total}, rate: ${s5_10kb / total}`)
    console.log(`size < 50: ${s10_50kb} ,total: ${total}, rate: ${s10_50kb / total}`)
    console.log(`size < 100: ${s50_100kb} ,total: ${total}, rate: ${s50_100kb / total}`)
    console.log(`size < 500: ${s100_500kb} ,total: ${total}, rate: ${s100_500kb / total}`)
    console.log(`size > 500: ${s500_kb} ,total: ${total}, rate: ${s500_kb / total}`)
}, 2000)
