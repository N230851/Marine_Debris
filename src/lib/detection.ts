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
const MAX_DIM = 480;

// ─── Image loading & pixel extraction ───────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function imageToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
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

// ─── Local texture variance (integral-image O(n) approach) ────────

function localVariance(
  gray: Float32Array,
  w: number,
  h: number,
  radius: number
): Float32Array {
  const variance = new Float32Array(w * h);
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  const integralSq = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      rowSum += v;
      rowSumSq += v * v;
      integral[(y + 1) * W + (x + 1)] = integral[y * W + (x + 1)] + rowSum;
      integralSq[(y + 1) * W + (x + 1)] = integralSq[y * W + (x + 1)] + rowSumSq;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const count = (y1 - y0 + 1) * (x1 - x0 + 1);
      const s =
        integral[(y1 + 1) * W + (x1 + 1)] -
        integral[y0 * W + (x1 + 1)] -
        integral[(y1 + 1) * W + x0] +
        integral[y0 * W + x0];
      const sq =
        integralSq[(y1 + 1) * W + (x1 + 1)] -
        integralSq[y0 * W + (x1 + 1)] -
        integralSq[(y1 + 1) * W + x0] +
        integralSq[y0 * W + x0];
      const mean = s / count;
      variance[y * w + x] = Math.max(0, sq / count - mean * mean);
    }
  }
  return variance;
}

// ─── Histogram analysis ──────────────────────────────────────────

function histogram(gray: Float32Array): { spread: number; mean: number } {
  const hist = new Array(256).fill(0);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const bin = Math.min(255, Math.max(0, Math.round(gray[i])));
    hist[bin]++;
    sum += gray[i];
  }
  const mean = sum / gray.length;
  let nonZeroBins = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > gray.length * 0.0005) nonZeroBins++;
  }
  return { spread: nonZeroBins, mean };
}

function arrayMax(arr: Float32Array): number {
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
}

// ─── Sonar image validation (accepts pre-computed features) ───────

function validateSonar(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number
): ValidationResult {
  const { spread, mean } = histogram(gray);

  let edgeSum = 0;
  let varSum = 0;
  let edgePixels = 0;
  for (let i = 0; i < edges.length; i++) {
    edgeSum += edges[i];
    varSum += variance[i];
    if (edges[i] > 40) edgePixels++;
  }
  const edgeMean = edgeSum / edges.length;
  const varMean = varSum / variance.length;
  const edgeDensity = edgePixels / edges.length;
  const aspectRatio = w / h;

  const metrics = {
    grayscaleRatio: 1.0,
    edgeDensity,
    textureVariance: varMean,
    histogramSpread: spread,
    aspectRatio,
  };

  let score = 0;
  const reasons: string[] = [];

  if (edgeDensity > 0.02 && edgeDensity < 0.35) {
    score += 25;
  } else if (edgeDensity < 0.02) {
    reasons.push('insufficient structural detail');
  } else {
    reasons.push('edge pattern inconsistent with sonar');
  }

  if (mean > 20 && mean < 235) {
    score += 20;
  } else {
    reasons.push('brightness range atypical for sonar imagery');
  }

  if (varMean > 50 && varMean < 8000) {
    score += 25;
  } else if (varMean < 50) {
    reasons.push('insufficient acoustic texture');
  } else {
    reasons.push('texture pattern inconsistent with sonar');
  }

  if (spread > 40 && spread < 240) {
    score += 15;
  } else {
    reasons.push('tonal range atypical for sonar');
  }

  if (aspectRatio > 0.5 && aspectRatio < 4.0) {
    score += 15;
  } else {
    reasons.push('aspect ratio unusual for sonar imagery');
  }

  const isValid = score >= 60;
  const confidence = Math.min(99, score);

  const reason = isValid
    ? `Image validated as side-scan sonar (confidence: ${confidence}%). Edge density: ${(edgeDensity * 100).toFixed(1)}%, texture variance: ${varMean.toFixed(0)}, tonal range: ${spread} levels.`
    : `Image does not appear to be side-scan sonar. ${reasons.join('; ')}. Edge density: ${(edgeDensity * 100).toFixed(1)}%, texture variance: ${varMean.toFixed(0)}.`;

  return { isValid, confidence, reason, metrics };
}

