import { FIDMetric, MetricRatingThresholds, ReportOpts } from './types.js';
/** Thresholds for FID. See https://web.dev/articles/fid#what_is_a_good_fid_score */
export declare const FIDThresholds: MetricRatingThresholds;
/**
 * Calculates the [FID](https://web.dev/articles/fid) value for the current page and
 * calls the `callback` function once the value is ready, along with the
 * relevant `first-input` performance entry used to determine the value. The
 * reported value is a `DOMHighResTimeStamp`.
 *
 * _**Important:** since FID is only reported after the user interacts with the
 * page, it's possible that it will not be reported for some page loads._
 */
export declare const onFID: (onReport: (metric: FIDMetric) => void, opts?: ReportOpts) => void;
