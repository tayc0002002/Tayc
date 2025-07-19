FROM node:lts

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg imagemagick webp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy only package files first (caching optimization)
COPY package*.json ./

# Install Node dependencies
RUN npm install --production && npm cache clean --force

# Copy the rest of the application
COPY . .

# Optional: expose if you use a web interface or API
EXPOSE 3000

# Define environment
ENV NODE_ENV=production

# Default command
CMD ["node", "index.js"]
