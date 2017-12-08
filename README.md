# Structure
  - open_nsfw    # 图形扫描算法
  - spider       # 爬取&下载图片
  - aliyun_shell       # 阿里云部署集群的辅助shell(本地部署不需要这个)


# Spider
    0. options.js 是spider的全局配置文件
    1. 运行node import.js -s 0 -e 10000, 将从excel文件中导入url列表到redis中, 参考node url.js --help
    2. 运行node url.js -c 100 -w 100, 开始爬url及子url, 将抓取的图片url存到redis中, 参考node url.js --help
    3. 运行node img.js -c 100 -w 100, 开始下载队列中的图片, 并将成功下载的图片信息加入到待扫描队列
    4. 接着运行Open_nsfw中的扫描程序, 参考下面

# Open NSFW
    0. 设置REDIS_HOST环境变量, 指定redis主机的地址信息
    1. 运行run.sh, 将开始从队列里读取待扫描图片, 非法图片会存入Redis相应的队列中

# Report
    0. 运行node report.js, 将扫描的结果导出为文件, 以供下载
