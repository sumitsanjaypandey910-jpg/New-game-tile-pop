import { Play, RotateCcw, ListMusic, Star } from 'lucide-react';
import { computeStars } from '../game/beatEngine';
import type { RunResult } from './BeatCanvas';

interface PauseModalProps {
  trackTitle: string;
  onResume: () => void;
  onRestart: () => void;
  onExitToTitle: () => void;
}

export function PauseModal({
  trackTitle,
  onResume,
  onRestart,
  onExitToTitle,
}: PauseModalProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5, 8, 18, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/12 p-6 text-center shadow-2xl"
        style={{ backgroundColor: 'rgba(11, 16, 33, 0.96)' }}
      >
        <p className="text-xs font-medium text-slate-400 mb-1 truncate">{trackTitle}</p>
        <h2 id="pause-title" className="font-display text-2xl font-extrabold text-white mb-5">
          Paused
        </h2>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[48px] rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-slate-950" aria-hidden="true" />
            <span>Resume</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[48px] rounded-xl border border-white/12 bg-white/[0.05] hover:bg-white/[0.1] text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Restart Track</span>
          </button>

          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full min-h-[48px] rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.04] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ListMusic className="w-4 h-4" aria-hidden="true" />
            <span>Song Select</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface GameOverModalProps {
  trackTitle: string;
  result: RunResult;
  bestScore: number;
  onRetry: () => void;
  onExitToTitle: () => void;
}

export function GameOverModal({
  trackTitle,
  result,
  bestScore,
  onRetry,
  onExitToTitle,
}: GameOverModalProps) {
  const stars = computeStars(result.progress);
  const progressPct = Math.round(result.progress * 100);
  const displayBest = Math.max(bestScore, result.score);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5, 8, 18, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/12 p-6 text-center shadow-2xl"
        style={{ backgroundColor: 'rgba(11, 16, 33, 0.96)' }}
      >
        <p className="text-xs font-medium text-slate-400 mb-1 truncate">{trackTitle}</p>
        <h2
          id="gameover-title"
          className={`font-display text-2xl font-extrabold mb-3 ${
            result.victory ? 'text-cyan-300' : 'text-white'
          }`}
        >
          {result.victory ? 'Track Clear!' : 'Off Beat'}
        </h2>

        {/* Earned Stars */}
        <div
          className="flex items-center justify-center gap-2 mb-5"
          aria-label={`Earned ${stars} out of 3 stars`}
        >
          {[1, 2, 3].map((s) => (
            <Star
              key={s}
              className={`w-7 h-7 ${
                s <= stars
                  ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                  : 'text-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Stat Tiles */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Score</div>
            <div className="font-mono-num text-xl font-bold text-white mt-0.5">
              {result.score}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Best</div>
            <div className="font-mono-num text-xl font-bold text-cyan-300 mt-0.5">
              {displayBest}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Max Combo</div>
            <div className="font-mono-num text-lg font-bold text-slate-100 mt-0.5">
              {result.maxCombo}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Progress</div>
            <div className="font-mono-num text-lg font-bold text-slate-100 mt-0.5">
              {progressPct}%
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onRetry}
            className="w-full min-h-[50px] rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-extrabold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>{result.victory ? 'Play Again' : 'Try Again'}</span>
          </button>

          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full min-h-[48px] rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.04] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ListMusic className="w-4 h-4" aria-hidden="true" />
            <span>Song Select</span>
          </button>
        </div>
      </div>
    </div>
  );
}
