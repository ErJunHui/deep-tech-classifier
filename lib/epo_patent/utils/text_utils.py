"""Text processing utilities for company name normalization.

Provides common text processing functions including:
- Legal suffix patterns for company name normalization
- Non-ASCII to ASCII character mappings
- Unicode normalization utilities
"""

import re
import unicodedata
from typing import List, Dict


# Legal suffixes to remove during normalization (ordered by length, longest first)
# This ensures that "PTE. LTD." is matched before "LTD."
LEGAL_SUFFIXES = [
    # Multi-word suffixes
    "PRIVATE LIMITED",
    "LIMITED LIABILITY COMPANY",
    "LIMITED LIABILITY PARTNERSHIP",
    "PRIVATE LTD",
    "PUBLIC LIMITED COMPANY",

    # Common suffixes with periods
    "PTE. LTD.",
    "PTY. LTD.",
    "PVT. LTD.",
    "L.L.C.",
    "L.L.P.",
    "S.A.R.L.",
    "G.M.B.H.",
    "S.P.A.",
    "LTD.",
    "INC.",
    "CORP.",
    "CO.",
    "S.A.",
    "AG.",
    "NV.",
    "BV.",

    # Common suffixes without periods
    "PTE LTD",
    "PTY LTD",
    "PVT LTD",
    "INCORPORATED",
    "CORPORATION",
    "LIMITED",
    "LTD",
    "INC",
    "CORP",
    "LLC",
    "LLP",
    "GMBH",
    "SARL",
    "SPA",
    "PLC",
    "AG",
    "SA",
    "NV",
    "BV",
    "AB",
    "OY",
    "AS",
    "CO",

    # Asian variations
    "SDN BHD",
    "SDN. BHD.",
    "BERHAD",
    "BHD",
]

# Non-ASCII to ASCII character mapping
# Maps accented and special characters to their ASCII equivalents
ASCII_MAPPING = {
    # Latin letters with accents
    'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
    'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
    'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
    'Ý': 'Y', 'ý': 'y', 'ÿ': 'y',
    'Ñ': 'N', 'ñ': 'n',
    'Ç': 'C', 'ç': 'c',

    # Special characters
    'Æ': 'AE', 'æ': 'ae',
    'Œ': 'OE', 'œ': 'oe',
    'ß': 'ss',
    'Þ': 'TH', 'þ': 'th',
    'Ð': 'D', 'ð': 'd',

    # Scandinavian
    'Ä': 'A', 'ä': 'a',
    'Ö': 'O', 'ö': 'o',
    'Å': 'A', 'å': 'a',

    # Eastern European
    'Š': 'S', 'š': 's',
    'Ž': 'Z', 'ž': 'z',
    'Č': 'C', 'č': 'c',
    'Ć': 'C', 'ć': 'c',
    'Đ': 'D', 'đ': 'd',

    # Currency symbols (sometimes appear in company names)
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'YEN',
    '$': 'USD',
}


def normalize_unicode(text: str, use_nfd: bool = True) -> str:
    """
    Normalize Unicode text to ASCII.

    Args:
        text: Input text with potential non-ASCII characters
        use_nfd: If True, use NFD decomposition before mapping (recommended)

    Returns:
        ASCII-normalized text

    Examples:
        >>> normalize_unicode("José García")
        'Jose Garcia'
        >>> normalize_unicode("Société Générale")
        'Societe Generale'
        >>> normalize_unicode("Müller & Co")
        'Muller & Co'
    """
    if not text:
        return text

    # First try NFD decomposition if enabled
    if use_nfd:
        # NFD separates characters from their accents
        # e.g., "é" becomes "e" + combining acute accent
        text = unicodedata.normalize('NFD', text)
        # Remove combining characters (accents)
        text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')

    # Then apply custom mapping for characters not handled by NFD
    result = []
    for char in text:
        if char in ASCII_MAPPING:
            result.append(ASCII_MAPPING[char])
        elif ord(char) < 128:  # Already ASCII
            result.append(char)
        else:
            # Try to find ASCII equivalent via NFKD decomposition
            nfkd = unicodedata.normalize('NFKD', char)
            ascii_chars = [c for c in nfkd if ord(c) < 128]
            if ascii_chars:
                result.append(''.join(ascii_chars))
            # else: skip the character (it will be removed)

    return ''.join(result)


