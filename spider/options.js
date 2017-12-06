const path = require('path')

redis_host = process.env['REDIS_HOST'] || '127.0.0.1'

module.exports = {
    redis: {
        host: redis_host,
        port: 6379
    },
    key_url_1: 'url.1',
    key_url_2: 'url.2',
    key_url_3: 'url.3',
    key_img_url: 'img.url',
    xlsx_file: path.join(__dirname, 'url.xlsx'),
    cached_path: path.join('/mnt/data.cache'),
    data_path: path.join('/mnt/data'),
    key_imgcache_prefix: 'cache.img:',
    key_url2cache_prefix: 'cache.url2:'
}
