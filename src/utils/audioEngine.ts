import { TimelineClip } from '../types/editor';

export interface BuiltInAudioPreset {
  id: string;
  name: string;
  category: 'music' | 'sfx';
  duration: number;
  generator: (ctx: OfflineAudioContext, duration: number) => void;
}

/** Encode an AudioBuffer into a standard PCM WAV Blob */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/** Extract normalized waveform peaks (0..1) from an AudioBuffer */
export function extractWaveformPeaks(buffer: AudioBuffer, bars = 80): number[] {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bars));
  const peaks: number[] = [];
  for (let i = 0; i < bars; i++) {
    let max = 0;
    const start = i * step;
    const end = Math.min(data.length, start + step);
    for (let j = start; j < end; j++) {
      const val = Math.abs(data[j]);
      if (val > max) max = val;
    }
    peaks.push(Math.min(1, Math.max(0.06, max)));
  }
  return peaks;
}

/** Decode any audio URL or File into an AudioBuffer + waveform peaks */
export async function decodeAudioWaveform(
  src: string,
  bars = 80
): Promise<{ duration: number; waveform: number[] }> {
  try {
    const res = await fetch(src);
    const arrayBuffer = await res.arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const peaks = extractWaveformPeaks(audioBuffer, bars);
    const duration = audioBuffer.duration;
    await ctx.close();
    return { duration, waveform: peaks };
  } catch {
    // Fallback deterministic waveform for video files without audio track
    return {
      duration: 5,
      waveform: Array.from({ length: bars }, (_, i) => 0.15 + 0.3 * Math.abs(Math.sin(i * 0.45))),
    };
  }
}

export const BUILTIN_AUDIO_PRESETS: BuiltInAudioPreset[] = [
  {
    id: 'audio-lofi-beat',
    name: 'Tokyo Lo-Fi Groove',
    category: 'music',
    duration: 12,
    generator: (ctx, duration) => {
      const chords = [
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [220.0, 261.63, 329.63, 392.0], // Am7
        [174.61, 220.0, 261.63, 349.23], // Fmaj7
        [196.0, 246.94, 293.66, 392.0], // G6
      ];
      const master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);

      // Warm electric piano chords
      for (let bar = 0; bar < 6; bar++) {
        const chord = chords[bar % chords.length];
        const t = bar * 2;
        if (t >= duration) break;
        chord.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.exponentialRampToValueAtTime(0.14, t + 0.06);
          gain.gain.exponentialRampToValueAtTime(0.04, t + 1.85);
          gain.gain.linearRampToValueAtTime(0.0001, t + 1.98);
          osc.connect(gain);
          gain.connect(master);
          osc.start(t);
          osc.stop(t + 2.0);
        });
      }

      // Soft kick & hi-hat groove
      for (let beat = 0; beat < duration * 2; beat++) {
        const t = beat * 0.5;
        if (beat % 2 === 0) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(115, t);
          osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
          g.gain.setValueAtTime(0.55, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(g);
          g.connect(master);
          osc.start(t);
          osc.stop(t + 0.23);
        }
        // Subtle offbeat shaker
        const noiseLen = Math.floor(ctx.sampleRate * 0.04);
        const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.3));
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6500;
        const ng = ctx.createGain();
        ng.gain.value = beat % 2 === 1 ? 0.12 : 0.05;
        noise.connect(hp);
        hp.connect(ng);
        ng.connect(master);
        noise.start(t + 0.25);
      }
    },
  },
  {
    id: 'audio-alpine-pad',
    name: 'Alpine Sunrise Pad',
    category: 'music',
    duration: 12,
    generator: (ctx, duration) => {
      const notes = [196.0, 293.66, 392.0, 493.88, 587.33];
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, 0);
      master.gain.linearRampToValueAtTime(0.35, 1.5);
      master.gain.setValueAtTime(0.35, duration - 1.5);
      master.gain.linearRampToValueAtTime(0.001, duration);
      master.connect(ctx.destination);

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, 0);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, 0);
        filter.frequency.linearRampToValueAtTime(1600, duration * 0.5);
        filter.frequency.linearRampToValueAtTime(700, duration);
        const g = ctx.createGain();
        g.gain.value = 0.18;
        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        osc.start(0);
        osc.stop(duration);
      });
    },
  },
  {
    id: 'audio-cinematic-rise',
    name: 'Cinematic Swell',
    category: 'sfx',
    duration: 3.5,
    generator: (ctx, duration) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, 0);
      osc.frequency.exponentialRampToValueAtTime(320, duration - 0.3);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, 0);
      filter.frequency.exponentialRampToValueAtTime(2800, duration - 0.2);
      g.gain.setValueAtTime(0.01, 0);
      g.gain.exponentialRampToValueAtTime(0.45, duration - 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, duration);
      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(0);
      osc.stop(duration);
    },
  },
  {
    id: 'audio-whoosh',
    name: 'Transition Whoosh',
    category: 'sfx',
    duration: 1.2,
    generator: (ctx, duration) => {
      const len = Math.floor(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.4;
      bp.frequency.setValueAtTime(240, 0);
      bp.frequency.exponentialRampToValueAtTime(2200, duration * 0.45);
      bp.frequency.exponentialRampToValueAtTime(320, duration);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.01, 0);
      g.gain.linearRampToValueAtTime(0.65, duration * 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, duration);
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start(0);
    },
  },
  {
    id: 'audio-shutter',
    name: 'Camera Shutter Click',
    category: 'sfx',
    duration: 0.6,
    generator: (ctx) => {
      [0, 0.08].forEach((t, idx) => {
        const len = Math.floor(ctx.sampleRate * 0.05);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = idx === 0 ? 3200 : 2100;
        const g = ctx.createGain();
        g.gain.value = 0.7;
        src.connect(bp);
        bp.connect(g);
        g.connect(ctx.destination);
        src.start(t);
      });
    },
  },
];

