FROM php:8.2-apache

# Habilitar mod_rewrite para que .htaccess funcione correctamente
RUN a2enmod rewrite

# Permitir .htaccess en Apache
RUN sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# Instalar dependencias del sistema y extensión zip para análisis de CVs en DOCX
RUN apt-get update && apt-get install -y \
    libzip-dev \
    unzip \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Render asigna el puerto mediante la variable de entorno $PORT (por defecto 10000)
ENV PORT=10000
RUN sed -i 's/Listen 80/Listen ${PORT}/g' /etc/apache2/ports.conf && \
    sed -i 's/:80/:${PORT}/g' /etc/apache2/sites-available/000-default.conf

# Directorio de trabajo
WORKDIR /var/www/html

# Copiar archivos del proyecto
COPY . /var/www/html/

# Crear directorios de datos y asignar permisos a Apache
RUN mkdir -p /var/www/html/recruitpro-data/private_uploads && \
    chown -R www-data:www-data /var/www/html && \
    chmod -R 775 /var/www/html

EXPOSE 10000

CMD ["apache2-foreground"]
