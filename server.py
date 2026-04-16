from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from datetime import datetime
from pathlib import Path
import json
import mimetypes
import os
import random
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "fleet.db"
PORT = int(os.getenv("PORT", "3000"))
CITIES = ["الرياض", "جدة", "الدمام", "المدينة", "مكة", "أبها"]
STATUS_LABELS = {
    "active": "نشطة",
    "charging": "شحن",
    "maintenance": "صيانة",
}
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
}
INITIAL_VEHICLES = [
    {"name": "TLD-102", "driver": "أحمد سالم", "status": "active", "location": "الرياض"},
    {"name": "TLD-118", "driver": "سارة علي", "status": "charging", "location": "جدة"},
    {"name": "TLD-204", "driver": "خالد حسن", "status": "maintenance", "location": "الدمام"},
    {"name": "TLD-221", "driver": "منى فهد", "status": "active", "location": "المدينة"},
    {"name": "TLD-305", "driver": "علي ناصر", "status": "active", "location": "مكة"},
    {"name": "TLD-412", "driver": "هند راشد", "status": "charging", "location": "أبها"},
]
INITIAL_ALERTS = [
    "المركبة TLD-204 بحاجة إلى فحص دوري خلال 24 ساعة.",
    "تم اكتمال شحن المركبة TLD-118 بنسبة 82٪.",
    "تم إرسال تحديث مسار جديد إلى السائقين النشطين.",
]


def get_connection():
    return sqlite3.connect(DB_PATH)


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS vehicles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                driver TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'charging', 'maintenance')),
                location TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        vehicle_count = connection.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
        alert_count = connection.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
        now = datetime.now().isoformat(timespec="seconds")

        if vehicle_count == 0:
            connection.executemany(
                """
                INSERT INTO vehicles (name, driver, status, location, updated_at)
                VALUES (:name, :driver, :status, :location, :updated_at)
                """,
                [{**vehicle, "updated_at": now} for vehicle in INITIAL_VEHICLES],
            )

        if alert_count == 0:
            connection.executemany(
                "INSERT INTO alerts (message, created_at) VALUES (?, ?)",
                [(message, now) for message in INITIAL_ALERTS],
            )

        connection.commit()


def fetch_vehicles():
    with get_connection() as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT name, driver, status, location, updated_at FROM vehicles ORDER BY name"
        ).fetchall()
    return [dict(row) for row in rows]


def fetch_alerts(limit=6):
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT message FROM alerts ORDER BY datetime(created_at) DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [row[0] for row in rows]


def refresh_fleet_data():
    now = datetime.now().isoformat(timespec="seconds")

    with get_connection() as connection:
        vehicles = connection.execute("SELECT id, name FROM vehicles ORDER BY id").fetchall()

        if not vehicles:
            return

        for vehicle_id, vehicle_name in vehicles:
            status = random.choices(
                ["active", "charging", "maintenance"],
                weights=[6, 2, 1],
                k=1,
            )[0]
            location = random.choice(CITIES)
            connection.execute(
                "UPDATE vehicles SET status = ?, location = ?, updated_at = ? WHERE id = ?",
                (status, location, now, vehicle_id),
            )

            if status == "maintenance":
                connection.execute(
                    "INSERT INTO alerts (message, created_at) VALUES (?, ?)",
                    (f"المركبة {vehicle_name} بحاجة إلى متابعة فنية بعد آخر تحديث.", now),
                )

        connection.execute(
            "INSERT INTO alerts (message, created_at) VALUES (?, ?)",
            (f"تم تحديث البيانات تلقائياً عند {datetime.now().strftime('%H:%M:%S')}", now),
        )
        connection.execute(
            """
            DELETE FROM alerts
            WHERE id NOT IN (
                SELECT id FROM alerts ORDER BY datetime(created_at) DESC, id DESC LIMIT 12
            )
            """
        )
        connection.commit()


def build_dashboard_payload(refresh=False):
    init_db()

    if refresh:
        refresh_fleet_data()

    vehicles = fetch_vehicles()
    alerts = fetch_alerts()

    for vehicle in vehicles:
        vehicle["statusLabel"] = STATUS_LABELS[vehicle["status"]]

    active_count = sum(1 for vehicle in vehicles if vehicle["status"] == "active")
    charging_count = sum(1 for vehicle in vehicles if vehicle["status"] == "charging")
    maintenance_count = sum(1 for vehicle in vehicles if vehicle["status"] == "maintenance")

    stats = [
        {"label": "إجمالي المركبات", "value": len(vehicles)},
        {"label": "نشطة الآن", "value": active_count},
        {"label": "قيد الشحن", "value": charging_count},
        {"label": "تحتاج صيانة", "value": maintenance_count},
    ]

    return {
        "project": "Telad Fleet",
        "status": "running",
        "port": PORT,
        "database": "sqlite",
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "stats": stats,
        "vehicles": vehicles,
        "alerts": alerts,
    }


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


class FleetHandler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status_code=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, file_name):
        file_path = BASE_DIR / file_name
        if not file_path.exists() or not file_path.is_file():
            self._send_json({"error": "File not found", "path": file_name}, status_code=404)
            return

        body = file_path.read_bytes()
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
            content_type = f"{content_type}; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format_string, *args):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {self.address_string()} - {format_string % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path or "/"

        if route in {"/healthz", "/api/health"}:
            init_db()
            self._send_json(
                {
                    "status": "ok",
                    "service": "telad-fleet",
                    "database": DB_PATH.name,
                    "time": datetime.now().isoformat(),
                }
            )
            return

        if route == "/api/status":
            init_db()
            self._send_json(
                {
                    "project": "Telad Fleet",
                    "status": "running",
                    "port": PORT,
                    "database": DB_PATH.name,
                    "message": "Fleet dashboard backend is connected",
                }
            )
            return

        if route == "/api/dashboard":
            params = parse_qs(parsed.query)
            refresh = params.get("refresh", ["0"])[0] == "1"
            self._send_json(build_dashboard_payload(refresh=refresh))
            return

        if route == "/api/vehicles":
            init_db()
            self._send_json({"vehicles": fetch_vehicles()})
            return

        if route == "/api/alerts":
            init_db()
            self._send_json({"alerts": fetch_alerts()})
            return

        if route in STATIC_FILES:
            self._send_file(STATIC_FILES[route])
            return

        self._send_json({"error": "Route not found", "path": route}, status_code=404)


if __name__ == "__main__":
    init_db()
    try:
        server = ReusableThreadingHTTPServer(("0.0.0.0", PORT), FleetHandler)
    except OSError as error:
        print(f"Unable to start Telad Fleet on port {PORT}: {error}")
        print("Set a different PORT value if this port is already in use.")
        raise SystemExit(1) from error

    print(f"Telad Fleet is running on http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Telad Fleet server...")
    finally:
        server.server_close()
