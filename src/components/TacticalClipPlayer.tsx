import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Eye,
  EyeOff,
  Crosshair,
  PenTool,
  Layers,
  Sparkles,
  Trash2,
  MessageSquarePlus,
} from 'lucide-react';
import {
  GameProfile,
  TimestampedTip,
  CoachingDrill,
  formatTimestamp,
  MAX_CLIP_DURATION_SECONDS,
} from '../utils/gameplayEngine';

export const LEGION_LOGO_PATH =
  '/assets/aistudio/Gemini_Generated_Image_q3plqdq3plqdq3pl_1b48bf13.jpg';

interface CustomArrow {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface TacticalClipPlayerProps {
  game: GameProfile;
  clipTitle: string;
  durationSeconds: number;
  currentTime: number;
  onTimeChange: (newTime: number) => void;
  timestampedTips: TimestampedTip[];
  drills: CoachingDrill[];
  completedDrillIds: string[];
  activeTipId: string | null;
  onSelectTip: (tip: TimestampedTip) => void;
  uploadedVideoUrl: string | null;
  showInGameOverlay: boolean;
  onToggleInGameOverlay: () => void;
  isHighlightReelPlaying: boolean;
  onToggleHighlightReel: () => void;
  onAskAiAtCurrentFrame?: (timestampSec: number) => void;
  onCanvasElementReady?: (canvas: HTMLCanvasElement | null) => void;
  onCanvasRefReady?: (getFrames: () => string[]) => void;
}

export const TacticalClipPlayer: React.FC<TacticalClipPlayerProps> = ({
  game,
  clipTitle,
  durationSeconds,
  currentTime,
  onTimeChange,
  timestampedTips,
  drills,
  completedDrillIds,
  activeTipId,
  onSelectTip,
  uploadedVideoUrl,
  showInGameOverlay,
  onToggleInGameOverlay,
  isHighlightReelPlaying,
  onToggleHighlightReel,
  onAskAiAtCurrentFrame,
  onCanvasElementReady,
  onCanvasRefReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showCoachOverlay, setShowCoachOverlay] = useState(true);
  const [showHudOcrBoxes, setShowHudOcrBoxes] = useState(true);
  const [telestratorDrawMode, setTelestratorDrawMode] = useState(false);
  const [customArrows, setCustomArrows] = useState<CustomArrow[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const activeTip =
    timestampedTips.find((t) => t.id === activeTipId) ??
    timestampedTips.find((t) => Math.abs(t.timestampSeconds - currentTime) <= 8) ??
    timestampedTips[0] ??
    null;

  useEffect(() => {
    if (onCanvasElementReady) {
      onCanvasElementReady(canvasRef.current);
    }
  }, [onCanvasElementReady]);

  const drawArrowhead = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ) => {
    const headLen = 12;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawProceduralFrame = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, timeSec: number) => {
      ctx.clearRect(0, 0, width, height);

      // Deep Medal-style obsidian cinema backdrop with Legion cyan/cobalt depth
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.42,
        40,
        width * 0.5,
        height * 0.5,
        width * 0.75
      );
      bgGrad.addColorStop(0, '#111C33');
      bgGrad.addColorStop(0.55, '#0A0F1D');
      bgGrad.addColorStop(1, '#050811');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const horizonY = height * 0.46;

      // Subtle 3D perspective floor mesh (below horizon)
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.075)';
      ctx.lineWidth = 1;
      const numRays = 12;
      for (let i = -numRays; i <= numRays; i++) {
        ctx.beginPath();
        ctx.moveTo(width * 0.5 + i * 18, horizonY);
        ctx.lineTo(width * 0.5 + i * 110, height);
        ctx.stroke();
      }
      for (let r = 1; r <= 6; r++) {
        const y = horizonY + Math.pow(r / 6, 1.6) * (height - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      const phase = (timeSec % 20) / 20;
      const pulse = Math.sin(timeSec * 2.1) * 0.5 + 0.5;

      if (
        game.genre === 'Tactical Shooter' ||
        game.genre === 'Battle Royale & Survival' ||
        game.genre === 'Hero & Action Multiplayer'
      ) {
        ctx.save();
        const leftWallGrad = ctx.createLinearGradient(0, 0, width * 0.28, 0);
        leftWallGrad.addColorStop(0, 'rgba(12, 19, 36, 0.94)');
        leftWallGrad.addColorStop(1, 'rgba(30, 58, 138, 0.28)');
        ctx.fillStyle = leftWallGrad;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.08);
        ctx.lineTo(width * 0.27, height * 0.26);
        ctx.lineTo(width * 0.27, height * 0.74);
        ctx.lineTo(0, height * 0.92);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.32)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const rightWallGrad = ctx.createLinearGradient(width * 0.72, 0, width, 0);
        rightWallGrad.addColorStop(0, 'rgba(30, 58, 138, 0.28)');
        rightWallGrad.addColorStop(1, 'rgba(12, 19, 36, 0.94)');
        ctx.fillStyle = rightWallGrad;
        ctx.beginPath();
        ctx.moveTo(width * 0.73, height * 0.28);
        ctx.lineTo(width, height * 0.12);
        ctx.lineTo(width, height * 0.88);
        ctx.lineTo(width * 0.73, height * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.24)';
        ctx.stroke();

        // Head-level elevation laser guide
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.35)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(width * 0.16, horizonY - 8);
        ctx.lineTo(width * 0.84, horizonY - 8);
        ctx.stroke();
        ctx.setLineDash([]);

