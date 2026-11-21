"""Worker-pool helper tests:  python -m unittest discover tests"""

import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.parallel import run_indexed, workers_from  # noqa: E402


class RunIndexedTests(unittest.TestCase):
    def test_every_index_is_recorded_once_with_its_own_result(self):
        # work sleeps (5 - i) * 0.01 so later indices finish first
        seen = {}
        run_indexed(range(5), lambda i: (time.sleep((5 - i) * 0.01), i * 10)[1], seen.__setitem__, workers=4)
        self.assertEqual(seen, {0: 0, 1: 10, 2: 20, 3: 30, 4: 40})

    def test_record_runs_on_the_calling_thread(self):
        threads = set()
        run_indexed(range(4), lambda i: i, lambda i, r: threads.add(threading.get_ident()), workers=4)
        self.assertEqual(threads, {threading.get_ident()})

    def test_one_worker_runs_inline_and_in_order(self):
        order, work_threads = [], set()
        run_indexed([2, 0, 1], lambda i: work_threads.add(threading.get_ident()) or i,
                    lambda i, r: order.append(i), workers=1)
        self.assertEqual(order, [2, 0, 1])
        self.assertEqual(work_threads, {threading.get_ident()})

    def test_error_in_work_stops_recording_and_is_raised(self):
        # index 0 raises immediately; 20 indices, 2 workers
        recorded = []
        def work(i):
            if i == 0:
                raise KeyboardInterrupt()
            time.sleep(0.02)
            return i
        with self.assertRaises(KeyboardInterrupt):
            run_indexed(range(20), work, lambda i, r: recorded.append(i), workers=2)
        self.assertLess(len(recorded), 20)

    def test_error_in_record_is_raised_and_nothing_is_recorded_after_it(self):
        recorded = []
        def record(i, r):
            recorded.append(i)
            raise RuntimeError("drift")
        with self.assertRaisesRegex(RuntimeError, "drift"):
            run_indexed(range(10), lambda i: i, record, workers=4)
        self.assertEqual(len(recorded), 1)


def _executor_that_opens(gate):
    """A ThreadPoolExecutor whose shutdown cancels queued work, then opens gate, then waits.

    Work that blocks on gate cannot finish, and so cannot free its worker for the next
    queued index, until run_indexed has shut the pool down. That makes the number of
    work calls after an error exact rather than a matter of timing.
    """
    class GatedExecutor(ThreadPoolExecutor):
        def shutdown(self, wait=True, *, cancel_futures=False):
            super().shutdown(wait=False, cancel_futures=cancel_futures)
            gate.set()
            if wait:
                super().shutdown(wait=True)
    return GatedExecutor


class RunIndexedCancellationTests(unittest.TestCase):
    """20 indices, 2 workers, index 0 raises. Every other index blocks until shutdown."""

    def run_until_index_0_fails(self):
        gate = threading.Event()
        lock = threading.Lock()
        self.calls = 0
        self.started, self.finished, self.recorded = set(), set(), []

        def work(i):
            with lock:
                self.calls += 1
                self.started.add(i)
            try:
                if i == 0:
                    raise RuntimeError("boom")
                gate.wait(timeout=5)  # safety net only; shutdown opens the gate
                time.sleep(0.05)      # still running for a while after the gate opens
                return i
            finally:
                with lock:
                    self.finished.add(i)

        with mock.patch("pipeline.parallel.ThreadPoolExecutor", _executor_that_opens(gate)):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                run_indexed(range(20), work, lambda i, r: self.recorded.append(i), workers=2)
            # taken straight after the raise, before anything else can finish
            with lock:
                self.started_at_raise = set(self.started)
                self.finished_at_raise = set(self.finished)

    def test_queued_work_is_cancelled(self):
        self.run_until_index_0_fails()
        self.assertLessEqual(self.calls, 4)

    def test_running_work_has_finished_when_the_error_is_raised(self):
        self.run_until_index_0_fails()
        self.assertEqual(self.started_at_raise, self.finished_at_raise)

    def test_record_is_never_called_after_the_error(self):
        self.run_until_index_0_fails()
        self.assertEqual(self.recorded, [])


class RunIndexedThreadingTests(unittest.TestCase):
    def test_work_runs_off_the_calling_thread_with_several_workers(self):
        work_threads = set()
        lock = threading.Lock()
        def work(i):
            with lock:
                work_threads.add(threading.get_ident())
            return i
        run_indexed(range(8), work, lambda i, r: None, workers=4)
        self.assertTrue(work_threads)
        self.assertNotIn(threading.get_ident(), work_threads)

    def test_error_mid_batch_records_no_index_twice_and_is_raised(self):
        # all four start together and finish together, so several futures can come
        # back from the same wait call with index 2's error among them
        barrier = threading.Barrier(4, timeout=5)
        recorded = []
        def work(i):
            barrier.wait()
            if i == 2:
                raise RuntimeError("mid-batch")
            return i
        with self.assertRaisesRegex(RuntimeError, "mid-batch"):
            run_indexed(range(4), work, lambda i, r: recorded.append(i), workers=4)
        self.assertEqual(len(recorded), len(set(recorded)))
        self.assertLessEqual(set(recorded), {0, 1, 3})


class WorkersFromTests(unittest.TestCase):
    def test_default_clamp_and_bad_values(self):
        self.assertEqual(workers_from({}), 8)
        self.assertEqual(workers_from({"concurrency": {"workers": 0}}), 1)
        self.assertEqual(workers_from({"concurrency": {"workers": 500}}), 32)
        self.assertEqual(workers_from({"concurrency": {"workers": "many"}}), 8)


if __name__ == "__main__":
    unittest.main()
