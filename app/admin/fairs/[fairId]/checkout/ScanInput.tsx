"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@/components/ui";

// A physical USB/Bluetooth barcode scanner is a keyboard-wedge device — it
// just "types" the decoded text into whatever input has focus, then sends
// Enter. So the always-focused text field below is all a physical scanner
// needs; only the camera path requires real decoding (html5-qrcode).
export function ScanInput({ onScan }: { onScan: (code: string) => void }) {
  const [buffer, setBuffer] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = buffer.trim();
    if (code) onScan(code);
    setBuffer("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          autoFocus
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan or type item code, then Enter"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setCameraOpen(true)}>
          📷 Scan with camera
        </Button>
      </div>
      {cameraOpen && (
        <CameraScanner
          onScan={(code) => {
            onScan(code);
            inputRef.current?.focus();
          }}
          onClose={() => {
            setCameraOpen(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const containerId = "checkout-qr-reader";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;

    async function start() {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(containerId);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            onScan(decodedText);
            // Pause briefly so the same code isn't re-fired instantly, then
            // resume so a packer can scan several different items in a row
            // without closing and reopening the camera.
            scanner?.pause(true);
            setTimeout(() => {
              try {
                scanner?.resume();
              } catch {
                // scanner may already be stopped (modal closed mid-pause)
              }
            }, 1500);
          },
          undefined,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start the camera");
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl2 border border-neutral-100 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-600">Point the camera at a label&apos;s QR code</p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          ✕ Close
        </Button>
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div id={containerId} className="mx-auto w-full max-w-xs" />
    </div>
  );
}
