# Use lightweight Node 20 base image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source code and files
COPY . .

# Environment variables setup
ENV NODE_ENV=production

# Command to start Telegram bot
CMD ["npm", "run", "start"]
