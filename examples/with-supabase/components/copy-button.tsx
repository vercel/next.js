"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!window.document.hasFocus()) return;

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      // Safari requires the ClipboardItem promise pattern — direct async writes are blocked.
      const item = new ClipboardItem({
        "text/plain": Promise.resolve(text).then(
          (t) => new Blob([t], { type: "text/plain" })
        ),
      });

      let resolve = () => {};
      let reject = () => {};
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      // Safari requires the promise to resolve shortly after the write call.
      setTimeout(() => {
        navigator.clipboard
          .write([item])
          .then(resolve)
          .catch(reject);
      }, 0);
      await promise;
    } else {
      await navigator.clipboard?.writeText(text);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-3 text-sm text-foreground/80">
      <code className="font-mono text-xs">{text}</code>
      <button
        onClick={copy}
        aria-label="Copy"
        className="ml-2 rounded p-1 hover:bg-foreground/10 transition-colors"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
