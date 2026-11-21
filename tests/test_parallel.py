"""Worker-pool helper tests:  python -m unittest discover tests"""

import sys
import threading
import time
import unittest
from pathlib import Path

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


class WorkersFromTests(unittest.TestCase):
    def test_default_clamp_and_bad_values(self):
        self.assertEqual(workers_from({}), 8)
        self.assertEqual(workers_from({"concurrency": {"workers": 0}}), 1)
        self.assertEqual(workers_from({"concurrency": {"workers": 500}}), 32)
        self.assertEqual(workers_from({"concurrency": {"workers": "many"}}), 8)


if __name__ == "__main__":
    unittest.main()
