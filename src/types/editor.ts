export type AspectRatio = '16:9' | '16:10' | '9:16' | '1:1' | '4:5' | '21:9';

export type TrackId = 'fx' | 'video' | 'overlay' | 'text' | 'audio';

export type ClipKind = 'video' | 'image' | 'text' | 'sticker' | 'audio' | 'effect';

export type MovieEffectId =
  | 'anamorphic-bars'
  | 'film-grain'
  | 'vhs-retro'
  | 'cinema-bloom'
  | 'rgb-glitch'
  | 'handheld-shake'
  | 'earthquake'
  | 'flash-strobe'
  | 'zoom-pulse'
  | 'cinema-rain'
  | 'snow-particles'
  | 'gold-embers'
  | 'light-leak'
  | 'projector-flicker';

export interface EffectConfig {
  effectId: MovieEffectId;
  intensity: number; // 0..100
  speed: number; // 0.25..3
}

export type TransitionType =
  | 'none'
  | 'dissolve'
  | 'fade-black'
  | 'slide-left'
  | 'slide-right'
  | 'wipe-up'
  | 'zoom-in';

export type AnimationType =
  | 'none'
  | 'fade'
  | 'pop'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'spin';

export type ColorFilterId =
  | 'none'
  | 'cinema-teal'
  | 'warm-golden'
  | 'noir'
  | 'vivid'
  | 'vintage'
  | 'cool-matte';

export type StickerShape =
  | 'arrow-right'
  | 'spotlight-ring'
  | 'frame-corners'
  | 'rec-badge'
  | 'star-burst'
  | 'lower-bar';

export interface Keyframe {
  id: string;
  /** Offset in seconds relative to the clip's startTime */
  timeOffset: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface ChromaKeyConfig {
  enabled: boolean;
  keyColor: string; // hex e.g. '#00FF00'
  similarity: number; // 0..100
  smoothness: number; // 0..100
}

export interface ColorAdjustments {
  filterId: ColorFilterId;
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  blur: number; // 0..20
  vignette: number; // 0..100
}

export interface TextStyleConfig {
  content: string;
  fontFamily: 'Plus Jakarta Sans' | 'DM Sans' | 'JetBrains Mono' | 'Georgia' | 'Impact';
  fontSize: number; // normalized at 1080p height (e.g. 56)
  fontWeight: '400' | '600' | '700';
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
  backgroundOpacity: number; // 0..100
  align: 'left' | 'center' | 'right';
  shadow: boolean;
  letterSpacing: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  src: string;
  duration: number; // seconds (images default 5s)
  width?: number;
  height?: number;
  thumbnail?: string;
  waveform?: number[];
  isBuiltIn?: boolean;
}

export interface TimelineClip {
  id: string;
  trackId: TrackId;
  kind: ClipKind;
  name: string;
  assetId?: string;
  src?: string;
  thumbnail?: string;
  waveform?: number[];

  // Timeline placement (seconds)
  startTime: number;
  duration: number;
  /** Offset inside source media (seconds) */
  trimStart: number;
  /** Total original media duration for trimming bounds */
  sourceDuration: number;

  // Playback & Audio
  speed: number; // 0.25..4
  volume: number; // 0..200 (%)
  muted: boolean;
  fadeInAudio: number; // seconds
  fadeOutAudio: number; // seconds

  // Spatial Transform (percentage relative to canvas center: x=0, y=0 is center; x in -100..100)
  x: number;
  y: number;
  scale: number; // 1 = 100%
  rotation: number; // degrees
  opacity: number; // 0..100
  flipH: boolean;
  flipV: boolean;
  fitMode: 'cover' | 'contain';

  // In/Out Animation
  inAnimation: AnimationType;
  inDuration: number;
  outAnimation: AnimationType;
  outDuration: number;

  // Transition into this clip (mainly for V1 storyline clips)
  transitionIn: TransitionType;
  transitionDuration: number;

  // Color & Chroma
  color: ColorAdjustments;
  chromaKey: ChromaKeyConfig;

  // Keyframes
  keyframes: Keyframe[];

  // Text, Sticker, or Movie Effect specific
  textStyle?: TextStyleConfig;
  stickerShape?: StickerShape;
  stickerColor?: string;
  effectConfig?: EffectConfig;
}

export interface TrackMeta {
  id: TrackId;
  label: string;
  shortLabel: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface ProjectState {
  title: string;
  aspectRatio: AspectRatio;
  backgroundColor: string;
  fps: number;
  clips: TimelineClip[];
  tracks: Record<TrackId, TrackMeta>;
}
