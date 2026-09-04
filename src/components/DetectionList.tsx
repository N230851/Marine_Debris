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
      <div className="text-center py-6 text-navy-400 text-sm">
        No detections above threshold
      </div>
    );
  }

  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {sorted.map((det) => {
        const color = LABEL_COLORS[det.label];
        const isSelected = selectedId === det.id;
        return (
          <button
            key={det.id}
            onClick={() => onSelect(det.id)}
            className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
              isSelected
                ? 'border-sonar-400 bg-sonar-600/10'
                : 'border-navy-700/50 bg-navy-800/30 hover:border-navy-600 hover:bg-navy-800/50'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {det.isAnomaly ? (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color }} />
                ) : (
                  <Box className="w-4 h-4 flex-shrink-0" style={{ color }} />
                )}
                <span className="font-medium text-sm text-navy-50">
                  {det.labelDisplay}
                </span>
              </div>
              {det.isAnomaly && (
                <span className="label-tag bg-danger-600/15 text-danger-400 border border-danger-600/30">
                  ANOMALY
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-navy-300">
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
                <Ruler className="w-3 h-3 text-navy-400" />
                {det.area_m2} m2
              </span>
              <span className="flex items-center gap-1.5">
                <Sun className="w-3 h-3 text-navy-400" />
                {det.shadow_detected ? 'Shadow' : 'No shadow'}
              </span>
              <span className="flex items-center gap-1.5">
                <Grid3x3 className="w-3 h-3 text-navy-400" />
                Tex: {det.texture_score}
              </span>
            </div>

            <div className="mt-2 h-1 rounded-full bg-navy-700/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
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
