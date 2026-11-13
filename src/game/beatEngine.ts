import type { TrackConfig } from './tracks';

export const CORRIDOR_HALF_WIDTH = 3.2;
export const TILE_BASE_WIDTH = 2.1;
export const TILE_DEPTH = 1.75;
export const Z_STEP_PER_BEAT = 6.4;
export const HOP_PEAK_HEIGHT = 2.15;
export const BALL_RADIUS = 0.42;
export const BALL_HIT_MARGIN = 0.34;
export const PERFECT_OFFSET_RATIO = 0.25;

export interface BeatTile {
  index: number;
  beatTime: number;
  z: number;
  baseX: number;
  width: number;
  depth: number;
  isMoving: boolean;
  moveAmp: number;
  moveFreq: number;
  movePhase: number;
  hasGem: boolean;
  gemOffsetX: number;
  isFeverStart: boolean;
  hitState: 'pending' | 'perfect' | 'good' | 'missed';
  gemCollected: boolean;
}

export interface BallPose {
  y: number;
  z: number;
  beatIndex: number;
  beatPhase: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export type LandingJudgment = 'perfect' | 'good' | 'miss';

export interface LandingResult {
  judgment: LandingJudgment;
  pointsAwarded: number;
  nextCombo: number;
  nextPerfectStreak: number;
  multiplier: number;
  gemCollected: boolean;
}

/** Deterministic PRNG (Mulberry32) so every track has a repeatable fair map. */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getBeatDuration(bpm: number): number {
  return 60 / Math.max(60, Math.min(220, bpm));
}

export function clampBallX(x: number): number {
  const limit = CORRIDOR_HALF_WIDTH - BALL_RADIUS * 0.5;
  return Math.max(-limit, Math.min(limit, x));
}

/**
 * Generates the full sequence of beat-synced tiles for a track.
 * Opening 4 tiles are centered and extra-wide so gameplay survives the first few seconds without input.
 */
export function generateTrackTiles(track: TrackConfig, seedOffset = 0): BeatTile[] {
  const rng = createSeededRng(hashString(track.id) + seedOffset);
  const beatDuration = getBeatDuration(track.bpm);
  const tiles: BeatTile[] = [];

  const safeMaxX = CORRIDOR_HALF_WIDTH - TILE_BASE_WIDTH * 0.52;
  let currentX = 0;
  let patternDir = rng() > 0.5 ? 1 : -1;

  for (let i = 0; i <= track.totalBeats; i++) {
    const progress = i / track.totalBeats;
    const isIntro = i <= 3;
    const isOutro = i === track.totalBeats;

    if (isIntro) {
      currentX = 0;
    } else if (isOutro) {
      currentX = 0;
    } else {
      // Phrased musical stepping: smooth waves mixed with rhythmic direction switches
      if (i % 4 === 0 || rng() < 0.25) {
        patternDir *= -1;
      }
      const stepMagnitude = (0.45 + rng() * 0.55) * track.maxLateralStep;
      let candidateX = currentX + patternDir * stepMagnitude;
      if (candidateX > safeMaxX || candidateX < -safeMaxX) {
        patternDir *= -1;
        candidateX = currentX + patternDir * stepMagnitude * 0.8;
      }
      currentX = Math.max(-safeMaxX, Math.min(safeMaxX, candidateX));
    }

    const isMoving =
      !isIntro &&
      !isOutro &&
      progress >= track.movingTileStartRatio &&
      i % 4 === 2 &&
      rng() < 0.65;

    const moveAmp = isMoving ? 0.65 + rng() * 0.45 : 0;
    const baseX = isMoving
      ? Math.max(-(safeMaxX - moveAmp), Math.min(safeMaxX - moveAmp, currentX))
      : currentX;

    const width = isIntro || isOutro ? TILE_BASE_WIDTH * 1.28 : TILE_BASE_WIDTH;
    const hasGem = !isIntro && !isOutro && i % 5 === 3;
    const gemOffsetX = hasGem ? (rng() > 0.5 ? 0.35 : -0.35) : 0;

    tiles.push({
      index: i,
      beatTime: i * beatDuration,
      z: -i * Z_STEP_PER_BEAT,
      baseX,
      width,
      depth: TILE_DEPTH,
      isMoving,
      moveAmp,
      moveFreq: 2.2 + (track.bpm / 120) * 0.8,
      movePhase: rng() * Math.PI * 2,
      hasGem,
      gemOffsetX,
      isFeverStart: i > 0 && i % 16 === 0,
      hitState: i === 0 ? 'perfect' : 'pending',
      gemCollected: false,
    });
  }

  return tiles;
}

export function getTileXAtTime(tile: BeatTile, songTime: number): number {
  if (!tile.isMoving || tile.moveAmp === 0) {
    return tile.baseX;
  }
  return tile.baseX + Math.sin(songTime * tile.moveFreq + tile.movePhase) * tile.moveAmp;
}

/**
 * Computes exact parabolic arc & squash-stretch for the ball at `songTime`.
 * At every integer beat k (songTime = k * beatDuration), y = 0 and z = -k * Z_STEP_PER_BEAT.
 */
export function computeBallPoseAtTime(songTime: number, bpm: number): BallPose {
  const beatDuration = getBeatDuration(bpm);
  const clampedTime = Math.max(0, songTime);
  const exactBeat = clampedTime / beatDuration;
  const beatIndex = Math.floor(exactBeat);
  const beatPhase = exactBeat - beatIndex; // 0..1

  // Parabolic hop: 0 at phase=0 and phase=1, peak HOP_PEAK_HEIGHT at phase=0.5
  const y = 4 * HOP_PEAK_HEIGHT * beatPhase * (1 - beatPhase);
  const z = -exactBeat * Z_STEP_PER_BEAT || 0;

  // Squash near landing/takeoff, stretch gently in mid-air ascent
  let scaleY = 1;
  let scaleXZ = 1;
  if (beatPhase < 0.14) {
    const t = 1 - beatPhase / 0.14;
    scaleY = 1 - 0.22 * t;
    scaleXZ = 1 + 0.14 * t;
  } else if (beatPhase > 0.88) {
    const t = (beatPhase - 0.88) / 0.12;
    scaleY = 1 - 0.12 * t;
    scaleXZ = 1 + 0.08 * t;
  } else if (beatPhase < 0.38) {
    const t = Math.sin(((beatPhase - 0.14) / 0.24) * Math.PI);
    scaleY = 1 + 0.1 * t;
    scaleXZ = 1 - 0.06 * t;
  }

  return {
    y,
    z,
    beatIndex,
    beatPhase,
    scaleX: scaleXZ,
    scaleY,
    scaleZ: scaleXZ,
  };
}

export function computeMultiplier(perfectStreak: number): number {
  if (perfectStreak >= 12) return 4;
  if (perfectStreak >= 6) return 3;
  if (perfectStreak >= 3) return 2;
  return 1;
}

/**
 * Evaluates landing on `tile` when the ball reaches its beat timestamp.
 */
export function evaluateTileLanding(
  ballX: number,
  tile: BeatTile,
  songTime: number,
  currentCombo: number,
  currentPerfectStreak: number
): LandingResult {
  const tileX = getTileXAtTime(tile, songTime);
  const offset = Math.abs(ballX - tileX);
  const maxHitRadius = tile.width * 0.5 + BALL_HIT_MARGIN;

  if (offset > maxHitRadius) {
    return {
      judgment: 'miss',
      pointsAwarded: 0,
      nextCombo: 0,
      nextPerfectStreak: 0,
      multiplier: 1,
      gemCollected: false,
    };
  }

  const isPerfect = offset <= tile.width * PERFECT_OFFSET_RATIO;
  const nextCombo = currentCombo + 1;
  const nextPerfectStreak = isPerfect ? currentPerfectStreak + 1 : 0;
  const multiplier = computeMultiplier(nextPerfectStreak);
  const basePoints = isPerfect ? 2 : 1;

  let gemCollected = false;
  if (tile.hasGem && !tile.gemCollected) {
    const gemX = tileX + tile.gemOffsetX;
    if (Math.abs(ballX - gemX) <= BALL_RADIUS + 0.65) {
      gemCollected = true;
    }
  }

  return {
    judgment: isPerfect ? 'perfect' : 'good',
    pointsAwarded: basePoints * multiplier + (gemCollected ? 5 : 0),
    nextCombo,
    nextPerfectStreak,
    multiplier,
    gemCollected,
  };
}

export function computeStars(progressRatio: number): number {
  if (progressRatio >= 0.99) return 3;
  if (progressRatio >= 0.66) return 2;
  if (progressRatio >= 0.33) return 1;
  return 0;
}
