#!/bin/sh
export REDIS_HOST=172.17.216.182   # You HAVE TO replace the value with your real ip addr.

cd /root/nsfw && git pull origin master
cd /root/nsfw/spider && npm install
mount -t nfs $REDIS_HOST:/mnt /mnt -o proto=tcp -o nolock

cd /root/nsfw && git pull origin master
cd /root/nsfw/spider && npm install

# Do your job here!

# node img.js 1000 1000 > /img1.log &
# node img.js 1000 1000 > /img2.log &
# node img.js 1000 1000 > /img2.log &
# node img.js 1000 1000 > /img4.log &