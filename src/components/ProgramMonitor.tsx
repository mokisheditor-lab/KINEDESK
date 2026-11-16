import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ProjectState, TimelineClip } from '../types/editor';
import {
  getCanvasDimensions,
  RenderedBox,
  renderFrameToCanvas,
} from '../utils/canvasRenderer';

interface ProgramMonitorProps {
  project: ProjectState;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isLooping: boolean;
  masterMuted: boolean;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClipTransform: (
    clipId: string,
    patch: Partial<Pick<TimelineClip, 'x' | 'y' | 'scale'>>,
    recordHistory?: boolean
  ) => void;
  onQuickEditText: (clipId: string, content: string) => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  onToggleMasterMute: () => void;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  project,
  currentTime,
  totalDuration,
  isPlaying,
  isLooping,
  masterMuted,
  selectedClipId,
  onSelectClip,
  onUpdateClipTransform,
  onQuickEditText,
  onTogglePlay,
  onSeek,
  onToggleLoop,
  onToggleMasterMute,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedBoxesRef = useRef<RenderedBox[]>([]);
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [renderTick, setRenderTick] = useState(0);
  const [inlineEditClip, setInlineEditClip] = useState<TimelineClip | null>(null);
  const [inlineDraft, setInlineDraft] = useState('');
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 640, h: 360 });

  const dims = getCanvasDimensions(project.aspectRatio, 1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const availW = Math.max(120, el.clientWidth - 24);
      const availH = Math.max(120, el.clientHeight - 24);
      const targetAspect = dims.width / dims.height;
      let w = availW;
      let h = w / targetAspect;
      if (h > availH) {
        h = availH;
        w = h * targetAspect;
      }
      setBoxSize({ w: Math.floor(w), h: Math.floor(h) });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims.width, dims.height]);

  const dragStateRef = useRef<{
    mode: 'move' | 'scale';
    clipId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origScale: number;
    boxHalfDiag: number;
    cx: number;
    cy: number;
  } | null>(null);

  // Render canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== dims.width || canvas.height !== dims.height) {
      canvas.width = dims.width;
      canvas.height = dims.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const boxes = renderFrameToCanvas(ctx, project, currentTime, {
      selectedClipId,
      isPlaying,
      showOverlayHandles: !isPlaying,
      snapGuides,
      onAssetLoaded: () => setRenderTick((t) => t + 1),
    });
    renderedBoxesRef.current = boxes;
  }, [project, currentTime, selectedClipId, isPlaying, snapGuides, dims.width, dims.height, renderTick]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const pt = getCanvasCoords(e.clientX, e.clientY);
    const boxes = renderedBoxesRef.current;

    // Check if clicking corner scale handle on currently selected non-V1 clip
    const selBox = boxes.find((b) => b.clipId === selectedClipId);
    const selClip = project.clips.find((c) => c.id === selectedClipId);
    if (selBox && selClip && selClip.trackId !== 'video') {
      const rad = (-selBox.rotation * Math.PI) / 180;
      const dx = pt.x - selBox.cx;
      const dy = pt.y - selBox.cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      const corners = [
        [-selBox.width / 2, -selBox.height / 2],
        [selBox.width / 2, -selBox.height / 2],
        [-selBox.width / 2, selBox.height / 2],
        [selBox.width / 2, selBox.height / 2],
      ];
      const hitCorner = corners.some(([cx, cy]) => Math.hypot(lx - cx, ly - cy) < 18);
      if (hitCorner) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStateRef.current = {
          mode: 'scale',
          clipId: selClip.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          origX: selClip.x,
          origY: selClip.y,
          origScale: selClip.scale,
          boxHalfDiag: Math.max(20, Math.hypot(selBox.width / 2, selBox.height / 2)),
          cx: selBox.cx,
          cy: selBox.cy,
        };
        return;
      }
    }

    // Hit-test topmost layer first (reverse boxes)
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      const clip = project.clips.find((c) => c.id === b.clipId);
      if (!clip) continue;
      const rad = (-b.rotation * Math.PI) / 180;
      const dx = pt.x - b.cx;
      const dy = pt.y - b.cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) <= b.width / 2 && Math.abs(ly) <= b.height / 2) {
        onSelectClip(clip.id);
        if (clip.trackId !== 'video') {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStateRef.current = {
            mode: 'move',
            clipId: clip.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            origX: clip.x,
            origY: clip.y,
            origScale: clip.scale,
            boxHalfDiag: 100,
            cx: b.cx,
            cy: b.cy,
          };
        }
        return;
      }
    }

    onSelectClip(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (drag.mode === 'move') {
      const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
      const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
      let nextX = drag.origX + dxPct;
      let nextY = drag.origY + dyPct;

      const snapX = Math.abs(nextX) < 1.8;
      const snapY = Math.abs(nextY) < 1.8;
      if (snapX) nextX = 0;
      if (snapY) nextY = 0;
      setSnapGuides({ x: snapX, y: snapY });

      onUpdateClipTransform(drag.clipId, {
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
      }, false);
    } else if (drag.mode === 'scale') {
      const pt = getCanvasCoords(e.clientX, e.clientY);
      const dist = Math.hypot(pt.x - drag.cx, pt.y - drag.cy);
      const factor = dist / drag.boxHalfDiag;
      const nextScale = Math.max(0.15, Math.min(4, drag.origScale * factor));
      onUpdateClipTransform(drag.clipId, {
        scale: Math.round(nextScale * 100) / 100,
      }, false);
    }
  };

  const handlePointerUp = () => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      setSnapGuides({ x: false, y: false });
    }
  };

  const handleDoubleClick = () => {
    if (!selectedClipId) return;
    const clip = project.clips.find((c) => c.id === selectedClipId);
    if (clip && clip.kind === 'text' && clip.textStyle) {
      setInlineEditClip(clip);
      setInlineDraft(clip.textStyle.content);
    }
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  };

  const frameStep = 1 / (project.fps || 30);

  return (
    <section
      ref={stageRef}
      className="flex-1 min-w-0 min-h-0 bg-[#0D0F12] flex flex-col justify-between"
    >
      {/* Monitor Canvas Viewport */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-3 flex items-center justify-center relative overflow-hidden"
      >
        <div
          className="relative flex items-center justify-center shadow-2xl border border-[#232833] bg-black"
          style={{
            width: `${boxSize.w}px`,
            height: `${boxSize.h}px`,
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            className="w-full h-full block cursor-crosshair"
          />

          {inlineEditClip && (
            <div className="absolute inset-0 bg-black/65 flex items-center justify-center p-6 z-20">
              <div className="bg-[#181C24] border border-[#2D3442] rounded-lg p-4 w-full max-w-md space-y-3">
                <p className="text-xs font-semibold text-slate-200">Edit Text Layer</p>
                <textarea
                  autoFocus
                  rows={3}
                  value={inlineDraft}
                  onChange={(e) => setInlineDraft(e.target.value)}
                  className="w-full bg-[#0D0F12] border border-[#2E3545] rounded-md p-2.5 text-sm text-white outline-none focus:border-rose-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setInlineEditClip(null)}
                    className="px-3 py-1.5 rounded text-xs font-medium text-slate-300 hover:bg-[#232936]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQuickEditText(inlineEditClip.id, inlineDraft);
                      setInlineEditClip(null);
                    }}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    Apply Text
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transport Controls Bar */}
      <div className="h-10 shrink-0 bg-[#13161C] border-t border-[#242933] px-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-slate-400">
          <span>{dims.width}×{dims.height}</span>
          <span aria-hidden="true">·</span>
          <span>{project.fps} fps</span>
        </div>

        {/* Center Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Jump to Start (Home)"
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - frameStep))}
            title="Previous Frame (Left Arrow)"
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
            className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-colors mx-1 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.min(totalDuration, currentTime + frameStep))}
            title="Next Frame (Right Arrow)"
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(totalDuration)}
            title="Jump to End (End)"
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Right Monitor Options */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleLoop}
            title="Toggle Loop Playback"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isLooping ? 'text-rose-400 bg-rose-500/15' : 'text-slate-400 hover:text-white hover:bg-[#1E232D]'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleMasterMute}
            title={masterMuted ? 'Unmute Master Audio' : 'Mute Master Audio'}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              masterMuted ? 'text-amber-400 bg-amber-500/15' : 'text-slate-400 hover:text-white hover:bg-[#1E232D]'
            }`}
          >
            {masterMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Fullscreen Monitor"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#1E232D] transition-colors cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
