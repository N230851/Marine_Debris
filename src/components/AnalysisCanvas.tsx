import { useEffect, useRef, useState } from 'react';
import type { ScanResult, Detection } from '@/types';
import { LABEL_COLORS } from '@/types';

interface AnalysisCanvasProps {
  imageUrl: string;
  scanResult: ScanResult | null;
  isProcessing: boolean;
  selectedDetectionId: string | null;
  onSelectDetection: (id: string | null) => void;
  showSegmentation: boolean;
  showYolo: boolean;
  showRcnn: boolean;
}

export default function AnalysisCanvas({
  imageUrl,
  scanResult,
  isProcessing,
  selectedDetectionId,
  onSelectDetection,
  showSegmentation,
  showYolo,
  showRcnn,
}: AnalysisCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const segImgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [segLoaded, setSegLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (scanResult?.segmentation.maskDataUrl) {
      const segImg = new Image();
      segImg.onload = () => {
        segImgRef.current = segImg;
        setSegLoaded(true);
      };
      segImg.src = scanResult.segmentation.maskDataUrl;
    } else {
      segImgRef.current = null;
      setSegLoaded(false);
    }
  }, [scanResult?.segmentation.maskDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current || !imgLoaded) return;

    const img = imgRef.current;
    const maxW = 900;
    const maxH = 600;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const cw = img.naturalWidth * scale;
    const ch = img.naturalHeight * scale;

    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    // Draw segmentation overlay
    if (showSegmentation && segImgRef.current && segLoaded) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(segImgRef.current, 0, 0, cw, ch);
      ctx.globalAlpha = 1.0;
    }

    if (scanResult) {
      // Draw YOLO detections (dashed boxes)
      if (showYolo) {
        scanResult.yolo.detections.forEach((det) => {
          if (det.id === selectedDetectionId) return;
          const x = det.bbox.x * scale;
          const y = det.bbox.y * scale;
          const w = det.bbox.width * scale;
          const h = det.bbox.height * scale;
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        });
      }

      // Draw R-CNN detections (dotted boxes)
      if (showRcnn) {
        scanResult.rcnn.detections.forEach((det) => {
          if (det.id === selectedDetectionId) return;
          const x = det.bbox.x * scale;
          const y = det.bbox.y * scale;
          const w = det.bbox.width * scale;
          const h = det.bbox.height * scale;
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        });
      }

      // Draw fused detections (solid boxes with labels)
      scanResult.detections.forEach((det: Detection) => {
        const x = det.bbox.x * scale;
        const y = det.bbox.y * scale;
        const w = det.bbox.width * scale;
        const h = det.bbox.height * scale;
        const color = LABEL_COLORS[det.label];
        const isSelected = selectedDetectionId === det.id;

        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash(det.isAnomaly ? [6, 4] : []);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        const labelText = `${det.labelDisplay} ${det.confidence}%`;
        ctx.font = 'bold 11px Inter, sans-serif';
        const textW = ctx.measureText(labelText).width;
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 18, textW + 10, 18);
        ctx.fillStyle = '#0d1b2a';
        ctx.fillText(labelText, x + 5, y - 5);

        if (det.shadow_detected) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x + w * 0.6, y + h, w * 0.4, h * 0.15);
        }
      });
    }
  }, [scanResult, imgLoaded, segLoaded, selectedDetectionId, showSegmentation, showYolo, showRcnn]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!scanResult) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const scale = canvas.width / (imgRef.current?.naturalWidth || 1);
    let clicked: string | null = null;
    for (const det of scanResult.detections) {
      const dx = det.bbox.x * scale;
      const dy = det.bbox.y * scale;
      const dw = det.bbox.width * scale;
      const dh = det.bbox.height * scale;
      if (cx >= dx && cx <= dx + dw && cy >= dy && cy <= dy + dh) {
        clicked = det.id;
        break;
      }
    }
    onSelectDetection(clicked);
  };

  return (
    <div className="relative">
      {isProcessing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-950/80 backdrop-blur-sm rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 border-sonar-600/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-sonar-400 rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sonar-300 font-mono text-sm animate-pulse-soft">
                Running multi-model inference...
              </p>
              <p className="text-navy-400 text-xs mt-1">
                YOLO + U-Net + Faster R-CNN
              </p>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="absolute top-0 bottom-0 w-1 bg-sonar-400/60 shadow-[0_0_12px_2px_rgba(34,211,238,0.4)] animate-scan-sweep pointer-events-none z-20" />
      )}

      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full rounded-lg cursor-pointer"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}
