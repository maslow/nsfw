# Structure
  - spider       # 爬取&下载图片
    0. options.js, spider的全局配置文件
    1. import.js, 导入urls到redis队列, 参考`node url.js --help`
    2. url.js, 爬urls, 抓取图片url存到redis中, 参考`node url.js --help`
    3. img.js, 下载redis中的图片, 并加入到`待扫描队列`
    4. report.js, 导出扫描的结果

  - open_nsfw    # 图形扫描算法
  - aliyun_shell      # 阿里云部署集群的辅助shell(本地部署不需要这个)

# Environment Preparation (Local Host)
```shell
    # Install these (node version >= 8.x)
    yum install -y docker nodejs git
    systemctl enable docker && systemctl start docker

    # Download Project Sources
    cd ~ && git clone https://github.com/Maslow/nsfw.git

    # Install dependencies in spider folder
    cd ~/nsfw/spider && npm install

    # Run a redis service in docker
    docker run -d -p 6379:6379 --name redis.server redis

    # Then let spiders go
    cd ~/nsfw/spider
    node import.js   # import urls
    node url.js  # crawl the urls
    node img.js  # download images

    # In a meanwhile, let scanner go (open_nsfw)
    docker run -d -v ~/nsfw/open_nsfw:/workspace -v /mnt:/mnt --link redis.server -e REDIS_HOST=redis.server --name scanner bvlc/caffe:cpu sh run.sh
```