import React, { useRef, useState } from 'react';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Camera,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Magnet,
  Maximize,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MovieEffectPreset } from '../data/presets';
import { MediaAsset, ProjectState, TimelineClip, TrackId } from '../types/editor';
import { formatShortTime } from '../utils/timecode';

interface TimelineProps {
  project: ProjectState;
  currentTime: number;
  totalDuration: number;
  selectedClipId: string | null;
  pixelsPerSecond: number;
  snapEnabled: boolean;
  onSelectClip: (clipId: string | null) => void;
  onSeek: (time: number) => void;
  onSetPixelsPerSecond: (pps: number) => void;
  onToggleSnap: () => void;
  onToggleTrackMute: (trackId: TrackId) => void;
  onToggleTrackHide: (trackId: TrackId) => void;
  onMoveOrTrimClip: (
    clipId: string,
    patch: Partial<Pick<TimelineClip, 'startTime' | 'duration' | 'trimStart'>>,
    recordHistory?: boolean
  ) => void;
  onSplitAtPlayhead: () => void;
  onTrimLeftToPlayhead: () => void;
  onTrimRightToPlayhead: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onCaptureFrame: () => void;
  onDropAssetOnTrack: (asset: MediaAsset, trackId: TrackId, startTime: number) => void;
  onDropEffectOnTrack: (preset: MovieEffectPreset, startTime: number) => void;
  onClickTransition: (clipId: string) => void;
}

const TRACK_ORDER: TrackId[] = ['fx', 'text', 'overlay', 'video', 'audio'];

const TRACK_ACCENT: Record<TrackId, { bg: string; border: string; activeBorder: string }> = {
  fx: {
    bg: 'bg-[#153440]',
    border: 'border-[#22586D]',
    activeBorder: 'border-cyan-400 ring-1 ring-cyan-400/60',
  },
  video: {
    bg: 'bg-[#1D2D44]',
    border: 'border-[#2E486B]',
    activeBorder: 'border-rose-500 ring-1 ring-rose-500/60',
  },
  overlay: {
    bg: 'bg-[#2C2245]',
    border: 'border-[#483675]',
    activeBorder: 'border-rose-500 ring-1 ring-rose-500/60',
  },
  text: {
    bg: 'bg-[#3D2E18]',
    border: 'border-[#6A4E23]',
    activeBorder: 'border-rose-500 ring-1 ring-rose-500/60',
  },
  audio: {
    bg: 'bg-[#17362D]',
    border: 'border-[#245A4A]',
    activeBorder: 'border-rose-500 ring-1 ring-rose-500/60',
  },
};

