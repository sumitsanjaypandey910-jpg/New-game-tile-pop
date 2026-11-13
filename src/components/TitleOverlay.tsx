import { useRef, type ChangeEvent } from 'react';
import { Volume2, VolumeX, Upload, Play, Star, Diamond } from 'lucide-react';
import type { BallSkin, PlayerProgress, TrackConfig } from '../game/tracks';

interface TitleOverlayProps {
  tracks: TrackConfig[];
  skins: BallSkin[];
  selectedTrackId: string;
  selectedSkinId: string;
  progress: PlayerProgress;
  customAudioError: string | null;
  isDecodingAudio: boolean;
  onSelectTrack: (trackId: string) => void;
  onSelectSkin: (skinId: string) => void;
  onToggleMute: () => void;
  onUploadAudio: (file: File) => void;
  onStart: () => void;
}

export function TitleOverlay({
  tracks,
  skins,
  selectedTrackId,
  selectedSkinId,
  progress,
  customAudioError,
  isDecodingAudio,
  onSelectTrack,
  onSelectSkin,
  onToggleMute,
  onUploadAudio,
  onStart,
}: TitleOverlayProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadAudio(file);
    }
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6 pointer-events-none">
      {/* Top Bar: Total Gems & Audio Toggle */}
      <div className="flex items-center justify-between gap-4 max-w-2xl w-full mx-auto">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 pointer-events-auto"
          style={{ backgroundColor: 'rgba(9, 13, 28, 0.86)' }}
        >
          <Diamond className="w-4 h-4 text-amber-400 fill-amber-400/30" aria-hidden="true" />
          <span className="font-mono-num text-sm font-bold text-slate-100">
            {progress.gems}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={progress.muted ? 'Unmute audio' : 'Mute audio'}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 text-slate-200 hover:text-white hover:border-white/25 transition-colors pointer-events-auto cursor-pointer"
          style={{ backgroundColor: 'rgba(9, 13, 28, 0.86)' }}
        >
          {progress.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Center Header: Custom SVG Title Lockup positioned in calm upper sky negative space */}
      <div className="flex flex-col items-center text-center mt-2 sm:mt-4 mb-auto pt-1">
        <div className="mb-1">
          <svg
            viewBox="0 0 320 74"
            className="w-[240px] sm:w-[300px] h-auto drop-shadow-[0_4px_18px_rgba(34,211,238,0.35)]"
            role="img"
            aria-label="PulseHop"
          >
            <defs>
              <linearGradient id="pulsehop-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="55%" stopColor="#e2e8f0" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            {/* Stylized hopping orb arc emblem */}
            <path
              d="M20 52 Q38 14 56 52"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="4 5"
            />
            <circle cx="38" cy="22" r="9" fill="#22d3ee" stroke="#f8fafc" strokeWidth="2.5" />
            <rect x="14" y="54" width="24" height="6" rx="3" fill="#38bdf8" />
            <rect x="44" y="54" width="24" height="6" rx="3" fill="#f472b6" />
            <text
              x="82"
              y="50"
              fill="url(#pulsehop-grad)"
              fontFamily="Outfit, sans-serif"
              fontWeight="800"
              fontSize="42"
              letterSpacing="-1.2"
            >
              PulseHop
            </text>
          </svg>
        </div>
        <p className="text-xs sm:text-sm text-slate-300/90 max-w-xs">
          Drag across the beat highway to bounce on every tile.
        </p>
      </div>

      {/* Bottom Ergonomic Thumb Zone: Track Picker, Skins & Start CTA */}
      <div
        className="w-full max-w-lg mx-auto rounded-2xl border border-white/12 p-3.5 sm:p-4 pointer-events-auto shadow-2xl"
        style={{ backgroundColor: 'rgba(9, 13, 28, 0.90)' }}
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h2 className="font-display text-sm font-bold text-slate-100">
            Select Track
          </h2>
          <button
            type="button"
            disabled={isDecodingAudio}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isDecodingAudio ? 'Loading...' : 'Custom MP3'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload custom audio track"
          />
        </div>

        {customAudioError && (
          <p className="text-xs text-rose-400 mb-2" role="alert">
            {customAudioError}
          </p>
        )}

        {/* Track List */}
        <div className="space-y-1.5 max-h-[172px] sm:max-h-[208px] overflow-y-auto track-scroll pr-1 mb-3">
          {tracks.map((t) => {
            const isSelected = t.id === selectedTrackId;
            const save = progress.tracks[t.id];
            const bestStars = save?.bestStars ?? 0;
            const bestScore = save?.bestScore ?? 0;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTrack(t.id)}
                className={`w-full min-h-[52px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-cyan-400/70 bg-cyan-500/12 text-white'
                    : 'border-white/8 bg-white/[0.03] text-slate-200 hover:border-white/20'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.palettes[0].primaryHex }}
                      aria-hidden="true"
                    />
                    <span className="font-display font-bold text-sm truncate">
                      {t.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                    <span>{t.genre}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">{t.bpm} BPM</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.difficulty}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-0.5" aria-label={`${bestStars} of 3 stars`}>
                    {[1, 2, 3].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= bestStars
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-mono-num text-[11px] text-slate-400 mt-0.5">
                    {bestScore > 0 ? `Best ${bestScore}` : 'New'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Orb Skin Selector */}
        <div className="mb-3 pt-2 border-t border-white/8">
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Orb style">
            {skins.map((s) => {
              const active = s.id === selectedSkinId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSkin(s.id)}
                  className={`min-h-[38px] px-2 py-1 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                    active
                      ? 'border-cyan-400/60 bg-white/12 text-white'
                      : 'border-white/8 bg-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.coreHex }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Play CTA */}
        <button
          type="button"
          data-start="true"
          onClick={(e) => {
            e.currentTarget.blur();
            onStart();
          }}
          className="w-full min-h-[50px] rounded-xl bg-cyan-400 hover:bg-cyan-300 active:scale-[0.99] text-slate-950 font-display font-extrabold text-base flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
        >
          <Play className="w-5 h-5 fill-slate-950" aria-hidden="true" />
          <span>Play Now</span>
        </button>

        <p className="text-center text-[11px] text-slate-400 mt-2">
          Drag to steer · A / D or ← / → · P Pause
        </p>
      </div>
    </div>
  );
}
