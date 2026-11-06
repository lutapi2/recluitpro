FROM php:8.2-cli-alpine

# Install PDO MySQL extension
RUN docker-php-ext-install pdo pdo_mysql

WORKDIR /app

# Copy all project files
COPY . /app

# Ensure uploads and data directories exist and are writable
RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

# Render sets PORT env variable (default 10000)
ENV PORT=10000
EXPOSE 10000

# Start pure PHP server using router.php
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-10000} router.php"]
