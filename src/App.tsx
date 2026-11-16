import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { BinTab, MediaBin } from './components/MediaBin';
import { ProgramMonitor } from './components/ProgramMonitor';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import {
  createBaseClip,
  createInitialProject,
  INITIAL_MEDIA_ASSETS,
  MovieEffectPreset,
  TextPreset,
} from './data/presets';
import {
  AspectRatio,
  ColorFilterId,
  Keyframe,
  MediaAsset,
  ProjectState,
  StickerShape,
  TimelineClip,
  TrackId,
  TransitionType,
} from './types/editor';
import {
  BUILTIN_AUDIO_PRESETS,
  decodeAudioWaveform,
  generateBuiltInAudioAsset,
  sharedAudioEngine,
} from './utils/audioEngine';
import { getCanvasDimensions, renderFrameToCanvas } from './utils/canvasRenderer';
import { getProjectDuration } from './utils/timecode';

const MAX_HISTORY = 40;

export default function App() {
  const [project, setProject] = useState<ProjectState>(() => createInitialProject());
  const [past, setPast] = useState<ProjectState[]>([]);
  const [future, setFuture] = useState<ProjectState[]>([]);

  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_MEDIA_ASSETS);
  const [audioAssets, setAudioAssets] = useState<MediaAsset[]>([]);

  const [activeBinTab, setActiveBinTab] = useState<BinTab>('effects');
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-v1-tokyo');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [masterMuted, setMasterMuted] = useState(false);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(70);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

  const projectRef = useRef(project);
  projectRef.current = project;

  const totalDuration = useMemo(() => getProjectDuration(project.clips), [project.clips]);
  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipId) || null,
    [project.clips, selectedClipId]
  );

  // Initialize procedural built-in audio tracks + place default soundtrack on starter project
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const generated: MediaAsset[] = [];
      for (const preset of BUILTIN_AUDIO_PRESETS) {
        const res = await generateBuiltInAudioAsset(preset);
        if (cancelled) return;
        generated.push({
          id: preset.id,
          name: preset.name,
          kind: 'audio',
          src: res.src,
          duration: res.duration,
          waveform: res.waveform,
          isBuiltIn: true,
        });
      }
      if (cancelled) return;
      setAudioAssets(generated);

      const defaultTrack = generated.find((a) => a.id === 'audio-lofi-beat');
      if (defaultTrack) {
        setProject((prev) => {
          // Only attach if starter project has no audio clips yet
          if (prev.clips.some((c) => c.kind === 'audio')) return prev;
          const musicClip = createBaseClip({
            id: 'clip-a1-lofi',
            trackId: 'audio',
            kind: 'audio',
            name: defaultTrack.name,
            assetId: defaultTrack.id,
            src: defaultTrack.src,
            waveform: defaultTrack.waveform,
            startTime: 0,
            duration: 13.0,
            sourceDuration: defaultTrack.duration,
            volume: 85,
            fadeInAudio: 0.8,
            fadeOutAudio: 1.5,
          });
          return { ...prev, clips: [...prev.clips, musicClip] };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commitProjectChange = useCallback(
    (updater: (prev: ProjectState) => ProjectState, recordHistory = true) => {
      setProject((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        if (recordHistory) {
          setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), prev]);
          setFuture([]);
        }
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [projectRef.current, ...f]);
      setProject(previous);
      return p.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, projectRef.current]);
      setProject(next);
      return f.slice(1);
    });
  }, []);

  // Playback loop
  const playStartPerfRef = useRef(0);
  const playStartTimeRef = useRef(0);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    sharedAudioEngine.stopAll();
  }, []);

  const startPlayback = useCallback(
    async (fromTime: number) => {
      const dur = getProjectDuration(projectRef.current.clips);
      if (dur <= 0.05) return;
      const startT = fromTime >= dur - 0.03 ? 0 : fromTime;
      setCurrentTime(startT);
      playStartTimeRef.current = startT;
      playStartPerfRef.current = performance.now();
      setIsPlaying(true);

      const mutedTracks = new Set<string>(
        Object.values(projectRef.current.tracks)
          .filter((t) => t.muted)
          .map((t) => t.id)
      );
      await sharedAudioEngine.startPlayback(
        projectRef.current.clips,
        startT,
        mutedTracks,
        masterMuted
      );
    },
    [masterMuted]
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      void startPlayback(currentTime);
    }
  }, [isPlaying, currentTime, startPlayback, stopPlayback]);

  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;

    const tick = () => {
      const elapsed = (performance.now() - playStartPerfRef.current) / 1000;
      const nextTime = playStartTimeRef.current + elapsed;
      const dur = getProjectDuration(projectRef.current.clips);

      if (nextTime >= dur) {
        if (isLooping && dur > 0.05) {
          playStartTimeRef.current = 0;
          playStartPerfRef.current = performance.now();
          setCurrentTime(0);
          const mutedTracks = new Set<string>(
            Object.values(projectRef.current.tracks)
              .filter((t) => t.muted)
              .map((t) => t.id)
          );
          void sharedAudioEngine.startPlayback(
            projectRef.current.clips,
            0,
            mutedTracks,
            masterMuted
          );
        } else {
          setCurrentTime(dur);
          stopPlayback();
          return;
        }
      } else {
        setCurrentTime(nextTime);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isLooping, masterMuted, stopPlayback]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, time);
      setCurrentTime(clamped);
      if (isPlaying) {
        void startPlayback(clamped);
      }
    },
    [isPlaying, startPlayback]
  );

  const handleToggleMasterMute = useCallback(() => {
    setMasterMuted((m) => {
      const next = !m;
      sharedAudioEngine.setMasterMuted(next);
      return next;
    });
  }, []);

  // Import local video / image / audio files
  const handleImportFiles = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const url = URL.createObjectURL(file);
      const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = url;
        await new Promise((res) => {
          img.onload = res;
          img.onerror = res;
        });
        setMediaAssets((prev) => [
          {
            id,
            name: file.name,
            kind: 'image',
            src: url,
            duration: 5.0,
            width: img.naturalWidth || 1280,
            height: img.naturalHeight || 720,
            thumbnail: url,
          },
          ...prev,
        ]);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        await new Promise((res) => {
          video.onloadeddata = res;
          video.onerror = res;
        });
        video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1);
        await new Promise((res) => {
          video.onseeked = res;
          setTimeout(res, 350);
        });
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 320;
        thumbCanvas.height = 180;
        const tctx = thumbCanvas.getContext('2d');
        if (tctx && video.videoWidth > 0) {
          tctx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
        }
        const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.75);
        const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 5.0;

        setMediaAssets((prev) => [
          {
            id,
            name: file.name,
            kind: 'video',
            src: url,
            duration: dur,
            width: video.videoWidth || 1280,
            height: video.videoHeight || 720,
            thumbnail,
          },
          ...prev,
        ]);
      } else if (file.type.startsWith('audio/')) {
        const { duration, waveform } = await decodeAudioWaveform(url, 80);
        setAudioAssets((prev) => [
          {
            id,
            name: file.name,
            kind: 'audio',
            src: url,
            duration: Math.max(0.5, duration),
            waveform,
          },
          ...prev,
        ]);
      }
    }
  }, []);

  const handleAddMediaClip = useCallback(
    (asset: MediaAsset, targetTrack: 'video' | 'overlay' | 'audio', explicitStart?: number) => {
      const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      commitProjectChange((prev) => {
        let startTime = explicitStart ?? currentTime;
        if (targetTrack === 'video' && explicitStart === undefined) {
          const v1Clips = prev.clips.filter((c) => c.trackId === 'video');
          startTime = v1Clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0);
        }
        const clip = createBaseClip({
          id,
          trackId: targetTrack,
          kind: asset.kind,
          name: asset.name,
          assetId: asset.id,
          src: asset.src,
          thumbnail: asset.thumbnail,
          waveform: asset.waveform,
          startTime: Math.round(startTime * 100) / 100,
          duration: Math.min(asset.duration, targetTrack === 'audio' ? asset.duration : 6),
          sourceDuration: asset.kind === 'image' ? 60 : asset.duration,
          scale: targetTrack === 'overlay' ? 0.85 : 1,
        });
        return { ...prev, clips: [...prev.clips, clip] };
      });
      setSelectedClipId(id);
    },
    [commitProjectChange, currentTime]
  );

  const handleAddTextPreset = useCallback(
    (preset: TextPreset) => {
      const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      commitProjectChange((prev) => {
        const clip = createBaseClip({
          id,
          trackId: 'text',
          kind: 'text',
          name: preset.previewText,
          startTime: Math.round(currentTime * 100) / 100,
          duration: 3.5,
          sourceDuration: 60,
          x: preset.defaultX,
          y: preset.defaultY,
          inAnimation: preset.inAnimation,
          outAnimation: 'fade',
          textStyle: { ...preset.style },
        });
        return { ...prev, clips: [...prev.clips, clip] };
      });
      setSelectedClipId(id);
    },
    [commitProjectChange, currentTime]
  );

  const handleAddSticker = useCallback(
    (shape: StickerShape, label: string, color: string) => {
      const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      commitProjectChange((prev) => {
        const clip = createBaseClip({
          id,
          trackId: 'overlay',
          kind: 'sticker',
          name: label,
          stickerShape: shape,
          stickerColor: color,
          startTime: Math.round(currentTime * 100) / 100,
          duration: 3.5,
          sourceDuration: 60,
          inAnimation: 'pop',
          outAnimation: 'fade',
        });
        return { ...prev, clips: [...prev.clips, clip] };
      });
      setSelectedClipId(id);
    },
    [commitProjectChange, currentTime]
  );

  const handleAddEffectPreset = useCallback(
    (preset: MovieEffectPreset, explicitStart?: number) => {
      const id = `clip-fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      commitProjectChange((prev) => {
        const startTime = explicitStart ?? currentTime;
        const clip = createBaseClip({
          id,
          trackId: 'fx',
          kind: 'effect',
          name: preset.name,
          startTime: Math.round(startTime * 100) / 100,
          duration: 4.0,
          sourceDuration: 60,
          effectConfig: {
            effectId: preset.id,
            intensity: preset.defaultIntensity,
            speed: preset.defaultSpeed,
          },
        });
        return { ...prev, clips: [...prev.clips, clip] };
      });
      setSelectedClipId(id);
    },
    [commitProjectChange, currentTime]
  );

  const handleVoiceoverRecorded = useCallback(
    async (blob: Blob, fallbackDuration: number, startTime: number) => {
      const url = URL.createObjectURL(blob);
      const { duration, waveform } = await decodeAudioWaveform(url, 80);
      const dur = Math.max(0.4, duration || fallbackDuration);
      const assetId = `vo-${Date.now()}`;
      const asset: MediaAsset = {
        id: assetId,
        name: 'Voiceover Take',
        kind: 'audio',
        src: url,
        duration: dur,
        waveform,
      };
      setAudioAssets((prev) => [asset, ...prev]);

      const clipId = `clip-vo-${Date.now()}`;
      commitProjectChange((prev) => ({
        ...prev,
        clips: [
          ...prev.clips,
          createBaseClip({
            id: clipId,
            trackId: 'audio',
            kind: 'audio',
            name: 'Voiceover Take',
            assetId,
            src: url,
            waveform,
            startTime: Math.round(startTime * 100) / 100,
            duration: dur,
            sourceDuration: dur,
            volume: 120,
          }),
        ],
      }));
      setSelectedClipId(clipId);
    },
    [commitProjectChange]
  );

  const handleSplitClip = useCallback(
    (targetClipId?: string) => {
      commitProjectChange((prev) => {
        const candidate =
          prev.clips.find((c) => c.id === (targetClipId || selectedClipId)) ||
          prev.clips.find(
            (c) => currentTime > c.startTime + 0.08 && currentTime < c.startTime + c.duration - 0.08
          );
        if (!candidate) return prev;
        if (
          currentTime <= candidate.startTime + 0.08 ||
          currentTime >= candidate.startTime + candidate.duration - 0.08
        ) {
          return prev;
        }

        const splitOffset = currentTime - candidate.startTime;
        const leftClip: TimelineClip = {
          ...candidate,
          duration: Math.round(splitOffset * 1000) / 1000,
          keyframes: candidate.keyframes.filter((k) => k.timeOffset <= splitOffset),
        };
        const rightId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const rightClip: TimelineClip = {
          ...candidate,
          id: rightId,
          startTime: Math.round(currentTime * 1000) / 1000,
          duration: Math.round((candidate.duration - splitOffset) * 1000) / 1000,
          trimStart: candidate.trimStart + splitOffset * (candidate.speed || 1),
          transitionIn: 'none',
          keyframes: candidate.keyframes
            .filter((k) => k.timeOffset >= splitOffset)
            .map((k) => ({ ...k, timeOffset: Math.round((k.timeOffset - splitOffset) * 1000) / 1000 })),
        };

        setSelectedClipId(rightId);
        return {
          ...prev,
          clips: prev.clips.map((c) => (c.id === candidate.id ? leftClip : c)).concat(rightClip),
        };
      });
    },
    [commitProjectChange, currentTime, selectedClipId]
  );

  const handleTrimLeftToPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    commitProjectChange((prev) => {
      const clip = prev.clips.find((c) => c.id === selectedClipId);
      if (!clip || currentTime <= clip.startTime + 0.1 || currentTime >= clip.startTime + clip.duration - 0.1) {
        return prev;
      }
      const delta = currentTime - clip.startTime;
      const updated: TimelineClip = {
        ...clip,
        startTime: Math.round(currentTime * 1000) / 1000,
        duration: Math.round((clip.duration - delta) * 1000) / 1000,
        trimStart: clip.trimStart + delta * (clip.speed || 1),
      };
      return { ...prev, clips: prev.clips.map((c) => (c.id === clip.id ? updated : c)) };
    });
  }, [commitProjectChange, currentTime, selectedClipId]);

  const handleTrimRightToPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    commitProjectChange((prev) => {
      const clip = prev.clips.find((c) => c.id === selectedClipId);
      if (!clip || currentTime <= clip.startTime + 0.1 || currentTime >= clip.startTime + clip.duration - 0.1) {
        return prev;
      }
      const updated: TimelineClip = {
        ...clip,
        duration: Math.round((currentTime - clip.startTime) * 1000) / 1000,
      };
      return { ...prev, clips: prev.clips.map((c) => (c.id === clip.id ? updated : c)) };
    });
  }, [commitProjectChange, currentTime, selectedClipId]);

  const handleDuplicateClip = useCallback(
    (clipId?: string) => {
      const targetId = clipId || selectedClipId;
      if (!targetId) return;
      const newId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      commitProjectChange((prev) => {
        const src = prev.clips.find((c) => c.id === targetId);
        if (!src) return prev;
        const copy: TimelineClip = {
          ...src,
          id: newId,
          name: `${src.name} Copy`,
          startTime: Math.round((src.startTime + src.duration) * 1000) / 1000,
          transitionIn: 'none',
          keyframes: src.keyframes.map((k) => ({ ...k, id: `kf-${Math.random().toString(36).slice(2, 7)}` })),
          textStyle: src.textStyle ? { ...src.textStyle } : undefined,
          color: { ...src.color },
          chromaKey: { ...src.chromaKey },
        };
        return { ...prev, clips: [...prev.clips, copy] };
      });
      setSelectedClipId(newId);
    },
    [commitProjectChange, selectedClipId]
  );

  const handleDeleteClip = useCallback(
    (clipId?: string) => {
      const targetId = clipId || selectedClipId;
      if (!targetId) return;
      commitProjectChange((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.id !== targetId),
      }));
      if (selectedClipId === targetId) setSelectedClipId(null);
    },
    [commitProjectChange, selectedClipId]
  );

  const handleCaptureFrame = useCallback(() => {
    const dims = getCanvasDimensions(project.aspectRatio, 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderFrameToCanvas(ctx, project, currentTime, {
      selectedClipId: null,
      isPlaying: false,
      showOverlayHandles: false,
    });
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `kinedeck-frame-${Math.round(currentTime * 100)}.png`;
    a.click();
  }, [project, currentTime]);

  const handleNewBlankProject = useCallback(() => {
    stopPlayback();
    commitProjectChange((prev) => ({
      ...prev,
      title: 'Untitled Edit',
      clips: [],
    }));
    setSelectedClipId(null);
    setCurrentTime(0);
  }, [commitProjectChange, stopPlayback]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateClip();
      } else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSplitClip();
      } else if (e.key.toLowerCase() === 'k' && selectedClip && selectedClip.kind !== 'audio') {
        e.preventDefault();
        if (currentTime >= selectedClip.startTime && currentTime <= selectedClip.startTime + selectedClip.duration) {
          const offset = Math.round((currentTime - selectedClip.startTime) * 100) / 100;
          const kf: Keyframe = {
            id: `kf-${Date.now()}`,
            timeOffset: offset,
            x: selectedClip.x,
            y: selectedClip.y,
            scale: selectedClip.scale,
            rotation: selectedClip.rotation,
            opacity: selectedClip.opacity,
          };
          commitProjectChange((prev) => ({
            ...prev,
            clips: prev.clips.map((c) =>
              c.id === selectedClip.id
                ? {
                    ...c,
                    keyframes: [...c.keyframes.filter((x) => Math.abs(x.timeOffset - offset) > 0.05), kf].sort(
                      (a, b) => a.timeOffset - b.timeOffset
                    ),
                  }
                : c
            ),
          }));
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteClip();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 1 / project.fps));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(totalDuration, currentTime + 1 / project.fps));
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleSeek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        handleSeek(totalDuration);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    togglePlay,
    handleUndo,
    handleRedo,
    handleDuplicateClip,
    handleSplitClip,
    handleDeleteClip,
    handleSeek,
    commitProjectChange,
    selectedClip,
    selectedClipId,
    currentTime,
    totalDuration,
    project.fps,
  ]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0D0F12] text-slate-100 overflow-hidden">
      <TopBar
        title={project.title}
        aspectRatio={project.aspectRatio}
        currentTime={currentTime}
        totalDuration={totalDuration}
        fps={project.fps}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onChangeTitle={(title) => commitProjectChange((prev) => ({ ...prev, title }))}
        onChangeAspectRatio={(aspectRatio: AspectRatio) =>
          commitProjectChange((prev) => ({ ...prev, aspectRatio }))
        }
        onUndo={handleUndo}
        onRedo={handleRedo}
        onNewProject={handleNewBlankProject}
        onOpenExport={() => {
          stopPlayback();
          setShowExportModal(true);
        }}
      />

      {/* Upper 3-Pane Studio Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <MediaBin
          activeTab={activeBinTab}
          onTabChange={setActiveBinTab}
          mediaAssets={mediaAssets}
          audioAssets={audioAssets}
          selectedClip={selectedClip}
          onImportFiles={handleImportFiles}
          onAddMediaClip={(asset, track) => handleAddMediaClip(asset, track)}
          onAddEffectPreset={(preset) => handleAddEffectPreset(preset)}
          onAddTextPreset={handleAddTextPreset}
          onAddSticker={handleAddSticker}
          onApplyFilter={(filterId: ColorFilterId) => {
            if (!selectedClipId) return;
            commitProjectChange((prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === selectedClipId ? { ...c, color: { ...c.color, filterId } } : c
              ),
            }));
          }}
          onApplyTransition={(transition: TransitionType) => {
            if (!selectedClipId) return;
            commitProjectChange((prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === selectedClipId ? { ...c, transitionIn: transition } : c
              ),
            }));
          }}
        />

        <ProgramMonitor
          project={project}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          isLooping={isLooping}
          masterMuted={masterMuted}
          selectedClipId={selectedClipId}
          onSelectClip={setSelectedClipId}
          onUpdateClipTransform={(clipId, patch, record = false) =>
            commitProjectChange(
              (prev) => ({
                ...prev,
                clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
              }),
              record
            )
          }
          onQuickEditText={(clipId, content) =>
            commitProjectChange((prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === clipId && c.textStyle
                  ? { ...c, name: content.slice(0, 28) || 'Text', textStyle: { ...c.textStyle, content } }
                  : c
              ),
            }))
          }
          onTogglePlay={togglePlay}
          onSeek={handleSeek}
          onToggleLoop={() => setIsLooping((l) => !l)}
          onToggleMasterMute={handleToggleMasterMute}
        />

        <InspectorPanel
          project={project}
          selectedClip={selectedClip}
          currentTime={currentTime}
          onUpdateClip={(clipId, updater, record = true) =>
            commitProjectChange(
              (prev) => ({
                ...prev,
                clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
              }),
              record
            )
          }
          onUpdateProject={(patch) => commitProjectChange((prev) => ({ ...prev, ...patch }))}
          onSplitClip={(id) => handleSplitClip(id)}
          onDuplicateClip={(id) => handleDuplicateClip(id)}
          onDeleteClip={(id) => handleDeleteClip(id)}
          onSeek={handleSeek}
          onQuickAction={(action) => {
            if (action === 'media') setActiveBinTab('media');
            else if (action === 'effects') setActiveBinTab('effects');
            else if (action === 'text') setActiveBinTab('text');
            else if (action === 'audio') setActiveBinTab('audio');
          }}
          onVoiceoverRecorded={handleVoiceoverRecorded}
        />
      </div>

      {/* Bottom Multi-Track Nonlinear Timeline */}
      <Timeline
        project={project}
        currentTime={currentTime}
        totalDuration={totalDuration}
        selectedClipId={selectedClipId}
        pixelsPerSecond={pixelsPerSecond}
        snapEnabled={snapEnabled}
        onSelectClip={setSelectedClipId}
        onSeek={handleSeek}
        onSetPixelsPerSecond={setPixelsPerSecond}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        onToggleTrackMute={(trackId: TrackId) =>
          commitProjectChange((prev) => ({
            ...prev,
            tracks: {
              ...prev.tracks,
              [trackId]: { ...prev.tracks[trackId], muted: !prev.tracks[trackId].muted },
            },
          }))
        }
        onToggleTrackHide={(trackId: TrackId) =>
          commitProjectChange((prev) => ({
            ...prev,
            tracks: {
              ...prev.tracks,
              [trackId]: { ...prev.tracks[trackId], hidden: !prev.tracks[trackId].hidden },
            },
          }))
        }
        onMoveOrTrimClip={(clipId, patch, record = false) =>
          commitProjectChange(
            (prev) => ({
              ...prev,
              clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
            }),
            record
          )
        }
        onSplitAtPlayhead={() => handleSplitClip()}
        onTrimLeftToPlayhead={handleTrimLeftToPlayhead}
        onTrimRightToPlayhead={handleTrimRightToPlayhead}
        onDuplicateSelected={() => handleDuplicateClip()}
        onDeleteSelected={() => handleDeleteClip()}
        onCaptureFrame={handleCaptureFrame}
        onDropAssetOnTrack={(asset, trackId, dropTime) =>
          handleAddMediaClip(
            asset,
            trackId === 'audio' ? 'audio' : trackId === 'video' ? 'video' : 'overlay',
            dropTime
          )
        }
        onDropEffectOnTrack={(preset, dropTime) => handleAddEffectPreset(preset, dropTime)}
        onClickTransition={(clipId) => {
          setSelectedClipId(clipId);
          setActiveBinTab('transitions');
        }}
      />

      {showExportModal && (
        <ExportModal
          project={project}
          totalDuration={totalDuration}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
