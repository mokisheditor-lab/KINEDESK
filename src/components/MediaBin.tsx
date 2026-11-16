import React, { useRef, useState } from 'react';
import {
  ArrowRightLeft,
  AudioLines,
  Film,
  Image as ImageIcon,
  Layers,
  Music,
  Play,
  Plus,
  Sparkles,
  Square,
  Sticker,
  Type,
  Upload,
  Check,
  Clapperboard,
} from 'lucide-react';
import {
  COLOR_FILTERS,
  MOVIE_EFFECT_PRESETS,
  MovieEffectPreset,
  STICKER_PRESETS,
  TEXT_PRESETS,
  TRANSITION_PRESETS,
  TextPreset,
} from '../data/presets';
import {
  ColorFilterId,
  MediaAsset,
  StickerShape,
  TimelineClip,
  TransitionType,
} from '../types/editor';
import { formatShortTime } from '../utils/timecode';

export type BinTab = 'media' | 'effects' | 'text' | 'stickers' | 'audio' | 'filters' | 'transitions';

interface MediaBinProps {
  activeTab: BinTab;
  onTabChange: (tab: BinTab) => void;
  mediaAssets: MediaAsset[];
  audioAssets: MediaAsset[];
  selectedClip: TimelineClip | null;
  onImportFiles: (files: FileList) => void;
  onAddMediaClip: (asset: MediaAsset, targetTrack: 'video' | 'overlay' | 'audio') => void;
  onAddEffectPreset: (preset: MovieEffectPreset) => void;
  onAddTextPreset: (preset: TextPreset) => void;
  onAddSticker: (shape: StickerShape, label: string, color: string) => void;
  onApplyFilter: (filterId: ColorFilterId) => void;
  onApplyTransition: (transition: TransitionType) => void;
}

const TABS: { id: BinTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'effects', label: 'Effects', icon: Clapperboard },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: Sticker },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'filters', label: 'Filters', icon: Sparkles },
  { id: 'transitions', label: 'Trans', icon: ArrowRightLeft },
];

