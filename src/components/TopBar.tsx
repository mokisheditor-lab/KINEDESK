import React, { useState } from 'react';
import { Download, Film, FolderPlus, Redo2, Undo2 } from 'lucide-react';
import { AspectRatio } from '../types/editor';
import { formatTimecode } from '../utils/timecode';

interface TopBarProps {
  title: string;
  aspectRatio: AspectRatio;
  currentTime: number;
  totalDuration: number;
  fps: number;
  canUndo: boolean;
  canRedo: boolean;
  onChangeTitle: (title: string) => void;
  onChangeAspectRatio: (ar: AspectRatio) => void;
  onUndo: () => void;
  onRedo: () => void;
  onNewProject: () => void;
  onOpenExport: () => void;
}

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9 Widescreen' },
  { value: '16:10', label: '16:10 Laptop (14.5")' },
  { value: '9:16', label: '9:16 Vertical' },
  { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '21:9', label: '21:9 Cinema' },
];

export const TopBar: React.FC<TopBarProps> = ({
  title,
  aspectRatio,
  currentTime,
  totalDuration,
  fps,
  canUndo,
  canRedo,
  onChangeTitle,
  onChangeAspectRatio,
  onUndo,
  onRedo,
  onNewProject,
  onOpenExport,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <header className="h-11 shrink-0 bg-[#13161C] border-b border-[#242933] px-3.5 flex items-center justify-between gap-4">
      {/* Zone 1: Brand + Project Meta */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-md bg-rose-500 flex items-center justify-center text-white">
            <Film className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base tracking-tight text-white whitespace-nowrap">
            KineDeck
          </span>
        </div>

        <span className="h-4 w-px bg-[#2A303C] shrink-0" aria-hidden="true" />

        {editingTitle ? (
          <input
            type="text"
            value={title}
            autoFocus
            onChange={(e) => onChangeTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false);
            }}
            className="bg-[#1C212B] border border-rose-500/60 rounded px-2 py-0.5 text-sm text-white outline-none w-52"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            title="Click to rename project"
            className="text-sm text-slate-200 hover:text-white truncate max-w-[200px] text-left px-1.5 py-0.5 rounded hover:bg-[#1C212B] transition-colors"
          >
            {title || 'Untitled Project'}
          </button>
        )}

        <select
          aria-label="Canvas Aspect Ratio"
          value={aspectRatio}
          onChange={(e) => onChangeAspectRatio(e.target.value as AspectRatio)}
          className="bg-[#1B1F27] border border-[#2A303C] rounded-md px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-500 focus:outline-none focus:border-rose-500 transition-colors cursor-pointer shrink-0"
        >
          {ASPECT_RATIOS.map((ar) => (
            <option key={ar.value} value={ar.value}>
              {ar.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onNewProject}
          title="Start a blank project"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1E232D] transition-colors whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span>New Blank</span>
        </button>
      </div>

      {/* Zone 2: History & Timecode */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#1E232D] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#1E232D] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 font-mono-tabular text-xs bg-[#0D0F12] border border-[#242933] rounded-md px-3 py-1">
          <span className="text-rose-400 font-medium">{formatTimecode(currentTime, fps)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTimecode(totalDuration, fps)}</span>
        </div>
      </div>

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};
