import json
import sqlite3
import tempfile
import threading
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

import server


class TestTeladFleet(unittest.TestCase):
    @contextmanager
    def use_temp_db(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "fleet.db"
            original_db_path = getattr(server, "DB_PATH", None)
            try:
                server.DB_PATH = db_path
                yield db_path
            finally:
                if original_db_path is not None:
                    server.DB_PATH = original_db_path

    @contextmanager
    def running_server(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.FleetHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{httpd.server_address[1]}"
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)

    def test_build_dashboard_payload_contains_core_fields(self):
        with self.use_temp_db():
            payload = server.build_dashboard_payload(refresh=False)

        self.assertEqual(payload["status"], "running")
        self.assertIn("vehicles", payload)
        self.assertIn("alerts", payload)
        self.assertEqual(payload["stats"][0]["value"], len(payload["vehicles"]))
        for vehicle in payload["vehicles"]:
            self.assertEqual(vehicle["statusLabel"], server.STATUS_LABELS[vehicle["status"]])

    def test_fetch_alerts_returns_seeded_messages(self):
        with self.use_temp_db():
            server.init_db()
            alerts = server.fetch_alerts()

        self.assertGreater(len(alerts), 0)
        self.assertTrue(any("المركبة" in alert or "تحديث" in alert for alert in alerts))

    def test_alerts_endpoint_returns_json(self):
        with self.use_temp_db():
            server.init_db()
            with self.running_server() as base_url:
                response = urlopen(f"{base_url}/api/alerts")
                payload = json.loads(response.read().decode("utf-8"))

        self.assertEqual(response.status, 200)
        self.assertIn("alerts", payload)
        self.assertGreater(len(payload["alerts"]), 0)

    def test_init_db_is_idempotent_for_seed_data(self):
        with self.use_temp_db() as db_path:
            server.init_db()
            server.init_db()

            with sqlite3.connect(db_path) as connection:
                vehicle_count = connection.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
                alert_count = connection.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]

        self.assertEqual(vehicle_count, len(server.INITIAL_VEHICLES))
        self.assertEqual(alert_count, len(server.INITIAL_ALERTS))

    def test_init_db_creates_tables_and_seed_data(self):
        with self.use_temp_db() as db_path:
            server.init_db()

            self.assertTrue(db_path.exists())
            with sqlite3.connect(db_path) as connection:
                vehicle_count = connection.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
                alert_count = connection.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]

        self.assertGreater(vehicle_count, 0)
        self.assertGreater(alert_count, 0)

    def test_refresh_fleet_data_updates_vehicles_and_trims_alerts(self):
        with self.use_temp_db() as db_path:
            server.init_db()
            with sqlite3.connect(db_path) as connection:
                connection.executemany(
                    "INSERT INTO alerts (message, created_at) VALUES (?, ?)",
                    [(f"تنبيه قديم {index}", "2024-01-01T00:00:00") for index in range(20)],
                )
                connection.commit()

            statuses = [["maintenance"], ["active"], ["charging"], ["maintenance"], ["active"], ["charging"]]
            locations = ["أبها", "مكة", "الرياض", "جدة", "المدينة", "الدمام"]
            with patch("server.random.choices", side_effect=statuses), patch(
                "server.random.choice", side_effect=locations
            ):
                server.refresh_fleet_data()

            vehicles = server.fetch_vehicles()
            alerts = server.fetch_alerts(limit=20)

        self.assertEqual([vehicle["status"] for vehicle in vehicles], [status[0] for status in statuses])
        self.assertEqual([vehicle["location"] for vehicle in vehicles], locations)
        self.assertEqual(len(alerts), 12)
        self.assertTrue(any("TLD-102" in alert for alert in alerts))
        self.assertTrue(any("تم تحديث البيانات تلقائياً" in alert for alert in alerts))

    def test_health_and_status_endpoints_return_service_metadata(self):
        with self.use_temp_db():
            with self.running_server() as base_url:
                health_response = urlopen(f"{base_url}/api/health")
                health_payload = json.loads(health_response.read().decode("utf-8"))
                status_response = urlopen(f"{base_url}/api/status")
                status_payload = json.loads(status_response.read().decode("utf-8"))

        self.assertEqual(health_response.status, 200)
        self.assertEqual(health_payload["status"], "ok")
        self.assertEqual(health_payload["database"], "fleet.db")
        self.assertEqual(status_response.status, 200)
        self.assertEqual(status_payload["status"], "running")
        self.assertEqual(status_payload["project"], "Telad Fleet")

    def test_dashboard_refresh_endpoint_returns_labeled_vehicles_and_stats(self):
        with self.use_temp_db():
            statuses = [["active"], ["charging"], ["maintenance"], ["active"], ["charging"], ["active"]]
            locations = ["الرياض", "جدة", "الدمام", "مكة", "المدينة", "أبها"]
            with patch("server.random.choices", side_effect=statuses), patch(
                "server.random.choice", side_effect=locations
            ):
                with self.running_server() as base_url:
                    response = urlopen(f"{base_url}/api/dashboard?refresh=1")
                    payload = json.loads(response.read().decode("utf-8"))

        self.assertEqual(response.status, 200)
        self.assertEqual(payload["stats"][0]["value"], len(payload["vehicles"]))
        self.assertEqual(payload["stats"][1]["value"], 3)
        self.assertEqual(payload["stats"][2]["value"], 2)
        self.assertEqual(payload["stats"][3]["value"], 1)
        self.assertTrue(any("تم تحديث البيانات تلقائياً" in alert for alert in payload["alerts"]))
        for vehicle in payload["vehicles"]:
            self.assertEqual(vehicle["statusLabel"], server.STATUS_LABELS[vehicle["status"]])

    def test_vehicles_endpoint_returns_seeded_records(self):
        with self.use_temp_db():
            server.init_db()
            with self.running_server() as base_url:
                response = urlopen(f"{base_url}/api/vehicles")
                payload = json.loads(response.read().decode("utf-8"))

        self.assertEqual(response.status, 200)
        self.assertEqual(len(payload["vehicles"]), len(server.INITIAL_VEHICLES))
        self.assertEqual(payload["vehicles"][0]["name"], "TLD-102")

    def test_static_index_file_is_served_with_html_content_type(self):
        with self.use_temp_db():
            with self.running_server() as base_url:
                response = urlopen(base_url)
                body = response.read().decode("utf-8")

        self.assertEqual(response.status, 200)
        self.assertIn("text/html", response.headers["Content-Type"])
        self.assertIn("TELAD FLEET", body)

    def test_unknown_route_returns_json_404(self):
        with self.use_temp_db():
            with self.running_server() as base_url:
                with self.assertRaises(HTTPError) as error:
                    urlopen(f"{base_url}/api/unknown")

        self.assertEqual(error.exception.code, 404)
        payload = json.loads(error.exception.read().decode("utf-8"))
        self.assertEqual(payload["error"], "Route not found")
        self.assertEqual(payload["path"], "/api/unknown")


if __name__ == "__main__":
    unittest.main()
