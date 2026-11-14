"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    twq?: (...args: unknown[]) => void;
  }
}

export function XPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  // The base code sends the page view for the pathname the app loaded on.
  const trackedPathname = useRef(pathname);

  useEffect(() => {
    if (pathname === trackedPathname.current) return;
    trackedPathname.current = pathname;
    window.twq?.("config", pixelId);
  }, [pathname, pixelId]);

  return (
    <Script id="x-pixel" strategy="afterInteractive">
      {`
        !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
        },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
        a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
        twq('config','${pixelId}');
      `}
    </Script>
  );
}

// `window.twq` is undefined until the base code runs.
export function sendXEvent(
  eventId: string,
  params: Record<string, unknown> = {},
) {
  window.twq?.("event", eventId, params);
}
