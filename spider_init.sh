#!/bin/sh
export REDIS_HOST=172.17.216.182

systemctl start rpcbind
systemctl start nfs

cd /root/nsfw && git pull origin master
cd /root/nsfw/spider && npm install

docker run -d -p 6379:6379 -v /mnt/redis-data:/data redis