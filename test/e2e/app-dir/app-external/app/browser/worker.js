import { value } from 'browser-module'

self.postMessage('worker.js:' + value)
