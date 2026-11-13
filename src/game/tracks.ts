export type Difficulty = 'Easy' | 'Normal' | 'Hard' | 'Extreme' | 'Custom';

export interface ThemePalette {
  skyHex: string;
  fogHex: string;
  primaryHex: string;
  secondaryHex: string;
  railHex: string;
}

export interface SynthPattern {
  rootMidi: number;
  scaleIntervals: number[];
  chordRoots: number[];
  bassPattern: number[];
  leadPattern: number[];
  kickSteps: number[];
  snareSteps: number[];
  hatSteps: number[];
}

export interface TrackConfig {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  totalBeats: number;
  difficulty: Difficulty;
  palettes: ThemePalette[];
  synth: SynthPattern;
  movingTileStartRatio: number;
  maxLateralStep: number;
  isCustom?: boolean;
}

export interface BallSkin {
  id: string;
  name: string;
  coreHex: string;
  ringHex: string;
  trailHex: string;
}

export interface TrackSaveData {
  bestScore: number;
  bestStars: number;
  bestProgress: number;
}

export interface PlayerProgress {
  gems: number;
  selectedTrackId: string;
  selectedSkinId: string;
  muted: boolean;
  tracks: Record<string, TrackSaveData>;
}

export const BALL_SKINS: BallSkin[] = [
  {
    id: 'plasma',
    name: 'Plasma Core',
    coreHex: '#22d3ee',
    ringHex: '#f8fafc',
    trailHex: '#38bdf8',
  },
  {
    id: 'prism',
    name: 'Neon Rose',
    coreHex: '#fb7185',
    ringHex: '#fde047',
    trailHex: '#f43f5e',
  },
  {
    id: 'solar',
    name: 'Solar Flare',
    coreHex: '#f59e0b',
    ringHex: '#fef08a',
    trailHex: '#fb923c',
  },
];

