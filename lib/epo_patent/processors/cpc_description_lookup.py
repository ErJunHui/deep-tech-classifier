"""CPC code description lookup and reference generation.

This module provides functionality to look up human-readable descriptions
for CPC (Cooperative Patent Classification) codes using a tiered approach.
"""

import json
import logging
from typing import Dict, Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class CPCDescriptionLookup:
    """Manages CPC code to description mapping with tiered lookup strategy."""

    def __init__(self, descriptions_file: Optional[str] = None):
        """
        Initialize CPC description lookup.

        Args:
            descriptions_file: Path to JSON file containing CPC descriptions.
                             If None, uses default config/cpc_descriptions.json
        """
        self.descriptions = {}
        self.descriptions_file = descriptions_file or "config/cpc_descriptions.json"
        self._load_descriptions()

    def _load_descriptions(self):
        """Load CPC descriptions from JSON file."""
        try:
            file_path = Path(self.descriptions_file)
            if file_path.exists():
                with open(file_path, 'r', encoding='utf-8') as f:
                    self.descriptions = json.load(f)
                logger.info(f"Loaded {len(self.descriptions)} CPC descriptions from {self.descriptions_file}")
            else:
                logger.warning(f"CPC descriptions file not found: {self.descriptions_file}")
                logger.warning("CPC descriptions will fall back to generic patterns")
                self.descriptions = self._get_minimal_descriptions()
        except Exception as e:
            logger.error(f"Error loading CPC descriptions: {e}")
            self.descriptions = self._get_minimal_descriptions()

    def _get_minimal_descriptions(self) -> Dict[str, str]:
        """Return minimal section-level descriptions as fallback."""
        return {
            "A": "Human necessities",
            "B": "Performing operations; transporting",
            "C": "Chemistry; metallurgy",
            "D": "Textiles; paper",
            "E": "Fixed structures",
            "F": "Mechanical engineering; lighting; heating; weapons; blasting",
            "G": "Physics",
            "H": "Electricity",
            "Y": "Emerging cross-sectional technologies"
        }

    def lookup(self, cpc_code: str) -> str:
        """
        Look up CPC code description with tiered approach.

        Strategy:
        1. Exact code match (e.g., "G06Q 20/3827")
        2. Main group match (e.g., "G06Q 20")
        3. Subclass match (e.g., "G06Q")
        4. Class match (e.g., "G06")
        5. Section match (e.g., "G")
        6. Generic fallback

        Args:
            cpc_code: Full CPC code string (e.g., "G06Q 20/3827")

        Returns:
            Human-readable description of the CPC code
        """
        if not cpc_code or not isinstance(cpc_code, str):
            return "Invalid CPC code"

        # Clean the code
        code = cpc_code.strip()

        # Try exact match first
        if code in self.descriptions:
            return self.descriptions[code]

        # Extract components for tiered lookup
        components = self._parse_cpc_components(code)

        # Try progressively broader matches
        search_keys = self._generate_search_keys(components)

        for key in search_keys:
            if key in self.descriptions:
                return self.descriptions[key]

        # Final fallback
        return "CPC classification (description not available)"

    def _parse_cpc_components(self, cpc_code: str) -> Dict[str, str]:
        """
        Parse CPC code into components.

        Args:
            cpc_code: Full CPC code (e.g., "G06Q 20/3827")

        Returns:
            Dictionary with section, class, subclass, main_group, subgroup
        """
        components = {
            'section': '',
            'class': '',
            'subclass': '',
            'main_group': '',
            'subgroup': ''
        }

        try:
            # Remove extra whitespace
            code = ' '.join(cpc_code.split())

            # Section (1st character)
            if len(code) >= 1:
                components['section'] = code[0]

            # Class (2nd-3rd characters)
            if len(code) >= 3:
                components['class'] = code[1:3]

            # Subclass (4th character)
            if len(code) >= 4:
                components['subclass'] = code[3]

            # Main group and subgroup (after space)
            if ' ' in code:
                group_part = code.split(' ', 1)[1]
                if '/' in group_part:
                    main, sub = group_part.split('/', 1)
                    components['main_group'] = main.strip()
                    components['subgroup'] = sub.strip()
                else:
                    components['main_group'] = group_part.strip()

        except Exception as e:
            logger.debug(f"Error parsing CPC code '{cpc_code}': {e}")

        return components

    def _generate_search_keys(self, components: Dict[str, str]) -> list:
        """
        Generate search keys in order of specificity.

        Args:
            components: Parsed CPC components

        Returns:
            List of search keys from most to least specific
        """
        keys = []
        section = components.get('section', '')
        cls = components.get('class', '')
        subclass = components.get('subclass', '')
        main_group = components.get('main_group', '')
        subgroup = components.get('subgroup', '')

        # Full code variations
        if section and cls and subclass and main_group:
            if subgroup:
                # Full code: "G06Q 20/3827"
                keys.append(f"{section}{cls}{subclass} {main_group}/{subgroup}")
            # Main group: "G06Q 20"
            keys.append(f"{section}{cls}{subclass} {main_group}")

        # Subclass: "G06Q"
        if section and cls and subclass:
            keys.append(f"{section}{cls}{subclass}")

        # Class: "G06"
        if section and cls:
            keys.append(f"{section}{cls}")

        # Section: "G"
        if section:
            keys.append(section)

        return keys

    def get_statistics(self) -> Dict[str, int]:
        """
        Get statistics about loaded descriptions.

        Returns:
            Dictionary with statistics
        """
        stats = {
            'total_descriptions': len(self.descriptions),
            'sections': 0,
            'classes': 0,
            'subclasses': 0,
            'main_groups': 0,
            'full_codes': 0
        }

        for key in self.descriptions.keys():
            if key.startswith('_'):  # Skip metadata keys
                continue
            if len(key) == 1:
                stats['sections'] += 1
            elif len(key) == 3:
                stats['classes'] += 1
            elif len(key) == 4:
                stats['subclasses'] += 1
            elif ' ' in key and '/' not in key:
                stats['main_groups'] += 1
            elif '/' in key:
                stats['full_codes'] += 1

        return stats


def lookup_cpc_description(cpc_code: str, lookup_instance: Optional[CPCDescriptionLookup] = None) -> str:
    """
    Convenience function to lookup a single CPC description.

    Args:
        cpc_code: CPC code to look up
        lookup_instance: Optional CPCDescriptionLookup instance to use

    Returns:
        Description string
    """
    if lookup_instance is None:
        lookup_instance = CPCDescriptionLookup()

    return lookup_instance.lookup(cpc_code)
