// Deliberately delay before the inherited startup observer registers this worker.
// Parent-side ownership must not depend on this observer ever completing.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)
