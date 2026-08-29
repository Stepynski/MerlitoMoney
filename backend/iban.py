import re

# ISO 13616 IBAN registry lengths, European countries (+ a few common non-EU ones).
IBAN_LENGTHS = {
    'AD': 24, 'AT': 20, 'BA': 20, 'BE': 16, 'BG': 22, 'CH': 21, 'CY': 28,
    'CZ': 24, 'DE': 22, 'DK': 18, 'EE': 20, 'ES': 24, 'FI': 18, 'FO': 18,
    'FR': 27, 'GB': 22, 'GI': 23, 'GL': 18, 'GR': 27, 'HR': 21, 'HU': 28,
    'IE': 22, 'IS': 26, 'IT': 27, 'LI': 21, 'LT': 20, 'LU': 20, 'LV': 21,
    'MC': 27, 'MD': 24, 'ME': 22, 'MK': 19, 'MT': 31, 'NL': 18, 'NO': 15,
    'PL': 28, 'PT': 25, 'RO': 24, 'RS': 22, 'SE': 24, 'SI': 19, 'SK': 24,
    'SM': 27, 'UA': 29, 'VA': 22, 'XK': 20,
}

_FORMAT = re.compile(r'[A-Z]{2}[0-9]{2}[A-Z0-9]+')


def normalize_iban(raw: str) -> str:
    return re.sub(r'[\s-]', '', raw or '').upper()


def is_valid_iban(raw: str) -> bool:
    iban = normalize_iban(raw)
    if not _FORMAT.fullmatch(iban):
        return False
    expected_len = IBAN_LENGTHS.get(iban[:2])
    if expected_len is not None and len(iban) != expected_len:
        return False
    rearranged = iban[4:] + iban[:4]
    digits = ''.join(str(int(ch, 36)) for ch in rearranged)  # A-Z -> 10-35
    return int(digits) % 97 == 1
