import os from 'os';

import cacache from 'cacache';
import findCacheDir from 'find-cache-dir';
import workerFarm from 'worker-farm';
import serialize from 'serialize-javascript';

import minify from './minify';

const worker = require.resolve('./worker');

export default class TaskRunner {
  constructor() {
    this.cacheDir = findCacheDir({ name: 'terser-webpack-plugin' })
    // In some cases cpus() returns undefined
    // https://github.com/nodejs/node/issues/19022
    const cpus = os.cpus() || { length: 1 };
    this.maxConcurrentWorkers = cpus.length - 1
  }

  run(tasks, callback) {
    /* istanbul ignore if */
    if (!tasks.length) {
      callback(null, []);
      return;
    }

    if (this.maxConcurrentWorkers > 1) {
      const workerOptions =
        process.platform === 'win32'
          ? {
              maxConcurrentWorkers: this.maxConcurrentWorkers,
              maxConcurrentCallsPerWorker: 1,
            }
          : { maxConcurrentWorkers: this.maxConcurrentWorkers };
      this.workers = workerFarm(workerOptions, worker);
      this.boundWorkers = (options, cb) => {
        try {
          this.workers(serialize(options), cb);
        } catch (error) {
          // worker-farm can fail with ENOMEM or something else
          cb(error);
        }
      };
    } else {
      this.boundWorkers = (options, cb) => {
        try {
          cb(null, minify(options));
        } catch (error) {
          cb(error);
        }
      };
    }

    let toRun = tasks.length;
    const results = [];
    const step = (index, data) => {
      toRun -= 1;
      results[index] = data;

      if (!toRun) {
        callback(null, results);
      }
    };

    tasks.forEach((task, index) => {
      const enqueue = () => {
        this.boundWorkers(task, (error, data) => {
          const result = error ? { error } : data;
          const done = () => step(index, result);

          if (this.cacheDir && !result.error) {
            cacache
              .put(
                this.cacheDir,
                serialize(task.cacheKeys),
                JSON.stringify(data)
              )
              .then(done, done);
          } else {
            done();
          }
        });
      };

      if (this.cacheDir) {
        cacache
          .get(this.cacheDir, serialize(task.cacheKeys))
          .then(({ data }) => step(index, JSON.parse(data)), enqueue);
      } else {
        enqueue();
      }
    });
  }

  exit() {
    if (this.workers) {
      workerFarm.end(this.workers);
    }
  }
}
