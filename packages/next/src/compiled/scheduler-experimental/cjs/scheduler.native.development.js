/**
 * @license React
 * scheduler.native.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

if (process.env.NODE_ENV !== "production") {
  (function() {
'use strict';

var enableSchedulerDebugging = false;
var enableProfiling = false;
var frameYieldMs = 5;
var userBlockingPriorityTimeout = 250;
var normalPriorityTimeout = 5000;
var lowPriorityTimeout = 10000;

function push(heap, node) {
  var index = heap.length;
  heap.push(node);
  siftUp(heap, node, index);
}
function peek(heap) {
  return heap.length === 0 ? null : heap[0];
}
function pop(heap) {
  if (heap.length === 0) {
    return null;
  }

  var first = heap[0];
  var last = heap.pop();

  if (last !== first) {
    heap[0] = last;
    siftDown(heap, last, 0);
  }

  return first;
}

function siftUp(heap, node, i) {
  var index = i;

  while (index > 0) {
    var parentIndex = index - 1 >>> 1;
    var parent = heap[parentIndex];

    if (compare(parent, node) > 0) {
      // The parent is larger. Swap positions.
      heap[parentIndex] = node;
      heap[index] = parent;
      index = parentIndex;
    } else {
      // The parent is smaller. Exit.
      return;
    }
  }
}

function siftDown(heap, node, i) {
  var index = i;
  var length = heap.length;
  var halfLength = length >>> 1;

  while (index < halfLength) {
    var leftIndex = (index + 1) * 2 - 1;
    var left = heap[leftIndex];
    var rightIndex = leftIndex + 1;
    var right = heap[rightIndex]; // If the left or right node is smaller, swap with the smaller of those.

    if (compare(left, node) < 0) {
      if (rightIndex < length && compare(right, left) < 0) {
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (rightIndex < length && compare(right, node) < 0) {
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      // Neither child is smaller. Exit.
      return;
    }
  }
}

function compare(a, b) {
  // Compare sort index first, then task id.
  var diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}

// TODO: Use symbols?
var ImmediatePriority = 1;
var UserBlockingPriority = 2;
var NormalPriority = 3;
var LowPriority = 4;
var IdlePriority = 5;

function markTaskErrored(task, ms) {
}

/* eslint-disable no-var */
var getCurrentTime;
var hasPerformanceNow = // $FlowFixMe[method-unbinding]
typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  var localPerformance = performance;

  getCurrentTime = function () {
    return localPerformance.now();
  };
} else {
  var localDate = Date;
  var initialTime = localDate.now();

  getCurrentTime = function () {
    return localDate.now() - initialTime;
  };
} // Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111


var maxSigned31BitInt = 1073741823; // Tasks are stored on a min heap

var taskQueue = [];
var timerQueue = []; // Incrementing id counter. Used to maintain insertion order.

var taskIdCounter = 1; // Pausing the scheduler is useful for debugging.
var currentTask = null;
var currentPriorityLevel = NormalPriority; // This is set while performing work, to prevent re-entrance.

var isPerformingWork = false;
var isHostCallbackScheduled = false;
var isHostTimeoutScheduled = false; // Capture local references to native APIs, in case a polyfill overrides them.

var localSetTimeout = typeof setTimeout === 'function' ? setTimeout : null;
var localClearTimeout = typeof clearTimeout === 'function' ? clearTimeout : null;
var localSetImmediate = typeof setImmediate !== 'undefined' ? setImmediate : null; // IE and Node.js + jsdom

typeof navigator !== 'undefined' && // $FlowFixMe[prop-missing]
navigator.scheduling !== undefined && // $FlowFixMe[incompatible-type]
navigator.scheduling.isInputPending !== undefined ? navigator.scheduling.isInputPending.bind(navigator.scheduling) : null;

function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  var timer = peek(timerQueue);

  while (timer !== null) {
    if (timer.callback === null) {
      // Timer was cancelled.
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // Timer fired. Transfer to the task queue.
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
    } else {
      // Remaining timers are pending.
      return;
    }

    timer = peek(timerQueue);
  }
}

