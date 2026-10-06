# Runtime image for the bot process and for the e2e test runner.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY data ./data
COPY test ./test
CMD ["node", "src/main.js"]
