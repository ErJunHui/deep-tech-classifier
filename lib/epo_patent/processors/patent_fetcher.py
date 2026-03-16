"""Patent detail fetching and processing.

Coordinates fetching bibliographic data for individual patents.
"""

import time
import logging
from typing import Dict, Any
import xml.etree.ElementTree as ET
import requests

from .cpc_parser import extract_cpc_codes_from_xml


def fetch_patent_details(
    publication_number_str: str,
    country: str,
    doc_num: str,
    kind: str,
    original_search_name: str,
    epo_client,
    namespaces: Dict[str, str],
    country_code_map: Dict[str, str],
    detail_delay_seconds: int = 2,
    deeptech_classifier=None
) -> Dict[str, Any]:
    """
    Fetch bibliographic details for a patent publication.

    Args:
        publication_number_str: Full publication number (e.g., "US2023004963A1")
        country: Country code (e.g., "US")
        doc_num: Document number
        kind: Kind code
        original_search_name: Original company name from search
        epo_client: EPOClient instance
        namespaces: XML namespace dictionary
        country_code_map: Country code to name mapping
        detail_delay_seconds: Delay in seconds after processing

    Returns:
        Dictionary with patent details including:
        - original_search_name, publication_number, country_code, country_name
        - title, abstract, publication_date, application_date
        - applicants, inventors, cpc_codes
        - biblio_status, biblio_error_msg
    """
    logger = logging.getLogger(__name__)

    # Initialize patent data structure
    patent_data = {
        "original_search_name": original_search_name,
        "publication_number": publication_number_str,
        "country_code": country,
        "doc_number": doc_num,
        "kind_code": kind,
        "country_name": country_code_map.get(country, country),
        "title": "N/A",
        "publication_date": "N/A",
        "application_date": "N/A",
        "applicants": [],
        "inventors": [],
        "abstract": "N/A",
        "cpc_codes": [],
        "biblio_status": "Not Attempted",
        "biblio_error_msg": None,
        "validation_score": None,
        "validation_status": "Not Validated",
        "validation_best_match": "",
        "validation_match_field": "Unknown"
    }

    # Basic validation
    if not all([publication_number_str, country, doc_num]) or country == "N/A" or doc_num == "N/A":
        logger.warning(
            f"Skipping detail retrieval for incomplete components: "
            f"Country='{country}', DocNum='{doc_num}' (Pub: {publication_number_str})"
        )
        patent_data["biblio_status"] = "Skipped - Incomplete ID"
        time.sleep(detail_delay_seconds)
        return patent_data

    logger.info(f"  Processing Publication: {publication_number_str} ({patent_data['country_name']})")

    # --- 1. Fetch Bibliographic Data ---
    logger.info(f"    Retrieving bibliographic details...")
    try:
        biblio_xml_content = epo_client.get_biblio_data(country, doc_num, kind)

        if not biblio_xml_content:
            logger.warning("    Received empty biblio response")
            patent_data["biblio_status"] = "Error - Empty Response"
            return patent_data

        # Parse bibliographic XML
        detail_root = ET.fromstring(biblio_xml_content)

        # Find the main document container
        doc_element = detail_root.find('.//exchange:exchange-document', namespaces)
        if doc_element is None:
            doc_element = detail_root.find('.//exchange:bibliographic-data', namespaces)

        if doc_element is None:
            logger.warning("    Could not find 'exchange-document' or 'bibliographic-data' in biblio XML")
            patent_data["biblio_status"] = "Error - XML Structure"
            return patent_data

        # Extract bibliographic fields
        _extract_biblio_fields(doc_element, patent_data, namespaces)

        # Extract CPC codes
        patent_data["cpc_codes"] = extract_cpc_codes_from_xml(detail_root, namespaces)
        if patent_data["cpc_codes"]:
            logger.info(
                f"    Found {len(patent_data['cpc_codes'])} unique CPC codes: "
                f"{', '.join(patent_data['cpc_codes'])}"
            )
        else:
            logger.info(f"    No CPC codes found for {publication_number_str}")

        # --- Deep-tech Classification ---
        if deeptech_classifier is not None:
            classification = deeptech_classifier.classify_patent(patent_data["cpc_codes"])
            patent_data["deeptech_classification"] = classification

            if classification['is_deeptech']:
                logger.info(
                    f"    Deep-tech Classification: {classification['deeptech_level']} "
                    f"(Primary: {classification['primary_domain']}, Score: {classification['overall_score']})"
                )
        else:
            patent_data["deeptech_classification"] = None

        patent_data["biblio_status"] = "Success"
        logger.info(f"    Biblio details retrieved successfully")

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code
        reason = e.response.reason
        logger.error(f"    HTTP Error retrieving biblio details: {status_code} {reason}")
        patent_data["biblio_status"] = f"Error - HTTP {status_code}"
        patent_data["biblio_error_msg"] = f"{status_code} {reason}"
        time.sleep(detail_delay_seconds)
        return patent_data

    except ET.ParseError as e:
        logger.error(f"    Error parsing biblio detail XML: {e}")
        patent_data["biblio_status"] = "Error - XML Parse"
        patent_data["biblio_error_msg"] = str(e)
        time.sleep(detail_delay_seconds)
        return patent_data

    except Exception as e:
        logger.error(f"    Unexpected error during biblio retrieval/processing: {e}", exc_info=True)
        patent_data["biblio_status"] = "Error - Unexpected"
        patent_data["biblio_error_msg"] = str(e)
        time.sleep(detail_delay_seconds)
        return patent_data

    # Final delay before returning
    logger.debug(f"    {'='*40}")
    logger.debug(f"    (Waiting {detail_delay_seconds}s after processing {publication_number_str}...)")
    time.sleep(detail_delay_seconds)

    return patent_data


def _extract_biblio_fields(
    doc_element: ET.Element,
    patent_data: Dict[str, Any],
    namespaces: Dict[str, str]
) -> None:
    """
    Extract bibliographic fields from XML element into patent_data dictionary.

    Args:
        doc_element: XML element containing bibliographic data
        patent_data: Dictionary to update with extracted data
        namespaces: XML namespace dictionary
    """
    # Title (English)
    title_elems = doc_element.findall('.//exchange:invention-title[@lang="en"]', namespaces)
    if title_elems and title_elems[0].text:
        patent_data["title"] = title_elems[0].text.strip()

    # Abstract (English)
    abstract_elems = doc_element.findall('.//exchange:abstract[@lang="en"]', namespaces)
    if abstract_elems and abstract_elems[0] is not None:
        # Concatenate all text within abstract element
        abstract_text = "".join(abstract_elems[0].itertext()).strip()
        patent_data["abstract"] = abstract_text.replace('\n', ' ').replace('\r', '')

    # Publication date
    pub_date_elem = doc_element.find('.//exchange:publication-reference//exchange:date', namespaces)
    if pub_date_elem is not None and pub_date_elem.text:
        patent_data["publication_date"] = pub_date_elem.text

    # Application date
    app_date_elem = doc_element.find('.//exchange:application-reference//exchange:date', namespaces)
    if app_date_elem is not None and app_date_elem.text:
        patent_data["application_date"] = app_date_elem.text

    # Applicants
    applicant_elements = doc_element.findall(
        './/exchange:applicants//exchange:applicant//exchange:name',
        namespaces
    )
    patent_data["applicants"] = [elem.text.strip() for elem in applicant_elements if elem.text]

    # Inventors
    inventor_elements = doc_element.findall(
        './/exchange:inventors//exchange:inventor//exchange:name',
        namespaces
    )
    patent_data["inventors"] = [elem.text.strip() for elem in inventor_elements if elem.text]
