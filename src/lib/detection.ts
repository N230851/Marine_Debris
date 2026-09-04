import type {
  Detection,
  DetectionLabel,
  ScanResult,
  ModelDetection,
  SegmentationResult,
  FusionResult,
  ValidationResult,
  BoundingBox,
} from '@/types';
import { LABEL_DISPLAY } from '@/types';

const MODEL_VERSION = 'DeepScan-MultiModel-v2.0';

// ─── Image loading & pixel extraction ───────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function imageToCanvas(img: HTMLImageElement, maxDim = 1024): HTMLCanvasElement {
  const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function getImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ─── Image fingerprint ───────────────────────────────────────────

export function computeImageHash(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let hash = 0;
  const step = Math.max(1, Math.floor(data.data.length / 4096));
  for (let i = 0; i < data.data.length; i += step * 4) {
    hash = ((hash << 5) - hash + data.data[i]) | 0;
    hash = ((hash << 5) - hash + data.data[i + 1]) | 0;
    hash = ((hash << 5) - hash + data.data[i + 2]) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `img_${hex}_${canvas.width}x${canvas.height}`;
}

// ─── Grayscale conversion ────────────────────────────────────────

function toGrayscale(data: ImageData): Float32Array {
  const gray = new Float32Array(data.width * data.height);
  for (let i = 0; i < data.width * data.height; i++) {
    const r = data.data[i * 4];
    const g = data.data[i * 4 + 1];
    const b = data.data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

// ─── Sobel edge detection ────────────────────────────────────────

function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      edges[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

// ─── Local texture variance ──────────────────────────────────────

function localVariance(
  gray: Float32Array,
  w: number,
  h: number,
  radius: number
): Float32Array {
  const variance = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const v = gray[ny * w + nx];
            sum += v;
            sumSq += v * v;
            count++;
          }
        }
      }
      const mean = sum / count;
      variance[y * w + x] = Math.max(0, sumSq / count - mean * mean);
    }
  }
  return variance;
}

// ─── Histogram analysis ──────────────────────────────────────────

function histogram(gray: Float32Array): { hist: number[]; spread: number; mean: number; std: number } {
  const hist = new Array(256).fill(0);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const bin = Math.min(255, Math.max(0, Math.round(gray[i])));
    hist[bin]++;
    sum += gray[i];
  }
  const mean = sum / gray.length;
  let varSum = 0;
  for (let i = 0; i < gray.length; i++) {
    varSum += (gray[i] - mean) ** 2;
  }
  const std = Math.sqrt(varSum / gray.length);

  let nonZeroBins = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > gray.length * 0.0005) nonZeroBins++;
  }
  return { hist, spread: nonZeroBins, mean, std };
}

// ─── Sonar image validation ──────────────────────────────────────

