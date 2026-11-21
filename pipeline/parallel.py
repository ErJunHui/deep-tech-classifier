"""
Worker pool for per-company work.

run_indexed runs work(i) for each index on a thread pool and calls record(i, result)
on the calling thread as each one finishes, so everything record touches (results
lists, checkpoints, counters) stays single-threaded. With one worker it is a plain
loop and no thread is created.
"""

from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Any, Callable, Dict, Iterable, TypeVar

T = TypeVar("T")

DEFAULT_WORKERS = 8
MAX_WORKERS = 32
DEFAULT_BATCH_MIN_COMPANIES = 100


def workers_from(config: Dict[str, Any]) -> int:
    """config["concurrency"]["workers"], clamped to 1..MAX_WORKERS; default when missing or not an integer."""
    section = config.get("concurrency") if isinstance(config, dict) else None
    value = section.get("workers", DEFAULT_WORKERS) if isinstance(section, dict) else DEFAULT_WORKERS
    if not isinstance(value, int) or isinstance(value, bool):
        value = DEFAULT_WORKERS
    return max(1, min(MAX_WORKERS, value))


def run_indexed(
    indices: Iterable[int],
    work: Callable[[int], T],
    record: Callable[[int, T], None],
    workers: int,
) -> None:
    """Run work(i) for every index and record(i, result) on this thread as each finishes.

    workers <= 1 runs inline, in the given order. If work or record raises anything
    (KeyboardInterrupt included), work not yet started is cancelled, work already
    running is left to finish with its result discarded, and the exception is re-raised.
    """
    if workers <= 1:
        for i in indices:
            record(i, work(i))
        return

    executor = ThreadPoolExecutor(max_workers=workers)
    try:
        pending = {executor.submit(work, i): i for i in indices}
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                i = pending.pop(future)
                record(i, future.result())
    except BaseException:
        executor.shutdown(wait=True, cancel_futures=True)
        raise
    executor.shutdown(wait=True)
