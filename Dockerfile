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
# remove some old code.") because it no longer builds cleanly. v1 is still the
# active UI for most of the app (budgets, reports, logout, etc.) though - v2 only
# covers newer pages - so skipping it breaks core functionality, not just cosmetics.
# Root cause: resources/assets/v1/package.json pins vue-loader@^17, which is for
# Vue 3; this is a Vue 2 project and needs vue-loader@15. Fixed the pin, but npm
# workspaces then nests vue-loader under resources/assets/v1/node_modules instead
# of hoisting it to the root, where laravel-mix (which resolves relative to its
# own location) can't see it - triggering Mix's "auto-install missing deps" path,
# which is itself destructive under npm workspaces (wipes node_modules instead of
# fixing it). Pinning the same vue-loader version as a root devDependency (see
# package.json) forces correct hoisting and avoids that path ever triggering.
FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY . .
RUN npm install \
    && npm run prod --workspace=resources/assets/v1 \
    && npm run build --workspace=resources/assets/v2

FROM php:8.5-apache AS final

RUN apt-get update && apt-get install -y --no-install-recommends \
        libicu-dev \
        libzip-dev \
        libpq-dev \
        locales \
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
    && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# Firefly III formats currency via PHP's setlocale(LC_MONETARY, ...), which needs
# the locale actually generated on the OS (see app/Support/Amount.php) - separate
# from the ext-intl/ICU data above, which works without this. Without it, the app
# shows "Invalid server configuration: unable to format monetary amounts" even for
# English. Add more `sed` lines / locale-gen entries here if other locales are needed.
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e "s!/var/www/html!${APACHE_DOCUMENT_ROOT}!g" /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf

WORKDIR /var/www/html

# NOTE: public/v2/i18n (translation JSON files) is generated upstream by a
# closed-source GitHub Action (JC5/firefly-iii-dev) not available to us. English
# strings are bundled into the JS itself, so this only affects other locales.
COPY . .
COPY --from=frontend /app/public ./public

RUN composer install --no-dev --no-interaction --no-scripts --optimize-autoloader \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/testing storage/framework/views storage/upload \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
