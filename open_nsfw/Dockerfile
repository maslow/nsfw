FROM bvlc/caffe:cpu
RUN pip install redis
WORKDIR /app
ADD . /app
CMD [ "python", "classify_nsfw.py" ]