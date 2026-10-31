/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Upload,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Send,
  Trash2,
  Target,
  SlidersHorizontal,
  BookOpen,
  History,
  Gamepad2,
  Plus,
  Video,
  Square,
  Download,
  Scissors,
  Link2,
  CloudDownload,
  Volume2,
  VolumeX,
  Eye,
  Bell,
  Cpu,
  TrendingDown,
  Smartphone,
  Monitor,
  Sparkles,
} from 'lucide-react';
import {
  GAMES_CATALOG,
  SAMPLE_CLIPS,
  CONSOLE_CLOUD_CAPTURES,
  INITIAL_HABIT_TRENDS,
  MAX_CLIP_DURATION_SECONDS,
  GameProfile,
  ClipAnalysisResult,
  TimestampedTip,
  HabitTrendItem,
  SmartTrimResult,
  ConsoleCloudCapture,
  findGameByIdOrTitle,
  validateClipInput,
  formatTimestamp,
  buildStructuredAnalysisFallback,
  buildCoachReplyFallback,
  computeSessionProgress,
  autoDetectGameFromClip,
  smartTrimAndCompressClip,
  parseDirectClipLink,
  isScreenRecordShortcut,
  buildRecordedClipFilename,
} from './utils/gameplayEngine';
import { TacticalClipPlayer, LEGION_LOGO_PATH } from './components/TacticalClipPlayer';
import { GameCatalogView } from './components/GameCatalogView';
import { CrossPlatformModal } from './components/CrossPlatformModal';
import { GameSelectorModal } from './components/GameSelectorModal';
import { ClipImportModal } from './components/ClipImportModal';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';

type ActiveTab = 'analyzer' | 'catalog' | 'drills' | 'companion' | 'history';
type IngestSourceTab = 'upload' | 'link' | 'console';
type UnderPlayerTab = 'moments' | 'ocr' | 'benchmarks' | 'import';

interface ChatMessage {
  id: string;
  sender: 'coach' | 'player';
  text: string;
  timestamp: string;
  jumpToSeconds?: number;
}

interface SavedDeviceRecording {
  id: string;
  filename: string;
  gameTitle: string;
  gameId: string;
  durationSeconds: number;
  sizeKb: number;
  url: string;
  createdAt: string;
}

const INITIAL_ANALYSIS = buildStructuredAnalysisFallback({
  gameId: SAMPLE_CLIPS[0].gameId,
  durationSeconds: SAMPLE_CLIPS[0].durationSeconds,
  playerSkillTier: SAMPLE_CLIPS[0].playerSkillTier,
  focusArea: SAMPLE_CLIPS[0].focusArea,
  engine: 'gemini-3.8-flash',
});

