# Use the official Node.js image as our base image
FROM node:16-bullseye

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install dependencies with increased memory limit and clean npm cache
COPY package*.json ./
RUN npm cache clean --force && \
    npm install --no-optional --max-old-space-size=4096 && \
    npm uninstall node-fetch && \
    npm install node-fetch@2.6.7 && \
    npm install undici

# Copy and install fastify dependencies
COPY fastify/package*.json ./fastify/
WORKDIR /usr/src/app/fastify
RUN npm cache clean --force && \
    npm install --no-optional --max-old-space-size=4096

# Return to app root
WORKDIR /usr/src/app

# Create fetch polyfill
RUN echo "const fetch = require('node-fetch');\n\
globalThis.fetch = fetch;\n\
globalThis.Headers = fetch.Headers;\n\
globalThis.Request = fetch.Request;\n\
globalThis.Response = fetch.Response;\n\
globalThis.FormData = fetch.FormData;\n\
globalThis.Blob = fetch.Blob;" > fetch-polyfill.js

# Copy the rest of our application to the container
COPY . .

# Create a startup script
RUN echo '#!/bin/bash\n\
NODE_OPTIONS="--require ./fetch-polyfill.js" node --max-old-space-size=4096 streamingBlocks.js --firststart &\n\
NODE_OPTIONS="--require ./fetch-polyfill.js" node --max-old-space-size=4096 fastify/server.js' > start.sh && \
chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]
 