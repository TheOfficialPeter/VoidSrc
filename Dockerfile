FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Copy TMDB-Embed-API package files
COPY TMDB-Embed-API/package*.json ./TMDB-Embed-API/

# Install dependencies for main app
RUN npm ci --only=production

# Install dependencies for TMDB-Embed-API
WORKDIR /app/TMDB-Embed-API
RUN npm install --omit=dev
WORKDIR /app

# Copy app source code
COPY . .

# The port the app runs on
EXPOSE 7000

# Command to run the app
CMD ["npm", "start"] 