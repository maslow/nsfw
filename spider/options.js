const path = require('path')

const REDIS_HOST = process.env['REDIS_HOST'] || '127.0.0.1'
const DEPTH = process.env['DEPTH'] || 2

module.exports = {
    redis: {
        host: REDIS_HOST,
        port: 6379
    },
    sep: '___$$$___',
    depth: DEPTH,
    
    key_scanning: 'img.scanning',
    key_url: 'url',
    key_img_url: 'img.url',

    xlsx_file: path.join(__dirname, 'url.xlsx'),

    data_path: path.resolve('/mnt/data'),
}