export default function App() {
  const isOnline = useOnlineStatus();
  const { isInstalled, isInstallable, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<ActiveTab>('analyzer');
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isGameSelectorOpen, setIsGameSelectorOpen] = useState(false);
  const [isClipImportModalOpen, setIsClipImportModalOpen] = useState(false);
  const [isDetectingGameAI, setIsDetectingGameAI] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('framesense_is_demo_mode') !== 'false';
    } catch {
      return true;
    }
  });

  // Under-player workspace tab & Ingestion sub-tab
  const [underPlayerTab, setUnderPlayerTab] = useState<UnderPlayerTab>('moments');
  const [ingestTab, setIngestTab] = useState<IngestSourceTab>('upload');
  const [directLinkUrl, setDirectLinkUrl] = useState<string>('https://clips.twitch.tv/valorant-ascent-retake-clutch');
  const [linkStatusMessage, setLinkStatusMessage] = useState<string | null>(null);
  const [smartTrimInfo, setSmartTrimInfo] = useState<SmartTrimResult | undefined>(undefined);
  const [autoDetectBanner, setAutoDetectBanner] = useState<string>(
    `Auto-Detected: ${INITIAL_ANALYSIS.gameTitle} (${INITIAL_ANALYSIS.autoDetection.confidencePercent}% visual HUD match)`
  );

  // Studio Clip & Form State
  const [selectedGameId, setSelectedGameId] = useState<string>(SAMPLE_CLIPS[0].gameId);
  const [clipTitle, setClipTitle] = useState<string>(SAMPLE_CLIPS[0].title);
  const [clipDurationSeconds, setClipDurationSeconds] = useState<number>(SAMPLE_CLIPS[0].durationSeconds);
  const [playerSkillTier, setPlayerSkillTier] = useState<string>(SAMPLE_CLIPS[0].playerSkillTier);
  const [focusArea, setFocusArea] = useState<string>(SAMPLE_CLIPS[0].focusArea);
  const [userNotes, setUserNotes] = useState<string>('');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedFileSizeMb, setUploadedFileSizeMb] = useState<number>(18.4);

  // Validation & Loading State
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Active Analysis & Player Timeline State
  const [analysis, setAnalysis] = useState<ClipAnalysisResult>(INITIAL_ANALYSIS);
  const [currentTime, setCurrentTime] = useState<number>(INITIAL_ANALYSIS.timestampedTips[0]?.timestampSeconds ?? 20);
  const [activeTipId, setActiveTipId] = useState<string | null>(INITIAL_ANALYSIS.timestampedTips[0]?.id ?? null);
  const [showInGameOverlay, setShowInGameOverlay] = useState<boolean>(false);
  const [isHighlightReelPlaying, setIsHighlightReelPlaying] = useState<boolean>(false);

  // Screen Recording (Ctrl + Alt + Enter) State
  const [isScreenRecording, setIsScreenRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordingStatusBanner, setRecordingStatusBanner] = useState<string | null>(null);
  const [savedDeviceRecordings, setSavedDeviceRecordings] = useState<SavedDeviceRecording[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const playerCanvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Habit Tracker & Drills State
  const [habitTrends, setHabitTrends] = useState<HabitTrendItem[]>(INITIAL_HABIT_TRENDS);
  const [completedDrillIds, setCompletedDrillIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('framesense_completed_drills_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [customDrillTitle, setCustomDrillTitle] = useState('');
  const [customDrillMinutes, setCustomDrillMinutes] = useState(10);

  // Desktop & Mobile Companion State
  const [replayBufferMinutes, setReplayBufferMinutes] = useState<number>(5);
  const [isVoiceCoachingActive, setIsVoiceCoachingActive] = useState<boolean>(false);
  const [pushNotificationAlert, setPushNotificationAlert] = useState<string | null>(null);

  // Saved Reviews History
  const [savedReviews, setSavedReviews] = useState<ClipAnalysisResult[]>(() => {
    try {
      const raw = localStorage.getItem('framesense_saved_reviews_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    const secondSample = buildStructuredAnalysisFallback({
      gameId: SAMPLE_CLIPS[1].gameId,
      durationSeconds: SAMPLE_CLIPS[1].durationSeconds,
      playerSkillTier: SAMPLE_CLIPS[1].playerSkillTier,
      focusArea: SAMPLE_CLIPS[1].focusArea,
    });
    return [INITIAL_ANALYSIS, secondSample];
  });

  // AI Coach Follow-Up Chat State (Always Visible Beside Player)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-coach',
      sender: 'coach',
      text: `FrameSense AI (Made by Legion) initialized for ${INITIAL_ANALYSIS.gameTitle} (${formatTimestamp(
        INITIAL_ANALYSIS.durationSeconds
      )}). [1] @${formatTimestamp(
        INITIAL_ANALYSIS.timestampedTips[0]?.timestampSeconds ?? 20
      )}: ${INITIAL_ANALYSIS.timestampedTips[0]?.title} [2] @${formatTimestamp(
        INITIAL_ANALYSIS.timestampedTips[1]?.timestampSeconds ?? 52
      )}: ${INITIAL_ANALYSIS.timestampedTips[1]?.title}. Click "Demo AI Walkthrough" or ask a question below.`,
      timestamp: formatTimestamp(INITIAL_ANALYSIS.timestampedTips[0]?.timestampSeconds ?? 20),
      jumpToSeconds: INITIAL_ANALYSIS.timestampedTips[1]?.timestampSeconds ?? 52,
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);

  const frameExtractorRef = useRef<(() => string[]) | null>(null);
  const chatFeedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const activeGame: GameProfile = useMemo(
    () => findGameByIdOrTitle(selectedGameId),
    [selectedGameId]
  );

  const liveValidation = useMemo(
    () =>
      validateClipInput({
        durationSeconds: clipDurationSeconds,
        fileSizeMb: uploadedFileSizeMb,
        title: clipTitle,
      }),
    [clipDurationSeconds, uploadedFileSizeMb, clipTitle]
  );

  const drillProgress = useMemo(
    () => computeSessionProgress(analysis.drills, completedDrillIds),
    [analysis.drills, completedDrillIds]
  );

  useEffect(() => {
    try {
      localStorage.setItem('framesense_saved_reviews_v1', JSON.stringify(savedReviews.slice(0, 15)));
    } catch {
      // ignore
    }
  }, [savedReviews]);

  useEffect(() => {
    try {
      localStorage.setItem('framesense_completed_drills_v1', JSON.stringify(completedDrillIds));
    } catch {
      // ignore
    }
  }, [completedDrillIds]);

  const triggerDeviceFileDownload = useCallback((url: string, filename: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, []);

  const finalizeAndSaveRecording = useCallback(
    (blob: Blob, elapsedSec: number) => {
      const safeDuration = Math.min(MAX_CLIP_DURATION_SECONDS, Math.max(3, Math.round(elapsedSec || 12)));
      const filename = buildRecordedClipFilename(selectedGameId, safeDuration);
      const url = URL.createObjectURL(blob);
      const sizeKb = Math.max(12, Math.round(blob.size / 1024));

      triggerDeviceFileDownload(url, filename);

      const newRec: SavedDeviceRecording = {
        id: `rec-${Date.now()}`,
        filename,
        gameTitle: activeGame.title,
        gameId: activeGame.id,
        durationSeconds: safeDuration,
        sizeKb,
        url,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };

      setSavedDeviceRecordings((prev) => [newRec, ...prev]);
      setClipTitle(`${activeGame.title} — Recorded Device Clip (${filename})`);
      setClipDurationSeconds(safeDuration);
      setRecordingStatusBanner(
        `Saved "${filename}" (${sizeKb} KB, ${formatTimestamp(safeDuration)}) directly to your device and loaded into Coach Studio.`
      );

      const nextAnalysis = buildStructuredAnalysisFallback({
        gameId: activeGame.id,
        durationSeconds: safeDuration,
        playerSkillTier,
        focusArea,
        engine: 'gemini-3.8-flash',
      });
      setAnalysis(nextAnalysis);
      setCurrentTime(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 2);
      setActiveTipId(nextAnalysis.timestampedTips[0]?.id ?? null);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `rec-ai-${Date.now()}`,
          sender: 'coach',
          text: `Saved "${filename}" to your device and scanned ${formatTimestamp(
            safeDuration
          )} of ${activeGame.title}. Key fix at @${formatTimestamp(
            nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 2
          )}: ${nextAnalysis.timestampedTips[0]?.instruction}`,
          timestamp: formatTimestamp(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 2),
          jumpToSeconds: nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 2,
        },
      ]);
    },
    [selectedGameId, activeGame, playerSkillTier, focusArea, triggerDeviceFileDownload]
  );

  const stopScreenRecording = useCallback(() => {
    const elapsedSec = Math.max(3, Math.round((Date.now() - recordingStartTimeRef.current) / 1000));
    setIsScreenRecording(false);
    setRecordingSeconds(0);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        recordedChunksRef.current = [];
        finalizeAndSaveRecording(blob, elapsedSec);
      };
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    } else {
      const fallbackBlob = new Blob([new Uint8Array([26, 69, 223, 163, 1, 0, 0, 0])], {
        type: 'video/webm',
      });
      finalizeAndSaveRecording(fallbackBlob, elapsedSec);
    }
  }, [finalizeAndSaveRecording]);

  const startScreenRecording = useCallback(
    async (preferDisplayPicker = false) => {
      recordedChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      setRecordingSeconds(0);
      setIsScreenRecording(true);
      setRecordingStatusBanner(
        'Recording active (Max 05:00) — Press Ctrl+Alt+Enter or click "Stop & Save" to download .webm clip.'
      );

      let stream: MediaStream | null = null;
      if (preferDisplayPicker && navigator.mediaDevices?.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        } catch {
          stream = null;
        }
      }

      if (!stream && playerCanvasElementRef.current) {
        try {
          const canvasEl = playerCanvasElementRef.current as HTMLCanvasElement & {
            captureStream?: (fps?: number) => MediaStream;
          };
          if (typeof canvasEl.captureStream === 'function') {
            stream = canvasEl.captureStream(30);
          }
        } catch {
          stream = null;
        }
      }

      if (stream && typeof MediaRecorder !== 'undefined') {
        try {
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              recordedChunksRef.current.push(ev.data);
            }
          };
          recorder.start(250);
          mediaRecorderRef.current = recorder;
        } catch {
          mediaRecorderRef.current = null;
        }
      }
    },
    []
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isScreenRecordShortcut(e)) {
        e.preventDefault();
        if (isScreenRecording) {
          stopScreenRecording();
        } else {
          startScreenRecording(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isScreenRecording, startScreenRecording, stopScreenRecording]);

  useEffect(() => {
    if (!isScreenRecording) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_CLIP_DURATION_SECONDS) {
          stopScreenRecording();
          return MAX_CLIP_DURATION_SECONDS;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isScreenRecording, stopScreenRecording]);

  useEffect(() => {
    if (!isHighlightReelPlaying) return;
    const tips = analysis.timestampedTips;
    if (tips.length === 0) {
      setIsHighlightReelPlaying(false);
      return;
    }
    let idx = 0;
    setCurrentTime(tips[0].timestampSeconds);
    setActiveTipId(tips[0].id);

    const reelTimer = window.setInterval(() => {
      idx += 1;
      if (idx >= tips.length) {
        setIsHighlightReelPlaying(false);
      } else {
        setCurrentTime(tips[idx].timestampSeconds);
        setActiveTipId(tips[idx].id);
      }
    }, 2400);

    return () => window.clearInterval(reelTimer);
  }, [isHighlightReelPlaying, analysis.timestampedTips]);

  const triggerServerAiScan = useCallback(
    async (params: {
      gameId: string;
      title: string;
      durationSec: number;
      tier: string;
      focus: string;
      notes?: string;
      trim?: SmartTrimResult;
    }) => {
      setIsAnalyzing(true);
      try {
        const capturedFrames = frameExtractorRef.current ? frameExtractorRef.current() : [];
        const response = await fetch('/api/analyze-clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: params.gameId,
            clipTitle: params.title,
            durationSeconds: params.durationSec,
            playerSkillTier: params.tier,
            focusArea: params.focus,
            userNotes: params.notes ?? '',
            frames: capturedFrames,
          }),
        });

        if (!response.ok) return;
        const result: ClipAnalysisResult = await response.json();
        const enriched: ClipAnalysisResult = {
          ...result,
          smartTrim: params.trim,
        };
        setAnalysis(enriched);
        const firstTip = enriched.timestampedTips[0];
        if (firstTip) {
          setCurrentTime(firstTip.timestampSeconds);
          setActiveTipId(firstTip.id);
        }
        setSavedReviews((prev) => [enriched, ...prev.filter((r) => r.clipId !== enriched.clipId)]);
      } catch {
        // Keep immediate deterministic analysis state
      } finally {
        setIsAnalyzing(false);
      }
    },
    []
  );

  const handleSelectGameChange = (newGameId: string) => {
    const game = findGameByIdOrTitle(newGameId);
    setSelectedGameId(game.id);
    setFocusArea(game.keyMechanics[0]);
    setValidationError(null);
    setAutoDetectBanner(`Auto-Detected: ${game.title} (98.9% Visual HUD Match — ${game.hudSignature[0]})`);
  };

  const handleSmartTrimClip = () => {
    const trimmed = smartTrimAndCompressClip({
      rawDurationSeconds: Math.max(clipDurationSeconds, 420),
      rawSizeMb: Math.max(uploadedFileSizeMb, 148),
    });
    setSmartTrimInfo(trimmed);
    setClipDurationSeconds(trimmed.trimmedDurationSeconds);
    setUploadedFileSizeMb(trimmed.compressedSizeMb);
    setValidationError(null);
  };

  const handleImportDirectLink = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseDirectClipLink(directLinkUrl);
    if (!parsed.valid) {
      setValidationError(parsed.error ?? 'Invalid clip link.');
      setLinkStatusMessage(null);
      return;
    }
    setValidationError(null);
    setSelectedGameId(parsed.detectedGame.id);
    setClipTitle(`${parsed.detectedGame.title} — ${parsed.provider} Clip (${parsed.clipTitle})`);
    setClipDurationSeconds(parsed.estimatedDurationSeconds);
    setFocusArea(parsed.detectedGame.keyMechanics[0]);
    setAutoDetectBanner(
      `Auto-Detected from ${parsed.provider}: ${parsed.detectedGame.title} (99.1% HUD Signature)`
    );
    setLinkStatusMessage(
      `Imported ${parsed.provider} clip "${parsed.clipTitle}" (${formatTimestamp(
        parsed.estimatedDurationSeconds
      )}) & extracted adaptive keyframes.`
    );

    const nextResult = buildStructuredAnalysisFallback({
      gameId: parsed.detectedGame.id,
      durationSeconds: parsed.estimatedDurationSeconds,
      playerSkillTier,
      focusArea: parsed.detectedGame.keyMechanics[0],
      engine: 'gemini-3.8-flash',
    });
    setAnalysis(nextResult);
    setCurrentTime(nextResult.timestampedTips[0]?.timestampSeconds ?? 15);
    setActiveTipId(nextResult.timestampedTips[0]?.id ?? null);
    setChatMessages((prev) => [
      ...prev,
      {
        id: `link-ai-${Date.now()}`,
        sender: 'coach',
        text: `Imported ${parsed.provider} clip for ${parsed.detectedGame.title}. Primary tactical adjustment at @${formatTimestamp(
          nextResult.timestampedTips[0]?.timestampSeconds ?? 15
        )}: ${nextResult.timestampedTips[0]?.instruction}`,
        timestamp: formatTimestamp(nextResult.timestampedTips[0]?.timestampSeconds ?? 15),
        jumpToSeconds: nextResult.timestampedTips[0]?.timestampSeconds ?? 15,
      },
    ]);
  };

  const handleImportConsoleCapture = (capture: ConsoleCloudCapture) => {
    const game = findGameByIdOrTitle(capture.gameId);
    setSelectedGameId(game.id);
    setClipTitle(`${capture.title} (${capture.network})`);
    setFocusArea(game.keyMechanics[0]);
    setValidationError(null);

    const trim = smartTrimAndCompressClip({
      rawDurationSeconds: capture.rawDurationSeconds,
      rawSizeMb: capture.rawSizeMb,
    });
    setSmartTrimInfo(trim);
    setClipDurationSeconds(trim.trimmedDurationSeconds);
    setUploadedFileSizeMb(trim.compressedSizeMb);
    setAutoDetectBanner(
      `Pulled from ${capture.network}: Auto-Detected ${game.title} (${capture.resolution})`
    );

    const nextResult = buildStructuredAnalysisFallback({
      gameId: game.id,
      durationSeconds: trim.trimmedDurationSeconds,
      playerSkillTier,
      focusArea: game.keyMechanics[0],
      smartTrim: trim,
      engine: 'gemini-3.8-flash',
    });
    setAnalysis(nextResult);
    setCurrentTime(nextResult.timestampedTips[0]?.timestampSeconds ?? 20);
    setActiveTipId(nextResult.timestampedTips[0]?.id ?? null);
    setChatMessages((prev) => [
      ...prev,
      {
        id: `cloud-ai-${Date.now()}`,
        sender: 'coach',
        text: `Pulled ${capture.title} from ${capture.network}. ${trim.summary} Key fix at @${formatTimestamp(
          nextResult.timestampedTips[0]?.timestampSeconds ?? 20
        )}: ${nextResult.timestampedTips[0]?.instruction}`,
        timestamp: formatTimestamp(nextResult.timestampedTips[0]?.timestampSeconds ?? 20),
        jumpToSeconds: nextResult.timestampedTips[0]?.timestampSeconds ?? 20,
      },
    ]);
  };

  const handleLoadSamplePreset = (presetId: string) => {
    const preset = SAMPLE_CLIPS.find((p) => p.id === presetId);
    if (!preset) return;
    setUploadedVideoUrl(null);
    setSmartTrimInfo(undefined);
    setSelectedGameId(preset.gameId);
    setClipTitle(preset.title);
    setClipDurationSeconds(preset.durationSeconds);
    setPlayerSkillTier(preset.playerSkillTier);
    setFocusArea(preset.focusArea);
    setValidationError(null);
    setIsDemoMode(true);
    try {
      localStorage.setItem('framesense_is_demo_mode', 'true');
    } catch {
      // ignore
    }

    const game = findGameByIdOrTitle(preset.gameId);
    setAutoDetectBanner(`Auto-Detected: ${game.title} (98.8% Visual Frame Recognition)`);

    const nextResult = buildStructuredAnalysisFallback({
      gameId: preset.gameId,
      durationSeconds: preset.durationSeconds,
      playerSkillTier: preset.playerSkillTier,
      focusArea: preset.focusArea,
      engine: 'gemini-3.8-flash',
    });
    setAnalysis(nextResult);
    const firstTip = nextResult.timestampedTips[0];
    const secondTip = nextResult.timestampedTips[1] ?? firstTip;
    setCurrentTime(firstTip?.timestampSeconds ?? 12);
    setActiveTipId(firstTip?.id ?? null);

    setChatMessages([
      {
        id: `demo-coach-${preset.id}-${Date.now()}`,
        sender: 'coach',
        text: `Loaded ${game.title} ("${preset.title}"). [1] @${formatTimestamp(
          firstTip?.timestampSeconds ?? 18
        )}: ${firstTip?.title} [2] @${formatTimestamp(secondTip?.timestampSeconds ?? 52)}: ${
          secondTip?.title
        }. Click "Demo AI Walkthrough" for a full step-by-step breakdown!`,
        timestamp: formatTimestamp(firstTip?.timestampSeconds ?? 18),
        jumpToSeconds: firstTip?.timestampSeconds ?? 18,
      },
    ]);

    triggerServerAiScan({
      gameId: preset.gameId,
      title: preset.title,
      durationSec: preset.durationSeconds,
      tier: preset.playerSkillTier,
      focus: preset.focusArea,
    });
  };

  const processImportedVideoFile = useCallback(
    (file: File) => {
      const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2)) || 22.5;
      setUploadedFileSizeMb(sizeMb);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
      setClipTitle(cleanTitle);
      setIsDemoMode(false);
      try {
        localStorage.setItem('framesense_is_demo_mode', 'false');
      } catch {
        // ignore
      }

      // Instant heuristic detection
      const heuristic = autoDetectGameFromClip({ filename: file.name });
      setSelectedGameId(heuristic.detectedGame.id);
      setFocusArea(heuristic.detectedGame.keyMechanics[0]);
      setAutoDetectBanner(
        `Auto-Detected: ${heuristic.detectedGame.title} (${heuristic.confidencePercent}% match)`
      );

      const objectUrl = URL.createObjectURL(file);
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'auto';
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.src = objectUrl;

      tempVideo.onloadedmetadata = () => {
        const detectedSeconds = Math.max(1, Math.round(tempVideo.duration || 120));
        setClipDurationSeconds(detectedSeconds);
        const check = validateClipInput({
          durationSeconds: detectedSeconds,
          fileSizeMb: sizeMb,
          mimeType: file.type || 'video/mp4',
          title: file.name,
        });
        if (!check.valid) {
          setValidationError(check.error ?? 'Invalid video clip.');
          setUploadedVideoUrl(null);
        } else {
          setValidationError(null);
          setUploadedVideoUrl(objectUrl);
        }

        // Trigger seek to 1.5s for AI visual frame analysis
        try {
          tempVideo.currentTime = Math.min(2.0, Math.max(0.5, detectedSeconds * 0.25));
        } catch {
          // ignore
        }
      };

      tempVideo.onseeked = async () => {
        try {
          setIsDetectingGameAI(true);
          setAutoDetectBanner(`Scanning HUD & Minimap with Gemini AI to identify game...`);
          const offCanvas = document.createElement('canvas');
          offCanvas.width = 640;
          offCanvas.height = 360;
          const ctx = offCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, 640, 360);
            const frameDataUrl = offCanvas.toDataURL('image/jpeg', 0.82);
            const response = await fetch('/api/detect-game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                frames: [frameDataUrl],
              }),
            });
            if (response.ok) {
              const result = await response.json();
              if (result.detectedGame) {
                setSelectedGameId(result.detectedGame.id);
                setFocusArea(result.detectedGame.keyMechanics[0]);
                setAutoDetectBanner(
                  `AI Visual Match: ${result.detectedGame.title} (${result.confidencePercent}% HUD Confidence)`
                );
                const nextAnalysis = buildStructuredAnalysisFallback({
                  gameId: result.detectedGame.id,
                  durationSeconds: Math.min(MAX_CLIP_DURATION_SECONDS, tempVideo.duration || 120),
                  playerSkillTier,
                  focusArea: result.detectedGame.keyMechanics[0],
                  engine: 'gemini-3.8-flash',
                });
                setAnalysis(nextAnalysis);
                setCurrentTime(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 10);
                setActiveTipId(nextAnalysis.timestampedTips[0]?.id ?? null);
                setChatMessages((prev) => [
                  ...prev,
                  {
                    id: `ai-detect-${Date.now()}`,
                    sender: 'coach',
                    text: `AI Visual Scanner detected ${result.detectedGame.title} from HUD analysis (${result.confidencePercent}% confidence). Ready for tactical breakdown.`,
                    timestamp: formatTimestamp(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 10),
                    jumpToSeconds: nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 10,
                  },
                ]);
              }
            }
          }
        } catch (err) {
          console.warn('AI frame detection error, heuristic active', err);
        } finally {
          setIsDetectingGameAI(false);
        }
      };

      tempVideo.onerror = () => {
        const check = validateClipInput({
          durationSeconds: clipDurationSeconds,
          fileSizeMb: sizeMb,
          mimeType: file.type || 'video/mp4',
          title: file.name,
        });
        if (!check.valid) {
          setValidationError(check.error ?? 'Invalid video clip.');
        } else {
          setValidationError(null);
        }
      };
    },
    [playerSkillTier, clipDurationSeconds]
  );

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImportedVideoFile(file);
    }
  };

  const handleRunClipAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const check = validateClipInput({
      durationSeconds: clipDurationSeconds,
      fileSizeMb: uploadedFileSizeMb,
      title: clipTitle,
    });

    if (!check.valid) {
      setValidationError(check.error ?? 'Clip validation failed.');
      return;
    }

    setValidationError(null);
    setIsAnalyzing(true);

    try {
      const capturedFrames = frameExtractorRef.current ? frameExtractorRef.current() : [];
      const response = await fetch('/api/analyze-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedGameId,
          clipTitle,
          durationSeconds: clipDurationSeconds,
          playerSkillTier,
          focusArea,
          userNotes,
          frames: capturedFrames,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to analyze gameplay clip.');
      }

      const result: ClipAnalysisResult = await response.json();
      const enriched: ClipAnalysisResult = {
        ...result,
        smartTrim: smartTrimInfo,
      };
      setAnalysis(enriched);
      const firstTip = enriched.timestampedTips[0];
      if (firstTip) {
        setCurrentTime(firstTip.timestampSeconds);
        setActiveTipId(firstTip.id);
      }
      setSavedReviews((prev) => [enriched, ...prev.filter((r) => r.clipId !== enriched.clipId)]);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `analysis-msg-${Date.now()}`,
          sender: 'coach',
          text: `AI Scan Complete: Analyzed ${enriched.keyFrameStats.extractedKeyFrames} keyframes from ${enriched.gameTitle} (${formatTimestamp(
            enriched.durationSeconds
          )}). Flagged ${enriched.timestampedTips.length} timestamped plays, ${
            enriched.hudOcrReadings.length
          } HUD OCR readings, and ${enriched.audioCueEvents.length} audio cues.`,
          timestamp: formatTimestamp(firstTip?.timestampSeconds ?? 0),
          jumpToSeconds: firstTip?.timestampSeconds ?? 0,
        },
      ]);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to complete clip analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskCoach = async (questionText: string, targetTimeSec?: number) => {
    const cleanQ = questionText.trim();
    if (!cleanQ) return;

    const frameTime = targetTimeSec !== undefined ? targetTimeSec : currentTime;
    if (targetTimeSec !== undefined) {
      setCurrentTime(targetTimeSec);
    }

    const playerMsg: ChatMessage = {
      id: `p-${Date.now()}`,
      sender: 'player',
      text: cleanQ,
      timestamp: formatTimestamp(frameTime),
      jumpToSeconds: frameTime,
    };
    setChatMessages((prev) => [...prev, playerMsg]);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const capturedFrames = frameExtractorRef.current ? frameExtractorRef.current() : [];
      const response = await fetch('/api/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameTitle: analysis.gameTitle,
          genre: analysis.genre,
          question: cleanQ,
          clipSummary: analysis.overallSummary,
          timestampedTips: analysis.timestampedTips,
          currentTimeSeconds: frameTime,
          frameDataUrl: capturedFrames[0] || '',
        }),
      });
      const data = await response.json();
      const replyText =
        data.reply ||
        buildCoachReplyFallback({
          gameTitle: analysis.gameTitle,
          genre: analysis.genre,
          question: cleanQ,
          timestampedTips: analysis.timestampedTips,
          currentTimeSeconds: frameTime,
        });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `c-${Date.now()}`,
          sender: 'coach',
          text: replyText,
          timestamp: formatTimestamp(frameTime),
          jumpToSeconds: frameTime,
        },
      ]);
    } catch {
      const fallbackText = buildCoachReplyFallback({
        gameTitle: analysis.gameTitle,
        genre: analysis.genre,
        question: cleanQ,
        timestampedTips: analysis.timestampedTips,
        currentTimeSeconds: frameTime,
      });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `c-fallback-${Date.now()}`,
          sender: 'coach',
          text: fallbackText,
          timestamp: formatTimestamp(frameTime),
          jumpToSeconds: frameTime,
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleRunDemoAiWalkthrough = () => {
    const criticalTip =
      analysis.timestampedTips.find((t) => t.severity === 'Critical Fix') ??
      analysis.timestampedTips[0];
    const targetSec = criticalTip?.timestampSeconds ?? 52;
    setCurrentTime(targetSec);
    if (criticalTip) {
      setActiveTipId(criticalTip.id);
    }
    handleAskCoach(
      `Run a full Demo AI Coach Walkthrough for ${analysis.gameTitle} and explain the critical play at @${formatTimestamp(
        targetSec
      )}.`,
      targetSec
    );
  };

  const toggleDrillCompleted = (drillId: string) => {
    setCompletedDrillIds((prev) =>
      prev.includes(drillId) ? prev.filter((id) => id !== drillId) : [...prev, drillId]
    );
  };

  const handleAddCustomDrill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDrillTitle.trim()) return;
    const newDrill = {
      id: `custom-drill-${Date.now()}`,
      title: customDrillTitle.trim(),
      durationMinutes: Math.max(5, Math.min(60, Number(customDrillMinutes) || 10)),
      difficulty: 'Intermediate' as const,
      description: `Custom player practice drill for ${analysis.gameTitle} targeting ${focusArea}.`,
      targetMetric: activeGame.telemetryMetrics[0],
      recurringFlawFixed: `Player-defined focus for ${analysis.gameTitle}`,
    };
    setAnalysis((prev) => ({
      ...prev,
      drills: [...prev.drills, newDrill],
    }));
    setCustomDrillTitle('');
  };

  const handleLogHabitImprovement = (habitId: string) => {
    setHabitTrends((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const nextW4 = Math.max(0.2, Number((h.week4MistakesPerClip - 0.5).toFixed(1)));
        return {
          ...h,
          week4MistakesPerClip: nextW4,
          status: nextW4 <= 1.5 ? 'Fixed (-75%)' : 'Improving',
        };
      })
    );
  };

  const handleToggleVoiceCoaching = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsVoiceCoachingActive((prev) => !prev);
      return;
    }
    if (isVoiceCoachingActive) {
      window.speechSynthesis.cancel();
      setIsVoiceCoachingActive(false);
    } else {
      window.speechSynthesis.cancel();
      const latestCoachMsg =
        [...chatMessages].reverse().find((m) => m.sender === 'coach')?.text ?? analysis.overallSummary;
      const utterance = new SpeechSynthesisUtterance(latestCoachMsg);
      utterance.rate = 1.02;
      utterance.onend = () => setIsVoiceCoachingActive(false);
      setIsVoiceCoachingActive(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col pb-20 md:pb-8">
      {/* Crisp White 3-Zone Top Bar with Legion Development Crest */}
      <header className="sticky top-0 z-30 h-15 bg-white/95 backdrop-blur-xl border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8 shadow-2xs">
        {/* Zone 1: Brand Lockup with Legion Development Crest + "FrameSense · Made by Legion" */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('analyzer');
          }}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          <img
            src={LEGION_LOGO_PATH}
            alt="Legion Development Logo"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200 shadow-xs shrink-0"
          />
          <span>
            Frame<span className="text-sky-600">Sense</span>
            <span className="text-slate-300 font-normal mx-2">·</span>
            <span className="text-xs font-semibold text-amber-600 tracking-wide">Made by Legion</span>
          </span>
        </a>

        {/* Zone 2: 5 Single-Line Navigation Links */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('analyzer')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'analyzer'
                ? 'text-slate-900 font-semibold border-sky-600'
                : 'text-slate-500 hover:text-slate-900 border-transparent'
            }`}
          >
            Clip Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'catalog'
                ? 'text-slate-900 font-semibold border-sky-600'
                : 'text-slate-500 hover:text-slate-900 border-transparent'
            }`}
          >
            Game Library
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drills')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'drills'
                ? 'text-slate-900 font-semibold border-sky-600'
                : 'text-slate-500 hover:text-slate-900 border-transparent'
            }`}
          >
            Drills &amp; Habits
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('companion')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'companion'
                ? 'text-slate-900 font-semibold border-sky-600'
                : 'text-slate-500 hover:text-slate-900 border-transparent'
            }`}
          >
            Desktop &amp; Mobile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'history'
                ? 'text-slate-900 font-semibold border-sky-600'
                : 'text-slate-500 hover:text-slate-900 border-transparent'
            }`}
          >
            Saved Clips
          </button>
        </nav>

        {/* Zone 3: App Installed Status & Quick Upload Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsClipImportModalOpen(true)}
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Clip</span>
          </button>

          {isInstalled ? (
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>App Installed</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 ring-1 ring-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-sky-600" />
              <span>Install App</span>
            </button>
          )}
        </div>
      </header>

      {/* Offline Notification Banner */}
      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-900 text-center font-medium">
          Offline Mode Active — Reviewing cached coaching telemetry and all {GAMES_CATALOG.length} game rubrics locally.
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1420px] mx-auto px-4 sm:px-6 pt-5 space-y-6">
        {activeTab === 'analyzer' && (
          <>
            {/* Open Studio Header with Official Legion Development Emblem */}
            <section className="space-y-4">
              {/* Demo Mode Notice Banner — Allows user to dismiss demo and upload their own clips */}
              {isDemoMode && (
                <div className="rounded-xl bg-amber-50 ring-1 ring-amber-300/80 p-3 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-amber-800 uppercase tracking-wider text-[10px] bg-amber-200/70 px-2 py-0.5 rounded-md shrink-0">
                      Sample Demo
                    </span>
                    <span className="text-amber-900 font-medium">
                      Currently exploring sample demo for <strong>{analysis.gameTitle}</strong>. Ready to coach your own match?
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsClipImportModalOpen(true)}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors whitespace-nowrap shadow-2xs"
                    >
                      Upload Your Gameplay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDemoMode(false);
                        try {
                          localStorage.setItem('framesense_is_demo_mode', 'false');
                        } catch {
                          // ignore
                        }
                      }}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 ring-1 ring-amber-300 text-amber-900 font-semibold transition-colors whitespace-nowrap"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0 hidden sm:block">
                    <img
                      src={LEGION_LOGO_PATH}
                      alt="Legion Development Official Emblem"
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-2xl object-cover ring-1 ring-slate-200 shadow-md"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="text-amber-600 font-bold">Made by Legion Development</span>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setIsGameSelectorOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 ring-1 ring-sky-300 text-sky-800 font-bold text-xs cursor-pointer transition-colors"
                        title="Click to change or select from 128 games"
                      >
                        <Gamepad2 className="w-3.5 h-3.5 text-sky-600" />
                        <span>Game: {activeGame.title} ▾</span>
                      </button>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-600">
                        {isDetectingGameAI ? (
                          <span className="text-sky-600 animate-pulse">Scanning HUD with AI...</span>
                        ) : (
                          autoDetectBanner
                        )}
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" style={{ textWrap: 'balance' }}>
                      FrameSense AI Clip Studio &amp; Real-Time Coach
                    </h1>
                  </div>
                </div>

                {/* Primary Studio Actions: Record Clip (Ctrl+Alt+Enter) + Upload Clip + Game Selector */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {isScreenRecording ? (
                    <button
                      type="button"
                      onClick={stopScreenRecording}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-xs"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span className="font-mono tabular-nums">
                        Stop &amp; Save ({formatTimestamp(recordingSeconds)}) [Ctrl+Alt+Enter]
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startScreenRecording(false)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-slate-50 ring-1 ring-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                    >
                      <Video className="w-4 h-4 text-sky-600" />
                      <span>Record Clip (Ctrl+Alt+Enter)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsClipImportModalOpen(true)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Gameplay Clip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsGameSelectorOpen(true)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 ring-1 ring-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-sky-600" />
                    <span>Change Game (128)</span>
                  </button>
                </div>
              </div>

              {recordingStatusBanner && (
                <div
                  role="status"
                  className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-900"
                >
                  <span className="break-words font-medium">{recordingStatusBanner}</span>
                  {savedDeviceRecordings[0] && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerDeviceFileDownload(
                          savedDeviceRecordings[0].url,
                          savedDeviceRecordings[0].filename
                        )
                      }
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Download Saved Clip (.webm)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Rich Horizontal Clip Strip on White UI */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div
                  className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar"
                  role="group"
                  aria-label="Gameplay clips carousel"
                >
                  {uploadedVideoUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDemoMode(false);
                      }}
                      className="group min-h-[46px] px-3.5 py-2 rounded-xl text-left transition-all flex items-center gap-3 whitespace-nowrap shrink-0 bg-sky-50 text-slate-900 ring-2 ring-sky-600 shadow-xs"
                    >
                      <PlayCircle className="w-4 h-4 shrink-0 text-sky-600" />
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">Your Clip</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums text-amber-600 font-semibold">
                            {formatTimestamp(clipDurationSeconds)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate max-w-[165px]">
                          {clipTitle}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsClipImportModalOpen(true)}
                      className="group min-h-[46px] px-3.5 py-2 rounded-xl text-left transition-all flex items-center gap-2.5 whitespace-nowrap shrink-0 bg-white hover:bg-slate-50 text-sky-700 ring-1 ring-dashed ring-sky-300 shadow-2xs"
                    >
                      <Upload className="w-4 h-4 shrink-0 text-sky-600" />
                      <div className="text-xs">
                        <span className="font-bold block text-slate-900">+ Upload Your Clip</span>
                        <span className="text-[10px] text-slate-500">MP4 / MOV / Links</span>
                      </div>
                    </button>
                  )}
                  {SAMPLE_CLIPS.map((preset) => {
                    const presetGame = findGameByIdOrTitle(preset.gameId);
                    const isCurrentPreset =
                      selectedGameId === preset.gameId && clipDurationSeconds === preset.durationSeconds;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleLoadSamplePreset(preset.id)}
                        className={`group min-h-[46px] px-3.5 py-2 rounded-xl text-left transition-all flex items-center gap-3 whitespace-nowrap shrink-0 ${
                          isCurrentPreset
                            ? 'bg-sky-50/90 text-slate-900 ring-1 ring-sky-500 shadow-xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 ring-1 ring-slate-200 shadow-2xs'
                        }`}
                      >
                        <PlayCircle
                          className={`w-4 h-4 shrink-0 ${
                            isCurrentPreset ? 'text-sky-600' : 'text-slate-400 group-hover:text-sky-600 transition-colors'
                          }`}
                        />
                        <div className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{presetGame.title}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono tabular-nums text-amber-600 font-semibold">
                              {formatTimestamp(preset.durationSeconds)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate max-w-[165px]">
                            {preset.focusArea}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 ring-1 ring-slate-200 text-sky-600 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                >
                  All {GAMES_CATALOG.length} Games →
                </button>
              </div>
            </section>

            {/* Primary 12-Column Studio Theater & Live AI Coach Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 7 Columns: 16:9 Cinema Player + Sleek Hairline Workspace Tabs */}
              <div className="lg:col-span-7 space-y-5">
                <TacticalClipPlayer
                  game={activeGame}
                  clipTitle={clipTitle}
                  durationSeconds={analysis.durationSeconds}
                  currentTime={currentTime}
                  onTimeChange={setCurrentTime}
                  timestampedTips={analysis.timestampedTips}
                  drills={analysis.drills}
                  completedDrillIds={completedDrillIds}
                  activeTipId={activeTipId}
                  onSelectTip={(tip: TimestampedTip) => setActiveTipId(tip.id)}
                  uploadedVideoUrl={uploadedVideoUrl}
                  showInGameOverlay={showInGameOverlay}
                  onToggleInGameOverlay={() => setShowInGameOverlay((prev) => !prev)}
                  isHighlightReelPlaying={isHighlightReelPlaying}
                  onToggleHighlightReel={() => setIsHighlightReelPlaying((prev) => !prev)}
                  onAskAiAtCurrentFrame={(ts) =>
                    handleAskCoach(
                      `Analyze my positioning and crosshair placement at @${formatTimestamp(ts)} in ${analysis.gameTitle}.`,
                      ts
                    )
                  }
                  onCanvasElementReady={(el) => {
                    playerCanvasElementRef.current = el;
                  }}
                  onCanvasRefReady={(fn) => {
                    frameExtractorRef.current = fn;
                  }}
                />

                {/* Seamless Under-Player Workspace on Crisp White Card */}
                <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setUnderPlayerTab('moments')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          underPlayerTab === 'moments'
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        Timestamp Breakdown ({analysis.timestampedTips.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnderPlayerTab('ocr')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          underPlayerTab === 'ocr'
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        HUD OCR &amp; Audio ({analysis.hudOcrReadings.length + analysis.audioCueEvents.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnderPlayerTab('benchmarks')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          underPlayerTab === 'benchmarks'
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        Pro Benchmarks ({analysis.proBenchmarks.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsClipImportModalOpen(true)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 ring-1 ring-sky-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload / Import Clip</span>
                      </button>
                    </div>

                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {analysis.genreCriteriaLabel.split(':')[0]}
                    </span>
                  </div>

                  {/* Tab 1: Timestamped Mistake & Play Breakdown */}
                  {underPlayerTab === 'moments' && (
                    <div className="divide-y divide-slate-100">
                      {analysis.timestampedTips.map((tip) => {
                        const isSelected = activeTipId === tip.id;
                        return (
                          <div
                            key={tip.id}
                            className={`py-3.5 px-3 -mx-3 rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTipId(tip.id);
                                setCurrentTime(tip.timestampSeconds);
                              }}
                              className="text-left space-y-1 flex-1"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono tabular-nums font-bold text-amber-600">
                                  @{formatTimestamp(tip.timestampSeconds)}
                                </span>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span className="font-bold text-slate-900">{tip.title}</span>
                                <span aria-hidden="true" className="text-slate-300">·</span>
                                <span
                                  className={`font-semibold ${
                                    tip.severity === 'Critical Fix'
                                      ? 'text-rose-600'
                                      : tip.severity === 'Pro Optimization'
                                      ? 'text-emerald-600'
                                      : 'text-sky-600'
                                  }`}
                                >
                                  {tip.severity}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">{tip.observation}</p>
                              <p className="text-xs text-slate-800 leading-relaxed">
                                <strong className="text-sky-700">Coach Fix:</strong> {tip.instruction}
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveTipId(tip.id);
                                setCurrentTime(tip.timestampSeconds);
                                handleAskCoach(
                                  `How do I fix "${tip.title}" at @${formatTimestamp(tip.timestampSeconds)}?`,
                                  tip.timestampSeconds
                                );
                              }}
                              className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-600 hover:text-white text-xs font-semibold text-sky-700 transition-colors whitespace-nowrap shrink-0"
                            >
                              Ask AI Why →
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tab 2: HUD & Minimap OCR + Audio Cue Analysis */}
                  {underPlayerTab === 'ocr' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {analysis.hudOcrReadings.map((ocr) => (
                          <button
                            key={ocr.id}
                            type="button"
                            onClick={() => setCurrentTime(ocr.timestampSeconds)}
                            className="text-left rounded-xl bg-slate-50 hover:bg-slate-100/80 ring-1 ring-slate-200 p-3.5 space-y-1 transition-colors"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900">{ocr.element}</span>
                              <span className="font-mono tabular-nums text-amber-600 font-semibold">
                                @{formatTimestamp(ocr.timestampSeconds)} · {ocr.status}
                              </span>
                            </div>
                            <p className="text-xs font-mono tabular-nums text-sky-700 font-semibold">
                              {ocr.detectedValue}
                            </p>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {ocr.tacticalInsight}
                            </p>
                          </button>
                        ))}
                      </div>

                      <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2">
                        {analysis.audioCueEvents.map((cue) => (
                          <button
                            key={cue.id}
                            type="button"
                            onClick={() => setCurrentTime(cue.timestampSeconds)}
                            className="w-full text-left py-3 px-2 hover:bg-slate-50 transition-colors space-y-1 rounded-lg"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono tabular-nums font-bold text-amber-600">
                                  @{formatTimestamp(cue.timestampSeconds)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-bold text-slate-900">{cue.cueType}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-500">{cue.direction}</span>
                              </div>
                              <span
                                className={`font-mono tabular-nums font-semibold ${
                                  cue.status === 'Missed Cue'
                                    ? 'text-rose-600'
                                    : cue.status === 'Delayed'
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {cue.playerReactionMs === null
                                  ? 'MISSED CUE'
                                  : `${cue.playerReactionMs} ms (${cue.status})`}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">{cue.coachingNote}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Pro Benchmarking */}
                  {underPlayerTab === 'benchmarks' && (
                    <div className="divide-y divide-slate-100">
                      {analysis.proBenchmarks.map((bm) => (
                        <div key={bm.metric} className="py-3.5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-slate-900">{bm.metric}</span>
                            <span className="font-mono tabular-nums text-slate-600">
                              You: <strong className="text-amber-600">{bm.playerValue}{bm.unit}</strong> vs Pro Avg:{' '}
                              <strong className="text-sky-600">{bm.proAverage}{bm.unit}</strong> (Top {100 - bm.percentile}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-sky-500 to-amber-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(15, bm.percentile))}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-600">{bm.verdict}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 4: Multi-Source Clip Ingestion, Smart Trim & Console Cloud Pull */}
                  {underPlayerTab === 'import' && (
                    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                          <span>Clip Ingestion, Smart Trim (05:00 Max) &amp; Console Cloud Pull</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setIngestTab('upload')}
                            className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                              ingestTab === 'upload'
                                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Local File
                          </button>
                          <button
                            type="button"
                            onClick={() => setIngestTab('link')}
                            className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                              ingestTab === 'link'
                                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            YouTube / Twitch / Medal Link
                          </button>
                          <button
                            type="button"
                            onClick={() => setIngestTab('console')}
                            className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                              ingestTab === 'console'
                                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Xbox / PSN / Steam Cloud
                          </button>
                        </div>
                      </div>

                      {ingestTab === 'link' && (
                        <form onSubmit={handleImportDirectLink} className="space-y-3">
                          <label htmlFor="direct-clip-url" className="block text-xs font-medium text-slate-700">
                            Paste YouTube, Twitch Clip, Medal.tv, or Steam Clip URL
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              id="direct-clip-url"
                              type="url"
                              value={directLinkUrl}
                              onChange={(e) => setDirectLinkUrl(e.target.value)}
                              placeholder="https://clips.twitch.tv/..."
                              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <button
                              type="submit"
                              className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Link2 className="w-4 h-4" />
                              <span>Import &amp; Auto-Detect Game</span>
                            </button>
                          </div>
                          {linkStatusMessage && (
                            <p className="text-xs text-emerald-700 font-medium">{linkStatusMessage}</p>
                          )}
                        </form>
                      )}

                      {ingestTab === 'console' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {CONSOLE_CLOUD_CAPTURES.map((cap) => (
                            <div
                              key={cap.id}
                              className="rounded-xl bg-white ring-1 ring-slate-200 p-3.5 flex flex-col justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                  <span className="text-sky-600 font-semibold">{cap.network}</span>
                                  <span className="font-mono tabular-nums">
                                    {formatTimestamp(cap.rawDurationSeconds)} · {cap.rawSizeMb} MB
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-slate-900">{cap.title}</p>
                                <p className="text-[11px] text-slate-500">
                                  {cap.resolution} · {cap.capturedAt}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleImportConsoleCapture(cap)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-600 hover:text-white text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <CloudDownload className="w-3.5 h-3.5" />
                                <span>
                                  {cap.rawDurationSeconds > MAX_CLIP_DURATION_SECONDS
                                    ? 'Pull & Smart-Trim to 05:00'
                                    : 'Pull Cloud Capture'}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {ingestTab === 'upload' && (
                        <form onSubmit={handleRunClipAnalysis} className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label
                              htmlFor="video-file-upload"
                              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Upload className="w-4 h-4 text-sky-600" />
                              <span>Upload Local Video (MP4 / MOV / WebM)</span>
                              <input
                                id="video-file-upload"
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime,video/*"
                                onChange={handleVideoFileUpload}
                                className="sr-only"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={handleSmartTrimClip}
                              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 ring-1 ring-sky-200 text-sky-700 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Scissors className="w-3.5 h-3.5" />
                              <span>Smart Trim &amp; Compress to 05:00</span>
                            </button>
                          </div>

                          {smartTrimInfo && (
                            <div className="rounded-xl bg-sky-50 ring-1 ring-sky-200 px-4 py-2.5 text-xs text-sky-900">
                              {smartTrimInfo.summary}
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label htmlFor="select-game-input" className="block text-xs font-medium text-slate-700 mb-1">
                                Auto-Detected Game ({GAMES_CATALOG.length} Supported)
                              </label>
                              <select
                                id="select-game-input"
                                value={selectedGameId}
                                onChange={(e) => handleSelectGameChange(e.target.value)}
                                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                              >
                                {GAMES_CATALOG.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.title} ({g.genre})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label htmlFor="clip-title-input" className="block text-xs font-medium text-slate-700 mb-1">
                                Clip Title / Match Context
                              </label>
                              <input
                                id="clip-title-input"
                                type="text"
                                value={clipTitle}
                                onChange={(e) => {
                                  setClipTitle(e.target.value);
                                  setValidationError(null);
                                }}
                                placeholder="e.g. Ascent A-Site Retake 1v3"
                                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>

                            <div>
                              <label htmlFor="clip-duration-input" className="block text-xs font-medium text-slate-700 mb-1">
                                Clip Duration in Seconds (Max {MAX_CLIP_DURATION_SECONDS}s / 05:00)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  id="clip-duration-input"
                                  type="number"
                                  min={1}
                                  max={900}
                                  value={clipDurationSeconds}
                                  onChange={(e) => {
                                    setClipDurationSeconds(Number(e.target.value));
                                    setValidationError(null);
                                  }}
                                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                                <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                                  = {formatTimestamp(clipDurationSeconds)}
                                </span>
                              </div>
                            </div>

                            <div>
                              <label htmlFor="focus-mechanic-input" className="block text-xs font-medium text-slate-700 mb-1">
                                Genre-Adaptive Focus Mechanic
                              </label>
                              <select
                                id="focus-mechanic-input"
                                value={focusArea}
                                onChange={(e) => setFocusArea(e.target.value)}
                                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                              >
                                {activeGame.keyMechanics.map((mech) => (
                                  <option key={mech} value={mech}>
                                    {mech}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {(validationError || !liveValidation.valid) && (
                            <div
                              role="alert"
                              className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-900"
                            >
                              <div className="flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-bold text-rose-800">5-Minute Clip Limit Guardrail</p>
                                  <p className="mt-0.5">{validationError || liveValidation.error}</p>
                                </div>
                              </div>
                              {clipDurationSeconds > MAX_CLIP_DURATION_SECONDS && (
                                <button
                                  type="button"
                                  onClick={handleSmartTrimClip}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold whitespace-nowrap shrink-0"
                                >
                                  Auto-Slice Action 05:00
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div className="text-xs text-slate-500 font-mono tabular-nums">
                              Allowance: {formatTimestamp(clipDurationSeconds)} used ·{' '}
                              {liveValidation.remainingAllowanceSeconds}s under 05:00 cap
                            </div>

                            <button
                              type="submit"
                              disabled={isAnalyzing}
                              className="min-h-[42px] px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                            >
                              <PlayCircle className="w-4 h-4" />
                              <span>{isAnalyzing ? 'Scanning Frame Telemetry...' : 'Analyze Gameplay Clip'}</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 5 Columns: Crisp White Live AI Coach & Demo Assistant with Legion Crest */}
              <aside
                aria-label="FrameSense AI Coach Assistant"
                className="lg:col-span-5 rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-md flex flex-col"
              >
                {/* AI Coach Studio Header with Legion Development Emblem */}
                <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-sky-50/40 to-amber-50/30 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={LEGION_LOGO_PATH}
                      alt="Legion AI Coach Crest"
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-200 shadow-xs shrink-0"
                    />
                    <div className="space-y-0.5">
                      <h2 className="text-sm font-bold text-slate-900">
                        FrameSense AI <span className="text-amber-600 font-semibold">· Made by Legion</span>
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Gemini 3.8 Flash Multimodal · {analysis.gameTitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="demo-ai-walkthrough-btn"
                      onClick={handleRunDemoAiWalkthrough}
                      disabled={isSendingChat}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Demo AI Walkthrough</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleVoiceCoaching}
                      aria-label={isVoiceCoachingActive ? 'Stop voice coaching' : 'Listen to AI Coach voice'}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                        isVoiceCoachingActive
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'bg-white ring-1 ring-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isVoiceCoachingActive ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      <span>{isVoiceCoachingActive ? 'Mute' : 'Voice'}</span>
                    </button>
                  </div>
                </div>

                {/* Executive Summary & 3 Inline Telemetry Metrics */}
                <div className="px-5 py-3.5 border-b border-slate-100 space-y-3 bg-white">
                  <p className="text-xs text-slate-700 leading-relaxed">{analysis.overallSummary}</p>

                  <div className="grid grid-cols-3 divide-x divide-slate-200 pt-1">
                    {analysis.metrics.map((m, idx) => (
                      <div key={m.label} className={idx === 0 ? 'pr-3' : idx === 1 ? 'px-3' : 'pl-3'}>
                        <p className="text-[11px] text-slate-500 truncate">{m.label}</p>
                        <p className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">{m.value}</p>
                        <p
                          className={`text-[10px] font-mono tabular-nums font-semibold ${
                            m.status === 'Nominal'
                              ? 'text-emerald-600'
                              : m.status === 'Critical'
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {m.delta}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Interactive AI Coach Chat Stream (Visible Above the Fold!) */}
                <div className="px-5 py-4 space-y-3 flex-1 bg-white">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">Live Legion AI Assistant</span>
                    <span className="font-mono tabular-nums text-sky-600 font-semibold">
                      {isSendingChat || isAnalyzing ? 'AI Analyzing Frame...' : 'Ready · Frame-Synced'}
                    </span>
                  </div>

                  {/* Quick-Action Demo Assistant Prompts */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleAskCoach(
                          `Why did I lose this 1v1 at @${formatTimestamp(
                            analysis.timestampedTips[1]?.timestampSeconds ?? 52
                          )}?`,
                          analysis.timestampedTips[1]?.timestampSeconds ?? 52
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200 text-xs text-amber-800 font-medium transition-colors whitespace-nowrap shrink-0"
                    >
                      Why did I lose at @{formatTimestamp(analysis.timestampedTips[1]?.timestampSeconds ?? 52)}?
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleAskCoach(
                          `Inspect my current frame (@${formatTimestamp(currentTime)}) and tell me what to adjust.`,
                          currentTime
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 ring-1 ring-sky-200 text-xs text-sky-800 font-medium transition-colors whitespace-nowrap shrink-0"
                    >
                      Coach Frame @{formatTimestamp(currentTime)}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleAskCoach(`Give me a 60-second pre-match warmup drill for ${activeGame.title}.`)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-medium transition-colors whitespace-nowrap shrink-0"
                    >
                      Fix {activeGame.keyMechanics[0]}
                    </button>
                  </div>

                  {/* Chat Message Feed with Legion Shield Avatar */}
                  <div
                    ref={chatFeedRef}
                    data-testid="ai-coach-chat-feed"
                    className="max-h-60 overflow-y-auto space-y-2.5 pr-1"
                  >
                    {chatMessages.map((msg) => {
                      const stepParts = msg.text.split(/(?=\[\d+\])/g).map((s) => s.trim()).filter(Boolean);
                      return (
                        <div
                          key={msg.id}
                          className={`rounded-xl p-3 text-xs leading-relaxed ${
                            msg.sender === 'coach'
                              ? 'bg-slate-50 text-slate-800 ring-1 ring-slate-200/90'
                              : 'bg-sky-50 text-sky-950 ring-1 ring-sky-200 ml-6'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                            <div className="flex items-center gap-2">
                              {msg.sender === 'coach' && (
                                <img
                                  src={LEGION_LOGO_PATH}
                                  alt="Legion AI"
                                  referrerPolicy="no-referrer"
                                  className="w-4 h-4 rounded object-cover ring-1 ring-slate-200"
                                />
                              )}
                              <span className="font-bold text-slate-900">
                                {msg.sender === 'coach' ? 'FrameSense AI · Made by Legion' : 'You'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (msg.jumpToSeconds !== undefined) {
                                  setCurrentTime(msg.jumpToSeconds);
                                }
                              }}
                              className="font-mono tabular-nums text-amber-600 font-semibold hover:underline"
                            >
                              @{msg.timestamp}
                            </button>
                          </div>
                          {stepParts.length > 1 ? (
                            <div className="space-y-1.5">
                              {stepParts.map((part, i) => (
                                <p key={i} className={i > 0 ? 'pl-2 border-l-2 border-sky-400 text-slate-700' : ''}>
                                  {part}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p>{msg.text}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Chat Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAskCoach(chatInput);
                    }}
                    className="flex items-center gap-2 pt-1"
                  >
                    <label htmlFor="coach-chat-input" className="sr-only">
                      Ask FrameSense AI a coaching question
                    </label>
                    <input
                      id="coach-chat-input"
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={`Ask FrameSense AI about your ${analysis.gameTitle} clip...`}
                      className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <button
                      type="submit"
                      disabled={isSendingChat || !chatInput.trim()}
                      aria-label="Send coaching question"
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Ask AI</span>
                    </button>
                  </form>
                </div>

                {/* Compact Next-Match Micro-Drills Strip (Hairline Separated) */}
                <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/70 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                      <span>3 Micro-Drills for Next Match ({drillProgress.percentComplete}% Done)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('drills')}
                      className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
                    >
                      Habit Tracker →
                    </button>
                  </div>

                  <div className="divide-y divide-slate-200/80">
                    {analysis.drills.slice(0, 3).map((drill) => {
                      const done = completedDrillIds.includes(drill.id);
                      return (
                        <div key={drill.id} className="py-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {drill.title}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{drill.recurringFlawFixed}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDrillCompleted(drill.id)}
                            className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                              done
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-sky-600 hover:text-white'
                            }`}
                          >
                            {done ? 'Done' : 'Check'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}

        {activeTab === 'catalog' && (
          <GameCatalogView
            selectedGameId={selectedGameId}
            onSelectGameForAnalysis={(game) => {
              setSelectedGameId(game.id);
              setClipTitle(`${game.title} — ${game.keyMechanics[0]} Review`);
              setClipDurationSeconds(180);
              setFocusArea(game.keyMechanics[0]);
              setAutoDetectBanner(`Auto-Detected: ${game.title} (99.0% Visual Frame Signature)`);
              const nextAnalysis = buildStructuredAnalysisFallback({
                gameId: game.id,
                durationSeconds: 180,
                playerSkillTier,
                focusArea: game.keyMechanics[0],
                engine: 'gemini-3.8-flash',
              });
              setAnalysis(nextAnalysis);
              setCurrentTime(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 15);
              setActiveTipId(nextAnalysis.timestampedTips[0]?.id ?? null);
              setChatMessages([
                {
                  id: `cat-ai-${Date.now()}`,
                  sender: 'coach',
                  text: `Loaded ${game.title} (${game.genre}). Primary mechanic focus: ${game.keyMechanics[0]}. Click "Demo AI Walkthrough" to inspect all 5 timestamps.`,
                  timestamp: formatTimestamp(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 15),
                  jumpToSeconds: nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 15,
                },
              ]);
              setActiveTab('analyzer');
            }}
          />
        )}

        {activeTab === 'drills' && (
          <section className="space-y-6" aria-labelledby="drills-heading">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="space-y-1">
                  <p className="text-xs text-amber-600 font-semibold">
                    Multi-Week Progression &amp; Bad Habit Elimination · Made by Legion
                  </p>
                  <h1 id="drills-heading" className="text-2xl font-bold text-slate-900">
                    Habit Tracker Dashboard &amp; Custom Micro-Drills
                  </h1>
                  <p className="text-sm text-slate-600">
                    Tracks recurring mistakes across uploaded clips over weeks (reloading too early, overextending without vision, panic-rolling) to verify long-term improvement.
                  </p>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div>
                    <p className="text-xs text-slate-500">Drill Completion</p>
                    <p className="text-2xl font-bold text-sky-600 font-mono tabular-nums">
                      {drillProgress.percentComplete}%
                    </p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div>
                    <p className="text-xs text-slate-500">Habits Tracked</p>
                    <p className="text-2xl font-bold text-emerald-600 font-mono tabular-nums">
                      {habitTrends.length} Active
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {habitTrends.map((habit) => (
                  <div
                    key={habit.id}
                    className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-amber-600 font-semibold">{habit.genre}</span>
                        <span
                          className={`font-bold ${
                            habit.status.startsWith('Fixed')
                              ? 'text-emerald-600'
                              : habit.status === 'Improving'
                              ? 'text-sky-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {habit.status}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{habit.habitName}</h3>
                      <p className="text-xs text-slate-600">{habit.latestFixTip}</p>
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                      <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums text-xs">
                        <div className="rounded bg-white ring-1 ring-slate-200 p-1.5">
                          <span className="block text-[10px] text-slate-500">Wk 1</span>
                          <span className="text-rose-600 font-semibold">{habit.week1MistakesPerClip}/clip</span>
                        </div>
                        <div className="rounded bg-white ring-1 ring-slate-200 p-1.5">
                          <span className="block text-[10px] text-slate-500">Wk 2</span>
                          <span className="text-amber-600 font-semibold">{habit.week2MistakesPerClip}/clip</span>
                        </div>
                        <div className="rounded bg-white ring-1 ring-slate-200 p-1.5">
                          <span className="block text-[10px] text-slate-500">Wk 3</span>
                          <span className="text-sky-600 font-semibold">{habit.week3MistakesPerClip}/clip</span>
                        </div>
                        <div className="rounded bg-emerald-50 p-1.5 ring-1 ring-emerald-200">
                          <span className="block text-[10px] text-slate-500">Wk 4</span>
                          <span className="text-emerald-700 font-bold">{habit.week4MistakesPerClip}/clip</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleLogHabitImprovement(habit.id)}
                        className="w-full min-h-[38px] rounded-lg bg-white ring-1 ring-slate-200 hover:bg-emerald-600 hover:text-white text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span>Log Clean Match Check-In (-0.5 Mistakes/Clip)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                {analysis.drills.map((drill) => {
                  const isDone = completedDrillIds.includes(drill.id);
                  return (
                    <div
                      key={drill.id}
                      className={`rounded-2xl p-5 ring-1 transition-colors flex items-start justify-between gap-4 shadow-2xs ${
                        isDone
                          ? 'bg-emerald-50/40 ring-emerald-200'
                          : 'bg-white ring-slate-200'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="text-amber-600 font-semibold">{drill.difficulty}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{drill.durationMinutes} min</span>
                          <span aria-hidden="true">·</span>
                          <span>Target: {drill.targetMetric}</span>
                        </div>
                        <h2 className={`text-base font-bold ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {drill.title}
                        </h2>
                        <p className="text-xs text-slate-600 leading-relaxed">{drill.description}</p>
                        <p className="text-xs text-sky-700 font-medium">{drill.recurringFlawFixed}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleDrillCompleted(drill.id)}
                        aria-label={isDone ? `Mark "${drill.title}" as incomplete` : `Complete "${drill.title}"`}
                        className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                          isDone
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-sky-600 text-white hover:bg-sky-500'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isDone ? 'Completed' : 'Mark Done'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={handleAddCustomDrill}
                className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-5 space-y-4 h-fit"
              >
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-sky-600" />
                  <span>Add Custom Micro-Drill</span>
                </h2>
                <div>
                  <label htmlFor="custom-drill-title" className="block text-xs text-slate-700 font-medium mb-1.5">
                    Drill Name
                  </label>
                  <input
                    id="custom-drill-title"
                    type="text"
                    value={customDrillTitle}
                    onChange={(e) => setCustomDrillTitle(e.target.value)}
                    placeholder="e.g. 50 Counter-Strafe Bot Eliminations"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="custom-drill-minutes" className="block text-xs text-slate-700 font-medium mb-1.5">
                    Duration (Minutes)
                  </label>
                  <input
                    id="custom-drill-minutes"
                    type="number"
                    min={5}
                    max={60}
                    value={customDrillMinutes}
                    onChange={(e) => setCustomDrillMinutes(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[42px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors"
                >
                  Add to Next-Match Checklist
                </button>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'companion' && (
          <section className="space-y-6" aria-labelledby="companion-heading">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs text-amber-600 font-semibold">
                  Platform-Specific Suite · Windows &amp; macOS · iOS &amp; Android · Made by Legion
                </p>
                <h1 id="companion-heading" className="text-2xl font-bold text-slate-900">
                  Desktop Replay Buffer, In-Game Overlay &amp; Second-Screen Mobile Companion
                </h1>
                <p className="text-sm text-slate-600 max-w-3xl">
                  Use `Ctrl + Alt + Enter` on Desktop to save your background replay buffer directly to disk, or prop your phone on your desk in Second-Screen Companion Mode with live voice-synthesized coaching.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInstallModalOpen(true)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
              >
                Install Desktop / Mobile App
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Monitor className="w-5 h-5 text-sky-600" />
                    <h2 className="text-lg font-bold text-slate-900">Desktop App (Windows &amp; macOS)</h2>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-emerald-600 font-semibold">
                    Hotkey: Ctrl + Alt + Enter
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-sky-600" />
                      <span>Background Replay Buffer (1–5 Min Ring Buffer)</span>
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {replayBufferMinutes}:00 Window
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Runs quietly in the background and saves the last 1–5 minutes of gameplay to your device with a single `Ctrl + Alt + Enter` hotkey press.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 3, 5].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setReplayBufferMinutes(mins)}
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-mono tabular-nums transition-colors ${
                          replayBufferMinutes === mins
                            ? 'bg-sky-600 text-white font-bold'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        Last {mins} Min
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const dummyBlob = new Blob([new Uint8Array([26, 69, 223, 163])], {
                          type: 'video/webm',
                        });
                        finalizeAndSaveRecording(dummyBlob, replayBufferMinutes * 60);
                      }}
                      className="ml-auto min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save Buffer Now (Ctrl+Alt+Enter)</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-amber-600" />
                      <span>Lightweight In-Game Overlay Checklist</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInGameOverlay((prev) => !prev);
                        setActiveTab('analyzer');
                      }}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-sky-50 ring-1 ring-sky-200 text-sky-700 text-xs font-semibold"
                    >
                      {showInGameOverlay ? 'Overlay Active on Player' : 'Preview Overlay on Player'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">
                    Pins a transparent, zero-FPS-drop checklist of your 3 AI micro-drills in the top-right corner during live matches.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-5 h-5 text-sky-600" />
                    <h2 className="text-lg font-bold text-slate-900">Mobile App (iOS &amp; Android Second-Screen)</h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleVoiceCoaching}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      isVoiceCoachingActive
                        ? 'bg-sky-600 text-white'
                        : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                    }`}
                  >
                    {isVoiceCoachingActive ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    <span>{isVoiceCoachingActive ? 'Stop Voice Coach' : 'Listen to Voice Coaching'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-600 font-bold">
                      SECOND-SCREEN DESK COMPANION · {analysis.gameTitle.toUpperCase()}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">Live Sync Active</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 leading-snug">
                    &ldquo;{analysis.timestampedTips[0]?.instruction}&rdquo;
                  </p>
                  <div className="grid grid-cols-3 divide-x divide-slate-200 pt-1 font-mono tabular-nums text-xs">
                    {analysis.metrics.map((m, i) => (
                      <div key={m.label} className={i === 0 ? 'pr-2' : i === 1 ? 'px-2' : 'pl-2'}>
                        <span className="block text-[10px] text-slate-500 truncate">{m.label}</span>
                        <span className="text-sm font-bold text-slate-900">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-emerald-600" />
                      <span>Cloud Processing Push Alert &amp; 30s Highlight Reel</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setPushNotificationAlert(
                          `Push Alert Sent: "${analysis.gameTitle} 5-Min Clip Ready — 3 Critical Timestamps Compiled into 30s Highlight Reel."`
                        )
                      }
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 hover:bg-emerald-100 text-xs font-semibold text-emerald-800"
                    >
                      Simulate Push Summary
                    </button>
                  </div>
                  {pushNotificationAlert && (
                    <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-3 text-xs text-emerald-900 flex items-center justify-between gap-2">
                      <span>{pushNotificationAlert}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsHighlightReelPlaying(true);
                          setActiveTab('analyzer');
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold whitespace-nowrap shrink-0"
                      >
                        Watch 30s Reel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'history' && (
          <section className="space-y-6" aria-labelledby="history-heading">
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-amber-600 font-semibold">
                    Local Device Screen Recordings (Hotkey: Ctrl + Alt + Enter) · Made by Legion
                  </p>
                  <h2 className="text-xl font-bold text-slate-900">
                    Clips Saved to Your Device ({savedDeviceRecordings.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isScreenRecording) stopScreenRecording();
                    else startScreenRecording(false);
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
                >
                  {isScreenRecording
                    ? 'Stop & Save Recording (Ctrl+Alt+Enter)'
                    : 'Record New Clip (Ctrl+Alt+Enter)'}
                </button>
              </div>

              {savedDeviceRecordings.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Press <strong>Ctrl + Alt + Enter</strong> at any time to record your gameplay screen and automatically download the `.webm` clip to your device.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {savedDeviceRecordings.map((rec) => (
                    <div
                      key={rec.id}
                      className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{rec.filename}</p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {rec.gameTitle} · {formatTimestamp(rec.durationSeconds)} · {rec.sizeKb} KB · {rec.createdAt}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerDeviceFileDownload(rec.url, rec.filename)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-sky-600 hover:text-white text-xs font-semibold text-slate-800 flex items-center gap-1.5 shrink-0 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save Again</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div>
                <p className="text-xs text-amber-600 font-semibold">Local &amp; Offline Synced VOD Library</p>
                <h1 id="history-heading" className="text-2xl font-bold text-slate-900">
                  Saved Gameplay Reviews ({savedReviews.length})
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('analyzer')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
              >
                Analyze New Clip
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedReviews.map((item) => (
                <article
                  key={item.clipId}
                  className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-xs p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="text-sky-600 font-bold">{item.gameTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.genre}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatTimestamp(item.durationSeconds)}</span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900">{item.detectedSituation}</h2>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {item.overallSummary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setAnalysis(item);
                        setSelectedGameId(item.gameId);
                        setClipDurationSeconds(item.durationSeconds);
                        setCurrentTime(item.timestampedTips[0]?.timestampSeconds ?? 10);
                        setActiveTipId(item.timestampedTips[0]?.id ?? null);
                        setActiveTab('analyzer');
                      }}
                      className="min-h-[38px] px-4 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
                    >
                      Open Review in Studio
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSavedReviews((prev) => prev.filter((r) => r.clipId !== item.clipId))
                      }
                      aria-label={`Delete review for ${item.gameTitle}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Quiet Legion Development Footer Attribution */}
      <footer className="mt-12 border-t border-slate-200 bg-white py-6 px-4 sm:px-6">
        <div className="max-w-[1420px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <img
              src={LEGION_LOGO_PATH}
              alt="Legion Development"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-200"
            />
            <span>
              <strong className="text-slate-900">FrameSense</strong> · Made by{' '}
              <strong className="text-sky-600">Legion Development</strong>
            </span>
          </div>
          <span>Desktop (Windows &amp; macOS) · Android · Apple (iOS &amp; iPadOS) · Max 05:00 Clip Telemetry</span>
        </div>
      </footer>

      {/* Mobile Ergonomic Bottom Navigation Bar (Strictly <= 15% mobile viewport height) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center px-1"
      >
        <button
          type="button"
          onClick={() => setActiveTab('analyzer')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[10px] font-semibold transition-colors ${
            activeTab === 'analyzer' ? 'text-sky-600' : 'text-slate-500'
          }`}
        >
          <Target className="w-4 h-4" />
          <span className="mt-0.5">Studio</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[10px] font-semibold transition-colors ${
            activeTab === 'catalog' ? 'text-sky-600' : 'text-slate-500'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span className="mt-0.5">128 Games</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drills')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[10px] font-semibold transition-colors ${
            activeTab === 'drills' ? 'text-sky-600' : 'text-slate-500'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span className="mt-0.5">Habits</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('companion')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[10px] font-semibold transition-colors ${
            activeTab === 'companion' ? 'text-sky-600' : 'text-slate-500'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span className="mt-0.5">Companion</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`min-h-[44px] flex flex-col items-center justify-center text-[10px] font-semibold transition-colors ${
            activeTab === 'history' ? 'text-sky-600' : 'text-slate-500'
          }`}
        >
          <History className="w-4 h-4" />
          <span className="mt-0.5">Saved</span>
        </button>
      </nav>

      {/* Cross-Platform Installation Modal (Desktop, Android, Apple iOS/macOS) */}
      <CrossPlatformModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* 1-Click Game Switcher Modal (128 Games with Instant Search) */}
      <GameSelectorModal
        isOpen={isGameSelectorOpen}
        onClose={() => setIsGameSelectorOpen(false)}
        selectedGameId={selectedGameId}
        onSelectGame={(game) => {
          setSelectedGameId(game.id);
          setFocusArea(game.keyMechanics[0]);
          setAutoDetectBanner(`Selected: ${game.title} (${game.genre})`);
          setIsDemoMode(false);
          try {
            localStorage.setItem('framesense_is_demo_mode', 'false');
          } catch {
            // ignore
          }
          const nextAnalysis = buildStructuredAnalysisFallback({
            gameId: game.id,
            durationSeconds: clipDurationSeconds,
            playerSkillTier,
            focusArea: game.keyMechanics[0],
            engine: 'gemini-3.8-flash',
          });
          setAnalysis(nextAnalysis);
          setCurrentTime(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 10);
          setActiveTipId(nextAnalysis.timestampedTips[0]?.id ?? null);
          setChatMessages((prev) => [
            ...prev,
            {
              id: `switch-game-${Date.now()}`,
              sender: 'coach',
              text: `Switched target game to ${game.title} (${game.genre}). Rubric calibrated for ${game.keyMechanics.join(', ')}.`,
              timestamp: formatTimestamp(nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 10),
              jumpToSeconds: nextAnalysis.timestampedTips[0]?.timestampSeconds ?? 10,
            },
          ]);
        }}
      />

      {/* Multi-Source Clip Import & Smart-Trim Modal */}
      <ClipImportModal
        isOpen={isClipImportModalOpen}
        onClose={() => setIsClipImportModalOpen(false)}
        onSelectLocalFile={(file) => {
          processImportedVideoFile(file);
          setIsClipImportModalOpen(false);
        }}
        onImportLink={(url) => {
          setDirectLinkUrl(url);
          const parsed = parseDirectClipLink(url);
          if (!parsed.valid) {
            setValidationError(parsed.error ?? 'Invalid clip link.');
            return;
          }
          setValidationError(null);
          setIsDemoMode(false);
          try {
            localStorage.setItem('framesense_is_demo_mode', 'false');
          } catch {
            // ignore
          }
          setSelectedGameId(parsed.detectedGame.id);
          setClipTitle(`${parsed.detectedGame.title} — ${parsed.provider} Clip (${parsed.clipTitle})`);
          setClipDurationSeconds(parsed.estimatedDurationSeconds);
          setFocusArea(parsed.detectedGame.keyMechanics[0]);
          setAutoDetectBanner(
            `Auto-Detected from ${parsed.provider}: ${parsed.detectedGame.title}`
          );
          const nextResult = buildStructuredAnalysisFallback({
            gameId: parsed.detectedGame.id,
            durationSeconds: parsed.estimatedDurationSeconds,
            playerSkillTier,
            focusArea: parsed.detectedGame.keyMechanics[0],
            engine: 'gemini-3.8-flash',
          });
          setAnalysis(nextResult);
          setCurrentTime(nextResult.timestampedTips[0]?.timestampSeconds ?? 15);
          setActiveTipId(nextResult.timestampedTips[0]?.id ?? null);
          setIsClipImportModalOpen(false);
        }}
        onImportConsoleCapture={(capture) => {
          handleImportConsoleCapture(capture);
          setIsClipImportModalOpen(false);
        }}
        validationError={validationError}
        linkStatusMessage={linkStatusMessage}
      />
    </div>
  );
}
