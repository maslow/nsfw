var fs = require('fs-extra')
var path = require('path')
const opts = require('./options.js')

let dataPath = path.join(opts.data_path, 'images')


let dirs = 0
let total = 0
let jpg = 0
let jpeg = 0
let bmp = 0
let png = 0
let gif = 0
let others = 0

klaw(dataPath)
    .on('data', item => {
        fs.stat(item.path, (err, stats) => {
            if (stats.isDirectory()) {
                return dirs++;
            }
            total++
            let extname = path.extname(item.path).toLowerCase()
            switch(extname){
                case ".jpg":
                    jpg++
                    break
                case ".jpeg":
                    jpeg++
                    break
                case ".bmp":
                    bmp++
                    break
                case ".png":
                    png++
                    break
                case ".gif":
                    gif++
                    break
                default:
                    others++
                    break
            }
        })
    })
    .on('end', () => {
        console.log('Total:' + total)
    })

setInterval(() => {
    console.log(`dirs: ${dirs}`)
    console.log(`jpg : ${jpg} ,total: ${total}, rate: ${jpg / total}`)
    console.log(`jpeg : ${jpeg} ,total: ${total}, rate: ${jpeg / total}`)
    console.log(`bmp : ${bmp} ,total: ${total}, rate: ${bmp / total}`)
    console.log(`png : ${png} ,total: ${total}, rate: ${png / total}`)
    console.log(`gif : ${gif} ,total: ${total}, rate: ${gif / total}`)
    console.log(`others : ${others} ,total: ${total}, rate: ${others / total}`)
}, 2000)
