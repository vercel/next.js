module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 916:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const events_1 = __importDefault(__webpack_require__(614));
function arrayMove(src, srcIndex, dst, dstIndex, len) {
    for (let j = 0; j < len; ++j) {
        dst[j + dstIndex] = src[j + srcIndex];
        src[j + srcIndex] = void 0;
    }
}
function pow2AtLeast(n) {
    n = n >>> 0;
    n = n - 1;
    n = n | (n >> 1);
    n = n | (n >> 2);
    n = n | (n >> 4);
    n = n | (n >> 8);
    n = n | (n >> 16);
    return n + 1;
}
function getCapacity(capacity) {
    return pow2AtLeast(Math.min(Math.max(16, capacity), 1073741824));
}
// Deque is based on https://github.com/petkaantonov/deque/blob/master/js/deque.js
// Released under the MIT License: https://github.com/petkaantonov/deque/blob/6ef4b6400ad3ba82853fdcc6531a38eb4f78c18c/LICENSE
class Deque {
    constructor(capacity) {
        this._capacity = getCapacity(capacity);
        this._length = 0;
        this._front = 0;
        this.arr = [];
    }
    push(item) {
        const length = this._length;
        this.checkCapacity(length + 1);
        const i = (this._front + length) & (this._capacity - 1);
        this.arr[i] = item;
        this._length = length + 1;
        return length + 1;
    }
    pop() {
        const length = this._length;
        if (length === 0) {
            return void 0;
        }
        const i = (this._front + length - 1) & (this._capacity - 1);
        const ret = this.arr[i];
        this.arr[i] = void 0;
        this._length = length - 1;
        return ret;
    }
    shift() {
        const length = this._length;
        if (length === 0) {
            return void 0;
        }
        const front = this._front;
        const ret = this.arr[front];
        this.arr[front] = void 0;
        this._front = (front + 1) & (this._capacity - 1);
        this._length = length - 1;
        return ret;
    }
    get length() {
        return this._length;
    }
    checkCapacity(size) {
        if (this._capacity < size) {
            this.resizeTo(getCapacity(this._capacity * 1.5 + 16));
        }
    }
    resizeTo(capacity) {
        const oldCapacity = this._capacity;
        this._capacity = capacity;
        const front = this._front;
        const length = this._length;
        if (front + length > oldCapacity) {
            const moveItemsCount = (front + length) & (oldCapacity - 1);
            arrayMove(this.arr, 0, this.arr, oldCapacity, moveItemsCount);
        }
    }
}
class ReleaseEmitter extends events_1.default {
}
function isFn(x) {
    return typeof x === 'function';
}
function defaultInit() {
    return '1';
}
class Sema {
    constructor(nr, { initFn = defaultInit, pauseFn, resumeFn, capacity = 10 } = {}) {
        if (isFn(pauseFn) !== isFn(resumeFn)) {
            throw new Error('pauseFn and resumeFn must be both set for pausing');
        }
        this.nrTokens = nr;
        this.free = new Deque(nr);
        this.waiting = new Deque(capacity);
        this.releaseEmitter = new ReleaseEmitter();
        this.noTokens = initFn === defaultInit;
        this.pauseFn = pauseFn;
        this.resumeFn = resumeFn;
        this.paused = false;
        this.releaseEmitter.on('release', token => {
            const p = this.waiting.shift();
            if (p) {
                p.resolve(token);
            }
            else {
                if (this.resumeFn && this.paused) {
                    this.paused = false;
                    this.resumeFn();
                }
                this.free.push(token);
            }
        });
        for (let i = 0; i < nr; i++) {
            this.free.push(initFn());
        }
    }
    async acquire() {
        let token = this.free.pop();
        if (token !== void 0) {
            return token;
        }
        return new Promise((resolve, reject) => {
            if (this.pauseFn && !this.paused) {
                this.paused = true;
                this.pauseFn();
            }
            this.waiting.push({ resolve, reject });
        });
    }
    release(token) {
        this.releaseEmitter.emit('release', this.noTokens ? '1' : token);
    }
    drain() {
        const a = new Array(this.nrTokens);
        for (let i = 0; i < this.nrTokens; i++) {
            a[i] = this.acquire();
        }
        return Promise.all(a);
    }
    nrWaiting() {
        return this.waiting.length;
    }
}
exports.Sema = Sema;
function RateLimit(rps, { timeUnit = 1000, uniformDistribution = false } = {}) {
    const sema = new Sema(uniformDistribution ? 1 : rps);
    const delay = uniformDistribution ? timeUnit / rps : timeUnit;
    return async function rl() {
        await sema.acquire();
        setTimeout(() => sema.release(), delay);
    };
}
exports.RateLimit = RateLimit;


/***/ }),

/***/ 614:
/***/ ((module) => {

module.exports = require("events");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(__webpack_module_cache__[moduleId]) {
/******/ 			return __webpack_module_cache__[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__webpack_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(916);
/******/ })()
;