import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BALL_SKINS,
  TRACKS,
  loadPlayerProgress,
  recordTrackRun,
  savePlayerProgress,
  type PlayerProgress,
  type TrackConfig,
} from './game/tracks';
import { computeStars } from './game/beatEngine';
import { audioEngine } from './game/audioSynth';
import {
  BeatCanvas,
  type GameState,
  type HudSnapshot,
  type RunResult,
} from './components/BeatCanvas';
import { TitleOverlay } from './components/TitleOverlay';
import { GameHud } from './components/GameHud';
import { GameOverModal, PauseModal } from './components/StatusModals';

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  combo: 0,
  multiplier: 1,
  gems: 0,
  progress: 0,
  judgment: null,
  judgmentSeq: 0,
};

export default function App() {
  const autostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [progress, setProgress] = useState<PlayerProgress>(() => loadPlayerProgress());
  const [customTrack, setCustomTrack] = useState<{
    config: TrackConfig;
    buffer: AudioBuffer;
  } | null>(null);
  const [customAudioError, setCustomAudioError] = useState<string | null>(null);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);

  const [gameState, setGameState] = useState<GameState>(autostart ? 'playing' : 'title');
  const [runKey, setRunKey] = useState(1);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [showSteerHint, setShowSteerHint] = useState(true);
  const hintTimerRef = useRef<number | null>(null);

  const allTracks = useMemo(() => {
    return customTrack ? [customTrack.config, ...TRACKS] : TRACKS;
  }, [customTrack]);

  const activeTrack = useMemo(() => {
    return allTracks.find((t) => t.id === progress.selectedTrackId) ?? allTracks[0];
  }, [allTracks, progress.selectedTrackId]);

  const activeSkin = useMemo(() => {
    return BALL_SKINS.find((s) => s.id === progress.selectedSkinId) ?? BALL_SKINS[0];
  }, [progress.selectedSkinId]);

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    audioEngine.setMuted(progress.muted);
  }, [progress.muted]);

  const startRun = useCallback(() => {
    audioEngine.unlock();
    setRunResult(null);
    setHud(INITIAL_HUD);
    setShowSteerHint(true);
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => {
      setShowSteerHint(false);
    }, 3200);

    const bufferToPlay =
      customTrack && customTrack.config.id === activeTrack.id
        ? customTrack.buffer
        : null;
    audioEngine.startTrack(activeTrack, bufferToPlay, 0);

    setRunKey((k) => k + 1);
    setGameState('playing');
  }, [activeTrack, customTrack]);

  const handlePause = useCallback(() => {
    if (gameState !== 'playing') return;
    audioEngine.pause();
    setGameState('paused');
  }, [gameState]);

  const handleResume = useCallback(() => {
    if (gameState !== 'paused') return;
    audioEngine.resume();
    setGameState('playing');
  }, [gameState]);

  const handleExitToTitle = useCallback(() => {
    audioEngine.stop();
    setGameState('title');
  }, []);

  const handleToggleMute = useCallback(() => {
    setProgress((prev) => {
      const next = { ...prev, muted: !prev.muted };
      savePlayerProgress(next);
      return next;
    });
  }, []);

  const handleSelectTrack = useCallback((trackId: string) => {
    setProgress((prev) => {
      const next = { ...prev, selectedTrackId: trackId };
      savePlayerProgress(next);
      return next;
    });
  }, []);

  const handleSelectSkin = useCallback((skinId: string) => {
    setProgress((prev) => {
      const next = { ...prev, selectedSkinId: skinId };
      savePlayerProgress(next);
      return next;
    });
  }, []);

  const handleUploadAudio = useCallback(async (file: File) => {
    setCustomAudioError(null);
    setIsDecodingAudio(true);
    try {
      const { buffer, estimatedBpm, totalBeats } =
        await audioEngine.decodeCustomAudioFile(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 28) || 'Custom Track';
      const trackId = `custom-${Date.now()}`;
      const config: TrackConfig = {
        ...TRACKS[1],
        id: trackId,
        title: cleanName,
        artist: 'Your Audio',
        genre: 'Custom',
        bpm: estimatedBpm,
        totalBeats,
        difficulty: 'Custom',
        isCustom: true,
      };
      setCustomTrack({ config, buffer });
      setProgress((prev) => {
        const next = { ...prev, selectedTrackId: trackId };
        savePlayerProgress(next);
        return next;
      });
    } catch {
      setCustomAudioError('Could not decode this audio file. Try an MP3, WAV, or OGG.');
    } finally {
      setIsDecodingAudio(false);
    }
  }, []);

  const handleGameOver = useCallback(
    (result: RunResult) => {
      setRunResult(result);
      setGameState('gameover');
      const stars = computeStars(result.progress);
      setProgress((prev) =>
        recordTrackRun(
          prev,
          activeTrack.id,
          result.score,
          stars,
          result.progress,
          result.gems
        )
      );
    },
    [activeTrack.id]
  );

  const handleFirstInput = useCallback(() => {
    setShowSteerHint(false);
  }, []);

  // Global keyboard shortcuts (Enter/Space start, P/Esc pause, M mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
        return;
      }
      if (gameState === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startRun();
        return;
      }
      if (gameState === 'playing' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePause();
        return;
      }
      if (gameState === 'paused' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handleResume();
        return;
      }
      if (gameState === 'gameover' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, handlePause, handleResume, handleToggleMute, startRun]);

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-[#070913]">
      <BeatCanvas
        gameState={gameState}
        runKey={runKey}
        track={activeTrack}
        skin={activeSkin}
        onHudUpdate={setHud}
        onGameOver={handleGameOver}
        onFirstInput={handleFirstInput}
      />

      {gameState === 'title' && (
        <TitleOverlay
          tracks={allTracks}
          skins={BALL_SKINS}
          selectedTrackId={activeTrack.id}
          selectedSkinId={activeSkin.id}
          progress={progress}
          customAudioError={customAudioError}
          isDecodingAudio={isDecodingAudio}
          onSelectTrack={handleSelectTrack}
          onSelectSkin={handleSelectSkin}
          onToggleMute={handleToggleMute}
          onUploadAudio={handleUploadAudio}
          onStart={startRun}
        />
      )}

      {(gameState === 'playing' || gameState === 'paused') && (
        <GameHud
          hud={hud}
          muted={progress.muted}
          showSteerHint={showSteerHint}
          trackTitle={activeTrack.title}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
        />
      )}

      {gameState === 'paused' && (
        <PauseModal
          trackTitle={activeTrack.title}
          onResume={handleResume}
          onRestart={startRun}
          onExitToTitle={handleExitToTitle}
        />
      )}

      {gameState === 'gameover' && runResult && (
        <GameOverModal
          trackTitle={activeTrack.title}
          result={runResult}
          bestScore={progress.tracks[activeTrack.id]?.bestScore ?? 0}
          onRetry={startRun}
          onExitToTitle={handleExitToTitle}
        />
      )}
    </main>
  );
}