export function validateSonar(gray: Float32Array, w: number, h: number): ValidationResult {
  const edges = sobelEdges(gray, w, h);
  const variance = localVariance(gray, w, h, 4);
  const { spread, mean, std } = histogram(gray);

  // Sonar images are predominantly grayscale (low color saturation already
  // guaranteed since we converted). Check grayscale ratio implicitly.
  const edgeMean = edges.reduce((a, b) => a + b, 0) / edges.length;
  const varMean = variance.reduce((a, b) => a + b, 0) / variance.length;

  // Edge density: sonar images have moderate edge density from object outlines
  let edgePixels = 0;
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] > 40) edgePixels++;
  }
  const edgeDensity = edgePixels / edges.length;

  // Sonar images typically: moderate brightness (not too dark, not too bright),
  // moderate texture variance, moderate histogram spread, specific aspect ratios
  const aspectRatio = w / h;

  const metrics = {
    grayscaleRatio: 1.0, // Already grayscale-converted
    edgeDensity,
    textureVariance: varMean,
    histogramSpread: spread,
    aspectRatio,
  };

  // Validation scoring
  let score = 0;
  const reasons: string[] = [];

  // Edge density check (sonar has structured edges)
  if (edgeDensity > 0.02 && edgeDensity < 0.35) {
    score += 25;
  } else if (edgeDensity < 0.02) {
    reasons.push('insufficient structural detail');
  } else {
    reasons.push('edge pattern inconsistent with sonar');
  }

  // Brightness check (sonar typically mid-range, not pure black/white)
  if (mean > 20 && mean < 235) {
    score += 20;
  } else {
    reasons.push('brightness range atypical for sonar imagery');
  }

  // Texture variance (sonar has distinctive texture from acoustic returns)
  if (varMean > 50 && varMean < 8000) {
    score += 25;
  } else if (varMean < 50) {
    reasons.push('insufficient acoustic texture');
  } else {
    reasons.push('texture pattern inconsistent with sonar');
  }

  // Histogram spread (sonar images use a decent range of gray values)
  if (spread > 40 && spread < 240) {
    score += 15;
  } else {
    reasons.push('tonal range atypical for sonar');
  }

  // Aspect ratio (sonar images are often wide strips)
  if (aspectRatio > 0.5 && aspectRatio < 4.0) {
    score += 15;
  } else {
    reasons.push('aspect ratio unusual for sonar imagery');
  }

  const isValid = score >= 60;
  const confidence = Math.min(99, score);

  let reason: string;
  if (isValid) {
    reason = `Image validated as side-scan sonar (confidence: ${confidence}%). Edge density: ${(edgeDensity * 100).toFixed(1)}%, texture variance: ${varMean.toFixed(0)}, tonal range: ${spread} levels.`;
  } else {
    reason = `Image does not appear to be side-scan sonar. ${reasons.join('; ')}. Edge density: ${(edgeDensity * 100).toFixed(1)}%, texture variance: ${varMean.toFixed(0)}.`;
  }

  return { isValid, confidence, reason, metrics };
}

// ─── Connected component labeling for ROI detection ───────────────

interface Region {
  bbox: BoundingBox;
  area: number;
  centroidX: number;
  centroidY: number;
  meanBrightness: number;
  meanVariance: number;
  meanEdge: number;
}

function connectedComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number
): Region[] {
  const labels = new Int32Array(w * h);
  let currentLabel = 0;
  const regions: Region[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 1 && labels[idx] === 0) {
        currentLabel++;
        const queue: number[] = [idx];
        labels[idx] = currentLabel;
        let minX = x, maxX = x, minY = y, maxY = y;
        let area = 0;
        let sumX = 0, sumY = 0;

        while (queue.length > 0) {
          const p = queue.shift()!;
          const px = p % w;
          const py = Math.floor(p / w);
          area++;
          sumX += px;
          sumY += py;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);

          const neighbors = [
            p - 1, p + 1, p - w, p + w,
            p - w - 1, p - w + 1, p + w - 1, p + w + 1,
          ];
          for (const n of neighbors) {
            if (n >= 0 && n < w * h && mask[n] === 1 && labels[n] === 0) {
              const nx = n % w;
              const ny = Math.floor(n / w);
              if (Math.abs(nx - px) <= 1 && Math.abs(ny - py) <= 1) {
                labels[n] = currentLabel;
                queue.push(n);
              }
            }
          }
        }

        if (area >= minArea) {
          regions.push({
            bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
            area,
            centroidX: sumX / area,
            centroidY: sumY / area,
            meanBrightness: 0,
            meanVariance: 0,
            meanEdge: 0,
          });
        }
      }
    }
  }

  return regions;
}

// ─── ROI detection from edge + texture maps ───────────────────────

function detectROIs(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number
): Region[] {
  // Create a saliency mask: pixels that have high edge or high texture variance
  const edgeMax = Math.max(...edges.slice(0, Math.min(edges.length, 100000)));
  const varMax = Math.max(...variance.slice(0, Math.min(variance.length, 100000)));

  const mask = new Uint8Array(w * h);
  const edgeThresh = edgeMax * 0.25;
  const varThresh = varMax * 0.2;

  for (let i = 0; i < w * h; i++) {
    if (edges[i] > edgeThresh || variance[i] > varThresh) {
      mask[i] = 1;
    }
  }

  // Morphological dilation to connect nearby regions
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 1) {
            val = 1;
            break;
          }
        }
        if (val) break;
      }
      dilated[y * w + x] = val;
    }
  }

  const minArea = Math.max(100, Math.floor(w * h * 0.002));
  const regions = connectedComponents(dilated, w, h, minArea);

  // Compute region statistics
  for (const region of regions) {
    let bSum = 0, vSum = 0, eSum = 0, count = 0;
    for (let y = region.bbox.y; y < region.bbox.y + region.bbox.height; y++) {
      for (let x = region.bbox.x; x < region.bbox.x + region.bbox.width; x++) {
        const i = y * w + x;
        bSum += gray[i];
        vSum += variance[i];
        eSum += edges[i];
        count++;
      }
    }
    region.meanBrightness = bSum / count;
    region.meanVariance = vSum / count;
    region.meanEdge = eSum / count;
  }

  // Sort by area descending, take top N
  regions.sort((a, b) => b.area - a.area);
  return regions.slice(0, 9);
}

