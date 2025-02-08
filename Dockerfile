# Use the official Node.js image as our base image
FROM node:16-bullseye

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install dependencies with increased memory limit and clean npm cache
COPY package*.json ./
RUN npm cache clean --force && \
    npm install --no-optional --max-old-space-size=4096 && \
    npm install node-fetch@3

# Copy and install fastify dependencies
COPY fastify/package*.json ./fastify/
WORKDIR /usr/src/app/fastify
RUN npm cache clean --force && \
    npm install --no-optional --max-old-space-size=4096

# Return to app root
WORKDIR /usr/src/app

# Copy the rest of our application to the container
COPY . .

# Create a startup script
RUN echo '#!/bin/bash\n\
node --max-old-space-size=4096 streamingBlocks.js --firststart &\n\
node --max-old-space-size=4096 fastify/server.js' > start.sh && \
chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]
 