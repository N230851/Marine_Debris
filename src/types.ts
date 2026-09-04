export type DetectionLabel =
  | 'plastic_debris'
  | 'fishing_net'
  | 'tire'
  | 'barrel'
  | 'metal_fragment'
  | 'shipwreck_debris'
  | 'anomaly'
  | 'seafloor_normal';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  id: string;
  label: DetectionLabel;
  labelDisplay: string;
  confidence: number;
  bbox: BoundingBox;
  isAnomaly: boolean;
  area_m2: number;
  shadow_detected: boolean;
  brightness_mean: number;
  texture_score: number;
  source: 'yolo' | 'rcnn' | 'fusion';
}

export interface ModelDetection {
  model: 'yolo' | 'unet' | 'rcnn';
  detections: Detection[];
  processingTimeMs: number;
  maskCoverage?: number;
  confidence: number;
}

export interface SegmentationResult {
  maskDataUrl: string;
  coveragePercent: number;
  regionCount: number;
  processingTimeMs: number;
}

export interface FusionResult {
  finalDetections: Detection[];
  agreementScore: number;
  yoloAgreement: number;
  rcnnAgreement: number;
  unetAgreement: number;
  disagreementNotes: string[];
  decision: 'consensus' | 'partial_agreement' | 'disagreement' | 'no_detection';
  summary: string;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  reason: string;
  metrics: {
    grayscaleRatio: number;
    edgeDensity: number;
    textureVariance: number;
    histogramSpread: number;
    aspectRatio: number;
  };
}

export interface ScanResult {
  analysisId: string;
  imageHash: string;
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
  processingTimeMs: number;
  modelVersion: string;
  threshold: number;
  yolo: ModelDetection;
  unet: ModelDetection;
  rcnn: ModelDetection;
  segmentation: SegmentationResult;
  fusion: FusionResult;
  validation: ValidationResult;
  assistantAnalysis: string;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  depth: number;
  bearing: number;
  surveyVessel: string;
}

export interface ScanRecord {
  id: string;
  image_name: string;
  image_width: number;
  image_height: number;
  latitude: number;
  longitude: number;
  depth: number;
  detection_count: number;
  average_confidence: number;
  detections: Detection[];
  created_at: string;
  model_used: string;
  yolo_detections: Detection[];
  rcnn_detections: Detection[];
  unet_mask: string | null;
  model_agreement: number;
  is_sonar_validated: boolean;
  validation_confidence: number;
  validation_reason: string | null;
  fusion_result: FusionResult | null;
  assistant_analysis: string | null;
  image_hash: string | null;
}

export const LABEL_DISPLAY: Record<DetectionLabel, string> = {
  plastic_debris: 'Plastic Debris',
  fishing_net: 'Fishing Net',
  tire: 'Tire',
  barrel: 'Barrel / Drum',
  metal_fragment: 'Metal Fragment',
  shipwreck_debris: 'Shipwreck Debris',
  anomaly: 'Unknown Anomaly',
  seafloor_normal: 'Normal Seafloor',
};

export const LABEL_COLORS: Record<DetectionLabel, string> = {
  plastic_debris: '#f59e0b',
  fishing_net: '#22d3ee',
  tire: '#a78bfa',
  barrel: '#f87171',
  metal_fragment: '#94a3b8',
  shipwreck_debris: '#fb923c',
  anomaly: '#ef4444',
  seafloor_normal: '#22c55e',
};
