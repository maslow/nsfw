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
node /root/nsfw/spider/img.js -c 1000 -w 1000 > /img1.log & 
node /root/nsfw/spider/img.js -c 1000 -w 1000 > /img2.log &
node /root/nsfw/spider/img.js -c 1000 -w 1000 > /img3.log &

# node /root/nsfw/spider/url.js -c 1000 -w 100  > /url1.log & 
# node /root/nsfw/spider/url.js -c 1000 -w 100  > /url2.log & 
# node /root/nsfw/spider/url.js -c 1000 -w 100  > /url3.log & 
# node /root/nsfw/spider/url.js -c 1000 -w 100  > /url4.log & 