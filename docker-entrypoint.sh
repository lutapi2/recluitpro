#!/bin/bash
set -e

PORT="${PORT:-10000}"

# Adjust Apache configuration dynamically to Render's $PORT
sed -i "s/Listen [0-9]*/Listen $PORT/g" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:[0-9]*>/<VirtualHost \*:$PORT>/g" /etc/apache2/sites-available/000-default.conf

# Set permissions for SQLite database and data directory
if [ -n "$DATABASE_PATH" ]; then
    DB_DIR="$(dirname "$DATABASE_PATH")"
    mkdir -p "$DB_DIR"
    chown -R www-data:www-data "$DB_DIR"
    chmod -R 775 "$DB_DIR"
    if [ -f "$DATABASE_PATH" ]; then
        chmod 664 "$DATABASE_PATH"
    fi
else
    chown -R www-data:www-data /var/www/html
    chmod -R 775 /var/www/html
    if [ -f /var/www/html/recruitpro.db ]; then
        chmod 664 /var/www/html/recruitpro.db
    fi
fi

exec "$@"
