import { useState } from 'react';
import type { ScanResult } from '@/types';
import { Bot, Send, User } from 'lucide-react';

interface AssistantPanelProps {
  scanResult: ScanResult | null;
}

interface Message {
  role: 'assistant' | 'user';
  text: string;
}

export default function AssistantPanel({ scanResult }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const analysis = scanResult?.assistantAnalysis || '';

  const handleSend = () => {
    if (!input.trim() || !scanResult) return;

    const userMsg: Message = { role: 'user', text: input };
    const response = generateResponse(input, scanResult);
    const assistantMsg: Message = { role: 'assistant', text: response };

    setMessages([...messages, userMsg, assistantMsg]);
    setInput('');
  };

  if (!scanResult) {
    return (
      <div className="text-center py-6 text-navy-400 text-sm">
        Analysis assistant will be available after scan
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Initial analysis */}
      {messages.length === 0 && analysis && (
        <div className="flex gap-2.5 p-3 rounded-lg bg-navy-800/40 border border-navy-700/40">
          <Bot className="w-5 h-5 text-sonar-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-navy-200 leading-relaxed whitespace-pre-line">
            {analysis}
          </div>
        </div>
      )}

      {/* Chat messages */}
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex gap-2.5 p-3 rounded-lg ${
            msg.role === 'assistant'
              ? 'bg-navy-800/40 border border-navy-700/40'
              : 'bg-navy-800/20 border border-navy-700/20'
          }`}
        >
          {msg.role === 'assistant' ? (
            <Bot className="w-5 h-5 text-sonar-400 flex-shrink-0 mt-0.5" />
          ) : (
            <User className="w-5 h-5 text-navy-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm text-navy-200 leading-relaxed">{msg.text}</div>
        </div>
      ))}

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about this analysis..."
          className="flex-1 px-3 py-2 rounded-md bg-navy-800 border border-navy-700 text-sm text-navy-100 placeholder:text-navy-500 focus:outline-none focus:border-sonar-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="btn-primary px-3 py-2"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function generateResponse(question: string, result: ScanResult): string {
  const q = question.toLowerCase();
  const { detections, fusion, yolo, rcnn, segmentation, validation } = result;

  if (q.includes('confidence') || q.includes('sure') || q.includes('reliable')) {
    if (detections.length === 0) return 'No detections were made, so there is no confidence to assess.';
    const avg = detections.reduce((a, d) => a + d.confidence, 0) / detections.length;
    const high = detections.filter((d) => d.confidence >= 75).length;
    return `Average confidence across ${detections.length} detection(s) is ${avg.toFixed(1)}%. ${high} detection(s) have high confidence (>=75%). The overall model agreement is ${fusion.agreementScore}%.`;
  }

  if (q.includes('anomaly') || q.includes('anomalies')) {
    const anomalies = detections.filter((d) => d.isAnomaly);
    if (anomalies.length === 0) return 'No anomalies were detected in this image. All detected objects were classified as known debris types.';
    return `${anomalies.length} anomaly/anomalies detected. These regions showed unusual acoustic signatures that did not match known debris classes. Manual review is recommended.`;
  }

  if (q.includes('yolo')) {
    return `YOLO detected ${yolo.detections.length} object(s) at ${yolo.confidence}% average confidence in ${yolo.processingTimeMs}ms. ${yolo.detections.length > 0 ? `Detected types: ${yolo.detections.map((d) => d.labelDisplay).join(', ')}.` : 'No objects found.'}`;
  }

  if (q.includes('rcnn') || q.includes('r-cnn') || q.includes('faster')) {
    return `Faster R-CNN detected ${rcnn.detections.length} object(s) at ${rcnn.confidence}% average confidence in ${rcnn.processingTimeMs}ms. ${rcnn.detections.length > 0 ? `Detected types: ${rcnn.detections.map((d) => d.labelDisplay).join(', ')}.` : 'No objects found.'}`;
  }

  if (q.includes('unet') || q.includes('segment') || q.includes('mask')) {
    return `U-Net segmentation identified ${segmentation.regionCount} debris region(s) covering ${segmentation.coveragePercent}% of the image in ${segmentation.processingTimeMs}ms. ${segmentation.coveragePercent > 10 ? 'This indicates significant debris coverage.' : segmentation.coveragePercent > 2 ? 'This indicates moderate debris presence.' : 'Minimal debris coverage detected.'}`;
  }

  if (q.includes('agree') || q.includes('disagree') || q.includes('fusion')) {
    return `Multi-model fusion: ${fusion.decision.replace('_', ' ')} at ${fusion.agreementScore}% overall agreement. YOLO agreement: ${fusion.yoloAgreement}%, R-CNN agreement: ${fusion.rcnnAgreement}%, U-Net agreement: ${fusion.unetAgreement}%. ${fusion.disagreementNotes.length > 0 ? 'Notes: ' + fusion.disagreementNotes.join('; ') : 'All models are in full agreement.'}`;
  }

  if (q.includes('valid') || q.includes('sonar') || q.includes('real')) {
    return `Sonar validation: ${validation.isValid ? 'PASSED' : 'FAILED'} at ${validation.confidence}% confidence. ${validation.reason}`;
  }

  if (q.includes('recommend') || q.includes('action') || q.includes('next')) {
    if (detections.length === 0) return 'No debris detected. The seafloor appears clear. You may lower the confidence threshold to check for subtle objects, or proceed to the next survey area.';
    if (detections.some((d) => d.isAnomaly)) return 'Anomalies detected — manual review is recommended. Consider deploying an ROV for closer inspection of the flagged regions.';
    if (fusion.decision === 'disagreement') return 'Models disagree on some detections. Review low-confidence objects manually before including in the survey report.';
    return 'Detection consensus is strong. Objects are classified with good model agreement. Standard reporting is appropriate — export the JSON or CSV report for your records.';
  }

  if (q.includes('count') || q.includes('how many') || q.includes('number')) {
    return `${detections.length} object(s) detected above the ${result.threshold}% confidence threshold. ${detections.filter((d) => !d.isAnomaly).length} classified as debris, ${detections.filter((d) => d.isAnomaly).length} as anomalies.`;
  }

  return `Based on this analysis: ${detections.length} object(s) detected with ${fusion.agreementScore}% model agreement. You can ask me about specific detections, model outputs (YOLO, U-Net, R-CNN), confidence levels, anomalies, or recommendations.`;
}
