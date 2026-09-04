import { useCallback, useRef, useState } from 'react';
import { Upload, Waves, FileImage } from 'lucide-react';

interface UploadZoneProps {
  onImageSelected: (file: File, dataUrl: string) => void;
  disabled?: boolean;
}

export default function UploadZone({ onImageSelected, disabled }: UploadZoneProps) {
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
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-12 transition-all duration-300 group ${
        dragOver
          ? 'border-sonar-400 bg-sonar-500/10 scale-[1.02]'
          : 'border-abyss-600 hover:border-sonar-500/50 hover:bg-abyss-800/30'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
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

      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-sonar-500/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-sonar-500/10 border border-sonar-500/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Upload className="w-8 h-8 text-sonar-400" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-abyss-50">
            Drop sonar image here
          </p>
          <p className="text-sm text-abyss-300 mt-1">
            or click to browse — PNG, JPG, TIFF
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-abyss-400 mt-2">
          <span className="flex items-center gap-1.5">
            <FileImage className="w-3.5 h-3.5" /> Side-scan sonar
          </span>
          <span className="flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5" /> Grayscale imagery
          </span>
        </div>
      </div>
    </div>
  );
}
