import { useEffect, useRef, useState } from 'react';
import type { Detection, ScanResult } from '@/types';
import { LABEL_COLORS } from '@/types';

interface SonarCanvasProps {
  imageUrl: string;
  scanResult: ScanResult | null;
  isProcessing: boolean;
  selectedDetectionId: string | null;
  onSelectDetection: (id: string | null) => void;
}

export default function SonarCanvas({
  imageUrl,
  scanResult,
  isProcessing,
  selectedDetectionId,
  onSelectDetection,
}: SonarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

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

    if (scanResult) {
      scanResult.detections.forEach((det) => {
        const x = det.bbox.x * scale;
        const y = det.bbox.y * scale;
        const w = det.bbox.width * scale;
        const h = det.bbox.height * scale;
        const color = LABEL_COLORS[det.label];
        const isSelected = selectedDetectionId === det.id;

        // Box
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash(det.isAnomaly ? [6, 4] : []);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        // Label background
        const labelText = `${det.labelDisplay} ${det.confidence}%`;
        ctx.font = 'bold 12px Inter, sans-serif';
        const textW = ctx.measureText(labelText).width;
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 20, textW + 12, 20);

        // Label text
        ctx.fillStyle = '#000a14';
        ctx.fillText(labelText, x + 6, y - 6);

        // Shadow indicator
        if (det.shadow_detected) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x + w * 0.6, y + h, w * 0.4, h * 0.15);
        }
      });
    }
  }, [scanResult, imgLoaded, selectedDetectionId]);

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
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-abyss-950/70 backdrop-blur-sm rounded-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-2 border-sonar-500/30 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-sonar-400 rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sonar-300 font-mono text-sm animate-pulse">
                Running YOLOv8 inference...
              </p>
              <p className="text-abyss-400 text-xs mt-1">
                Analyzing sonar returns
              </p>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="absolute left-0 right-0 h-0.5 bg-sonar-400/80 shadow-[0_0_20px_4px_rgba(34,211,238,0.5)] animate-scan-line pointer-events-none z-20" />
      )}

      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full rounded-xl cursor-pointer"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  );
}
