/*
# Create scans table for marine debris detection system

1. Purpose
   Stores sonar image scan results — each row is one uploaded sonar image that
   has been processed by the AI detection engine. Detections (bounding boxes,
   labels, confidence scores) are stored as a JSONB array.

2. New Tables
   - `scans`
     - `id` (uuid, primary key)
     - `image_name` (text, name of the uploaded sonar image file)
     - `image_width` (integer, pixel width of the processed image)
     - `image_height` (integer, pixel height of the processed image)
     - `latitude` (double precision, simulated GPS latitude)
     - `longitude` (double precision, simulated GPS longitude)
     - `depth` (double precision, simulated water depth in meters)
     - `detection_count` (integer, number of objects detected)
     - `average_confidence` (double precision, mean confidence across detections)
     - `detections` (jsonb, array of detection objects with label, confidence, bbox)
     - `created_at` (timestamptz, when the scan was processed)

3. Security
   - Enable RLS on `scans`.
   - Single-tenant app (no sign-in): allow anon + authenticated full CRUD
     because the data is intentionally shared/public for this prototype.
*/

CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_name text NOT NULL,
  image_width integer,
  image_height integer,
  latitude double precision,
  longitude double precision,
  depth double precision,
  detection_count integer DEFAULT 0,
  average_confidence double precision DEFAULT 0,
  detections jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scans" ON scans;
CREATE POLICY "anon_select_scans" ON scans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scans" ON scans;
CREATE POLICY "anon_insert_scans" ON scans FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_scans" ON scans;
CREATE POLICY "anon_update_scans" ON scans FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_scans" ON scans;
CREATE POLICY "anon_delete_scans" ON scans FOR DELETE
  TO anon, authenticated USING (true);
