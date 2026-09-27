export type FirstInputPolyfillEntry = Omit<PerformanceEventTiming, 'processingEnd'>;
export interface FirstInputPolyfillCallback {
    (entry: FirstInputPolyfillEntry): void;
}
