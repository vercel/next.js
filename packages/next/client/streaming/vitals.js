"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getBufferedVitalsMetrics = getBufferedVitalsMetrics;
exports.flushBufferedVitalsMetrics = flushBufferedVitalsMetrics;
exports.trackWebVitalMetric = trackWebVitalMetric;
exports.useWebVitalsReport = useWebVitalsReport;
exports.webVitalsCallbacks = void 0;
var _react = require("react");
const webVitalsCallbacks = new Set();
exports.webVitalsCallbacks = webVitalsCallbacks;
let flushed = false;
const metrics = [];
function getBufferedVitalsMetrics() {
    return metrics;
}
function flushBufferedVitalsMetrics() {
    flushed = true;
    metrics.length = 0;
}
function trackWebVitalMetric(metric) {
    metrics.push(metric);
    webVitalsCallbacks.forEach((callback)=>callback(metric)
    );
}
function useWebVitalsReport(callback) {
    const metricIndexRef = (0, _react).useRef(0);
    if (process.env.NODE_ENV === 'development') {
        if (flushed) {
            console.error('The `useWebVitalsReport` hook was called too late -- did you use it inside of a <Suspense> boundary?');
        }
    }
    (0, _react).useEffect(()=>{
        // Flush calculated metrics
        const reportMetric = (metric)=>{
            callback(metric);
            metricIndexRef.current = metrics.length;
        };
        for(let i = metricIndexRef.current; i < metrics.length; i++){
            reportMetric(metrics[i]);
        }
        webVitalsCallbacks.add(reportMetric);
        return ()=>{
            webVitalsCallbacks.delete(reportMetric);
        };
    }, [
        callback
    ]);
}

//# sourceMappingURL=vitals.js.map