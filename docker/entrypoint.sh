#!/bin/sh
set -e

echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
until php -r "new PDO('mysql:host=${DB_HOST};port=${DB_PORT}', '${DB_USERNAME}', '${DB_PASSWORD}');" 2>/dev/null; do
    sleep 2
done
echo "Database is reachable."

php artisan migrate --force
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear
php artisan firefly-iii:upgrade-database
php artisan firefly-iii:laravel-passport-keys
php artisan firefly-iii:instructions update

# The artisan commands above run as root and create new cache/session files
# (e.g. storage/framework/cache/data/**), so re-chown after they run - Apache
# serves as www-data and needs to write into those same paths.
chown -R www-data:www-data storage bootstrap/cache

exec "$@"
