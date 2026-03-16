"""
Deep-tech patent classification based on CPC codes.

Implements hybrid classification approach:
- Predefined CPC mapping for high-confidence domains
- Pattern-based scoring for unmapped codes
- Multi-domain tagging with primary domain selection
"""

import json
import logging
from typing import Dict, List, Any, Tuple
from pathlib import Path

# Configuration constants
DEEPTECH_THRESHOLDS = {
    "very_strong": 80,
    "strong": 60,
    "moderate": 40,
    "not_deeptech": 0
}


class DeepTechClassifier:
    """Classifies patents as deep-tech based on CPC codes."""

    def __init__(self, mapping_file: str, config: Dict[str, Any]):
        """
        Initialize classifier with mapping data and configuration.

        Args:
            mapping_file: Path to deeptech_mapping.json
            config: Configuration dictionary with thresholds, etc.
        """
        self.logger = logging.getLogger(__name__)
        self.mapping = self._load_mapping(mapping_file)
        self.config = config
        self.enabled = config.get('enabled', True)

        # Override thresholds if provided in config
        self.thresholds = config.get('thresholds', DEEPTECH_THRESHOLDS)

        # Build reverse lookup index: main_group -> [domains]
        self.main_group_index = self._build_main_group_index()

        self.logger.info(f"DeepTechClassifier initialized with {len(self.main_group_index)} CPC main groups mapped")

    def _load_mapping(self, mapping_file: str) -> Dict:
        """Load CPC mapping from JSON file."""
        try:
            with open(mapping_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load deep-tech mapping: {e}")
            return {}

    def _build_main_group_index(self) -> Dict[str, List[Dict]]:
        """
        Build reverse index: main_group -> list of {domain, subdomain, confidence}.

        Example: {"G06N 3": [{"domain": "AI/ML", "subdomain": "Neural Networks", "confidence": "very_high"}]}
        """
        index = {}
        for domain, domain_data in self.mapping.items():
            for subdomain, subdomain_data in domain_data.get('subdomains', {}).items():
                main_groups = subdomain_data.get('main_groups', [])
                confidence = subdomain_data.get('confidence', 'medium')

                for mg in main_groups:
                    if mg not in index:
                        index[mg] = []
                    index[mg].append({
                        'domain': domain,
                        'subdomain': subdomain,
                        'confidence': confidence
                    })

        return index

    def _extract_main_group(self, cpc_components: Dict[str, str]) -> str:
        """
        Extract main group string from CPC components.

        Args:
            cpc_components: Dict with section, class, subclass, main_group, subgroup

        Returns:
            Main group string (e.g., "G06N 3")
        """
        section = cpc_components.get('section', '')
        cls = cpc_components.get('class', '')
        subclass = cpc_components.get('subclass', '')
        main_group = cpc_components.get('main_group', '')

        if all([section, cls, subclass, main_group]):
            return f"{section}{cls}{subclass} {main_group}"
        return ""

    def _lookup_in_mapping(self, cpc_components: Dict[str, str]) -> Dict[str, Any]:
        """
        Look up CPC code in predefined mapping.

        Returns:
            {
                'matched': bool,
                'domains': [domain names],
                'subdomains': [subdomain names],
                'confidence': str (very_high/high/medium)
            }
        """
        main_group_str = self._extract_main_group(cpc_components)

        if main_group_str in self.main_group_index:
            matches = self.main_group_index[main_group_str]
            return {
                'matched': True,
                'domains': [m['domain'] for m in matches],
                'subdomains': [m['subdomain'] for m in matches],
                'confidence': matches[0]['confidence']  # Use first match's confidence
            }

        return {
            'matched': False,
            'domains': [],
            'subdomains': [],
            'confidence': None
        }

    def _calculate_score(
        self,
        cpc_components: Dict[str, str],
        mapping_result: Dict[str, Any]
    ) -> Tuple[int, List[str]]:
        """
        Calculate deep-tech score for a single CPC code.

        Returns:
            Tuple of (score: int, domains: List[str])
        """
        # Rule 1: Exact match in mapping (highest priority)
        if mapping_result['matched']:
            confidence_scores = {
                'very_high': 95,
                'high': 85,
                'medium': 75
            }
            score = confidence_scores.get(mapping_result['confidence'], 75)
            return score, mapping_result['domains']

        # Rule 2: Pattern-based scoring for unmapped codes
        base_score = 0
        section = cpc_components.get('section', '')
        cls = cpc_components.get('class', '')

        # Y-section (cross-reference codes)
        if section == 'Y':
            if cls in ['02', '10']:  # Y02 (Climate), Y10 (Tech subjects)
                base_score = 60

        # Section-based heuristics
        section_scores = {
            'G': 40,  # Physics
            'H': 45,  # Electricity
            'C': 35,  # Chemistry
            'B': 30,  # Operations
            'A': 25   # Human necessities
        }
        base_score = max(base_score, section_scores.get(section, 0))

        # Class-based heuristics
        high_tech_classes = {
            'G06': 50,  # Computing
            'H01': 55,  # Basic electric elements
            'H04': 50,  # Communication
            'C12': 60,  # Biochemistry
            'B82': 70,  # Nanotechnology
            'A61': 45,  # Medical
            'B25': 50,  # Hand tools / manipulators
            'B64': 50   # Aircraft / spacecraft
        }

        class_key = section + cls
        if class_key in high_tech_classes:
            base_score = max(base_score, high_tech_classes[class_key])

        return base_score, []

    def classify_patent(self, cpc_codes: List[str]) -> Dict[str, Any]:
        """
        Classify a patent based on all its CPC codes.

        Args:
            cpc_codes: List of CPC code strings

        Returns:
            Classification result dictionary with:
            - is_deeptech: bool
            - deeptech_level: str (Very Strong/Strong/Moderate/Not Deep-tech)
            - overall_score: int (0-100)
            - primary_domain: str
            - secondary_domains: List[str]
            - domain_breakdown: Dict[str, int] (domain -> count)
            - cpc_details: List of per-CPC scoring details
        """
        if not self.enabled:
            return self._empty_classification()

        if not cpc_codes:
            return self._empty_classification()

        from processors.cpc_parser import parse_cpc_code

        # Score each CPC code
        cpc_results = []
        for cpc_code in cpc_codes:
            components = parse_cpc_code(cpc_code)

            # Only process if we got valid components
            if components.get('section') and components.get('class'):
                mapping_result = self._lookup_in_mapping(components)
                score, domains = self._calculate_score(components, mapping_result)

                cpc_results.append({
                    'code': cpc_code,
                    'score': score,
                    'domains': domains,
                    'matched_in_mapping': mapping_result['matched'],
                    'subdomains': mapping_result.get('subdomains', [])
                })

        # If no valid CPC codes processed, return empty
        if not cpc_results:
            return self._empty_classification()

        # Aggregate domains
        domain_counts = {}
        for result in cpc_results:
            for domain in result['domains']:
                domain_counts[domain] = domain_counts.get(domain, 0) + 1

        # Determine primary domain (most frequent, then highest total score)
        if domain_counts:
            primary_domain = max(
                domain_counts.keys(),
                key=lambda d: (
                    domain_counts[d],
                    sum(r['score'] for r in cpc_results if d in r['domains'])
                )
            )
            secondary_domains = sorted([d for d in domain_counts if d != primary_domain])
        else:
            primary_domain = "Unclassified"
            secondary_domains = []

        # Calculate overall score (maximum score across all CPCs)
        overall_score = max([r['score'] for r in cpc_results], default=0)

        # Determine classification level
        if overall_score >= self.thresholds['very_strong']:
            deeptech_level = "Very Strong"
            is_deeptech = True
        elif overall_score >= self.thresholds['strong']:
            deeptech_level = "Strong"
            is_deeptech = True
        elif overall_score >= self.thresholds['moderate']:
            deeptech_level = "Moderate"
            is_deeptech = True
        else:
            deeptech_level = "Not Deep-tech"
            is_deeptech = False

        return {
            'is_deeptech': is_deeptech,
            'deeptech_level': deeptech_level,
            'overall_score': overall_score,
            'primary_domain': primary_domain,
            'secondary_domains': secondary_domains,
            'domain_breakdown': domain_counts,
            'cpc_details': cpc_results
        }

    def _empty_classification(self) -> Dict[str, Any]:
        """Return empty classification when disabled or no CPCs."""
        return {
            'is_deeptech': False,
            'deeptech_level': "Not Deep-tech",
            'overall_score': 0,
            'primary_domain': "N/A",
            'secondary_domains': [],
            'domain_breakdown': {},
            'cpc_details': []
        }


# Convenience function for integration
def classify_patent_deeptech(cpc_codes: List[str], classifier: DeepTechClassifier) -> Dict[str, Any]:
    """
    Classify patent as deep-tech.

    Args:
        cpc_codes: List of CPC code strings
        classifier: Initialized DeepTechClassifier instance

    Returns:
        Classification result dictionary
    """
    return classifier.classify_patent(cpc_codes)
