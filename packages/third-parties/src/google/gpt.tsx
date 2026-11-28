"use client";
import Script from "next/script";
import { useEffect } from "react";

interface GPTParams {
    gptScriptUrl?: string;
    /**
     * Number used once (nonce) for Content Security Policy (CSP)
     */
    nonce?: string;
}

export function GooglePublisherTag({
    gptScriptUrl = "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
    nonce,
}: GPTParams) {
    useEffect(() => {
        initGPT();
        performance.mark("mark_feature_usage", {
            detail: {
                feature: "next-third-parties-gpt",
            },
        });
    }, []);

    return (
        <Script
            id="_next-gpt"
            src={gptScriptUrl}
            async
            nonce={nonce}
            strategy="afterInteractive"
            type="text/javascript"
        />
    );
}

// Helper to safely push commands to googletag.cmd
export const pushGPTCommand = (cmd: () => void) => {
    if (typeof window !== "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.googletag = window.googletag ?? ({ cmd: [] } as any);
        window.googletag?.cmd.push(cmd);
    }
};

export const initGPT = () => {
    if (typeof window !== "undefined" && !window.gptInitialized) {
        window.googletag = window.googletag || { cmd: [] };
        window.googletag.cmd.push(() => {
            window.googletag.pubads().enableSingleRequest();
            window.googletag.enableServices();
        });
        window.gptInitialized = true;
    }
};