function handleTimeout(currentTime) {
  isHostTimeoutScheduled = false;
  advanceTimers(currentTime);

  if (!isHostCallbackScheduled) {
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true;
      requestHostCallback();
    } else {
      var firstTimer = peek(timerQueue);

      if (firstTimer !== null) {
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

function flushWork(initialTime) {


  isHostCallbackScheduled = false;

  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true;
  var previousPriorityLevel = currentPriorityLevel;

  try {
    var currentTime; if (enableProfiling) ; else {
      // No catch in prod code path.
      return workLoop(initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
  }
}

function workLoop(initialTime) {
  var currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);

  while (currentTask !== null && !(enableSchedulerDebugging )) {
    if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    } // $FlowFixMe[incompatible-use] found when upgrading Flow


    var callback = currentTask.callback;

    if (typeof callback === 'function') {
      // $FlowFixMe[incompatible-use] found when upgrading Flow
      currentTask.callback = null; // $FlowFixMe[incompatible-use] found when upgrading Flow

      currentPriorityLevel = currentTask.priorityLevel; // $FlowFixMe[incompatible-use] found when upgrading Flow

      var didUserCallbackTimeout = currentTask.expirationTime <= currentTime;

      var continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();

      if (typeof continuationCallback === 'function') {
        // If a continuation is returned, immediately yield to the main thread
        // regardless of how much time is left in the current time slice.
        // $FlowFixMe[incompatible-use] found when upgrading Flow
        currentTask.callback = continuationCallback;

        advanceTimers(currentTime);
        return true;
      } else {

        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }

        advanceTimers(currentTime);
      }
    } else {
      pop(taskQueue);
    }

    currentTask = peek(taskQueue);
  } // Return whether there's additional work


  if (currentTask !== null) {
    return true;
  } else {
    var firstTimer = peek(timerQueue);

    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }

    return false;
  }
}

function unstable_scheduleCallback$1(priorityLevel, callback, options) {
  var currentTime = getCurrentTime();
  var startTime;

  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;

    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }

  var timeout;

  switch (priorityLevel) {
    case ImmediatePriority:
      // Times out immediately
      timeout = -1;
      break;

    case UserBlockingPriority:
      // Eventually times out
      timeout = userBlockingPriorityTimeout;
      break;

    case IdlePriority:
      // Never times out
      timeout = maxSigned31BitInt;
      break;

    case LowPriority:
      // Eventually times out
      timeout = lowPriorityTimeout;
      break;

    case NormalPriority:
    default:
      // Eventually times out
      timeout = normalPriorityTimeout;
      break;
  }

  var expirationTime = startTime + timeout;
  var newTask = {
    id: taskIdCounter++,
    callback: callback,
    priorityLevel: priorityLevel,
    startTime: startTime,
    expirationTime: expirationTime,
    sortIndex: -1
  };

  if (startTime > currentTime) {
    // This is a delayed task.
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);

    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // All tasks are delayed, and this is the task with the earliest delay.
      if (isHostTimeoutScheduled) {
        // Cancel an existing timeout.
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      } // Schedule a timeout.


      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    // wait until the next time we yield.


    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback();
    }
  }

  return newTask;
}

function unstable_cancelCallback$1(task) {
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)


  task.callback = null;
}

function unstable_getCurrentPriorityLevel$1() {
  return currentPriorityLevel;
}

var isMessageLoopRunning = false;
var taskTimeoutID = -1; // Scheduler periodically yields in case there is other work on the main
// thread, like user events. By default, it yields multiple times per frame.
// It does not attempt to align with frame boundaries, since most tasks don't
// need to be frame aligned; for those that do, use requestAnimationFrame.

var frameInterval = frameYieldMs;
var startTime = -1;

function shouldYieldToHost() {
  var timeElapsed = getCurrentTime() - startTime;

  if (timeElapsed < frameInterval) {
    // The main thread has only been blocked for a really short amount of time;
    // smaller than a single frame. Don't yield yet.
    return false;
  } // The main thread has been blocked for a non-negligible amount of time. We


  return true;
}

function requestPaint() {

}

var performWorkUntilDeadline = function () {
  if (isMessageLoopRunning) {
    var currentTime = getCurrentTime(); // Keep track of the start time so we can measure how long the main thread
    // has been blocked.

    startTime = currentTime; // If a scheduler task throws, exit the current browser task so the
    // error can be observed.
    //
    // Intentionally not using a try-catch, since that makes some debugging
    // techniques harder. Instead, if `flushWork` errors, then `hasMoreWork` will
    // remain true, and we'll continue the work loop.

    var hasMoreWork = true;

    try {
      hasMoreWork = flushWork(currentTime);
    } finally {
      if (hasMoreWork) {
        // If there's more work, schedule the next message event at the end
        // of the preceding one.
        schedulePerformWorkUntilDeadline();
      } else {
        isMessageLoopRunning = false;
      }
    }
  } // Yielding to the browser will give it a chance to paint, so we can
};

var schedulePerformWorkUntilDeadline;

