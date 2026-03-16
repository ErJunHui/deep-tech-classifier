"""Excel input file reading.

Reads company names from Excel files for patent search.
"""

import logging
from typing import List
import pandas as pd


def read_company_names_from_excel(
    filename: str,
    sheet_name: str = 'Sheet1',
    column_name: str = 'Company Name'
) -> List[str]:
    """
    Read company names from a specified Excel file and column.

    Args:
        filename: Path to Excel file
        sheet_name: Name of the sheet containing company names (default: 'Sheet1')
        column_name: Header name of the column with company names (default: 'Company Name')

    Returns:
        List of company name strings (non-empty, stripped)

    Raises:
        FileNotFoundError: If Excel file doesn't exist
        ValueError: If column is not found in the sheet
    """
    logger = logging.getLogger(__name__)

    try:
        # Read Excel file
        df = pd.read_excel(filename, sheet_name=sheet_name)

        # Check if column exists
        if column_name not in df.columns:
            logger.error(
                f"Column '{column_name}' not found in sheet '{sheet_name}' of '{filename}'"
            )
            logger.error(f"Available columns are: {list(df.columns)}")
            raise ValueError(
                f"Column '{column_name}' not found. "
                f"Available columns: {list(df.columns)}"
            )

        # Extract company names
        company_list = df[column_name].dropna().astype(str).str.strip().tolist()

        # Filter out empty strings
        company_list = [name for name in company_list if name]

        if not company_list:
            logger.warning(
                f"No valid company names found in column '{column_name}' of '{filename}'"
            )
            return []

        logger.info(
            f"Successfully read {len(company_list)} company names from '{filename}' "
            f"(Sheet: '{sheet_name}', Column: '{column_name}')"
        )

        return company_list

    except FileNotFoundError:
        logger.error(f"Input Excel file not found at '{filename}'. Please check the path.")
        raise

    except Exception as e:
        logger.error(
            f"An unexpected error occurred while reading '{filename}': {e}",
            exc_info=True
        )
        raise