        const targetX = width * (0.51 + Math.sin(timeSec * 0.75) * 0.06);
        const targetY = horizonY - 8;

        ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.88)';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.roundRect(targetX - 14, targetY + 10, 28, 56, 12);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(targetX, targetY - 2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const reticleX = targetX - 18 + pulse * 14;
        const reticleY = targetY;
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(reticleX - 11, reticleY);
        ctx.lineTo(reticleX - 3, reticleY);
        ctx.moveTo(reticleX + 3, reticleY);
        ctx.lineTo(reticleX + 11, reticleY);
        ctx.moveTo(reticleX, reticleY - 11);
        ctx.lineTo(reticleX, reticleY - 3);
        ctx.moveTo(reticleX, reticleY + 3);
        ctx.lineTo(reticleX, reticleY + 11);
        ctx.stroke();
        ctx.restore();
      } else if (game.genre === 'MOBA' || game.genre === 'RTS & Strategy') {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.25)';
        ctx.lineWidth = 28;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(width * 0.18, height * 0.84);
        ctx.quadraticCurveTo(width * 0.5, height * 0.48, width * 0.82, height * 0.18);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(width * 0.52, height * 0.48, 64, 0, Math.PI * 2);
        ctx.stroke();

        const units = [
          { x: 0.39 + phase * 0.04, y: 0.57, color: '#00D2FF' },
          { x: 0.45, y: 0.63, color: '#00D2FF' },
          { x: 0.58 - phase * 0.03, y: 0.42, color: '#F43F5E' },
          { x: 0.63, y: 0.48, color: '#F43F5E' },
        ];
        for (const u of units) {
          ctx.fillStyle = u.color;
          ctx.beginPath();
          ctx.arc(width * u.x, height * u.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.5, 84, 0.15 * Math.PI, 1.45 * Math.PI);
        ctx.stroke();

        ctx.strokeStyle = '#00D2FF';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(width * 0.26, height * 0.68);
        ctx.quadraticCurveTo(width * 0.48, height * 0.28, width * 0.74, height * 0.6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Circular Radar Minimap & HUD OCR Telemetry
      if (showHudOcrBoxes) {
        ctx.save();
        const radarX = 68;
        const radarY = 92;
        const radarR = 42;

        ctx.fillStyle = 'rgba(7, 11, 21, 0.85)';
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(radarX, radarY, radarR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const sweepAngle = (timeSec * 0.9) % (Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 210, 255, 0.16)';
        ctx.beginPath();
        ctx.moveTo(radarX, radarY);
        ctx.arc(radarX, radarY, radarR - 2, sweepAngle - 0.45, sweepAngle + 0.45);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#00D2FF';
        ctx.beginPath();
        ctx.arc(radarX - 8, radarY + 6, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FF7A00';
        ctx.beginPath();
        ctx.arc(radarX + 14, radarY - 11, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = '#7DD3FC';
        ctx.fillText('MINIMAP OCR', 36, 148);

        const hudW = 168;
        const hudH = 38;
        const hudX = width - hudW - 18;
        const hudY = height - hudH - 88;
        ctx.fillStyle = 'rgba(7, 11, 21, 0.86)';
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.45)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.roundRect(hudX, hudY, hudW, hudH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#7DD3FC';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText('HUD OCR · 24/25 MAG', hudX + 12, hudY + 16);
        ctx.fillStyle = '#F59E0B';
        ctx.font = '500 9px "JetBrains Mono", monospace';
        ctx.fillText('LEGION TELEMETRY SYNC', hudX + 12, hudY + 29);
        ctx.restore();
      }

      // Telestrator Overlay
      if (showCoachOverlay && activeTip) {
        ctx.save();
        const bx = (activeTip.overlayBox.x / 100) * width;
        const by = (activeTip.overlayBox.y / 100) * height;
        const bw = (activeTip.overlayBox.width / 100) * width;
        const bh = (activeTip.overlayBox.height / 100) * height;
        const vx = (activeTip.overlayBox.vectorEndX / 100) * width;
        const vy = (activeTip.overlayBox.vectorEndY / 100) * height;

        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
        ctx.strokeStyle = 'rgba(255, 138, 0, 0.9)';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 12);
        ctx.fill();
        ctx.stroke();

        if (activeTip.overlayBox.crosshairPath && activeTip.overlayBox.crosshairPath.length >= 2) {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.88)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          activeTip.overlayBox.crosshairPath.forEach((pt, idx) => {
            const px = (pt.x / 100) * width;
            const py = (pt.y / 100) * height;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }

        drawArrowhead(ctx, bx + bw / 2, by + bh / 2, vx, vy, '#00D2FF');

        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        const textWidth = ctx.measureText(activeTip.overlayBox.label).width;
        const tagY = Math.max(10, by - 28);
        ctx.fillStyle = 'rgba(7, 10, 18, 0.92)';
        ctx.strokeStyle = 'rgba(255, 138, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, tagY, textWidth + 18, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FDE68A';
        ctx.fillText(activeTip.overlayBox.label, bx + 9, tagY + 15);
        ctx.restore();
      }

      for (const arrow of customArrows) {
        drawArrowhead(ctx, arrow.startX, arrow.startY, arrow.endX, arrow.endY, '#F43F5E');
      }

      // Top-left timecode watermark
      ctx.save();
      ctx.fillStyle = 'rgba(7, 10, 18, 0.78)';
      ctx.beginPath();
      ctx.roundRect(16, 14, 248, 26, 8);
      ctx.fill();
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#E2E8F0';
      ctx.fillText(
        `${game.title.slice(0, 16)} · ${formatTimestamp(timeSec, true)} / ${formatTimestamp(durationSeconds)}`,
        26,
        31
      );
      ctx.restore();
    },
    [game, durationSeconds, showCoachOverlay, showHudOcrBoxes, activeTip, customArrows]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawProceduralFrame(ctx, canvas.width, canvas.height, currentTime);
  }, [currentTime, drawProceduralFrame]);

  useEffect(() => {
    if (!isPlaying && !isHighlightReelPlaying) return;
    const intervalMs = 100;
    const timer = window.setInterval(() => {
      const next = currentTime + (intervalMs / 1000) * playbackSpeed;
      if (next >= durationSeconds) {
        onTimeChange(0);
        setIsPlaying(false);
      } else {
        onTimeChange(Number(next.toFixed(1)));
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, isHighlightReelPlaying, currentTime, durationSeconds, playbackSpeed, onTimeChange]);

  useEffect(() => {
    if (videoRef.current && uploadedVideoUrl) {
      if (Math.abs(videoRef.current.currentTime - currentTime) > 0.4) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime, uploadedVideoUrl]);

  useEffect(() => {
    if (!onCanvasRefReady) return;
    onCanvasRefReady(() => {
      const canvas = canvasRef.current;
      if (!canvas) return [];
      try {
        return [canvas.toDataURL('image/jpeg', 0.75)];
      } catch {
        return [];
      }
    });
  }, [onCanvasRefReady]);

  const handleCanvasPointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!telestratorDrawMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    setDragStart({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    });
  };

  const handleCanvasPointerUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!telestratorDrawMode || !dragStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;
    if (Math.hypot(endX - dragStart.x, endY - dragStart.y) > 12) {
      setCustomArrows((prev) => [
        ...prev,
        { startX: dragStart.x, startY: dragStart.y, endX, endY },
      ]);
    }
    setDragStart(null);
  };

  const handleTogglePlay = () => {
    if (videoRef.current && uploadedVideoUrl) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
    setIsPlaying((prev) => !prev);
  };

  const handleStepSeconds = (delta: number) => {
    setIsPlaying(false);
    const clamped = Math.min(durationSeconds, Math.max(0, Number((currentTime + delta).toFixed(1))));
    onTimeChange(clamped);
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-md">
      {/* Crisp White Studio Theater Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-bold text-sky-600">{game.title}</span>
            <span aria-hidden="true">·</span>
            <span>{game.genre}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {formatTimestamp(durationSeconds)} / {formatTimestamp(MAX_CLIP_DURATION_SECONDS)} Max
            </span>
          </div>
          <h2 className="text-sm font-bold text-slate-900 truncate mt-0.5">{clipTitle}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onAskAiAtCurrentFrame && (
            <button
              type="button"
              onClick={() => onAskAiAtCurrentFrame(currentTime)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 shadow-xs"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Ask AI @ {formatTimestamp(currentTime)}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCoachOverlay((prev) => !prev)}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              showCoachOverlay
                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 font-semibold'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            {showCoachOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Telestrator</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHudOcrBoxes((prev) => !prev)}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              showHudOcrBoxes
                ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-300 font-semibold'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>HUD OCR</span>
          </button>

          <button
            type="button"
            onClick={() => setTelestratorDrawMode((prev) => !prev)}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              telestratorDrawMode
                ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-300 font-semibold'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{telestratorDrawMode ? 'Drawing On' : 'Draw Arrow'}</span>
          </button>

          {customArrows.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomArrows([])}
              aria-label="Clear custom telestrator drawings"
              className="min-h-[36px] px-2 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-600 hover:text-rose-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleInGameOverlay}
            className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showInGameOverlay
                ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-300 font-semibold'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            In-Game HUD
          </button>
        </div>
      </div>

      {/* 16:9 Cinema Viewport */}
      <div className="relative aspect-video w-full bg-[#050811] overflow-hidden">
        {uploadedVideoUrl ? (
          <video
            ref={videoRef}
            src={uploadedVideoUrl}
            className="w-full h-full object-contain"
            playsInline
            muted
            onTimeUpdate={(e) => onTimeChange(e.currentTarget.currentTime)}
          />
        ) : null}

        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          onMouseDown={handleCanvasPointerDown}
          onMouseUp={handleCanvasPointerUp}
          data-testid="tactical-gameplay-canvas"
          className={`w-full h-full object-cover ${
            telestratorDrawMode ? 'cursor-crosshair' : ''
          } ${uploadedVideoUrl ? 'opacity-70 mix-blend-screen absolute inset-0' : ''}`}
        />

        {/* Medal-Style Top-Right Legion Development Corner Watermark Badge */}
        {!showInGameOverlay && (
          <div className="absolute top-3 right-3 rounded-lg bg-white/95 backdrop-blur-md ring-1 ring-slate-200 px-2.5 py-1.5 flex items-center gap-2 pointer-events-none shadow-sm">
            <img
              src={LEGION_LOGO_PATH}
              alt="Legion Development Crest"
              referrerPolicy="no-referrer"
              className="w-5 h-5 rounded object-cover ring-1 ring-sky-400/50"
            />
            <span className="text-[10px] font-bold tracking-wide text-slate-900">
              LEGION <span className="text-sky-600">AI</span>
            </span>
          </div>
        )}

        {/* Desktop In-Game Overlay Corner Checklist Preview */}
        {showInGameOverlay && (
          <div
            data-testid="in-game-overlay-hud"
            className="absolute top-3 right-3 w-64 rounded-xl bg-white/95 backdrop-blur-md ring-1 ring-slate-200 p-3 space-y-2 shadow-xl"
          >
            <div className="flex items-center justify-between text-[11px] text-sky-700 font-bold border-b border-slate-200 pb-1.5">
              <span>LIVE IN-GAME OVERLAY HUD</span>
              <span className="font-mono tabular-nums text-slate-500">F8 Toggle</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-800">
              {drills.slice(0, 3).map((d) => {
                const done = completedDrillIds.includes(d.id);
                return (
                  <li key={d.id} className="flex items-start gap-1.5">
                    <span className={done ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                      {done ? '✓' : '•'}
                    </span>
                    <span className={done ? 'line-through text-slate-400' : 'font-medium'}>{d.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Active Tip Scrim Banner on bottom of viewport */}
        {activeTip && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 pt-8 pb-3 pointer-events-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Crosshair className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-mono tabular-nums text-amber-400 font-semibold">
                  @{formatTimestamp(activeTip.timestampSeconds)}
                </span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="font-semibold text-white">{activeTip.title}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="text-slate-300">{activeTip.category}</span>
              </div>
              <span className="text-xs text-sky-300 font-medium">{activeTip.severity}</span>
            </div>
            <p className="text-xs text-slate-200 mt-1 line-clamp-2">{activeTip.instruction}</p>
          </div>
        )}
      </div>

      {/* Crisp White Timeline Scrubber & Marker Pins */}
      <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-200 space-y-2.5">
        <div className="relative pt-1">
          <label htmlFor="clip-timeline-scrubber" className="sr-only">
            Scrub gameplay clip timeline
          </label>
          <input
            id="clip-timeline-scrubber"
            type="range"
            min={0}
            max={durationSeconds}
            step={0.5}
            value={currentTime}
            onChange={(e) => {
              setIsPlaying(false);
              onTimeChange(Number(e.target.value));
            }}
            className="w-full accent-sky-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
          />

          {/* Quick Jump Timestamp Marker Pins */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium mr-1">Clip Pins:</span>
              {timestampedTips.map((tip) => {
                const isSelected = activeTip?.id === tip.id;
                return (
                  <button
                    key={tip.id}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      onTimeChange(tip.timestampSeconds);
                      onSelectTip(tip);
                    }}
                    aria-label={`Jump to coaching tip at ${formatTimestamp(tip.timestampSeconds)}: ${tip.title}`}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-sky-600 text-white font-semibold shadow-xs'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {formatTimestamp(tip.timestampSeconds)} · {tip.title.split(' ')[0]}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleHighlightReel}
              className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isHighlightReelPlaying
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isHighlightReelPlaying ? 'Playing 30s Highlight Reel' : '30s Highlight Reel'}</span>
            </button>
          </div>
        </div>

        {/* Transport & Frame Step Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause clip' : 'Play clip'}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : 'Play Clip'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleStepSeconds(-2)}
              aria-label="Step back 2 seconds"
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-mono tabular-nums flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span>-2s</span>
            </button>

            <button
              type="button"
              onClick={() => handleStepSeconds(2)}
              aria-label="Step forward 2 seconds"
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-mono tabular-nums flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <span>+2s</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-600 font-medium">
              {formatTimestamp(currentTime, true)} / {formatTimestamp(durationSeconds)}
            </span>

            <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
              {[0.5, 1, 1.5].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setPlaybackSpeed(spd)}
                  aria-label={`Set playback speed to ${spd}x`}
                  className={`px-2 py-1 rounded-md text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    playbackSpeed === spd
                      ? 'bg-white text-slate-900 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
