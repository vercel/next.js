// Test lazy initialization pattern with async functions
// This pattern should preserve the conditional guard to prevent multiple initializations

// Lazy initialization of an async value
let lasyInitAsyncValue = null;

async function computeAsyncValue() {
  return "async result";
}

export function getLasyInitAsyncValue() {
  if (!lasyInitAsyncValue) {
    lasyInitAsyncValue = computeAsyncValue();
  }
  return lasyInitAsyncValue;
}

// Another pattern that was failing
let lasyInitAsyncProcess = null;
async function initLasyInitAsyncProcess() {
  console.log("initLasyInitAsyncProcess");
}

export function ensureAsyncProcessStarted() {
  if (!lasyInitAsyncProcess) {
    lasyInitAsyncProcess = initLasyInitAsyncProcess();
  }
  return lasyInitAsyncProcess;
}

