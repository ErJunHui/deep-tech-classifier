"""Company name normalization for EPO patent search.

Generates multiple search variants to improve patent discovery rate.
"""

import re
import logging
import pandas as pd
from typing import List, Dict, Tuple

from utils.text_utils import (
    normalize_unicode,
    remove_legal_suffix,
    normalize_whitespace,
    get_ampersand_variants,
    is_special_case,
    clean_special_characters,
    LEGAL_SUFFIXES
)


class NameNormalizer:
    """
    Generates normalized variants of company names for EPO patent search.

    Handles:
    - Legal suffix removal (PTE. LTD., INC., etc.)
    - Non-ASCII character normalization (José -> Jose)
    - Special character handling (periods, ampersands, hyphens)
    - Special cases (e.g., "Amperesand" preserves "and" in name)
    """

    def __init__(self, config: Dict):
        """
        Initialize the name normalizer with configuration.

        Args:
            config: Configuration dictionary with name_normalization settings
        """
        self.logger = logging.getLogger(__name__)
        self.config = config.get('name_normalization', {})

        # Extract configuration
        self.enabled = self.config.get('enabled', False)
        self.remove_suffixes = self.config.get('remove_legal_suffixes', True)
        self.handle_non_ascii = self.config.get('handle_non_ascii', True)
        self.generate_variants = self.config.get('generate_variants', True)
        self.max_variants = self.config.get('max_variants', 5)
        self.special_cases = self.config.get('special_cases', {})

        # Log configuration
        if self.enabled:
            self.logger.info("NameNormalizer initialized with advanced normalization")
            self.logger.debug(f"  - Remove suffixes: {self.remove_suffixes}")
            self.logger.debug(f"  - Handle non-ASCII: {self.handle_non_ascii}")
            self.logger.debug(f"  - Generate variants: {self.generate_variants}")
            self.logger.debug(f"  - Max variants: {self.max_variants}")
            self.logger.debug(f"  - Special cases: {list(self.special_cases.keys())}")
        else:
            self.logger.info("NameNormalizer initialized (basic mode - feature disabled)")

    def normalize(self, name: str) -> Tuple[str, List[str]]:
        """
        Normalize company name and generate search variants.

        Args:
            name: Original company name

        Returns:
            Tuple of (primary_variant, all_variants)
            - primary_variant: The main normalized name (used if feature disabled)
            - all_variants: List of search variants to try (ordered by priority)

        Examples:
            >>> normalizer.normalize("José García S.A.")
            ("JOSE GARCIA", ["JOSE GARCIA S.A.", "JOSE GARCIA", ...])

            >>> normalizer.normalize("ABASIA BIOLABS PTE. LTD.")
            ("ABASIA BIOLABS", ["ABASIA BIOLABS PTE. LTD.", "ABASIA BIOLABS", ...])
        """
        if pd.isna(name):
            return '', ['']

        name = str(name).strip()

        if not name:
            return '', ['']

        # If feature disabled, use basic normalization (original behavior)
        if not self.enabled:
            basic_normalized = self._basic_normalize(name)
            return basic_normalized, [basic_normalized]

        # Check if this is a special case
        is_special = is_special_case(name, self.special_cases)

        # Generate all variants
        variants = []

        # 1. Original uppercase (with basic cleaning)
        variant_original = self._basic_normalize(name)
        variants.append(variant_original)
        self.logger.debug(f"Variant 1 (original): {variant_original}")

        # 2. ASCII normalized (if enabled and needed)
        if self.handle_non_ascii and self._contains_non_ascii(name):
            variant_ascii = self._normalize_with_ascii(name)
            if variant_ascii and variant_ascii != variant_original:
                variants.append(variant_ascii)
                self.logger.debug(f"Variant 2 (ASCII): {variant_ascii}")

        # 3. No legal suffix
        if self.remove_suffixes:
            variant_no_suffix = self._normalize_without_suffix(name)
            if variant_no_suffix and variant_no_suffix != variant_original:
                variants.append(variant_no_suffix)
                self.logger.debug(f"Variant 3 (no suffix): {variant_no_suffix}")

        # 4. No suffix + no periods
        if self.remove_suffixes and '.' in variant_original:
            variant_no_suffix_no_periods = self._normalize_without_suffix_and_periods(name)
            if variant_no_suffix_no_periods and variant_no_suffix_no_periods != variant_original:
                variants.append(variant_no_suffix_no_periods)
                self.logger.debug(f"Variant 4 (no suffix, no periods): {variant_no_suffix_no_periods}")

        # 5. Ampersand variations (if not special case with "and" in name)
        if not is_special and ('&' in variant_original or ' AND ' in variant_original.upper()):
            ampersand_variants = self._get_ampersand_alternatives(variant_original)
            for av in ampersand_variants:
                if av and av not in variants:
                    variants.append(av)
                    self.logger.debug(f"Variant 5+ (ampersand): {av}")

        # Remove duplicates while preserving order
        unique_variants = []
        seen = set()
        for v in variants:
            if v and v not in seen:
                seen.add(v)
                unique_variants.append(v)

        # Limit to max_variants
        if len(unique_variants) > self.max_variants:
            unique_variants = unique_variants[:self.max_variants]
            self.logger.debug(f"Limited to {self.max_variants} variants")

        # Primary variant is the first one (original normalized)
        primary = unique_variants[0] if unique_variants else ''

        return primary, unique_variants

    def _basic_normalize(self, name: str) -> str:
        """
        Basic normalization (original behavior).

        Removes parentheses/brackets, keeps alphanumeric + . & -, normalizes whitespace, uppercase.
        """
        name = str(name).strip()

        # Remove content in parentheses and brackets
        name = re.sub(r'\s*\(.+\)\s*', ' ', name)
        name = re.sub(r'\s*\[.+\]\s*', ' ', name)

        # Keep only alphanumeric, spaces, periods, ampersands, and hyphens
        name = re.sub(r'[^a-zA-Z0-9 .&-]+', ' ', name)

        # Normalize whitespace
        name = normalize_whitespace(name)

        # Convert to uppercase
        return name.upper()

    def _contains_non_ascii(self, text: str) -> bool:
        """Check if text contains non-ASCII characters."""
        return any(ord(char) >= 128 for char in text)

    def _normalize_with_ascii(self, name: str) -> str:
        """Normalize with ASCII conversion."""
        # First convert non-ASCII to ASCII
        name_ascii = normalize_unicode(name)

        # Then apply basic normalization
        return self._basic_normalize(name_ascii)

    def _normalize_without_suffix(self, name: str) -> str:
        """Normalize and remove legal suffix."""
        # First apply basic normalization
        normalized = self._basic_normalize(name)

        # Then remove legal suffix
        without_suffix = remove_legal_suffix(normalized, LEGAL_SUFFIXES)

        return without_suffix

    def _normalize_without_suffix_and_periods(self, name: str) -> str:
        """Normalize, remove legal suffix, and remove periods."""
        # Start with suffix removal
        without_suffix = self._normalize_without_suffix(name)

        # Remove all periods
        no_periods = without_suffix.replace('.', '')

        # Normalize whitespace again (in case period removal created double spaces)
        return normalize_whitespace(no_periods)

    def _get_ampersand_alternatives(self, name: str) -> List[str]:
        """Get alternative versions with & <-> AND."""
        # Get ampersand variants
        alternatives = get_ampersand_variants(name)

        # Remove the original (it's already in the variants list)
        return [alt for alt in alternatives if alt != name]


def clean_company_name_for_epo(name: str) -> str:
    """
    Legacy function for backward compatibility.

    Clean company name for EPO API query using basic normalization.

    Args:
        name: Original company name

    Returns:
        Cleaned company name suitable for EPO search

    Note:
        This function is kept for backward compatibility.
        New code should use NameNormalizer class instead.
    """
    if pd.isna(name):
        return ''

    name = str(name).strip()

    # Remove content in parentheses and brackets
    name = re.sub(r'\s*\(.+\)\s*', ' ', name)
    name = re.sub(r'\s*\[.+\]\s*', ' ', name)

    # Keep only alphanumeric, spaces, periods, ampersands, and hyphens
    name = re.sub(r'[^a-zA-Z0-9 .&-]+', ' ', name)

    # Normalize whitespace
    name = ' '.join(filter(None, name.split()))

    # Convert to uppercase
    return name.strip().upper()