// ─── Classify a region into a debris type ─────────────────────────

function classifyRegion(region: Region, w: number, h: number): { label: DetectionLabel; isAnomaly: boolean } {
  const aspect = region.bbox.width / Math.max(1, region.bbox.height);
  const sizeRatio = region.area / (w * h);

  // Anomaly: very high edge density, unusual shape, or extreme brightness
  if (region.meanEdge > 120 && sizeRatio > 0.05) {
    return { label: 'anomaly', isAnomaly: true };
  }

  // Fishing net: elongated, high texture variance
  if (aspect > 2.5 && region.meanVariance > 500) {
    return { label: 'fishing_net', isAnomaly: false };
  }

  // Tire: roughly circular, high edge, dark center
  if (aspect > 0.7 && aspect < 1.4 && region.meanEdge > 60 && region.meanBrightness < 100) {
    return { label: 'tire', isAnomaly: false };
  }

  // Barrel: moderate size, high brightness contrast
  if (sizeRatio > 0.02 && sizeRatio < 0.08 && region.meanBrightness > 120) {
    return { label: 'barrel', isAnomaly: false };
  }

  // Shipwreck debris: large, irregular
  if (sizeRatio > 0.06) {
    return { label: 'shipwreck_debris', isAnomaly: false };
  }

  // Metal fragment: small, high edge
  if (region.area < w * h * 0.01 && region.meanEdge > 50) {
    return { label: 'metal_fragment', isAnomaly: false };
  }

  // Plastic debris: default for moderate objects
  return { label: 'plastic_debris', isAnomaly: false };
}

function computeConfidence(region: Region, edgeMax: number, varMax: number): number {
  const edgeScore = Math.min(1, region.meanEdge / (edgeMax * 0.5));
  const varScore = Math.min(1, region.meanVariance / (varMax * 0.5));
  const sizeScore = Math.min(1, region.area / 5000);
  const raw = 0.4 * edgeScore + 0.35 * varScore + 0.25 * sizeScore;
  return Math.round(Math.min(98, Math.max(35, raw * 100)) * 10) / 10;
}

function shadowDetected(region: Region, gray: Float32Array, w: number): boolean {
  // Check if there's a darker region adjacent to the bottom of the bbox
  const shadowY = Math.min(region.bbox.y + region.bbox.height + 5, Math.floor(gray.length / w) - 1);
  if (shadowY >= Math.floor(gray.length / w)) return false;
  let shadowBrightness = 0;
  let count = 0;
  for (let x = region.bbox.x; x < region.bbox.x + region.bbox.width; x++) {
    const i = shadowY * w + x;
    if (i < gray.length) {
      shadowBrightness += gray[i];
      count++;
    }
  }
  if (count === 0) return false;
  return shadowBrightness / count < region.meanBrightness * 0.6;
}

// ─── Model 1: YOLO-style detection (bounding boxes) ──────────────

function runYoloDetection(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number
): ModelDetection {
  const start = performance.now();
  const regions = detectROIs(gray, edges, variance, w, h);
  const edgeMax = Math.max(...edges.slice(0, Math.min(edges.length, 50000)));
  const varMax = Math.max(...variance.slice(0, Math.min(variance.length, 50000)));

  const detections: Detection[] = regions.map((region, i) => {
    const { label, isAnomaly } = classifyRegion(region, w, h);
    return {
      id: `yolo-${i}-${Date.now()}`,
      label,
      labelDisplay: LABEL_DISPLAY[label],
      confidence: computeConfidence(region, edgeMax, varMax),
      bbox: region.bbox,
      isAnomaly,
      area_m2: Math.round((region.area * 0.004) * 100) / 100,
      shadow_detected: shadowDetected(region, gray, w),
      brightness_mean: Math.round(region.meanBrightness),
      texture_score: Math.round(Math.min(100, region.meanVariance / 50)),
      source: 'yolo' as const,
    };
  });

  return {
    model: 'yolo',
    detections,
    processingTimeMs: Math.round(performance.now() - start),
    confidence: detections.length > 0
      ? Math.round((detections.reduce((a, d) => a + d.confidence, 0) / detections.length) * 10) / 10
      : 0,
  };
}

