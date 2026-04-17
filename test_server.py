import json
import sqlite3
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
from unittest.mock import patch

import server


class TestTeladFleet(unittest.TestCase):
    def _start_test_server(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.FleetHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        return httpd

    def _stop_test_server(self, httpd):
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()

    def test_build_dashboard_payload_contains_core_fields(self):
        payload = server.build_dashboard_payload(refresh=False)
        self.assertEqual(payload["status"], "running")
        self.assertIn("vehicles", payload)
        self.assertIn("alerts", payload)

    def test_build_dashboard_payload_populates_status_labels_and_stats(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                payload = server.build_dashboard_payload(refresh=False)
                vehicles = payload["vehicles"]
                stats = {entry["label"]: entry["value"] for entry in payload["stats"]}

                self.assertEqual(stats["إجمالي المركبات"], len(vehicles))
                self.assertEqual(
                    stats["نشطة الآن"],
                    sum(1 for vehicle in vehicles if vehicle["status"] == "active"),
                )
                self.assertEqual(
                    stats["قيد الشحن"],
                    sum(1 for vehicle in vehicles if vehicle["status"] == "charging"),
                )
                self.assertEqual(
                    stats["تحتاج صيانة"],
                    sum(1 for vehicle in vehicles if vehicle["status"] == "maintenance"),
                )
                for vehicle in vehicles:
                    self.assertEqual(vehicle["statusLabel"], server.STATUS_LABELS[vehicle["status"]])
            finally:
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

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

    def test_refresh_fleet_data_updates_rows_and_trims_alert_history(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()
                with sqlite3.connect(db_path) as connection:
                    now = "2024-01-01T00:00:00"
                    connection.executemany(
                        "INSERT INTO alerts (message, created_at) VALUES (?, ?)",
                        [(f"old alert {i}", now) for i in range(20)],
                    )
                    connection.commit()

                with patch("server.random.choices", return_value=["maintenance"]), patch(
                    "server.random.choice", return_value=server.CITIES[0]
                ):
                    server.refresh_fleet_data()

                with sqlite3.connect(db_path) as connection:
                    updated_statuses = {
                        row[0] for row in connection.execute("SELECT status FROM vehicles").fetchall()
                    }
                    alert_count = connection.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
                    latest_alert = connection.execute(
                        "SELECT message FROM alerts ORDER BY id DESC LIMIT 1"
                    ).fetchone()[0]

                self.assertEqual(updated_statuses, {"maintenance"})
                self.assertEqual(alert_count, 12)
                self.assertIn("تم تحديث البيانات تلقائياً", latest_alert)
            finally:
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

    def test_alerts_endpoint_returns_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()
                httpd = self._start_test_server()
                port = httpd.server_address[1]

                response = urlopen(f"http://127.0.0.1:{port}/api/alerts")
                payload = json.loads(response.read().decode("utf-8"))

                self.assertEqual(response.status, 200)
                self.assertIn("alerts", payload)
                self.assertGreater(len(payload["alerts"]), 0)
            finally:
                if 'httpd' in locals():
                    self._stop_test_server(httpd)
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

    def test_health_status_and_vehicles_endpoints(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()
                httpd = self._start_test_server()
                port = httpd.server_address[1]

                health = json.loads(urlopen(f"http://127.0.0.1:{port}/api/health").read().decode("utf-8"))
                status = json.loads(urlopen(f"http://127.0.0.1:{port}/api/status").read().decode("utf-8"))
                vehicles = json.loads(urlopen(f"http://127.0.0.1:{port}/api/vehicles").read().decode("utf-8"))

                self.assertEqual(health["status"], "ok")
                self.assertEqual(status["status"], "running")
                self.assertEqual(status["database"], db_path.name)
                self.assertGreater(len(vehicles["vehicles"]), 0)
            finally:
                if "httpd" in locals():
                    self._stop_test_server(httpd)
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

    def test_dashboard_refresh_query_invokes_refresh_logic(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()
                httpd = self._start_test_server()
                port = httpd.server_address[1]

                with patch("server.refresh_fleet_data") as refresh_mock:
                    response = urlopen(f"http://127.0.0.1:{port}/api/dashboard?refresh=1")
                    payload = json.loads(response.read().decode("utf-8"))

                self.assertEqual(response.status, 200)
                self.assertIn("stats", payload)
                refresh_mock.assert_called_once()
            finally:
                if "httpd" in locals():
                    self._stop_test_server(httpd)
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

    def test_static_route_and_unknown_route_behaviors(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                server.init_db()
                httpd = self._start_test_server()
                port = httpd.server_address[1]

                index_response = urlopen(f"http://127.0.0.1:{port}/")
                index_body = index_response.read().decode("utf-8")
                self.assertEqual(index_response.status, 200)
                self.assertIn("text/html", index_response.headers.get("Content-Type", ""))
                self.assertIn("TELAD FLEET", index_body)

                with self.assertRaises(HTTPError) as error_context:
                    urlopen(f"http://127.0.0.1:{port}/does-not-exist")
                error_payload = json.loads(error_context.exception.read().decode("utf-8"))
                self.assertEqual(error_context.exception.code, 404)
                self.assertEqual(error_payload["error"], "Route not found")
            finally:
                if "httpd" in locals():
                    self._stop_test_server(httpd)
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
