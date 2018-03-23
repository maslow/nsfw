# Structure
  - spider       # 爬取&下载图片
    1. options.js, spider的全局配置文件
    2. import.js, 导入urls到redis队列, 参考`node import.js --help`
    3. url.js, 爬urls, 抓取图片url存到redis中, 参考`node url.js --help`
    4. img.js, 下载redis中的图片, 并加入到`待扫描队列`,参考`node img.js --help`
    5. report.js, 导出扫描的结果

  - open_nsfw    # 图形扫描算法
    1. run.sh, 启动脚本

  - cluster_shell    # 部署集群的辅助shell(本地单机部署不需要看这个)
    1. master.sh, 主节点部署(redis, nfs)
    2. node_init.sh, 爬虫&扫描节点部署

# Cluster Deployment (集群部署)
  - Master节点配置
    1. 运行master_init.sh中的脚本，初始化环境
    2. 运行cat /root/join.sh，拷贝下来docker swarm join指令

  - Node节点配置
    0. 将Master的内网地址更新到node_init.sh脚本的第三行
    1. 将Master的docker swarm join指令，更新到node_init.sh脚本最后一行
    2. 执行node_init.sh（在申请机器的时候，直接在阿里云控制台拷入脚本，批量执行）

> 任务调度
```sh
  docker service ls  # 查看正在运行的服务列表
  docker service scale nsfw_url=10  # 将nsfw_url服务在集群中扩展到10个
  docker service scale nsfw_img=10  # 将nsfw_img服务在集群中扩展到10个
  docker service scale nsfw_scanner=10  # 将nsfw_scanner服务在集群中扩展到10个
  
  #!!!切记!!!  不要对nsfw_redis进行伸缩操作，它是单一数据节点部署的，没有分布式部署
```

# Local Host Development Environment (With Docker Compose) (本地开发环境) [推荐]
```sh
    # Install these (node version >= 8.x)
    yum install -y docker nodejs git
    systemctl enable docker && systemctl start docker

    # Download Project Sources
    cd ~ && git clone https://github.com/Maslow/nsfw.git

    # Install dependencies in spider folder
    cd ~/nsfw/spider && npm install

    # Run services
    docker-compose up
```

# Local Host Deployment (Without Docker) (单机本地运行) [不推荐]
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
    docker run -d -v ~/nsfw/open_nsfw:/workspace -v /mnt:/mnt --link redis.server \
    -e REDIS_HOST=redis.server --name scanner bvlc/caffe:cpu sh run.sh
```