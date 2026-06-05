import { useState, useRef } from 'react';
import { Upload, X, Camera } from 'lucide-react';
import { compressImageFile } from '../utils/imageCompression';

interface ImageUploadProps {
  value?: string;
  onChange: (base64: string | null) => void;
  label?: string;
  className?: string;
}

export default function ImageUpload({ value, onChange, label = 'Photo', className = '' }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(value || null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      setError('');
      const compressed = await compressImageFile(file);
      setPreview(compressed);
      onChange(compressed);
    } catch (err: any) {
      setError(err?.message || 'Could not upload this image');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleRemove() {
    setPreview(null);
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <div className={className}>
      <label className="form-label">{label}</label>
      <div
        className={`relative border-2 border-dashed rounded-xl transition-all duration-200 ${
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : preview
            ? 'border-transparent'
            : 'border-slate-300 dark:border-slate-600 hover:border-primary-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="relative group">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-40 object-cover rounded-xl"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="p-2 bg-white rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Camera size={18} className="text-slate-700" />
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-8 cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-3">
              <Upload size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Click or drag to upload
            </p>
            <p className="text-xs text-slate-400 mt-1">
      JPG, PNG or GIF, compressed for fast loading
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
