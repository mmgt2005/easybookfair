"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback?: (token: string) => void },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Cloudflare Turnstile bot-check widget (lib/turnstile.ts verifies the
// resulting token server-side). Rendered via the explicit JS API rather
// than the implicit `<div class="cf-turnstile">` markup so this works
// identically in two situations this app has: a plain <form
// action={serverAction}> (Cloudflare auto-injects a hidden
// cf-turnstile-response input into the enclosing form, same as the
// implicit approach, as long as this container sits inside one — no
// onVerify needed there), and a "use client" component that calls a
// Server Action directly as a function (StorefrontClient/WalletClient),
// which needs the token via onVerify to pass along explicitly since
// there's no form submission event to read a hidden field from.
export function TurnstileWidget({ onVerify }: { onVerify?: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) return; // Not configured — render nothing rather than a broken widget.

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
      });
    });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} />;
}
