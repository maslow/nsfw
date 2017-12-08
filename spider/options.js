const path = require('path')

redis_host = process.env['REDIS_HOST'] || '127.0.0.1'

module.exports = {
    redis: {
        host: redis_host,
        port: 6379
    },
    sep: '___$$$___',
    depth: 2,
    
    key_scanning: 'img.scanning',
    key_url: 'url',
    key_img_url: 'img.url',

    xlsx_file: path.join(__dirname, 'url.xlsx'),

    data_path: path.join('../data'),
}
