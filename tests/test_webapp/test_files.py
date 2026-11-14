"""Tests for saving and inspecting uploads:  python -m unittest tests.test_webapp.test_files"""

import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from webapp.files import (  # noqa: E402
    MAX_UPLOAD_BYTES,
    UploadError,
    detect_mapping,
    inspect,
    resolve,
    save_upload,
)


def _xlsx(rows) -> bytes:
    """An .xlsx file holding rows (the first is the header row)."""
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


SAMPLE = [
    ["Company", "UEN", "About", "Sector"],
    ["Alpha", "U1", "Quantum sensors", "Hardware"],
    ["Beta", "U2", "Gene editing", "Biotech"],
    [None, "U3", "No name here", "Software"],
    ["Delta", "U4", None, "Robotics"],
    ["Echo", "U5", "x" * 400, "AI"],
    ["Foxtrot", "U6", "Batteries", "Energy"],
]


class FilesTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.uploads = Path(tmp.name) / "uploads"

    def _folders(self):
        return list(self.uploads.iterdir()) if self.uploads.exists() else []

    def _saved_path(self, info) -> Path:
        return resolve(self.uploads, info["fileId"])

    def _assert_contained(self, info):
        path = self._saved_path(info).resolve()
        self.assertEqual(path.parent.parent, self.uploads.resolve())
        self.assertEqual(path.parent.name, info["fileId"])
        self.assertEqual(path.name, info["name"])

    def assert_rejected(self, filename, data, *fragments):
        with self.assertRaises(UploadError) as ctx:
            save_upload(self.uploads, filename, data)
        message = str(ctx.exception)
        for fragment in fragments:
            self.assertIn(fragment, message)
        self.assertNotIn("Traceback", message)
        self.assertNotIn(str(self.uploads), message)
        # A rejected upload leaves nothing behind.
        self.assertEqual(self._folders(), [])
        return message

    # --- detect_mapping ---

    def test_detects_prototype_sample_mapping(self):
        self.assertEqual(detect_mapping(["Company", "UEN", "About", "Sector", "location"]),
                         {"company_name": "Company", "description": "About", "domain": "Sector", "uen": "UEN"})

    def test_mapping_first_hit_wins_and_absent_keys(self):
        # Candidates are tried in order: "company_name" beats "name".
        self.assertEqual(detect_mapping(["name", "COMPANY_NAME", "Summary", "desc"]),
                         {"company_name": "COMPANY_NAME", "description": "desc"})
        self.assertEqual(detect_mapping(["foo", "bar"]), {})

    # --- inspect / save ---

    def test_inspect_counts_rows_preview_and_empties(self):
        info = save_upload(self.uploads, "sample.xlsx", _xlsx(SAMPLE))
        self.assertEqual(set(info), {"fileId", "name", "rows", "headers", "mapping",
                                     "preview", "table", "emptyCounts"})
        self.assertEqual(info["rows"], 6)
        self.assertEqual(info["headers"], ["Company", "UEN", "About", "Sector"])
        self.assertEqual(info["mapping"], {"company_name": "Company", "description": "About",
                                           "domain": "Sector", "uen": "UEN"})
        self.assertEqual(len(info["preview"]), 4)
        self.assertEqual(info["preview"][0], {"Company": "Alpha", "UEN": "U1",
                                              "About": "Quantum sensors", "Sector": "Hardware"})
        self.assertEqual(info["preview"][2]["Company"], "")
        self.assertEqual(len(info["table"]), 6)
        self.assertEqual(info["table"][0], ["Alpha", "U1", "Quantum sensors", "Hardware"])
        self.assertEqual(info["table"][2][0], "")
        self.assertEqual(info["table"][3][2], "")
        self.assertEqual(info["table"][4][2], "x" * 300)
        self.assertEqual(info["emptyCounts"], {"Company": 1, "UEN": 0, "About": 1, "Sector": 0})
        self.assertEqual(info["name"], "sample.xlsx")
        self._assert_contained(info)
        # inspect() on the stored file gives the same answer.
        self.assertEqual(inspect(self._saved_path(info)), info)

    def test_csv_supported(self):
        data = "company_name,description,uen\nAlpha,Lasers,U1\n,No name,U2\nGamma,  ,U3\n".encode("utf-8")
        info = save_upload(self.uploads, "list.csv", data)
        self.assertEqual(info["rows"], 3)
        self.assertEqual(info["headers"], ["company_name", "description", "uen"])
        self.assertEqual(info["mapping"], {"company_name": "company_name", "description": "description",
                                           "uen": "uen"})
        self.assertEqual(info["table"][1], ["", "No name", "U2"])
        # Whitespace-only counts as blank.
        self.assertEqual(info["emptyCounts"], {"company_name": 1, "description": 1, "uen": 0})

    def test_traversal_name_is_contained(self):
        for filename in ("..\\..\\evil.xlsx", "../../evil.xlsx", "C:\\Windows\\evil.xlsx", "/etc/evil.xlsx"):
            with self.subTest(filename=filename):
                info = save_upload(self.uploads, filename, _xlsx(SAMPLE))
                self.assertEqual(info["name"], "evil.xlsx")
                self._assert_contained(info)
        # Nothing was written beside uploads/.
        self.assertEqual(sorted(p.name for p in self.uploads.parent.iterdir()), ["uploads"])

    def test_unicode_and_space_names_kept(self):
        info = save_upload(self.uploads, "初创 公司 list.xlsx", _xlsx(SAMPLE))
        self.assertEqual(info["name"], "初创 公司 list.xlsx")
        self._assert_contained(info)
        self.assertTrue(self._saved_path(info).is_file())

    def test_unsafe_name_characters_removed(self):
        cases = {
            'a<b>c:d"e|f?g*h.xlsx': "abcdefgh.xlsx",
            "bad\x00\x1fname\x7f.xlsx": "badname.xlsx",
            "  trailing.xlsx": "trailing.xlsx",
            "Upper.XLSX": "Upper.XLSX",
        }
        for filename, expected in cases.items():
            with self.subTest(filename=filename):
                info = save_upload(self.uploads, filename, _xlsx(SAMPLE))
                self.assertEqual(info["name"], expected)
                self._assert_contained(info)

    def test_name_falls_back_when_nothing_is_left(self):
        cases = {
            ".xlsx": "input.xlsx",
            "../.xlsx": "input.xlsx",
            "...xlsx": "input.xlsx",
            "<>.csv": "input.csv",
            "CON.xlsx": "input.xlsx",
            "nul.csv": "input.csv",
            "com1.tar.xlsx": "input.xlsx",
        }
        for filename, expected in cases.items():
            data = _xlsx(SAMPLE) if expected.endswith(".xlsx") else b"company,uen\nA,1\n"
            with self.subTest(filename=filename):
                info = save_upload(self.uploads, filename, data)
                self.assertEqual(info["name"], expected)
                self._assert_contained(info)

    def test_device_names_never_reach_a_device(self):
        data = b"company,uen\nA,1\n"
        names = ["CONIN$.csv", "conout$.csv", "CONOUT$ .csv", "COM\u00b9.csv", "com\u00b2.csv",
                 "COM\u00b3.x.csv", "LPT\u00b9.csv", "lpt\u00b2.csv", "LPT\u00b3.csv", "COM0.csv", "LPT0.csv"]
        for filename in names:
            with self.subTest(filename=filename):
                info = save_upload(self.uploads, filename, data)
                # Replaced before any open: the bytes are in uploads/, not sent to a device.
                self.assertEqual(info["name"], "input.csv")
                self._assert_contained(info)
                self.assertEqual(self._saved_path(info).read_bytes(), data)

    def test_write_failure_is_an_upload_error(self):
        for exc in (OSError("C:\\secret\\uploads\\x"), ValueError("Cannot open console")):
            with self.subTest(exc=exc):
                with mock.patch.object(Path, "write_bytes", side_effect=exc):
                    message = self.assert_rejected("a.csv", b"company\nA\n", "could not be used")
                self.assertNotIn("secret", message)
                self.assertNotIn("console", message)

    def test_long_non_bmp_name_is_saved(self):
        data = b"company,uen\nA,1\n"
        info = save_upload(self.uploads, "\U0001F600" * 200 + ".csv", data)
        self.assertTrue(info["name"].startswith("\U0001F600"))
        self.assertTrue(info["name"].endswith(".csv"))
        # Measured in UTF-16 units, as Windows counts them; no surrogate pair is split.
        self.assertLessEqual(len(info["name"].encode("utf-16-le")) // 2, 105)
        self.assertEqual(set(info["name"][:-4]), {"\U0001F600"})
        self._assert_contained(info)
        self.assertEqual(self._saved_path(info).read_bytes(), data)

    def test_long_name_is_shortened(self):
        info = save_upload(self.uploads, "a" * 300 + ".xlsx", _xlsx(SAMPLE))
        self.assertTrue(info["name"].endswith(".xlsx"))
        self.assertLessEqual(len(info["name"]), 120)
        self._assert_contained(info)

    def test_rejects_wrong_extension(self):
        self.assert_rejected("a.exe", b"MZ", ".xlsx", ".csv")
        # A trailing dot or space must not sneak another extension past the check.
        for filename in ("a.exe.", "a.exe ", "a.xlsx.exe", "a"):
            with self.subTest(filename=filename):
                self.assert_rejected(filename, b"x")

    def test_rejects_missing_or_degenerate_names(self):
        for filename in ("", "   ", "..", "...", "/", "\\", "..\\..\\", "../.."):
            with self.subTest(filename=filename):
                self.assert_rejected(filename, b"x")

    def test_rejects_unreadable_spreadsheet(self):
        message = self.assert_rejected("a.xlsx", b"this is plain text, not a workbook", "could not be read")
        self.assertIn("a.xlsx", message)

    def test_rejects_empty_file(self):
        for filename in ("a.xlsx", "a.csv"):
            with self.subTest(filename=filename):
                self.assert_rejected(filename, b"", "empty")

    def test_rejects_header_only_file(self):
        self.assert_rejected("a.xlsx", _xlsx([["Company", "About"]]), "no rows")
        self.assert_rejected("a.csv", b"Company,About\n", "no rows")

    def test_rejects_oversize(self):
        self.assert_rejected("a.csv", b"x" * (MAX_UPLOAD_BYTES + 1), "20 MB")
        self.assertEqual(MAX_UPLOAD_BYTES, 20 * 1024 * 1024)

    def test_blank_and_duplicate_headers_survive(self):
        rows = [["Company", None, "Company", "About"], ["A", "x", "B", "d"], ["C", "y", "D", None]]
        info = save_upload(self.uploads, "dupes.xlsx", _xlsx(rows))
        self.assertEqual(info["headers"], ["Company", "Unnamed: 1", "Company.1", "About"])
        self.assertEqual(info["rows"], 2)
        self.assertEqual(info["table"][0], ["A", "x", "B", "d"])
        self.assertEqual(info["mapping"]["company_name"], "Company")
        self.assertEqual(info["emptyCounts"]["About"], 1)
        csv_info = save_upload(self.uploads, "dupes.csv", b"name,,name\na,b,c\n")
        self.assertEqual(csv_info["headers"], ["name", "Unnamed: 1", "name.1"])

    # --- resolve ---

    def test_resolve_rejects_bad_id(self):
        info = save_upload(self.uploads, "sample.xlsx", _xlsx(SAMPLE))
        self.assertTrue(resolve(self.uploads, info["fileId"]).is_file())
        for bad in ("../x", "..", "", info["fileId"].upper(), info["fileId"] + "\n",
                    info["fileId"][:-1], "../" + info["fileId"][3:], "0" * 32, None, 123):
            with self.subTest(file_id=bad):
                with self.assertRaises(FileNotFoundError):
                    resolve(self.uploads, bad)

    def test_resolve_needs_exactly_one_file(self):
        info = save_upload(self.uploads, "sample.xlsx", _xlsx(SAMPLE))
        folder = self.uploads / info["fileId"]
        (folder / "extra.csv").write_bytes(b"a\n1\n")
        with self.assertRaises(FileNotFoundError):
            resolve(self.uploads, info["fileId"])
        empty_id = "a" * 32
        (self.uploads / empty_id).mkdir()
        with self.assertRaises(FileNotFoundError):
            resolve(self.uploads, empty_id)


if __name__ == "__main__":
    unittest.main()
