import {
  AspectRatio,
  ColorAdjustments,
  ColorFilterId,
  Keyframe,
  ProjectState,
  TimelineClip,
} from '../types/editor';

export function getCanvasDimensions(aspectRatio: AspectRatio, resolutionScale = 1): { width: number; height: number } {
  const base: Record<AspectRatio, { width: number; height: number }> = {
    '16:9': { width: 1280, height: 720 },
    '16:10': { width: 1280, height: 800 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 864, height: 1080 },
    '21:9': { width: 1440, height: 616 },
  };
  const dim = base[aspectRatio] || base['16:9'];
  return {
    width: Math.round(dim.width * resolutionScale),
    height: Math.round(dim.height * resolutionScale),
  };
}

// Media cache for fast synchronous canvas drawing
const imageCache = new Map<string, HTMLImageElement>();
const videoCache = new Map<string, HTMLVideoElement>();

export function getOrLoadImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  if (!src) return null;
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => onLoad?.();
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function getOrLoadVideo(src: string): HTMLVideoElement | null {
  if (!src) return null;
  let vid = videoCache.get(src);
  if (!vid) {
    vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.src = src;
    videoCache.set(src, vid);
  }
  return vid;
}

export function syncVideoElementToTime(
  vid: HTMLVideoElement,
  targetMediaTime: number,
  isPlaying: boolean,
  speed: number
): void {
  const clamped = Math.max(0, Math.min(vid.duration || targetMediaTime, targetMediaTime));
  if (isPlaying) {
    vid.playbackRate = speed || 1;
    if (Math.abs(vid.currentTime - clamped) > 0.28) {
      vid.currentTime = clamped;
    }
    if (vid.paused && vid.readyState >= 2) {
      void vid.play().catch(() => {});
    }
  } else {
    if (!vid.paused) vid.pause();
    if (Math.abs(vid.currentTime - clamped) > 0.04) {
      vid.currentTime = clamped;
    }
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Interpolate transform properties from keyframes at local clip time */
export function evaluateClipTransform(
  clip: TimelineClip,
  localTime: number
): { x: number; y: number; scale: number; rotation: number; opacity: number } {
  let x = clip.x;
  let y = clip.y;
  let scale = clip.scale;
  let rotation = clip.rotation;
  let opacity = clip.opacity;

  if (clip.keyframes && clip.keyframes.length > 0) {
    const sorted: Keyframe[] = [...clip.keyframes].sort((a, b) => a.timeOffset - b.timeOffset);
    if (localTime <= sorted[0].timeOffset) {
      ({ x, y, scale, rotation, opacity } = sorted[0]);
    } else if (localTime >= sorted[sorted.length - 1].timeOffset) {
      ({ x, y, scale, rotation, opacity } = sorted[sorted.length - 1]);
    } else {
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (localTime >= a.timeOffset && localTime <= b.timeOffset) {
          const span = Math.max(0.001, b.timeOffset - a.timeOffset);
          const t = easeInOut((localTime - a.timeOffset) / span);
          x = a.x + (b.x - a.x) * t;
          y = a.y + (b.y - a.y) * t;
          scale = a.scale + (b.scale - a.scale) * t;
          rotation = a.rotation + (b.rotation - a.rotation) * t;
          opacity = a.opacity + (b.opacity - a.opacity) * t;
          break;
        }
      }
    }
  }

  // Apply In animation
  if (clip.inAnimation !== 'none' && clip.inDuration > 0 && localTime < clip.inDuration) {
    const p = Math.max(0, Math.min(1, localTime / clip.inDuration));
    const eased = easeInOut(p);
    switch (clip.inAnimation) {
      case 'fade':
        opacity *= eased;
        break;
      case 'pop':
        scale *= easeOutBack(p);
        opacity *= Math.min(1, p * 2);
        break;
      case 'slide-up':
        y += (1 - eased) * 28;
        opacity *= eased;
        break;
      case 'slide-down':
        y -= (1 - eased) * 28;
        opacity *= eased;
        break;
      case 'slide-left':
        x += (1 - eased) * 35;
        opacity *= eased;
        break;
      case 'slide-right':
        x -= (1 - eased) * 35;
        opacity *= eased;
        break;
      case 'spin':
        rotation += (1 - eased) * -180;
        scale *= eased;
        opacity *= eased;
        break;
    }
  }

  // Apply Out animation
  const timeRemaining = clip.duration - localTime;
  if (clip.outAnimation !== 'none' && clip.outDuration > 0 && timeRemaining < clip.outDuration) {
    const p = Math.max(0, Math.min(1, timeRemaining / clip.outDuration));
    const eased = easeInOut(p);
    switch (clip.outAnimation) {
      case 'fade':
        opacity *= eased;
        break;
      case 'pop':
        scale *= eased;
        opacity *= eased;
        break;
      case 'slide-up':
        y -= (1 - eased) * 28;
        opacity *= eased;
        break;
      case 'slide-down':
        y += (1 - eased) * 28;
        opacity *= eased;
        break;
      case 'slide-left':
        x -= (1 - eased) * 35;
        opacity *= eased;
        break;
      case 'slide-right':
        x += (1 - eased) * 35;
        opacity *= eased;
        break;
      case 'spin':
        rotation += (1 - eased) * 180;
        scale *= eased;
        opacity *= eased;
        break;
    }
  }

  return { x, y, scale, rotation, opacity };
}

function buildFilterString(color: ColorAdjustments): string {
  const b = 100 + color.brightness;
  const c = 100 + color.contrast;
  const s = 100 + color.saturation;
  const parts: string[] = [`brightness(${b}%)`, `contrast(${c}%)`, `saturate(${s}%)`];

  const presetMap: Record<ColorFilterId, string> = {
    none: '',
    'cinema-teal': 'contrast(112%) saturate(90%) hue-rotate(-8deg)',
    'warm-golden': 'sepia(22%) saturate(125%) brightness(104%)',
    noir: 'grayscale(100%) contrast(130%) brightness(95%)',
    vivid: 'saturate(145%) contrast(110%)',
    vintage: 'sepia(35%) contrast(92%) brightness(105%) saturate(85%)',
    'cool-matte': 'contrast(94%) brightness(104%) saturate(80%) hue-rotate(8deg)',
  };

  if (color.filterId !== 'none' && presetMap[color.filterId]) {
    parts.push(presetMap[color.filterId]);
  }
  if (color.blur > 0) {
    parts.push(`blur(${color.blur}px)`);
  }
  return parts.join(' ');
}

// Reusable offscreen scratch canvas for chroma key pixel processing
let chromaScratch: HTMLCanvasElement | null = null;

function applyChromaKey(
  source: HTMLImageElement | HTMLVideoElement,
  srcW: number,
  srcH: number,
  clip: TimelineClip
): HTMLCanvasElement {
  if (!chromaScratch) {
    chromaScratch = document.createElement('canvas');
  }
  // Downscale slightly if gigantic to keep real-time 60fps buttery smooth
  const maxDim = 640;
  const ratio = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * ratio));
  const h = Math.max(1, Math.round(srcH * ratio));
  if (chromaScratch.width !== w || chromaScratch.height !== h) {
    chromaScratch.width = w;
    chromaScratch.height = h;
  }
  const sctx = chromaScratch.getContext('2d', { willReadFrequently: true })!;
  sctx.clearRect(0, 0, w, h);
  sctx.drawImage(source, 0, 0, w, h);

  const imgData = sctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const key = hexToRgb(clip.chromaKey.keyColor || '#00FF00');
  const threshold = (clip.chromaKey.similarity / 100) * 230 + 25;
  const feather = Math.max(1, (clip.chromaKey.smoothness / 100) * 90);

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - key.r;
    const dg = data[i + 1] - key.g;
    const db = data[i + 2] - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (dist < threshold + feather) {
      const alphaFactor = (dist - threshold) / feather;
      data[i + 3] = Math.round(data[i + 3] * alphaFactor);
    }
  }
  sctx.putImageData(imgData, 0, 0);
  return chromaScratch;
}

