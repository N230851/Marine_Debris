import type { ScanResult } from '@/types';
import { ShieldCheck, ShieldAlert, Activity, BarChart3 } from 'lucide-react';

interface ValidationPanelProps {
  scanResult: ScanResult | null;
}

export default function ValidationPanel({ scanResult }: ValidationPanelProps) {
  if (!scanResult) return null;

  const { validation } = scanResult;
  const m = validation.metrics;

  const metrics = [
    { label: 'Edge Density', value: `${(m.edgeDensity * 100).toFixed(1)}%`, icon: Activity },
    { label: 'Texture Variance', value: m.textureVariance.toFixed(0), icon: BarChart3 },
    { label: 'Tonal Range', value: `${m.histogramSpread} levels`, icon: BarChart3 },
    { label: 'Aspect Ratio', value: m.aspectRatio.toFixed(2), icon: Activity },
  ];

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center gap-2 p-3 rounded-lg border ${
          validation.isValid
            ? 'bg-bio-600/10 border-bio-600/30'
            : 'bg-danger-600/10 border-danger-600/30'
        }`}
      >
        {validation.isValid ? (
          <ShieldCheck className="w-5 h-5 text-bio-400 flex-shrink-0" />
        ) : (
          <ShieldAlert className="w-5 h-5 text-danger-400 flex-shrink-0" />
        )}
        <div>
          <p
            className={`text-sm font-medium ${
              validation.isValid ? 'text-bio-400' : 'text-danger-400'
            }`}
          >
            {validation.isValid ? 'SONAR VALIDATED' : 'VALIDATION FAILED'}
          </p>
          <p className="text-xs text-navy-400 mt-0.5">
            Confidence: {validation.confidence}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="p-2.5 rounded-lg bg-navy-800/40 border border-navy-700/40"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <metric.icon className="w-3 h-3 text-navy-400" />
              <span className="text-xs text-navy-400">{metric.label}</span>
            </div>
            <p className="text-sm font-mono text-navy-100">{metric.value}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-navy-400 leading-relaxed">{validation.reason}</p>
    </div>
  );
}
