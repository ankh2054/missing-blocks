# Use the official Node.js image as our base image
FROM node:20-bullseye

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install dependencies with increased memory limit and clean npm cache
COPY package*.json ./
RUN npm cache clean --force && \
    npm install 


# Copy and install fastify dependencies
COPY fastify/package*.json ./fastify/
WORKDIR /usr/src/app/fastify
RUN npm cache clean --force && \
    npm install

# Return to app root
WORKDIR /usr/src/app


# Copy the rest of our application to the container
COPY . .

# Create a startup script that checks for first run
RUN echo '#!/bin/bash\n\
node streamingBlocks.js  && \
node fastify/server.js' > start.sh && \
chmod +x start.sh

EXPOSE 8001

CMD ["./start.sh"]
 