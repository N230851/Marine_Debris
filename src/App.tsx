import { useEffect, useState, useCallback } from 'react';
import {
  Waves,
  Radar,
  SlidersHorizontal,
  History,
  Trash2,
  RotateCcw,
  Activity,
} from 'lucide-react';
import UploadZone from '@/components/UploadZone';
import SonarCanvas from '@/components/SonarCanvas';
import DetectionList from '@/components/DetectionList';
import LocationPanel from '@/components/LocationPanel';
import ReportGenerator from '@/components/ReportGenerator';
import HistoryPanel from '@/components/HistoryPanel';
import StatsPanel from '@/components/StatsPanel';
import { runDetection } from '@/lib/detection';
import { generateGeoLocation } from '@/lib/geotagging';
import { supabase } from '@/lib/supabase';
import type { ScanResult, GeoLocation, Detection, ScanRecord } from '@/types';

export default function App() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [threshold, setThreshold] = useState(50);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(
    null
  );
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load history from Supabase
  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      setError('Could not load scan history');
      return;
    }
    setHistory((data || []) as ScanRecord[]);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleImageSelected = useCallback(
    async (file: File, dataUrl: string) => {
      setImageFile(file);
      setImageUrl(dataUrl);
      setScanResult(null);
      setGeoLocation(null);
      setSelectedDetectionId(null);
      setError(null);
      setIsProcessing(true);

      try {
        const result = await runDetection(file, threshold, dataUrl);
        const geo = generateGeoLocation(file.name);
        setScanResult(result);
        setGeoLocation(geo);

        // Save to Supabase
        const avgConf =
          result.detections.length > 0
            ? Math.round(
                (result.detections.reduce((a, d) => a + d.confidence, 0) /
                  result.detections.length) *
                  10
              ) / 10
            : 0;

        const { error: insertError } = await supabase.from('scans').insert({
          image_name: file.name,
          image_width: result.imageWidth,
          image_height: result.imageHeight,
          latitude: geo.latitude,
          longitude: geo.longitude,
          depth: geo.depth,
          detection_count: result.detections.length,
          average_confidence: avgConf,
          detections: result.detections,
        });

        if (insertError) {
          console.error('Failed to save scan:', insertError);
        }

        loadHistory();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Detection failed unexpectedly'
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [threshold, loadHistory]
  );

  const handleRerun = useCallback(async () => {
    if (!imageFile || !imageUrl) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await runDetection(imageFile, threshold, imageUrl);
      setScanResult(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Re-scan failed'
      );
    } finally {
      setIsProcessing(false);
    }
  }, [imageFile, imageUrl, threshold]);

  const handleReset = useCallback(() => {
    setImageFile(null);
    setImageUrl(null);
    setScanResult(null);
    setGeoLocation(null);
    setSelectedDetectionId(null);
    setError(null);
  }, []);

  const handleDeleteScan = useCallback(
    async (id: string) => {
      const { error: delError } = await supabase
        .from('scans')
        .delete()
        .eq('id', id);
      if (delError) {
        setError('Could not delete scan');
        return;
      }
      loadHistory();
    },
    [loadHistory]
  );

  const handleSelectHistory = useCallback((rec: ScanRecord) => {
    setImageUrl(null);
    setImageFile({ name: rec.image_name } as File);
    setScanResult({
      detections: rec.detections as Detection[],
      imageWidth: rec.image_width,
      imageHeight: rec.image_height,
      processingTimeMs: 0,
      modelVersion: 'YOLOv8-sonar-v1.2.0',
      threshold: 50,
    });
    setGeoLocation({
      latitude: rec.latitude,
      longitude: rec.longitude,
      depth: rec.depth,
      bearing: 0,
      surveyVessel: 'Archived',
    });
    setSelectedDetectionId(null);
  }, []);

  const detections = scanResult?.detections || [];
  const selectedDetection = detections.find(
    (d) => d.id === selectedDetectionId
  );

  return (
    <div className="min-h-screen bg-abyss-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-abyss-800/50 bg-abyss-950/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-sonar-500/30 rounded-lg blur-md" />
              <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-sonar-500 to-abyss-700 flex items-center justify-center">
                <Radar className="w-5 h-5 text-abyss-950" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-abyss-50 leading-tight">
                DeepScan AI
              </h1>
              <p className="text-xs text-abyss-400 leading-tight">
                Marine Debris & Anomaly Detection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {scanResult && (
              <button
                onClick={handleRerun}
                disabled={isProcessing}
                className="btn-ghost flex items-center gap-2 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Re-scan</span>
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
        {!imageUrl && !scanResult && (
          <div className="max-w-2xl mx-auto pt-8 animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold text-abyss-50 mb-3">
                AI-Powered Underwater Debris Detection
              </h2>
              <p className="text-abyss-300 max-w-xl mx-auto">
                Upload side-scan sonar imagery and let the AI automatically
                detect marine debris, classify objects, flag anomalies, and
                generate geotagged reports.
              </p>
            </div>
            <UploadZone onImageSelected={handleImageSelected} />
            {error && (
              <div className="mt-4 p-3 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm text-center">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Dashboard */}
        {(imageUrl || scanResult) && (
          <div className="space-y-4 animate-fade-in">
            {/* Stats bar */}
            <StatsPanel scanResult={scanResult} detections={detections} />

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sonar image — 2 cols */}
              <div className="lg:col-span-2 glass-panel p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Waves className="w-4 h-4 text-sonar-400" />
                  <h3 className="text-sm font-semibold text-abyss-100">
                    Sonar Image Analysis
                  </h3>
                </div>
                {imageUrl ? (
                  <SonarCanvas
                    imageUrl={imageUrl}
                    scanResult={scanResult}
                    isProcessing={isProcessing}
                    selectedDetectionId={selectedDetectionId}
                    onSelectDetection={setSelectedDetectionId}
                  />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center bg-abyss-900/40 rounded-xl border border-abyss-700/30">
                    <div className="text-center">
                      <Activity className="w-10 h-10 text-abyss-600 mx-auto mb-2" />
                      <p className="text-abyss-400 text-sm">
                        Archived scan — image not available
                      </p>
                    </div>
                  </div>
                )}
                {selectedDetection && (
                  <div className="mt-3 p-3 rounded-lg bg-abyss-800/40 border border-sonar-500/30 animate-slide-up">
                    <p className="text-sm font-medium text-sonar-300">
                      {selectedDetection.labelDisplay}
                    </p>
                    <p className="text-xs text-abyss-300 mt-1">
                      Confidence:{' '}
                      <span className="font-mono font-semibold text-bio-400">
                        {selectedDetection.confidence}%
                      </span>{' '}
                      — Area: {selectedDetection.area_m2} m² — Shadow:{' '}
                      {selectedDetection.shadow_detected ? 'Detected' : 'None'}
                    </p>
                  </div>
                )}
              </div>

              {/* Right column: detections + location */}
              <div className="space-y-4">
                {/* Confidence threshold */}
                <div className="glass-panel p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <SlidersHorizontal className="w-4 h-4 text-sonar-400" />
                    <h3 className="text-sm font-semibold text-abyss-100">
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
                            detections: scanResult.detections.filter(
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
                <div className="glass-panel p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Radar className="w-4 h-4 text-sonar-400" />
                      <h3 className="text-sm font-semibold text-abyss-100">
                        Detected Objects
                      </h3>
                    </div>
                    <span className="stat-badge bg-sonar-500/10 text-sonar-300 border border-sonar-500/30">
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
                <div className="glass-panel p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Radar className="w-4 h-4 text-sonar-400" />
                    <h3 className="text-sm font-semibold text-abyss-100">
                      Geolocation
                    </h3>
                  </div>
                  <LocationPanel geo={geoLocation} />
                </div>
              </div>
            </div>

            {/* Report + History */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 glass-panel p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-abyss-100">
                      Export Detection Report
                    </h3>
                    <p className="text-xs text-abyss-400 mt-0.5">
                      Download full scan results with bounding boxes, confidence
                      scores, and GPS coordinates.
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

              <div className="glass-panel p-4">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-sonar-400" />
                  <h3 className="text-sm font-semibold text-abyss-100">
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
      </main>

      <footer className="border-t border-abyss-800/50 mt-8">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 text-center">
          <p className="text-xs text-abyss-500">
            DeepScan AI — Side-Scan Sonar Marine Debris Detection Prototype ·
            YOLOv8-sonar-v1.2.0
          </p>
        </div>
      </footer>
    </div>
  );
}