export const TRACKS: TrackConfig[] = [
  {
    id: 'neon-pulse',
    title: 'Neon Pulse',
    artist: 'Studio Synth',
    genre: 'Synthwave',
    bpm: 112,
    totalBeats: 64,
    difficulty: 'Easy',
    movingTileStartRatio: 0.65,
    maxLateralStep: 1.55,
    palettes: [
      {
        skyHex: '#070b1a',
        fogHex: '#0a1026',
        primaryHex: '#22d3ee',
        secondaryHex: '#818cf8',
        railHex: '#1e293b',
      },
      {
        skyHex: '#0b081c',
        fogHex: '#120d2e',
        primaryHex: '#38bdf8',
        secondaryHex: '#f472b6',
        railHex: '#272042',
      },
    ],
    synth: {
      rootMidi: 45, // A2
      scaleIntervals: [0, 3, 5, 7, 10, 12, 15, 17],
      chordRoots: [0, 5, 3, 7],
      bassPattern: [0, 0, 12, 0, 0, 0, 7, 10],
      leadPattern: [12, -1, 15, 17, 19, -1, 17, 15, 12, -1, 10, 12, 15, -1, 14, 10],
      kickSteps: [1, 0, 0, 0, 1, 0, 0, 0],
      snareSteps: [0, 0, 0, 0, 1, 0, 0, 0],
      hatSteps: [0, 0, 1, 0, 0, 0, 1, 1],
    },
  },
  {
    id: 'cyber-drift',
    title: 'Cyber Drift',
    artist: 'Kinetix',
    genre: 'Future Bass',
    bpm: 124,
    totalBeats: 80,
    difficulty: 'Normal',
    movingTileStartRatio: 0.42,
    maxLateralStep: 1.85,
    palettes: [
      {
        skyHex: '#0c081a',
        fogHex: '#160d2e',
        primaryHex: '#f43f5e',
        secondaryHex: '#a855f7',
        railHex: '#2a183b',
      },
      {
        skyHex: '#07121c',
        fogHex: '#0b1e2e',
        primaryHex: '#2dd4bf',
        secondaryHex: '#f472b6',
        railHex: '#163042',
      },
    ],
    synth: {
      rootMidi: 43, // G2
      scaleIntervals: [0, 2, 3, 7, 8, 12, 14, 15],
      chordRoots: [0, 8, 3, 7],
      bassPattern: [0, 12, 0, 7, 0, 12, 10, 7],
      leadPattern: [15, 14, 12, -1, 15, 19, 17, -1, 14, 12, 10, 12, 15, -1, 19, 22],
      kickSteps: [1, 0, 0, 1, 0, 0, 1, 0],
      snareSteps: [0, 0, 0, 0, 1, 0, 0, 0],
      hatSteps: [1, 0, 1, 1, 1, 0, 1, 1],
    },
  },
  {
    id: 'hypernova-drop',
    title: 'Hypernova Drop',
    artist: 'Vortex Audio',
    genre: 'Electro House',
    bpm: 136,
    totalBeats: 96,
    difficulty: 'Hard',
    movingTileStartRatio: 0.3,
    maxLateralStep: 2.15,
    palettes: [
      {
        skyHex: '#110a08',
        fogHex: '#1c100c',
        primaryHex: '#f59e0b',
        secondaryHex: '#ec4899',
        railHex: '#331d16',
      },
      {
        skyHex: '#060c1a',
        fogHex: '#09142b',
        primaryHex: '#06b6d4',
        secondaryHex: '#f59e0b',
        railHex: '#152540',
      },
    ],
    synth: {
      rootMidi: 41, // F2
      scaleIntervals: [0, 3, 5, 6, 7, 10, 12, 15],
      chordRoots: [0, 3, 8, 7],
      bassPattern: [0, 0, 12, 7, 0, 12, 0, 10],
      leadPattern: [12, 15, 19, 15, 18, 15, 17, 12, 15, 19, 22, 19, 24, 22, 19, 15],
      kickSteps: [1, 0, 1, 0, 1, 0, 1, 0],
      snareSteps: [0, 0, 1, 0, 0, 0, 1, 0],
      hatSteps: [1, 1, 1, 1, 1, 1, 1, 1],
    },
  },
  {
    id: 'starlight-surge',
    title: 'Starlight Surge',
    artist: 'AeroBeat',
    genre: 'Hyperdrive',
    bpm: 148,
    totalBeats: 112,
    difficulty: 'Extreme',
    movingTileStartRatio: 0.22,
    maxLateralStep: 2.4,
    palettes: [
      {
        skyHex: '#051412',
        fogHex: '#08211d',
        primaryHex: '#10b981',
        secondaryHex: '#facc15',
        railHex: '#10362f',
      },
      {
        skyHex: '#12071a',
        fogHex: '#1f0b2e',
        primaryHex: '#e879f9',
        secondaryHex: '#22d3ee',
        railHex: '#331547',
      },
    ],
    synth: {
      rootMidi: 48, // C3
      scaleIntervals: [0, 2, 3, 7, 10, 12, 14, 15],
      chordRoots: [0, 10, 8, 7],
      bassPattern: [0, 12, 0, 12, 7, 12, 10, 12],
      leadPattern: [12, 14, 15, 19, 22, 19, 15, 14, 12, 15, 19, 24, 22, 19, 17, 15],
      kickSteps: [1, 0, 0, 1, 1, 0, 0, 1],
      snareSteps: [0, 0, 1, 0, 0, 1, 1, 0],
      hatSteps: [1, 1, 1, 1, 1, 1, 1, 1],
    },
  },
];

const STORAGE_KEY = 'pulsehop_progress_v1';

const DEFAULT_PROGRESS: PlayerProgress = {
  gems: 0,
  selectedTrackId: TRACKS[0].id,
  selectedSkinId: BALL_SKINS[0].id,
  muted: false,
  tracks: {},
};

export function loadPlayerProgress(): PlayerProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS, tracks: {} };
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      gems: typeof parsed.gems === 'number' ? parsed.gems : 0,
      selectedTrackId:
        typeof parsed.selectedTrackId === 'string'
          ? parsed.selectedTrackId
          : DEFAULT_PROGRESS.selectedTrackId,
      selectedSkinId:
        typeof parsed.selectedSkinId === 'string'
          ? parsed.selectedSkinId
          : DEFAULT_PROGRESS.selectedSkinId,
      muted: Boolean(parsed.muted),
      tracks: parsed.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {},
    };
  } catch {
    return { ...DEFAULT_PROGRESS, tracks: {} };
  }
}

export function savePlayerProgress(progress: PlayerProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors in private mode
  }
}

export function recordTrackRun(
  prev: PlayerProgress,
  trackId: string,
  score: number,
  stars: number,
  progressRatio: number,
  gemsCollected: number
): PlayerProgress {
  const existing = prev.tracks[trackId] ?? {
    bestScore: 0,
    bestStars: 0,
    bestProgress: 0,
  };
  const next: PlayerProgress = {
    ...prev,
    gems: prev.gems + gemsCollected,
    tracks: {
      ...prev.tracks,
      [trackId]: {
        bestScore: Math.max(existing.bestScore, score),
        bestStars: Math.max(existing.bestStars, stars),
        bestProgress: Math.max(existing.bestProgress, progressRatio),
      },
    },
  };
  savePlayerProgress(next);
  return next;
}
