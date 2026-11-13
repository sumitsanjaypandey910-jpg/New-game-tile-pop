import { Diamond, Pause, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot } from './BeatCanvas';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  showSteerHint: boolean;
  trackTitle: string;
  onToggleMute: () => void;
  onPause: () => void;
}

export function GameHud({
  hud,
  muted,
  showSteerHint,
  trackTitle,
  onToggleMute,
  onPause,
}: GameHudProps) {
  const pct = Math.round(hud.progress * 100);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Perimeter Cluster */}
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          {/* Top-Left: Gems */}
          <div
            className="min-h-[44px] px-3 rounded-xl border border-white/10 flex items-center gap-1.5"
            style={{ backgroundColor: 'rgba(9, 13, 28, 0.78)' }}
          >
            <Diamond className="w-4 h-4 text-amber-400 fill-amber-400/30" aria-hidden="true" />
            <span className="font-mono-num text-sm font-bold text-slate-100">
              {hud.gems}
            </span>
          </div>

          {/* Top-Center: Progress Bar & Score */}
          <div className="flex-1 max-w-[260px] flex flex-col items-center pt-1">
            <div className="w-full flex items-center justify-between text-[11px] text-slate-300 mb-1 px-0.5">
              <span className="truncate max-w-[160px] font-medium">{trackTitle}</span>
              <span className="font-mono-num font-bold text-cyan-300">{pct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-transform duration-150 origin-left"
                style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, hud.progress))})` }}
              />
            </div>

            <div className="mt-2.5 flex flex-col items-center">
              <div
                className="font-mono-num text-4xl sm:text-5xl font-bold text-white leading-none tracking-tight"
                style={{ textShadow: '0 2px 14px rgba(0, 0, 0, 0.75)' }}
                aria-label={`Score ${hud.score}`}
              >
                {hud.score}
              </div>

              {hud.combo > 1 && (
                <div className="mt-1 flex items-center gap-2 text-xs font-bold tracking-wide">
                  <span className="font-mono-num text-cyan-300">
                    {hud.combo} COMBO
                  </span>
                  {hud.multiplier > 1 && (
                    <span className="font-mono-num text-amber-300">
                      x{hud.multiplier}
                    </span>
                  )}
                </div>
              )}

              {hud.judgment && (
                <div
                  key={hud.judgmentSeq}
                  className={`mt-1 font-display text-xs font-extrabold uppercase tracking-widest ${
                    hud.judgment === 'perfect' ? 'text-cyan-300' : 'text-slate-200'
                  }`}
                  style={{ textShadow: '0 1px 8px rgba(0, 0, 0, 0.8)' }}
                >
                  {hud.judgment === 'perfect' ? 'Perfect!' : 'Good'}
                </div>
              )}
            </div>
          </div>

          {/* Top-Right: Mute & Pause Square Touch Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="w-11 h-11 rounded-xl border border-white/12 flex items-center justify-center text-slate-200 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(9, 13, 28, 0.78)' }}
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              aria-label="Pause game"
              className="w-11 h-11 rounded-xl border border-white/12 flex items-center justify-center text-slate-200 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(9, 13, 28, 0.78)' }}
            >
              <Pause className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Safe Margin: Auto-hiding Steering Cue */}
      <div className="flex justify-center pb-4">
        <div
          className={`px-4 py-2 rounded-xl text-xs font-medium text-slate-200 border border-white/10 transition-opacity duration-500 ${
            showSteerHint ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundColor: 'rgba(9, 13, 28, 0.76)' }}
        >
          Slide left or right anywhere to steer
        </div>
      </div>
    </div>
  );
}
