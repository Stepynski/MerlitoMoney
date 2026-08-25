<?php

declare(strict_types=1);

namespace FireflyIII\Support\Cronjobs;

use Carbon\Carbon;
use FireflyIII\Support\Facades\AppConfiguration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Lcobucci\JWT\Configuration as JWTConfiguration;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;

/**
 * Class BankConnectionCronjob
 *
 * Checks the validity of each linked Enable Banking session (one JSON config
 * file per bank connection, see the data importer's "download configuration"
 * feature) and warns in-app when one is close to expiring. Not part of
 * upstream Firefly III.
 */
class BankConnectionCronjob extends AbstractCronjob
{
    public function fire(): void
    {
        Log::debug(sprintf('Now in %s', __METHOD__));

        if (false === (bool) config('firefly.bank_connection_check.enabled')) {
            $this->jobFired     = false;
            $this->jobSucceeded = false;
            $this->jobErrored   = false;
            $this->message      = 'Bank connection check is not enabled.';

            return;
        }

        $config        = AppConfiguration::get('last_bcw_job', 0);
        $lastTime      = (int) $config->data;
        $diff          = now(config('app.timezone'))->getTimestamp() - $lastTime;
        $diffForHumans = now(config('app.timezone'))->diffForHumans(Carbon::createFromTimestamp($lastTime), null, true);

        if ($lastTime > 0 && $diff <= $this->timeBetweenRuns) {
            if (false === $this->force) {
                $this->message      = sprintf('It has been %s since the bank connection check last fired. It will not fire now.', $diffForHumans);
                $this->jobFired     = false;
                $this->jobErrored   = false;
                $this->jobSucceeded = false;

                return;
            }
        }

        $this->checkConnections();
    }

    private function checkConnections(): void
    {
        $appId         = (string) config('firefly.bank_connection_check.enable_banking_app_id');
        $keyFile       = (string) config('firefly.bank_connection_check.private_key_file');
        $directory     = (string) config('firefly.bank_connection_check.config_directory');
        $warnDays      = (int) config('firefly.bank_connection_check.warn_days');
        $urgentDays    = (int) config('firefly.bank_connection_check.urgent_days');

        if ('' === $appId || '' === $keyFile || '' === $directory || !is_dir($directory) || !is_file($keyFile)) {
            $this->jobFired     = false;
            $this->jobSucceeded = false;
            $this->jobErrored   = true;
            $this->message      = 'Bank connection check is enabled but not fully configured.';
            Log::warning($this->message);

            return;
        }

        $jwt           = $this->buildJWT($appId, $keyFile);
        $warnings      = [];
        $errored       = false;

        foreach (glob($directory.'/*.json') ?: [] as $file) {
            $raw    = json_decode((string) file_get_contents($file), true);
            $bank   = $raw['enable_banking_bank'] ?? null;
            $session = $raw['enable_banking_sessions'][0] ?? null;
            if (null === $bank || null === $session) {
                continue;
            }

            $response = Http::withToken($jwt)->get(sprintf('https://api.enablebanking.com/sessions/%s', $session));
            if (!$response->successful()) {
                Log::warning(sprintf('Bank connection check: could not reach Enable Banking for "%s": HTTP %d', $bank, $response->status()));
                $errored = true;

                continue;
            }
            $validUntil = $response->json('access.valid_until');
            if (null === $validUntil) {
                continue;
            }
            $expiresAt  = Carbon::parse($validUntil);
            $daysLeft   = (int) now()->diffInDays($expiresAt, false);

            if ($daysLeft > $warnDays) {
                continue;
            }

            $warnings[] = [
                'bank'       => $bank,
                'days_left'  => max(0, $daysLeft),
                'level'      => $daysLeft <= $urgentDays ? 'danger' : 'warning',
                'expires_at' => $expiresAt->toIso8601String(),
            ];
        }

        AppConfiguration::set('bank_connection_warnings', $warnings);
        AppConfiguration::set('last_bcw_job', (int) $this->date->format('U'));

        $this->jobFired     = true;
        $this->jobErrored   = $errored;
        $this->jobSucceeded = !$errored;
        $this->message      = sprintf('Bank connection check fired, %d warning(s) active.', count($warnings));
        Log::info($this->message);
    }

    private function buildJWT(string $appId, string $keyFile): string
    {
        $config = JWTConfiguration::forAsymmetricSigner(
            new Sha256(),
            InMemory::file($keyFile),
            InMemory::plainText('unused-verification-key'),
        );
        $now    = new \DateTimeImmutable();
        $token  = $config->builder()
            ->issuedBy('enablebanking.com')
            ->permittedFor('api.enablebanking.com')
            ->issuedAt($now)
            ->expiresAt($now->modify('+3600 seconds'))
            ->withHeader('kid', $appId)
            ->getToken($config->signer(), $config->signingKey())
        ;

        return $token->toString();
    }
}
