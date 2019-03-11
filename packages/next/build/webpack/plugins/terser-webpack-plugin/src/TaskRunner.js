import { join } from 'path';
import minify from './minify';
import murmur from 'imurmurhash';
import { promisify } from 'util';
import workerFarm from 'worker-farm';
import { writeFile, readFile } from 'fs';
import findCacheDir from 'find-cache-dir';
import serialize from 'serialize-javascript';

const worker = require.resolve('./worker');
const writeFileP = promisify(writeFile)
const readFileP = promisify(readFile)

export default class TaskRunner {
  constructor(cpus) {
    this.cacheDir = findCacheDir({ name: 'next-minifier', create: true })
    // In some cases cpus() returns undefined
    // https://github.com/nodejs/node/issues/19022
    this.maxConcurrentWorkers = cpus
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
      const cachePath = join(
        this.cacheDir, 
        murmur(serialize(task.cacheKeys)).result()+''
      )

      const enqueue = () => {
        this.boundWorkers(task, (error, data) => {
          const result = error ? { error } : data;
          const done = () => step(index, result);

          if (this.cacheDir && !result.error) {
            writeFileP(cachePath, JSON.stringify(data), 'utf8')
              .then(done)
              .catch(done)
          } else {
            done();
          }
        });
      };

      if (this.cacheDir) {
        readFileP(cachePath, 'utf8')
          .then(data => step(index, JSON.parse(data)))
          .catch(() => enqueue())
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
