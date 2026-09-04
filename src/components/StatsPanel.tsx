import type { ScanResult, Detection } from '@/types';
import { Scan, Target, AlertTriangle, Cpu, Timer, Layers } from 'lucide-react';

interface StatsPanelProps {
  scanResult: ScanResult | null;
  detections: Detection[];
}

export default function StatsPanel({ scanResult, detections }: StatsPanelProps) {
  if (!scanResult) return null;

  const debris = detections.filter((d) => !d.isAnomaly);
  const anomalies = detections.filter((d) => d.isAnomaly);
  const avgConf =
    detections.length > 0
      ? Math.round(
          (detections.reduce((a, d) => a + d.confidence, 0) /
            detections.length) *
            10
        ) / 10
      : 0;
  const highConf = detections.filter((d) => d.confidence >= 75).length;

  const stats = [
    {
      icon: Target,
      label: 'Total Detections',
      value: detections.length,
      color: 'text-sonar-400',
      bg: 'bg-sonar-500/10',
    },
    {
      icon: Layers,
      label: 'Debris Objects',
      value: debris.length,
      color: 'text-warn-400',
      bg: 'bg-warn-500/10',
    },
    {
      icon: AlertTriangle,
      label: 'Anomalies',
      value: anomalies.length,
      color: 'text-danger-400',
      bg: 'bg-danger-500/10',
    },
    {
      icon: Scan,
      label: 'High Confidence',
      value: highConf,
      color: 'text-bio-400',
      bg: 'bg-bio-500/10',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`p-3 rounded-xl ${s.bg} border border-abyss-700/30`}
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-abyss-300">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-abyss-800/30 border border-abyss-700/30">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-sonar-400" />
          <span className="text-xs text-abyss-300">Model:</span>
          <span className="text-xs font-mono text-abyss-100">
            {scanResult.modelVersion}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-sonar-400" />
          <span className="text-xs text-abyss-300">Inference:</span>
          <span className="text-xs font-mono text-abyss-100">
            {scanResult.processingTimeMs} ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-abyss-300">Avg Confidence:</span>
          <span className="text-xs font-mono font-semibold text-bio-400">
            {avgConf}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-abyss-300">Resolution:</span>
          <span className="text-xs font-mono text-abyss-100">
            {scanResult.imageWidth}×{scanResult.imageHeight}
          </span>
        </div>
      </div>
    </div>
  );
}
