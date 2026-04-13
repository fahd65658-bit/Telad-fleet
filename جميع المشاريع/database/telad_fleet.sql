
CREATE TABLE users (
 id SERIAL PRIMARY KEY,
 username TEXT,
 password TEXT,
 role TEXT
);

CREATE TABLE vehicles (
 id SERIAL PRIMARY KEY,
 plate TEXT,
 model TEXT,
 city TEXT,
 driver TEXT
);

CREATE TABLE gps_tracking (
 id SERIAL PRIMARY KEY,
 vehicle_id INTEGER,
 latitude NUMERIC,
 longitude NUMERIC,
 speed NUMERIC,
 timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
