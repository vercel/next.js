'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod
    var result = {}
    if (mod != null)
      for (var k in mod)
        if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k]
    result['default'] = mod
    return result
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs_1 = __importDefault(require('fs'))
const path = __importStar(require('path'))
console.log(
  fs_1.default.readFileSync(path.join(__dirname, 'asset.txt'), 'utf8')
)

/* Input source (with modules: 'commonjs'):
import fs from 'fs';
import * as path from 'path';

console.log(fs.readFileSync(path.join(__dirname, 'asset.txt'), 'utf8'));
*/