if (typeof localSetImmediate === 'function') {
  // Node.js and old IE.
  // There's a few reasons for why we prefer setImmediate.
  //
  // Unlike MessageChannel, it doesn't prevent a Node.js process from exiting.
  // (Even though this is a DOM fork of the Scheduler, you could get here
  // with a mix of Node.js 15+, which has a MessageChannel, and jsdom.)
  // https://github.com/facebook/react/issues/20756
  //
  // But also, it runs earlier which is the semantic we want.
  // If other browsers ever implement it, it's better to use it.
  // Although both of these would be inferior to native scheduling.
  schedulePerformWorkUntilDeadline = function () {
    localSetImmediate(performWorkUntilDeadline);
  };
} else if (typeof MessageChannel !== 'undefined') {
  // DOM and Worker environments.
  // We prefer MessageChannel because of the 4ms setTimeout clamping.
  var channel = new MessageChannel();
  var port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  schedulePerformWorkUntilDeadline = function () {
    port.postMessage(null);
  };
} else {
  // We should only fallback here in non-browser environments.
  schedulePerformWorkUntilDeadline = function () {
    // $FlowFixMe[not-a-function] nullable value
    localSetTimeout(performWorkUntilDeadline, 0);
  };
}

function requestHostCallback() {
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true;
    schedulePerformWorkUntilDeadline();
  }
}

function requestHostTimeout(callback, ms) {
  // $FlowFixMe[not-a-function] nullable value
  taskTimeoutID = localSetTimeout(function () {
    callback(getCurrentTime());
  }, ms);
}

function cancelHostTimeout() {
  // $FlowFixMe[not-a-function] nullable value
  localClearTimeout(taskTimeoutID);
  taskTimeoutID = -1;
}

// https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/runtimescheduler/RuntimeSchedulerBinding.cpp

var unstable_UserBlockingPriority = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_UserBlockingPriority : UserBlockingPriority;
var unstable_NormalPriority = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_NormalPriority : NormalPriority;
var unstable_IdlePriority = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_IdlePriority : IdlePriority;
var unstable_LowPriority = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_LowPriority : LowPriority;
var unstable_ImmediatePriority = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_ImmediatePriority : ImmediatePriority;
var unstable_scheduleCallback = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_scheduleCallback : unstable_scheduleCallback$1;
var unstable_cancelCallback = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_cancelCallback : unstable_cancelCallback$1;
var unstable_getCurrentPriorityLevel = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_getCurrentPriorityLevel : unstable_getCurrentPriorityLevel$1;
var unstable_shouldYield = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_shouldYield : shouldYieldToHost;
var unstable_requestPaint = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_requestPaint : requestPaint;
var unstable_now = typeof nativeRuntimeScheduler !== 'undefined' ? nativeRuntimeScheduler.unstable_now : getCurrentTime; // These were never implemented on the native scheduler because React never calls them.
// For consistency, let's disable them altogether and make them throw.

var unstable_next = throwNotImplemented;
var unstable_runWithPriority = throwNotImplemented;
var unstable_wrapCallback = throwNotImplemented;
var unstable_continueExecution = throwNotImplemented;
var unstable_pauseExecution = throwNotImplemented;
var unstable_getFirstCallbackNode = throwNotImplemented;
var unstable_forceFrameRate = throwNotImplemented;
var unstable_Profiling = null;

function throwNotImplemented() {
  throw Error('Not implemented.');
} // Flow magic to verify the exports of this file match the original version.

exports.unstable_IdlePriority = unstable_IdlePriority;
exports.unstable_ImmediatePriority = unstable_ImmediatePriority;
exports.unstable_LowPriority = unstable_LowPriority;
exports.unstable_NormalPriority = unstable_NormalPriority;
exports.unstable_Profiling = unstable_Profiling;
exports.unstable_UserBlockingPriority = unstable_UserBlockingPriority;
exports.unstable_cancelCallback = unstable_cancelCallback;
exports.unstable_continueExecution = unstable_continueExecution;
exports.unstable_forceFrameRate = unstable_forceFrameRate;
exports.unstable_getCurrentPriorityLevel = unstable_getCurrentPriorityLevel;
exports.unstable_getFirstCallbackNode = unstable_getFirstCallbackNode;
exports.unstable_next = unstable_next;
exports.unstable_now = unstable_now;
exports.unstable_pauseExecution = unstable_pauseExecution;
exports.unstable_requestPaint = unstable_requestPaint;
exports.unstable_runWithPriority = unstable_runWithPriority;
exports.unstable_scheduleCallback = unstable_scheduleCallback;
exports.unstable_shouldYield = unstable_shouldYield;
exports.unstable_wrapCallback = unstable_wrapCallback;
  })();
}
