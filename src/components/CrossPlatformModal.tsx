import React, { useState } from 'react';
import { Monitor, Smartphone, Apple, Check, Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface CrossPlatformModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CrossPlatformModal: React.FC<CrossPlatformModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [selectedTab, setSelectedTab] = useState<'desktop' | 'android' | 'apple'>(
    isIOS ? 'apple' : isAndroid ? 'android' : 'desktop'
  );
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDirectInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setInstallNotice('FrameSense App installed to your device launcher.');
      }
    } else {
      setInstallNotice(
        selectedTab === 'apple'
          ? 'On Safari (iOS/macOS), tap Share -> Add to Home Screen / Add to Dock to finish installing.'
          : selectedTab === 'android'
          ? 'In Chrome on Android, tap the browser menu (⋮) -> Install App / Add to Home Screen.'
          : 'In Chrome, Edge, or Brave on Desktop, click the Install icon in the right side of the address bar.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cross-platform-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs text-sky-600 font-semibold">
              Desktop · Android · Apple iOS &amp; macOS · Made by Legion
            </p>
            <h2 id="cross-platform-modal-title" className="text-xl font-bold text-slate-900 mt-0.5">
              {isInstalled
                ? 'FrameSense Standalone App Active & Running'
                : 'Install FrameSense App Across All Your Devices'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close app installation dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isInstalled && (
          <div className="mt-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-300 p-4 text-xs text-emerald-900 flex items-start gap-3">
            <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-emerald-950 text-sm">
                Application is Already Installed on this Device
              </p>
              <p className="text-emerald-800 leading-relaxed">
                FrameSense is active in standalone app mode with background replay buffer, local 05:00 smart-trimming, and screen recording hotkey (<strong>Ctrl + Alt + Enter</strong>) enabled.
              </p>
            </div>
          </div>
        )}

        {/* Platform Switcher Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl mt-5">
          <button
            type="button"
            onClick={() => {
              setSelectedTab('desktop');
              setInstallNotice(null);
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              selectedTab === 'desktop'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Monitor className="w-4 h-4 shrink-0 text-sky-600" />
            <span>Desktop App</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedTab('android');
              setInstallNotice(null);
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              selectedTab === 'android'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0 text-sky-600" />
            <span>Android App</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedTab('apple');
              setInstallNotice(null);
            }}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              selectedTab === 'apple'
                ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Apple className="w-4 h-4 shrink-0 text-sky-600" />
            <span>Apple iOS / macOS</span>
          </button>
        </div>

        {/* Platform Instructions */}
        <div className="mt-5 space-y-4">
          {selectedTab === 'desktop' && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Windows, macOS &amp; Linux Standalone Desktop App
                </h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  60fps Scrubbing · Hotkeys
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Run FrameSense in its own dedicated desktop window alongside Steam, Riot Client, or Battle.net. Drag and drop clips straight from NVIDIA ShadowPlay, OBS, Medal.tv, or Windows Game Bar (`Win + Alt + G`).
              </p>
              <ol className="text-xs text-slate-700 space-y-2 pt-1">
                <li>1. Click <strong>Install FrameSense Now</strong> below (or click the install icon in your browser address bar).</li>
                <li>2. Pin FrameSense to your Windows Taskbar or macOS Dock for instant post-match VOD review.</li>
                <li>3. Drop any MP4, WebM, or MKV clip up to <strong>05:00 max</strong> directly onto the analyzer canvas.</li>
              </ol>
            </div>
          )}

          {selectedTab === 'android' && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Android Native Home Screen App
                </h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  Touch Scrub · Offline Cache
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Designed for mobile competitive gamers (Wild Rift, Mobile Legends, COD Mobile, PUBG Mobile, Brawl Stars, Honor of Kings) and console companion capture apps.
              </p>
              <ol className="text-xs text-slate-700 space-y-2 pt-1">
                <li>1. Tap <strong>Install FrameSense Now</strong> below or open the Chrome menu (<strong>⋮</strong>) and tap <strong>Install app</strong>.</li>
                <li>2. Record your mobile match using Android Game Booster / Screen Recorder (keep clips under <strong>05:00</strong>).</li>
                <li>3. Open FrameSense from your Android app drawer and tap <strong>Upload Gameplay Clip</strong> to pick from Gallery.</li>
              </ol>
            </div>
          )}

          {selectedTab === 'apple' && (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Apple iPhone, iPad &amp; macOS Safari Web App
                </h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  iOS 17+ Standalone · ReplayKit
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Full-screen standalone experience on iOS and iPadOS with native Photos picker integration for iOS Control Center Screen Recordings, PlayStation App captures, and Xbox App clips.
              </p>
              <ol className="text-xs text-slate-700 space-y-2 pt-1">
                <li>1. In Safari on iPhone or iPad, tap the <strong>Share</strong> button in the navigation bar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
                <li>3. Launch FrameSense from your Home Screen and import any Camera Roll gameplay clip up to <strong>05:00</strong>.</li>
              </ol>
            </div>
          )}

          {installNotice && (
            <div className="rounded-xl bg-sky-50 ring-1 ring-sky-200 px-4 py-3 text-xs text-sky-900 font-medium">
              {installNotice}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {isInstalled ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold">
                <Check className="w-4 h-4" /> Installed in Standalone App Mode
              </span>
            ) : (
              <span>PWA Service Worker Ready · Works Offline with Saved Coaching Sessions</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Done
            </button>
            {!isInstalled && (
              <button
                type="button"
                onClick={handleDirectInstall}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Install FrameSense Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
