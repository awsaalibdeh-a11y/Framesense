import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  MAX_CLIP_DURATION_SECONDS,
  validateClipInput,
  findGameByIdOrTitle,
  autoDetectGameFromClip,
  buildStructuredAnalysisFallback,
  buildCoachReplyFallback,
  type ClipAnalysisResult,
  type TimestampedTip,
} from './src/utils/gameplayEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', maxClipSeconds: MAX_CLIP_DURATION_SECONDS });
  });

  app.post('/api/detect-game', async (req, res) => {
    try {
      const { filename = '', frameDataUrl = '' } = req.body ?? {};
      const ai = getGeminiClient();

      if (ai && typeof frameDataUrl === 'string' && frameDataUrl.includes('base64,')) {
        try {
          const [header, base64Data] = frameDataUrl.split('base64,');
          const mimeMatch = header.match(/data:(image\/[a-zA-Z0-9.+-]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

          if (base64Data) {
            const prompt = `Identify which video game is shown in this gameplay screenshot frame.
Inspect user interface elements (minimap, health bar, ammo counter, ability icons, crosshair style, art style, killfeed).
Return ONLY a JSON object with:
- "gameTitle": Exact title of the game (e.g. "Valorant", "Apex Legends", "Fortnite", "Call of Duty: Warzone", "Overwatch 2", "Counter-Strike 2", "Elden Ring", "League of Legends", "Rocket League", "Street Fighter 6", etc.)
- "confidencePercent": number from 50 to 99
- "matchedElements": array of 2-3 specific visual elements detected (e.g. ["Circular Radar Minimap", "Health & Shield Bars", "Reticule Style"])
- "reason": 1 sentence explaining the identification`;

            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  },
                  { text: prompt },
                ],
              },
              config: {
                responseMimeType: 'application/json',
              },
            });

            const parsed = JSON.parse(response.text?.trim() || '{}');
            if (parsed.gameTitle) {
              const matchedGame = findGameByIdOrTitle(parsed.gameTitle);
              return res.json({
                detectedGame: matchedGame,
                confidencePercent: Number(parsed.confidencePercent) || 98.6,
                matchedHudElements: Array.isArray(parsed.matchedElements) && parsed.matchedElements.length > 0
                  ? parsed.matchedElements
                  : matchedGame.hudSignature,
                detectionMethod: 'Visual Frame Signature',
                isConfident: true,
                reason: parsed.reason || `Visual AI detected ${matchedGame.title} UI and art style.`,
              });
            }
          }
        } catch (_aiErr) {
          // Fall through to heuristic detection
        }
      }

      // Heuristic fallback
      const result = autoDetectGameFromClip({ filename: String(filename) });
      res.json(result);
    } catch (err) {
      const fallback = autoDetectGameFromClip({});
      res.json(fallback);
    }
  });

  app.post('/api/analyze-clip', async (req, res) => {
    try {
      const {
        gameId = 'valorant',
        durationSeconds = 168,
        playerSkillTier = 'Diamond / Competitive',
        focusArea = 'Crosshair Placement & Positioning',
        userNotes = '',
        clipTitle = 'Gameplay Clip',
        frames = [],
      } = req.body ?? {};

      const validation = validateClipInput({
        durationSeconds: Number(durationSeconds),
        title: String(clipTitle),
      });

      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const game = findGameByIdOrTitle(String(gameId));
      const safeDuration = Math.min(MAX_CLIP_DURATION_SECONDS, Math.max(10, Math.round(Number(durationSeconds))));
      const ai = getGeminiClient();

      if (!ai) {
        const fallback = buildStructuredAnalysisFallback({
          gameId: game.id,
          durationSeconds: safeDuration,
          playerSkillTier,
          focusArea,
          userNotes,
          engine: 'framesense-deterministic-engine',
        });
        res.json(fallback);
        return;
      }

      try {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        if (Array.isArray(frames)) {
          for (const frameDataUrl of frames.slice(0, 4)) {
            if (typeof frameDataUrl === 'string' && frameDataUrl.includes('base64,')) {
              const [header, base64Data] = frameDataUrl.split('base64,');
              const mimeMatch = header.match(/data:(image\/[a-zA-Z0-9.+-]+);/);
              const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
              if (base64Data) {
                parts.push({
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                });
              }
            }
          }
        }

        const promptText = `You are an elite esports and gameplay coach analyzing a ${safeDuration}-second clip (max 5 minutes) for the game "${game.title}" (Genre: ${game.genre}).
Player Skill Tier: ${playerSkillTier}
Primary Coaching Focus: ${focusArea}
Player Notes: ${userNotes || 'None provided'}
Key Mechanics for ${game.title}: ${game.keyMechanics.join(', ')}
Telemetry Metrics for ${game.title}: ${game.telemetryMetrics.join(', ')}

Provide a comprehensive, actionable coaching breakdown with:
1. overallSummary: 2-3 sentences summarizing strengths and primary mechanical/tactical fixes.
2. detectedSituation: Short 1-line summary of the tactical scenario.
3. metrics: 3 telemetry items matching the game's metrics with value, benchmark, delta, and status ("Nominal" | "Attention" | "Critical").
4. timestampedTips: 5 timestamped coaching markers strictly between 2 seconds and ${safeDuration - 2} seconds, each with title, category ("Positioning" | "Mechanics" | "Resource & Cooldowns" | "Decision Making" | "Tempo & Timing"), severity ("Critical Fix" | "Tactical Adjustment" | "Pro Optimization"), observation, instruction, proTip, and overlayBox (x, y, width, height between 15 and 75, label, vectorEndX, vectorEndY).
5. stepByStepInstructions: 3 chronological phase instructions with stepNumber (1, 2, 3), phase, title, action, and commonTrap.
6. drills: 3 targeted practice drills with id, title, durationMinutes (5-20), difficulty ("Foundation" | "Intermediate" | "Competitive"), description, and targetMetric.`;

        parts.push({ text: promptText });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            systemInstruction:
              'You are FrameSense AI, a precision cross-platform gameplay coach covering 120+ competitive and action games. Always output valid JSON adhering to the schema.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                overallSummary: { type: Type.STRING },
                detectedSituation: { type: Type.STRING },
                metrics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      value: { type: Type.STRING },
                      benchmark: { type: Type.STRING },
                      delta: { type: Type.STRING },
                      status: { type: Type.STRING },
                    },
                  },
                },
                timestampedTips: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      timestampSeconds: { type: Type.NUMBER },
                      title: { type: Type.STRING },
                      category: { type: Type.STRING },
                      severity: { type: Type.STRING },
                      observation: { type: Type.STRING },
                      instruction: { type: Type.STRING },
                      proTip: { type: Type.STRING },
                      overlayBox: {
                        type: Type.OBJECT,
                        properties: {
                          x: { type: Type.NUMBER },
                          y: { type: Type.NUMBER },
                          width: { type: Type.NUMBER },
                          height: { type: Type.NUMBER },
                          label: { type: Type.STRING },
                          vectorEndX: { type: Type.NUMBER },
                          vectorEndY: { type: Type.NUMBER },
                        },
                      },
                    },
                  },
                },
                stepByStepInstructions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      stepNumber: { type: Type.INTEGER },
                      phase: { type: Type.STRING },
                      title: { type: Type.STRING },
                      action: { type: Type.STRING },
                      commonTrap: { type: Type.STRING },
                    },
                  },
                },
                drills: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      durationMinutes: { type: Type.INTEGER },
                      difficulty: { type: Type.STRING },
                      description: { type: Type.STRING },
                      targetMetric: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        const fallback = buildStructuredAnalysisFallback({
          gameId: game.id,
          durationSeconds: safeDuration,
          playerSkillTier,
          focusArea,
          userNotes,
          engine: 'gemini-3.8-flash',
        });

        const result: ClipAnalysisResult = {
          ...fallback,
          analysisEngine: 'gemini-3.8-flash',
          overallSummary: parsed.overallSummary || fallback.overallSummary,
          detectedSituation: parsed.detectedSituation || fallback.detectedSituation,
          metrics:
            Array.isArray(parsed.metrics) && parsed.metrics.length === 3 ? parsed.metrics : fallback.metrics,
          timestampedTips:
            Array.isArray(parsed.timestampedTips) && parsed.timestampedTips.length >= 3
              ? parsed.timestampedTips.map((t: Partial<TimestampedTip>, idx: number) => ({
                  ...fallback.timestampedTips[idx % fallback.timestampedTips.length],
                  ...t,
                  id: t.id || `${game.id}-tip-${idx + 1}`,
                  timestampSeconds: Math.min(
                    safeDuration - 1,
                    Math.max(1, Number(t.timestampSeconds ?? fallback.timestampedTips[idx % fallback.timestampedTips.length].timestampSeconds))
                  ),
                }))
              : fallback.timestampedTips,
          stepByStepInstructions:
            Array.isArray(parsed.stepByStepInstructions) && parsed.stepByStepInstructions.length >= 2
              ? parsed.stepByStepInstructions
              : fallback.stepByStepInstructions,
          drills:
            Array.isArray(parsed.drills) && parsed.drills.length >= 2 ? parsed.drills : fallback.drills,
        };

        res.json(result);
      } catch (_geminiErr) {
        const fallback = buildStructuredAnalysisFallback({
          gameId: game.id,
          durationSeconds: safeDuration,
          playerSkillTier,
          focusArea,
          userNotes,
          engine: 'framesense-deterministic-engine',
        });
        res.json(fallback);
      }
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected error analyzing gameplay clip.',
      });
    }
  });

  app.post('/api/coach-chat', async (req, res) => {
    try {
      const {
        gameTitle = 'Valorant',
        genre = 'Tactical Shooter',
        question = '',
        clipSummary = '',
        timestampedTips = [],
        currentTimeSeconds = 20,
        frameDataUrl = '',
      } = req.body ?? {};

      if (!question || String(question).trim().length === 0) {
        res.status(400).json({ error: 'Please enter a coaching question.' });
        return;
      }

      const safeCurrentTime = Number(currentTimeSeconds) || 20;
      const ai = getGeminiClient();
      if (!ai) {
        const reply = buildCoachReplyFallback({
          gameTitle: String(gameTitle),
          genre,
          question: String(question),
          timestampedTips: Array.isArray(timestampedTips) ? timestampedTips : [],
          currentTimeSeconds: safeCurrentTime,
        });
        res.json({ reply, engine: 'framesense-ai-coach' });
        return;
      }

      try {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
        if (typeof frameDataUrl === 'string' && frameDataUrl.includes('base64,')) {
          const [header, base64Data] = frameDataUrl.split('base64,');
          const mimeMatch = header.match(/data:(image\/[a-zA-Z0-9.+-]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          if (base64Data) {
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          }
        }

        parts.push({
          text: `Game: ${gameTitle} (${genre})
Current Frame Timestamp: ${safeCurrentTime}s
Analyzed Clip Context: ${clipSummary}
Key Timestamp Markers: ${JSON.stringify(
            (Array.isArray(timestampedTips) ? timestampedTips : []).map((t: TimestampedTip) => ({
              time: t.timestampSeconds,
              title: t.title,
              instruction: t.instruction,
            }))
          )}

Player Question: ${question}

Give a concise, high-impact coaching answer (3-4 sentences max) with specific mechanical steps and timestamps they can apply immediately.`,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            systemInstruction:
              'You are FrameSense AI Coach (Made by Legion), an expert competitive gaming instructor. Be direct, specific, and actionable.',
          },
        });

        const text = response.text?.trim();
        res.json({
          reply:
            text ||
            buildCoachReplyFallback({
              gameTitle: String(gameTitle),
              genre,
              question: String(question),
              timestampedTips: Array.isArray(timestampedTips) ? timestampedTips : [],
              currentTimeSeconds: safeCurrentTime,
            }),
          engine: 'gemini-3.8-flash',
        });
      } catch (_err) {
        const reply = buildCoachReplyFallback({
          gameTitle: String(gameTitle),
          genre,
          question: String(question),
          timestampedTips: Array.isArray(timestampedTips) ? timestampedTips : [],
          currentTimeSeconds: safeCurrentTime,
        });
        res.json({ reply, engine: 'framesense-ai-coach' });
      }
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to process coaching question.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FrameSense AI server running on http://localhost:${PORT}`);
  });
}

startServer();
