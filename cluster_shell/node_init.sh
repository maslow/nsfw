#!/bin/sh

# You HAVE TO replace the value with your real ip addr.
export REDIS_HOST=172.17.180.125

yum install -y yum-utils device-mapper-persistent-data \
  lvm2 nfs-utils rpcbind git

yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo

yum install -y docker-ce
systemctl start docker

# Mount remote file system which is addressed by REDIS_HOST.
mount -t nfs $REDIS_HOST:/mnt /mnt -o proto=tcp -o nolock
