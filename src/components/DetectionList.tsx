import type { Detection } from '@/types';
import { LABEL_COLORS } from '@/types';
import { AlertTriangle, Box, Percent, Ruler, Sun, Grid3x3 } from 'lucide-react';

interface DetectionListProps {
  detections: Detection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function DetectionList({
  detections,
  selectedId,
  onSelect,
}: DetectionListProps) {
  if (detections.length === 0) {
    return (
      <div className="text-center py-8 text-abyss-400 text-sm">
        No detections above threshold
      </div>
    );
  }

  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
      {sorted.map((det) => {
        const color = LABEL_COLORS[det.label];
        const isSelected = selectedId === det.id;
        return (
          <button
            key={det.id}
            onClick={() => onSelect(det.id)}
            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
              isSelected
                ? 'border-sonar-400 bg-sonar-500/10 scale-[1.02]'
                : 'border-abyss-700/50 bg-abyss-800/30 hover:border-abyss-600 hover:bg-abyss-800/50'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {det.isAnomaly ? (
                  <AlertTriangle
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color }}
                  />
                ) : (
                  <Box
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color }}
                  />
                )}
                <span className="font-medium text-sm text-abyss-50">
                  {det.labelDisplay}
                </span>
              </div>
              {det.isAnomaly && (
                <span className="stat-badge bg-danger-500/15 text-danger-400 border border-danger-500/30">
                  ANOMALY
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-abyss-300">
              <span className="flex items-center gap-1.5">
                <Percent className="w-3 h-3 text-sonar-400" />
                <span
                  className="font-mono font-semibold"
                  style={{
                    color:
                      det.confidence >= 75
                        ? '#4ade80'
                        : det.confidence >= 50
                        ? '#fbbf24'
                        : '#f87171',
                  }}
                >
                  {det.confidence}%
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Ruler className="w-3 h-3 text-abyss-400" />
                {det.area_m2} m²
              </span>
              <span className="flex items-center gap-1.5">
                <Sun className="w-3 h-3 text-abyss-400" />
                {det.shadow_detected ? 'Shadow' : 'No shadow'}
              </span>
              <span className="flex items-center gap-1.5">
                <Grid3x3 className="w-3 h-3 text-abyss-400" />
                Tex: {det.texture_score}
              </span>
            </div>

            {/* Confidence bar */}
            <div className="mt-2 h-1 rounded-full bg-abyss-700/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${det.confidence}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
