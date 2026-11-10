import { workerData } from 'worker_threads'

// We override the `cwd` in workers. Every worker thread gets an isolated
// `process` object, so this mutation is safe.
if (!workerData.hasOwnProperty('cwd')) {
  throw new Error('cwd not set in loader worker thread')
}
process.cwd = () => workerData.cwd

// @ts-ignore
process.turbopack = {}
