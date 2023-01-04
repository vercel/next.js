/* eslint-env jest */
import { transform } from 'next/dist/build/swc'

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
        "function _arrayLikeToArray(arr, len) {
            if (len == null || len > arr.length) len = arr.length;
            for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
            return arr2;
        }
        function _arrayWithHoles(arr) {
            if (Array.isArray(arr)) return arr;
        }
        function _iterableToArrayLimit(arr, i) {
            var _i = arr == null ? null : typeof Symbol !== \\"undefined\\" && arr[Symbol.iterator] || arr[\\"@@iterator\\"];
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
                    if (!_n && _i[\\"return\\"] != null) _i[\\"return\\"]();
                } finally{
                    if (_d) throw _e;
                }
            }
            return _arr;
        }
        function _nonIterableRest() {
            throw new TypeError(\\"Invalid attempt to destructure non-iterable instance.\\\\\\\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.\\");
        }
        function _slicedToArray(arr, i) {
            return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
        }
        function _unsupportedIterableToArray(o, minLen) {
            if (!o) return;
            if (typeof o === \\"string\\") return _arrayLikeToArray(o, minLen);
            var n = Object.prototype.toString.call(o).slice(8, -1);
            if (n === \\"Object\\" && o.constructor) n = o.constructor.name;
            if (n === \\"Map\\" || n === \\"Set\\") return Array.from(n);
            if (n === \\"Arguments\\" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
        }
        import { useState } from \\"react\\";
        var _useState = _slicedToArray(useState(0), 2), count = _useState[0], setCount = _useState[1];
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
        "function _arrayLikeToArray(arr, len) {
            if (len == null || len > arr.length) len = arr.length;
            for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
            return arr2;
        }
        function _arrayWithHoles(arr) {
            if (Array.isArray(arr)) return arr;
        }
        function _iterableToArray(iter) {
            if (typeof Symbol !== \\"undefined\\" && iter[Symbol.iterator] != null || iter[\\"@@iterator\\"] != null) return Array.from(iter);
        }
        function _nonIterableRest() {
            throw new TypeError(\\"Invalid attempt to destructure non-iterable instance.\\\\\\\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.\\");
        }
        function _toArray(arr) {
            return _arrayWithHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableRest();
        }
        function _unsupportedIterableToArray(o, minLen) {
            if (!o) return;
            if (typeof o === \\"string\\") return _arrayLikeToArray(o, minLen);
            var n = Object.prototype.toString.call(o).slice(8, -1);
            if (n === \\"Object\\" && o.constructor) n = o.constructor.name;
            if (n === \\"Map\\" || n === \\"Set\\") return Array.from(n);
            if (n === \\"Arguments\\" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
        }
        import { useState } from \\"react\\";
        var _useState = _toArray(useState(0)), copy = _useState.slice(0);
        "
      `)
    })
  })
})
