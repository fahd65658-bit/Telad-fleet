import sqlite3
import tempfile
import unittest
from pathlib import Path

import server


class TestTeladFleet(unittest.TestCase):
    def test_build_dashboard_payload_contains_core_fields(self):
        payload = server.build_dashboard_payload(refresh=False)
        self.assertEqual(payload["status"], "running")
        self.assertIn("vehicles", payload)
        self.assertIn("alerts", payload)

    def test_fetch_alerts_returns_seeded_messages(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()
                alerts = server.fetch_alerts()
                self.assertGreater(len(alerts), 0)
                self.assertTrue(any("المركبة" in alert or "تحديث" in alert for alert in alerts))
            finally:
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

    def test_init_db_creates_tables_and_seed_data(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()

                self.assertTrue(db_path.exists())
                with sqlite3.connect(db_path) as connection:
                    vehicle_count = connection.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
                    alert_count = connection.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]

                self.assertGreater(vehicle_count, 0)
                self.assertGreater(alert_count, 0)
            finally:
                if original_db_path is not None:
                    server.DB_PATH = original_db_path


if __name__ == "__main__":
    unittest.main()
