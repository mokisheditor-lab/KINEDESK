import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Diamond,
  Film,
  FlipHorizontal,
  FlipVertical,
  Mic,
  Music,
  Plus,
  RotateCcw,
  Scissors,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Type,
  Wand2,
  Clapperboard,
} from 'lucide-react';
import { COLOR_FILTERS, MOVIE_EFFECT_PRESETS, TRANSITION_PRESETS } from '../data/presets';
import {
  AnimationType,
  ColorFilterId,
  Keyframe,
  MovieEffectId,
  ProjectState,
  TimelineClip,
  TransitionType,
} from '../types/editor';
import { formatTimecode } from '../utils/timecode';

interface InspectorPanelProps {
  project: ProjectState;
  selectedClip: TimelineClip | null;
  currentTime: number;
  onUpdateClip: (clipId: string, updater: (clip: TimelineClip) => TimelineClip, recordHistory?: boolean) => void;
  onUpdateProject: (patch: Partial<ProjectState>) => void;
  onSplitClip: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onSeek: (time: number) => void;
  onQuickAction: (action: 'media' | 'effects' | 'text' | 'audio') => void;
  onVoiceoverRecorded: (blob: Blob, duration: number, startTime: number) => void;
}

type InspectorTab = 'basic' | 'animate' | 'effects' | 'style';

