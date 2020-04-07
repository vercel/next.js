'use strict';

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _module = require('module');

var _module2 = _interopRequireDefault(_module);

var _loaderRunner = require('loader-runner');

var _loaderRunner2 = _interopRequireDefault(_loaderRunner);

var _queue = require('neo-async/queue');

var _queue2 = _interopRequireDefault(_queue);

var _readBuffer = require('./readBuffer');

var _readBuffer2 = _interopRequireDefault(_readBuffer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const writePipe = _fs2.default.createWriteStream(null, { fd: 3 }); /* global require */
/* eslint-disable no-console */

const readPipe = _fs2.default.createReadStream(null, { fd: 4 });

writePipe.on('finish', onTerminateWrite);
readPipe.on('end', onTerminateRead);
writePipe.on('close', onTerminateWrite);
readPipe.on('close', onTerminateRead);

readPipe.on('error', onError);
writePipe.on('error', onError);

const PARALLEL_JOBS = +process.argv[2] || 20;

let terminated = false;
let nextQuestionId = 0;
const callbackMap = Object.create(null);

function onError(error) {
  console.error(error);
}

function onTerminateRead() {
  terminateRead();
}

function onTerminateWrite() {
  terminateWrite();
}

function writePipeWrite(...args) {
  if (!terminated) {
    writePipe.write(...args);
  }
}

function writePipeCork() {
  if (!terminated) {
    writePipe.cork();
  }
}

function writePipeUncork() {
  if (!terminated) {
    writePipe.uncork();
  }
}

function terminateRead() {
  terminated = true;
  readPipe.removeAllListeners();
}

function terminateWrite() {
  terminated = true;
  writePipe.removeAllListeners();
}

function terminate() {
  terminateRead();
  terminateWrite();
}

function toErrorObj(err) {
  return {
    message: err.message,
    details: err.details,
    stack: err.stack,
    hideStack: err.hideStack
  };
}

function toNativeError(obj) {
  if (!obj) return null;
  const err = new Error(obj.message);
  err.details = obj.details;
  err.missing = obj.missing;
  return err;
}

function writeJson(data) {
  writePipeCork();
  process.nextTick(() => {
    writePipeUncork();
  });

  const lengthBuffer = Buffer.alloc(4);
  const messageBuffer = Buffer.from(JSON.stringify(data), 'utf-8');
  lengthBuffer.writeInt32BE(messageBuffer.length, 0);

  writePipeWrite(lengthBuffer);
  writePipeWrite(messageBuffer);
}

const queue = (0, _queue2.default)(({ id, data }, taskCallback) => {
  try {
    _loaderRunner2.default.runLoaders({
      loaders: data.loaders,
      resource: data.resource,
      readResource: _fs2.default.readFile.bind(_fs2.default),
      context: {
        version: 2,
        resolve: (context, request, callback) => {
          callbackMap[nextQuestionId] = callback;
          writeJson({
            type: 'resolve',
            id,
            questionId: nextQuestionId,
            context,
            request
          });
          nextQuestionId += 1;
        },
        emitWarning: warning => {
          writeJson({
            type: 'emitWarning',
            id,
            data: toErrorObj(warning)
          });
        },
        emitError: error => {
          writeJson({
            type: 'emitError',
            id,
            data: toErrorObj(error)
          });
        },
        exec: (code, filename) => {
          const module = new _module2.default(filename, undefined);
          module.paths = _module2.default._nodeModulePaths(undefined.context); // eslint-disable-line no-underscore-dangle
          module.filename = filename;
          module._compile(code, filename); // eslint-disable-line no-underscore-dangle
          return module.exports;
        },
        options: {
          context: data.optionsContext
        },
        webpack: true,
        'thread-loader': true,
        sourceMap: data.sourceMap,
        target: data.target,
        minimize: data.minimize,
        resourceQuery: data.resourceQuery
      }
    }, (err, lrResult) => {
      const {
        result,
        cacheable,
        fileDependencies,
        contextDependencies
      } = lrResult;
      const buffersToSend = [];
      const convertedResult = Array.isArray(result) && result.map(item => {
        const isBuffer = Buffer.isBuffer(item);
        if (isBuffer) {
          buffersToSend.push(item);
          return {
            buffer: true
          };
        }
        if (typeof item === 'string') {
          const stringBuffer = Buffer.from(item, 'utf-8');
          buffersToSend.push(stringBuffer);
          return {
            buffer: true,
            string: true
          };
        }
        return {
          data: item
        };
      });
      writeJson({
        type: 'job',
        id,
        error: err && toErrorObj(err),
        result: {
          result: convertedResult,
          cacheable,
          fileDependencies,
          contextDependencies
        },
        data: buffersToSend.map(buffer => buffer.length)
      });
      buffersToSend.forEach(buffer => {
        writePipeWrite(buffer);
      });
      setImmediate(taskCallback);
    });
  } catch (e) {
    writeJson({
      type: 'job',
      id,
      error: toErrorObj(e)
    });
    taskCallback();
  }
}, PARALLEL_JOBS);

function dispose() {
  terminate();

  queue.kill();
  process.exit(0);
}

function onMessage(message) {
  try {
    const { type, id } = message;
    switch (type) {
      case 'job':
        {
          queue.push(message);
          break;
        }
      case 'result':
        {
          const { error, result } = message;
          const callback = callbackMap[id];
          if (callback) {
            const nativeError = toNativeError(error);
            callback(nativeError, result);
          } else {
            console.error(`Worker got unexpected result id ${id}`);
          }
          delete callbackMap[id];
          break;
        }
      case 'warmup':
        {
          const { requires } = message;
          // load modules into process
          requires.forEach(r => require(r)); // eslint-disable-line import/no-dynamic-require, global-require
          break;
        }
      default:
        {
          console.error(`Worker got unexpected job type ${type}`);
          break;
        }
    }
  } catch (e) {
    console.error(`Error in worker ${e}`);
  }
}

function readNextMessage() {
  (0, _readBuffer2.default)(readPipe, 4, (lengthReadError, lengthBuffer) => {
    if (lengthReadError) {
      console.error(`Failed to communicate with main process (read length) ${lengthReadError}`);
      return;
    }

    const length = lengthBuffer.length && lengthBuffer.readInt32BE(0);

    if (length === 0) {
      // worker should dispose and exit
      dispose();
      return;
    }
    (0, _readBuffer2.default)(readPipe, length, (messageError, messageBuffer) => {
      if (terminated) {
        return;
      }

      if (messageError) {
        console.error(`Failed to communicate with main process (read message) ${messageError}`);
        return;
      }
      const messageString = messageBuffer.toString('utf-8');
      const message = JSON.parse(messageString);

      onMessage(message);
      setImmediate(() => readNextMessage());
    });
  });
}

// start reading messages from main process
readNextMessage();