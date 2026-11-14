import type { LoadState, Metric } from './base.js';
/**
 * An FID-specific version of the Metric object.
 */
export interface FIDMetric extends Metric {
    name: 'FID';
    entries: PerformanceEventTiming[];
}
/**
 * An object containing potentially-helpful debugging information that
 * can be sent along with the FID value for the current page visit in order
 * to help identify issues happening to real-users in the field.
 */
export interface FIDAttribution {
    /**
     * A selector identifying the element that the user interacted with. This
     * element will be the `target` of the `event` dispatched.
     */
    eventTarget: string;
    /**
     * The time when the user interacted. This time will match the `timeStamp`
     * value of the `event` dispatched.
     */
    eventTime: number;
    /**
     * The `type` of the `event` dispatched from the user interaction.
     */
    eventType: string;
    /**
     * The `PerformanceEventTiming` entry corresponding to FID.
     */
    eventEntry: PerformanceEventTiming;
    /**
     * The loading state of the document at the time when the first interaction
     * occurred (see `LoadState` for details). If the first interaction occurred
     * while the document was loading and executing script (e.g. usually in the
     * `dom-interactive` phase) it can result in long input delays.
     */
    loadState: LoadState;
}
/**
 * An FID-specific version of the Metric object with attribution.
 */
export interface FIDMetricWithAttribution extends FIDMetric {
    attribution: FIDAttribution;
}
