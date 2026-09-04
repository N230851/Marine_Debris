import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Radar,
  SlidersHorizontal,
  History,
  Trash2,
  RotateCcw,
  Waves,
  Bot,
  Layers,
  ShieldCheck,
  MapPin,
  ScanLine,
  Eye,
  EyeOff,
  Play,
} from 'lucide-react';
import UploadZone from '@/components/UploadZone';
import AnalysisCanvas from '@/components/AnalysisCanvas';
import DetectionList from '@/components/DetectionList';
import LocationPanel from '@/components/LocationPanel';
import ReportGenerator from '@/components/ReportGenerator';
import HistoryPanel from '@/components/HistoryPanel';
import StatsPanel from '@/components/StatsPanel';
import FusionPanel from '@/components/FusionPanel';
import AssistantPanel from '@/components/AssistantPanel';
import ValidationPanel from '@/components/ValidationPanel';
import { runFullAnalysis, computeImageHash } from '@/lib/detection';
import { generateAssistantAnalysis } from '@/lib/assistant';
import { generateGeoLocation } from '@/lib/geotagging';
import { supabase } from '@/lib/supabase';
import type { ScanResult, GeoLocation, Detection, ScanRecord } from '@/types';

type AppState = 'idle' | 'uploaded' | 'analyzing' | 'results' | 'error';

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [threshold, setThreshold] = useState(50);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | undefined>(undefined);
  const [showSegmentation, setShowSegmentation] = useState(true);
  const [showYolo, setShowYolo] = useState(false);
  const [showRcnn, setShowRcnn] = useState(false);
  const [activeTab, setActiveTab] = useState<'fusion' | 'assistant' | 'validation'>('fusion');

  const analysisIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      return;
    }
    setHistory((data || []) as ScanRecord[]);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleImageSelected = useCallback(
    async (file: File, dataUrl: string) => {
      // Generate unique analysis ID for stale-response protection
      const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      analysisIdRef.current = analysisId;

      setImageFile(file);
      setImageUrl(dataUrl);
      setScanResult(null);
      setGeoLocation(null);
      setSelectedDetectionId(null);
      setError(null);
      setValidationMsg(undefined);
      setAppState('uploaded');
    },
    []
  );

  const handleAnalyze = useCallback(async () => {
    if (!imageFile || !imageUrl) return;

    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    analysisIdRef.current = analysisId;

    setAppState('analyzing');
    setError(null);
    setValidationMsg(undefined);

    try {
      const result = await runFullAnalysis(imageUrl, threshold, analysisId);

      // Stale-response protection: discard if a newer analysis was started
      if (analysisIdRef.current !== analysisId) return;

      if (!result.validation.isValid) {
        setScanResult(result);
        setAppState('error');
        setValidationMsg(result.validation.reason);
        return;
      }

      const geo = generateGeoLocation(imageFile.name);
      const assistantText = generateAssistantAnalysis(result);
      const finalResult = { ...result, assistantAnalysis: assistantText };

      setScanResult(finalResult);
      setGeoLocation(geo);
      setAppState('results');
      setActiveTab('fusion');

      // Save to Supabase
      const avgConf =
        finalResult.detections.length > 0
          ? Math.round(
              (finalResult.detections.reduce((a, d) => a + d.confidence, 0) /
                finalResult.detections.length) *
                10
            ) / 10
          : 0;

      await supabase.from('scans').insert({
        image_name: imageFile.name,
        image_width: finalResult.imageWidth,
        image_height: finalResult.imageHeight,
        latitude: geo.latitude,
        longitude: geo.longitude,
        depth: geo.depth,
        detection_count: finalResult.detections.length,
        average_confidence: avgConf,
        detections: finalResult.detections,
        model_used: finalResult.modelVersion,
        yolo_detections: finalResult.yolo.detections,
        rcnn_detections: finalResult.rcnn.detections,
        model_agreement: finalResult.fusion.agreementScore,
        is_sonar_validated: finalResult.validation.isValid,
        validation_confidence: finalResult.validation.confidence,
        validation_reason: finalResult.validation.reason,
        fusion_result: finalResult.fusion,
        assistant_analysis: assistantText,
        image_hash: finalResult.imageHash,
      });

      loadHistory();
    } catch (err) {
      if (analysisIdRef.current !== analysisId) return;
      setError(err instanceof Error ? err.message : 'Analysis failed unexpectedly');
      setAppState('error');
    }
  }, [imageFile, imageUrl, threshold, loadHistory]);

  const handleReset = useCallback(() => {
    analysisIdRef.current = null;
    setImageFile(null);
    setImageUrl(null);
    setScanResult(null);
    setGeoLocation(null);
    setSelectedDetectionId(null);
    setError(null);
    setValidationMsg(undefined);
    setAppState('idle');
  }, []);

  const handleDeleteScan = useCallback(
    async (id: string) => {
      await supabase.from('scans').delete().eq('id', id);
      loadHistory();
    },
    [loadHistory]
  );

  const handleSelectHistory = useCallback((rec: ScanRecord) => {
    setImageUrl(null);
    setImageFile({ name: rec.image_name } as File);
    setScanResult({
      analysisId: rec.id,
      imageHash: rec.image_hash || '',
      detections: rec.detections as Detection[],
      imageWidth: rec.image_width,
      imageHeight: rec.image_height,
      processingTimeMs: 0,
      modelVersion: rec.model_used || 'DeepScan-MultiModel-v2.0',
      threshold: 50,
      yolo: { model: 'yolo', detections: rec.yolo_detections || [], processingTimeMs: 0, confidence: 0 },
      unet: { model: 'unet', detections: [], processingTimeMs: 0, confidence: 0 },
      rcnn: { model: 'rcnn', detections: rec.rcnn_detections || [], processingTimeMs: 0, confidence: 0 },
      segmentation: { maskDataUrl: '', coveragePercent: 0, regionCount: 0, processingTimeMs: 0 },
      fusion: rec.fusion_result || {
        finalDetections: rec.detections,
        agreementScore: rec.model_agreement || 0,
        yoloAgreement: 0,
        rcnnAgreement: 0,
        unetAgreement: 0,
        disagreementNotes: [],
        decision: 'consensus',
        summary: 'Archived scan',
      },
      validation: {
        isValid: rec.is_sonar_validated ?? true,
        confidence: rec.validation_confidence ?? 0,
        reason: rec.validation_reason || '',
        metrics: { grayscaleRatio: 1, edgeDensity: 0, textureVariance: 0, histogramSpread: 0, aspectRatio: 1 },
      },
      assistantAnalysis: rec.assistant_analysis || '',
    });
    setGeoLocation({
      latitude: rec.latitude,
      longitude: rec.longitude,
      depth: rec.depth,
      bearing: 0,
      surveyVessel: 'Archived',
    });
    setSelectedDetectionId(null);
    setAppState('results');
  }, []);

  const detections = scanResult?.detections || [];
  const selectedDetection = detections.find((d) => d.id === selectedDetectionId);

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-navy-800 bg-navy-950/95 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-navy-800 border border-navy-600 flex items-center justify-center">
              <Radar className="w-5 h-5 text-sonar-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-navy-50 leading-tight">
                DeepScan AI
              </h1>
              <p className="text-xs text-navy-400 leading-tight">
                Marine Debris Detection — Multi-Model Pipeline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {appState === 'results' && scanResult && (
              <button
                onClick={handleAnalyze}
                className="btn-ghost flex items-center gap-2 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Re-analyze</span>
              </button>
            )}
            {(imageFile || scanResult) && (
              <button
                onClick={handleReset}
                className="btn-ghost flex items-center gap-2 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Upload section */}
        {appState === 'idle' && (
          <div className="max-w-2xl mx-auto pt-8 animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-navy-50 mb-3">
                AI-Powered Underwater Debris Detection
              </h2>
              <p className="text-navy-300 max-w-xl mx-auto">
                Upload side-scan sonar imagery for multi-model analysis. The system
                validates sonar authenticity, runs YOLO, U-Net, and Faster R-CNN,
                then fuses results into an evidence-based detection report.
              </p>
            </div>
            <UploadZone
              onImageSelected={handleImageSelected}
              status="idle"
            />
          </div>
        )}

        {/* Uploaded but not yet analyzed */}
        {appState === 'uploaded' && imageUrl && (
          <div className="max-w-3xl mx-auto pt-6 animate-fade-in">
            <div className="panel p-4">
              <div className="flex items-center gap-2 mb-3">
                <ScanLine className="w-4 h-4 text-sonar-400" />
                <h3 className="text-sm font-semibold text-navy-100">
                  Image Ready for Analysis
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="sm:w-1/2">
                  <img
                    src={imageUrl}
                    alt="Uploaded sonar"
                    className="w-full rounded-lg border border-navy-700"
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-navy-400">File</p>
                    <p className="text-sm text-navy-100 font-mono">{imageFile?.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-navy-400">Confidence Threshold</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={30}
                        max={90}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value))}
                        className="flex-1 accent-sonar-500"
                      />
                      <span className="text-sm font-mono font-semibold text-sonar-300 w-12 text-right">
                        {threshold}%
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Analyze Sonar Image
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analyzing */}
        {appState === 'analyzing' && imageUrl && (
          <div className="max-w-3xl mx-auto pt-6 animate-fade-in">
            <div className="panel p-4">
              <AnalysisCanvas
                imageUrl={imageUrl}
                scanResult={null}
                isProcessing={true}
                selectedDetectionId={null}
                onSelectDetection={() => {}}
                showSegmentation={false}
                showYolo={false}
                showRcnn={false}
              />
            </div>
          </div>
        )}

        {/* Results / Error */}
        {(appState === 'results' || appState === 'error') && (
          <div className="space-y-4 animate-fade-in">
            {/* Stats bar */}
            {scanResult && <StatsPanel scanResult={scanResult} detections={detections} />}

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Image analysis — 2 cols */}
              <div className="lg:col-span-2 panel p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Waves className="w-4 h-4 text-sonar-400" />
                    <h3 className="text-sm font-semibold text-navy-100">
                      Sonar Image Analysis
                    </h3>
                  </div>
                  {/* Layer toggles */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSegmentation(!showSegmentation)}
                      className={`label-tag border transition-all ${
                        showSegmentation
                          ? 'bg-sonar-600/20 text-sonar-300 border-sonar-600/40'
                          : 'bg-navy-800 text-navy-400 border-navy-700'
                      }`}
                    >
                      {showSegmentation ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      Seg
                    </button>
                    <button
                      onClick={() => setShowYolo(!showYolo)}
                      className={`label-tag border transition-all ${
                        showYolo
                          ? 'bg-sonar-600/20 text-sonar-300 border-sonar-600/40'
                          : 'bg-navy-800 text-navy-400 border-navy-700'
                      }`}
                    >
                      {showYolo ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      YOLO
                    </button>
                    <button
                      onClick={() => setShowRcnn(!showRcnn)}
                      className={`label-tag border transition-all ${
                        showRcnn
                          ? 'bg-sonar-600/20 text-sonar-300 border-sonar-600/40'
                          : 'bg-navy-800 text-navy-400 border-navy-700'
                      }`}
                    >
                      {showRcnn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      R-CNN
                    </button>
                  </div>
                </div>

                {imageUrl ? (
                  <AnalysisCanvas
                    imageUrl={imageUrl}
                    scanResult={scanResult}
                    isProcessing={false}
                    selectedDetectionId={selectedDetectionId}
                    onSelectDetection={setSelectedDetectionId}
                    showSegmentation={showSegmentation}
                    showYolo={showYolo}
                    showRcnn={showRcnn}
                  />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center bg-navy-900/40 rounded-lg border border-navy-700/30">
                    <div className="text-center">
                      <ScanLine className="w-10 h-10 text-navy-600 mx-auto mb-2" />
                      <p className="text-navy-400 text-sm">
                        Archived scan — image not available
                      </p>
                    </div>
                  </div>
                )}

                {/* Layer legend */}
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-navy-400">
                  <span className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-sonar-400" style={{ borderTop: '2px dashed #22d3ee' }} />
                    YOLO
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5" style={{ borderTop: '2px dotted #a78bfa' }} />
                    R-CNN
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 bg-sonar-300" />
                    Fused (solid)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-sonar-400/40 rounded-sm" />
                    Segmentation
                  </span>
                </div>

                {selectedDetection && (
                  <div className="mt-3 p-3 rounded-lg bg-navy-800/40 border border-sonar-600/30 animate-slide-up">
                    <p className="text-sm font-medium text-sonar-300">
                      {selectedDetection.labelDisplay}
                    </p>
                    <p className="text-xs text-navy-300 mt-1">
                      Confidence:{' '}
                      <span className="font-mono font-semibold text-bio-400">
                        {selectedDetection.confidence}%
                      </span>{' '}
                      — Area: {selectedDetection.area_m2} m2 — Shadow:{' '}
                      {selectedDetection.shadow_detected ? 'Detected' : 'None'} —
                      Source: {selectedDetection.source}
                    </p>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Confidence threshold */}
                <div className="panel p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <SlidersHorizontal className="w-4 h-4 text-sonar-400" />
                    <h3 className="text-sm font-semibold text-navy-100">
                      Confidence Filter
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={30}
                      max={90}
                      value={threshold}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setThreshold(v);
                        if (scanResult) {
                          setScanResult({
                            ...scanResult,
                            threshold: v,
                            detections: scanResult.fusion.finalDetections.filter(
                              (d) => d.confidence >= v
                            ),
                          });
                        }
                      }}
                      className="flex-1 accent-sonar-500"
                    />
                    <span className="text-sm font-mono font-semibold text-sonar-300 w-12 text-right">
                      {threshold}%
                    </span>
                  </div>
                </div>

                {/* Detection list */}
                <div className="panel p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Radar className="w-4 h-4 text-sonar-400" />
                      <h3 className="text-sm font-semibold text-navy-100">
                        Detected Objects
                      </h3>
                    </div>
                    <span className="stat-badge bg-sonar-600/10 text-sonar-300 border border-sonar-600/30">
                      {detections.length} found
                    </span>
                  </div>
                  <DetectionList
                    detections={detections}
                    selectedId={selectedDetectionId}
                    onSelect={setSelectedDetectionId}
                  />
                </div>

                {/* Location */}
                <div className="panel p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-sonar-400" />
                    <h3 className="text-sm font-semibold text-navy-100">
                      Geolocation
                    </h3>
                  </div>
                  <LocationPanel geo={geoLocation} />
                </div>
              </div>
            </div>

            {/* Tabbed panel: Fusion / Assistant / Validation */}
            <div className="panel p-4">
              <div className="flex items-center gap-1 mb-4 border-b border-navy-700/50 pb-2">
                <button
                  onClick={() => setActiveTab('fusion')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                    activeTab === 'fusion'
                      ? 'bg-sonar-600/20 text-sonar-300'
                      : 'text-navy-400 hover:text-navy-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Model Fusion
                </button>
                <button
                  onClick={() => setActiveTab('assistant')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                    activeTab === 'assistant'
                      ? 'bg-sonar-600/20 text-sonar-300'
                      : 'text-navy-400 hover:text-navy-200'
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  Analysis Assistant
                </button>
                <button
                  onClick={() => setActiveTab('validation')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                    activeTab === 'validation'
                      ? 'bg-sonar-600/20 text-sonar-300'
                      : 'text-navy-400 hover:text-navy-200'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Validation
                </button>
              </div>

              {activeTab === 'fusion' && scanResult && (
                <FusionPanel scanResult={scanResult} />
              )}
              {activeTab === 'assistant' && (
                <AssistantPanel scanResult={scanResult} />
              )}
              {activeTab === 'validation' && (
                <ValidationPanel scanResult={scanResult} />
              )}
            </div>

            {/* Report + History */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 panel p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-navy-100">
                      Export Detection Report
                    </h3>
                    <p className="text-xs text-navy-400 mt-0.5">
                      Download full scan results with multi-model fusion data,
                      bounding boxes, confidence scores, and GPS coordinates.
                    </p>
                  </div>
                  <ReportGenerator
                    detections={detections}
                    geo={geoLocation}
                    scanResult={scanResult}
                    imageName={imageFile?.name || 'scan'}
                  />
                </div>
              </div>

              <div className="panel p-4">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-sonar-400" />
                  <h3 className="text-sm font-semibold text-navy-100">
                    Scan History
                  </h3>
                </div>
                <HistoryPanel
                  records={history}
                  onSelect={handleSelectHistory}
                  onDelete={handleDeleteScan}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {appState === 'error' && !scanResult && error && (
          <div className="max-w-2xl mx-auto pt-8">
            <div className="panel p-6 text-center">
              <p className="text-danger-400 text-sm">{error}</p>
              <button onClick={handleReset} className="btn-ghost mt-4">
                Try Again
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-navy-800 mt-8">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 text-center">
          <p className="text-xs text-navy-500">
            DeepScan AI — Multi-Model Sonar Marine Debris Detection ·
            YOLO + U-Net + Faster R-CNN Fusion Pipeline
          </p>
        </div>
      </footer>
    </div>
  );
}
