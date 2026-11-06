let pkg;

try {
  pkg = require("packages/not-found");
} catch (e) {
  pkg = require("packages/found");
}

pkg.fn();

// The catch handles the throw, so execution after the try remains reachable.
export function caughtThrow(condition) {
  try {
    if (condition) return "try";
    throw makeError();
    afterThrow();
  } catch {
    inCatch();
  }
  afterTry();
}

// The finalizer still runs even if the try exits with a throw.
export function throwWithFinally(condition) {
  try {
    if (condition) return "try";
    throw makeFinallyError();
  } finally {
    inFinally();
  }
}

// A throwing finalizer ends the function even if the try/catch falls through.
export function throwingFinally(condition) {
  if (condition) return "value";
  try {
    inTry();
  } catch {
    inHandler();
  } finally {
    throw makeFinalizerError();
    afterFinalizerThrow();
  }
  afterFinally();
}
