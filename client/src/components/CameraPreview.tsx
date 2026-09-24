import { useEffect, useRef, useState, useCallback } from "react";
import type { SecurityEventType } from "../types";

export type CameraStatus = "initializing" | "connected" | "denied" | "disconnected" | "unsupported";

interface CameraPreviewProps {
  onSecurityEvent?: (eventType: SecurityEventType, metadata?: Record<string, any>) => void;
  onStatusChange?: (status: CameraStatus) => void;
  className?: string;
  isExamActive?: boolean;
}

export default function CameraPreview({
  onSecurityEvent,
  onStatusChange,
  className = "",
  isExamActive = true,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hadConnectionRef = useRef(false);

  const updateStatus = useCallback((newStatus: CameraStatus, errorMsg: string | null = null) => {
    setStatus(newStatus);
    setErrorMessage(errorMsg);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      onSecurityEvent?.("CAMERA_STOPPED");
    }
  }, [onSecurityEvent]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateStatus("unsupported", "Webcam access is not supported in this browser.");
      onSecurityEvent?.("CAMERA_PERMISSION_DENIED", { reason: "getUserMedia_unsupported" });
      return;
    }

    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    updateStatus("initializing");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        // Detect camera track ending (e.g. device unplugged, turned off, or permission revoked)
        videoTrack.onended = () => {
          updateStatus("disconnected", "Camera stream disconnected unexpectedly.");
          onSecurityEvent?.("CAMERA_DISCONNECTED");
        };
      }

      if (hadConnectionRef.current) {
        onSecurityEvent?.("CAMERA_RECONNECTED");
      } else {
        hadConnectionRef.current = true;
        onSecurityEvent?.("CAMERA_PERMISSION_GRANTED");
        onSecurityEvent?.("CAMERA_STARTED");
      }

      updateStatus("connected");
    } catch (err: any) {
      const isDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      const isNotFound = err.name === "NotFoundError" || err.name === "DevicesNotFoundError";
      const isNotReadable = err.name === "NotReadableError" || err.name === "TrackStartError";

      if (isDenied) {
        updateStatus("denied", "Camera permission was denied. Please allow camera access in browser settings.");
        onSecurityEvent?.("CAMERA_PERMISSION_DENIED", { errorName: err.name, message: err.message });
      } else if (isNotFound) {
        updateStatus("disconnected", "No webcam device detected on your system.");
        onSecurityEvent?.("CAMERA_DISCONNECTED", { errorName: err.name });
      } else if (isNotReadable) {
        updateStatus("disconnected", "Camera is currently in use by another application.");
        onSecurityEvent?.("CAMERA_DISCONNECTED", { errorName: err.name });
      } else {
        updateStatus("disconnected", err.message || "Failed to start camera preview.");
        onSecurityEvent?.("CAMERA_DISCONNECTED", { errorName: err.name, message: err.message });
      }
    }
  }, [updateStatus, onSecurityEvent]);

  useEffect(() => {
    if (isExamActive) {
      startCamera();
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [isExamActive, startCamera, stopStream]);

  // Clean up on beforeunload or tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopStream();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [stopStream]);

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-md ${className}`}>
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">📷</span>
          <span className="text-xs font-bold text-slate-200">Live Camera Preview</span>
        </div>
        <div>
          {status === "connected" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          )}
          {status === "initializing" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 ring-1 ring-blue-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-spin" />
              Connecting…
            </span>
          )}
          {status === "denied" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Permission Denied
            </span>
          )}
          {status === "disconnected" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Disconnected
            </span>
          )}
          {status === "unsupported" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-500/30">
              Unsupported
            </span>
          )}
        </div>
      </div>

      {/* Video Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-900 border border-slate-800">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover -scale-x-100 ${status === "connected" ? "block" : "hidden"}`}
        />

        {status === "initializing" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center p-3 text-slate-400">
            <svg className="h-5 w-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-[11px]">Requesting camera…</span>
          </div>
        )}

        {status === "denied" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center bg-rose-950/20 text-rose-300">
            <span className="text-lg">🚫</span>
            <p className="text-[11px] font-medium leading-tight">{errorMessage || "Camera access denied"}</p>
            <button
              type="button"
              onClick={startCamera}
              className="mt-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-rose-500 transition-colors"
            >
              Retry Permission
            </button>
          </div>
        )}

        {status === "disconnected" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center bg-amber-950/20 text-amber-300">
            <span className="text-lg">⚠️</span>
            <p className="text-[11px] font-medium leading-tight">{errorMessage || "Camera disconnected"}</p>
            <button
              type="button"
              onClick={startCamera}
              className="mt-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-amber-500 transition-colors"
            >
              Reconnect
            </button>
          </div>
        )}

        {status === "unsupported" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center text-slate-400">
            <span className="text-lg">📷</span>
            <p className="text-[11px]">Webcam not supported</p>
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] text-slate-500 leading-normal">
        {status === "connected"
          ? "Live feed active. No videos or recordings are saved."
          : "Standard browser webcam monitoring. Ensure your camera remains connected."}
      </p>
    </div>
  );
}
