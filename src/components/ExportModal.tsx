import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, X } from 'lucide-react';
import { ProjectState } from '../types/editor';
import { sharedAudioEngine } from '../utils/audioEngine';
import { getCanvasDimensions, renderFrameToCanvas } from '../utils/canvasRenderer';
import { formatTimecode } from '../utils/timecode';

interface ExportModalProps {
  project: ProjectState;
  totalDuration: number;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  totalDuration,
  onClose,
}) => {
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [fps, setFps] = useState<number>(project.fps || 30);
  const [bitrateMbps, setBitrateMbps] = useState<number>(8);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderedSizeMB, setRenderedSizeMB] = useState<string>('0');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cancelRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      sharedAudioEngine.stopAll();
      sharedAudioEngine.clearExportDestination();
    };
  }, []);

  const scaleFactor = resolution === '1080p' ? 1.5 : 1;
  const dims = getCanvasDimensions(project.aspectRatio, scaleFactor);
  const effectiveDur = Math.max(0.5, totalDuration);

  const startExport = async () => {
    if (totalDuration <= 0.1) {
      setErrorMsg('Add at least one clip to the timeline before exporting.');
      setStatus('error');
      return;
    }

    cancelRef.current = false;
    setStatus('rendering');
    setProgress(0);
    setErrorMsg(null);
    if (renderedUrl) {
      URL.revokeObjectURL(renderedUrl);
      setRenderedUrl(null);
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      const videoStream = canvas.captureStream(fps);
      const audioStream = sharedAudioEngine.createExportDestination();
      const combinedTracks = [
        ...videoStream.getVideoTracks(),
        ...(audioStream ? audioStream.getAudioTracks() : []),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: bitrateMbps * 1_000_000,
      });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const donePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
      });

      const mutedTracks = new Set<string>(
        Object.values(project.tracks)
          .filter((t) => t.muted)
          .map((t) => t.id)
      );

      // Preload & schedule audio exclusively to export stream
      await sharedAudioEngine.startPlayback(project.clips, 0, mutedTracks, false, true);

      recorder.start(250);
      const startPerf = performance.now();

      await new Promise<void>((resolve) => {
        const step = () => {
          if (cancelRef.current) {
            resolve();
            return;
          }
          const elapsed = (performance.now() - startPerf) / 1000;
          const clamped = Math.min(effectiveDur, elapsed);

          renderFrameToCanvas(ctx, project, clamped, {
            selectedClipId: null,
            isPlaying: true,
            showOverlayHandles: false,
          });

          setProgress(Math.min(100, Math.round((clamped / effectiveDur) * 100)));

          if (elapsed >= effectiveDur) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      });

      sharedAudioEngine.stopAll();
      sharedAudioEngine.clearExportDestination();

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }

      if (cancelRef.current) return;

      const finalBlob = await donePromise;
      const url = URL.createObjectURL(finalBlob);
      setRenderedUrl(url);
      setRenderedSizeMB((finalBlob.size / (1024 * 1024)).toFixed(2));
      setProgress(100);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
      setStatus('error');
    }
  };

  const safeFilename =
    (project.title || 'kinedeck-export')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'kinedeck-export';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161A22] border border-[#2A303D] rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#242933] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Film className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-semibold text-white">Export Video</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
              onClose();
            }}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#232936] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-[#0F1217] border border-[#232833] rounded-lg p-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">Output Format</span>
            <span className="font-mono-tabular text-slate-200">
              {dims.width}×{dims.height} · {fps}fps · WebM
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Resolution</label>
              <div className="grid grid-cols-2 gap-2">
                {(['720p', '1080p'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    disabled={status === 'rendering'}
                    onClick={() => setResolution(res)}
                    className={`py-2 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                      resolution === res
                        ? 'bg-rose-500/15 border-rose-500 text-white'
                        : 'bg-[#1C212B] border-[#2A303C] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {res === '720p' ? 'HD 720p' : 'Full HD 1080p'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Frame Rate</label>
                <select
                  disabled={status === 'rendering'}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full bg-[#1C212B] border border-[#2A303C] rounded-md px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value={24}>24 fps (Cinema)</option>
                  <option value={30}>30 fps (Standard)</option>
                  <option value={60}>60 fps (Smooth)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Bitrate Quality</label>
                <select
                  disabled={status === 'rendering'}
                  value={bitrateMbps}
                  onChange={(e) => setBitrateMbps(Number(e.target.value))}
                  className="w-full bg-[#1C212B] border border-[#2A303C] rounded-md px-2.5 py-2 text-xs text-white outline-none"
                >
                  <option value={4}>Medium (4 Mbps)</option>
                  <option value={8}>High (8 Mbps)</option>
                  <option value={14}>Master (14 Mbps)</option>
                </select>
              </div>
            </div>
          </div>

          {status === 'rendering' && (
            <div className="space-y-2 bg-[#0F1217] border border-[#232833] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Rendering timeline...</span>
                <span className="font-mono-tabular text-rose-400 font-semibold">{progress}%</span>
              </div>
              <div className="h-2 bg-[#232833] rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                Duration: {formatTimecode(effectiveDur, fps)}
              </p>
            </div>
          )}

          {status === 'done' && renderedUrl && (
            <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Render complete ({renderedSizeMB} MB)</span>
              </div>
              <a
                href={renderedUrl}
                download={`${safeFilename}.webm`}
                className="w-full py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Video (.webm)</span>
              </a>
            </div>
          )}

          {status === 'error' && errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#12151B] border-t border-[#242933] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-[#222834] cursor-pointer"
          >
            {status === 'rendering' ? 'Cancel Render' : 'Close'}
          </button>

          {status !== 'rendering' && (
            <button
              type="button"
              onClick={startExport}
              className="px-4 py-1.5 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {status === 'done' ? 'Render Again' : 'Start Render'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
