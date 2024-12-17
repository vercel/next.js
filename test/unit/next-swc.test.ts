/* eslint-env jest */
import { transform } from 'next/dist/build/swc'
import path from 'path'
import fsp from 'fs/promises'

const swc = async (code) => {
  let output = await transform(code)
  return output.code
}

const trim = (s) => s.join('\n').trim().replace(/^\s+/gm, '')

describe('next/swc', () => {
  describe('hook_optimizer', () => {
    it('should leave alone array destructuring of hooks', async () => {
      const output = await swc(
        trim`
        import { useState } from 'react';
        const [count, setCount] = useState(0);
      `
      )

      expect(output).toMatchInlineSnapshot(`
        "function _array_like_to_array(arr, len) {
            if (len == null || len > arr.length) len = arr.length;
            for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
            return arr2;
        }
        function _array_with_holes(arr) {
            if (Array.isArray(arr)) return arr;
        }
        function _iterable_to_array_limit(arr, i) {
            var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
            if (_i == null) return;
            var _arr = [];
            var _n = true;
            var _d = false;
            var _s, _e;
            try {
                for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
                    _arr.push(_s.value);
                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally{
                try {
                    if (!_n && _i["return"] != null) _i["return"]();
                } finally{
                    if (_d) throw _e;
                }
            }
            return _arr;
        }
        function _non_iterable_rest() {
            throw new TypeError("Invalid attempt to destructure non-iterable instance.\\\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
        }
        function _sliced_to_array(arr, i) {
            return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
        }
        function _unsupported_iterable_to_array(o, minLen) {
            if (!o) return;
            if (typeof o === "string") return _array_like_to_array(o, minLen);
            var n = Object.prototype.toString.call(o).slice(8, -1);
            if (n === "Object" && o.constructor) n = o.constructor.name;
            if (n === "Map" || n === "Set") return Array.from(n);
            if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
        }
        import { useState } from 'react';
        var _useState = _sliced_to_array(useState(0), 2), count = _useState[0], setCount = _useState[1];
        "
      `)
    })

    it('should leave alone array spread of hooks', async () => {
      const output = await swc(
        trim`
        import { useState } from 'react';
        const [...copy] = useState(0);
      `
      )

      expect(output).toMatchInlineSnapshot(`
        "function _array_like_to_array(arr, len) {
            if (len == null || len > arr.length) len = arr.length;
            for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
            return arr2;
        }
        function _array_with_holes(arr) {
            if (Array.isArray(arr)) return arr;
        }
        function _iterable_to_array(iter) {
            if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
        }
        function _non_iterable_rest() {
            throw new TypeError("Invalid attempt to destructure non-iterable instance.\\\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
        }
        function _to_array(arr) {
            return _array_with_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_rest();
        }
        function _unsupported_iterable_to_array(o, minLen) {
            if (!o) return;
            if (typeof o === "string") return _array_like_to_array(o, minLen);
            var n = Object.prototype.toString.call(o).slice(8, -1);
            if (n === "Object" && o.constructor) n = o.constructor.name;
            if (n === "Map" || n === "Set") return Array.from(n);
            if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
        }
        import { useState } from 'react';
        var _useState = _to_array(useState(0)), copy = _useState.slice(0);
        "
      `)
    })
  })

  describe('private env replacement', () => {
    it('__NEXT_REQUIRED_NODE_VERSION_RANGE is replaced', async () => {
      const pkgDir = path.dirname(require.resolve('next/package.json'))
      const nextEntryContent = await fsp.readFile(
        path.join(pkgDir, 'dist/bin/next'),
        'utf8'
      )
      expect(nextEntryContent).not.toContain(
        '__NEXT_REQUIRED_NODE_VERSION_RANGE'
      )
      expect(nextEntryContent).toMatch(
        /For Next.js, Node.js version "\$\{"\^\d+\.\d+\.\d* \|\| \^\d+\.\d+\.\d* \|\| >= \d+\.\d+\.\d*"\}" is required./
      )
    })
  })
})
