#!/bin/sh

# You HAVE TO replace the value with your real ip addr.
export MASTER_HOST=172.17.180.125

# Installations
yum install -y yum-utils device-mapper-persistent-data \
  lvm2 nfs-utils rpcbind git

yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo

yum install -y docker-ce

# Apply aliyun docker images hub mirror
tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://cx0p8tmg.mirror.aliyuncs.com"]
}
EOF

systemctl start docker

# Mount remote file system which is addressed by MASTER_HOST.
mount -t nfs $MASTER_HOST:/mnt /mnt -o proto=tcp -o nolock

# Join the swarm cluster
docker join --token XXXXX