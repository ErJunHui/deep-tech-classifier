"""CPC (Cooperative Patent Classification) code parsing and extraction.

Handles parsing CPC codes from XML and breaking them down into components.
"""

import re
import logging
from typing import Dict, List, Optional
import xml.etree.ElementTree as ET
from processors.cpc_description_lookup import CPCDescriptionLookup


def parse_cpc_code(cpc_string: str) -> Dict[str, str]:
    """
    Parse CPC code string into its components.

    CPC code format: [Section][Class][Subclass] [Main Group]/[Subgroup]
    Example: G06Q 20/3827 -> Section: G, Class: 06, Subclass: Q, Main Group: 20, Subgroup: 3827

    Args:
        cpc_string: CPC code string (e.g., "G06Q 20/3827")

    Returns:
        Dictionary with components:
        - section: Single letter (A-H, Y)
        - class: Two digits
        - subclass: Single letter
        - main_group: Digits before slash
        - subgroup: Digits after slash (or 'N/A' if not present)
    """
    if not cpc_string or not isinstance(cpc_string, str):
        return {
            'section': 'N/A',
            'class': 'N/A',
            'subclass': 'N/A',
            'main_group': 'N/A',
            'subgroup': 'N/A'
        }

    cpc_string = cpc_string.strip()
    parsed = {
        'section': 'N/A',
        'class': 'N/A',
        'subclass': 'N/A',
        'main_group': 'N/A',
        'subgroup': 'N/A'
    }

    # Pattern 1: Full CPC with subgroup (e.g., "G06Q 20/3827")
    # Includes Y section for cross-reference codes
    match_full = re.match(r'^([A-HY])(\d{2})([A-Z])\s*(\d+)\s*/\s*(\d+)$', cpc_string)

    if match_full:
        parsed['section'] = match_full.group(1)
        parsed['class'] = match_full.group(2)
        parsed['subclass'] = match_full.group(3)
        parsed['main_group'] = match_full.group(4)
        parsed['subgroup'] = match_full.group(5)
    else:
        # Pattern 2: CPC without subgroup (e.g., "G06Q 20")
        match_no_subgroup = re.match(r'^([A-HY])(\d{2})([A-Z])\s*(\d+)$', cpc_string)
        if match_no_subgroup:
            parsed['section'] = match_no_subgroup.group(1)
            parsed['class'] = match_no_subgroup.group(2)
            parsed['subclass'] = match_no_subgroup.group(3)
            parsed['main_group'] = match_no_subgroup.group(4)
            # Subgroup remains 'N/A'
        else:
            # Could not parse - log warning
            logging.warning(f"Could not parse CPC code format: {cpc_string}")

    return parsed


def extract_cpc_codes_from_xml(
    xml_element: ET.Element,
    namespaces: Dict[str, str]
) -> List[str]:
    """
    Extract and reconstruct CPC codes from bibliographic XML element.

    Args:
        xml_element: XML element containing bibliographic data
        namespaces: XML namespace dictionary

    Returns:
        List of reconstructed CPC code strings (e.g., ['G06Q 20/3827', 'H04L 9/50'])
    """
    cpc_symbols = []
    logger = logging.getLogger(__name__)

    # Find all patent-classification elements
    all_patent_classification_elements = xml_element.findall(
        './/exchange:patent-classification',
        namespaces
    )

    logger.debug(f"Found {len(all_patent_classification_elements)} patent-classification elements")

    # Filter for CPCI scheme and reconstruct CPC codes
    for pc_elem in all_patent_classification_elements:
        # Check if this element has the CPCI scheme
        scheme_elem = pc_elem.find('./exchange:classification-scheme[@scheme="CPCI"]', namespaces)

        if scheme_elem is not None:
            # Extract components
            section_elem = pc_elem.find('./exchange:section', namespaces)
            class_elem = pc_elem.find('./exchange:class', namespaces)
            subclass_elem = pc_elem.find('./exchange:subclass', namespaces)
            maingroup_elem = pc_elem.find('./exchange:main-group', namespaces)
            subgroup_elem = pc_elem.find('./exchange:subgroup', namespaces)

            section = section_elem.text.strip() if section_elem is not None and section_elem.text else ''
            cls = class_elem.text.strip() if class_elem is not None and class_elem.text else ''
            subcls = subclass_elem.text.strip() if subclass_elem is not None and subclass_elem.text else ''
            maingrp = maingroup_elem.text.strip() if maingroup_elem is not None and maingroup_elem.text else ''
            subgrp = subgroup_elem.text.strip() if subgroup_elem is not None and subgroup_elem.text else None

            # Reconstruct the CPC code
            if section and cls and subcls and maingrp:
                if subgrp:
                    cpc_string = f"{section}{cls}{subcls} {maingrp}/{subgrp}"
                else:
                    cpc_string = f"{section}{cls}{subcls} {maingrp}"
                cpc_symbols.append(cpc_string)
                logger.debug(f"Reconstructed CPC: {cpc_string}")
            else:
                logger.debug("Skipped CPC reconstruction due to missing core components")

    # Return unique, sorted CPC codes
    return sorted(list(set(cpc_symbols)))


def generate_cpc_reference_data(unique_cpc_codes: List[str],
                               description_lookup: Optional[CPCDescriptionLookup] = None) -> List[Dict[str, str]]:
    """
    Generate CPC reference sheet data from unique CPC codes.

    Args:
        unique_cpc_codes: List of unique CPC code strings
        description_lookup: Optional CPCDescriptionLookup instance for getting descriptions.
                          If None, a new instance will be created.

    Returns:
        List of dictionaries suitable for DataFrame creation, with columns:
        - CPC Code
        - Section
        - Class
        - Subclass
        - Main Group
        - Subgroup
        - Description
    """
    logger = logging.getLogger(__name__)
    cpc_ref_data = []

    # Initialize description lookup if not provided
    if description_lookup is None:
        try:
            description_lookup = CPCDescriptionLookup()
            logger.info("Initialized CPC description lookup")
        except Exception as e:
            logger.warning(f"Could not initialize CPC description lookup: {e}")
            description_lookup = None

    # Sort codes for consistent order
    sorted_codes = sorted(unique_cpc_codes)

    for code in sorted_codes:
        parsed = parse_cpc_code(code)

        # Get description using lookup
        if description_lookup:
            description = description_lookup.lookup(code)
        else:
            description = '(Description lookup not available)'

        cpc_ref_data.append({
            'CPC Code': code,
            'Section': parsed['section'],
            'Class': parsed['class'],
            'Subclass': parsed['subclass'],
            'Main Group': parsed['main_group'],
            'Subgroup': parsed['subgroup'],
            'Description': description
        })

    return cpc_ref_data
