if (typeof clearImmediate === 'function') {
    console.log(clearImmediate());
}
// We allow this.
const scheduleTimeoutA = typeof setImmediate === 'function' ? setImmediate : setTimeout;
const scheduleTimeoutB = typeof setImmediate !== 'function' ? setTimeout : setImmediate;
