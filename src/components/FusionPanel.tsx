import type { ScanResult } from '@/types';
import { Layers, Check, AlertTriangle, X, Info } from 'lucide-react';

interface FusionPanelProps {
  scanResult: ScanResult;
}

export default function FusionPanel({ scanResult }: FusionPanelProps) {
  const { fusion, yolo, rcnn, segmentation } = scanResult;

  const decisionStyle: Record<string, { bg: string; text: string; border: string; icon: typeof Check }> = {
    consensus: { bg: 'bg-bio-600/10', text: 'text-bio-400', border: 'border-bio-600/30', icon: Check },
    partial_agreement: { bg: 'bg-warn-500/10', text: 'text-warn-400', border: 'border-warn-500/30', icon: Info },
    disagreement: { bg: 'bg-danger-600/10', text: 'text-danger-400', border: 'border-danger-600/30', icon: AlertTriangle },
    no_detection: { bg: 'bg-navy-700/20', text: 'text-navy-300', border: 'border-navy-600/40', icon: X },
  };

  const style = decisionStyle[fusion.decision] || decisionStyle.no_detection;
  const DecisionIcon = style.icon;

  return (
    <div className="space-y-3">
      {/* Decision banner */}
      <div className={`flex items-center gap-2 p-3 rounded-lg ${style.bg} border ${style.border}`}>
        <DecisionIcon className={`w-4 h-4 ${style.text} flex-shrink-0`} />
        <div>
          <p className={`text-sm font-medium ${style.text}`}>
            {fusion.decision.replace('_', ' ').toUpperCase()}
          </p>
          <p className="text-xs text-navy-400 mt-0.5">{fusion.summary}</p>
        </div>
      </div>

      {/* Per-model results */}
      <div className="grid grid-cols-1 gap-2">
        {/* YOLO */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-navy-800/40 border border-navy-700/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sonar-400" />
            <span className="text-sm font-medium text-navy-100">YOLO</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-navy-300">{yolo.detections.length} objects</span>
            <span className="font-mono text-navy-200">{yolo.confidence}% avg</span>
            <span className="font-mono text-navy-400">{yolo.processingTimeMs}ms</span>
          </div>
        </div>

        {/* U-Net */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-navy-800/40 border border-navy-700/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sonar-300" />
            <span className="text-sm font-medium text-navy-100">U-Net</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-navy-300">{segmentation.regionCount} regions</span>
            <span className="font-mono text-navy-200">{segmentation.coveragePercent}% coverage</span>
            <span className="font-mono text-navy-400">{segmentation.processingTimeMs}ms</span>
          </div>
        </div>

        {/* Faster R-CNN */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-navy-800/40 border border-navy-700/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="text-sm font-medium text-navy-100">Faster R-CNN</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-navy-300">{rcnn.detections.length} objects</span>
            <span className="font-mono text-navy-200">{rcnn.confidence}% avg</span>
            <span className="font-mono text-navy-400">{rcnn.processingTimeMs}ms</span>
          </div>
        </div>
      </div>

      {/* Agreement bars */}
      <div className="space-y-2 p-3 rounded-lg bg-navy-800/40 border border-navy-700/40">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-xs font-medium text-navy-300">Model Agreement</span>
        </div>
        {[
          { label: 'YOLO', value: fusion.yoloAgreement, color: 'bg-sonar-400' },
          { label: 'R-CNN', value: fusion.rcnnAgreement, color: 'bg-violet-400' },
          { label: 'U-Net', value: fusion.unetAgreement, color: 'bg-sonar-300' },
        ].map((m) => (
          <div key={m.label} className="flex items-center gap-2">
            <span className="text-xs text-navy-400 w-12">{m.label}</span>
            <div className="flex-1 h-2 rounded-full bg-navy-700/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${m.color} transition-all duration-500`}
                style={{ width: `${m.value}%` }}
              />
            </div>
            <span className="text-xs font-mono text-navy-300 w-8 text-right">{m.value}%</span>
          </div>
        ))}
      </div>

      {/* Disagreement notes */}
      {fusion.disagreementNotes.length > 0 && (
        <div className="space-y-1.5 p-3 rounded-lg bg-navy-800/40 border border-navy-700/40">
          <p className="text-xs font-medium text-navy-300">Model Notes</p>
          {fusion.disagreementNotes.map((note, i) => (
            <p key={i} className="text-xs text-navy-400 flex items-start gap-1.5">
              <span className="text-sonar-400 mt-0.5">-</span>
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
