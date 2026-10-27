"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Lector de códigos de barras con la cámara del celular.
 * - Usa el lector nativo del navegador (BarcodeDetector: Chrome/Android) cuando existe.
 * - Si no (Safari/iPhone, Firefox), carga ZXing solo en este momento (no pesa en el resto de la app).
 * La imagen de la cámara se procesa en el dispositivo: no se envía ni se guarda.
 */

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (opts?: { formats?: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (!window.isSecureContext) return "La cámara solo funciona en una conexión segura (https).";
  if (name === "NotAllowedError" || name === "SecurityError") return "No hay permiso para usar la cámara. Actívelo en la configuración del navegador para este sitio.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No se encontró una cámara en este dispositivo.";
  if (name === "NotReadableError") return "La cámara está en uso por otra aplicación.";
  return "No se pudo abrir la cámara.";
}

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"nativo" | "zxing" | null>(null);
  const [torch, setTorch] = useState<{ on: boolean; track: MediaStreamTrack } | null>(null);
  const doneRef = useRef(false);
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopZxing: (() => void) | null = null;
    let cancelled = false;

    const finish = (raw: string) => {
      const code = raw.trim();
      if (doneRef.current || code.length < 4) return;
      doneRef.current = true;
      try {
        navigator.vibrate?.(80);
      } catch {
        /* sin vibración */
      }
      detectedRef.current(code);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("sin cámara"), { name: "NotFoundError" });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        if (track && caps.torch) setTorch({ on: false, track });

        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        const supported = Native?.getSupportedFormats ? await Native.getSupportedFormats() : [];
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (Native && formats.length) {
          setEngine("nativo");
          const detector = new Native({ formats });
          let busy = false;
          timer = setInterval(async () => {
            if (busy || doneRef.current || video.readyState < 2) return;
            busy = true;
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) finish(found[0].rawValue);
            } catch {
              /* cuadro ilegible: se reintenta */
            } finally {
              busy = false;
            }
          }, 200);
        } else {
          setEngine("zxing");
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) finish(result.getText());
          });
          stopZxing = () => controls.stop();
        }
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleTorch() {
    if (!torch) return;
    try {
      await torch.track.applyConstraints({ advanced: [{ torch: !torch.on } as MediaTrackConstraintSet] });
      setTorch({ ...torch, on: !torch.on });
    } catch {
      setTorch(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Escanear código de barras">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted aria-hidden />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-[80%] max-w-md rounded-2xl border-4 border-brand shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        <p className="absolute inset-x-0 top-6 px-6 text-center text-sm font-medium drop-shadow" role="status">
          {error ?? "Apunte al código de barras dentro del recuadro"}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 bg-[#061423] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full border border-white/30 font-semibold">
          {error ? "Volver" : "Cancelar"}
        </button>
        {torch && (
          <button type="button" onClick={toggleTorch} aria-pressed={torch.on} className="h-12 flex-1 rounded-full bg-white/10 font-semibold">
            {torch.on ? "Apagar luz" : "Encender luz"}
          </button>
        )}
      </div>
      {engine && <span className="sr-only">Lector: {engine}</span>}
    </div>
  );
}
