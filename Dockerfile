FROM node:20
WORKDIR /app
# Install server dependencies
COPY package*.json ./
RUN npm install
# Clone and install Izumi bot only once during build
RUN git clone https://github.com/Akshay-Eypz/izumi-bot shared/izumi-bot
WORKDIR /app/shared/izumi-bot
RUN npm install --force
# Go back to server root
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
