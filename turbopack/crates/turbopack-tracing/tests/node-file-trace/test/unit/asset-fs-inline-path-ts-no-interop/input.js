'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const fs_1 = require('fs')
const path = require('path')
console.log(
  fs_1.default.readFileSync(path.join(__dirname, 'asset.txt'), 'utf8')
)

/* Input source (with modules: 'commonjs', no esModuleInterop):
import fs from 'fs';
import * as path from 'path';

console.log(fs.readFileSync(path.join(__dirname, 'asset.txt'), 'utf8'));
*/
