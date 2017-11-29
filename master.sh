#!/bin/sh

systemctl start rpcbind
systemctl start nfs
systemctl start docker

cd /root/nsfw && git pull origin master
cd /root/nsfw/spider && yarn install

docker run -d -p 6379:6379 -v /mnt/redis-data:/data redis