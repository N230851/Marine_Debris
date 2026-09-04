import type { Detection, GeoLocation, ScanResult } from '@/types';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';

interface ReportGeneratorProps {
  detections: Detection[];
  geo: GeoLocation | null;
  scanResult: ScanResult | null;
  imageName: string;
}

export default function ReportGenerator({
  detections,
  geo,
  scanResult,
  imageName,
}: ReportGeneratorProps) {
  if (!scanResult || detections.length === 0) return null;

  const buildReport = () => {
    return {
      report_metadata: {
        generated_at: new Date().toISOString(),
        model_version: scanResult.modelVersion,
        analysis_id: scanResult.analysisId,
        image_hash: scanResult.imageHash,
        confidence_threshold: scanResult.threshold,
        processing_time_ms: scanResult.processingTimeMs,
        image_name: imageName,
        image_dimensions: `${scanResult.imageWidth}x${scanResult.imageHeight}`,
      },
      validation: {
        is_valid: scanResult.validation.isValid,
        confidence: scanResult.validation.confidence,
        reason: scanResult.validation.reason,
        metrics: scanResult.validation.metrics,
      },
      location: geo
        ? {
            latitude: geo.latitude,
            longitude: geo.longitude,
            depth_m: geo.depth,
            bearing_deg: geo.bearing,
            survey_vessel: geo.surveyVessel,
          }
        : null,
      fusion: {
        decision: scanResult.fusion.decision,
        agreement_score: scanResult.fusion.agreementScore,
        yolo_agreement: scanResult.fusion.yoloAgreement,
        rcnn_agreement: scanResult.fusion.rcnnAgreement,
        unet_agreement: scanResult.fusion.unetAgreement,
        notes: scanResult.fusion.disagreementNotes,
        summary: scanResult.fusion.summary,
      },
      models: {
        yolo: {
          detections: scanResult.yolo.detections.length,
          avg_confidence: scanResult.yolo.confidence,
          processing_ms: scanResult.yolo.processingTimeMs,
        },
        unet: {
          coverage_percent: scanResult.segmentation.coveragePercent,
          region_count: scanResult.segmentation.regionCount,
          processing_ms: scanResult.segmentation.processingTimeMs,
        },
        rcnn: {
          detections: scanResult.rcnn.detections.length,
          avg_confidence: scanResult.rcnn.confidence,
          processing_ms: scanResult.rcnn.processingTimeMs,
        },
      },
      summary: {
        total_detections: detections.length,
        average_confidence:
          Math.round(
            (detections.reduce((a, d) => a + d.confidence, 0) /
              detections.length) *
              10
          ) / 10,
        anomalies: detections.filter((d) => d.isAnomaly).length,
        debris_types: detections.filter((d) => !d.isAnomaly).length,
      },
      detections: detections.map((d, i) => ({
        index: i + 1,
        label: d.label,
        label_display: d.labelDisplay,
        confidence_pct: d.confidence,
        is_anomaly: d.isAnomaly,
        source: d.source,
        bounding_box: {
          x: d.bbox.x,
          y: d.bbox.y,
          width: d.bbox.width,
          height: d.bbox.height,
        },
        estimated_area_m2: d.area_m2,
        acoustic_shadow: d.shadow_detected,
        brightness_mean: d.brightness_mean,
        texture_score: d.texture_score,
        gps_coordinates: geo
          ? { lat: geo.latitude, lng: geo.longitude }
          : null,
      })),
      assistant_analysis: scanResult.assistantAnalysis,
    };
  };

  const downloadJSON = () => {
    const report = buildReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepscan_report_${imageName.replace(/\.[^.]+$/, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    const rows = [
      [
        'Index',
        'Label',
        'Confidence (%)',
        'Is Anomaly',
        'Source',
        'BBox X',
        'BBox Y',
        'BBox W',
        'BBox H',
        'Area (m2)',
        'Shadow',
        'Brightness',
        'Texture',
        'Latitude',
        'Longitude',
        'Depth (m)',
      ],
      ...detections.map((d, i) => [
        String(i + 1),
        d.labelDisplay,
        String(d.confidence),
        String(d.isAnomaly),
        d.source,
        String(d.bbox.x),
        String(d.bbox.y),
        String(d.bbox.width),
        String(d.bbox.height),
        String(d.area_m2),
        String(d.shadow_detected),
        String(d.brightness_mean),
        String(d.texture_score),
        geo ? String(geo.latitude) : 'N/A',
        geo ? String(geo.longitude) : 'N/A',
        geo ? String(geo.depth) : 'N/A',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepscan_report_${imageName.replace(/\.[^.]+$/, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <button onClick={downloadCSV} className="btn-ghost flex items-center gap-2 text-sm">
        <FileSpreadsheet className="w-4 h-4" />
        CSV
      </button>
      <button onClick={downloadJSON} className="btn-primary flex items-center gap-2 text-sm">
        <FileJson className="w-4 h-4" />
        JSON Report
      </button>
    </div>
  );
}
