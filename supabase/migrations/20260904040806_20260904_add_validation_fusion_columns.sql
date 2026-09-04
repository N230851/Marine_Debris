/*
# Add validation, fusion, and assistant columns to scans table

1. Purpose
   Extends the scans table to support the multi-model analysis pipeline:
   - Image fingerprinting for stale-response protection
   - Sonar image validation results
   - Fused multi-model decision output
   - AI assistant analysis text

2. New Columns (added to existing `scans` table)
   - `image_hash` (text) — SHA-256-like hash of image pixels, used to tie results to a specific upload
   - `is_sonar_validated` (boolean, default false) — whether the image passed sonar validation
   - `validation_confidence` (double precision, default 0) — confidence that the image is genuine sonar
   - `validation_reason` (text) — human-readable explanation of validation result
   - `fusion_result` (jsonb) — fused decision from YOLO + U-Net + Faster R-CNN
   - `assistant_analysis` (text) — AI assistant's analysis of the scan results

3. Security
   - No changes to RLS. Existing anon + authenticated CRUD policies remain in effect.
*/

ALTER TABLE scans ADD COLUMN IF NOT EXISTS image_hash text;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS is_sonar_validated boolean DEFAULT false;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS validation_confidence double precision DEFAULT 0;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS validation_reason text;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS fusion_result jsonb DEFAULT '{}'::jsonb;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS assistant_analysis text;
