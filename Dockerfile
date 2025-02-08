# Use the official Node.js image as our base image
FROM node:20-bullseye

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install PM2 globally
RUN npm install pm2 -g

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

# Create PM2 config file
RUN echo '{\n\
  "apps": [{\n\
    "name": "streaming",\n\
    "script": "streamingBlocks.js",\n\
    "instances": 1,\n\
    "autorestart": true,\n\
    "watch": false,\n\
    "time": true\n\
  },\n\
  {\n\
    "name": "fastify",\n\
    "script": "fastify/server.js",\n\
    "instances": 1,\n\
    "autorestart": true,\n\
    "watch": false,\n\
    "time": true\n\
  }]\n\
}' > ecosystem.config.json

EXPOSE 8001

# Start PM2 in no-daemon mode
CMD ["pm2-runtime", "ecosystem.config.json"]
 