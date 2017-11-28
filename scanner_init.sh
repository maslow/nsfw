#!/bin/sh
export REDIS_HOST=172.17.216.169

cd /root/nsfw && git pull origin master
mount -t nfs $REDIS_HOST:/mnt /mnt -o proto=tcp -o nolock

docker run -d -v /root/nsfw/open_nsfw:/workspace -v /mnt:/mnt -e REDIS_HOST=$REDIS_HOST --name nsfw bvlc/caffe:cpu sh run.sh
docker run -d -v /root/nsfw/open_nsfw:/workspace -v /mnt:/mnt -e REDIS_HOST=$REDIS_HOST --name nsfw1 bvlc/caffe:cpu sh run.sh
docker run -d -v /root/nsfw/open_nsfw:/workspace -v /mnt:/mnt -e REDIS_HOST=$REDIS_HOST --name nsfw2 bvlc/caffe:cpu sh run.sh
docker run -d -v /root/nsfw/open_nsfw:/workspace -v /mnt:/mnt -e REDIS_HOST=$REDIS_HOST --name nsfw3 bvlc/caffe:cpu sh run.sh