function drawSticker(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  canvasWidth: number,
  canvasHeight: number
) {
  const shape = clip.stickerShape || 'spotlight-ring';
  const color = clip.stickerColor || '#F43F5E';
  const size = Math.min(canvasWidth, canvasHeight) * 0.24;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape) {
    case 'spotlight-ring': {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.52, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'arrow-right': {
      ctx.beginPath();
      ctx.moveTo(-size * 0.6, 0);
      ctx.lineTo(size * 0.5, 0);
      ctx.moveTo(size * 0.15, -size * 0.35);
      ctx.lineTo(size * 0.55, 0);
      ctx.lineTo(size * 0.15, size * 0.35);
      ctx.stroke();
      break;
    }
    case 'frame-corners': {
      const w = canvasWidth * 0.42;
      const h = canvasHeight * 0.36;
      const leg = size * 0.3;
      const corners = [
        [-w, -h, 1, 1],
        [w, -h, -1, 1],
        [-w, h, 1, -1],
        [w, h, -1, -1],
      ];
      corners.forEach(([cx, cy, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * leg);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * leg, cy);
        ctx.stroke();
      });
      break;
    }
    case 'rec-badge': {
      ctx.fillStyle = 'rgba(15, 18, 24, 0.78)';
      ctx.beginPath();
      ctx.roundRect(-size * 0.62, -size * 0.24, size * 1.24, size * 0.48, size * 0.1);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-size * 0.32, 0, size * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 ${Math.round(size * 0.24)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('REC', -size * 0.12, 1);
      break;
    }
    case 'star-burst': {
      const spikes = 8;
      const outer = size * 0.68;
      const inner = size * 0.32;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'lower-bar': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-canvasWidth * 0.34, -size * 0.08, canvasWidth * 0.68, size * 0.16, 4);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  canvasHeight: number
): { width: number; height: number } {
  const ts = clip.textStyle;
  if (!ts) return { width: 200, height: 60 };

  const scaledSize = Math.max(12, Math.round((ts.fontSize / 720) * canvasHeight));
  ctx.font = `${ts.fontWeight} ${scaledSize}px "${ts.fontFamily}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = ts.align;

  const lines = (ts.content || 'Sample Text').split('\n');
  const lineHeight = scaledSize * 1.24;
  let maxLineW = 0;
  lines.forEach((line) => {
    const w = ctx.measureText(line).width;
    if (w > maxLineW) maxLineW = w;
  });

  const padX = scaledSize * 0.55;
  const padY = scaledSize * 0.32;
  const boxW = Math.max(80, maxLineW + padX * 2);
  const boxH = lines.length * lineHeight + padY * 2;

  if (ts.backgroundOpacity > 0) {
    ctx.save();
    ctx.globalAlpha *= ts.backgroundOpacity / 100;
    ctx.fillStyle = ts.backgroundColor || '#0D0F12';
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, Math.max(6, scaledSize * 0.18));
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (ts.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = scaledSize * 0.22;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = scaledSize * 0.06;
  }

  const startY = -((lines.length - 1) * lineHeight) / 2;
  const textX = ts.align === 'left' ? -maxLineW / 2 : ts.align === 'right' ? maxLineW / 2 : 0;

  lines.forEach((line, idx) => {
    const y = startY + idx * lineHeight;
    if (ts.strokeWidth > 0) {
      ctx.strokeStyle = ts.strokeColor || '#000000';
      ctx.lineWidth = (ts.strokeWidth / 720) * canvasHeight * 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, textX, y);
    }
    ctx.fillStyle = ts.color || '#FFFFFF';
    ctx.fillText(line, textX, y);
  });
  ctx.restore();

  return { width: boxW, height: boxH };
}

export interface RenderedBox {
  clipId: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
}

export function renderFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  currentTime: number,
  options: {
    selectedClipId: string | null;
    isPlaying: boolean;
    showOverlayHandles: boolean;
    snapGuides?: { x: boolean; y: boolean };
    onAssetLoaded?: () => void;
  }
): RenderedBox[] {
  const { width, height } = ctx.canvas;
  const boxes: RenderedBox[] = [];

  // Clear background
  ctx.save();
  ctx.fillStyle = project.backgroundColor || '#090B0E';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Order tracks bottom-to-top: video -> overlay -> text
  const trackOrder = ['video', 'overlay', 'text'] as const;

  const drawSingleClip = (
    clip: TimelineClip,
    extraAlpha = 1,
    extraOffsetX = 0,
    extraOffsetY = 0,
    extraScale = 1
  ) => {
    const localTime = currentTime - clip.startTime;
    const tf = evaluateClipTransform(clip, localTime);
    const alpha = Math.max(0, Math.min(1, (tf.opacity / 100) * extraAlpha));
    if (alpha <= 0.005) return;

    const cx = width / 2 + ((tf.x + extraOffsetX) / 100) * width;
    const cy = height / 2 + ((tf.y + extraOffsetY) / 100) * height;
    const totalScale = tf.scale * extraScale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate((tf.rotation * Math.PI) / 180);
    if (clip.flipH || clip.flipV) {
      ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
    }

    let boxW = 240;
    let boxH = 140;

    if (clip.kind === 'image' || clip.kind === 'video') {
      let mediaEl: HTMLImageElement | HTMLVideoElement | null = null;
      let natW = 0;
      let natH = 0;

      if (clip.kind === 'image' && clip.src) {
        const img = getOrLoadImage(clip.src, options.onAssetLoaded);
        if (img) {
          mediaEl = img;
          natW = img.naturalWidth;
          natH = img.naturalHeight;
        }
      } else if (clip.kind === 'video' && clip.src) {
        const vid = getOrLoadVideo(clip.src);
        if (vid) {
          const mediaTime = (clip.trimStart || 0) + localTime * (clip.speed || 1);
          syncVideoElementToTime(vid, mediaTime, options.isPlaying, clip.speed);
          if (vid.readyState >= 2 && vid.videoWidth > 0) {
            mediaEl = vid;
            natW = vid.videoWidth;
            natH = vid.videoHeight;
          }
        }
      }

      if (mediaEl && natW > 0 && natH > 0) {
        const canvasAspect = width / height;
        const mediaAspect = natW / natH;
        let drawW = width;
        let drawH = height;

        if (clip.trackId === 'overlay') {
          // Overlay defaults to fitting ~55% of canvas nicely
          const targetBox = Math.min(width, height) * 0.52;
          if (mediaAspect >= 1) {
            drawW = targetBox;
            drawH = targetBox / mediaAspect;
          } else {
            drawH = targetBox;
            drawW = targetBox * mediaAspect;
          }
        } else if (clip.fitMode === 'contain') {
          if (mediaAspect > canvasAspect) {
            drawW = width;
            drawH = width / mediaAspect;
          } else {
            drawH = height;
            drawW = height * mediaAspect;
          }
        } else {
          // cover
          if (mediaAspect > canvasAspect) {
            drawH = height;
            drawW = height * mediaAspect;
          } else {
            drawW = width;
            drawH = width / mediaAspect;
          }
        }

        drawW *= totalScale;
        drawH *= totalScale;
        boxW = drawW;
        boxH = drawH;

        ctx.filter = buildFilterString(clip.color);
        const sourceToDraw: CanvasImageSource = clip.chromaKey?.enabled
          ? applyChromaKey(mediaEl, natW, natH, clip)
          : mediaEl;
        ctx.drawImage(sourceToDraw, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.filter = 'none';

        // Vignette overlay if set
        if (clip.color.vignette > 0) {
          const grad = ctx.createRadialGradient(
            0,
            0,
            Math.min(drawW, drawH) * 0.25,
            0,
            0,
            Math.max(drawW, drawH) * 0.65
          );
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, `rgba(0,0,0,${(clip.color.vignette / 100) * 0.85})`);
          ctx.fillStyle = grad;
          ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
        }
      }
    } else if (clip.kind === 'sticker') {
      ctx.scale(totalScale, totalScale);
      drawSticker(ctx, clip, width, height);
      const s = Math.min(width, height) * 0.24 * totalScale;
      boxW = s * 1.4;
      boxH = s * 1.4;
    } else if (clip.kind === 'text') {
      ctx.scale(totalScale, totalScale);
      const measured = drawTextLayer(ctx, clip, height);
      boxW = measured.width * totalScale;
      boxH = measured.height * totalScale;
    }

    ctx.restore();

    boxes.push({
      clipId: clip.id,
      cx,
      cy,
      width: boxW,
      height: boxH,
      rotation: tf.rotation,
    });
  };

  trackOrder.forEach((trackId) => {
    if (project.tracks[trackId]?.hidden) return;
    const trackClips = project.clips
      .filter((c) => c.trackId === trackId)
      .sort((a, b) => a.startTime - b.startTime);

    if (trackId === 'video') {
      // Handle storyline transitions between adjacent V1 clips
      const activeIdx = trackClips.findIndex(
        (c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration
      );
      if (activeIdx !== -1) {
        const currentClip = trackClips[activeIdx];
        const prevClip = activeIdx > 0 ? trackClips[activeIdx - 1] : null;
        const localTime = currentTime - currentClip.startTime;
        const transDur = currentClip.transitionIn !== 'none' ? Math.min(currentClip.transitionDuration, currentClip.duration * 0.45) : 0;

        if (
          prevClip &&
          transDur > 0 &&
          localTime < transDur &&
          Math.abs(prevClip.startTime + prevClip.duration - currentClip.startTime) < 0.15
        ) {
          const p = easeInOut(localTime / transDur);
          switch (currentClip.transitionIn) {
            case 'dissolve':
              drawSingleClip(prevClip, 1 - p);
              drawSingleClip(currentClip, p);
              break;
            case 'fade-black':
              if (p < 0.5) {
                drawSingleClip(prevClip, 1 - p * 2);
              } else {
                drawSingleClip(currentClip, (p - 0.5) * 2);
              }
              break;
            case 'slide-left':
              drawSingleClip(prevClip, 1, -p * 100, 0);
              drawSingleClip(currentClip, 1, (1 - p) * 100, 0);
              break;
            case 'slide-right':
              drawSingleClip(prevClip, 1, p * 100, 0);
              drawSingleClip(currentClip, 1, -(1 - p) * 100, 0);
              break;
            case 'wipe-up':
              drawSingleClip(prevClip, 1);
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, height * (1 - p), width, height * p);
              ctx.clip();
              drawSingleClip(currentClip, 1);
              ctx.restore();
              break;
            case 'zoom-in':
              drawSingleClip(prevClip, 1 - p, 0, 0, 1 + p * 0.25);
              drawSingleClip(currentClip, p, 0, 0, 0.8 + p * 0.2);
              break;
            default:
              drawSingleClip(currentClip);
          }
        } else {
          drawSingleClip(currentClip);
        }
      }
    } else {
      const active = trackClips.filter(
        (c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration
      );
      active.forEach((clip) => drawSingleClip(clip));
    }
  });

  // Apply CapCut-style Movie Scene Effects from FX track
  if (!project.tracks.fx?.hidden) {
    const activeFxClips = project.clips
      .filter(
        (c) =>
          c.trackId === 'fx' &&
          c.kind === 'effect' &&
          c.effectConfig &&
          currentTime >= c.startTime &&
          currentTime < c.startTime + c.duration
      )
      .sort((a, b) => a.startTime - b.startTime);

    activeFxClips.forEach((fxClip) => {
      applyMovieEffect(ctx, fxClip, currentTime - fxClip.startTime);
    });
  }

  // Draw snap guides & interactive selection bounding box in preview mode
  if (options.showOverlayHandles) {
    if (options.snapGuides?.x) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.restore();
    }
    if (options.snapGuides?.y) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.restore();
    }

    const selBox = boxes.find((b) => b.clipId === options.selectedClipId);
    const selClip = project.clips.find((c) => c.id === options.selectedClipId);
    if (selBox && selClip && selClip.trackId !== 'video') {
      ctx.save();
      ctx.translate(selBox.cx, selBox.cy);
      ctx.rotate((selBox.rotation * Math.PI) / 180);
      ctx.strokeStyle = '#F43F5E';
      ctx.lineWidth = 2;
      ctx.strokeRect(-selBox.width / 2, -selBox.height / 2, selBox.width, selBox.height);

      // Corner resize handles
      const hs = 9;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#F43F5E';
      ctx.lineWidth = 2;
      const corners = [
        [-selBox.width / 2, -selBox.height / 2],
        [selBox.width / 2, -selBox.height / 2],
        [-selBox.width / 2, selBox.height / 2],
        [selBox.width / 2, selBox.height / 2],
      ];
      corners.forEach(([hx, hy]) => {
        ctx.beginPath();
        ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  return boxes;
}

// Reusable scratch buffer for frame-level movie scene effects (bloom, glitch, shake, VHS)
let fxScratch: HTMLCanvasElement | null = null;

function getFxScratch(width: number, height: number): HTMLCanvasElement {
  if (!fxScratch) fxScratch = document.createElement('canvas');
  if (fxScratch.width !== width || fxScratch.height !== height) {
    fxScratch.width = width;
    fxScratch.height = height;
  }
  return fxScratch;
}

/** Deterministic pseudo-random helper in 0..1 */
function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function applyMovieEffect(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  localTime: number
): void {
  const cfg = clip.effectConfig;
  if (!cfg) return;
  const { width, height } = ctx.canvas;
  const intensity = Math.max(0, Math.min(1, cfg.intensity / 100));
  if (intensity <= 0.01) return;
  const speed = cfg.speed || 1;
  const t = localTime * speed;

  ctx.save();

  switch (cfg.effectId) {
    case 'anamorphic-bars': {
      const barH = Math.round(height * (0.08 + intensity * 0.08));
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, barH);
      ctx.fillRect(0, height - barH, width, barH);

      // Subtle anamorphic blue-cyan horizontal flare streak
      const flareY = height * (0.34 + 0.06 * Math.sin(t * 0.9));
      const grad = ctx.createLinearGradient(0, flareY, width, flareY);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.35, `rgba(56, 189, 248, ${0.14 * intensity})`);
      grad.addColorStop(0.5, `rgba(224, 242, 254, ${0.32 * intensity})`);
      grad.addColorStop(0.65, `rgba(56, 189, 248, ${0.14 * intensity})`);
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, flareY - 2, width, 4);
      break;
    }

    case 'cinema-bloom': {
      const scratch = getFxScratch(width, height);
      const sctx = scratch.getContext('2d')!;
      sctx.clearRect(0, 0, width, height);
      sctx.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.48 * intensity;
      ctx.filter = `blur(${Math.round(10 + 18 * intensity)}px) brightness(125%)`;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      break;
    }

    case 'handheld-shake': {
      const scratch = getFxScratch(width, height);
      const sctx = scratch.getContext('2d')!;
      sctx.clearRect(0, 0, width, height);
      sctx.drawImage(ctx.canvas, 0, 0);
      const ox = (Math.sin(t * 7.3) * 0.6 + Math.cos(t * 13.1) * 0.4) * 14 * intensity;
      const oy = (Math.cos(t * 6.7) * 0.6 + Math.sin(t * 11.4) * 0.4) * 11 * intensity;
      const rot = Math.sin(t * 4.5) * 0.015 * intensity;
      const zoom = 1 + 0.045 * intensity;
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2 + ox, height / 2 + oy);
      ctx.rotate(rot);
      ctx.scale(zoom, zoom);
      ctx.drawImage(scratch, -width / 2, -height / 2);
      break;
    }

    case 'earthquake': {
      const scratch = getFxScratch(width, height);
      const sctx = scratch.getContext('2d')!;
      sctx.clearRect(0, 0, width, height);
      sctx.drawImage(ctx.canvas, 0, 0);
      const burst = 0.5 + 0.5 * Math.sin(t * 5.2);
      const ox = Math.sin(t * 38) * 26 * intensity * burst;
      const oy = Math.cos(t * 44) * 20 * intensity * burst;
      const zoom = 1 + 0.08 * intensity;
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2 + ox, height / 2 + oy);
      ctx.scale(zoom, zoom);
      ctx.drawImage(scratch, -width / 2, -height / 2);
      break;
    }

    case 'zoom-pulse': {
      const scratch = getFxScratch(width, height);
      const sctx = scratch.getContext('2d')!;
      sctx.clearRect(0, 0, width, height);
      sctx.drawImage(ctx.canvas, 0, 0);
      const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 4.2), 3);
      const zoom = 1 + beat * 0.14 * intensity;
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.drawImage(scratch, -width / 2, -height / 2);
      break;
    }

    case 'rgb-glitch': {
      const scratch = getFxScratch(width, height);
      const sctx = scratch.getContext('2d')!;
      sctx.clearRect(0, 0, width, height);
      sctx.drawImage(ctx.canvas, 0, 0);

      const frameSeed = Math.floor(t * 18);
      const isBurst = hash01(frameSeed) > 0.35;
      if (isBurst) {
        // Chromatic RGB ghost offset
        const shift = (8 + hash01(frameSeed + 2) * 18) * intensity;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35 * intensity;
        ctx.drawImage(scratch, -shift, 0);
        ctx.drawImage(scratch, shift, 0);
        ctx.restore();

        // Horizontal slice tears
        const slices = Math.round(4 + 6 * intensity);
        for (let i = 0; i < slices; i++) {
          const sy = hash01(frameSeed * 17 + i) * height;
          const sh = 6 + hash01(frameSeed * 31 + i) * (height * 0.06);
          const dx = (hash01(frameSeed * 43 + i) - 0.5) * 60 * intensity;
          ctx.drawImage(scratch, 0, sy, width, sh, dx, sy, width, sh);
        }
      }
      break;
    }

    case 'vhs-retro': {
      const scratch = getFxScratch(width, height);
      const sctx = scratch.getContext('2d')!;
      sctx.clearRect(0, 0, width, height);
      sctx.drawImage(ctx.canvas, 0, 0);

      // Slight horizontal tracking jitter band
      const bandY = ((t * 140) % (height + 80)) - 40;
      ctx.drawImage(scratch, 0, bandY, width, 28, Math.sin(t * 24) * 9 * intensity, bandY, width, 28);

      // CRT Scanlines
      ctx.fillStyle = `rgba(0, 0, 0, ${0.26 * intensity})`;
      for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 1.5);
      }

      // Warm vintage tint & tracking bar
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * intensity})`;
      ctx.fillRect(0, bandY, width, 3);

      // Camcorder PLAY timestamp stamp
      ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * Math.min(1, intensity + 0.3)})`;
      ctx.font = `600 ${Math.round(height * 0.032)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('PLAY ▶', width * 0.045, height * 0.08);
      ctx.textAlign = 'right';
      ctx.fillText('SP 1998-11-16', width * 0.955, height * 0.93);
      break;
    }

    case 'film-grain': {
      const frameSeed = Math.floor(t * 24);
      const specks = Math.round(280 * intensity);
      for (let i = 0; i < specks; i++) {
        const px = hash01(frameSeed * 19 + i) * width;
        const py = hash01(frameSeed * 37 + i + 5) * height;
        const light = hash01(frameSeed + i) > 0.5;
        ctx.fillStyle = light ? `rgba(255,255,255,${0.18 * intensity})` : `rgba(0,0,0,${0.24 * intensity})`;
        ctx.fillRect(px, py, 2, 2);
      }
      // Subtle vertical film scratch
      if (hash01(frameSeed * 7) > 0.45) {
        const sx = hash01(frameSeed * 13) * width;
        ctx.strokeStyle = `rgba(255,245,220,${0.22 * intensity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + (hash01(frameSeed) - 0.5) * 6, height);
        ctx.stroke();
      }
      // Vignette
      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.28, width / 2, height / 2, width * 0.65);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${0.55 * intensity})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'projector-flicker': {
      const frameSeed = Math.floor(t * 18);
      const flicker = 0.08 + hash01(frameSeed) * 0.24 * intensity;
      ctx.fillStyle = `rgba(18, 12, 6, ${flicker})`;
      ctx.fillRect(0, 0, width, height);
      // Sepia dust hairs
      ctx.strokeStyle = `rgba(255, 240, 210, ${0.25 * intensity})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const dx = hash01(frameSeed * 11 + i) * width;
        const dy = hash01(frameSeed * 23 + i) * height;
        ctx.beginPath();
        ctx.arc(dx, dy, 2 + hash01(i) * 4, 0, Math.PI * 1.3);
        ctx.stroke();
      }
      break;
    }

    case 'flash-strobe': {
      const pulse = Math.pow(Math.max(0, Math.sin(t * 9.5)), 6);
      if (pulse > 0.05) {
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.72 * intensity})`;
        ctx.fillRect(0, 0, width, height);
      }
      break;
    }

    case 'cinema-rain': {
      const dropCount = Math.round(95 * intensity);
      ctx.strokeStyle = `rgba(205, 230, 255, ${0.38 * intensity})`;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < dropCount; i++) {
        const seedX = hash01(i * 17 + 1);
        const speedMul = 0.8 + hash01(i * 29) * 0.9;
        const x = ((seedX * width + t * 140 * speedMul) % (width + 120)) - 60;
        const y = ((hash01(i * 41) * height + t * 920 * speedMul) % (height + 120)) - 60;
        const len = 22 + hash01(i * 7) * 26;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len * 0.16, y + len);
        ctx.stroke();
      }
      break;
    }

    case 'snow-particles': {
      const count = Math.round(80 * intensity);
      for (let i = 0; i < count; i++) {
        const baseX = hash01(i * 13) * width;
        const speedMul = 0.5 + hash01(i * 31) * 0.9;
        const x = (baseX + Math.sin(t * 1.4 + i) * 35 + width) % width;
        const y = (hash01(i * 19) * height + t * 110 * speedMul) % height;
        const r = 1.8 + hash01(i * 53) * 4.2;
        ctx.fillStyle = `rgba(245, 250, 255, ${(0.35 + hash01(i * 7) * 0.45) * intensity})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'gold-embers': {
      const count = Math.round(55 * intensity);
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < count; i++) {
        const baseX = hash01(i * 23) * width;
        const speedMul = 0.6 + hash01(i * 37) * 1.1;
        const x = (baseX + Math.sin(t * 2.1 + i * 0.7) * 45 + width) % width;
        const y = height - ((hash01(i * 11) * height + t * 150 * speedMul) % height);
        const r = 2 + hash01(i * 43) * 4.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        g.addColorStop(0, `rgba(255, 220, 130, ${0.9 * intensity})`);
        g.addColorStop(0.5, `rgba(251, 146, 60, ${0.55 * intensity})`);
        g.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'light-leak': {
      ctx.globalCompositeOperation = 'screen';
      const sweep = 0.5 + 0.5 * Math.sin(t * 1.3);
      const cx1 = width * (0.12 + sweep * 0.25);
      const cy1 = height * (0.2 + sweep * 0.25);
      const g1 = ctx.createRadialGradient(cx1, cy1, 10, cx1, cy1, width * 0.55);
      g1.addColorStop(0, `rgba(251, 146, 60, ${0.46 * intensity})`);
      g1.addColorStop(0.45, `rgba(244, 63, 94, ${0.24 * intensity})`);
      g1.addColorStop(1, 'rgba(244, 63, 94, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);
      break;
    }
  }

  ctx.restore();
}

