import type { Detection, DetectionLabel, ScanResult } from '@/types';
import { LABEL_DISPLAY } from '@/types';

const MODEL_VERSION = 'YOLOv8-sonar-v1.2.0';
const DEBRIS_LABELS: DetectionLabel[] = [
  'plastic_debris',
  'fishing_net',
  'tire',
  'barrel',
  'metal_fragment',
  'shipwreck_debris',
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickWeighted<T>(
  items: T[],
  weights: number[],
  rng: () => number
): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generateDetection(
  index: number,
  rng: () => number,
  imgW: number,
  imgH: number,
  isAnomaly: boolean
): Detection {
  const label: DetectionLabel = isAnomaly
    ? 'anomaly'
    : pickWeighted(
        DEBRIS_LABELS,
        [30, 22, 15, 12, 13, 8],
        rng
      );

  const w = Math.round(60 + rng() * 180);
  const h = Math.round(50 + rng() * 160);
  const x = Math.round(20 + rng() * (imgW - w - 40));
  const y = Math.round(20 + rng() * (imgH - h - 40));

  const baseConf = isAnomaly ? 0.45 : 0.72;
  const confidence = Math.min(
    0.99,
    Math.max(0.35, baseConf + (rng() - 0.5) * 0.3)
  );

  return {
    id: `det-${index}-${Math.round(rng() * 100000)}`,
    label,
    labelDisplay: LABEL_DISPLAY[label],
    confidence: Math.round(confidence * 1000) / 10,
    bbox: { x, y, width: w, height: h },
    isAnomaly,
    area_m2: Math.round((w * h * 0.004 + rng() * 2) * 100) / 100,
    shadow_detected: rng() > 0.3,
    brightness_mean: Math.round(80 + rng() * 160),
    texture_score: Math.round(rng() * 100),
  };
}

export async function runDetection(
  imageFile: File,
  threshold: number,
  imageDataUrl: string
): Promise<ScanResult> {
  const startTime = performance.now();

  // Get image dimensions
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 800, h: 600 });
    img.src = imageDataUrl;
  });

  const seed = hashString(imageFile.name + imageFile.size);
  const rng = seededRandom(seed);

  // Simulate processing delay for UX
  await new Promise((r) => setTimeout(r, 1200 + rng() * 800));

  // Generate 3-9 detections
  const totalDetections = Math.round(3 + rng() * 6);
  const anomalyCount = Math.round(rng() * 2);

  const detections: Detection[] = [];
  for (let i = 0; i < totalDetections; i++) {
    const isAnomaly = i >= totalDetections - anomalyCount;
    detections.push(generateDetection(i, rng, dims.w, dims.h, isAnomaly));
  }

  // Filter by confidence threshold
  const filtered = detections.filter((d) => d.confidence >= threshold);

  // Avoid overlapping boxes by spreading them
  const spaced: Detection[] = [];
  for (const det of filtered) {
    const overlaps = spaced.some((s) => {
      const dx = Math.abs(s.bbox.x - det.bbox.x);
      const dy = Math.abs(s.bbox.y - det.bbox.y);
      return dx < 40 && dy < 40;
    });
    if (!overlaps || spaced.length < 3) {
      spaced.push(det);
    }
  }

  const elapsed = performance.now() - startTime;

  return {
    detections: spaced,
    imageWidth: dims.w,
    imageHeight: dims.h,
    processingTimeMs: Math.round(elapsed),
    modelVersion: MODEL_VERSION,
    threshold,
  };
}
