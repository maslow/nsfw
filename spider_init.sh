#!/bin/sh
export REDIS_HOST=172.17.216.169

systemctl start rpcbind
systemctl start nfs

cd /root && git clone https://github.com/Maslow/nsfw.git
cd /root/nsfw/spider && npm install

docker run -d -p 6379:6379 -v /mnt/redis-data:/data --name redis-server redis &