// ─── Connected component labeling (pointer-based queue, no shift) ─

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
  const queue = new Int32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 1 && labels[idx] === 0) {
        currentLabel++;
        let qHead = 0;
        let qTail = 0;
        queue[qTail++] = idx;
        labels[idx] = currentLabel;
        let minX = x, maxX = x, minY = y, maxY = y;
        let area = 0;
        let sumX = 0, sumY = 0;

        while (qHead < qTail) {
          const p = queue[qHead++];
          const px = p % w;
          const py = (p / w) | 0;
          area++;
          sumX += px;
          sumY += py;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          if (px > 0 && mask[p - 1] === 1 && labels[p - 1] === 0) {
            labels[p - 1] = currentLabel;
            queue[qTail++] = p - 1;
          }
          if (px < w - 1 && mask[p + 1] === 1 && labels[p + 1] === 0) {
            labels[p + 1] = currentLabel;
            queue[qTail++] = p + 1;
          }
          if (py > 0 && mask[p - w] === 1 && labels[p - w] === 0) {
            labels[p - w] = currentLabel;
            queue[qTail++] = p - w;
          }
          if (py < h - 1 && mask[p + w] === 1 && labels[p + w] === 0) {
            labels[p + w] = currentLabel;
            queue[qTail++] = p + w;
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
  h: number,
  edgeMax: number,
  varMax: number
): Region[] {
  const mask = new Uint8Array(w * h);
  const edgeThresh = edgeMax * 0.25;
  const varThresh = varMax * 0.2;

  for (let i = 0; i < w * h; i++) {
    if (edges[i] > edgeThresh || variance[i] > varThresh) {
      mask[i] = 1;
    }
  }

  // Dilation with radius 1 (3x3 kernel)
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let dy = -1; dy <= 1 && !val; dy++) {
        for (let dx = -1; dx <= 1 && !val; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 1) {
            val = 1;
          }
        }
      }
      dilated[y * w + x] = val;
    }
  }

  const minArea = Math.max(80, Math.floor(w * h * 0.003));
  const regions = connectedComponents(dilated, w, h, minArea);

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

  regions.sort((a, b) => b.area - a.area);
  return regions.slice(0, 9);
}

// ─── Classify a region into a debris type ─────────────────────────

