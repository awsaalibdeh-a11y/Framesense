import React, { useState, useMemo } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import {
  GAMES_CATALOG,
  GameGenre,
  GameProfile,
  SupportedPlatform,
  filterGamesCatalog,
} from '../utils/gameplayEngine';

interface GameCatalogViewProps {
  selectedGameId: string;
  onSelectGameForAnalysis: (game: GameProfile) => void;
}

const GENRE_OPTIONS: Array<GameGenre | 'All'> = [
  'All',
  'Tactical Shooter',
  'MOBA',
  'Fighting',
  'Soulslike & Action RPG',
  'Battle Royale & Survival',
  'Sports & Racing',
  'RTS & Strategy',
  'Hero & Action Multiplayer',
];

const PLATFORM_OPTIONS: Array<SupportedPlatform | 'All'> = [
  'All',
  'Desktop',
  'Android',
  'iOS',
  'Console',
];

export const GameCatalogView: React.FC<GameCatalogViewProps> = ({
  selectedGameId,
  onSelectGameForAnalysis,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<GameGenre | 'All'>('All');
  const [selectedPlatform, setSelectedPlatform] = useState<SupportedPlatform | 'All'>('All');

  const filteredGames = useMemo(
    () =>
      filterGamesCatalog(GAMES_CATALOG, {
        query: searchQuery,
        genre: selectedGenre,
        platform: selectedPlatform,
      }),
    [searchQuery, selectedGenre, selectedPlatform]
  );

  return (
    <section className="space-y-6" aria-labelledby="catalog-heading">
      {/* Header & Search Controls */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-sky-600 font-semibold">
              {GAMES_CATALOG.length} Supported Titles · 8 Competitive Genres · Made by Legion
            </p>
            <h1 id="catalog-heading" className="text-2xl font-bold text-slate-900 tracking-tight">
              Supported Game Telemetry Library
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Select any game below to load its specialized AI coaching rubric, mechanical metrics, and frame-by-frame clip analyzer across Desktop, Android, and iOS.
            </p>
          </div>

          <div className="w-full lg:w-80">
            <label htmlFor="game-library-search" className="sr-only">
              Search 128+ games or mechanics
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="game-library-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search game or mechanic (e.g. Parry, Valorant)..."
                className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Interactive Platform & Genre Filter Bars */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by genre">
            {GENRE_OPTIONS.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(genre)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedGenre === genre
                    ? 'bg-sky-600 text-white font-semibold shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 shrink-0" role="group" aria-label="Filter by platform">
            {PLATFORM_OPTIONS.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => setSelectedPlatform(platform)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  selectedPlatform === platform
                    ? 'bg-white text-slate-900 font-semibold shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Count & Reset */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-500 font-mono tabular-nums">
          Showing {filteredGames.length} of {GAMES_CATALOG.length} games
        </p>
        {(searchQuery || selectedGenre !== 'All' || selectedPlatform !== 'All') && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedGenre('All');
              setSelectedPlatform('All');
            }}
            className="text-xs text-sky-600 hover:text-sky-700 font-semibold whitespace-nowrap shrink-0"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Game Grid */}
      {filteredGames.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-12 text-center space-y-3">
          <p className="text-base font-semibold text-slate-900">
            No games matched &ldquo;{searchQuery}&rdquo;
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try clearing your genre or platform filter, or search by mechanic such as &ldquo;Crosshair&rdquo;, &ldquo;Parry&rdquo;, &ldquo;Wave&rdquo;, or &ldquo;Trail Braking&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedGenre('All');
              setSelectedPlatform('All');
            }}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 transition-colors"
          >
            Show All {GAMES_CATALOG.length} Games
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGames.map((game) => {
            const isActive = game.id === selectedGameId;
            return (
              <article
                key={game.id}
                className={`rounded-2xl p-5 ring-1 transition-all flex flex-col justify-between gap-4 shadow-xs ${
                  isActive
                    ? 'bg-sky-50/40 ring-sky-500'
                    : 'bg-white ring-slate-200 hover:ring-slate-300'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="text-sky-600 font-semibold">{game.genre}</span>
                    <span aria-hidden="true">·</span>
                    <span>{game.platforms.join(' / ')}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{game.releaseYear}</span>
                  </div>

                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    {game.title}
                  </h2>

                  <div className="space-y-1 pt-1">
                    <p className="text-xs text-slate-500">Tracked Coaching Mechanics:</p>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {game.keyMechanics.join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 truncate">
                    Drill: {game.coachRubric.signatureDrill}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectGameForAnalysis(game)}
                    aria-label={`Analyze ${game.title} gameplay clip`}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-800 hover:bg-sky-600 hover:text-white'
                    }`}
                  >
                    <span>{isActive ? 'Selected' : 'Load Coach'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
