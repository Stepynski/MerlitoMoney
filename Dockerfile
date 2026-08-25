# MerlitoMoney (Firefly III fork) - build image from source
#
# Two-stage build:
#   1. "frontend" compiles the JS/CSS assets (v1 via Laravel Mix, v2 via Vite)
#   2. final stage installs PHP deps and serves the app with Apache
#
# The artisan commands run on every container start (see docker/entrypoint.sh)
# mirror exactly what composer.json's "post-update-cmd" runs upstream, so the
# database schema and OAuth keys stay in sync when this image is rebuilt from
# newer source.

# NOTE: upstream firefly-iii dropped building the legacy v1 (Vue2/webpack) frontend
# from its own release pipeline as of commit fd8791d08d ("No longer build v1,
# remove some old code.") because it no longer builds cleanly. We follow suit and
# only build v2 (Vite). Revisit if/when upstream restores or fully removes v1.
FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY . .
RUN npm install \
    && npm run build --workspace=resources/assets/v2

FROM php:8.5-apache AS final

RUN apt-get update && apt-get install -y --no-install-recommends \
        libicu-dev \
        libzip-dev \
        libpq-dev \
        unzip \
        git \
    && docker-php-ext-configure intl \
    && docker-php-ext-install \
        bcmath \
        intl \
        pdo_mysql \
        pdo_pgsql \
        zip \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e "s!/var/www/html!${APACHE_DOCUMENT_ROOT}!g" /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf

WORKDIR /var/www/html

# NOTE: public/v2/i18n (translation JSON files) is generated upstream by a
# closed-source GitHub Action (JC5/firefly-iii-dev) not available to us. English
# strings are bundled into the JS itself, so this only affects other locales.
COPY . .
COPY --from=frontend /app/public/build ./public/build

RUN composer install --no-dev --no-interaction --no-scripts --optimize-autoloader \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/testing storage/framework/views storage/upload \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
