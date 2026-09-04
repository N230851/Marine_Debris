import { useCallback, useRef, useState } from 'react';
import { Upload, FileImage, ScanLine, AlertCircle, Check } from 'lucide-react';

interface UploadZoneProps {
  onImageSelected: (file: File, dataUrl: string) => void;
  disabled?: boolean;
  status: 'idle' | 'validating' | 'validated' | 'analyzing' | 'done' | 'error';
  validationMessage?: string;
}

export default function UploadZone({
  onImageSelected,
  disabled,
  status,
  validationMessage,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        onImageSelected(file, e.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [onImageSelected]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-lg p-10 transition-all duration-200 ${
          dragOver
            ? 'border-sonar-400 bg-sonar-500/5'
            : 'border-navy-600 hover:border-navy-500 hover:bg-navy-800/30'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />

        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-lg bg-navy-800 border border-navy-600 flex items-center justify-center">
            <Upload className="w-7 h-7 text-navy-300" />
          </div>

          <div className="text-center">
            <p className="text-base font-medium text-navy-100">
              Drop side-scan sonar image here
            </p>
            <p className="text-sm text-navy-400 mt-1">
              or click to browse — PNG, JPG, TIFF
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-navy-500 mt-1">
            <span className="flex items-center gap-1.5">
              <FileImage className="w-3.5 h-3.5" /> Side-scan sonar
            </span>
            <span className="flex items-center gap-1.5">
              <ScanLine className="w-3.5 h-3.5" /> Grayscale imagery
            </span>
          </div>
        </div>
      </div>

      {status === 'validating' && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-sonar-600/10 border border-sonar-600/30 text-sonar-300 text-sm">
          <div className="w-4 h-4 border-2 border-sonar-400/30 border-t-sonar-400 rounded-full animate-spin" />
          Validating sonar imagery...
        </div>
      )}

      {status === 'validated' && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-bio-600/10 border border-bio-600/30 text-bio-400 text-sm">
          <Check className="w-4 h-4" />
          {validationMessage}
        </div>
      )}

      {status === 'error' && validationMessage && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-danger-600/10 border border-danger-600/30 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {validationMessage}
        </div>
      )}
    </div>
  );
}
