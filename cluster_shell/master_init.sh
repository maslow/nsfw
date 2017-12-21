#!/bin/sh

yum install -y nfs-utils rpcbind docker git

# !!!export /mnt as nfs folder!!!
# refer to [http://www.linuxidc.com/Linux/2015-05/117378.htm]
echo "/mnt 172.17.*.*(rw,no_root_squash,no_all_squash,sync,anonuid=501,anongid=501)" > /etc/exports
exportfs -r

# Apply aliyun docker images hub mirror
tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://cx0p8tmg.mirror.aliyuncs.com"]
}
EOF

# ensure that nessesary services are working
systemctl start rpcbind
systemctl start nfs
systemctl start docker

# install nodejs
curl --silent --location https://rpm.nodesource.com/setup_8.x | sudo bash -
sudo yum -y install nodejs

# update codes
cd ~ && git clone https://github.com/Maslow/nsfw.git
cd /root/nsfw && git pull origin master

# install the dependencies
cd /root/nsfw/spider && npm install --registry=https://registry.npm.taobao.org

# run redis service
docker run -d -p 6379:6379 -v /mnt/redis-data:/data --name redis.server redis