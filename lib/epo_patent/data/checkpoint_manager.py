"""Checkpoint manager for incremental saves and resume capability.

Allows saving progress periodically and resuming from checkpoints if interrupted.
"""

import json
import os
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import pandas as pd


class CheckpointManager:
    """Manages checkpoints for incremental saves and resume capability."""

    def __init__(self, checkpoint_dir: str, run_id: str = None):
        """
        Initialize checkpoint manager.

        Args:
            checkpoint_dir: Directory to store checkpoints
            run_id: Unique run identifier (generated if None)
        """
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.run_id = run_id or self._generate_run_id()
        self.checkpoint_number = 0
        self.logger = logging.getLogger(__name__)

    def _generate_run_id(self) -> str:
        """Generate unique run ID with timestamp and random component."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        return f"{timestamp}_{unique_id}"

    def save_checkpoint(
        self,
        summary_df: pd.DataFrame,
        details_list: List[Dict],
        last_index: int,
        total_companies: int,
        statistics: Dict[str, Any] = None
    ) -> str:
        """
        Save checkpoint to disk with atomic write.

        Args:
            summary_df: Current summary DataFrame
            details_list: List of patent detail dictionaries
            last_index: Index of last processed company
            total_companies: Total number of companies to process
            statistics: Optional additional statistics

        Returns:
            Checkpoint file path
        """
        self.checkpoint_number += 1

        checkpoint_data = {
            "checkpoint_metadata": {
                "run_id": self.run_id,
                "checkpoint_timestamp": datetime.now().isoformat(),
                "checkpoint_number": self.checkpoint_number,
                "last_processed_index": last_index,
                "total_companies": total_companies
            },
            "summary_data": {
                "columns": summary_df.columns.tolist(),
                "index_name": summary_df.index.name,
                "data": summary_df.to_dict('records')
            },
            "patent_details": details_list,
            "statistics": statistics or {}
        }

        # Generate filename
        filename = f"checkpoint_{self.run_id}_{self.checkpoint_number:03d}.json"
        filepath = self.checkpoint_dir / filename

        # Atomic write: write to temp file, then rename
        temp_filepath = filepath.with_suffix('.tmp')

        try:
            with open(temp_filepath, 'w', encoding='utf-8') as f:
                json.dump(checkpoint_data, f, indent=2, default=str)

            # Atomic rename
            temp_filepath.replace(filepath)

            self.logger.info(
                f"Checkpoint saved: {filename} "
                f"(processed {last_index + 1}/{total_companies} companies)"
            )

            return str(filepath)

        except Exception as e:
            self.logger.error(f"Failed to save checkpoint: {e}")
            # Clean up temp file if it exists
            if temp_filepath.exists():
                temp_filepath.unlink()
            raise

    def load_checkpoint(self, run_id: str = None) -> Optional[Dict[str, Any]]:
        """
        Load most recent checkpoint.

        Args:
            run_id: Specific run ID to load (loads most recent if None)

        Returns:
            Dictionary with checkpoint data:
            - summary_df: Reconstructed DataFrame
            - details_list: List of patent details
            - last_index: Last processed index
            - total_companies: Total companies
            - statistics: Statistics dict
            - metadata: Checkpoint metadata
            Returns None if no checkpoint found
        """
        # Find checkpoint files
        if run_id:
            pattern = f"checkpoint_{run_id}_*.json"
        else:
            pattern = "checkpoint_*.json"

        checkpoint_files = sorted(self.checkpoint_dir.glob(pattern))

        if not checkpoint_files:
            self.logger.info("No checkpoint files found")
            return None

        # Load most recent
        latest_checkpoint = checkpoint_files[-1]
        self.logger.info(f"Loading checkpoint from: {latest_checkpoint.name}")

        try:
            with open(latest_checkpoint, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Migrate old checkpoints: ensure all validation fields exist
            validation_defaults = {
                'validation_score': None,
                'validation_status': 'Not Validated',
                'validation_best_match': '',
                'validation_match_field': 'Unknown'
            }
            for patent in data['patent_details']:
                for field, default in validation_defaults.items():
                    if field not in patent:
                        patent[field] = default

            # Reconstruct DataFrame
            summary_df = pd.DataFrame(
                data['summary_data']['data'],
                columns=data['summary_data']['columns']
            )
            summary_df.index.name = data['summary_data']['index_name']

            # Update run_id to match loaded checkpoint
            self.run_id = data['checkpoint_metadata']['run_id']
            self.checkpoint_number = data['checkpoint_metadata']['checkpoint_number']

            return {
                'summary_df': summary_df,
                'details_list': data['patent_details'],
                'last_index': data['checkpoint_metadata']['last_processed_index'],
                'total_companies': data['checkpoint_metadata']['total_companies'],
                'statistics': data.get('statistics', {}),
                'metadata': data['checkpoint_metadata']
            }

        except Exception as e:
            self.logger.error(f"Failed to load checkpoint from {latest_checkpoint}: {e}")
            return None

    def list_checkpoints(self) -> List[Dict[str, Any]]:
        """
        List all available checkpoint files with metadata.

        Returns:
            List of dictionaries with checkpoint information
        """
        checkpoint_files = sorted(self.checkpoint_dir.glob("checkpoint_*.json"))

        checkpoints = []
        for filepath in checkpoint_files:
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    checkpoints.append({
                        'filepath': str(filepath),
                        'filename': filepath.name,
                        'metadata': data['checkpoint_metadata']
                    })
            except Exception as e:
                self.logger.warning(f"Could not read checkpoint {filepath}: {e}")

        return checkpoints

    def is_checkpoint_available(self, run_id: str = None) -> bool:
        """
        Check if resumable checkpoint exists.

        Args:
            run_id: Specific run ID to check, or None for any checkpoint

        Returns:
            True if checkpoint exists, False otherwise
        """
        if run_id:
            pattern = f"checkpoint_{run_id}_*.json"
        else:
            pattern = "checkpoint_*.json"

        return len(list(self.checkpoint_dir.glob(pattern))) > 0

    def cleanup(self, run_id: str = None):
        """
        Remove checkpoint files after successful completion.

        Args:
            run_id: Specific run ID to clean up, or None to clean up current run
        """
        if run_id:
            pattern = f"checkpoint_{run_id}_*.json"
        else:
            pattern = f"checkpoint_{self.run_id}_*.json"

        removed_count = 0
        for filepath in self.checkpoint_dir.glob(pattern):
            try:
                filepath.unlink()
                removed_count += 1
            except Exception as e:
                self.logger.warning(f"Could not remove checkpoint {filepath}: {e}")

        if removed_count > 0:
            self.logger.info(f"Cleaned up {removed_count} checkpoint file(s)")

    def get_latest_run_id(self) -> Optional[str]:
        """
        Get the run ID of the most recent checkpoint.

        Returns:
            Run ID string or None if no checkpoints exist
        """
        checkpoint_files = sorted(self.checkpoint_dir.glob("checkpoint_*.json"))

        if not checkpoint_files:
            return None

        latest_checkpoint = checkpoint_files[-1]

        try:
            with open(latest_checkpoint, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data['checkpoint_metadata']['run_id']
        except Exception as e:
            self.logger.warning(f"Could not read run_id from {latest_checkpoint}: {e}")
            return None
