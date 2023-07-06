const { readFileSync, writeFileSync } = require('fs'), { Script } = require('vm'), { wrap } = require('module');
const basename = __dirname + '/index.js';
const source = readFileSync(basename + '.cache.js', 'utf-8');
const cachedData = !process.pkg && require('process').platform !== 'win32' && readFileSync(basename + '.cache');
const scriptOpts = { filename: basename + '.cache.js', columnOffset: -62 }
const script = new Script(wrap(source), cachedData ? Object.assign({ cachedData }, scriptOpts) : scriptOpts);
(script.runInThisContext())(exports, require, module, __filename, __dirname);
if (cachedData) process.on('exit', () => { try { writeFileSync(basename + '.cache', script.createCachedData()); } catch(e) {} });