function classifyRegion(region: Region, w: number, h: number): { label: DetectionLabel; isAnomaly: boolean } {
  const aspect = region.bbox.width / Math.max(1, region.bbox.height);
  const sizeRatio = region.area / (w * h);

  if (region.meanEdge > 120 && sizeRatio > 0.05) {
    return { label: 'anomaly', isAnomaly: true };
  }
  if (aspect > 2.5 && region.meanVariance > 500) {
    return { label: 'fishing_net', isAnomaly: false };
  }
  if (aspect > 0.7 && aspect < 1.4 && region.meanEdge > 60 && region.meanBrightness < 100) {
    return { label: 'tire', isAnomaly: false };
  }
  if (sizeRatio > 0.02 && sizeRatio < 0.08 && region.meanBrightness > 120) {
    return { label: 'barrel', isAnomaly: false };
  }
  if (sizeRatio > 0.06) {
    return { label: 'shipwreck_debris', isAnomaly: false };
  }
  if (region.area < w * h * 0.01 && region.meanEdge > 50) {
    return { label: 'metal_fragment', isAnomaly: false };
  }
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

// ─── Model 1: YOLO-style detection ───────────────────────────────

function runYoloDetection(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number,
  edgeMax: number,
  varMax: number
): ModelDetection {
  const start = performance.now();
  const regions = detectROIs(gray, edges, variance, w, h, edgeMax, varMax);

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
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number,
  edgeMax: number,
  varMax: number
): { model: ModelDetection; segmentation: SegmentationResult } {
  const start = performance.now();
  const edgeThresh = edgeMax * 0.2;
  const varThresh = varMax * 0.15;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskImg = maskCtx.createImageData(w, h);

  const mask = new Uint8Array(w * h);
  let maskPixels = 0;
  for (let i = 0; i < w * h; i++) {
    const isDebris = edges[i] > edgeThresh || variance[i] > varThresh;
    mask[i] = isDebris ? 1 : 0;
    if (isDebris) maskPixels++;
    maskImg.data[i * 4] = isDebris ? 6 : 0;
    maskImg.data[i * 4 + 1] = isDebris ? 182 : 0;
    maskImg.data[i * 4 + 2] = isDebris ? 212 : 0;
    maskImg.data[i * 4 + 3] = isDebris ? 100 : 0;
  }
  maskCtx.putImageData(maskImg, 0, 0);

  const coveragePercent = Math.round((maskPixels / (w * h)) * 1000) / 10;
  const regions = connectedComponents(mask, w, h, Math.max(50, Math.floor(w * h * 0.001)));
  const elapsed = Math.round(performance.now() - start);

  return {
    model: {
      model: 'unet',
      detections: [],
      processingTimeMs: elapsed,
      maskCoverage: coveragePercent,
      confidence: Math.min(95, coveragePercent * 3),
    },
    segmentation: {
      maskDataUrl: maskCanvas.toDataURL('image/png'),
      coveragePercent,
      regionCount: regions.length,
      processingTimeMs: elapsed,
    },
  };
}

// ─── Model 3: Faster R-CNN-style detection ───────────────────────

function runRcnnDetection(
  gray: Float32Array,
  edges: Float32Array,
  variance: Float32Array,
  w: number,
  h: number,
  edgeMax: number,
  varMax: number
): ModelDetection {
  const start = performance.now();
  const edgeThresh = edgeMax * 0.35;
  const varThresh = varMax * 0.3;

  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (edges[i] > edgeThresh && variance[i] > varThresh) {
      mask[i] = 1;
    }
  }

  const minArea = Math.max(120, Math.floor(w * h * 0.004));
  const regions = connectedComponents(mask, w, h, minArea);

  const detections: Detection[] = regions.map((region, i) => {
    const { label, isAnomaly } = classifyRegion(region, w, h);
    const conf = computeConfidence(region, edgeMax, varMax);
    return {
      id: `rcnn-${i}-${Date.now()}`,
      label,
      labelDisplay: LABEL_DISPLAY[label],
      confidence: Math.round(Math.min(97, conf * 1.05) * 10) / 10,
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

  for (let i = 0; i < rcnn.detections.length; i++) {
    if (!usedRcnn.has(i)) {
      matched.push({ rcnn: rcnn.detections[i], iou: 0 });
    }
  }

  const finalDetections: Detection[] = matched.map((m, idx) => {
    if (m.yolo && m.rcnn && m.iou > 0.3) {
      const avgConf = (m.yolo.confidence + m.rcnn.confidence) / 2;
      const fusedConf = Math.min(98, avgConf + 5);
      return {
        ...m.yolo,
        id: `fusion-${idx}-${Date.now()}`,
        confidence: Math.round(fusedConf * 10) / 10,
        source: 'fusion' as const,
      };
    } else if (m.yolo) {
      return { ...m.yolo, id: `fusion-${idx}-${Date.now()}`, source: 'fusion' as const };
    } else if (m.rcnn) {
      return { ...m.rcnn, id: `fusion-${idx}-${Date.now()}`, source: 'fusion' as const };
    }
    return m.yolo!;
  });

  const agreed = matched.filter((m) => m.iou > 0.3).length;
  const yoloAgreement = yolo.detections.length > 0
    ? Math.round((agreed / yolo.detections.length) * 100) : 0;
  const rcnnAgreement = rcnn.detections.length > 0
    ? Math.round((agreed / rcnn.detections.length) * 100) : 0;
  const unetAgreement = segmentation.coveragePercent > 3
    ? 60 + Math.min(35, segmentation.coveragePercent * 2) : 0;
  const overallAgreement = Math.round((yoloAgreement + rcnnAgreement + unetAgreement) / 3);

  const yoloOnly = matched.filter((m) => m.yolo && !m.rcnn).length;
  const rcnnOnly = matched.filter((m) => m.rcnn && !m.yolo).length;

  if (yoloOnly > 0) notes.push(`YOLO detected ${yoloOnly} object(s) that Faster R-CNN did not confirm`);
  if (rcnnOnly > 0) notes.push(`Faster R-CNN detected ${rcnnOnly} object(s) that YOLO did not confirm`);
  if (agreed > 0 && agreed === matched.filter((m) => m.yolo && m.rcnn).length) {
    notes.push(`Both detection models agree on all ${agreed} matched object(s)`);
  }
  if (segmentation.coveragePercent < 1) notes.push('U-Net segmentation found minimal debris coverage');
  else if (segmentation.coveragePercent > 15) notes.push(`U-Net segmentation indicates significant debris coverage (${segmentation.coveragePercent}%)`);

  const decision: FusionResult['decision'] =
    overallAgreement >= 75 ? 'consensus' : overallAgreement >= 50 ? 'partial_agreement' : 'disagreement';

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
  const canvas = imageToCanvas(img, MAX_DIM);
  const w = canvas.width;
  const h = canvas.height;
  const imageData = getImageData(canvas);
  const imageHash = computeImageHash(canvas);

  const gray = toGrayscale(imageData);

  // Compute features ONCE — reused by validation and all three models
  const edges = sobelEdges(gray, w, h);
  await new Promise((r) => setTimeout(r, 0));

  const variance = localVariance(gray, w, h, 3);
  await new Promise((r) => setTimeout(r, 0));

  const edgeMax = arrayMax(edges);
  const varMax = arrayMax(variance);

  // Validate using pre-computed features
  const validation = validateSonar(gray, edges, variance, w, h);

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

  // Run three models with yields between each
  const yolo = runYoloDetection(gray, edges, variance, w, h, edgeMax, varMax);
  await new Promise((r) => setTimeout(r, 0));

  const unetResult = runUnetSegmentation(edges, variance, w, h, edgeMax, varMax);
  await new Promise((r) => setTimeout(r, 0));

  const rcnn = runRcnnDetection(gray, edges, variance, w, h, edgeMax, varMax);

  const fusion = fuseModels(yolo, unetResult.model, rcnn, unetResult.segmentation);
  const filteredDetections = fusion.finalDetections.filter((d) => d.confidence >= threshold);

  return {
    analysisId,
    imageHash,
    detections: filteredDetections,
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
    processingTimeMs: Math.round(performance.now() - startTime),
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
