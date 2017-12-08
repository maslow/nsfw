#!/bin/sh

yum install -y nfs-utils rpcbind docker git

# !!!export /mnt as nfs folder!!!
# refer to [http://www.linuxidc.com/Linux/2015-05/117378.htm]

# ensure that nessesary services are working
systemctl start rpcbind
systemctl start nfs
systemctl start docker

# update codes
# cd ~ && git clone https://github.com/Maslow/nsfw.git
cd /root/nsfw && git pull origin master

# install the dependencies
# npm install -g yarn
cd /root/nsfw/spider && yarn install

# run redis service
docker run -d -p 6379:6379 -v /mnt/redis-data:/data --name redis.server redis