const ANIMATIONS: { id: AnimationType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'pop', label: 'Pop Scale' },
  { id: 'slide-up', label: 'Slide Up' },
  { id: 'slide-down', label: 'Slide Down' },
  { id: 'slide-left', label: 'Slide Left' },
  { id: 'slide-right', label: 'Slide Right' },
  { id: 'spin', label: 'Spin' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  selectedClip,
  currentTime,
  onUpdateClip,
  onUpdateProject,
  onSplitClip,
  onDuplicateClip,
  onDeleteClip,
  onSeek,
  onQuickAction,
  onVoiceoverRecorded,
}) => {
  const [tab, setTab] = useState<InspectorTab>('basic');
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartPlayheadRef = useRef(0);
  const recStartStampRef = useRef(0);
  const recTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedClip) return;
    if (selectedClip.kind === 'text' && tab === 'effects') setTab('style');
    if ((selectedClip.kind === 'audio' || selectedClip.kind === 'effect') && (tab === 'effects' || tab === 'style' || tab === 'animate')) {
      setTab('basic');
    }
  }, [selectedClip?.id, selectedClip?.kind, tab]);

  useEffect(() => {
    return () => {
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    };
  }, []);

  const startVoiceover = async () => {
    setRecError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recChunksRef.current = [];
      recStartPlayheadRef.current = currentTime;
      recStartStampRef.current = performance.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const dur = Math.max(0.5, (performance.now() - recStartStampRef.current) / 1000);
        onVoiceoverRecorded(blob, dur, recStartPlayheadRef.current);
        setIsRecording(false);
        setRecSeconds(0);
        if (recTimerRef.current) window.clearInterval(recTimerRef.current);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecSeconds(0);
      recTimerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 0.1);
      }, 100);
    } catch {
      setRecError('Microphone permission denied or unavailable.');
    }
  };

  const stopVoiceover = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  if (!selectedClip) {
    return (
      <aside className="w-[272px] xl:w-[296px] shrink-0 bg-[#13161C] border-l border-[#242933] flex flex-col min-h-0 overflow-y-auto">
        <div className="h-9 px-3 border-b border-[#242933] flex items-center justify-between shrink-0">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">Studio Hub</h2>
          <span className="text-[11px] text-slate-500">No clip selected</span>
        </div>

        <div className="p-3 space-y-4">
          {/* KineMaster-inspired Quick Media Wheel / Action Grid */}
          <div className="bg-[#171B22] border border-[#252B36] rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-200 mb-2.5">Quick Insert at Playhead</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onQuickAction('media')}
                className="flex items-center gap-2 p-2 rounded-md bg-[#1E232D] hover:bg-rose-500/15 border border-[#2B3240] hover:border-rose-500/60 text-left transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Film className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Media</p>
                  <p className="text-[10px] text-slate-400 truncate">Video & Photo</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onQuickAction('effects')}
                className="flex items-center gap-2 p-2 rounded-md bg-[#1E232D] hover:bg-cyan-500/15 border border-[#2B3240] hover:border-cyan-500/60 text-left transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                  <Clapperboard className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Scene FX</p>
                  <p className="text-[10px] text-slate-400 truncate">Movie Effects</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onQuickAction('text')}
                className="flex items-center gap-2 p-2 rounded-md bg-[#1E232D] hover:bg-amber-500/15 border border-[#2B3240] hover:border-amber-500/60 text-left transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Type className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Title</p>
                  <p className="text-[10px] text-slate-400 truncate">Text Layer</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onQuickAction('audio')}
                className="flex items-center gap-2 p-2 rounded-md bg-[#1E232D] hover:bg-emerald-500/15 border border-[#2B3240] hover:border-emerald-500/60 text-left transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Music className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Audio</p>
                  <p className="text-[10px] text-slate-400 truncate">Music & SFX</p>
                </div>
              </button>

              <button
                type="button"
                onClick={isRecording ? stopVoiceover : startVoiceover}
                className={`col-span-2 flex items-center justify-center gap-2 p-2 rounded-md border text-left transition-colors cursor-pointer ${
                  isRecording
                    ? 'bg-rose-500/20 border-rose-500 text-white'
                    : 'bg-[#1E232D] hover:bg-sky-500/15 border-[#2B3240] hover:border-sky-500/60'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                    isRecording ? 'bg-rose-500 text-white' : 'bg-sky-500/20 text-sky-400'
                  }`}
                >
                  {isRecording ? <Square className="w-3 h-3 fill-current" /> : <Mic className="w-3.5 h-3.5" />}
                </div>
                <span className="text-xs font-medium text-white">
                  {isRecording ? `Stop Recording (${recSeconds.toFixed(1)}s)` : 'Record Voiceover'}
                </span>
              </button>
            </div>
            {recError && <p className="text-[11px] text-rose-400 mt-2">{recError}</p>}
          </div>

          {/* Canvas Settings */}
          <div className="space-y-3 border-t border-[#242933] pt-4">
            <p className="text-xs font-semibold text-slate-200">Project Canvas</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Background Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={project.backgroundColor}
                  onChange={(e) => onUpdateProject({ backgroundColor: e.target.value })}
                  className="w-7 h-7 rounded bg-transparent border border-[#2E3545] cursor-pointer"
                />
                <span className="text-xs font-mono-tabular text-slate-300 uppercase">
                  {project.backgroundColor}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Frame Rate</span>
              <div className="flex items-center gap-1 bg-[#1B1F27] p-0.5 rounded-md border border-[#262C37]">
                {[24, 30, 60].map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => onUpdateProject({ fps })}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono-tabular font-medium cursor-pointer transition-colors ${
                      project.fps === fps ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Shortcuts Cheat Sheet */}
          <div className="space-y-2 border-t border-[#242933] pt-4">
            <p className="text-xs font-semibold text-slate-200">Keyboard Shortcuts</p>
            <div className="space-y-1.5 text-[11px]">
              {[
                ['Play / Pause', 'Space'],
                ['Split Clip at Playhead', 'S'],
                ['Add Keyframe', 'K'],
                ['Step 1 Frame', '← / →'],
                ['Delete Selected Clip', 'Del'],
                ['Undo / Redo', 'Ctrl+Z / Y'],
              ].map(([label, key]) => (
                <div key={label} className="flex items-center justify-between text-slate-400">
                  <span>{label}</span>
                  <kbd className="font-mono-tabular text-[10px] bg-[#1B1F27] border border-[#2B3240] text-slate-200 px-1.5 py-0.5 rounded">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const isEffect = selectedClip.kind === 'effect';
  const isVisual = selectedClip.kind !== 'audio' && !isEffect;
  const isMedia = selectedClip.kind === 'video' || selectedClip.kind === 'image';
  const isText = selectedClip.kind === 'text';
  const isSticker = selectedClip.kind === 'sticker';

  const canSplit =
    currentTime > selectedClip.startTime + 0.08 &&
    currentTime < selectedClip.startTime + selectedClip.duration - 0.08;

  const localTime = Math.max(0, Math.min(selectedClip.duration, currentTime - selectedClip.startTime));
  const isPlayheadInside =
    currentTime >= selectedClip.startTime && currentTime <= selectedClip.startTime + selectedClip.duration;

  const existingKeyframeAtPlayhead = selectedClip.keyframes.find(
    (kf) => Math.abs(kf.timeOffset - localTime) < 0.08
  );

  const handleToggleKeyframe = () => {
    if (!isPlayheadInside) return;
    if (existingKeyframeAtPlayhead) {
      onUpdateClip(selectedClip.id, (c) => ({
        ...c,
        keyframes: c.keyframes.filter((k) => k.id !== existingKeyframeAtPlayhead.id),
      }));
    } else {
      const kf: Keyframe = {
        id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timeOffset: Math.round(localTime * 100) / 100,
        x: selectedClip.x,
        y: selectedClip.y,
        scale: selectedClip.scale,
        rotation: selectedClip.rotation,
        opacity: selectedClip.opacity,
      };
      onUpdateClip(selectedClip.id, (c) => ({
        ...c,
        keyframes: [...c.keyframes, kf].sort((a, b) => a.timeOffset - b.timeOffset),
      }));
    }
  };

  const resetTransform = () => {
    onUpdateClip(selectedClip.id, (c) => ({
      ...c,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 100,
      flipH: false,
      flipV: false,
    }));
  };

  const availableTabs: { id: InspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'basic', label: 'Adjust', icon: Sliders },
    ...(isVisual ? [{ id: 'animate' as const, label: 'Motion', icon: Diamond }] : []),
    ...(isMedia ? [{ id: 'effects' as const, label: 'Color', icon: Wand2 }] : []),
    ...(isText || isSticker ? [{ id: 'style' as const, label: 'Style', icon: Sparkles }] : []),
  ];

  return (
    <aside className="w-[272px] xl:w-[296px] shrink-0 bg-[#13161C] border-l border-[#242933] flex flex-col min-h-0">
      {/* Selected Clip Header */}
      <div className="px-3.5 py-2.5 border-b border-[#242933] space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{selectedClip.name}</p>
            <p className="text-[11px] font-mono-tabular text-slate-400">
              {project.tracks[selectedClip.trackId]?.shortLabel} · {selectedClip.duration.toFixed(2)}s
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!canSplit}
              onClick={() => onSplitClip(selectedClip.id)}
              title="Split Clip at Playhead (S)"
              className="p-1.5 rounded bg-[#1D222C] hover:bg-rose-500 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicateClip(selectedClip.id)}
              title="Duplicate Clip"
              className="p-1.5 rounded bg-[#1D222C] hover:bg-[#2A3140] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteClip(selectedClip.id)}
              title="Delete Clip (Del)"
              className="p-1.5 rounded bg-[#1D222C] hover:bg-rose-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1 bg-[#0E1015] p-1 rounded-md border border-[#232833]">
          {availableTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  active ? 'bg-[#222834] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Inspector Controls */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {tab === 'basic' && (
          <>
            {isEffect && selectedClip.effectConfig && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-200">Movie Scene Effect</p>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Effect Preset</label>
                  <select
                    value={selectedClip.effectConfig.effectId}
                    onChange={(e) => {
                      const nextId = e.target.value as MovieEffectId;
                      const preset = MOVIE_EFFECT_PRESETS.find((p) => p.id === nextId);
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        name: preset?.name || c.name,
                        effectConfig: c.effectConfig
                          ? { ...c.effectConfig, effectId: nextId }
                          : { effectId: nextId, intensity: 75, speed: 1 },
                      }));
                    }}
                    className="w-full bg-[#171B22] border border-[#252B36] rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    {MOVIE_EFFECT_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <SliderRow
                  label="Intensity"
                  valueLabel={`${Math.round(selectedClip.effectConfig.intensity)}%`}
                  min={5}
                  max={100}
                  step={1}
                  value={selectedClip.effectConfig.intensity}
                  onChange={(v) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({
                        ...c,
                        effectConfig: c.effectConfig ? { ...c.effectConfig, intensity: v } : undefined,
                      }),
                      false
                    )
                  }
                />

                <SliderRow
                  label="Effect Speed"
                  valueLabel={`${selectedClip.effectConfig.speed.toFixed(2)}x`}
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={selectedClip.effectConfig.speed}
                  onChange={(v) =>
                    onUpdateClip(
                      selectedClip.id,
                      (c) => ({
                        ...c,
                        effectConfig: c.effectConfig ? { ...c.effectConfig, speed: v } : undefined,
                      }),
                      false
                    )
                  }
                />
              </div>
            )}

            {isVisual && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Transform</span>
                  <button
                    type="button"
                    onClick={resetTransform}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="bg-[#171B22] border border-[#252B36] rounded px-2.5 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">X %</span>
                    <input
                      type="number"
                      step={1}
                      value={Math.round(selectedClip.x)}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({ ...c, x: Number(e.target.value) || 0 }))
                      }
                      className="w-14 bg-transparent text-right font-mono-tabular text-white outline-none"
                    />
                  </label>
                  <label className="bg-[#171B22] border border-[#252B36] rounded px-2.5 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Y %</span>
                    <input
                      type="number"
                      step={1}
                      value={Math.round(selectedClip.y)}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({ ...c, y: Number(e.target.value) || 0 }))
                      }
                      className="w-14 bg-transparent text-right font-mono-tabular text-white outline-none"
                    />
                  </label>
                </div>

                <SliderRow
                  label="Scale"
                  valueLabel={`${Math.round(selectedClip.scale * 100)}%`}
                  min={0.15}
                  max={3}
                  step={0.01}
                  value={selectedClip.scale}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, scale: v }), false)}
                />
                <SliderRow
                  label="Rotation"
                  valueLabel={`${Math.round(selectedClip.rotation)}°`}
                  min={-180}
                  max={180}
                  step={1}
                  value={selectedClip.rotation}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, rotation: v }), false)}
                />
                <SliderRow
                  label="Opacity"
                  valueLabel={`${Math.round(selectedClip.opacity)}%`}
                  min={0}
                  max={100}
                  step={1}
                  value={selectedClip.opacity}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, opacity: v }), false)}
                />

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onUpdateClip(selectedClip.id, (c) => ({ ...c, flipH: !c.flipH }))}
                    className={`flex-1 py-1.5 rounded border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      selectedClip.flipH
                        ? 'bg-rose-500/15 border-rose-500 text-rose-300'
                        : 'bg-[#171B22] border-[#252B36] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span>Flip H</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateClip(selectedClip.id, (c) => ({ ...c, flipV: !c.flipV }))}
                    className={`flex-1 py-1.5 rounded border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      selectedClip.flipV
                        ? 'bg-rose-500/15 border-rose-500 text-rose-300'
                        : 'bg-[#171B22] border-[#252B36] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    <span>Flip V</span>
                  </button>
                </div>

                {selectedClip.trackId === 'video' && isMedia && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-400">Framing</span>
                    <div className="flex items-center gap-1 bg-[#171B22] p-0.5 rounded border border-[#252B36]">
                      {(['cover', 'contain'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onUpdateClip(selectedClip.id, (c) => ({ ...c, fitMode: mode }))}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize cursor-pointer ${
                            selectedClip.fitMode === mode
                              ? 'bg-[#282E3A] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {mode === 'cover' ? 'Fill' : 'Fit'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Playback Speed & Duration */}
            <div className="space-y-3 border-t border-[#242933] pt-3.5">
              <p className="text-xs font-semibold text-slate-200">Timing & Speed</p>
              <SliderRow
                label="Clip Duration"
                valueLabel={`${selectedClip.duration.toFixed(1)}s`}
                min={0.4}
                max={30}
                step={0.1}
                value={selectedClip.duration}
                onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, duration: v }), false)}
              />
              {(selectedClip.kind === 'video' || selectedClip.kind === 'audio') && (
                <SliderRow
                  label="Playback Speed"
                  valueLabel={`${selectedClip.speed.toFixed(2)}x`}
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={selectedClip.speed}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, speed: v }), false)}
                />
              )}
            </div>

            {/* Audio Mixing for Video / Audio clips */}
            {(selectedClip.kind === 'video' || selectedClip.kind === 'audio') && (
              <div className="space-y-3 border-t border-[#242933] pt-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Audio Mixer</span>
                  <button
                    type="button"
                    onClick={() => onUpdateClip(selectedClip.id, (c) => ({ ...c, muted: !c.muted }))}
                    className={`text-[11px] px-2 py-0.5 rounded border cursor-pointer ${
                      selectedClip.muted
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-[#171B22] border-[#252B36] text-slate-300'
                    }`}
                  >
                    {selectedClip.muted ? 'Muted' : 'Active'}
                  </button>
                </div>

                <SliderRow
                  label="Volume"
                  valueLabel={`${Math.round(selectedClip.volume)}%`}
                  min={0}
                  max={200}
                  step={1}
                  value={selectedClip.volume}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, volume: v }), false)}
                />
                <SliderRow
                  label="Audio Fade In"
                  valueLabel={`${selectedClip.fadeInAudio.toFixed(1)}s`}
                  min={0}
                  max={3}
                  step={0.1}
                  value={selectedClip.fadeInAudio}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, fadeInAudio: v }), false)}
                />
                <SliderRow
                  label="Audio Fade Out"
                  valueLabel={`${selectedClip.fadeOutAudio.toFixed(1)}s`}
                  min={0}
                  max={3}
                  step={0.1}
                  value={selectedClip.fadeOutAudio}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, fadeOutAudio: v }), false)}
                />
              </div>
            )}

            {/* Incoming Transition for V1 clips */}
            {selectedClip.trackId === 'video' && (
              <div className="space-y-2.5 border-t border-[#242933] pt-3.5">
                <p className="text-xs font-semibold text-slate-200">Incoming Transition</p>
                <select
                  value={selectedClip.transitionIn}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      transitionIn: e.target.value as TransitionType,
                    }))
                  }
                  className="w-full bg-[#171B22] border border-[#252B36] rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-rose-500"
                >
                  {TRANSITION_PRESETS.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.label}
                    </option>
                  ))}
                </select>
                {selectedClip.transitionIn !== 'none' && (
                  <SliderRow
                    label="Transition Duration"
                    valueLabel={`${selectedClip.transitionDuration.toFixed(1)}s`}
                    min={0.2}
                    max={2.0}
                    step={0.1}
                    value={selectedClip.transitionDuration}
                    onChange={(v) =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, transitionDuration: v }), false)
                    }
                  />
                )}
              </div>
            )}
          </>
        )}

        {tab === 'animate' && (
          <div className="space-y-4">
            {/* In / Out Animations */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-200">In Animation</p>
              <select
                value={selectedClip.inAnimation}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    inAnimation: e.target.value as AnimationType,
                  }))
                }
                className="w-full bg-[#171B22] border border-[#252B36] rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-rose-500"
              >
                {ANIMATIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              {selectedClip.inAnimation !== 'none' && (
                <SliderRow
                  label="In Duration"
                  valueLabel={`${selectedClip.inDuration.toFixed(2)}s`}
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={selectedClip.inDuration}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, inDuration: v }), false)}
                />
              )}
            </div>

            <div className="space-y-2.5 border-t border-[#242933] pt-3.5">
              <p className="text-xs font-semibold text-slate-200">Out Animation</p>
              <select
                value={selectedClip.outAnimation}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    outAnimation: e.target.value as AnimationType,
                  }))
                }
                className="w-full bg-[#171B22] border border-[#252B36] rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-rose-500"
              >
                {ANIMATIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              {selectedClip.outAnimation !== 'none' && (
                <SliderRow
                  label="Out Duration"
                  valueLabel={`${selectedClip.outDuration.toFixed(2)}s`}
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={selectedClip.outDuration}
                  onChange={(v) => onUpdateClip(selectedClip.id, (c) => ({ ...c, outDuration: v }), false)}
                />
              )}
            </div>

            {/* KineMaster Keyframe Animator */}
            <div className="space-y-3 border-t border-[#242933] pt-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-200">Keyframes</p>
                <button
                  type="button"
                  disabled={!isPlayheadInside}
                  onClick={handleToggleKeyframe}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
                    existingKeyframeAtPlayhead
                      ? 'bg-rose-500 text-white'
                      : 'bg-[#222834] hover:bg-rose-500 text-slate-200 hover:text-white'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  <span>{existingKeyframeAtPlayhead ? 'Remove Key' : 'Add Keyframe'}</span>
                </button>
              </div>

              {!isPlayheadInside && (
                <p className="text-[11px] text-slate-400">
                  Move the playhead inside this clip to add keyframes for smooth motion.
                </p>
              )}

              {selectedClip.keyframes.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No keyframes yet. Position the playhead, click Add Keyframe, then move or scale the layer at another timestamp.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedClip.keyframes.map((kf, i) => (
                    <div
                      key={kf.id}
                      className="flex items-center justify-between bg-[#171B22] border border-[#252B36] rounded px-2.5 py-1.5 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSeek(selectedClip.startTime + kf.timeOffset)}
                        className="flex items-center gap-2 text-slate-200 hover:text-rose-400 cursor-pointer"
                      >
                        <Diamond className="w-3 h-3 text-rose-400 fill-rose-400" />
                        <span className="font-mono-tabular">
                          #{i + 1} · {formatTimecode(kf.timeOffset, project.fps)}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 text-slate-400 font-mono-tabular">
                        <span>{Math.round(kf.scale * 100)}%</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateClip(selectedClip.id, (c) => ({
                              ...c,
                              keyframes: c.keyframes.filter((k) => k.id !== kf.id),
                            }))
                          }
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'effects' && isMedia && (
          <div className="space-y-4">
            {/* Color Filters & Adjustments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-200">Color Grading</p>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      color: {
                        filterId: 'none',
                        brightness: 0,
                        contrast: 0,
                        saturation: 0,
                        blur: 0,
                        vignette: 0,
                      },
                    }))
                  }
                  className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <select
                value={selectedClip.color.filterId}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    color: { ...c.color, filterId: e.target.value as ColorFilterId },
                  }))
                }
                className="w-full bg-[#171B22] border border-[#252B36] rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-rose-500"
              >
                {COLOR_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>

              <SliderRow
                label="Brightness"
                valueLabel={`${selectedClip.color.brightness}`}
                min={-60}
                max={60}
                step={1}
                value={selectedClip.color.brightness}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, color: { ...c.color, brightness: v } }), false)
                }
              />
              <SliderRow
                label="Contrast"
                valueLabel={`${selectedClip.color.contrast}`}
                min={-60}
                max={60}
                step={1}
                value={selectedClip.color.contrast}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, color: { ...c.color, contrast: v } }), false)
                }
              />
              <SliderRow
                label="Saturation"
                valueLabel={`${selectedClip.color.saturation}`}
                min={-100}
                max={100}
                step={1}
                value={selectedClip.color.saturation}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, color: { ...c.color, saturation: v } }), false)
                }
              />
              <SliderRow
                label="Blur"
                valueLabel={`${selectedClip.color.blur}px`}
                min={0}
                max={15}
                step={0.5}
                value={selectedClip.color.blur}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, color: { ...c.color, blur: v } }), false)
                }
              />
              <SliderRow
                label="Vignette"
                valueLabel={`${selectedClip.color.vignette}%`}
                min={0}
                max={100}
                step={1}
                value={selectedClip.color.vignette}
                onChange={(v) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, color: { ...c.color, vignette: v } }), false)
                }
              />
            </div>

            {/* Chroma Key (Green Screen) */}
            <div className="space-y-3 border-t border-[#242933] pt-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-200">Chroma Key</p>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      chromaKey: { ...c.chromaKey, enabled: !c.chromaKey.enabled },
                    }))
                  }
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                    selectedClip.chromaKey.enabled
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[#1C212B] text-slate-400 hover:text-white'
                  }`}
                >
                  {selectedClip.chromaKey.enabled ? 'Enabled' : 'Off'}
                </button>
              </div>

              {selectedClip.chromaKey.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Key Color</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedClip.chromaKey.keyColor}
                        onChange={(e) =>
                          onUpdateClip(selectedClip.id, (c) => ({
                            ...c,
                            chromaKey: { ...c.chromaKey, keyColor: e.target.value },
                          }))
                        }
                        className="w-7 h-7 rounded bg-transparent border border-[#2E3545] cursor-pointer"
                      />
                      <span className="text-xs font-mono-tabular text-slate-300 uppercase">
                        {selectedClip.chromaKey.keyColor}
                      </span>
                    </div>
                  </div>
                  <SliderRow
                    label="Tolerance"
                    valueLabel={`${selectedClip.chromaKey.similarity}%`}
                    min={5}
                    max={90}
                    step={1}
                    value={selectedClip.chromaKey.similarity}
                    onChange={(v) =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, chromaKey: { ...c.chromaKey, similarity: v } }),
                        false
                      )
                    }
                  />
                  <SliderRow
                    label="Edge Feather"
                    valueLabel={`${selectedClip.chromaKey.smoothness}%`}
                    min={0}
                    max={80}
                    step={1}
                    value={selectedClip.chromaKey.smoothness}
                    onChange={(v) =>
                      onUpdateClip(
                        selectedClip.id,
                        (c) => ({ ...c, chromaKey: { ...c.chromaKey, smoothness: v } }),
                        false
                      )
                    }
                  />
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'style' && isText && selectedClip.textStyle && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">Text Content</label>
              <textarea
                rows={3}
                value={selectedClip.textStyle.content}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    name: e.target.value.slice(0, 28) || 'Text Layer',
                    textStyle: c.textStyle ? { ...c.textStyle, content: e.target.value } : undefined,
                  }))
                }
                className="w-full bg-[#171B22] border border-[#252B36] focus:border-rose-500 rounded-md p-2 text-xs text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Font Family</label>
                <select
                  value={selectedClip.textStyle.fontFamily}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      textStyle: c.textStyle
                        ? { ...c.textStyle, fontFamily: e.target.value as NonNullable<TimelineClip['textStyle']>['fontFamily'] }
                        : undefined,
                    }))
                  }
                  className="w-full bg-[#171B22] border border-[#252B36] rounded px-2 py-1.5 text-xs text-white outline-none"
                >
                  <option value="Plus Jakarta Sans">Plus Jakarta</option>
                  <option value="DM Sans">DM Sans</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Georgia">Georgia Serif</option>
                  <option value="Impact">Impact Bold</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Alignment</label>
                <div className="flex bg-[#171B22] border border-[#252B36] rounded p-0.5">
                  {(['left', 'center', 'right'] as const).map((al) => {
                    const Icon = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight;
                    return (
                      <button
                        key={al}
                        type="button"
                        onClick={() =>
                          onUpdateClip(selectedClip.id, (c) => ({
                            ...c,
                            textStyle: c.textStyle ? { ...c.textStyle, align: al } : undefined,
                          }))
                        }
                        className={`flex-1 py-1 rounded flex justify-center cursor-pointer ${
                          selectedClip.textStyle?.align === al
                            ? 'bg-[#282E3A] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <SliderRow
              label="Font Size"
              valueLabel={`${selectedClip.textStyle.fontSize}px`}
              min={16}
              max={120}
              step={1}
              value={selectedClip.textStyle.fontSize}
              onChange={(v) =>
                onUpdateClip(
                  selectedClip.id,
                  (c) => ({ ...c, textStyle: c.textStyle ? { ...c.textStyle, fontSize: v } : undefined }),
                  false
                )
              }
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between bg-[#171B22] border border-[#252B36] rounded px-2.5 py-1.5">
                <span className="text-[11px] text-slate-300">Text</span>
                <input
                  type="color"
                  value={selectedClip.textStyle.color}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      textStyle: c.textStyle ? { ...c.textStyle, color: e.target.value } : undefined,
                    }))
                  }
                  className="w-6 h-6 rounded bg-transparent cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between bg-[#171B22] border border-[#252B36] rounded px-2.5 py-1.5">
                <span className="text-[11px] text-slate-300">Outline</span>
                <input
                  type="color"
                  value={selectedClip.textStyle.strokeColor}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      textStyle: c.textStyle ? { ...c.textStyle, strokeColor: e.target.value } : undefined,
                    }))
                  }
                  className="w-6 h-6 rounded bg-transparent cursor-pointer"
                />
              </div>
            </div>

            <SliderRow
              label="Outline Width"
              valueLabel={`${selectedClip.textStyle.strokeWidth}px`}
              min={0}
              max={12}
              step={1}
              value={selectedClip.textStyle.strokeWidth}
              onChange={(v) =>
                onUpdateClip(
                  selectedClip.id,
                  (c) => ({ ...c, textStyle: c.textStyle ? { ...c.textStyle, strokeWidth: v } : undefined }),
                  false
                )
              }
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-300">Background Box</span>
              <input
                type="color"
                value={selectedClip.textStyle.backgroundColor}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    textStyle: c.textStyle ? { ...c.textStyle, backgroundColor: e.target.value } : undefined,
                  }))
                }
                className="w-6 h-6 rounded bg-transparent cursor-pointer"
              />
            </div>

            <SliderRow
              label="Box Opacity"
              valueLabel={`${selectedClip.textStyle.backgroundOpacity}%`}
              min={0}
              max={100}
              step={2}
              value={selectedClip.textStyle.backgroundOpacity}
              onChange={(v) =>
                onUpdateClip(
                  selectedClip.id,
                  (c) => ({
                    ...c,
                    textStyle: c.textStyle ? { ...c.textStyle, backgroundOpacity: v } : undefined,
                  }),
                  false
                )
              }
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Drop Shadow</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateClip(selectedClip.id, (c) => ({
                    ...c,
                    textStyle: c.textStyle ? { ...c.textStyle, shadow: !c.textStyle.shadow } : undefined,
                  }))
                }
                className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                  selectedClip.textStyle.shadow
                    ? 'bg-rose-500 text-white'
                    : 'bg-[#171B22] text-slate-400 border border-[#252B36]'
                }`}
              >
                {selectedClip.textStyle.shadow ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        )}

        {tab === 'style' && isSticker && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-200">Sticker Accent Color</p>
            <div className="flex items-center justify-between bg-[#171B22] border border-[#252B36] rounded px-3 py-2">
              <span className="text-xs text-slate-300">Color</span>
              <input
                type="color"
                value={selectedClip.stickerColor || '#F43F5E'}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, (c) => ({ ...c, stickerColor: e.target.value }))
                }
                className="w-8 h-8 rounded bg-transparent cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

interface SliderRowProps {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono-tabular text-slate-200">{valueLabel}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full studio-slider"
    />
  </div>
);
