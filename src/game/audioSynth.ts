import type { TrackConfig } from './tracks';
import { getBeatDuration } from './beatEngine';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class BeatAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private isPlaying = false;
  private currentTrack: TrackConfig | null = null;
  private customBuffer: AudioBuffer | null = null;
  private customSource: AudioBufferSourceNode | null = null;

  private startAudioTime = 0;
  private pausedSongTime = 0;
  private nextStepIndex = 0;
  private schedulerTimer: number | null = null;
  private lastKickTime = -10;

  public unlock(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.82;

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.72;

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.58;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      this.musicGain.connect(this.analyser);
      this.analyser.connect(compressor);
      this.sfxGain.connect(compressor);
      compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.82, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public startTrack(track: TrackConfig, customAudioBuffer?: AudioBuffer | null, offsetTime = 0): void {
    const ctx = this.unlock();
    this.stopMusicOnly();

    this.currentTrack = track;
    this.customBuffer = customAudioBuffer ?? null;
    this.pausedSongTime = offsetTime;
    this.isPlaying = true;

    if (!ctx) return;

    this.startAudioTime = ctx.currentTime - offsetTime;

    if (this.customBuffer && this.musicGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.customBuffer;
      src.connect(this.musicGain);
      src.start(0, Math.max(0, offsetTime));
      this.customSource = src;
    } else {
      const stepDur = getBeatDuration(track.bpm) / 2; // 8th-note grid
      this.nextStepIndex = Math.floor(offsetTime / stepDur);
      this.scheduleAhead();
      this.schedulerTimer = window.setInterval(() => this.scheduleAhead(), 25);
    }
  }

  public pause(): number {
    const currentSongTime = this.getSongTime();
    this.pausedSongTime = currentSongTime;
    this.stopMusicOnly();
    return currentSongTime;
  }

  public resume(): void {
    if (!this.currentTrack) return;
    this.startTrack(this.currentTrack, this.customBuffer, this.pausedSongTime);
  }

  public stop(): void {
    this.stopMusicOnly();
    this.pausedSongTime = 0;
  }

  private stopMusicOnly(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.customSource) {
      try {
        this.customSource.stop();
        this.customSource.disconnect();
      } catch {
        // already stopped
      }
      this.customSource = null;
    }
  }

  public getSongTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pausedSongTime;
    }
    return Math.max(0, this.ctx.currentTime - this.startAudioTime);
  }

  /** Returns normalized 0..1 audio beat energy for 3D equalizers & pulse rings. */
  public getBeatEnergy(): number {
    if (this.analyser && this.freqData && this.isPlaying) {
      this.analyser.getByteFrequencyData(this.freqData);
      let sum = 0;
      const bins = Math.min(12, this.freqData.length);
      for (let i = 0; i < bins; i++) {
        sum += this.freqData[i];
      }
      const fftEnergy = sum / (bins * 255);
      if (fftEnergy > 0.02) return Math.min(1, fftEnergy * 1.35);
    }
    if (this.ctx && this.isPlaying) {
      const elapsed = this.ctx.currentTime - this.lastKickTime;
      if (elapsed >= 0 && elapsed < 0.28) {
        return Math.max(0, 1 - elapsed / 0.28);
      }
    }
    return 0.12;
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.currentTrack || !this.isPlaying) return;
    const stepDur = getBeatDuration(this.currentTrack.bpm) / 2;
    const lookahead = 0.12;
    const now = this.ctx.currentTime;

    while (true) {
      const stepTime = this.startAudioTime + this.nextStepIndex * stepDur;
      if (stepTime > now + lookahead) break;
      if (stepTime >= now - 0.05) {
        this.triggerStep(this.currentTrack, this.nextStepIndex, Math.max(now, stepTime), stepDur);
      }
      this.nextStepIndex++;
    }
  }

  private triggerStep(track: TrackConfig, step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.musicGain) return;

    const beatIndex = Math.floor(step / 2);
    const barStep = step % 8;
    const leadStep = step % track.synth.leadPattern.length;
    const chordIdx = Math.floor(beatIndex / 4) % track.synth.chordRoots.length;
    const chordOffset = track.synth.chordRoots[chordIdx];

    const isIntro = beatIndex < 8;
    const isDrop = beatIndex >= 16 && (beatIndex < 32 || beatIndex >= 48);

    // Kick
    if (track.synth.kickSteps[barStep] === 1 && (!isIntro || barStep === 0)) {
      this.triggerKick(time);
      this.lastKickTime = time;
    }

    // Snare
    if (!isIntro && track.synth.snareSteps[barStep] === 1) {
      this.triggerSnare(time);
    }

    // Hi-Hat
    if (track.synth.hatSteps[barStep] === 1) {
      this.triggerHat(time, isDrop ? 0.16 : 0.09);
    }

    // Driving Bass
    const bassInterval = track.synth.bassPattern[barStep];
    if (bassInterval >= 0) {
      const midi = track.synth.rootMidi + chordOffset + bassInterval;
      this.triggerBass(midiToFreq(midi), time, stepDur * 0.85, isDrop ? 0.36 : 0.24);
    }

    // Lead Synth (enters after beat 4, octave-doubled on drops)
    if (beatIndex >= 4) {
      const leadInterval = track.synth.leadPattern[leadStep];
      if (leadInterval >= 0) {
        const midi = track.synth.rootMidi + 12 + chordOffset + leadInterval;
        this.triggerLead(midiToFreq(midi), time, stepDur * 1.15, isDrop ? 0.2 : 0.14);
        if (isDrop && step % 2 === 0) {
          this.triggerLead(midiToFreq(midi + 12), time, stepDur * 0.75, 0.08);
        }
      }
    }

    // Warm Pad on downbeat of each 4-beat bar
    if (step % 8 === 0) {
      const root = track.synth.rootMidi + 12 + chordOffset;
      this.triggerPad(midiToFreq(root), time, stepDur * 7.5, 0.08);
      this.triggerPad(midiToFreq(root + 7), time, stepDur * 7.5, 0.06);
    }
  }

  private triggerKick(time: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);

    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  private triggerSnare(time: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1900, time);
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.16);
  }

  private triggerHat(time: number, level: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  private triggerBass(freq: number, time: number, dur: number, level: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(980, time);
    filter.frequency.exponentialRampToValueAtTime(240, time + dur);
    filter.Q.value = 3.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerLead(freq: number, time: number, dur: number, level: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerPad(freq: number, time: number, dur: number, level: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  public playPerfect(multiplier: number): void {
    const ctx = this.unlock();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const baseFreq = 660 + Math.min(multiplier, 4) * 90 + (Math.random() - 0.5) * 28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.09);

    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playGood(): void {
    const ctx = this.unlock();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playGem(): void {
    const ctx = this.unlock();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.22, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.14);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.15);
    });
  }

  public playMiss(): void {
    const ctx = this.unlock();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.34);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playVictory(): void {
    const ctx = this.unlock();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);
      gain.gain.setValueAtTime(0.24, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.36);
    });
  }

  /** Decodes a user-selected audio file and estimates its BPM. */
  public async decodeCustomAudioFile(
    file: File
  ): Promise<{ buffer: AudioBuffer; estimatedBpm: number; totalBeats: number }> {
    const ctx = this.unlock();
    if (!ctx) {
      throw new Error('Web Audio API is unavailable in this browser.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const estimatedBpm = estimateBpmFromBuffer(buffer);
    const beatDur = 60 / estimatedBpm;
    const totalBeats = Math.max(24, Math.min(240, Math.floor(buffer.duration / beatDur) - 1));
    return { buffer, estimatedBpm, totalBeats };
  }
}

function estimateBpmFromBuffer(buffer: AudioBuffer): number {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const maxSamples = Math.min(channel.length, sampleRate * 30);
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms energy frames
  const frameCount = Math.floor(maxSamples / windowSize);
  if (frameCount < 40) return 124;

  const energies = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    const start = i * windowSize;
    for (let j = 0; j < windowSize; j += 4) {
      const v = channel[start + j];
      sum += v * v;
    }
    energies[i] = sum;
  }

  let bestBpm = 124;
  let bestScore = -1;
  const framesPerSec = sampleRate / windowSize;

  for (let bpm = 96; bpm <= 160; bpm += 2) {
    const lag = Math.round((60 / bpm) * framesPerSec);
    let score = 0;
    for (let i = 0; i < frameCount - lag; i++) {
      score += energies[i] * energies[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

export const audioEngine = new BeatAudioEngine();
