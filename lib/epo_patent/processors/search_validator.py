"""Search result validation using fuzzy string matching.

Validates that found patents actually match the intended company by comparing
the search name against the applicant names in the patent data.
"""

import logging
from typing import Dict, List, Any, Optional
from rapidfuzz import fuzz


class SearchValidator:
    """
    Validates patent search results using fuzzy string matching.

    Uses token_sort_ratio algorithm which is robust to:
    - Word reordering ("GOOGLE INC" vs "INC GOOGLE")
    - Extra/missing words ("ACME CORP INTERNATIONAL" vs "ACME CORP")
    - Case differences (handled via normalization)
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize search validator with configuration.

        Args:
            config: Configuration dictionary with search_validation settings
        """
        self.logger = logging.getLogger(__name__)
        self.config = config.get('search_validation', {})

        # Extract configuration
        self.enabled = self.config.get('enabled', False)
        self.min_similarity_score = self.config.get('min_similarity_score', 70)
        self.uncertain_threshold = self.config.get('uncertain_threshold', 50)
        self.algorithm = self.config.get('fuzzy_matching_algorithm', 'token_sort_ratio')
        self.log_details = self.config.get('log_validation_details', True)

        if self.enabled:
            self.logger.info("SearchValidator initialized")
            self.logger.debug(f"  - Algorithm: {self.algorithm}")
            self.logger.debug(f"  - Min similarity score: {self.min_similarity_score}")
            self.logger.debug(f"  - Uncertain threshold: {self.uncertain_threshold}")
        else:
            self.logger.info("SearchValidator initialized (feature disabled)")

    def validate_patent(
        self,
        search_name: str,
        applicant_names: List[str],
        inventor_names: List[str] = None,
        search_variant_used: str = None
    ) -> Dict[str, Any]:
        """
        Validate that a patent matches the intended company using fuzzy matching.

        Args:
            search_name: The original company name being searched
            applicant_names: List of applicant names from the patent
            inventor_names: List of inventor names from the patent (NEW)
            search_variant_used: The search variant that found this patent (optional)

        Returns:
            Dictionary with validation results:
            {
                'confidence_score': float (0-100),
                'status': str ('Validated', 'Uncertain', 'Failed'),
                'best_match': str (name with highest score),
                'all_scores': dict (all scores),
                'match_field': str ('Applicant', 'Inventor', or 'Unknown')
            }

        Examples:
            >>> validator.validate_patent("ACME CORP", ["ACME CORPORATION", "JOHN DOE"])
            {'confidence_score': 95.2, 'status': 'Validated', ...}
        """
        if not self.enabled:
            # If validation disabled, return high confidence by default
            return {
                'confidence_score': 100.0,
                'status': 'Not Validated',
                'best_match': applicant_names[0] if applicant_names else '',
                'all_scores': {},
                'match_field': 'Unknown'
            }

        # Use search variant if provided, otherwise use original search name
        name_to_match = search_variant_used if search_variant_used else search_name

        # Combine applicants and inventors for validation (NEW)
        inventor_names = inventor_names or []
        all_names = applicant_names + inventor_names

        if not name_to_match or not all_names:
            return {
                'confidence_score': 0.0,
                'status': 'Failed',
                'best_match': '',
                'all_scores': {},
                'match_field': 'Unknown'
            }

        # Normalize names for comparison
        normalized_search = self._normalize_for_comparison(name_to_match)

        # Calculate similarity scores for ALL names (applicants + inventors)
        all_scores = {}
        best_score = 0.0
        best_match = ''

        for name in all_names:
            if not name or name == 'N/A':
                continue

            normalized_name = self._normalize_for_comparison(name)

            # Calculate similarity score using configured algorithm
            if self.algorithm == 'token_sort_ratio':
                score = fuzz.token_sort_ratio(normalized_search, normalized_name)
            elif self.algorithm == 'token_set_ratio':
                score = fuzz.token_set_ratio(normalized_search, normalized_name)
            elif self.algorithm == 'partial_ratio':
                score = fuzz.partial_ratio(normalized_search, normalized_name)
            else:
                # Default to token_sort_ratio
                score = fuzz.token_sort_ratio(normalized_search, normalized_name)

            all_scores[name] = score

            if score > best_score:
                best_score = score
                best_match = name

        # Determine validation status based on best score
        if best_score >= self.min_similarity_score:
            status = 'Validated'
        elif best_score >= self.uncertain_threshold:
            status = 'Uncertain'
        else:
            status = 'Failed'

        # Determine which field had the best match (NEW)
        if best_match in applicant_names:
            match_field = 'Applicant'
        elif best_match in inventor_names:
            match_field = 'Inventor'
        else:
            match_field = 'Unknown'

        # Log validation details if enabled
        if self.log_details:
            self.logger.debug(
                f"Validation: '{name_to_match}' vs '{best_match}' ({match_field}) = {best_score:.1f}% ({status})"
            )

        return {
            'confidence_score': round(best_score, 1),
            'status': status,
            'best_match': best_match,
            'all_scores': all_scores,
            'match_field': match_field  # NEW
        }

    def validate_patent_strict(
        self,
        search_name: str,
        applicant_names: List[str],
        inventor_names: List[str] = None,
        search_variant_used: str = None
    ) -> Dict[str, Any]:
        """
        Strict validation using exact token matching.

        More restrictive than fuzzy matching - requires all search tokens
        to appear in the name. Now checks BOTH applicants AND inventors to properly
        filter out false positives like matching "Alfred Pte. Ltd." to "Dr. Alfred Smith".

        Args:
            search_name: The original company name being searched
            applicant_names: List of applicant names from the patent
            inventor_names: List of inventor names from the patent (NEW)
            search_variant_used: The search variant that found this patent (optional)

        Returns:
            Dictionary with validation results:
            {
                'confidence_score': float (0-100),
                'status': str ('Validated', 'Uncertain', 'Failed'),
                'best_match': str (name with highest score),
                'all_scores': dict (all scores),
                'match_field': str ('Applicant', 'Inventor', or 'Unknown')
            }

        Algorithm:
            - Normalizes both names (uppercase, remove extra spaces, remove periods)
            - Splits into tokens (words)
            - Calculates: (tokens_in_search_that_appear_in_applicant / total_search_tokens) * 100
            - Thresholds: ≥95% = Validated, 70-94% = Uncertain, <70% = Failed

        Examples:
            >>> validator.validate_patent_strict("ALFRED PTE LTD", ["ALFRED PTE LTD"])
            {'confidence_score': 100.0, 'status': 'Validated', ...}

            >>> validator.validate_patent_strict("ALFRED PTE LTD", ["DR ALFRED SMITH"])
            {'confidence_score': 33.3, 'status': 'Failed', ...}  # Only "ALFRED" matches
        """
        if not self.enabled:
            # If validation disabled, return high confidence by default
            return {
                'confidence_score': 100.0,
                'status': 'Not Validated',
                'best_match': applicant_names[0] if applicant_names else '',
                'all_scores': {},
                'match_field': 'Unknown'
            }

        # Use search variant if provided, otherwise use original search name
        name_to_match = search_variant_used if search_variant_used else search_name

        # Combine applicants and inventors for validation (NEW)
        inventor_names = inventor_names or []
        all_names = applicant_names + inventor_names

        if not name_to_match or not all_names:
            return {
                'confidence_score': 0.0,
                'status': 'Failed',
                'best_match': '',
                'all_scores': {},
                'match_field': 'Unknown'
            }

        # Normalize search name and split into tokens
        normalized_search = self._normalize_for_comparison(name_to_match)
        # Remove periods for token matching (PTE. LTD. → PTE LTD)
        normalized_search = normalized_search.replace('.', '')
        search_tokens = set(normalized_search.split())

        if not search_tokens:
            return {
                'confidence_score': 0.0,
                'status': 'Failed',
                'best_match': '',
                'all_scores': {}
            }

        # Calculate token overlap scores for ALL names (applicants + inventors)
        all_scores = {}
        best_score = 0.0
        best_match = ''

        for name in all_names:
            if not name or name == 'N/A':
                continue

            normalized_name = self._normalize_for_comparison(name)
            # Remove periods for token matching
            normalized_name = normalized_name.replace('.', '')
            name_tokens = set(normalized_name.split())

            # Calculate percentage of search tokens that appear in this name
            common_tokens = search_tokens & name_tokens
            score = (len(common_tokens) / len(search_tokens)) * 100

            all_scores[name] = score

            if score > best_score:
                best_score = score
                best_match = name

        # Determine validation status with strict thresholds
        if best_score >= 95:  # Almost all tokens must match (allows 1 missing in ~20 tokens)
            status = 'Validated'
        elif best_score >= 70:  # At least 70% of tokens match
            status = 'Uncertain'
        else:
            status = 'Failed'

        # Determine which field had the best match (NEW)
        if best_match in applicant_names:
            match_field = 'Applicant'
        elif best_match in inventor_names:
            match_field = 'Inventor'
        else:
            match_field = 'Unknown'

        # Log validation details if enabled
        if self.log_details:
            self.logger.debug(
                f"Strict Validation: '{name_to_match}' vs '{best_match}' ({match_field}) = {best_score:.1f}% ({status})"
            )

        return {
            'confidence_score': round(best_score, 1),
            'status': status,
            'best_match': best_match,
            'all_scores': all_scores,
            'match_field': match_field  # NEW
        }

    def validate_patents(
        self,
        search_name: str,
        patents: List[Dict[str, Any]],
        search_variant_used: str = None
    ) -> List[Dict[str, Any]]:
        """
        Validate multiple patents at once.

        Args:
            search_name: The original company name being searched
            patents: List of patent dictionaries (must have 'applicants' key)
            search_variant_used: The search variant that found these patents

        Returns:
            List of patents with validation info added:
            - 'validation_score': float
            - 'validation_status': str
            - 'validation_best_match': str

        Note:
            Modifies the input patent dictionaries in-place.
        """
        if not self.enabled:
            # If validation disabled, just add default values
            for patent in patents:
                patent['validation_score'] = 100.0
                patent['validation_status'] = 'Not Validated'
                patent['validation_best_match'] = ''
                patent['validation_match_field'] = 'Unknown'
            return patents

        # Determine which validation method to use
        validation_mode = self.config.get('validation_mode', 'fuzzy')

        for patent in patents:
            applicants = patent.get('applicants', [])
            inventors = patent.get('inventors', [])  # NEW: Also get inventors

            # Handle case where applicants is a string (already joined)
            if isinstance(applicants, str):
                applicants = [app.strip() for app in applicants.split(',') if app.strip()]

            # Handle case where inventors is a string (already joined) (NEW)
            if isinstance(inventors, str):
                inventors = [inv.strip() for inv in inventors.split(',') if inv.strip()]

            # Choose validation method based on mode
            if validation_mode == 'strict':
                validation_result = self.validate_patent_strict(
                    search_name,
                    applicants,
                    inventors,  # NEW: Pass inventors
                    search_variant_used
                )
            else:
                validation_result = self.validate_patent(
                    search_name,
                    applicants,
                    inventors,  # NEW: Pass inventors
                    search_variant_used
                )

            # Add validation info to patent
            patent['validation_score'] = validation_result['confidence_score']
            patent['validation_status'] = validation_result['status']
            patent['validation_best_match'] = validation_result['best_match']
            patent['validation_match_field'] = validation_result.get('match_field', 'Unknown')  # NEW

        return patents

    def _normalize_for_comparison(self, name: str) -> str:
        """
        Normalize name for fuzzy comparison.

        Removes extra whitespace and converts to uppercase.

        Args:
            name: Company or applicant name

        Returns:
            Normalized name for comparison
        """
        if not name:
            return ''

        # Convert to uppercase
        name = name.upper()

        # Normalize whitespace (collapse multiple spaces)
        name = ' '.join(name.split())

        return name.strip()

    def get_statistics(self, patents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate validation statistics for a set of patents.

        Args:
            patents: List of patents with validation info

        Returns:
            Dictionary with statistics:
            {
                'total': int,
                'validated': int,
                'uncertain': int,
                'failed': int,
                'average_score': float,
                'min_score': float,
                'max_score': float
            }
        """
        if not patents:
            return {
                'total': 0,
                'validated': 0,
                'uncertain': 0,
                'failed': 0,
                'not_validated': 0,
                'average_score': 0.0,
                'min_score': 0.0,
                'max_score': 0.0
            }

        scores = []
        validated = 0
        uncertain = 0
        failed = 0
        not_validated = 0

        for patent in patents:
            status = patent.get('validation_status', 'Not Validated')
            score = patent.get('validation_score', 0.0)

            if status == 'Validated':
                validated += 1
            elif status == 'Uncertain':
                uncertain += 1
            elif status == 'Failed':
                failed += 1
            else:
                not_validated += 1

            if score > 0:
                scores.append(score)

        return {
            'total': len(patents),
            'validated': validated,
            'uncertain': uncertain,
            'failed': failed,
            'not_validated': not_validated,
            'average_score': round(sum(scores) / len(scores), 1) if scores else 0.0,
            'min_score': round(min(scores), 1) if scores else 0.0,
            'max_score': round(max(scores), 1) if scores else 0.0
        }
