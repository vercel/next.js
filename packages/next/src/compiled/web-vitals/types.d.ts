export * from './types/base.js';
export * from './types/polyfills.js';
export * from './types/cls.js';
export * from './types/fcp.js';
export * from './types/fid.js';
export * from './types/inp.js';
export * from './types/lcp.js';
export * from './types/ttfb.js';
interface PerformanceEntryMap {
    navigation: PerformanceNavigationTiming;
    resource: PerformanceResourceTiming;
    paint: PerformancePaintTiming;
}
declare global {
    interface Document {
        prerendering?: boolean;
        wasDiscarded?: boolean;
    }
    interface Performance {
        getEntriesByType<K extends keyof PerformanceEntryMap>(type: K): PerformanceEntryMap[K][];
    }
    interface PerformanceObserverInit {
        durationThreshold?: number;
    }
    interface PerformanceNavigationTiming {
        activationStart?: number;
    }
    interface PerformanceEventTiming extends PerformanceEntry {
        duration: DOMHighResTimeStamp;
        // Waiting for https://github.com/GoogleChrome/web-vitals/commit/a92f8a78bce9e400366bc29db5fc23fdf23db469
        readonly interactionId: number;
    }
    interface LayoutShiftAttribution {
        node?: Node;
        previousRect: DOMRectReadOnly;
        currentRect: DOMRectReadOnly;
    }
    interface LayoutShift extends PerformanceEntry {
        value: number;
        sources: LayoutShiftAttribution[];
        hadRecentInput: boolean;
    }
    interface LargestContentfulPaint extends PerformanceEntry {
        readonly renderTime: DOMHighResTimeStamp;
        readonly loadTime: DOMHighResTimeStamp;
        readonly size: number;
        readonly id: string;
        readonly url: string;
        readonly element: Element | null;
    }
    interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
        renderStart: DOMHighResTimeStamp;
        duration: DOMHighResTimeStamp;
    }
}