def remove_legal_suffix(name: str, suffixes: List[str] = None) -> str:
    """
    Remove legal suffix from company name.

    Args:
        name: Company name
        suffixes: List of legal suffixes to remove (defaults to LEGAL_SUFFIXES)

    Returns:
        Company name with legal suffix removed

    Examples:
        >>> remove_legal_suffix("ACME CORPORATION")
        'ACME'
        >>> remove_legal_suffix("TECH LABS PTE. LTD.")
        'TECH LABS'
        >>> remove_legal_suffix("GOOGLE INC.")
        'GOOGLE'
    """
    if not name:
        return name

    if suffixes is None:
        suffixes = LEGAL_SUFFIXES

    name = name.strip()
    name_upper = name.upper()

    # Try to match longest suffix first (they're already sorted by length)
    for suffix in suffixes:
        suffix_upper = suffix.upper()

        # Check if name ends with this suffix
        if name_upper.endswith(suffix_upper):
            # Remove the suffix and any trailing whitespace
            result = name[:len(name) - len(suffix)].strip()

            # Only return if we didn't remove the entire name
            if result:
                return result

    # No suffix matched, return original
    return name


def normalize_whitespace(text: str) -> str:
    """
    Normalize whitespace in text.

    Collapses multiple spaces into single space and strips leading/trailing whitespace.

    Args:
        text: Input text

    Returns:
        Text with normalized whitespace

    Examples:
        >>> normalize_whitespace("ACME  CORP   INC")
        'ACME CORP INC'
        >>> normalize_whitespace("  TECH  ")
        'TECH'
    """
    if not text:
        return text

    # Split on whitespace and rejoin with single space
    # This handles all types of whitespace (spaces, tabs, newlines)
    return ' '.join(text.split())


def get_ampersand_variants(text: str) -> List[str]:
    """
    Generate variants with ampersand (&) and "AND".

    Args:
        text: Input text

    Returns:
        List of variants (original plus ampersand/AND variations)

    Examples:
        >>> get_ampersand_variants("JOHNSON & JOHNSON")
        ['JOHNSON & JOHNSON', 'JOHNSON AND JOHNSON']
        >>> get_ampersand_variants("AT&T")
        ['AT&T', 'AT AND T']
    """
    variants = [text]

    if '&' in text:
        # Replace & with AND
        variants.append(text.replace('&', 'AND'))
        # Also try with spaces around AND
        variants.append(text.replace('&', ' AND '))
        # Normalize whitespace on the spaced version
        variants[-1] = normalize_whitespace(variants[-1])
    elif ' AND ' in text.upper():
        # Replace AND with &
        # Case-insensitive replacement
        variants.append(re.sub(r'\bAND\b', '&', text, flags=re.IGNORECASE))

    # Remove duplicates while preserving order
    seen = set()
    unique_variants = []
    for variant in variants:
        if variant not in seen:
            seen.add(variant)
            unique_variants.append(variant)

    return unique_variants


def is_special_case(name: str, special_cases: Dict[str, Dict]) -> bool:
    """
    Check if a company name is a special case that should preserve certain words.

    Args:
        name: Company name
        special_cases: Dictionary of special cases from config

    Returns:
        True if this is a special case

    Examples:
        >>> is_special_case("Amperesand", {"Amperesand": {"preserve_words": ["and"]}})
        True
        >>> is_special_case("Regular Company", {"Amperesand": {"preserve_words": ["and"]}})
        False
    """
    if not special_cases:
        return False

    name_upper = name.upper()

    for special_name in special_cases.keys():
        if special_name.upper() in name_upper or name_upper in special_name.upper():
            return True

    return False


def clean_special_characters(text: str, keep_periods: bool = False,
                            keep_ampersand: bool = True,
                            keep_hyphen: bool = True) -> str:
    """
    Clean special characters from text.

    Args:
        text: Input text
        keep_periods: If True, keep periods
        keep_ampersand: If True, keep ampersands
        keep_hyphen: If True, keep hyphens

    Returns:
        Text with special characters cleaned

    Examples:
        >>> clean_special_characters("U.S. Steel", keep_periods=False)
        'US Steel'
        >>> clean_special_characters("Tech-Corp!", keep_hyphen=True)
        'Tech-Corp'
    """
    if not text:
        return text

    # Build pattern of characters to keep
    keep_chars = r'a-zA-Z0-9 '
    if keep_periods:
        keep_chars += r'\.'
    if keep_ampersand:
        keep_chars += '&'
    if keep_hyphen:
        keep_chars += r'\-'

    # Remove everything except allowed characters
    pattern = f'[^{keep_chars}]+'
    text = re.sub(pattern, ' ', text)

    return normalize_whitespace(text)
