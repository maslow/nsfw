#!/bin/sh
# You HAVE TO replace the value with your real ip addr.
export MASTER_HOST=172.17.217.79

# Installations
yum install -y yum-utils device-mapper-persistent-data \
  lvm2 nfs-utils rpcbind git

yum-config-manager \
    --add-repo \
    https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo

yum install -y docker-ce

# Apply aliyun docker images hub mirror
mkdir -p /etc/docker
tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://0ndtep40.mirror.aliyuncs.com"]
}
EOF

systemctl start docker

# Mount remote file system which is addressed by MASTER_HOST.
mount -t nfs $MASTER_HOST:/mnt /mnt -o proto=tcp -o nolock

# Join the swarm cluster
docker swarm join --token SWMTKN-1-0n7v8u34v4oelegvmg2ts4rv02hkz3vfh9ocstk8yanfau1goj-5ixcbdsx3pivx5xv2iegottsq $MASTER_HOST:2377