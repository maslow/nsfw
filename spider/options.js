const path = require('path')

redis_host = process.env['REDIS_HOST'] || '127.0.0.1'

module.exports = {
    redis: {
        host: redis_host,
        //        host: '192.168.99.100',        
        port: 6379
    },
    key_original_url: 'original.url',
    key_next_url: 'next.url.list',
    key_last_url: 'last.url.list',
    key_img_url: 'img.url',
    xlsx_file: path.join(__dirname, 'url.xlsx'),
    cached_path: path.join('/mnt/data.cache'),
    data_path: path.join('/mnt/data'),
    key_imgcache_prefix: 'cache.img:',
    key_url2cache_prefix: 'cache.url2:'
}
