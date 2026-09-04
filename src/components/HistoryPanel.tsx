import type { ScanRecord } from '@/types';
import { formatCoordinates } from '@/lib/geotagging';
import { Clock, MapPin, Box, Percent, Trash2 } from 'lucide-react';

interface HistoryPanelProps {
  records: ScanRecord[];
  onSelect: (record: ScanRecord) => void;
  onDelete: (id: string) => void;
}

export default function HistoryPanel({
  records,
  onSelect,
  onDelete,
}: HistoryPanelProps) {
  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-abyss-400 text-sm">
        No previous scans. Upload a sonar image to begin.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
      {records.map((rec) => (
        <div
          key={rec.id}
          className="group p-3 rounded-xl border border-abyss-700/50 bg-abyss-800/30 hover:bg-abyss-800/50 hover:border-abyss-600 transition-all duration-200 cursor-pointer"
          onClick={() => onSelect(rec)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-abyss-50 truncate">
                {rec.image_name}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-abyss-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(rec.created_at).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Box className="w-3 h-3" />
                  {rec.detection_count}
                </span>
                <span className="flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  {rec.average_confidence}%
                </span>
              </div>
              {rec.latitude && (
                <p className="flex items-center gap-1 mt-1 text-xs text-abyss-400 font-mono">
                  <MapPin className="w-3 h-3" />
                  {formatCoordinates(rec.latitude, rec.longitude)}
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(rec.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-danger-500/20 text-abyss-400 hover:text-danger-400 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