export const MediaBin: React.FC<MediaBinProps> = ({
  activeTab,
  onTabChange,
  mediaAssets,
  audioAssets,
  selectedClip,
  onImportFiles,
  onAddMediaClip,
  onAddEffectPreset,
  onAddTextPreset,
  onAddSticker,
  onApplyFilter,
  onApplyTransition,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewingAudioId, setPreviewingAudioId] = useState<string | null>(null);
  const previewAudioEl = useRef<HTMLAudioElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [effectCategory, setEffectCategory] = useState<'all' | MovieEffectPreset['category']>('all');

  const togglePreviewAudio = (asset: MediaAsset) => {
    if (previewingAudioId === asset.id) {
      previewAudioEl.current?.pause();
      setPreviewingAudioId(null);
      return;
    }
    if (previewAudioEl.current) {
      previewAudioEl.current.pause();
    }
    const el = new Audio(asset.src);
    el.onended = () => setPreviewingAudioId(null);
    void el.play().catch(() => {});
    previewAudioEl.current = el;
    setPreviewingAudioId(asset.id);
  };

  const filteredEffects =
    effectCategory === 'all'
      ? MOVIE_EFFECT_PRESETS
      : MOVIE_EFFECT_PRESETS.filter((e) => e.category === effectCategory);

  return (
    <aside className="w-[272px] xl:w-[296px] shrink-0 bg-[#13161C] border-r border-[#242933] flex flex-col min-h-0">
      {/* Vertical icon + label rail + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left compact vertical rail */}
        <nav className="w-[54px] shrink-0 bg-[#101217] border-r border-[#242933] py-1.5 flex flex-col items-center gap-1 overflow-y-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={`w-[46px] py-1.5 rounded-md flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1A1E26]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium leading-none">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Bin Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="h-9 px-3 border-b border-[#242933] flex items-center justify-between shrink-0">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
              {activeTab === 'media' && 'Project Media'}
              {activeTab === 'effects' && 'Movie Scene FX'}
              {activeTab === 'text' && 'Titles & Text'}
              {activeTab === 'stickers' && 'Vector Overlays'}
              {activeTab === 'audio' && 'Audio & SFX'}
              {activeTab === 'filters' && 'Color Presets'}
              {activeTab === 'transitions' && 'Cut Transitions'}
            </h2>
            {(activeTab === 'media' || activeTab === 'audio') && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>Import</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onImportFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
            {activeTab === 'media' && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files?.length) {
                      onImportFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                    isDragOver
                      ? 'border-rose-500 bg-rose-500/10'
                      : 'border-[#2D3340] hover:border-slate-500 bg-[#171B22]'
                  }`}
                >
                  <Upload className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-medium text-slate-200">Import Video, Image, Audio</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Drop local files or click to browse</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {mediaAssets.map((asset) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/kinedeck-asset', JSON.stringify(asset));
                      }}
                      className="group bg-[#181C24] border border-[#252B36] hover:border-slate-500 rounded-md overflow-hidden flex flex-col transition-colors"
                    >
                      <div className="relative aspect-video bg-[#0D0F12] overflow-hidden">
                        {asset.thumbnail ? (
                          <img
                            src={asset.thumbnail}
                            alt={asset.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            {asset.kind === 'video' ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/75 text-[10px] font-mono-tabular text-slate-200 px-1 py-0.5 rounded">
                          {formatShortTime(asset.duration)}
                        </span>
                      </div>
                      <div className="p-1.5 flex flex-col gap-1.5">
                        <p className="text-[11px] font-medium text-slate-200 truncate" title={asset.name}>
                          {asset.name}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onAddMediaClip(asset, 'video')}
                            title="Add to Main Track (V1)"
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#232936] hover:bg-rose-500 text-[10px] font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>V1</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddMediaClip(asset, 'overlay')}
                            title="Add as Overlay Layer (V2)"
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#232936] hover:bg-violet-500 text-[10px] font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                          >
                            <Layers className="w-3 h-3" />
                            <span>PIP</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'text' && (
              <div className="space-y-2">
                {TEXT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onAddTextPreset(preset)}
                    className="w-full text-left bg-[#181C24] hover:bg-[#1F242E] border border-[#252B36] hover:border-amber-500/60 rounded-md p-2.5 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-200">{preset.label}</span>
                      <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400" />
                    </div>
                    <div className="bg-[#0D0F12] rounded px-2 py-2 text-center truncate text-xs font-semibold text-white">
                      {preset.previewText}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'stickers' && (
              <div className="grid grid-cols-2 gap-2">
                {STICKER_PRESETS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onAddSticker(st.id, st.label, st.defaultColor)}
                    className="bg-[#181C24] hover:bg-[#1F242E] border border-[#252B36] hover:border-violet-500/60 rounded-md p-3 flex flex-col items-center gap-2 transition-colors cursor-pointer"
                  >
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center border border-[#2D3340]"
                      style={{ color: st.defaultColor }}
                    >
                      <Sticker className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-200 text-center leading-tight">
                      {st.label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border border-dashed border-[#2D3340] hover:border-emerald-500/60 bg-[#171B22] rounded-md py-2.5 px-3 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Import MP3 / WAV / OGG</span>
                </button>

                {audioAssets.map((asset) => {
                  const isPreviewing = previewingAudioId === asset.id;
                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/kinedeck-asset', JSON.stringify(asset));
                      }}
                      className="bg-[#181C24] border border-[#252B36] rounded-md p-2 flex items-center gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => togglePreviewAudio(asset)}
                        className={`w-7 h-7 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                          isPreviewing
                            ? 'bg-emerald-500 text-white'
                            : 'bg-[#232936] text-slate-300 hover:text-white'
                        }`}
                        title={isPreviewing ? 'Stop preview' : 'Preview audio'}
                      >
                        {isPreviewing ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{asset.name}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono-tabular">
                          <AudioLines className="w-3 h-3 text-emerald-400" />
                          <span>{formatShortTime(asset.duration)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAddMediaClip(asset, 'audio')}
                        title="Add to Audio Track (A1)"
                        className="p-1.5 rounded bg-[#232936] hover:bg-emerald-500 text-slate-200 hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'filters' && (
              <div className="space-y-2">
                {!selectedClip || (selectedClip.kind !== 'video' && selectedClip.kind !== 'image') ? (
                  <div className="bg-[#181C24] border border-[#252B36] rounded-md p-3 text-xs text-slate-400">
                    Select a video or image clip on the timeline to apply a color grade preset.
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  {COLOR_FILTERS.map((f) => {
                    const isActive = selectedClip?.color.filterId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!selectedClip || (selectedClip.kind !== 'video' && selectedClip.kind !== 'image')}
                        onClick={() => onApplyFilter(f.id)}
                        className={`rounded-md border p-2 text-left transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
                          isActive
                            ? 'bg-rose-500/15 border-rose-500 text-white'
                            : 'bg-[#181C24] border-[#252B36] hover:border-slate-500 text-slate-300'
                        }`}
                      >
                        <div
                          className="h-9 rounded mb-1.5 border border-white/10"
                          style={{ background: f.swatch }}
                        />
                        <p className="text-[11px] font-medium truncate">{f.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'transitions' && (
              <div className="space-y-2">
                {!selectedClip || selectedClip.trackId !== 'video' ? (
                  <div className="bg-[#181C24] border border-[#252B36] rounded-md p-3 text-xs text-slate-400">
                    Select a Main Video (V1) clip (or click a transition marker between clips) to set its incoming transition.
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  {TRANSITION_PRESETS.map((tr) => {
                    const isActive = selectedClip?.transitionIn === tr.id;
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        disabled={!selectedClip || selectedClip.trackId !== 'video'}
                        onClick={() => onApplyTransition(tr.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
                          isActive
                            ? 'bg-rose-500/15 border-rose-500 text-white'
                            : 'bg-[#181C24] border-[#252B36] hover:border-slate-500 text-slate-300'
                        }`}
                      >
                        <span>{tr.label}</span>
                        <div className="flex items-center gap-1.5">
                          {isActive && <Check className="w-3.5 h-3.5 text-rose-400" />}
                          <span className="text-[10px] font-mono-tabular text-slate-500">
                            {tr.id === 'none' ? '0.0s' : '0.7s'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'effects' && (
              <div className="space-y-2.5">
                {/* Category Filter Tabs */}
                <div className="flex flex-wrap gap-1 bg-[#0E1015] p-1 rounded-md border border-[#232833]">
                  {(
                    [
                      ['all', 'All'],
                      ['cinema', 'Cinema'],
                      ['retro', 'Retro'],
                      ['action', 'Action'],
                      ['atmosphere', 'Weather'],
                    ] as const
                  ).map(([cat, label]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEffectCategory(cat)}
                      className={`px-2 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                        effectCategory === cat
                          ? 'bg-rose-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {filteredEffects.map((fx) => (
                    <div
                      key={fx.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/kinedeck-effect', JSON.stringify(fx));
                      }}
                      className="bg-[#181C24] border border-[#252B36] hover:border-cyan-500/60 rounded-md overflow-hidden flex flex-col transition-colors group"
                    >
                      <div
                        className="h-11 relative flex items-end p-1.5"
                        style={{ background: fx.swatch }}
                      >
                        <button
                          type="button"
                          onClick={() => onAddEffectPreset(fx)}
                          title="Add Effect to FX Track"
                          className="ml-auto px-1.5 py-0.5 rounded bg-black/70 hover:bg-cyan-500 text-[10px] font-semibold text-white flex items-center gap-0.5 cursor-pointer transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>FX</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddEffectPreset(fx)}
                        className="p-1.5 text-left cursor-pointer"
                      >
                        <p className="text-[11px] font-medium text-slate-100 truncate">{fx.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{fx.description}</p>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
