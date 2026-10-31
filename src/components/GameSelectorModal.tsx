import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Check, Gamepad2, ArrowRight } from 'lucide-react';
import {
  GAMES_CATALOG,
  GameGenre,
  GameProfile,
  filterGamesCatalog,
} from '../utils/gameplayEngine';

interface GameSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGameId: string;
  onSelectGame: (game: GameProfile) => void;
}

const GENRE_CHIPS: Array<GameGenre | 'All'> = [
  'All',
  'Tactical Shooter',
  'Battle Royale & Survival',
  'MOBA',
  'Fighting',
  'Soulslike & Action RPG',
  'Sports & Racing',
  'RTS & Strategy',
  'Hero & Action Multiplayer',
];

export const GameSelectorModal: React.FC<GameSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedGameId,
  onSelectGame,
}) => {
  const [search, setSearch] = useState('');
  const [activeGenre, setActiveGenre] = useState<GameGenre | 'All'>('All');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setSearch('');
      setActiveGenre('All');
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    return filterGamesCatalog(GAMES_CATALOG, {
      query: search,
      genre: activeGenre,
    });
  }, [search, activeGenre]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-selector-title"
    >
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-white ring-1 ring-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="game-selector-title" className="text-base font-bold text-slate-900">
                Select Gameplay Title ({GAMES_CATALOG.length} Supported)
              </h2>
              <p className="text-xs text-slate-500">
                Pick your game to sync AI HUD recognition, crosshair analysis, and micro-drills.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close game selector"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Genre Chips */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search game name (e.g. Valorant, Apex, CS2, Fortnite, Elden Ring, COD)..."
              className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {GENRE_CHIPS.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => setActiveGenre(genre)}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeGenre === genre
                    ? 'bg-sky-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800">No games found matching &ldquo;{search}&rdquo;</p>
              <p className="text-xs text-slate-500">Try searching by genre or shorthand alias (e.g., &ldquo;val&rdquo;, &ldquo;apex&rdquo;, &ldquo;er&rdquo;).</p>
            </div>
          ) : (
            filtered.map((game) => {
              const isSelected = game.id === selectedGameId;
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => {
                    onSelectGame(game);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-sky-50/90 ring-1 ring-sky-400 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{game.title}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {game.genre}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {game.keyMechanics.join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-sky-600 bg-sky-100 px-2.5 py-1 rounded-lg">
                        <Check className="w-3.5 h-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-900">
                        Select <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>Showing {filtered.length} of {GAMES_CATALOG.length} games</span>
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