export async function generateBuiltInAudioAsset(preset: BuiltInAudioPreset): Promise<{
  src: string;
  duration: number;
  waveform: number[];
}> {
  const sampleRate = 44100;
  const offline = new OfflineAudioContext(2, Math.floor(sampleRate * preset.duration), sampleRate);
  preset.generator(offline, preset.duration);
  const rendered = await offline.startRendering();
  const blob = audioBufferToWavBlob(rendered);
  const src = URL.createObjectURL(blob);
  const waveform = extractWaveformPeaks(rendered, 80);
  return { src, duration: preset.duration, waveform };
}

/** Synchronized Web Audio Engine for timeline playback & export mixing */
export class TimelineAudioEngine {
  private ctx: AudioContext | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private activeSources = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private masterGain: GainNode | null = null;
  private exportDest: MediaStreamAudioDestinationNode | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async preloadClipAudio(src: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(src)) return this.bufferCache.get(src)!;
    try {
      const ctx = this.ensureContext();
      const res = await fetch(src);
      const ab = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(ab);
      this.bufferCache.set(src, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  public stopAll(): void {
    this.activeSources.forEach(({ source }) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    });
    this.activeSources.clear();
  }

  public createExportDestination(): MediaStream | null {
    const ctx = this.ensureContext();
    this.exportDest = ctx.createMediaStreamDestination();
    return this.exportDest.stream;
  }

  public clearExportDestination(): void {
    this.exportDest = null;
  }

  public setMasterMuted(muted: boolean): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
  }

  /** Schedule all audio-bearing clips starting from playhead time `t` */
  public async startPlayback(
    clips: TimelineClip[],
    playheadTime: number,
    mutedTrackIds: Set<string>,
    masterMuted: boolean,
    toExportOnly = false
  ): Promise<void> {
    this.stopAll();
    const ctx = this.ensureContext();
    this.setMasterMuted(masterMuted);

    const audioClips = clips.filter(
      (c) =>
        (c.kind === 'audio' || c.kind === 'video') &&
        c.src &&
        !c.muted &&
        !mutedTrackIds.has(c.trackId) &&
        c.startTime + c.duration > playheadTime
    );

    await Promise.all(
      audioClips.map(async (clip) => {
        if (!clip.src) return;
        const buf = await this.preloadClipAudio(clip.src);
        if (!buf) return;

        const now = ctx.currentTime;
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.playbackRate.value = clip.speed || 1;

        const gain = ctx.createGain();
        const baseVol = Math.max(0, Math.min(2, (clip.volume ?? 100) / 100));

        const delay = Math.max(0, clip.startTime - playheadTime);
        const alreadyIntoClip = Math.max(0, playheadTime - clip.startTime);
        const mediaOffset = Math.max(0, (clip.trimStart || 0) + alreadyIntoClip * (clip.speed || 1));
        const remainingDuration = clip.duration - alreadyIntoClip;

        if (remainingDuration <= 0.02 || mediaOffset >= buf.duration) return;

        const startAt = now + delay;
        const endAt = startAt + remainingDuration;

        // Apply fade-in & fade-out envelopes
        gain.gain.setValueAtTime(baseVol, startAt);
        if (clip.fadeInAudio > 0 && alreadyIntoClip < clip.fadeInAudio) {
          const fadeStartVol = (alreadyIntoClip / clip.fadeInAudio) * baseVol;
          gain.gain.setValueAtTime(Math.max(0.001, fadeStartVol), startAt);
          gain.gain.linearRampToValueAtTime(baseVol, startAt + (clip.fadeInAudio - alreadyIntoClip));
        }
        if (clip.fadeOutAudio > 0 && remainingDuration > 0.05) {
          const fadeOutStart = Math.max(startAt, endAt - clip.fadeOutAudio);
          gain.gain.setValueAtTime(baseVol, fadeOutStart);
          gain.gain.linearRampToValueAtTime(0.001, endAt);
        }

        source.connect(gain);
        if (!toExportOnly && this.masterGain) {
          gain.connect(this.masterGain);
        }
        if (this.exportDest) {
          gain.connect(this.exportDest);
        }

        const playDur = Math.min(remainingDuration * (clip.speed || 1), buf.duration - mediaOffset);
        source.start(startAt, mediaOffset, Math.max(0.01, playDur / (clip.speed || 1)));
        this.activeSources.set(clip.id, { source, gain });
      })
    );
  }
}

export const sharedAudioEngine = new TimelineAudioEngine();
