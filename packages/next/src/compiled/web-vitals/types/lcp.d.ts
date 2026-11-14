import type { Metric } from './base.js';
/**
 * An LCP-specific version of the Metric object.
 */
export interface LCPMetric extends Metric {
    name: 'LCP';
    entries: LargestContentfulPaint[];
}
/**
 * An object containing potentially-helpful debugging information that
 * can be sent along with the LCP value for the current page visit in order
 * to help identify issues happening to real-users in the field.
 */
export interface LCPAttribution {
    /**
     * The element corresponding to the largest contentful paint for the page.
     */
    element?: string;
    /**
     * The URL (if applicable) of the LCP image resource. If the LCP element
     * is a text node, this value will not be set.
     */
    url?: string;
    /**
     * The time from when the user initiates loading the page until when the
     * browser receives the first byte of the response (a.k.a. TTFB). See
     * [Optimize LCP](https://web.dev/articles/optimize-lcp) for details.
     */
    timeToFirstByte: number;
    /**
     * The delta between TTFB and when the browser starts loading the LCP
     * resource (if there is one, otherwise 0). See [Optimize
     * LCP](https://web.dev/articles/optimize-lcp) for details.
     */
    resourceLoadDelay: number;
    /**
     * The total time it takes to load the LCP resource itself (if there is one,
     * otherwise 0). See [Optimize LCP](https://web.dev/articles/optimize-lcp) for
     * details.
     */
    resourceLoadDuration: number;
    /**
     * The delta between when the LCP resource finishes loading until the LCP
     * element is fully rendered. See [Optimize
     * LCP](https://web.dev/articles/optimize-lcp) for details.
     */
    elementRenderDelay: number;
    /**
     * The `navigation` entry of the current page, which is useful for diagnosing
     * general page load issues. This can be used to access `serverTiming` for example:
     * navigationEntry?.serverTiming
     */
    navigationEntry?: PerformanceNavigationTiming;
    /**
     * The `resource` entry for the LCP resource (if applicable), which is useful
     * for diagnosing resource load issues.
     */
    lcpResourceEntry?: PerformanceResourceTiming;
    /**
     * The `LargestContentfulPaint` entry corresponding to LCP.
     */
    lcpEntry?: LargestContentfulPaint;
}
/**
 * An LCP-specific version of the Metric object with attribution.
 */
export interface LCPMetricWithAttribution extends LCPMetric {
    attribution: LCPAttribution;
}