// ─── Model 2: U-Net-style segmentation mask ───────────────────────

function runUnetSegmentation(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number
): { model: ModelDetection; segmentation: SegmentationResult } {
  const start = performance.now();

  // Create segmentation mask: pixels with high edge or variance are "debris"
  const edgeMax = Math.max(...edges.slice(0, Math.min(edges.length, 50000)));
  const varMax = Math.max(...variance.slice(0, Math.min(variance.length, 50000)));
  const edgeThresh = edgeMax * 0.2;
  const varThresh = varMax * 0.15;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskImg = maskCtx.createImageData(w, h);

  let maskPixels = 0;
  for (let i = 0; i < w * h; i++) {
    const isDebris = edges[i] > edgeThresh || variance[i] > varThresh;
    if (isDebris) maskPixels++;
    // Color: debris = cyan overlay, background = transparent
    maskImg.data[i * 4] = isDebris ? 6 : 0;
    maskImg.data[i * 4 + 1] = isDebris ? 182 : 0;
    maskImg.data[i * 4 + 2] = isDebris ? 212 : 0;
    maskImg.data[i * 4 + 3] = isDebris ? 100 : 0;
  }
  maskCtx.putImageData(maskImg, 0, 0);

  const coveragePercent = Math.round((maskPixels / (w * h)) * 1000) / 10;

  // Count regions in mask
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mask[i] = (edges[i] > edgeThresh || variance[i] > varThresh) ? 1 : 0;
  }
  const regions = connectedComponents(mask, w, h, Math.max(50, Math.floor(w * h * 0.001)));

  const elapsed = Math.round(performance.now() - start);

  const model: ModelDetection = {
    model: 'unet',
    detections: [],
    processingTimeMs: elapsed,
    maskCoverage: coveragePercent,
    confidence: Math.min(95, coveragePercent * 3),
  };

  const segmentation: SegmentationResult = {
    maskDataUrl: maskCanvas.toDataURL('image/png'),
    coveragePercent,
    regionCount: regions.length,
    processingTimeMs: elapsed,
  };

  return { model, segmentation };
}

// ─── Model 3: Faster R-CNN-style detection ───────────────────────

function runRcnnDetection(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number
): ModelDetection {
  const start = performance.now();

  // R-CNN uses region proposals — slightly different thresholding
  const edgeMax = Math.max(...edges.slice(0, Math.min(edges.length, 50000)));
  const varMax = Math.max(...variance.slice(0, Math.min(variance.length, 50000)));

  // More selective than YOLO (higher thresholds)
  const mask = new Uint8Array(w * h);
  const edgeThresh = edgeMax * 0.35;
  const varThresh = varMax * 0.3;

  for (let i = 0; i < w * h; i++) {
    if (edges[i] > edgeThresh && variance[i] > varThresh) {
      mask[i] = 1;
    }
  }

  const minArea = Math.max(150, Math.floor(w * h * 0.003));
  const regions = connectedComponents(mask, w, h, minArea);

  const detections: Detection[] = regions.map((region, i) => {
    const { label, isAnomaly } = classifyRegion(region, w, h);
    // R-CNN tends to be more precise but may miss objects
    const conf = computeConfidence(region, edgeMax, varMax);
    const adjustedConf = Math.round(Math.min(97, conf * 1.05) * 10) / 10;
    return {
      id: `rcnn-${i}-${Date.now()}`,
      label,
      labelDisplay: LABEL_DISPLAY[label],
      confidence: adjustedConf,
      bbox: region.bbox,
      isAnomaly,
      area_m2: Math.round((region.area * 0.004) * 100) / 100,
      shadow_detected: shadowDetected(region, gray, w),
      brightness_mean: Math.round(region.meanBrightness),
      texture_score: Math.round(Math.min(100, region.meanVariance / 50)),
      source: 'rcnn' as const,
    };
  });

  return {
    model: 'rcnn',
    detections,
    processingTimeMs: Math.round(performance.now() - start),
    confidence: detections.length > 0
      ? Math.round((detections.reduce((a, d) => a + d.confidence, 0) / detections.length) * 10) / 10
      : 0,
  };
}

