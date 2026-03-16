"""Excel output file writing.

Saves patent search results to multi-sheet Excel files with formatting.
"""

import logging
from typing import List, Dict, Any
import pandas as pd

from processors.cpc_parser import generate_cpc_reference_data
from processors.cpc_description_lookup import CPCDescriptionLookup


def _write_deeptech_analysis_sheet(writer, details_df: pd.DataFrame, workbook) -> None:
    """
    Write Deep-Tech Analysis sheet with statistics and visualizations.

    Args:
        writer: Excel writer object
        details_df: DataFrame with patent details including deep-tech fields
        workbook: Workbook object for formatting
    """
    logger = logging.getLogger(__name__)

    analysis_sheet = workbook.add_worksheet('Deep-Tech Analysis')

    # Header format
    header_fmt = workbook.add_format({'bold': True, 'font_size': 12, 'bg_color': '#4472C4', 'font_color': 'white'})
    label_fmt = workbook.add_format({'bold': True})
    number_fmt = workbook.add_format({'num_format': '#,##0'})

    row = 0

    # Section 1: Overall Statistics
    analysis_sheet.write(row, 0, "DEEP-TECH PATENT STATISTICS", header_fmt)
    row += 2

    total_patents = len(details_df)
    deeptech_patents = details_df['is_deeptech'].sum() if 'is_deeptech' in details_df.columns else 0
    deeptech_pct = (deeptech_patents / total_patents * 100) if total_patents > 0 else 0

    stats = [
        ("Total Patents Processed", total_patents),
        ("Deep-tech Patents", deeptech_patents),
        ("Deep-tech Percentage", f"{deeptech_pct:.1f}%"),
        ("", ""),
    ]

    # Add breakdown by level if deeptech_level column exists
    if 'deeptech_level' in details_df.columns:
        stats.extend([
            ("Very Strong Deep-tech", (details_df['deeptech_level'] == 'Very Strong').sum()),
            ("Strong Deep-tech", (details_df['deeptech_level'] == 'Strong').sum()),
            ("Moderate Deep-tech", (details_df['deeptech_level'] == 'Moderate').sum()),
        ])

    analysis_sheet.write(row, 0, "Metric", label_fmt)
    analysis_sheet.write(row, 1, "Value", label_fmt)
    row += 1

    for metric, value in stats:
        analysis_sheet.write(row, 0, metric)
        if isinstance(value, int):
            analysis_sheet.write(row, 1, value, number_fmt)
        else:
            analysis_sheet.write(row, 1, value)
        row += 1

    # Section 2: Domain Distribution
    if 'primary_domain' in details_df.columns:
        row += 2
        analysis_sheet.write(row, 0, "DOMAIN DISTRIBUTION", header_fmt)
        row += 2

        # Count primary domains (excluding N/A)
        domain_counts = details_df[details_df['primary_domain'] != 'N/A']['primary_domain'].value_counts()

        analysis_sheet.write(row, 0, "Domain", label_fmt)
        analysis_sheet.write(row, 1, "Patent Count", label_fmt)
        analysis_sheet.write(row, 2, "Percentage", label_fmt)
        row += 1

        for domain, count in domain_counts.items():
            pct = (count / total_patents * 100) if total_patents > 0 else 0
            analysis_sheet.write(row, 0, domain)
            analysis_sheet.write(row, 1, count, number_fmt)
            analysis_sheet.write(row, 2, f"{pct:.1f}%")
            row += 1

    # Set column widths
    analysis_sheet.set_column('A:A', 30)
    analysis_sheet.set_column('B:B', 15)
    analysis_sheet.set_column('C:C', 15)

    logger.info("Deep-Tech Analysis sheet created")