export const Timeline: React.FC<TimelineProps> = ({
  project,
  currentTime,
  totalDuration,
  selectedClipId,
  pixelsPerSecond,
  snapEnabled,
  onSelectClip,
  onSeek,
  onSetPixelsPerSecond,
  onToggleSnap,
  onToggleTrackMute,
  onToggleTrackHide,
  onMoveOrTrimClip,
  onSplitAtPlayhead,
  onTrimLeftToPlayhead,
  onTrimRightToPlayhead,
  onDuplicateSelected,
  onDeleteSelected,
  onCaptureFrame,
  onDropAssetOnTrack,
  onDropEffectOnTrack,
  onClickTransition,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dragOverTrack, setDragOverTrack] = useState<TrackId | null>(null);

  const selectedClip = project.clips.find((c) => c.id === selectedClipId) || null;
  const canSplit =
    selectedClip
      ? currentTime > selectedClip.startTime + 0.08 &&
        currentTime < selectedClip.startTime + selectedClip.duration - 0.08
      : project.clips.some(
          (c) => currentTime > c.startTime + 0.08 && currentTime < c.startTime + c.duration - 0.08
        );

  const canTrimToPlayhead =
    !!selectedClip &&
    currentTime > selectedClip.startTime + 0.1 &&
    currentTime < selectedClip.startTime + selectedClip.duration - 0.1;

  const timelineTotalSec = Math.max(20, Math.ceil(totalDuration + 8));
  const timelineWidthPx = timelineTotalSec * pixelsPerSecond;

  // Compute snap targets (other clip edges + playhead + 0)
  const getSnapPoints = (excludeClipId: string): number[] => {
    const pts = [0, currentTime];
    project.clips.forEach((c) => {
      if (c.id !== excludeClipId) {
        pts.push(c.startTime, c.startTime + c.duration);
      }
    });
    return pts;
  };

  const snapTime = (t: number, snapPoints: number[]): number => {
    if (!snapEnabled) return t;
    const thresholdSec = 10 / pixelsPerSecond;
    let best = t;
    let bestDist = thresholdSec;
    for (const pt of snapPoints) {
      const d = Math.abs(t - pt);
      if (d < bestDist) {
        bestDist = d;
        best = pt;
      }
    }
    return best;
  };

  // Scrub ruler pointer interaction
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const ruler = e.currentTarget;
    ruler.setPointerCapture(e.pointerId);

    const updateFromClientX = (clientX: number) => {
      const rect = ruler.getBoundingClientRect();
      const x = Math.max(0, clientX - rect.left);
      onSeek(Math.max(0, x / pixelsPerSecond));
    };

    updateFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Clip drag / trim interaction
  const startClipInteraction = (
    e: React.PointerEvent,
    clip: TimelineClip,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    const startX = e.clientX;
    const origStart = clip.startTime;
    const origDur = clip.duration;
    const origTrimStart = clip.trimStart;
    const snapPts = getSnapPoints(clip.id);

    const onMove = (ev: PointerEvent) => {
      const dxSec = (ev.clientX - startX) / pixelsPerSecond;

      if (mode === 'move') {
        let nextStart = Math.max(0, origStart + dxSec);
        // Snap either start edge or end edge
        const snappedStart = snapTime(nextStart, snapPts);
        if (snappedStart !== nextStart) {
          nextStart = snappedStart;
        } else {
          const snappedEnd = snapTime(nextStart + origDur, snapPts);
          if (snappedEnd !== nextStart + origDur) {
            nextStart = Math.max(0, snappedEnd - origDur);
          }
        }
        onMoveOrTrimClip(clip.id, { startTime: Math.round(nextStart * 1000) / 1000 }, false);
      } else if (mode === 'trim-left') {
        const maxDelta = origDur - 0.3;
        const minDelta = -Math.min(origStart, origTrimStart);
        const clampedDelta = Math.max(minDelta, Math.min(maxDelta, dxSec));
        const nextStart = snapTime(Math.max(0, origStart + clampedDelta), snapPts);
        const appliedDelta = nextStart - origStart;
        const nextDur = Math.max(0.3, origDur - appliedDelta);
        const nextTrim = Math.max(0, origTrimStart + appliedDelta);
        onMoveOrTrimClip(
          clip.id,
          {
            startTime: Math.round(nextStart * 1000) / 1000,
            duration: Math.round(nextDur * 1000) / 1000,
            trimStart: Math.round(nextTrim * 1000) / 1000,
          },
          false
        );
      } else if (mode === 'trim-right') {
        const rawEnd = Math.max(origStart + 0.3, origStart + origDur + dxSec);
        const snappedEnd = snapTime(rawEnd, snapPts);
        const maxDur = clip.kind === 'image' || clip.kind === 'text' || clip.kind === 'sticker' || clip.kind === 'effect'
          ? 60
          : Math.max(0.3, (clip.sourceDuration - clip.trimStart) / (clip.speed || 1));
        const nextDur = Math.max(0.3, Math.min(maxDur, snappedEnd - origStart));
        onMoveOrTrimClip(clip.id, { duration: Math.round(nextDur * 1000) / 1000 }, false);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Tick interval based on zoom level
  const majorTickSec = pixelsPerSecond < 40 ? 5 : pixelsPerSecond < 85 ? 2 : 1;
  const ticks: number[] = [];
  for (let s = 0; s <= timelineTotalSec; s += majorTickSec) {
    ticks.push(s);
  }

  const fitTimelineToView = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const avail = Math.max(300, el.clientWidth - 40);
    const dur = Math.max(8, totalDuration + 1);
    onSetPixelsPerSecond(Math.max(25, Math.min(160, Math.round(avail / dur))));
  };

  const handleTrackDrop = (e: React.DragEvent, targetTrack: TrackId) => {
    e.preventDefault();
    setDragOverTrack(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left);
    const dropTime = Math.max(0, Math.round((x / pixelsPerSecond) * 100) / 100);

    const rawEffect = e.dataTransfer.getData('application/kinedeck-effect');
    if (rawEffect) {
      try {
        const preset = JSON.parse(rawEffect) as MovieEffectPreset;
        onDropEffectOnTrack(preset, dropTime);
      } catch {
        // ignore invalid drop
      }
      return;
    }

    const raw = e.dataTransfer.getData('application/kinedeck-asset');
    if (!raw) return;
    try {
      const asset = JSON.parse(raw) as MediaAsset;
      // Route audio to audio track, visual to video or overlay
      const resolvedTrack: TrackId =
        asset.kind === 'audio'
          ? 'audio'
          : targetTrack === 'audio' || targetTrack === 'text' || targetTrack === 'fx'
            ? 'overlay'
            : targetTrack;
      onDropAssetOnTrack(asset, resolvedTrack, dropTime);
    } catch {
      // ignore invalid drop
    }
  };

  const v1ClipsSorted = project.clips
    .filter((c) => c.trackId === 'video')
    .sort((a, b) => a.startTime - b.startTime);

  return (
    <section className="h-[246px] min-h-[210px] max-h-[34vh] shrink-0 bg-[#12151B] border-t border-[#242933] flex flex-col select-none">
      {/* Timeline Action Toolbar */}
      <div className="h-9 shrink-0 bg-[#151921] border-b border-[#242933] px-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canSplit}
            onClick={onSplitAtPlayhead}
            title="Split Clip at Playhead (S)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1F242F] hover:bg-rose-500 text-xs font-medium text-slate-200 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>

          <button
            type="button"
            disabled={!canTrimToPlayhead}
            onClick={onTrimLeftToPlayhead}
            title="Trim Left of Playhead"
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1F242F] hover:bg-[#2A3140] text-xs font-medium text-slate-300 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowLeftToLine className="w-3.5 h-3.5" />
            <span>Trim L</span>
          </button>

          <button
            type="button"
            disabled={!canTrimToPlayhead}
            onClick={onTrimRightToPlayhead}
            title="Trim Right of Playhead"
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1F242F] hover:bg-[#2A3140] text-xs font-medium text-slate-300 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowRightToLine className="w-3.5 h-3.5" />
            <span>Trim R</span>
          </button>

          <span className="h-4 w-px bg-[#282E3A] mx-1" aria-hidden="true" />

          <button
            type="button"
            disabled={!selectedClip}
            onClick={onDuplicateSelected}
            title="Duplicate Selected Clip"
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-[#1F242F] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={!selectedClip}
            onClick={onDeleteSelected}
            title="Delete Selected Clip (Del)"
            className="p-1.5 rounded text-slate-300 hover:text-rose-400 hover:bg-[#1F242F] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <span className="h-4 w-px bg-[#282E3A] mx-1" aria-hidden="true" />

          <button
            type="button"
            onClick={onCaptureFrame}
            title="Capture & Download Frame PNG"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1F242F] hover:bg-[#2A3140] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Snapshot</span>
          </button>
        </div>

        {/* Right Timeline Controls: Snap & Zoom */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSnap}
            title="Toggle Magnetic Snap"
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              snapEnabled
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40'
                : 'text-slate-400 hover:text-white hover:bg-[#1F242F] border border-transparent'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snap</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSetPixelsPerSecond(Math.max(25, pixelsPerSecond - 15))}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={25}
              max={180}
              step={5}
              value={pixelsPerSecond}
              onChange={(e) => onSetPixelsPerSecond(Number(e.target.value))}
              className="w-24 studio-slider"
              aria-label="Timeline Zoom"
            />
            <button
              type="button"
              onClick={() => onSetPixelsPerSecond(Math.min(180, pixelsPerSecond + 15))}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={fitTimelineToView}
              title="Fit Timeline"
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Timeline Body: Fixed Left Track Headers + Scrollable Track Lanes */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Track Headers */}
        <div className="w-[148px] shrink-0 bg-[#14171E] border-r border-[#242933] flex flex-col">
          {/* Corner above ruler */}
          <div className="h-6 border-b border-[#242933] px-2.5 flex items-center text-[10px] font-mono-tabular text-slate-500">
            TRACKS
          </div>

          <div className="flex-1 flex flex-col divide-y divide-[#1E232D]">
            {TRACK_ORDER.map((trackId) => {
              const meta = project.tracks[trackId];
              return (
                <div
                  key={trackId}
                  className="flex-1 px-2.5 flex items-center justify-between gap-1 min-h-0"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-200 truncate">{meta.label}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {trackId !== 'audio' ? (
                      <button
                        type="button"
                        onClick={() => onToggleTrackHide(trackId)}
                        title={meta.hidden ? 'Show Track' : 'Hide Track'}
                        className={`p-1 rounded cursor-pointer ${
                          meta.hidden ? 'text-amber-400' : 'text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {meta.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleTrackMute(trackId)}
                        title={meta.muted ? 'Unmute Track' : 'Mute Track'}
                        className={`p-1 rounded cursor-pointer ${
                          meta.muted ? 'text-amber-400' : 'text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {meta.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Ruler + Tracks */}
        <div
          ref={scrollContainerRef}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelectClip(null);
          }}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0F1217]"
        >
          <div className="h-full flex flex-col relative" style={{ width: `${timelineWidthPx}px` }}>
            {/* Time Ruler */}
            <div
              onPointerDown={handleRulerPointerDown}
              className="h-6 shrink-0 bg-[#14171E] border-b border-[#242933] relative cursor-ew-resize"
            >
              {ticks.map((sec) => (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-[#2B313D] pl-1 flex items-center pointer-events-none"
                  style={{ left: `${sec * pixelsPerSecond}px` }}
                >
                  <span className="text-[10px] font-mono-tabular text-slate-400">
                    {formatShortTime(sec)}
                  </span>
                </div>
              ))}
            </div>

            {/* Track Lanes */}
            <div className="flex-1 flex flex-col divide-y divide-[#1C2029] relative">
              {TRACK_ORDER.map((trackId) => {
                const clips = project.clips
                  .filter((c) => c.trackId === trackId)
                  .sort((a, b) => a.startTime - b.startTime);
                const colors = TRACK_ACCENT[trackId];

                return (
                  <div
                    key={trackId}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTrack(trackId);
                    }}
                    onDragLeave={() => setDragOverTrack(null)}
                    onDrop={(e) => handleTrackDrop(e, trackId)}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) onSelectClip(null);
                    }}
                    className={`flex-1 relative min-h-0 transition-colors ${
                      dragOverTrack === trackId ? 'bg-rose-500/10' : ''
                    }`}
                  >
                    {clips.map((clip) => {
                      const leftPx = clip.startTime * pixelsPerSecond;
                      const widthPx = Math.max(24, clip.duration * pixelsPerSecond);
                      const isSelected = clip.id === selectedClipId;

                      return (
                        <div
                          key={clip.id}
                          onPointerDown={(e) => startClipInteraction(e, clip, 'move')}
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          className={`absolute top-1 bottom-1 rounded border overflow-hidden cursor-grab active:cursor-grabbing group ${
                            colors.bg
                          } ${isSelected ? colors.activeBorder : colors.border}`}
                        >
                          {/* Background media preview strip or audio waveform */}
                          {clip.thumbnail && (
                            <div
                              className="absolute inset-0 opacity-35 bg-repeat-x bg-center pointer-events-none"
                              style={{
                                backgroundImage: `url(${clip.thumbnail})`,
                                backgroundSize: 'auto 100%',
                              }}
                            />
                          )}

                          {clip.kind === 'audio' && clip.waveform && (
                            <div className="absolute inset-x-1 inset-y-1.5 flex items-center gap-[1.5px] opacity-60 pointer-events-none">
                              {clip.waveform.map((pk, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 bg-emerald-400 rounded-full min-w-[1px]"
                                  style={{ height: `${Math.round(pk * 100)}%` }}
                                />
                              ))}
                            </div>
                          )}

                          {/* Clip Label */}
                          <div className="relative z-10 px-2 h-full flex items-center justify-between pointer-events-none">
                            <span className="text-[11px] font-medium text-white truncate drop-shadow">
                              {clip.name}
                            </span>
                          </div>

                          {/* Keyframe Diamond Markers */}
                          {clip.keyframes.map((kf) => (
                            <div
                              key={kf.id}
                              style={{ left: `${Math.max(4, Math.min(widthPx - 6, kf.timeOffset * pixelsPerSecond))}px` }}
                              className="absolute bottom-0.5 -translate-x-1/2 z-20 pointer-events-none"
                            >
                              <Diamond className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                            </div>
                          ))}

                          {/* Left & Right Trim Handles */}
                          <div
                            onPointerDown={(e) => startClipInteraction(e, clip, 'trim-left')}
                            title="Drag to trim start"
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 bg-white/0 group-hover:bg-white/25 transition-colors"
                          />
                          <div
                            onPointerDown={(e) => startClipInteraction(e, clip, 'trim-right')}
                            title="Drag to trim end"
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 bg-white/0 group-hover:bg-white/25 transition-colors"
                          />
                        </div>
                      );
                    })}

                    {/* Transition Badges between adjacent V1 clips */}
                    {trackId === 'video' &&
                      v1ClipsSorted.map((clip, idx) => {
                        if (idx === 0) return null;
                        const prev = v1ClipsSorted[idx - 1];
                        if (Math.abs(prev.startTime + prev.duration - clip.startTime) > 0.15) return null;
                        const xPx = clip.startTime * pixelsPerSecond;
                        const hasTransition = clip.transitionIn !== 'none';
                        return (
                          <button
                            key={`tr-${clip.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onClickTransition(clip.id);
                            }}
                            title={`Transition: ${clip.transitionIn} (click to edit)`}
                            style={{ left: `${xPx}px` }}
                            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-5 h-5 rounded border text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors ${
                              hasTransition
                                ? 'bg-rose-500 border-rose-300 text-white'
                                : 'bg-[#1F2530] border-[#394254] text-slate-300 hover:border-rose-400'
                            }`}
                          >
                            ⇄
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </div>

            {/* Playhead Line */}
            <div
              style={{ left: `${currentTime * pixelsPerSecond}px` }}
              className="absolute top-0 bottom-0 w-px bg-rose-500 z-40 pointer-events-none"
            >
              <div className="w-3 h-3 bg-rose-500 -translate-x-1/2 rotate-45 -mt-1.5 rounded-[1px]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
