import React, { useState, useRef } from 'react';
import {
  Upload,
  Link2,
  CloudDownload,
  X,
  SlidersHorizontal,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  FileVideo,
} from 'lucide-react';
import {
  CONSOLE_CLOUD_CAPTURES,
  ConsoleCloudCapture,
  MAX_CLIP_DURATION_SECONDS,
  formatTimestamp,
} from '../utils/gameplayEngine';

interface ClipImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocalFile: (file: File) => void;
  onImportLink: (url: string) => void;
  onImportConsoleCapture: (capture: ConsoleCloudCapture) => void;
  validationError: string | null;
  linkStatusMessage: string | null;
}

export const ClipImportModal: React.FC<ClipImportModalProps> = ({
  isOpen,
  onClose,
  onSelectLocalFile,
  onImportLink,
  onImportConsoleCapture,
  validationError,
  linkStatusMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'link' | 'console'>('upload');
  const [directUrl, setDirectUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSelectLocalFile(file);
      onClose();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectLocalFile(file);
      onClose();
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (directUrl.trim()) {
      onImportLink(directUrl.trim());
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white ring-1 ring-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 id="import-modal-title" className="text-base font-bold text-slate-900">
                Load Gameplay Clip (Max 5:00)
              </h2>
              <p className="text-xs text-slate-500">
                Upload local file, paste a stream clip link, or pull from console cloud.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close clip import dialog"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 pt-3 border-b border-slate-100 flex items-center gap-2 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Local Video File
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'link'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Twitch / YouTube / Medal Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('console')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'console'
                ? 'border-sky-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Console Cloud Storage
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {validationError && (
            <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-sky-500 bg-sky-50/70 scale-[0.99]'
                    : 'border-slate-200 hover:border-sky-400 hover:bg-slate-50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
                  <FileVideo className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Drop your gameplay clip here or <span className="text-sky-600 underline">browse files</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Supports MP4, MOV, WebM, MKV up to 5 minutes (300s). Longer clips auto-trim to the best 5-minute action window.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>⚡ On-device compression &amp; instant AI game detection</span>
                <span className="font-mono tabular-nums">Max {formatTimestamp(MAX_CLIP_DURATION_SECONDS)}</span>
              </div>
            </div>
          )}

          {activeTab === 'link' && (
            <form onSubmit={handleLinkSubmit} className="space-y-3">
              <label htmlFor="import-direct-url" className="block text-xs font-semibold text-slate-700">
                Paste clip link from Twitch, YouTube, Medal.tv, or Steam
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="import-direct-url"
                  type="url"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="https://clips.twitch.tv/... or https://medal.tv/..."
                  className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={!directUrl.trim()}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Import Link</span>
                </button>
              </div>
              {linkStatusMessage && (
                <p className="text-xs text-emerald-700 font-medium">{linkStatusMessage}</p>
              )}
            </form>
          )}

          {activeTab === 'console' && (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {CONSOLE_CLOUD_CAPTURES.map((cap) => (
                <div
                  key={cap.id}
                  className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="text-sky-600 font-bold">{cap.network}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{formatTimestamp(cap.rawDurationSeconds)}</span>
                      <span>·</span>
                      <span>{cap.rawSizeMb} MB</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">{cap.title}</p>
                    <p className="text-[11px] text-slate-500">{cap.resolution} · {cap.capturedAt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onImportConsoleCapture(cap);
                      onClose();
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
                  >
                    <CloudDownload className="w-3.5 h-3.5" />
                    <span>Pull Clip</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>FrameSense · Made by Legion</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 text-slate-700 font-medium hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