// ─── IoU calculation for fusion ──────────────────────────────────

function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const intersection = (x2 - x1) * (y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return intersection / union;
}

// ─── Multi-model fusion ──────────────────────────────────────────

function fuseModels(
  yolo: ModelDetection,
  unet: ModelDetection,
  rcnn: ModelDetection,
  segmentation: SegmentationResult
): FusionResult {
  const notes: string[] = [];

  if (yolo.detections.length === 0 && rcnn.detections.length === 0) {
    return {
      finalDetections: [],
      agreementScore: 0,
      yoloAgreement: 0,
      rcnnAgreement: 0,
      unetAgreement: segmentation.coveragePercent > 5 ? 30 : 0,
      disagreementNotes: ['No objects detected by any detection model'],
      decision: 'no_detection',
      summary: 'No debris or anomalies detected. All models agree the seafloor appears clear.',
    };
  }

  // Match YOLO and R-CNN detections by IoU
  const matched: { yolo?: Detection; rcnn?: Detection; iou: number }[] = [];
  const usedRcnn = new Set<number>();

  for (const yDet of yolo.detections) {
    let bestIou = 0;
    let bestRcnnIdx = -1;
    for (let i = 0; i < rcnn.detections.length; i++) {
      if (usedRcnn.has(i)) continue;
      const score = iou(yDet.bbox, rcnn.detections[i].bbox);
      if (score > bestIou) {
        bestIou = score;
        bestRcnnIdx = i;
      }
    }
    if (bestRcnnIdx >= 0 && bestIou > 0.3) {
      usedRcnn.add(bestRcnnIdx);
      matched.push({ yolo: yDet, rcnn: rcnn.detections[bestRcnnIdx], iou: bestIou });
    } else {
      matched.push({ yolo: yDet, iou: 0 });
    }
  }

  // Add unmatched R-CNN detections
  for (let i = 0; i < rcnn.detections.length; i++) {
    if (!usedRcnn.has(i)) {
      matched.push({ rcnn: rcnn.detections[i], iou: 0 });
    }
  }

  // Build fused detections
  const finalDetections: Detection[] = matched.map((m, idx) => {
    if (m.yolo && m.rcnn && m.iou > 0.3) {
      // Both models agree — high confidence
      const avgConf = (m.yolo.confidence + m.rcnn.confidence) / 2;
      const fusedConf = Math.min(98, avgConf + 5);
      return {
        ...m.yolo,
        id: `fusion-${idx}-${Date.now()}`,
        confidence: Math.round(fusedConf * 10) / 10,
        source: 'fusion',
      };
    } else if (m.yolo) {
      // Only YOLO detected
      return { ...m.yolo, id: `fusion-${idx}-${Date.now()}`, source: 'fusion' as const };
    } else if (m.rcnn) {
      // Only R-CNN detected
      return { ...m.rcnn, id: `fusion-${idx}-${Date.now()}`, source: 'fusion' as const };
    }
    return m.yolo!;
  });

  // Agreement scores
  const bothDetected = matched.filter((m) => m.yolo && m.rcnn).length;
  const agreed = matched.filter((m) => m.iou > 0.3).length;
  const yoloAgreement = yolo.detections.length > 0
    ? Math.round((agreed / yolo.detections.length) * 100)
    : 0;
  const rcnnAgreement = rcnn.detections.length > 0
    ? Math.round((agreed / rcnn.detections.length) * 100)
    : 0;
  const unetAgreement = segmentation.coveragePercent > 3 ? 60 + Math.min(35, segmentation.coveragePercent * 2) : 0;

  const overallAgreement = Math.round(
    (yoloAgreement + rcnnAgreement + unetAgreement) / 3
  );

  // Disagreement notes
  const yoloOnly = matched.filter((m) => m.yolo && !m.rcnn).length;
  const rcnnOnly = matched.filter((m) => m.rcnn && !m.yolo).length;

  if (yoloOnly > 0) {
    notes.push(`YOLO detected ${yoloOnly} object(s) that Faster R-CNN did not confirm`);
  }
  if (rcnnOnly > 0) {
    notes.push(`Faster R-CNN detected ${rcnnOnly} object(s) that YOLO did not confirm`);
  }
  if (agreed > 0 && agreed === bothDetected) {
    notes.push(`Both detection models agree on all ${agreed} matched object(s)`);
  }
  if (segmentation.coveragePercent < 1) {
    notes.push('U-Net segmentation found minimal debris coverage');
  } else if (segmentation.coveragePercent > 15) {
    notes.push(`U-Net segmentation indicates significant debris coverage (${segmentation.coveragePercent}%)`);
  }

  let decision: FusionResult['decision'];
  if (overallAgreement >= 75) {
    decision = 'consensus';
  } else if (overallAgreement >= 50) {
    decision = 'partial_agreement';
  } else {
    decision = 'disagreement';
  }

  const summary = `${finalDetections.length} object(s) detected. Model agreement: ${overallAgreement}% (${decision.replace('_', ' ')}). YOLO: ${yolo.detections.length}, R-CNN: ${rcnn.detections.length}, U-Net coverage: ${segmentation.coveragePercent}%.`;

  return {
    finalDetections,
    agreementScore: overallAgreement,
    yoloAgreement,
    rcnnAgreement,
    unetAgreement,
    disagreementNotes: notes,
    decision,
    summary,
  };
}

