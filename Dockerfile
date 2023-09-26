# Use the official Node.js image as our base image
FROM node:14

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of our application to the container
COPY . .


EXPOSE 3000

# Command to run our application
CMD ["node", "streamingBlocks.js"]
 