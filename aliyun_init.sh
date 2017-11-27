cd /root/nsfw && git pull origin master
mount -t nfs 172.17.216.110:/mnt /mnt -o proto=tcp -o nolock
docker run -it -v /root/nsfw/open_nsfw:/workspace -v /mnt:/mnt --name nsfw bvlc/caffe:cpu sh run.sh