// ─── Main analysis pipeline ──────────────────────────────────────

export async function runFullAnalysis(
  imageDataUrl: string,
  threshold: number,
  analysisId: string
): Promise<ScanResult> {
  const startTime = performance.now();

  const img = await loadImage(imageDataUrl);
  const canvas = imageToCanvas(img, 1024);
  const w = canvas.width;
  const h = canvas.height;
  const imageData = getImageData(canvas);
  const imageHash = computeImageHash(canvas);

  // Preprocessing: grayscale
  const gray = toGrayscale(imageData);

  // Sonar validation
  const validation = validateSonar(gray, w, h);
  if (!validation.isValid) {
    return {
      analysisId,
      imageHash,
      detections: [],
      imageWidth: img.naturalWidth,
      imageHeight: img.naturalHeight,
      processingTimeMs: Math.round(performance.now() - startTime),
      modelVersion: MODEL_VERSION,
      threshold,
      yolo: { model: 'yolo', detections: [], processingTimeMs: 0, confidence: 0 },
      unet: { model: 'unet', detections: [], processingTimeMs: 0, confidence: 0 },
      rcnn: { model: 'rcnn', detections: [], processingTimeMs: 0, confidence: 0 },
      segmentation: { maskDataUrl: '', coveragePercent: 0, regionCount: 0, processingTimeMs: 0 },
      fusion: {
        finalDetections: [],
        agreementScore: 0,
        yoloAgreement: 0,
        rcnnAgreement: 0,
        unetAgreement: 0,
        disagreementNotes: ['Image failed sonar validation — analysis skipped'],
        decision: 'no_detection',
        summary: 'Image rejected: does not appear to be side-scan sonar imagery.',
      },
      validation,
      assistantAnalysis: '',
    };
  }

  // Feature extraction
  const edges = sobelEdges(gray, w, h);
  const variance = localVariance(gray, w, h, 4);

  // Run three models
  const yolo = runYoloDetection(gray, edges, variance, w, h);
  const unetResult = runUnetSegmentation(gray, edges, variance, w, h);
  const rcnn = runRcnnDetection(gray, edges, variance, w, h);

  // Fuse results
  const fusion = fuseModels(yolo, unetResult.model, rcnn, unetResult.segmentation);

  // Filter by threshold
  const filteredDetections = fusion.finalDetections.filter((d) => d.confidence >= threshold);

  const elapsed = Math.round(performance.now() - startTime);

  return {
    analysisId,
    imageHash,
    detections: filteredDetections,
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
    processingTimeMs: elapsed,
    modelVersion: MODEL_VERSION,
    threshold,
    yolo,
    unet: unetResult.model,
    rcnn,
    segmentation: unetResult.segmentation,
    fusion,
    validation,
    assistantAnalysis: '',
  };
}
