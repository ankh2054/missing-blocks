# Use the official Node.js image as our base image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy root package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy fastify package files and install dependencies
COPY fastify/package*.json ./fastify/
WORKDIR /usr/src/app/fastify
RUN npm install

# Return to app root
WORKDIR /usr/src/app

# Copy the rest of our application to the container
COPY . .

# Create a startup script
RUN echo '#!/bin/bash\n\
node streamingBlocks.js --firststart &\n\
node fastify/server.js' > start.sh && \
chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]
 