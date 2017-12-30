#!/bin/sh

# You HAVE TO replace the value with your real ip addr.
export REDIS_HOST=172.17.216.245

yum install -y yum-utils device-mapper-persistent-data \
  lvm2 nfs-utils rpcbind git

yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo

yum install -y docker-ce

systemctl start docker

# Mount remote file system which is addressed by REDIS_HOST.
mount -t nfs $REDIS_HOST:/mnt /mnt -o proto=tcp -o nolock

# Pull the lastest source codes
# cd ~ && git clone https://github.com/Maslow/nsfw.git
cd /root/nsfw && git pull origin master

# install dependencies
cd /root/nsfw/spider && node install --registry=https://registry.npm.taobao.org

# Do your job here!
node /root/nsfw/spider/url.js -c 1000 -w 100  > /url1.log & 
node /root/nsfw/spider/url.js -c 1000 -w 100  > /url2.log & 
node /root/nsfw/spider/url.js -c 1000 -w 100  > /url3.log & 
node /root/nsfw/spider/url.js -c 1000 -w 100  > /url4.log & 