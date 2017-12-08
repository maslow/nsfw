#!/bin/sh

# ensure that nessesary services are working
systemctl start rpcbind
systemctl start nfs
systemctl start docker

# update codes
cd /root/nsfw && git pull origin master

# install the dependencies
cd /root/nsfw/spider && yarn install

# run redis service
docker run -d -p 6379:6379 -v /mnt/redis-data:/data redis