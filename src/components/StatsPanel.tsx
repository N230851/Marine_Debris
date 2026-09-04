import type { ScanResult, Detection } from '@/types';
import { Target, AlertTriangle, Layers, CheckCircle2, Cpu, Timer, ScanLine } from 'lucide-react';

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

  const stats = [
    {
      icon: Target,
      label: 'Total Objects',
      value: detections.length,
      color: 'text-sonar-400',
      bg: 'bg-sonar-600/10',
    },
    {
      icon: Layers,
      label: 'Debris',
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
      icon: CheckCircle2,
      label: 'Avg Confidence',
      value: `${avgConf}%`,
      color: 'text-bio-400',
      bg: 'bg-bio-600/10',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`p-3 rounded-lg ${s.bg} border border-navy-700/40`}
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-navy-300">{s.label}</span>
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-navy-800/40 border border-navy-700/40">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-navy-400" />
          <span className="text-xs text-navy-400">Model:</span>
          <span className="text-xs font-mono text-navy-200">
            {scanResult.modelVersion}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-navy-400" />
          <span className="text-xs text-navy-400">Total:</span>
          <span className="text-xs font-mono text-navy-200">
            {scanResult.processingTimeMs}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-navy-400" />
          <span className="text-xs text-navy-400">Resolution:</span>
          <span className="text-xs font-mono text-navy-200">
            {scanResult.imageWidth}x{scanResult.imageHeight}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-400">Agreement:</span>
          <span className="text-xs font-mono font-semibold text-sonar-300">
            {scanResult.fusion.agreementScore}%
          </span>
        </div>
      </div>
    </div>
  );
}