def save_results_to_excel(
    summary_df: pd.DataFrame,
    details_list: List[Dict[str, Any]],
    filename: str
) -> None:
    """
    Save patent search results to a multi-sheet Excel file.

    Creates three sheets:
    1. Summary: Overview of all companies searched
    2. Patent Details: Detailed information for all patents found
    3. CPC Reference: Breakdown of unique CPC codes

    Args:
        summary_df: DataFrame with summary information
        details_list: List of patent detail dictionaries
        filename: Output Excel file path

    Raises:
        Exception: If file writing fails
    """
    logger = logging.getLogger(__name__)
    logger.info(f"Attempting to save results to: {filename}")

    try:
        unique_cpc_codes = set()
        cpc_lookup = None

        # Initialize CPC description lookup
        try:
            cpc_lookup = CPCDescriptionLookup()
            logger.info("Initialized CPC description lookup for Patent Details")
        except Exception as e:
            logger.warning(f"Could not initialize CPC description lookup: {e}")

        # Convert details list to DataFrame
        if details_list:
            details_df = pd.DataFrame(details_list)

            # Extract deep-tech classification fields
            if 'deeptech_classification' in details_df.columns:
                details_df['is_deeptech'] = details_df['deeptech_classification'].apply(
                    lambda x: x['is_deeptech'] if isinstance(x, dict) else False
                )
                details_df['deeptech_level'] = details_df['deeptech_classification'].apply(
                    lambda x: x['deeptech_level'] if isinstance(x, dict) else 'N/A'
                )
                details_df['deeptech_score'] = details_df['deeptech_classification'].apply(
                    lambda x: x['overall_score'] if isinstance(x, dict) else 0
                )
                details_df['primary_domain'] = details_df['deeptech_classification'].apply(
                    lambda x: x['primary_domain'] if isinstance(x, dict) else 'N/A'
                )
                details_df['secondary_domains'] = details_df['deeptech_classification'].apply(
                    lambda x: ', '.join(x['secondary_domains']) if isinstance(x, dict) and x.get('secondary_domains') else ''
                )
                details_df['domain_tags'] = details_df['deeptech_classification'].apply(
                    lambda x: '; '.join([x['primary_domain']] + x['secondary_domains'])
                             if isinstance(x, dict) and x.get('primary_domain') != 'N/A' else ''
                )

                # Drop the raw classification column
                details_df = details_df.drop('deeptech_classification', axis=1)

            # Define column order for Patent Details sheet
            cols_order = [
                "original_search_name",
                # Search variant tracking
                "search_variant_used", "search_variants_attempted",
                # Search validation
                "validation_score", "validation_status", "validation_best_match", "validation_match_field",
                # Patent identifiers
                "publication_number", "country_code", "country_name",
                "doc_number", "kind_code", "title", "publication_date", "application_date",
                "applicants", "inventors", "abstract",
                "cpc_codes",  # CPC codes column
                "cpc_descriptions",  # CPC descriptions column
                # Deep-tech columns
                "is_deeptech", "deeptech_level", "deeptech_score",
                "primary_domain", "secondary_domains", "domain_tags",
                # Status columns
                "biblio_status",
                "biblio_error_msg"
            ]

            # Convert list columns to strings for Excel
            for col in ['applicants', 'inventors', 'cpc_codes']:
                if col in details_df.columns:
                    details_df[col] = details_df[col].apply(
                        lambda x: ', '.join(map(str, x)) if isinstance(x, list) else str(x) if x is not None else ''
                    )

                    # Collect unique CPC codes
                    if col == 'cpc_codes':
                        for codes_str in details_df[col].dropna():
                            if codes_str:
                                unique_cpc_codes.update(c.strip() for c in codes_str.split(',') if c.strip())

            # Add CPC descriptions column
            if 'cpc_codes' in details_df.columns and cpc_lookup:
                def get_descriptions(cpc_codes_str):
                    """Get comma-separated descriptions for CPC codes."""
                    if not cpc_codes_str or pd.isna(cpc_codes_str):
                        return ''
                    codes = [c.strip() for c in str(cpc_codes_str).split(',') if c.strip()]
                    descriptions = [cpc_lookup.lookup(code) for code in codes]
                    return '; '.join(descriptions)

                details_df['cpc_descriptions'] = details_df['cpc_codes'].apply(get_descriptions)
                logger.info("Added CPC descriptions column to Patent Details")
            elif 'cpc_codes' in details_df.columns:
                details_df['cpc_descriptions'] = '(Description lookup not available)'
                logger.warning("CPC lookup not available, using placeholder")
        else:
            details_df = pd.DataFrame()

        # Write to Excel with xlsxwriter engine for formatting
        with pd.ExcelWriter(filename, engine='xlsxwriter') as writer:
            workbook = writer.book

            # --- Write Summary Sheet ---
            logger.info("Writing Summary sheet...")
            summary_df_to_write = summary_df.copy()
            summary_df_to_write.to_excel(writer, sheet_name='Summary', index=True, freeze_panes=(1, 1))
            summary_sheet = writer.sheets['Summary']

            # Auto-adjust column widths for Summary
            temp_summary = summary_df_to_write.reset_index()
            for idx, col in enumerate(temp_summary.columns):
                header_len = len(str(col))
                try:
                    if not temp_summary[col].empty:
                        max_data_len = temp_summary[col].astype(str).map(len).max()
                        if pd.isna(max_data_len):
                            max_data_len = 0
                    else:
                        max_data_len = 0
                    max_len = max(header_len, int(max_data_len)) + 2
                    summary_sheet.set_column(idx, idx, max_len)
                except Exception as width_err:
                    logger.warning(
                        f"Could not auto-set width for summary column '{col}': {width_err}. "
                        f"Setting default width."
                    )
                    summary_sheet.set_column(idx, idx, 15)

            # --- Write Patent Details Sheet ---
            logger.info("Writing Patent Details sheet...")
            if not details_df.empty:
                details_df.to_excel(writer, sheet_name='Patent Details', index=False, freeze_panes=(1, 0))
                details_sheet = writer.sheets['Patent Details']

                # Set column widths for Patent Details
                details_sheet.set_column('A:A', 30)   # original_search_name
                details_sheet.set_column('B:B', 30)   # search_variant_used
                details_sheet.set_column('C:C', 15)   # search_variants_attempted
                details_sheet.set_column('D:D', 12)   # validation_score
                details_sheet.set_column('E:E', 15)   # validation_status
                details_sheet.set_column('F:F', 30)   # validation_best_match
                details_sheet.set_column('G:G', 15)   # validation_match_field (NEW)
                details_sheet.set_column('H:H', 20)   # publication_number
                details_sheet.set_column('I:J', 15)   # country_code, country_name
                details_sheet.set_column('K:L', 15)   # doc_number, kind_code
                details_sheet.set_column('M:M', 50)   # title
                details_sheet.set_column('N:O', 15)   # publication_date, application_date
                details_sheet.set_column('P:P', 40)   # applicants
                details_sheet.set_column('Q:Q', 40)   # inventors
                details_sheet.set_column('R:R', 60)   # abstract
                details_sheet.set_column('S:S', 35)   # cpc_codes
                details_sheet.set_column('T:T', 50)   # cpc_descriptions
                # Deep-tech columns
                details_sheet.set_column('U:U', 12)   # is_deeptech
                details_sheet.set_column('V:V', 18)   # deeptech_level
                details_sheet.set_column('W:W', 12)   # deeptech_score
                details_sheet.set_column('X:X', 25)   # primary_domain
                details_sheet.set_column('Y:Y', 30)   # secondary_domains
                details_sheet.set_column('Z:Z', 35)   # domain_tags
                # Status columns
                details_sheet.set_column('AA:AA', 20)   # biblio_status
                details_sheet.set_column('AB:AB', 30)   # biblio_error_msg
            else:
                logger.info("No detailed patent information collected. Writing placeholder message.")
                no_details_sheet = workbook.add_worksheet('Patent Details')
                no_details_sheet.write(0, 0, "No detailed patent information was collected.")

            # --- Write CPC Reference Sheet ---
            logger.info("Writing CPC Reference sheet...")
            if unique_cpc_codes:
                cpc_ref_data = generate_cpc_reference_data(list(unique_cpc_codes), cpc_lookup)

                cpc_ref_df = pd.DataFrame(cpc_ref_data)
                cpc_ref_df.to_excel(writer, sheet_name='CPC Reference', index=False, freeze_panes=(1, 0))
                cpc_ref_sheet = writer.sheets['CPC Reference']

                # Set header format
                header_format = workbook.add_format({'bold': True, 'text_wrap': True, 'valign': 'top'})
                for col_num, value in enumerate(cpc_ref_df.columns):
                    cpc_ref_sheet.write(0, col_num, value, header_format)

                # Set column widths for CPC Reference
                cpc_ref_sheet.set_column('A:A', 20)  # CPC Code
                cpc_ref_sheet.set_column('B:B', 10)  # Section
                cpc_ref_sheet.set_column('C:C', 10)  # Class
                cpc_ref_sheet.set_column('D:D', 10)  # Subclass
                cpc_ref_sheet.set_column('E:E', 12)  # Main Group
                cpc_ref_sheet.set_column('F:F', 12)  # Subgroup
                cpc_ref_sheet.set_column('G:G', 40)  # Description Placeholder

                logger.info(f"CPC Reference sheet created with {len(unique_cpc_codes)} unique codes")
            else:
                logger.info("No unique CPC codes found to create reference sheet.")
                no_cpc_sheet = workbook.add_worksheet('CPC Reference')
                no_cpc_sheet.write(0, 0, "No CPC codes were found in the processed patent details.")

            # --- Write Deep-Tech Analysis Sheet ---
            if not details_df.empty and 'is_deeptech' in details_df.columns:
                logger.info("Writing Deep-Tech Analysis sheet...")
                _write_deeptech_analysis_sheet(writer, details_df, workbook)

        logger.info(f"Successfully saved results to '{filename}'")

    except Exception as e:
        logger.error(f"Failed to save results to Excel file '{filename}': {e}", exc_info=True)
        raise
