FROM php:8.2-apache

# Habilitar mod_rewrite y headers
RUN a2enmod rewrite headers

# Configurar Apache para permitir .htaccess y enrutar /api/* directamente a api/index.php
RUN sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf && \
    echo '<Directory /var/www/html>\n    Options -Indexes +FollowSymLinks\n    AllowOverride All\n    Require all granted\n</Directory>' >> /etc/apache2/apache2.conf && \
    echo '<Directory /var/www/html/api>\n    Options -Indexes +FollowSymLinks\n    AllowOverride All\n    FallbackResource /api/index.php\n    Require all granted\n</Directory>' >> /etc/apache2/apache2.conf

# Instalar dependencias del sistema y extensiones necesarias
RUN apt-get update && apt-get install -y \
    libzip-dev \
    unzip \
    sqlite3 \
    libsqlite3-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Render asigna el puerto mediante la variable de entorno $PORT (por defecto 10000)
ENV PORT=10000

WORKDIR /var/www/html

COPY . /var/www/html/

# Crear directorios de datos y asignar permisos a Apache (www-data)
RUN mkdir -p /var/www/html/recruitpro-data/private_uploads && \
    touch /var/www/html/recruitpro.db && \
    chown -R www-data:www-data /var/www/html && \
    chmod -R 775 /var/www/html && \
    chmod 664 /var/www/html/recruitpro.db

# Copiar script de arranque para Render y permisos
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 10000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["apache2-foreground"]
