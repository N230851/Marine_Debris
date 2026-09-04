import type { GeoLocation } from '@/types';
import { formatCoordinates } from '@/lib/geotagging';
import { MapPin, Anchor, Compass, Gauge } from 'lucide-react';

interface LocationPanelProps {
  geo: GeoLocation | null;
}

export default function LocationPanel({ geo }: LocationPanelProps) {
  if (!geo) {
    return (
      <div className="text-center py-6 text-abyss-400 text-sm">
        GPS data will appear after scan
      </div>
    );
  }

  // Simple SVG radar-style map
  const angle = (geo.bearing * Math.PI) / 180;
  const arrowX = 50 + Math.sin(angle) * 28;
  const arrowY = 50 - Math.cos(angle) * 28;

  return (
    <div className="space-y-4">
      {/* Radar visualization */}
      <div className="flex justify-center">
        <svg viewBox="0 0 100 100" className="w-40 h-40">
          <defs>
            <radialGradient id="radarGrad">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#radarGrad)" stroke="#006696" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="#006696" strokeWidth="0.3" />
          <circle cx="50" cy="50" r="16" fill="none" stroke="#006696" strokeWidth="0.3" />
          <line x1="50" y1="2" x2="50" y2="98" stroke="#006696" strokeWidth="0.3" />
          <line x1="2" y1="50" x2="98" y2="50" stroke="#006696" strokeWidth="0.3" />
          <circle cx="50" cy="50" r="3" fill="#22d3ee" />
          <line
            x1="50"
            y1="50"
            x2={arrowX}
            y2={arrowY}
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx={arrowX} cy={arrowY} r="2" fill="#22d3ee" className="animate-pulse" />
        </svg>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-abyss-800/40">
          <MapPin className="w-4 h-4 text-sonar-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-abyss-400">Coordinates</p>
            <p className="text-sm font-mono text-abyss-50 truncate">
              {formatCoordinates(geo.latitude, geo.longitude)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-abyss-800/40">
            <Gauge className="w-4 h-4 text-sonar-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-abyss-400">Depth</p>
              <p className="text-sm font-mono text-abyss-50">{geo.depth} m</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-abyss-800/40">
            <Compass className="w-4 h-4 text-sonar-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-abyss-400">Bearing</p>
              <p className="text-sm font-mono text-abyss-50">{geo.bearing}°</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-abyss-800/40">
          <Anchor className="w-4 h-4 text-sonar-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-abyss-400">Survey Vessel</p>
            <p className="text-sm text-abyss-50">{geo.surveyVessel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
