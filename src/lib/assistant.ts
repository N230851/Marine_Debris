import type { ScanResult } from '@/types';

export function generateAssistantAnalysis(result: ScanResult): string {
  if (!result.validation.isValid) {
    return `This image did not pass sonar validation. ${result.validation.reason} No debris analysis was performed. Please upload a genuine side-scan sonar image for analysis.`;
  }

  const { fusion, yolo, rcnn, segmentation, detections } = result;
  const lines: string[] = [];

  // Overall assessment
  lines.push(`Analysis complete for image ${result.imageHash}.`);
  lines.push('');

  // Validation
  lines.push(`Sonar validation: PASSED with ${result.validation.confidence}% confidence. Edge density ${(result.validation.metrics.edgeDensity * 100).toFixed(1)}%, texture variance ${result.validation.metrics.textureVariance.toFixed(0)}, tonal range ${result.validation.metrics.histogramSpread} levels.`);

  // Detection summary
  if (detections.length === 0) {
    lines.push('No debris or anomalies were detected above the confidence threshold.');
    lines.push(`YOLO found ${yolo.detections.length} candidate(s), Faster R-CNN found ${rcnn.detections.length} candidate(s), but none met the ${result.threshold}% confidence filter.`);
    if (segmentation.coveragePercent < 2) {
      lines.push('U-Net segmentation confirms minimal debris coverage, supporting a clear-seafloor assessment.');
    }
    lines.push('');
    lines.push('Recommendation: The seafloor in this image appears clear of significant debris. Consider lowering the confidence threshold if subtle objects may be present.');
    return lines.join(' ');
  }

  // Object breakdown
  const debris = detections.filter((d) => !d.isAnomaly);
  const anomalies = detections.filter((d) => d.isAnomaly);
  const labelCounts: Record<string, number> = {};
  for (const d of detections) {
    labelCounts[d.labelDisplay] = (labelCounts[d.labelDisplay] || 0) + 1;
  }

  lines.push(`Fused detection: ${detections.length} object(s) confirmed — ${debris.length} debris, ${anomalies.length} anomaly/anomalies.`);
  const labelSummary = Object.entries(labelCounts)
    .map(([label, count]) => `${count}x ${label}`)
    .join(', ');
  lines.push(`Classification breakdown: ${labelSummary}.`);

  // Model agreement
  lines.push('');
  lines.push(`Multi-model agreement: ${fusion.agreementScore}% (${fusion.decision.replace('_', ' ')}).`);
  lines.push(`YOLO detected ${yolo.detections.length} object(s) at ${yolo.confidence}% avg confidence (${yolo.processingTimeMs}ms).`);
  lines.push(`Faster R-CNN detected ${rcnn.detections.length} object(s) at ${rcnn.confidence}% avg confidence (${rcnn.processingTimeMs}ms).`);
  lines.push(`U-Net segmentation covered ${segmentation.coveragePercent}% of the image across ${segmentation.regionCount} region(s) (${segmentation.processingTimeMs}ms).`);

  // Disagreement notes
  if (fusion.disagreementNotes.length > 0) {
    lines.push('');
    lines.push('Model notes:');
    for (const note of fusion.disagreementNotes) {
      lines.push(`- ${note}`);
    }
  }

  // Per-object details
  lines.push('');
  lines.push('Object details:');
  for (const d of detections) {
    const confLevel = d.confidence >= 75 ? 'high' : d.confidence >= 50 ? 'moderate' : 'low';
    lines.push(`- ${d.labelDisplay}: ${d.confidence}% confidence (${confLevel}), ${d.area_m2}m² area, ${d.shadow_detected ? 'acoustic shadow detected' : 'no shadow'}, brightness ${d.brightness_mean}, texture ${d.texture_score}.`);
  }

  // Recommendation
  lines.push('');
  if (anomalies.length > 0) {
    lines.push('Recommendation: Anomaly/anomalies detected — manual review advised. The models flagged regions with unusual acoustic signatures that do not match known debris classes.');
  } else if (fusion.decision === 'disagreement') {
    lines.push('Recommendation: Models disagree on some detections. Manual review recommended for low-confidence objects.');
  } else {
    lines.push('Recommendation: Detection consensus is strong. Objects are classified with good model agreement. Standard reporting is appropriate.');
  }

  return lines.join(' ');
}
