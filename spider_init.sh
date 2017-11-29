#!/bin/sh

# You HAVE TO replace the value with your real ip addr.
export REDIS_HOST=172.17.216.196

# Mount remote file system which is addressed by REDIS_HOST.
mount -t nfs $REDIS_HOST:/mnt /mnt -o proto=tcp -o nolock

# Pull the lastest source codes
cd /root/nsfw && git pull origin master

npm i -g yarn
cd /root/nsfw/spider && yarn install

# Do your job here!
node /root/nsfw/spider/img.js 1000 1000 > /img1.log & 
node /root/nsfw/spider/img.js 1000 1000 > /img2.log &
node /root/nsfw/spider/img.js 1000 1000 > /img3.log &

# node /root/nsfw/spider/2.url.js 1000 > /1.2.url.log & 
# node /root/nsfw/spider/2.url.js 1000 > /2.2.url.log & 
# node /root/nsfw/spider/2.url.js 1000 > /3.2.url.log & 
# node /root/nsfw/spider/2.url.js 1000 > /4.2.url.log & 