var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to2, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to2, key) && key !== except)
        __defProp(to2, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to2;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));

// node_modules/.pnpm/tiny-inflate@1.0.3/node_modules/tiny-inflate/index.js
var require_tiny_inflate = __commonJS({
  "node_modules/.pnpm/tiny-inflate@1.0.3/node_modules/tiny-inflate/index.js"(exports2, module) {
    var TINF_OK = 0;
    var TINF_DATA_ERROR = -3;
    function Tree() {
      this.table = new Uint16Array(16);
      this.trans = new Uint16Array(288);
    }
    function Data(source, dest) {
      this.source = source;
      this.sourceIndex = 0;
      this.tag = 0;
      this.bitcount = 0;
      this.dest = dest;
      this.destLen = 0;
      this.ltree = new Tree();
      this.dtree = new Tree();
    }
    var sltree = new Tree();
    var sdtree = new Tree();
    var length_bits = new Uint8Array(30);
    var length_base = new Uint16Array(30);
    var dist_bits = new Uint8Array(30);
    var dist_base = new Uint16Array(30);
    var clcidx = new Uint8Array([
      16,
      17,
      18,
      0,
      8,
      7,
      9,
      6,
      10,
      5,
      11,
      4,
      12,
      3,
      13,
      2,
      14,
      1,
      15
    ]);
    var code_tree = new Tree();
    var lengths = new Uint8Array(288 + 32);
    function tinf_build_bits_base(bits2, base, delta, first) {
      var i, sum;
      for (i = 0; i < delta; ++i)
        bits2[i] = 0;
      for (i = 0; i < 30 - delta; ++i)
        bits2[i + delta] = i / delta | 0;
      for (sum = first, i = 0; i < 30; ++i) {
        base[i] = sum;
        sum += 1 << bits2[i];
      }
    }
    function tinf_build_fixed_trees(lt, dt2) {
      var i;
      for (i = 0; i < 7; ++i)
        lt.table[i] = 0;
      lt.table[7] = 24;
      lt.table[8] = 152;
      lt.table[9] = 112;
      for (i = 0; i < 24; ++i)
        lt.trans[i] = 256 + i;
      for (i = 0; i < 144; ++i)
        lt.trans[24 + i] = i;
      for (i = 0; i < 8; ++i)
        lt.trans[24 + 144 + i] = 280 + i;
      for (i = 0; i < 112; ++i)
        lt.trans[24 + 144 + 8 + i] = 144 + i;
      for (i = 0; i < 5; ++i)
        dt2.table[i] = 0;
      dt2.table[5] = 32;
      for (i = 0; i < 32; ++i)
        dt2.trans[i] = i;
    }
    var offs = new Uint16Array(16);
    function tinf_build_tree(t, lengths2, off, num) {
      var i, sum;
      for (i = 0; i < 16; ++i)
        t.table[i] = 0;
      for (i = 0; i < num; ++i)
        t.table[lengths2[off + i]]++;
      t.table[0] = 0;
      for (sum = 0, i = 0; i < 16; ++i) {
        offs[i] = sum;
        sum += t.table[i];
      }
      for (i = 0; i < num; ++i) {
        if (lengths2[off + i])
          t.trans[offs[lengths2[off + i]]++] = i;
      }
    }
    function tinf_getbit(d) {
      if (!d.bitcount--) {
        d.tag = d.source[d.sourceIndex++];
        d.bitcount = 7;
      }
      var bit = d.tag & 1;
      d.tag >>>= 1;
      return bit;
    }
    function tinf_read_bits(d, num, base) {
      if (!num)
        return base;
      while (d.bitcount < 24) {
        d.tag |= d.source[d.sourceIndex++] << d.bitcount;
        d.bitcount += 8;
      }
      var val = d.tag & 65535 >>> 16 - num;
      d.tag >>>= num;
      d.bitcount -= num;
      return val + base;
    }
    function tinf_decode_symbol(d, t) {
      while (d.bitcount < 24) {
        d.tag |= d.source[d.sourceIndex++] << d.bitcount;
        d.bitcount += 8;
      }
      var sum = 0, cur = 0, len = 0;
      var tag = d.tag;
      do {
        cur = 2 * cur + (tag & 1);
        tag >>>= 1;
        ++len;
        sum += t.table[len];
        cur -= t.table[len];
      } while (cur >= 0);
      d.tag = tag;
      d.bitcount -= len;
      return t.trans[sum + cur];
    }
    function tinf_decode_trees(d, lt, dt2) {
      var hlit, hdist, hclen;
      var i, num, length;
      hlit = tinf_read_bits(d, 5, 257);
      hdist = tinf_read_bits(d, 5, 1);
      hclen = tinf_read_bits(d, 4, 4);
      for (i = 0; i < 19; ++i)
        lengths[i] = 0;
      for (i = 0; i < hclen; ++i) {
        var clen = tinf_read_bits(d, 3, 0);
        lengths[clcidx[i]] = clen;
      }
      tinf_build_tree(code_tree, lengths, 0, 19);
      for (num = 0; num < hlit + hdist; ) {
        var sym = tinf_decode_symbol(d, code_tree);
        switch (sym) {
          case 16:
            var prev = lengths[num - 1];
            for (length = tinf_read_bits(d, 2, 3); length; --length) {
              lengths[num++] = prev;
            }
            break;
          case 17:
            for (length = tinf_read_bits(d, 3, 3); length; --length) {
              lengths[num++] = 0;
            }
            break;
          case 18:
            for (length = tinf_read_bits(d, 7, 11); length; --length) {
              lengths[num++] = 0;
            }
            break;
          default:
            lengths[num++] = sym;
            break;
        }
      }
      tinf_build_tree(lt, lengths, 0, hlit);
      tinf_build_tree(dt2, lengths, hlit, hdist);
    }
    function tinf_inflate_block_data(d, lt, dt2) {
      while (1) {
        var sym = tinf_decode_symbol(d, lt);
        if (sym === 256) {
          return TINF_OK;
        }
        if (sym < 256) {
          d.dest[d.destLen++] = sym;
        } else {
          var length, dist, offs2;
          var i;
          sym -= 257;
          length = tinf_read_bits(d, length_bits[sym], length_base[sym]);
          dist = tinf_decode_symbol(d, dt2);
          offs2 = d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);
          for (i = offs2; i < offs2 + length; ++i) {
            d.dest[d.destLen++] = d.dest[i];
          }
        }
      }
    }
    function tinf_inflate_uncompressed_block(d) {
      var length, invlength;
      var i;
      while (d.bitcount > 8) {
        d.sourceIndex--;
        d.bitcount -= 8;
      }
      length = d.source[d.sourceIndex + 1];
      length = 256 * length + d.source[d.sourceIndex];
      invlength = d.source[d.sourceIndex + 3];
      invlength = 256 * invlength + d.source[d.sourceIndex + 2];
      if (length !== (~invlength & 65535))
        return TINF_DATA_ERROR;
      d.sourceIndex += 4;
      for (i = length; i; --i)
        d.dest[d.destLen++] = d.source[d.sourceIndex++];
      d.bitcount = 0;
      return TINF_OK;
    }
    function tinf_uncompress(source, dest) {
      var d = new Data(source, dest);
      var bfinal, btype, res;
      do {
        bfinal = tinf_getbit(d);
        btype = tinf_read_bits(d, 2, 0);
        switch (btype) {
          case 0:
            res = tinf_inflate_uncompressed_block(d);
            break;
          case 1:
            res = tinf_inflate_block_data(d, sltree, sdtree);
            break;
          case 2:
            tinf_decode_trees(d, d.ltree, d.dtree);
            res = tinf_inflate_block_data(d, d.ltree, d.dtree);
            break;
          default:
            res = TINF_DATA_ERROR;
        }
        if (res !== TINF_OK)
          throw new Error("Data error");
      } while (!bfinal);
      if (d.destLen < d.dest.length) {
        if (typeof d.dest.slice === "function")
          return d.dest.slice(0, d.destLen);
        else
          return d.dest.subarray(0, d.destLen);
      }
      return d.dest;
    }
    tinf_build_fixed_trees(sltree, sdtree);
    tinf_build_bits_base(length_bits, length_base, 4, 3);
    tinf_build_bits_base(dist_bits, dist_base, 2, 1);
    length_bits[28] = 0;
    length_base[28] = 258;
    module.exports = tinf_uncompress;
  }
});

// node_modules/.pnpm/unicode-trie@2.0.0/node_modules/unicode-trie/swap.js
var require_swap = __commonJS({
  "node_modules/.pnpm/unicode-trie@2.0.0/node_modules/unicode-trie/swap.js"(exports2, module) {
    var isBigEndian = new Uint8Array(new Uint32Array([305419896]).buffer)[0] === 18;
    var swap = (b, n, m) => {
      let i = b[n];
      b[n] = b[m];
      b[m] = i;
    };
    var swap32 = (array) => {
      const len = array.length;
      for (let i = 0; i < len; i += 4) {
        swap(array, i, i + 3);
        swap(array, i + 1, i + 2);
      }
    };
    var swap32LE = (array) => {
      if (isBigEndian) {
        swap32(array);
      }
    };
    module.exports = {
      swap32LE
    };
  }
});

// node_modules/.pnpm/unicode-trie@2.0.0/node_modules/unicode-trie/index.js
var require_unicode_trie = __commonJS({
  "node_modules/.pnpm/unicode-trie@2.0.0/node_modules/unicode-trie/index.js"(exports2, module) {
    var inflate = require_tiny_inflate();
    var { swap32LE } = require_swap();
    var SHIFT_1 = 6 + 5;
    var SHIFT_2 = 5;
    var SHIFT_1_2 = SHIFT_1 - SHIFT_2;
    var OMITTED_BMP_INDEX_1_LENGTH = 65536 >> SHIFT_1;
    var INDEX_2_BLOCK_LENGTH = 1 << SHIFT_1_2;
    var INDEX_2_MASK = INDEX_2_BLOCK_LENGTH - 1;
    var INDEX_SHIFT = 2;
    var DATA_BLOCK_LENGTH = 1 << SHIFT_2;
    var DATA_MASK = DATA_BLOCK_LENGTH - 1;
    var LSCP_INDEX_2_OFFSET = 65536 >> SHIFT_2;
    var LSCP_INDEX_2_LENGTH = 1024 >> SHIFT_2;
    var INDEX_2_BMP_LENGTH = LSCP_INDEX_2_OFFSET + LSCP_INDEX_2_LENGTH;
    var UTF8_2B_INDEX_2_OFFSET = INDEX_2_BMP_LENGTH;
    var UTF8_2B_INDEX_2_LENGTH = 2048 >> 6;
    var INDEX_1_OFFSET = UTF8_2B_INDEX_2_OFFSET + UTF8_2B_INDEX_2_LENGTH;
    var DATA_GRANULARITY = 1 << INDEX_SHIFT;
    var UnicodeTrie = class {
      constructor(data) {
        const isBuffer = typeof data.readUInt32BE === "function" && typeof data.slice === "function";
        if (isBuffer || data instanceof Uint8Array) {
          let uncompressedLength;
          if (isBuffer) {
            this.highStart = data.readUInt32LE(0);
            this.errorValue = data.readUInt32LE(4);
            uncompressedLength = data.readUInt32LE(8);
            data = data.slice(12);
          } else {
            const view = new DataView(data.buffer);
            this.highStart = view.getUint32(0, true);
            this.errorValue = view.getUint32(4, true);
            uncompressedLength = view.getUint32(8, true);
            data = data.subarray(12);
          }
          data = inflate(data, new Uint8Array(uncompressedLength));
          data = inflate(data, new Uint8Array(uncompressedLength));
          swap32LE(data);
          this.data = new Uint32Array(data.buffer);
        } else {
          ({ data: this.data, highStart: this.highStart, errorValue: this.errorValue } = data);
        }
      }
      get(codePoint) {
        let index;
        if (codePoint < 0 || codePoint > 1114111) {
          return this.errorValue;
        }
        if (codePoint < 55296 || codePoint > 56319 && codePoint <= 65535) {
          index = (this.data[codePoint >> SHIFT_2] << INDEX_SHIFT) + (codePoint & DATA_MASK);
          return this.data[index];
        }
        if (codePoint <= 65535) {
          index = (this.data[LSCP_INDEX_2_OFFSET + (codePoint - 55296 >> SHIFT_2)] << INDEX_SHIFT) + (codePoint & DATA_MASK);
          return this.data[index];
        }
        if (codePoint < this.highStart) {
          index = this.data[INDEX_1_OFFSET - OMITTED_BMP_INDEX_1_LENGTH + (codePoint >> SHIFT_1)];
          index = this.data[index + (codePoint >> SHIFT_2 & INDEX_2_MASK)];
          index = (index << INDEX_SHIFT) + (codePoint & DATA_MASK);
          return this.data[index];
        }
        return this.data[this.data.length - DATA_GRANULARITY];
      }
    };
    module.exports = UnicodeTrie;
  }
});

// node_modules/.pnpm/base64-js@0.0.8/node_modules/base64-js/lib/b64.js
var require_b64 = __commonJS({
  "node_modules/.pnpm/base64-js@0.0.8/node_modules/base64-js/lib/b64.js"(exports2) {
    var lookup = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    (function(exports3) {
      "use strict";
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var PLUS = "+".charCodeAt(0);
      var SLASH = "/".charCodeAt(0);
      var NUMBER = "0".charCodeAt(0);
      var LOWER = "a".charCodeAt(0);
      var UPPER = "A".charCodeAt(0);
      var PLUS_URL_SAFE = "-".charCodeAt(0);
      var SLASH_URL_SAFE = "_".charCodeAt(0);
      function decode2(elt) {
        var code = elt.charCodeAt(0);
        if (code === PLUS || code === PLUS_URL_SAFE)
          return 62;
        if (code === SLASH || code === SLASH_URL_SAFE)
          return 63;
        if (code < NUMBER)
          return -1;
        if (code < NUMBER + 10)
          return code - NUMBER + 26 + 26;
        if (code < UPPER + 26)
          return code - UPPER;
        if (code < LOWER + 26)
          return code - LOWER + 26;
      }
      function b64ToByteArray(b64) {
        var i, j, l, tmp, placeHolders, arr;
        if (b64.length % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var len = b64.length;
        placeHolders = b64.charAt(len - 2) === "=" ? 2 : b64.charAt(len - 1) === "=" ? 1 : 0;
        arr = new Arr(b64.length * 3 / 4 - placeHolders);
        l = placeHolders > 0 ? b64.length - 4 : b64.length;
        var L = 0;
        function push(v) {
          arr[L++] = v;
        }
        for (i = 0, j = 0; i < l; i += 4, j += 3) {
          tmp = decode2(b64.charAt(i)) << 18 | decode2(b64.charAt(i + 1)) << 12 | decode2(b64.charAt(i + 2)) << 6 | decode2(b64.charAt(i + 3));
          push((tmp & 16711680) >> 16);
          push((tmp & 65280) >> 8);
          push(tmp & 255);
        }
        if (placeHolders === 2) {
          tmp = decode2(b64.charAt(i)) << 2 | decode2(b64.charAt(i + 1)) >> 4;
          push(tmp & 255);
        } else if (placeHolders === 1) {
          tmp = decode2(b64.charAt(i)) << 10 | decode2(b64.charAt(i + 1)) << 4 | decode2(b64.charAt(i + 2)) >> 2;
          push(tmp >> 8 & 255);
          push(tmp & 255);
        }
        return arr;
      }
      function uint8ToBase64(uint8) {
        var i, extraBytes = uint8.length % 3, output = "", temp, length;
        function encode(num) {
          return lookup.charAt(num);
        }
        function tripletToBase64(num) {
          return encode(num >> 18 & 63) + encode(num >> 12 & 63) + encode(num >> 6 & 63) + encode(num & 63);
        }
        for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
          temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + uint8[i + 2];
          output += tripletToBase64(temp);
        }
        switch (extraBytes) {
          case 1:
            temp = uint8[uint8.length - 1];
            output += encode(temp >> 2);
            output += encode(temp << 4 & 63);
            output += "==";
            break;
          case 2:
            temp = (uint8[uint8.length - 2] << 8) + uint8[uint8.length - 1];
            output += encode(temp >> 10);
            output += encode(temp >> 4 & 63);
            output += encode(temp << 2 & 63);
            output += "=";
            break;
        }
        return output;
      }
      exports3.toByteArray = b64ToByteArray;
      exports3.fromByteArray = uint8ToBase64;
    })(typeof exports2 === "undefined" ? exports2.base64js = {} : exports2);
  }
});

// node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/parse.js
var require_parse = __commonJS({
  "node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/parse.js"(exports2, module) {
    var openParentheses = "(".charCodeAt(0);
    var closeParentheses = ")".charCodeAt(0);
    var singleQuote = "'".charCodeAt(0);
    var doubleQuote = '"'.charCodeAt(0);
    var backslash = "\\".charCodeAt(0);
    var slash = "/".charCodeAt(0);
    var comma = ",".charCodeAt(0);
    var colon = ":".charCodeAt(0);
    var star = "*".charCodeAt(0);
    var uLower = "u".charCodeAt(0);
    var uUpper = "U".charCodeAt(0);
    var plus = "+".charCodeAt(0);
    var isUnicodeRange = /^[a-f0-9?-]+$/i;
    module.exports = function(input) {
      var tokens = [];
      var value = input;
      var next, quote, prev, token, escape, escapePos, whitespacePos, parenthesesOpenPos;
      var pos = 0;
      var code = value.charCodeAt(pos);
      var max2 = value.length;
      var stack = [{ nodes: tokens }];
      var balanced = 0;
      var parent;
      var name = "";
      var before = "";
      var after = "";
      while (pos < max2) {
        if (code <= 32) {
          next = pos;
          do {
            next += 1;
            code = value.charCodeAt(next);
          } while (code <= 32);
          token = value.slice(pos, next);
          prev = tokens[tokens.length - 1];
          if (code === closeParentheses && balanced) {
            after = token;
          } else if (prev && prev.type === "div") {
            prev.after = token;
            prev.sourceEndIndex += token.length;
          } else if (code === comma || code === colon || code === slash && value.charCodeAt(next + 1) !== star && (!parent || parent && parent.type === "function" && parent.value !== "calc")) {
            before = token;
          } else {
            tokens.push({
              type: "space",
              sourceIndex: pos,
              sourceEndIndex: next,
              value: token
            });
          }
          pos = next;
        } else if (code === singleQuote || code === doubleQuote) {
          next = pos;
          quote = code === singleQuote ? "'" : '"';
          token = {
            type: "string",
            sourceIndex: pos,
            quote
          };
          do {
            escape = false;
            next = value.indexOf(quote, next + 1);
            if (~next) {
              escapePos = next;
              while (value.charCodeAt(escapePos - 1) === backslash) {
                escapePos -= 1;
                escape = !escape;
              }
            } else {
              value += quote;
              next = value.length - 1;
              token.unclosed = true;
            }
          } while (escape);
          token.value = value.slice(pos + 1, next);
          token.sourceEndIndex = token.unclosed ? next : next + 1;
          tokens.push(token);
          pos = next + 1;
          code = value.charCodeAt(pos);
        } else if (code === slash && value.charCodeAt(pos + 1) === star) {
          next = value.indexOf("*/", pos);
          token = {
            type: "comment",
            sourceIndex: pos,
            sourceEndIndex: next + 2
          };
          if (next === -1) {
            token.unclosed = true;
            next = value.length;
            token.sourceEndIndex = next;
          }
          token.value = value.slice(pos + 2, next);
          tokens.push(token);
          pos = next + 2;
          code = value.charCodeAt(pos);
        } else if ((code === slash || code === star) && parent && parent.type === "function" && parent.value === "calc") {
          token = value[pos];
          tokens.push({
            type: "word",
            sourceIndex: pos - before.length,
            sourceEndIndex: pos + token.length,
            value: token
          });
          pos += 1;
          code = value.charCodeAt(pos);
        } else if (code === slash || code === comma || code === colon) {
          token = value[pos];
          tokens.push({
            type: "div",
            sourceIndex: pos - before.length,
            sourceEndIndex: pos + token.length,
            value: token,
            before,
            after: ""
          });
          before = "";
          pos += 1;
          code = value.charCodeAt(pos);
        } else if (openParentheses === code) {
          next = pos;
          do {
            next += 1;
            code = value.charCodeAt(next);
          } while (code <= 32);
          parenthesesOpenPos = pos;
          token = {
            type: "function",
            sourceIndex: pos - name.length,
            value: name,
            before: value.slice(parenthesesOpenPos + 1, next)
          };
          pos = next;
          if (name === "url" && code !== singleQuote && code !== doubleQuote) {
            next -= 1;
            do {
              escape = false;
              next = value.indexOf(")", next + 1);
              if (~next) {
                escapePos = next;
                while (value.charCodeAt(escapePos - 1) === backslash) {
                  escapePos -= 1;
                  escape = !escape;
                }
              } else {
                value += ")";
                next = value.length - 1;
                token.unclosed = true;
              }
            } while (escape);
            whitespacePos = next;
            do {
              whitespacePos -= 1;
              code = value.charCodeAt(whitespacePos);
            } while (code <= 32);
            if (parenthesesOpenPos < whitespacePos) {
              if (pos !== whitespacePos + 1) {
                token.nodes = [
                  {
                    type: "word",
                    sourceIndex: pos,
                    sourceEndIndex: whitespacePos + 1,
                    value: value.slice(pos, whitespacePos + 1)
                  }
                ];
              } else {
                token.nodes = [];
              }
              if (token.unclosed && whitespacePos + 1 !== next) {
                token.after = "";
                token.nodes.push({
                  type: "space",
                  sourceIndex: whitespacePos + 1,
                  sourceEndIndex: next,
                  value: value.slice(whitespacePos + 1, next)
                });
              } else {
                token.after = value.slice(whitespacePos + 1, next);
                token.sourceEndIndex = next;
              }
            } else {
              token.after = "";
              token.nodes = [];
            }
            pos = next + 1;
            token.sourceEndIndex = token.unclosed ? next : pos;
            code = value.charCodeAt(pos);
            tokens.push(token);
          } else {
            balanced += 1;
            token.after = "";
            token.sourceEndIndex = pos + 1;
            tokens.push(token);
            stack.push(token);
            tokens = token.nodes = [];
            parent = token;
          }
          name = "";
        } else if (closeParentheses === code && balanced) {
          pos += 1;
          code = value.charCodeAt(pos);
          parent.after = after;
          parent.sourceEndIndex += after.length;
          after = "";
          balanced -= 1;
          stack[stack.length - 1].sourceEndIndex = pos;
          stack.pop();
          parent = stack[balanced];
          tokens = parent.nodes;
        } else {
          next = pos;
          do {
            if (code === backslash) {
              next += 1;
            }
            next += 1;
            code = value.charCodeAt(next);
          } while (next < max2 && !(code <= 32 || code === singleQuote || code === doubleQuote || code === comma || code === colon || code === slash || code === openParentheses || code === star && parent && parent.type === "function" && parent.value === "calc" || code === slash && parent.type === "function" && parent.value === "calc" || code === closeParentheses && balanced));
          token = value.slice(pos, next);
          if (openParentheses === code) {
            name = token;
          } else if ((uLower === token.charCodeAt(0) || uUpper === token.charCodeAt(0)) && plus === token.charCodeAt(1) && isUnicodeRange.test(token.slice(2))) {
            tokens.push({
              type: "unicode-range",
              sourceIndex: pos,
              sourceEndIndex: next,
              value: token
            });
          } else {
            tokens.push({
              type: "word",
              sourceIndex: pos,
              sourceEndIndex: next,
              value: token
            });
          }
          pos = next;
        }
      }
      for (pos = stack.length - 1; pos; pos -= 1) {
        stack[pos].unclosed = true;
        stack[pos].sourceEndIndex = value.length;
      }
      return stack[0].nodes;
    };
  }
});

// node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/walk.js
var require_walk = __commonJS({
  "node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/walk.js"(exports2, module) {
    module.exports = function walk(nodes, cb, bubble) {
      var i, max2, node, result;
      for (i = 0, max2 = nodes.length; i < max2; i += 1) {
        node = nodes[i];
        if (!bubble) {
          result = cb(node, i, nodes);
        }
        if (result !== false && node.type === "function" && Array.isArray(node.nodes)) {
          walk(node.nodes, cb, bubble);
        }
        if (bubble) {
          cb(node, i, nodes);
        }
      }
    };
  }
});

// node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/stringify.js
var require_stringify = __commonJS({
  "node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/stringify.js"(exports2, module) {
    function stringifyNode(node, custom) {
      var type = node.type;
      var value = node.value;
      var buf;
      var customResult;
      if (custom && (customResult = custom(node)) !== void 0) {
        return customResult;
      } else if (type === "word" || type === "space") {
        return value;
      } else if (type === "string") {
        buf = node.quote || "";
        return buf + value + (node.unclosed ? "" : buf);
      } else if (type === "comment") {
        return "/*" + value + (node.unclosed ? "" : "*/");
      } else if (type === "div") {
        return (node.before || "") + value + (node.after || "");
      } else if (Array.isArray(node.nodes)) {
        buf = stringify(node.nodes, custom);
        if (type !== "function") {
          return buf;
        }
        return value + "(" + (node.before || "") + buf + (node.after || "") + (node.unclosed ? "" : ")");
      }
      return value;
    }
    function stringify(nodes, custom) {
      var result, i;
      if (Array.isArray(nodes)) {
        result = "";
        for (i = nodes.length - 1; ~i; i -= 1) {
          result = stringifyNode(nodes[i], custom) + result;
        }
        return result;
      }
      return stringifyNode(nodes, custom);
    }
    module.exports = stringify;
  }
});

// node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/unit.js
var require_unit = __commonJS({
  "node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/unit.js"(exports2, module) {
    var minus = "-".charCodeAt(0);
    var plus = "+".charCodeAt(0);
    var dot = ".".charCodeAt(0);
    var exp = "e".charCodeAt(0);
    var EXP = "E".charCodeAt(0);
    function likeNumber(value) {
      var code = value.charCodeAt(0);
      var nextCode;
      if (code === plus || code === minus) {
        nextCode = value.charCodeAt(1);
        if (nextCode >= 48 && nextCode <= 57) {
          return true;
        }
        var nextNextCode = value.charCodeAt(2);
        if (nextCode === dot && nextNextCode >= 48 && nextNextCode <= 57) {
          return true;
        }
        return false;
      }
      if (code === dot) {
        nextCode = value.charCodeAt(1);
        if (nextCode >= 48 && nextCode <= 57) {
          return true;
        }
        return false;
      }
      if (code >= 48 && code <= 57) {
        return true;
      }
      return false;
    }
    module.exports = function(value) {
      var pos = 0;
      var length = value.length;
      var code;
      var nextCode;
      var nextNextCode;
      if (length === 0 || !likeNumber(value)) {
        return false;
      }
      code = value.charCodeAt(pos);
      if (code === plus || code === minus) {
        pos++;
      }
      while (pos < length) {
        code = value.charCodeAt(pos);
        if (code < 48 || code > 57) {
          break;
        }
        pos += 1;
      }
      code = value.charCodeAt(pos);
      nextCode = value.charCodeAt(pos + 1);
      if (code === dot && nextCode >= 48 && nextCode <= 57) {
        pos += 2;
        while (pos < length) {
          code = value.charCodeAt(pos);
          if (code < 48 || code > 57) {
            break;
          }
          pos += 1;
        }
      }
      code = value.charCodeAt(pos);
      nextCode = value.charCodeAt(pos + 1);
      nextNextCode = value.charCodeAt(pos + 2);
      if ((code === exp || code === EXP) && (nextCode >= 48 && nextCode <= 57 || (nextCode === plus || nextCode === minus) && nextNextCode >= 48 && nextNextCode <= 57)) {
        pos += nextCode === plus || nextCode === minus ? 3 : 2;
        while (pos < length) {
          code = value.charCodeAt(pos);
          if (code < 48 || code > 57) {
            break;
          }
          pos += 1;
        }
      }
      return {
        number: value.slice(0, pos),
        unit: value.slice(pos)
      };
    };
  }
});

// node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/index.js
var require_lib = __commonJS({
  "node_modules/.pnpm/postcss-value-parser@4.2.0/node_modules/postcss-value-parser/lib/index.js"(exports2, module) {
    var parse2 = require_parse();
    var walk = require_walk();
    var stringify = require_stringify();
    function ValueParser(value) {
      if (this instanceof ValueParser) {
        this.nodes = parse2(value);
        return this;
      }
      return new ValueParser(value);
    }
    ValueParser.prototype.toString = function() {
      return Array.isArray(this.nodes) ? stringify(this.nodes) : "";
    };
    ValueParser.prototype.walk = function(cb, bubble) {
      walk(this.nodes, cb, bubble);
      return this;
    };
    ValueParser.unit = require_unit();
    ValueParser.walk = walk;
    ValueParser.stringify = stringify;
    module.exports = ValueParser;
  }
});

// node_modules/.pnpm/camelize@1.0.0/node_modules/camelize/index.js
var require_camelize = __commonJS({
  "node_modules/.pnpm/camelize@1.0.0/node_modules/camelize/index.js"(exports2, module) {
    module.exports = function(obj) {
      if (typeof obj === "string")
        return camelCase(obj);
      return walk(obj);
    };
    function walk(obj) {
      if (!obj || typeof obj !== "object")
        return obj;
      if (isDate(obj) || isRegex(obj))
        return obj;
      if (isArray(obj))
        return map(obj, walk);
      return reduce(objectKeys(obj), function(acc, key) {
        var camel = camelCase(key);
        acc[camel] = walk(obj[key]);
        return acc;
      }, {});
    }
    function camelCase(str) {
      return str.replace(/[_.-](\w|$)/g, function(_, x) {
        return x.toUpperCase();
      });
    }
    var isArray = Array.isArray || function(obj) {
      return Object.prototype.toString.call(obj) === "[object Array]";
    };
    var isDate = function(obj) {
      return Object.prototype.toString.call(obj) === "[object Date]";
    };
    var isRegex = function(obj) {
      return Object.prototype.toString.call(obj) === "[object RegExp]";
    };
    var has = Object.prototype.hasOwnProperty;
    var objectKeys = Object.keys || function(obj) {
      var keys = [];
      for (var key in obj) {
        if (has.call(obj, key))
          keys.push(key);
      }
      return keys;
    };
    function map(xs, f) {
      if (xs.map)
        return xs.map(f);
      var res = [];
      for (var i = 0; i < xs.length; i++) {
        res.push(f(xs[i], i));
      }
      return res;
    }
    function reduce(xs, f, acc) {
      if (xs.reduce)
        return xs.reduce(f, acc);
      for (var i = 0; i < xs.length; i++) {
        acc = f(acc, xs[i], i);
      }
      return acc;
    }
  }
});

// node_modules/.pnpm/css-color-keywords@1.0.0/node_modules/css-color-keywords/colors.json
var require_colors = __commonJS({
  "node_modules/.pnpm/css-color-keywords@1.0.0/node_modules/css-color-keywords/colors.json"(exports2, module) {
    module.exports = {
      black: "#000000",
      silver: "#c0c0c0",
      gray: "#808080",
      white: "#ffffff",
      maroon: "#800000",
      red: "#ff0000",
      purple: "#800080",
      fuchsia: "#ff00ff",
      green: "#008000",
      lime: "#00ff00",
      olive: "#808000",
      yellow: "#ffff00",
      navy: "#000080",
      blue: "#0000ff",
      teal: "#008080",
      aqua: "#00ffff",
      orange: "#ffa500",
      aliceblue: "#f0f8ff",
      antiquewhite: "#faebd7",
      aquamarine: "#7fffd4",
      azure: "#f0ffff",
      beige: "#f5f5dc",
      bisque: "#ffe4c4",
      blanchedalmond: "#ffebcd",
      blueviolet: "#8a2be2",
      brown: "#a52a2a",
      burlywood: "#deb887",
      cadetblue: "#5f9ea0",
      chartreuse: "#7fff00",
      chocolate: "#d2691e",
      coral: "#ff7f50",
      cornflowerblue: "#6495ed",
      cornsilk: "#fff8dc",
      crimson: "#dc143c",
      darkblue: "#00008b",
      darkcyan: "#008b8b",
      darkgoldenrod: "#b8860b",
      darkgray: "#a9a9a9",
      darkgreen: "#006400",
      darkgrey: "#a9a9a9",
      darkkhaki: "#bdb76b",
      darkmagenta: "#8b008b",
      darkolivegreen: "#556b2f",
      darkorange: "#ff8c00",
      darkorchid: "#9932cc",
      darkred: "#8b0000",
      darksalmon: "#e9967a",
      darkseagreen: "#8fbc8f",
      darkslateblue: "#483d8b",
      darkslategray: "#2f4f4f",
      darkslategrey: "#2f4f4f",
      darkturquoise: "#00ced1",
      darkviolet: "#9400d3",
      deeppink: "#ff1493",
      deepskyblue: "#00bfff",
      dimgray: "#696969",
      dimgrey: "#696969",
      dodgerblue: "#1e90ff",
      firebrick: "#b22222",
      floralwhite: "#fffaf0",
      forestgreen: "#228b22",
      gainsboro: "#dcdcdc",
      ghostwhite: "#f8f8ff",
      gold: "#ffd700",
      goldenrod: "#daa520",
      greenyellow: "#adff2f",
      grey: "#808080",
      honeydew: "#f0fff0",
      hotpink: "#ff69b4",
      indianred: "#cd5c5c",
      indigo: "#4b0082",
      ivory: "#fffff0",
      khaki: "#f0e68c",
      lavender: "#e6e6fa",
      lavenderblush: "#fff0f5",
      lawngreen: "#7cfc00",
      lemonchiffon: "#fffacd",
      lightblue: "#add8e6",
      lightcoral: "#f08080",
      lightcyan: "#e0ffff",
      lightgoldenrodyellow: "#fafad2",
      lightgray: "#d3d3d3",
      lightgreen: "#90ee90",
      lightgrey: "#d3d3d3",
      lightpink: "#ffb6c1",
      lightsalmon: "#ffa07a",
      lightseagreen: "#20b2aa",
      lightskyblue: "#87cefa",
      lightslategray: "#778899",
      lightslategrey: "#778899",
      lightsteelblue: "#b0c4de",
      lightyellow: "#ffffe0",
      limegreen: "#32cd32",
      linen: "#faf0e6",
      mediumaquamarine: "#66cdaa",
      mediumblue: "#0000cd",
      mediumorchid: "#ba55d3",
      mediumpurple: "#9370db",
      mediumseagreen: "#3cb371",
      mediumslateblue: "#7b68ee",
      mediumspringgreen: "#00fa9a",
      mediumturquoise: "#48d1cc",
      mediumvioletred: "#c71585",
      midnightblue: "#191970",
      mintcream: "#f5fffa",
      mistyrose: "#ffe4e1",
      moccasin: "#ffe4b5",
      navajowhite: "#ffdead",
      oldlace: "#fdf5e6",
      olivedrab: "#6b8e23",
      orangered: "#ff4500",
      orchid: "#da70d6",
      palegoldenrod: "#eee8aa",
      palegreen: "#98fb98",
      paleturquoise: "#afeeee",
      palevioletred: "#db7093",
      papayawhip: "#ffefd5",
      peachpuff: "#ffdab9",
      peru: "#cd853f",
      pink: "#ffc0cb",
      plum: "#dda0dd",
      powderblue: "#b0e0e6",
      rosybrown: "#bc8f8f",
      royalblue: "#4169e1",
      saddlebrown: "#8b4513",
      salmon: "#fa8072",
      sandybrown: "#f4a460",
      seagreen: "#2e8b57",
      seashell: "#fff5ee",
      sienna: "#a0522d",
      skyblue: "#87ceeb",
      slateblue: "#6a5acd",
      slategray: "#708090",
      slategrey: "#708090",
      snow: "#fffafa",
      springgreen: "#00ff7f",
      steelblue: "#4682b4",
      tan: "#d2b48c",
      thistle: "#d8bfd8",
      tomato: "#ff6347",
      turquoise: "#40e0d0",
      violet: "#ee82ee",
      wheat: "#f5deb3",
      whitesmoke: "#f5f5f5",
      yellowgreen: "#9acd32",
      rebeccapurple: "#663399"
    };
  }
});

// node_modules/.pnpm/css-color-keywords@1.0.0/node_modules/css-color-keywords/index.js
var require_css_color_keywords = __commonJS({
  "node_modules/.pnpm/css-color-keywords@1.0.0/node_modules/css-color-keywords/index.js"(exports2, module) {
    "use strict";
    module.exports = require_colors();
  }
});

// node_modules/.pnpm/css-to-react-native@3.0.0/node_modules/css-to-react-native/index.js
var require_css_to_react_native = __commonJS({
  "node_modules/.pnpm/css-to-react-native@3.0.0/node_modules/css-to-react-native/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _interopDefault(ex) {
      return ex && typeof ex === "object" && "default" in ex ? ex["default"] : ex;
    }
    var parse2 = require_lib();
    var parse__default = _interopDefault(parse2);
    var camelizeStyleName = _interopDefault(require_camelize());
    var cssColorKeywords = _interopDefault(require_css_color_keywords());
    var matchString = function matchString2(node) {
      if (node.type !== "string")
        return null;
      return node.value.replace(/\\([0-9a-f]{1,6})(?:\s|$)/gi, function(match, charCode) {
        return String.fromCharCode(parseInt(charCode, 16));
      }).replace(/\\/g, "");
    };
    var hexColorRe = /^(#(?:[0-9a-f]{3,4}){1,2})$/i;
    var cssFunctionNameRe = /^(rgba?|hsla?|hwb|lab|lch|gray|color)$/;
    var matchColor = function matchColor2(node) {
      if (node.type === "word" && (hexColorRe.test(node.value) || node.value in cssColorKeywords || node.value === "transparent")) {
        return node.value;
      } else if (node.type === "function" && cssFunctionNameRe.test(node.value)) {
        return parse2.stringify(node);
      }
      return null;
    };
    var noneRe = /^(none)$/i;
    var autoRe = /^(auto)$/i;
    var identRe = /(^-?[_a-z][_a-z0-9-]*$)/i;
    var numberRe = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)$/i;
    var lengthRe = /^(0$|(?:[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(?=px$))/i;
    var unsupportedUnitRe = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(ch|em|ex|rem|vh|vw|vmin|vmax|cm|mm|in|pc|pt))$/i;
    var angleRe = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:deg|rad))$/i;
    var percentRe = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%)$/i;
    var noopToken = function noopToken2(predicate) {
      return function(node) {
        return predicate(node) ? "<token>" : null;
      };
    };
    var valueForTypeToken = function valueForTypeToken2(type) {
      return function(node) {
        return node.type === type ? node.value : null;
      };
    };
    var regExpToken = function regExpToken2(regExp, transform2) {
      if (transform2 === void 0) {
        transform2 = String;
      }
      return function(node) {
        if (node.type !== "word")
          return null;
        var match = node.value.match(regExp);
        if (match === null)
          return null;
        var value = transform2(match[1]);
        return value;
      };
    };
    var SPACE = noopToken(function(node) {
      return node.type === "space";
    });
    var SLASH = noopToken(function(node) {
      return node.type === "div" && node.value === "/";
    });
    var COMMA = noopToken(function(node) {
      return node.type === "div" && node.value === ",";
    });
    var WORD = valueForTypeToken("word");
    var NONE = regExpToken(noneRe);
    var AUTO = regExpToken(autoRe);
    var NUMBER = regExpToken(numberRe, Number);
    var LENGTH = regExpToken(lengthRe, Number);
    var UNSUPPORTED_LENGTH_UNIT = regExpToken(unsupportedUnitRe);
    var ANGLE = regExpToken(angleRe, function(angle) {
      return angle.toLowerCase();
    });
    var PERCENT = regExpToken(percentRe);
    var IDENT = regExpToken(identRe);
    var STRING = matchString;
    var COLOR = matchColor;
    var LINE = regExpToken(/^(none|underline|line-through)$/i);
    var BORDER_STYLE = regExpToken(/^(solid|dashed|dotted)$/);
    var defaultBorderWidth = 1;
    var defaultBorderColor = "black";
    var defaultBorderStyle = "solid";
    var border = function border2(tokenStream) {
      var borderWidth2;
      var borderColor2;
      var borderStyle;
      if (tokenStream.matches(NONE)) {
        tokenStream.expectEmpty();
        return {
          borderWidth: 0,
          borderColor: "black",
          borderStyle: "solid"
        };
      }
      var partsParsed = 0;
      while (partsParsed < 3 && tokenStream.hasTokens()) {
        if (partsParsed !== 0)
          tokenStream.expect(SPACE);
        if (borderWidth2 === void 0 && tokenStream.matches(LENGTH, UNSUPPORTED_LENGTH_UNIT)) {
          borderWidth2 = tokenStream.lastValue;
        } else if (borderColor2 === void 0 && tokenStream.matches(COLOR)) {
          borderColor2 = tokenStream.lastValue;
        } else if (borderStyle === void 0 && tokenStream.matches(BORDER_STYLE)) {
          borderStyle = tokenStream.lastValue;
        } else {
          tokenStream["throw"]();
        }
        partsParsed += 1;
      }
      tokenStream.expectEmpty();
      if (borderWidth2 === void 0)
        borderWidth2 = defaultBorderWidth;
      if (borderColor2 === void 0)
        borderColor2 = defaultBorderColor;
      if (borderStyle === void 0)
        borderStyle = defaultBorderStyle;
      return {
        borderWidth: borderWidth2,
        borderColor: borderColor2,
        borderStyle
      };
    };
    var directionFactory = function directionFactory2(_ref) {
      var _ref$types = _ref.types, types = _ref$types === void 0 ? [LENGTH, UNSUPPORTED_LENGTH_UNIT, PERCENT] : _ref$types, _ref$directions = _ref.directions, directions = _ref$directions === void 0 ? ["Top", "Right", "Bottom", "Left"] : _ref$directions, _ref$prefix = _ref.prefix, prefix = _ref$prefix === void 0 ? "" : _ref$prefix, _ref$suffix = _ref.suffix, suffix = _ref$suffix === void 0 ? "" : _ref$suffix;
      return function(tokenStream) {
        var _ref2;
        var values = [];
        values.push(tokenStream.expect.apply(tokenStream, types));
        while (values.length < 4 && tokenStream.hasTokens()) {
          tokenStream.expect(SPACE);
          values.push(tokenStream.expect.apply(tokenStream, types));
        }
        tokenStream.expectEmpty();
        var top = values[0], _values$ = values[1], right = _values$ === void 0 ? top : _values$, _values$2 = values[2], bottom = _values$2 === void 0 ? top : _values$2, _values$3 = values[3], left = _values$3 === void 0 ? right : _values$3;
        var keyFor = function keyFor2(n) {
          return "" + prefix + directions[n] + suffix;
        };
        return _ref2 = {}, _ref2[keyFor(0)] = top, _ref2[keyFor(1)] = right, _ref2[keyFor(2)] = bottom, _ref2[keyFor(3)] = left, _ref2;
      };
    };
    var parseShadowOffset = function parseShadowOffset2(tokenStream) {
      var width = tokenStream.expect(LENGTH);
      var height = tokenStream.matches(SPACE) ? tokenStream.expect(LENGTH) : width;
      tokenStream.expectEmpty();
      return {
        width,
        height
      };
    };
    var parseShadow = function parseShadow2(tokenStream) {
      var offsetX;
      var offsetY;
      var radius;
      var color;
      if (tokenStream.matches(NONE)) {
        tokenStream.expectEmpty();
        return {
          offset: {
            width: 0,
            height: 0
          },
          radius: 0,
          color: "black"
        };
      }
      var didParseFirst = false;
      while (tokenStream.hasTokens()) {
        if (didParseFirst)
          tokenStream.expect(SPACE);
        if (offsetX === void 0 && tokenStream.matches(LENGTH, UNSUPPORTED_LENGTH_UNIT)) {
          offsetX = tokenStream.lastValue;
          tokenStream.expect(SPACE);
          offsetY = tokenStream.expect(LENGTH, UNSUPPORTED_LENGTH_UNIT);
          tokenStream.saveRewindPoint();
          if (tokenStream.matches(SPACE) && tokenStream.matches(LENGTH, UNSUPPORTED_LENGTH_UNIT)) {
            radius = tokenStream.lastValue;
          } else {
            tokenStream.rewind();
          }
        } else if (color === void 0 && tokenStream.matches(COLOR)) {
          color = tokenStream.lastValue;
        } else {
          tokenStream["throw"]();
        }
        didParseFirst = true;
      }
      if (offsetX === void 0)
        tokenStream["throw"]();
      return {
        offset: {
          width: offsetX,
          height: offsetY
        },
        radius: radius !== void 0 ? radius : 0,
        color: color !== void 0 ? color : "black"
      };
    };
    var boxShadow = function boxShadow2(tokenStream) {
      var _parseShadow = parseShadow(tokenStream), offset = _parseShadow.offset, radius = _parseShadow.radius, color = _parseShadow.color;
      return {
        shadowOffset: offset,
        shadowRadius: radius,
        shadowColor: color,
        shadowOpacity: 1
      };
    };
    var defaultFlexGrow = 1;
    var defaultFlexShrink = 1;
    var defaultFlexBasis = 0;
    var flex = function flex2(tokenStream) {
      var flexGrow;
      var flexShrink;
      var flexBasis;
      if (tokenStream.matches(NONE)) {
        tokenStream.expectEmpty();
        return {
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: "auto"
        };
      }
      tokenStream.saveRewindPoint();
      if (tokenStream.matches(AUTO) && !tokenStream.hasTokens()) {
        return {
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: "auto"
        };
      }
      tokenStream.rewind();
      var partsParsed = 0;
      while (partsParsed < 2 && tokenStream.hasTokens()) {
        if (partsParsed !== 0)
          tokenStream.expect(SPACE);
        if (flexGrow === void 0 && tokenStream.matches(NUMBER)) {
          flexGrow = tokenStream.lastValue;
          tokenStream.saveRewindPoint();
          if (tokenStream.matches(SPACE) && tokenStream.matches(NUMBER)) {
            flexShrink = tokenStream.lastValue;
          } else {
            tokenStream.rewind();
          }
        } else if (flexBasis === void 0 && tokenStream.matches(LENGTH, UNSUPPORTED_LENGTH_UNIT, PERCENT)) {
          flexBasis = tokenStream.lastValue;
        } else if (flexBasis === void 0 && tokenStream.matches(AUTO)) {
          flexBasis = "auto";
        } else {
          tokenStream["throw"]();
        }
        partsParsed += 1;
      }
      tokenStream.expectEmpty();
      if (flexGrow === void 0)
        flexGrow = defaultFlexGrow;
      if (flexShrink === void 0)
        flexShrink = defaultFlexShrink;
      if (flexBasis === void 0)
        flexBasis = defaultFlexBasis;
      return {
        flexGrow,
        flexShrink,
        flexBasis
      };
    };
    var FLEX_WRAP = regExpToken(/(nowrap|wrap|wrap-reverse)/);
    var FLEX_DIRECTION = regExpToken(/(row|row-reverse|column|column-reverse)/);
    var defaultFlexWrap = "nowrap";
    var defaultFlexDirection = "row";
    var flexFlow = function flexFlow2(tokenStream) {
      var flexWrap;
      var flexDirection;
      var partsParsed = 0;
      while (partsParsed < 2 && tokenStream.hasTokens()) {
        if (partsParsed !== 0)
          tokenStream.expect(SPACE);
        if (flexWrap === void 0 && tokenStream.matches(FLEX_WRAP)) {
          flexWrap = tokenStream.lastValue;
        } else if (flexDirection === void 0 && tokenStream.matches(FLEX_DIRECTION)) {
          flexDirection = tokenStream.lastValue;
        } else {
          tokenStream["throw"]();
        }
        partsParsed += 1;
      }
      tokenStream.expectEmpty();
      if (flexWrap === void 0)
        flexWrap = defaultFlexWrap;
      if (flexDirection === void 0)
        flexDirection = defaultFlexDirection;
      return {
        flexWrap,
        flexDirection
      };
    };
    var fontFamily = function fontFamily2(tokenStream) {
      var fontFamily3;
      if (tokenStream.matches(STRING)) {
        fontFamily3 = tokenStream.lastValue;
      } else {
        fontFamily3 = tokenStream.expect(IDENT);
        while (tokenStream.hasTokens()) {
          tokenStream.expect(SPACE);
          var nextIdent = tokenStream.expect(IDENT);
          fontFamily3 += " " + nextIdent;
        }
      }
      tokenStream.expectEmpty();
      return {
        fontFamily: fontFamily3
      };
    };
    var NORMAL = regExpToken(/^(normal)$/);
    var STYLE = regExpToken(/^(italic)$/);
    var WEIGHT = regExpToken(/^([1-9]00|bold)$/);
    var VARIANT = regExpToken(/^(small-caps)$/);
    var defaultFontStyle = "normal";
    var defaultFontWeight = "normal";
    var defaultFontVariant = [];
    var font = function font2(tokenStream) {
      var fontStyle;
      var fontWeight2;
      var fontVariant2;
      var lineHeight;
      var numStyleWeightVariantMatched = 0;
      while (numStyleWeightVariantMatched < 3 && tokenStream.hasTokens()) {
        if (tokenStream.matches(NORMAL))
          ;
        else if (fontStyle === void 0 && tokenStream.matches(STYLE)) {
          fontStyle = tokenStream.lastValue;
        } else if (fontWeight2 === void 0 && tokenStream.matches(WEIGHT)) {
          fontWeight2 = tokenStream.lastValue;
        } else if (fontVariant2 === void 0 && tokenStream.matches(VARIANT)) {
          fontVariant2 = [tokenStream.lastValue];
        } else {
          break;
        }
        tokenStream.expect(SPACE);
        numStyleWeightVariantMatched += 1;
      }
      var fontSize = tokenStream.expect(LENGTH, UNSUPPORTED_LENGTH_UNIT);
      if (tokenStream.matches(SLASH)) {
        lineHeight = tokenStream.expect(LENGTH, UNSUPPORTED_LENGTH_UNIT);
      }
      tokenStream.expect(SPACE);
      var _fontFamily = fontFamily(tokenStream), fontFamily$1 = _fontFamily.fontFamily;
      if (fontStyle === void 0)
        fontStyle = defaultFontStyle;
      if (fontWeight2 === void 0)
        fontWeight2 = defaultFontWeight;
      if (fontVariant2 === void 0)
        fontVariant2 = defaultFontVariant;
      var out = {
        fontStyle,
        fontWeight: fontWeight2,
        fontVariant: fontVariant2,
        fontSize,
        fontFamily: fontFamily$1
      };
      if (lineHeight !== void 0)
        out.lineHeight = lineHeight;
      return out;
    };
    var ALIGN_CONTENT = regExpToken(/(flex-(?:start|end)|center|stretch|space-(?:between|around))/);
    var JUSTIFY_CONTENT = regExpToken(/(flex-(?:start|end)|center|space-(?:between|around|evenly))/);
    var placeContent = function placeContent2(tokenStream) {
      var alignContent = tokenStream.expect(ALIGN_CONTENT);
      var justifyContent;
      if (tokenStream.hasTokens()) {
        tokenStream.expect(SPACE);
        justifyContent = tokenStream.expect(JUSTIFY_CONTENT);
      } else {
        justifyContent = "stretch";
      }
      tokenStream.expectEmpty();
      return {
        alignContent,
        justifyContent
      };
    };
    var STYLE$1 = regExpToken(/^(solid|double|dotted|dashed)$/);
    var defaultTextDecorationLine = "none";
    var defaultTextDecorationStyle = "solid";
    var defaultTextDecorationColor = "black";
    var textDecoration = function textDecoration2(tokenStream) {
      var line;
      var style;
      var color;
      var didParseFirst = false;
      while (tokenStream.hasTokens()) {
        if (didParseFirst)
          tokenStream.expect(SPACE);
        if (line === void 0 && tokenStream.matches(LINE)) {
          var lines = [tokenStream.lastValue.toLowerCase()];
          tokenStream.saveRewindPoint();
          if (lines[0] !== "none" && tokenStream.matches(SPACE) && tokenStream.matches(LINE)) {
            lines.push(tokenStream.lastValue.toLowerCase());
            lines.sort().reverse();
          } else {
            tokenStream.rewind();
          }
          line = lines.join(" ");
        } else if (style === void 0 && tokenStream.matches(STYLE$1)) {
          style = tokenStream.lastValue;
        } else if (color === void 0 && tokenStream.matches(COLOR)) {
          color = tokenStream.lastValue;
        } else {
          tokenStream["throw"]();
        }
        didParseFirst = true;
      }
      return {
        textDecorationLine: line !== void 0 ? line : defaultTextDecorationLine,
        textDecorationColor: color !== void 0 ? color : defaultTextDecorationColor,
        textDecorationStyle: style !== void 0 ? style : defaultTextDecorationStyle
      };
    };
    var textDecorationLine = function textDecorationLine2(tokenStream) {
      var lines = [];
      var didParseFirst = false;
      while (tokenStream.hasTokens()) {
        if (didParseFirst)
          tokenStream.expect(SPACE);
        lines.push(tokenStream.expect(LINE).toLowerCase());
        didParseFirst = true;
      }
      lines.sort().reverse();
      return {
        textDecorationLine: lines.join(" ")
      };
    };
    var textShadow = function textShadow2(tokenStream) {
      var _parseShadow2 = parseShadow(tokenStream), offset = _parseShadow2.offset, radius = _parseShadow2.radius, color = _parseShadow2.color;
      return {
        textShadowOffset: offset,
        textShadowRadius: radius,
        textShadowColor: color
      };
    };
    var oneOfType = function oneOfType2(tokenType) {
      return function(functionStream) {
        var value = functionStream.expect(tokenType);
        functionStream.expectEmpty();
        return value;
      };
    };
    var singleNumber = oneOfType(NUMBER);
    var singleLength = oneOfType(LENGTH);
    var singleAngle = oneOfType(ANGLE);
    var xyTransformFactory = function xyTransformFactory2(tokenType) {
      return function(key, valueIfOmitted) {
        return function(functionStream) {
          var _ref3, _ref4;
          var x = functionStream.expect(tokenType);
          var y;
          if (functionStream.hasTokens()) {
            functionStream.expect(COMMA);
            y = functionStream.expect(tokenType);
          } else if (valueIfOmitted !== void 0) {
            y = valueIfOmitted;
          } else {
            return x;
          }
          functionStream.expectEmpty();
          return [(_ref3 = {}, _ref3[key + "Y"] = y, _ref3), (_ref4 = {}, _ref4[key + "X"] = x, _ref4)];
        };
      };
    };
    var xyNumber = xyTransformFactory(NUMBER);
    var xyLength = xyTransformFactory(LENGTH);
    var xyAngle = xyTransformFactory(ANGLE);
    var partTransforms = {
      perspective: singleNumber,
      scale: xyNumber("scale"),
      scaleX: singleNumber,
      scaleY: singleNumber,
      translate: xyLength("translate", 0),
      translateX: singleLength,
      translateY: singleLength,
      rotate: singleAngle,
      rotateX: singleAngle,
      rotateY: singleAngle,
      rotateZ: singleAngle,
      skewX: singleAngle,
      skewY: singleAngle,
      skew: xyAngle("skew", "0deg")
    };
    var transform = function transform2(tokenStream) {
      var transforms2 = [];
      var didParseFirst = false;
      while (tokenStream.hasTokens()) {
        if (didParseFirst)
          tokenStream.expect(SPACE);
        var functionStream = tokenStream.expectFunction();
        var functionName = functionStream.functionName;
        var transformedValues = partTransforms[functionName](functionStream);
        if (!Array.isArray(transformedValues)) {
          var _ref5;
          transformedValues = [(_ref5 = {}, _ref5[functionName] = transformedValues, _ref5)];
        }
        transforms2 = transformedValues.concat(transforms2);
        didParseFirst = true;
      }
      return {
        transform: transforms2
      };
    };
    var background = function background2(tokenStream) {
      return {
        backgroundColor: tokenStream.expect(COLOR)
      };
    };
    var borderColor = directionFactory({
      types: [COLOR],
      prefix: "border",
      suffix: "Color"
    });
    var borderRadius = directionFactory({
      directions: ["TopLeft", "TopRight", "BottomRight", "BottomLeft"],
      prefix: "border",
      suffix: "Radius"
    });
    var borderWidth = directionFactory({
      prefix: "border",
      suffix: "Width"
    });
    var margin = directionFactory({
      types: [LENGTH, UNSUPPORTED_LENGTH_UNIT, PERCENT, AUTO],
      prefix: "margin"
    });
    var padding = directionFactory({
      prefix: "padding"
    });
    var fontVariant = function fontVariant2(tokenStream) {
      return {
        fontVariant: [tokenStream.expect(IDENT)]
      };
    };
    var fontWeight = function fontWeight2(tokenStream) {
      return {
        fontWeight: tokenStream.expect(WORD)
      };
    };
    var shadowOffset = function shadowOffset2(tokenStream) {
      return {
        shadowOffset: parseShadowOffset(tokenStream)
      };
    };
    var textShadowOffset = function textShadowOffset2(tokenStream) {
      return {
        textShadowOffset: parseShadowOffset(tokenStream)
      };
    };
    var transforms = {
      background,
      border,
      borderColor,
      borderRadius,
      borderWidth,
      boxShadow,
      flex,
      flexFlow,
      font,
      fontFamily,
      fontVariant,
      fontWeight,
      margin,
      padding,
      placeContent,
      shadowOffset,
      textShadow,
      textShadowOffset,
      textDecoration,
      textDecorationLine,
      transform
    };
    var propertiesWithoutUnits;
    if (process.env.NODE_ENV !== "production") {
      propertiesWithoutUnits = ["aspectRatio", "elevation", "flexGrow", "flexShrink", "opacity", "shadowOpacity", "zIndex"];
    }
    var devPropertiesWithUnitsRegExp = propertiesWithoutUnits != null ? new RegExp(propertiesWithoutUnits.join("|")) : null;
    var SYMBOL_MATCH = "SYMBOL_MATCH";
    var TokenStream = /* @__PURE__ */ function() {
      function TokenStream2(nodes, parent) {
        this.index = 0;
        this.nodes = nodes;
        this.functionName = parent != null ? parent.value : null;
        this.lastValue = null;
        this.rewindIndex = -1;
      }
      var _proto = TokenStream2.prototype;
      _proto.hasTokens = function hasTokens() {
        return this.index <= this.nodes.length - 1;
      };
      _proto[SYMBOL_MATCH] = function() {
        if (!this.hasTokens())
          return null;
        var node = this.nodes[this.index];
        for (var i = 0; i < arguments.length; i += 1) {
          var tokenDescriptor = i < 0 || arguments.length <= i ? void 0 : arguments[i];
          var value = tokenDescriptor(node);
          if (value !== null) {
            this.index += 1;
            this.lastValue = value;
            return value;
          }
        }
        return null;
      };
      _proto.matches = function matches() {
        return this[SYMBOL_MATCH].apply(this, arguments) !== null;
      };
      _proto.expect = function expect() {
        var value = this[SYMBOL_MATCH].apply(this, arguments);
        return value !== null ? value : this["throw"]();
      };
      _proto.matchesFunction = function matchesFunction() {
        var node = this.nodes[this.index];
        if (node.type !== "function")
          return null;
        var value = new TokenStream2(node.nodes, node);
        this.index += 1;
        this.lastValue = null;
        return value;
      };
      _proto.expectFunction = function expectFunction() {
        var value = this.matchesFunction();
        return value !== null ? value : this["throw"]();
      };
      _proto.expectEmpty = function expectEmpty() {
        if (this.hasTokens())
          this["throw"]();
      };
      _proto["throw"] = function _throw() {
        throw new Error("Unexpected token type: " + this.nodes[this.index].type);
      };
      _proto.saveRewindPoint = function saveRewindPoint() {
        this.rewindIndex = this.index;
      };
      _proto.rewind = function rewind() {
        if (this.rewindIndex === -1)
          throw new Error("Internal error");
        this.index = this.rewindIndex;
        this.lastValue = null;
      };
      return TokenStream2;
    }();
    var numberOrLengthRe = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(?:px)?$/i;
    var numberOnlyRe = /^[+-]?(?:\d*\.\d*|[1-9]\d*)(?:e[+-]?\d+)?$/i;
    var boolRe = /^true|false$/i;
    var nullRe = /^null$/i;
    var undefinedRe = /^undefined$/i;
    var transformRawValue = function transformRawValue2(propName, value) {
      if (process.env.NODE_ENV !== "production") {
        var needsUnit = !devPropertiesWithUnitsRegExp.test(propName);
        var isNumberWithoutUnit = numberOnlyRe.test(value);
        if (needsUnit && isNumberWithoutUnit) {
          console.warn('Expected style "' + propName + ": " + value + '" to contain units');
        }
        if (!needsUnit && value !== "0" && !isNumberWithoutUnit) {
          console.warn('Expected style "' + propName + ": " + value + '" to be unitless');
        }
      }
      var numberMatch = value.match(numberOrLengthRe);
      if (numberMatch !== null)
        return Number(numberMatch[1]);
      var boolMatch = value.match(boolRe);
      if (boolMatch !== null)
        return boolMatch[0].toLowerCase() === "true";
      var nullMatch = value.match(nullRe);
      if (nullMatch !== null)
        return null;
      var undefinedMatch = value.match(undefinedRe);
      if (undefinedMatch !== null)
        return void 0;
      return value;
    };
    var baseTransformShorthandValue = function baseTransformShorthandValue2(propName, value) {
      var ast = parse__default(value);
      var tokenStream = new TokenStream(ast.nodes);
      return transforms[propName](tokenStream);
    };
    var transformShorthandValue = process.env.NODE_ENV === "production" ? baseTransformShorthandValue : function(propName, value) {
      try {
        return baseTransformShorthandValue(propName, value);
      } catch (e) {
        throw new Error('Failed to parse declaration "' + propName + ": " + value + '"');
      }
    };
    var getStylesForProperty = function getStylesForProperty2(propName, inputValue, allowShorthand) {
      var _ref6;
      var isRawValue = allowShorthand === false || !(propName in transforms);
      var value = inputValue.trim();
      var propValues = isRawValue ? (_ref6 = {}, _ref6[propName] = transformRawValue(propName, value), _ref6) : transformShorthandValue(propName, value);
      return propValues;
    };
    var getPropertyName = function getPropertyName2(propName) {
      var isCustomProp = /^--\w+/.test(propName);
      if (isCustomProp) {
        return propName;
      }
      return camelizeStyleName(propName);
    };
    var index = function index2(rules, shorthandBlacklist) {
      if (shorthandBlacklist === void 0) {
        shorthandBlacklist = [];
      }
      return rules.reduce(function(accum, rule) {
        var propertyName = getPropertyName(rule[0]);
        var value = rule[1];
        var allowShorthand = shorthandBlacklist.indexOf(propertyName) === -1;
        return Object.assign(accum, getStylesForProperty(propertyName, value, allowShorthand));
      }, {});
    };
    exports2["default"] = index;
    exports2.getPropertyName = getPropertyName;
    exports2.getStylesForProperty = getStylesForProperty;
    exports2.transformRawValue = transformRawValue;
  }
});

// node_modules/.pnpm/css-background-parser@0.1.0/node_modules/css-background-parser/index.js
var require_css_background_parser = __commonJS({
  "node_modules/.pnpm/css-background-parser@0.1.0/node_modules/css-background-parser/index.js"(exports2, module) {
    (function(exports3) {
      function BackgroundList(backgrounds) {
        if (!(this instanceof BackgroundList)) {
          return new BackgroundList();
        }
        this.backgrounds = backgrounds || [];
      }
      BackgroundList.prototype.toString = function() {
        return this.backgrounds.join(", ");
      };
      function Background(props) {
        if (!(this instanceof Background)) {
          return new Background(props);
        }
        props = props || {};
        var bg = this;
        function defprop(name, defaultValue) {
          bg[name] = name in props ? props[name] : defaultValue;
        }
        defprop("color", "");
        defprop("image", "none");
        defprop("attachment", "scroll");
        defprop("clip", "border-box");
        defprop("origin", "padding-box");
        defprop("position", "0% 0%");
        defprop("repeat", "repeat");
        defprop("size", "auto");
      }
      Background.prototype.toString = function() {
        var list = [
          this.image,
          this.repeat,
          this.attachment,
          this.position + " / " + this.size,
          this.origin,
          this.clip
        ];
        if (this.color) {
          list.unshift(this.color);
        }
        return list.join(" ");
      };
      exports3.BackgroundList = BackgroundList;
      exports3.Background = Background;
      function parseImages(cssText) {
        var images = [];
        var tokens = /[,\(\)]/;
        var parens = 0;
        var buffer = "";
        if (cssText == null) {
          return images;
        }
        while (cssText.length) {
          var match = tokens.exec(cssText);
          if (!match) {
            break;
          }
          var char = match[0];
          var ignoreChar = false;
          switch (char) {
            case ",":
              if (!parens) {
                images.push(buffer.trim());
                buffer = "";
                ignoreChar = true;
              }
              break;
            case "(":
              parens++;
              break;
            case ")":
              parens--;
              break;
          }
          var index = match.index + 1;
          buffer += cssText.slice(0, ignoreChar ? index - 1 : index);
          cssText = cssText.slice(index);
        }
        if (buffer.length || cssText.length) {
          images.push((buffer + cssText).trim());
        }
        return images;
      }
      function trim(str) {
        return str.trim();
      }
      function parseSimpleList(cssText) {
        return (cssText || "").split(",").map(trim);
      }
      exports3.parseElementStyle = function(styleObject) {
        var list = new BackgroundList();
        if (styleObject == null) {
          return list;
        }
        var bgImage = parseImages(styleObject.backgroundImage);
        var bgColor = styleObject.backgroundColor;
        var bgAttachment = parseSimpleList(styleObject.backgroundAttachment);
        var bgClip = parseSimpleList(styleObject.backgroundClip);
        var bgOrigin = parseSimpleList(styleObject.backgroundOrigin);
        var bgPosition = parseSimpleList(styleObject.backgroundPosition);
        var bgRepeat = parseSimpleList(styleObject.backgroundRepeat);
        var bgSize = parseSimpleList(styleObject.backgroundSize);
        var background;
        for (var i = 0, ii = bgImage.length; i < ii; i++) {
          background = new Background({
            image: bgImage[i],
            attachment: bgAttachment[i % bgAttachment.length],
            clip: bgClip[i % bgClip.length],
            origin: bgOrigin[i % bgOrigin.length],
            position: bgPosition[i % bgPosition.length],
            repeat: bgRepeat[i % bgRepeat.length],
            size: bgSize[i % bgSize.length]
          });
          if (i === ii - 1) {
            background.color = bgColor;
          }
          list.backgrounds.push(background);
        }
        return list;
      };
    })(function(root) {
      if (typeof module !== "undefined" && module.exports !== void 0)
        return module.exports;
      return root.cssBgParser = {};
    }(exports2));
  }
});

// node_modules/.pnpm/css-box-shadow@1.0.0-3/node_modules/css-box-shadow/index.js
var require_css_box_shadow = __commonJS({
  "node_modules/.pnpm/css-box-shadow@1.0.0-3/node_modules/css-box-shadow/index.js"(exports2, module) {
    var VALUES_REG = /,(?![^\(]*\))/;
    var PARTS_REG = /\s(?![^(]*\))/;
    var LENGTH_REG = /^[0-9]+[a-zA-Z%]+?$/;
    var parseValue = (str) => {
      const parts = str.split(PARTS_REG);
      const inset = parts.includes("inset");
      const last = parts.slice(-1)[0];
      const color = !isLength(last) ? last : void 0;
      const nums = parts.filter((n) => n !== "inset").filter((n) => n !== color).map(toNum);
      const [offsetX, offsetY, blurRadius, spreadRadius] = nums;
      return {
        inset,
        offsetX,
        offsetY,
        blurRadius,
        spreadRadius,
        color
      };
    };
    var stringifyValue = (obj) => {
      const {
        inset,
        offsetX = 0,
        offsetY = 0,
        blurRadius = 0,
        spreadRadius,
        color
      } = obj || {};
      return [
        inset ? "inset" : null,
        offsetX,
        offsetY,
        blurRadius,
        spreadRadius,
        color
      ].filter((v) => v !== null && v !== void 0).map(toPx).map((s) => ("" + s).trim()).join(" ");
    };
    var isLength = (v) => v === "0" || LENGTH_REG.test(v);
    var toNum = (v) => {
      if (!/px$/.test(v) && v !== "0")
        return v;
      const n = parseFloat(v);
      return !isNaN(n) ? n : v;
    };
    var toPx = (n) => typeof n === "number" && n !== 0 ? n + "px" : n;
    var parse2 = (str) => str.split(VALUES_REG).map((s) => s.trim()).map(parseValue);
    var stringify = (arr) => arr.map(stringifyValue).join(", ");
    module.exports = {
      parse: parse2,
      stringify
    };
  }
});

// node_modules/.pnpm/color-name@1.1.4/node_modules/color-name/index.js
var require_color_name = __commonJS({
  "node_modules/.pnpm/color-name@1.1.4/node_modules/color-name/index.js"(exports2, module) {
    "use strict";
    module.exports = {
      "aliceblue": [240, 248, 255],
      "antiquewhite": [250, 235, 215],
      "aqua": [0, 255, 255],
      "aquamarine": [127, 255, 212],
      "azure": [240, 255, 255],
      "beige": [245, 245, 220],
      "bisque": [255, 228, 196],
      "black": [0, 0, 0],
      "blanchedalmond": [255, 235, 205],
      "blue": [0, 0, 255],
      "blueviolet": [138, 43, 226],
      "brown": [165, 42, 42],
      "burlywood": [222, 184, 135],
      "cadetblue": [95, 158, 160],
      "chartreuse": [127, 255, 0],
      "chocolate": [210, 105, 30],
      "coral": [255, 127, 80],
      "cornflowerblue": [100, 149, 237],
      "cornsilk": [255, 248, 220],
      "crimson": [220, 20, 60],
      "cyan": [0, 255, 255],
      "darkblue": [0, 0, 139],
      "darkcyan": [0, 139, 139],
      "darkgoldenrod": [184, 134, 11],
      "darkgray": [169, 169, 169],
      "darkgreen": [0, 100, 0],
      "darkgrey": [169, 169, 169],
      "darkkhaki": [189, 183, 107],
      "darkmagenta": [139, 0, 139],
      "darkolivegreen": [85, 107, 47],
      "darkorange": [255, 140, 0],
      "darkorchid": [153, 50, 204],
      "darkred": [139, 0, 0],
      "darksalmon": [233, 150, 122],
      "darkseagreen": [143, 188, 143],
      "darkslateblue": [72, 61, 139],
      "darkslategray": [47, 79, 79],
      "darkslategrey": [47, 79, 79],
      "darkturquoise": [0, 206, 209],
      "darkviolet": [148, 0, 211],
      "deeppink": [255, 20, 147],
      "deepskyblue": [0, 191, 255],
      "dimgray": [105, 105, 105],
      "dimgrey": [105, 105, 105],
      "dodgerblue": [30, 144, 255],
      "firebrick": [178, 34, 34],
      "floralwhite": [255, 250, 240],
      "forestgreen": [34, 139, 34],
      "fuchsia": [255, 0, 255],
      "gainsboro": [220, 220, 220],
      "ghostwhite": [248, 248, 255],
      "gold": [255, 215, 0],
      "goldenrod": [218, 165, 32],
      "gray": [128, 128, 128],
      "green": [0, 128, 0],
      "greenyellow": [173, 255, 47],
      "grey": [128, 128, 128],
      "honeydew": [240, 255, 240],
      "hotpink": [255, 105, 180],
      "indianred": [205, 92, 92],
      "indigo": [75, 0, 130],
      "ivory": [255, 255, 240],
      "khaki": [240, 230, 140],
      "lavender": [230, 230, 250],
      "lavenderblush": [255, 240, 245],
      "lawngreen": [124, 252, 0],
      "lemonchiffon": [255, 250, 205],
      "lightblue": [173, 216, 230],
      "lightcoral": [240, 128, 128],
      "lightcyan": [224, 255, 255],
      "lightgoldenrodyellow": [250, 250, 210],
      "lightgray": [211, 211, 211],
      "lightgreen": [144, 238, 144],
      "lightgrey": [211, 211, 211],
      "lightpink": [255, 182, 193],
      "lightsalmon": [255, 160, 122],
      "lightseagreen": [32, 178, 170],
      "lightskyblue": [135, 206, 250],
      "lightslategray": [119, 136, 153],
      "lightslategrey": [119, 136, 153],
      "lightsteelblue": [176, 196, 222],
      "lightyellow": [255, 255, 224],
      "lime": [0, 255, 0],
      "limegreen": [50, 205, 50],
      "linen": [250, 240, 230],
      "magenta": [255, 0, 255],
      "maroon": [128, 0, 0],
      "mediumaquamarine": [102, 205, 170],
      "mediumblue": [0, 0, 205],
      "mediumorchid": [186, 85, 211],
      "mediumpurple": [147, 112, 219],
      "mediumseagreen": [60, 179, 113],
      "mediumslateblue": [123, 104, 238],
      "mediumspringgreen": [0, 250, 154],
      "mediumturquoise": [72, 209, 204],
      "mediumvioletred": [199, 21, 133],
      "midnightblue": [25, 25, 112],
      "mintcream": [245, 255, 250],
      "mistyrose": [255, 228, 225],
      "moccasin": [255, 228, 181],
      "navajowhite": [255, 222, 173],
      "navy": [0, 0, 128],
      "oldlace": [253, 245, 230],
      "olive": [128, 128, 0],
      "olivedrab": [107, 142, 35],
      "orange": [255, 165, 0],
      "orangered": [255, 69, 0],
      "orchid": [218, 112, 214],
      "palegoldenrod": [238, 232, 170],
      "palegreen": [152, 251, 152],
      "paleturquoise": [175, 238, 238],
      "palevioletred": [219, 112, 147],
      "papayawhip": [255, 239, 213],
      "peachpuff": [255, 218, 185],
      "peru": [205, 133, 63],
      "pink": [255, 192, 203],
      "plum": [221, 160, 221],
      "powderblue": [176, 224, 230],
      "purple": [128, 0, 128],
      "rebeccapurple": [102, 51, 153],
      "red": [255, 0, 0],
      "rosybrown": [188, 143, 143],
      "royalblue": [65, 105, 225],
      "saddlebrown": [139, 69, 19],
      "salmon": [250, 128, 114],
      "sandybrown": [244, 164, 96],
      "seagreen": [46, 139, 87],
      "seashell": [255, 245, 238],
      "sienna": [160, 82, 45],
      "silver": [192, 192, 192],
      "skyblue": [135, 206, 235],
      "slateblue": [106, 90, 205],
      "slategray": [112, 128, 144],
      "slategrey": [112, 128, 144],
      "snow": [255, 250, 250],
      "springgreen": [0, 255, 127],
      "steelblue": [70, 130, 180],
      "tan": [210, 180, 140],
      "teal": [0, 128, 128],
      "thistle": [216, 191, 216],
      "tomato": [255, 99, 71],
      "turquoise": [64, 224, 208],
      "violet": [238, 130, 238],
      "wheat": [245, 222, 179],
      "white": [255, 255, 255],
      "whitesmoke": [245, 245, 245],
      "yellow": [255, 255, 0],
      "yellowgreen": [154, 205, 50]
    };
  }
});

// node_modules/.pnpm/hex-rgb@4.3.0/node_modules/hex-rgb/index.js
var require_hex_rgb = __commonJS({
  "node_modules/.pnpm/hex-rgb@4.3.0/node_modules/hex-rgb/index.js"(exports2, module) {
    "use strict";
    var hexCharacters = "a-f\\d";
    var match3or4Hex = `#?[${hexCharacters}]{3}[${hexCharacters}]?`;
    var match6or8Hex = `#?[${hexCharacters}]{6}([${hexCharacters}]{2})?`;
    var nonHexChars = new RegExp(`[^#${hexCharacters}]`, "gi");
    var validHexSize = new RegExp(`^${match3or4Hex}$|^${match6or8Hex}$`, "i");
    module.exports = (hex, options = {}) => {
      if (typeof hex !== "string" || nonHexChars.test(hex) || !validHexSize.test(hex)) {
        throw new TypeError("Expected a valid hex string");
      }
      hex = hex.replace(/^#/, "");
      let alphaFromHex = 1;
      if (hex.length === 8) {
        alphaFromHex = Number.parseInt(hex.slice(6, 8), 16) / 255;
        hex = hex.slice(0, 6);
      }
      if (hex.length === 4) {
        alphaFromHex = Number.parseInt(hex.slice(3, 4).repeat(2), 16) / 255;
        hex = hex.slice(0, 3);
      }
      if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      }
      const number2 = Number.parseInt(hex, 16);
      const red = number2 >> 16;
      const green = number2 >> 8 & 255;
      const blue = number2 & 255;
      const alpha = typeof options.alpha === "number" ? options.alpha : alphaFromHex;
      if (options.format === "array") {
        return [red, green, blue, alpha];
      }
      if (options.format === "css") {
        const alphaString = alpha === 1 ? "" : ` / ${Number((alpha * 100).toFixed(2))}%`;
        return `rgb(${red} ${green} ${blue}${alphaString})`;
      }
      return { red, green, blue, alpha };
    };
  }
});

// node_modules/.pnpm/escape-html@1.0.3/node_modules/escape-html/index.js
var require_escape_html = __commonJS({
  "node_modules/.pnpm/escape-html@1.0.3/node_modules/escape-html/index.js"(exports2, module) {
    "use strict";
    var matchHtmlRegExp = /["'&<>]/;
    module.exports = escapeHtml;
    function escapeHtml(string) {
      var str = "" + string;
      var match = matchHtmlRegExp.exec(str);
      if (!match) {
        return str;
      }
      var escape;
      var html = "";
      var index = 0;
      var lastIndex = 0;
      for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
          case 34:
            escape = "&quot;";
            break;
          case 38:
            escape = "&amp;";
            break;
          case 39:
            escape = "&#39;";
            break;
          case 60:
            escape = "&lt;";
            break;
          case 62:
            escape = "&gt;";
            break;
          default:
            continue;
        }
        if (lastIndex !== index) {
          html += str.substring(lastIndex, index);
        }
        lastIndex = index + 1;
        html += escape;
      }
      return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
    }
  }
});

// node_modules/.pnpm/linebreak@1.1.0/node_modules/linebreak/dist/module.mjs
var import_unicode_trie = __toESM(require_unicode_trie(), 1);
var import_base64_js = __toESM(require_b64(), 1);
var $557adaaeb0c7885f$exports = {};
var $1627905f8be2ef3f$export$fb4028874a74450 = 5;
var $1627905f8be2ef3f$export$1bb1140fe1358b00 = 12;
var $1627905f8be2ef3f$export$f3e416a182673355 = 13;
var $1627905f8be2ef3f$export$24aa617c849a894a = 16;
var $1627905f8be2ef3f$export$a73c4d14459b698d = 17;
var $1627905f8be2ef3f$export$9e5d732f3676a9ba = 22;
var $1627905f8be2ef3f$export$1dff41d5c0caca01 = 28;
var $1627905f8be2ef3f$export$30a74a373318dec6 = 31;
var $1627905f8be2ef3f$export$d710c5f50fc7496a = 33;
var $1627905f8be2ef3f$export$66498d28055820a9 = 34;
var $1627905f8be2ef3f$export$eb6c6d0b7c8826f2 = 35;
var $1627905f8be2ef3f$export$de92be486109a1df = 36;
var $1627905f8be2ef3f$export$606cfc2a8896c91f = 37;
var $1627905f8be2ef3f$export$e51d3c675bb0140d = 38;
var $1627905f8be2ef3f$export$da51c6332ad11d7b = 39;
var $1627905f8be2ef3f$export$bea437c40441867d = 40;
var $1627905f8be2ef3f$export$c4c7eecbfed13dc9 = 41;
var $1627905f8be2ef3f$export$98e1f8a379849661 = 42;
var $32627af916ac1b00$export$98f50d781a474745 = 0;
var $32627af916ac1b00$export$12ee1f8f5315ca7e = 1;
var $32627af916ac1b00$export$e4965ce242860454 = 2;
var $32627af916ac1b00$export$8f14048969dcd45e = 3;
var $32627af916ac1b00$export$133eb141bf58aff4 = 4;
var $32627af916ac1b00$export$5bdb8ccbf5c57afc = [
  [
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$8f14048969dcd45e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ],
  [
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$e4965ce242860454,
    $32627af916ac1b00$export$133eb141bf58aff4,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$98f50d781a474745,
    $32627af916ac1b00$export$12ee1f8f5315ca7e,
    $32627af916ac1b00$export$98f50d781a474745
  ]
];
var $557adaaeb0c7885f$var$data = import_base64_js.default.toByteArray("AAgOAAAAAAAQ4QAAAQ0P8vDtnQuMXUUZx+eyu7d7797d9m5bHoWltKVUlsjLWE0VJNigQoMVqkStEoNQQUl5GIo1KKmogEgqkKbBRki72lYabZMGKoGAjQRtJJDaCCIRiiigREBQS3z+xzOTnZ3O+3HOhd5NfpkzZx7fN9988zivu2M9hGwB28F94DnwEngd/Asc1EtIs9c/bIPDwCxwLDgezHcodyo4w5C+CCwBS8FnwSXgCnA1uFbI93XwbXAbWAfWgx+CzWAb+An4KfgFeAzsYWWfYuFz4CXwGvgb+Dfo6yNkEEwGh4CZYB44FpwI3g1OY+kfBItZOo2fB84Hy8DF4HJwNbiWpV8PVoO1LH4n2NRXyN+KcAd4kNVP9XsY4aPgcfAbsBfs6SniL4K/sPjfEf6HlanXCRkCw2BGvUh/keWfXS/CY+pFXs7x9XHmM94LTmWIeU2cgbxnS/k/B3kf86jDhU8L9V2E40vAFWAlWFUfb++NOL4F3C7JX4/4GiE+hvgWsF0oS7mXldspnN+F493gyXrh9xTav0cg3EvzgVfBG6wsmVSEkxBOBgdPGpd7JI6PnqRvJ68/xlbHof53gPeA94OzwLngk+ACsAwsByvASrAK3MB0Ws3CtQjvBJvAVrADPMDSHkb4CNijaccTwvnf4fiPEs8Lxy+D18A/QU8/xjgYBjPAbDAKTgYLwOngTHAO+EQ/8wuEF4EvsPiVCFf2+9tsFStzA8LVHuXXBsi6QyqzUYiPMR/7Mc7dAx7oL8bzw/3u/Bw8Bp4Az4AXwCtgHzsmDXP5fiF9iiVvly5d0sHngar16NKlS5cuXbp06fLmYlqHXrcd3ph4P0THUY3iXh49novju4S0tzfs5d+JPKewfAsRntZb3K9ZhOMlrO6lCC8An28U9+OuovcPcPxlVu5rCL/VmHh/iHIrzn3fIPu7SN8Axmg+8AOwEWwCm7tp3bRuWjetm5Y8bSu4B9zbKO6ZVsnORrVU3f4uXTqZ2H3sLoyx3eDXjfDndE9qyj6L838CfwVvgFpzYnof4oNgOhgBc8Fos9DrZIQLmtXPP1MmF6wGj4H+KXoWguvADkXaPil+YpuQy8Am8Ey7ODdtmJDF4HowBp4De6HDTNjhfHAHeBr0DBBy0kDxfPbcgSIusgrcWhtnJ8vL+TPix7UIOQtcBq4C28Cr4KRBnANbwSuDE+s50JgyNNFuXbp06XIgsXjIvPafjvXozKY+fVFz/z0LT1uCtKVSWbrOLWPnztG8e0Xfy7ol8XtZJi7WtG+5od2UFXQ/A12vUeS7jp27yVKHjdsU9lXB869TyNvAzt0lpP2oWbwLdjiO78bx/Sz+EMJHwK9Y/LcIfw+eZ3F67/Hl5vh9xX80J+rwX8SvRDhpgL17iPAQMHNArfPrqHPewLheI+AERV6efwV418B4nOZ/H+IfYHV8GOF5LJ3eAz0fx8sM9S0fUNud39O9CulfGZhY5huI3wzWgNvBelbHZoTbNPVpfYjKQpkHwUNgl0LWblbnk0LbbDxr0OMFpL3iqWdu9nWYPlVAWkXY39LnGdCkDbeqv1YNbfcMQ3t9oe8lzm6NH9N1ZB6Ln4BwfkJZJk7RyFnYKt6b/JDQXx9p5X+eFdqOjzM9P9MB/lUlFzr20aXIdzlY4dmn9F3YqtvoO76/2hp/D/xA5Zue88nNyL8GbFbs075X0tyUig3Qd2MCnf//HjnzpbsR3g9+1kHzzVjdnE71/qVBX9rGPUh/ysNWe1neFzvIDi5zAufV1sT0N0poR22wkFUfTOPfA4N2mbZ5fSrqOHSw+IbkSBbOGSzSRgf91/GTUWYBOB2cIZQ/G8cfBZ8CFwrnL8XxF8FKcA24jqXdiPA7Qr61OF7H4mMItwzuv2/YLth1ISt3Hzu3k4W7EH5JqPdRHD/O4k+z8A8IX5Lq3y7Z4nXE9xn6kX6vQ4bKfy+ok+hH+xf3hq9dnTTHhjKd2GmDuWA242iHMq4cC7A8kJ7i8o1+skSa7Jieo38HCWnoNjKFhdSFBxzpZ7QE6lI8N4S14aASZcryaV/WWHw66f6NHuCoxuQxmvM56GX9QMd8Q4D65ywGP+ZzRJuM+zQvx/MOS2VFeqQ4IXnH26zM9Xe6/E6D+4foAzzuajPZp8Qyw5ayZVDWuH0z0BtYRkeIDqH9KO9VbH1btd/lhNqCzvl8zeLnG0S/hnU6baHfpiuO6yy0rd+DHURo/zYF5H26j03rQsip2ndzz82u1z9N4VjWKWeb68Tedpt95HRVXp7H1R6p+/Wt4FPy/PpWwscOLRJ+PVWF/+W0iVyGzs18TIvXkOJ1Wxm66vSXz+vylenrZcj1ub439W+K8RNCGTJi2p/TJ1K23VaXr35tRpnzmjxequgfcfyk6B/TGBVlyedsNgpdd/h+W1U3P99QyFPNo1X3TwpM/WLTIWYfoBqXrv6iskHZ/RFr79R6hIyHBrH3f1nrUVnjP8SnZZ+rYtzr9Exld5MNbPNErusAPg+77u/eDOPftU9yj39TH7rezxd1LvsZQJlzkWlOirG/79zjMj/mtHUKu7vKy+3/LnXr9okyKedjX5/0He9iP/j63LwOQdarEVlfy8OO/Lqw023j6xcqmwxLiOd6heM2i9cV9LJy8jMJ23yQ+rpbfu7EQ/pXE8KYvUSqvVnb4XzZa6LrHMXHR+zcLvqWbm/Bn0/HzIs6fWPHoat8XfnDKmZGxRxeMbn2UqZ5Q94nmcZRbqqUXbZ8+lcjE+cPX11t814orvvAXNcG8vqj2vvk1MGn3anlj0bIT72v47bvE+Lc98T9b6r7AKn6j+8Duf7D0nnZx/j7Zjn0j9nbpSTndaLr9WNLivP+iN23xF7L+fqv6ZouFyb78jxVXvv5jJ9YUs9/sddO8h7KNg5jrhfaJGztT6G7KF+1d6yCmD5Kdb2fan60rSc552fZr3zeQ9DpnPp+Si5cx5Ktv2QfSzF/mMbWdOm46rFI4XstnU9xeqX4NKb7TKEdcr6pZOK3ID1k/LvFHkVczEuZLEDr499YqvqBym1aEHWgcvoYOtv0M91qQl5TfpO/in6rWx8OVpT1Wedkv3f5xom3T/xeR/6Gx6V86PWAOB4bBpqWdN+yTcVxjIyGRz/FrDGu6w/3d7kPm8StX8RyPu+uuvpNju/vTLJV37GpvoM0oZPnW87VLnL/5pDno1NoW1R6yedU6TyUv3u19a3KFnIbTLYz+ZCLP4T0tU1uivFgso0pnsJ/UtXvarNY28Xq5cvkBDrQP/E5ZaiuQwwfmTlsOiQRU1fMuqrDd/3ISSuwjOwXOfTyGUMpZIXq4GpLn3pUcdfzch2x7XO1u2uZHOPb1G6b3Xg9PH1IIWeEpJlPQtqos2EKW8b0u8rnuP1UeVLoXJb9be0uG9nnbchjU+XTszT5VeNBThPHnc5OKj1U9aj0GTHIVaGy1YhEWT4ixns00DT+XEzWn/7VAsIc63Cov3OdyhwjrnaqQqZvWKXdypRdlq+k8msZ031U+Rm4fA+3TtyeR9hwfW9G9yxDN0fZMN33F+9TE6md4hwoxumfaUzI9fN3PFT3xVV2msrQ3UsnChm6Nulk8TndpS28D3zX9tTIPsF/z7Am5OkTjm1tI1JZW74+4VgsZ0N3L1yXV3WeP5uR7TGHHdvC3JQlxybfpd22tDlk/2eofRK8TzrN/qnar/K/OUTth6I/+jAnEptNbPvFHP2gs40N3+dfMWtwqvVct7/wfd8gtQ7imifial9ZJ9/3IHLYU6eDj3+4PhsNhX+vwvcWLnu6kGfEMe8DuciPfUfGZB8X/7HJy/Gefe5n+VRGFd/wyP2ta7/LO4yh/sbLV/k9lev6kfO9Dt/5U67b1/6u/epqB1U9Me23jfHY9sscAg4tkbLl+e4/U36rJ9ddxfd6sg5vq5ice42Wpk/pb9FOJ36/W9tpv4kbC79nUbZceX8Zu6/qJ+P3WvhvA8v3reh7Jbn2d6rrNC7XNZTLma4Ba0JI9efX2uLzF5scG/w9UNU1ZxW+ymUfzELeTllXlQ1rUuhzjS5fp9c964iFBOqeSz63bU065nZKdU+mDEz3qHIjjifquw0pnb/raRtvrnsYcb46ihT3taoYz6brdNW9l6rWRnE/navdPn1XlR1km7hcz1WlH/elKuSOSvLLuE8U6m8uzwRdfcGl73VyTHuyMvzJ1Sa2cWDTP/Z63Kc94n2B1PYr24dz1JlyHLlcP+S4B6vD1c9EW4q2LWstCvUjeVy63k/LMYdUNd5D1xQfvVTzX1VjkMsUv88N8VH5fReVn/Fjn++/h6X6Q8a6b1/q3g/i/ewi0/Scs8zxXeV6mWIOUPlPzBgdFerW+bZrm2P18dnjuK6HunEp+rHvPMXbr+sHVb/lnL+pTP57jPw9Cvk3PW178JD9qChfzuvTf7Htl38L1QUf/VKu9SFjwWbTWPvFEvu7Uq76y7+31g6QlYPc669pbsm9Xur2LWI9Pu8ypfDXqm3A2z8s1FWGn4ntL9NfQu2oSlftX9uetvTtv7J8Ql4zxfXGZ3zk8PeQ9w59x2uMfqI8/q5eKh/l9cb2rwsu9rSNl06ZP2Pmxtz+rNMx93yno0n2/82rVH7rQ+y9P15H6FyRun9ViH81ATmffI7nJ5r8uXXW6enbP6b/B8/l5OifVHYLnb9S39s2zcc+Ph+rh8+eQgVPS72elzGWY/tUtbbabBpDiI7yN1q6/4th2y+ErAc5+9BVvu/7KamJbWNZeuqI/R4tRf+YyD1HmOZM1bMV3/14Sn10c0Xu+Sj1nOXb5jL73ncdy02uvlXZNde65dOHYl7Vs4KYuS6FzWLn2zJlpZqPXPVPOa5yzKOyn1VhT9lmMfdbfH7D11Wf2PXN5h9y+dD287+qxgSnaYmnIrRtIb8pJe6/Uv9OVer6Whn0zfGO/BEloZI9ojmfAlUflClDd178bTmVHVTpZXOkAlk/lb42UujmI89HH5V+cl7XtowY6vTxLVWok6UrGzoGTHN+bB+6ri05687VNpvfuvRfaP2uMlNQth1D5JjGelm/8yn+9p3p/7qk9gnfeddXZmq/Sm333PJT659Kv1zjNbZ9uv2Oi//67CV8/N1nj1DmviyXDNVeJkaeaX8UsyesYg8cu2+NvdaPfb+lLDu5tvt/");
var $557adaaeb0c7885f$var$classTrie = new import_unicode_trie.default($557adaaeb0c7885f$var$data);
var $557adaaeb0c7885f$var$mapClass = function(c) {
  switch (c) {
    case $1627905f8be2ef3f$export$d710c5f50fc7496a:
      return $1627905f8be2ef3f$export$1bb1140fe1358b00;
    case $1627905f8be2ef3f$export$da51c6332ad11d7b:
    case $1627905f8be2ef3f$export$bea437c40441867d:
    case $1627905f8be2ef3f$export$98e1f8a379849661:
      return $1627905f8be2ef3f$export$1bb1140fe1358b00;
    case $1627905f8be2ef3f$export$eb6c6d0b7c8826f2:
      return $1627905f8be2ef3f$export$fb4028874a74450;
    default:
      return c;
  }
};
var $557adaaeb0c7885f$var$mapFirst = function(c) {
  switch (c) {
    case $1627905f8be2ef3f$export$606cfc2a8896c91f:
    case $1627905f8be2ef3f$export$e51d3c675bb0140d:
      return $1627905f8be2ef3f$export$66498d28055820a9;
    case $1627905f8be2ef3f$export$c4c7eecbfed13dc9:
      return $1627905f8be2ef3f$export$9e5d732f3676a9ba;
    default:
      return c;
  }
};
var $557adaaeb0c7885f$var$Break = class {
  constructor(position, required = false) {
    this.position = position;
    this.required = required;
  }
};
var $557adaaeb0c7885f$var$LineBreaker = class {
  nextCodePoint() {
    const code = this.string.charCodeAt(this.pos++);
    const next = this.string.charCodeAt(this.pos);
    if (55296 <= code && code <= 56319 && 56320 <= next && next <= 57343) {
      this.pos++;
      return (code - 55296) * 1024 + (next - 56320) + 65536;
    }
    return code;
  }
  nextCharClass() {
    return $557adaaeb0c7885f$var$mapClass($557adaaeb0c7885f$var$classTrie.get(this.nextCodePoint()));
  }
  getSimpleBreak() {
    switch (this.nextClass) {
      case $1627905f8be2ef3f$export$c4c7eecbfed13dc9:
        return false;
      case $1627905f8be2ef3f$export$66498d28055820a9:
      case $1627905f8be2ef3f$export$606cfc2a8896c91f:
      case $1627905f8be2ef3f$export$e51d3c675bb0140d:
        this.curClass = $1627905f8be2ef3f$export$66498d28055820a9;
        return false;
      case $1627905f8be2ef3f$export$de92be486109a1df:
        this.curClass = $1627905f8be2ef3f$export$de92be486109a1df;
        return false;
    }
    return null;
  }
  getPairTableBreak(lastClass) {
    let shouldBreak = false;
    switch ($32627af916ac1b00$export$5bdb8ccbf5c57afc[this.curClass][this.nextClass]) {
      case $32627af916ac1b00$export$98f50d781a474745:
        shouldBreak = true;
        break;
      case $32627af916ac1b00$export$12ee1f8f5315ca7e:
        shouldBreak = lastClass === $1627905f8be2ef3f$export$c4c7eecbfed13dc9;
        break;
      case $32627af916ac1b00$export$e4965ce242860454:
        shouldBreak = lastClass === $1627905f8be2ef3f$export$c4c7eecbfed13dc9;
        if (!shouldBreak) {
          shouldBreak = false;
          return shouldBreak;
        }
        break;
      case $32627af916ac1b00$export$8f14048969dcd45e:
        if (lastClass !== $1627905f8be2ef3f$export$c4c7eecbfed13dc9)
          return shouldBreak;
        break;
      case $32627af916ac1b00$export$133eb141bf58aff4:
        break;
    }
    if (this.LB8a)
      shouldBreak = false;
    if (this.LB21a && (this.curClass === $1627905f8be2ef3f$export$24aa617c849a894a || this.curClass === $1627905f8be2ef3f$export$a73c4d14459b698d)) {
      shouldBreak = false;
      this.LB21a = false;
    } else
      this.LB21a = this.curClass === $1627905f8be2ef3f$export$f3e416a182673355;
    if (this.curClass === $1627905f8be2ef3f$export$1dff41d5c0caca01) {
      this.LB30a++;
      if (this.LB30a == 2 && this.nextClass === $1627905f8be2ef3f$export$1dff41d5c0caca01) {
        shouldBreak = true;
        this.LB30a = 0;
      }
    } else
      this.LB30a = 0;
    this.curClass = this.nextClass;
    return shouldBreak;
  }
  nextBreak() {
    if (this.curClass == null) {
      let firstClass = this.nextCharClass();
      this.curClass = $557adaaeb0c7885f$var$mapFirst(firstClass);
      this.nextClass = firstClass;
      this.LB8a = firstClass === $1627905f8be2ef3f$export$30a74a373318dec6;
      this.LB30a = 0;
    }
    while (this.pos < this.string.length) {
      this.lastPos = this.pos;
      const lastClass = this.nextClass;
      this.nextClass = this.nextCharClass();
      if (this.curClass === $1627905f8be2ef3f$export$66498d28055820a9 || this.curClass === $1627905f8be2ef3f$export$de92be486109a1df && this.nextClass !== $1627905f8be2ef3f$export$606cfc2a8896c91f) {
        this.curClass = $557adaaeb0c7885f$var$mapFirst($557adaaeb0c7885f$var$mapClass(this.nextClass));
        return new $557adaaeb0c7885f$var$Break(this.lastPos, true);
      }
      let shouldBreak = this.getSimpleBreak();
      if (shouldBreak === null)
        shouldBreak = this.getPairTableBreak(lastClass);
      this.LB8a = this.nextClass === $1627905f8be2ef3f$export$30a74a373318dec6;
      if (shouldBreak)
        return new $557adaaeb0c7885f$var$Break(this.lastPos);
    }
    if (this.lastPos < this.string.length) {
      this.lastPos = this.string.length;
      return new $557adaaeb0c7885f$var$Break(this.string.length);
    }
    return null;
  }
  constructor(string) {
    this.string = string;
    this.pos = 0;
    this.lastPos = 0;
    this.curClass = null;
    this.nextClass = null;
    this.LB8a = false;
    this.LB21a = false;
    this.LB30a = 0;
  }
};
$557adaaeb0c7885f$exports = $557adaaeb0c7885f$var$LineBreaker;

// node_modules/.pnpm/satori@0.10.9/node_modules/satori/dist/index.wasm.js
var import_css_to_react_native = __toESM(require_css_to_react_native(), 1);
var import_css_background_parser = __toESM(require_css_background_parser(), 1);
var import_css_box_shadow = __toESM(require_css_box_shadow(), 1);

// node_modules/.pnpm/parse-css-color@0.2.1/node_modules/parse-css-color/dist/index.esm.js
var import_color_name = __toESM(require_color_name());
var import_hex_rgb = __toESM(require_hex_rgb());
var pattern = /^#([a-f0-9]{3,4}|[a-f0-9]{4}(?:[a-f0-9]{2}){1,2})\b$/;
var hexRe = new RegExp(pattern, "i");
var float = "-?\\d*(?:\\.\\d+)";
var number = `(${float}?)`;
var percentage = `(${float}?%)`;
var numberOrPercentage = `(${float}?%?)`;
var pattern$1 = `^
  hsla?\\(
    \\s*(-?\\d*(?:\\.\\d+)?(?:deg|rad|turn)?)\\s*,
    \\s*${percentage}\\s*,
    \\s*${percentage}\\s*
    (?:,\\s*${numberOrPercentage}\\s*)?
  \\)
  $
`.replace(/\n|\s/g, "");
var hsl3Re = new RegExp(pattern$1);
var pattern$2 = `^
  hsla?\\(
    \\s*(-?\\d*(?:\\.\\d+)?(?:deg|rad|turn)?)\\s*
    \\s+${percentage}
    \\s+${percentage}
    \\s*(?:\\s*\\/\\s*${numberOrPercentage}\\s*)?
  \\)
  $
`.replace(/\n|\s/g, "");
var hsl4Re = new RegExp(pattern$2);
var pattern$3 = `^
  rgba?\\(
    \\s*${number}\\s*,
    \\s*${number}\\s*,
    \\s*${number}\\s*
    (?:,\\s*${numberOrPercentage}\\s*)?
  \\)
  $
`.replace(/\n|\s/g, "");
var rgb3NumberRe = new RegExp(pattern$3);
var pattern$4 = `^
  rgba?\\(
    \\s*${percentage}\\s*,
    \\s*${percentage}\\s*,
    \\s*${percentage}\\s*
    (?:,\\s*${numberOrPercentage}\\s*)?
  \\)
  $
`.replace(/\n|\s/g, "");
var rgb3PercentageRe = new RegExp(pattern$4);
var pattern$5 = `^
  rgba?\\(
    \\s*${number}
    \\s+${number}
    \\s+${number}
    \\s*(?:\\s*\\/\\s*${numberOrPercentage}\\s*)?
  \\)
$
`.replace(/\n|\s/g, "");
var rgb4NumberRe = new RegExp(pattern$5);
var pattern$6 = `^
  rgba?\\(
    \\s*${percentage}
    \\s+${percentage}
    \\s+${percentage}
    \\s*(?:\\s*\\/\\s*${numberOrPercentage}\\s*)?
  \\)
$
`.replace(/\n|\s/g, "");
var rgb4PercentageRe = new RegExp(pattern$6);
var pattern$7 = /^transparent$/;
var transparentRe = new RegExp(pattern$7, "i");
var clamp = (num, min, max2) => Math.min(Math.max(min, num), max2);
var parseRGB = (num) => {
  let n = num;
  if (typeof n !== "number")
    n = n.endsWith("%") ? parseFloat(n) * 255 / 100 : parseFloat(n);
  return clamp(Math.round(n), 0, 255);
};
var parsePercentage = (percentage2) => clamp(parseFloat(percentage2), 0, 100);
function parseAlpha(alpha) {
  let a = alpha;
  if (typeof a !== "number")
    a = a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
  return clamp(a, 0, 1);
}
function getHEX(hex) {
  const [r, g2, b, a] = (0, import_hex_rgb.default)(hex, { format: "array" });
  return getRGB([null, ...[r, g2, b, a]]);
}
function getHSL([, h, s, l, a = 1]) {
  let hh = h;
  if (hh.endsWith("turn")) {
    hh = parseFloat(hh) * 360 / 1;
  } else if (hh.endsWith("rad")) {
    hh = Math.round(parseFloat(hh) * 180 / Math.PI);
  } else {
    hh = parseFloat(hh);
  }
  return {
    type: "hsl",
    values: [hh, parsePercentage(s), parsePercentage(l)],
    alpha: parseAlpha(a === null ? 1 : a)
  };
}
function getRGB([, r, g2, b, a = 1]) {
  return {
    type: "rgb",
    values: [r, g2, b].map(parseRGB),
    alpha: parseAlpha(a === null ? 1 : a)
  };
}
var parseCSSColor = (str) => {
  if (typeof str !== "string")
    return null;
  const hex = hexRe.exec(str);
  if (hex)
    return getHEX(hex[0]);
  const hsl = hsl4Re.exec(str) || hsl3Re.exec(str);
  if (hsl)
    return getHSL(hsl);
  const rgb = rgb4NumberRe.exec(str) || rgb4PercentageRe.exec(str) || rgb3NumberRe.exec(str) || rgb3PercentageRe.exec(str);
  if (rgb)
    return getRGB(rgb);
  if (transparentRe.exec(str))
    return getRGB([null, 0, 0, 0, 0]);
  const cn = import_color_name.default[str.toLowerCase()];
  if (cn)
    return getRGB([null, cn[0], cn[1], cn[2], 1]);
  return null;
};
var index_esm_default = parseCSSColor;

// node_modules/.pnpm/satori@0.10.9/node_modules/satori/dist/index.wasm.js
var import_postcss_value_parser = __toESM(require_lib(), 1);
var import_css_to_react_native2 = __toESM(require_css_to_react_native(), 1);
var import_escape_html = __toESM(require_escape_html(), 1);
var import_css_to_react_native3 = __toESM(require_css_to_react_native(), 1);

// node_modules/.pnpm/@shuding+opentype.js@1.4.0-beta.0/node_modules/@shuding/opentype.js/dist/opentype.module.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var u32 = Uint32Array;
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new u32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return [b, r];
};
var _a = freb(fleb, 2);
var fl = _a[0];
var revfl = _a[1];
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b[0];
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >>> 1 | (i & 21845) << 1;
  x = (x & 52428) >>> 2 | (x & 13107) << 2;
  x = (x & 61680) >>> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >>> 8 | (x & 255) << 8) >>> 1;
}
var x;
var i;
var hMap = function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i]) {
      ++l[cd[i] - 1];
    }
  }
  var le = new u16(mb);
  for (i = 0; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >>> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >>> 15 - cd[i];
      }
    }
  }
  return co;
};
var flt = new u8(288);
for (i = 0; i < 144; ++i) {
  flt[i] = 8;
}
var i;
for (i = 144; i < 256; ++i) {
  flt[i] = 9;
}
var i;
for (i = 256; i < 280; ++i) {
  flt[i] = 7;
}
var i;
for (i = 280; i < 288; ++i) {
  flt[i] = 8;
}
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i) {
  fdt[i] = 5;
}
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m) {
      m = a[i];
    }
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0) {
    s = 0;
  }
  if (e == null || e > v.length) {
    e = v.length;
  }
  var n = new (v.BYTES_PER_ELEMENT == 2 ? u16 : v.BYTES_PER_ELEMENT == 4 ? u32 : u8)(e - s);
  n.set(v.subarray(s, e));
  return n;
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(e, err);
  }
  if (!nt) {
    throw e;
  }
  return e;
};
var inflt = function(dat, buf, st) {
  var sl2 = dat.length;
  if (!sl2 || st && st.f && !st.l) {
    return buf || new u8(0);
  }
  var noBuf = !buf || st;
  var noSt = !st || st.i;
  if (!st) {
    st = {};
  }
  if (!buf) {
    buf = new u8(sl2 * 3);
  }
  var cbuf = function(l2) {
    var bl2 = buf.length;
    if (l2 > bl2) {
      var nbuf = new u8(Math.max(bl2 * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt2 = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl2 * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl2) {
          if (noSt) {
            err(0);
          }
          break;
        }
        if (noBuf) {
          cbuf(bt2 + l);
        }
        buf.set(dat.subarray(s, t), bt2);
        st.b = bt2 += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1) {
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      } else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl2 = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl2);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl2; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >>> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16) {
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            } else if (s == 17) {
              n = 3 + bits(dat, pos, 7), pos += 3;
            } else if (s == 18) {
              n = 11 + bits(dat, pos, 127), pos += 7;
            }
            while (n--) {
              ldt[i++] = c;
            }
          }
        }
        var lt = ldt.subarray(0, hLit), dt2 = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt2);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt2, dbt, 1);
      } else {
        err(1);
      }
      if (pos > tbts) {
        if (noSt) {
          err(0);
        }
        break;
      }
    }
    if (noBuf) {
      cbuf(bt2 + 131072);
    }
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >>> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt) {
          err(0);
        }
        break;
      }
      if (!c) {
        err(2);
      }
      if (sym < 256) {
        buf[bt2++] = sym;
      } else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >>> 4;
        if (!d) {
          err(3);
        }
        pos += d & 15;
        var dt2 = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt2 += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt) {
            err(0);
          }
          break;
        }
        if (noBuf) {
          cbuf(bt2 + 131072);
        }
        var end = bt2 + add;
        for (; bt2 < end; bt2 += 4) {
          buf[bt2] = buf[bt2 - dt2];
          buf[bt2 + 1] = buf[bt2 + 1 - dt2];
          buf[bt2 + 2] = buf[bt2 + 2 - dt2];
          buf[bt2 + 3] = buf[bt2 + 3 - dt2];
        }
        bt2 = end;
      }
    }
    st.l = lm, st.p = lpos, st.b = bt2, st.f = final;
    if (lm) {
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    }
  } while (!final);
  return bt2 == buf.length ? buf : slc(buf, 0, bt2);
};
var et = /* @__PURE__ */ new u8(0);
function inflateSync(data, out) {
  return inflt(data, out);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
function Path() {
  this.commands = [];
  this.fill = "black";
  this.stroke = null;
  this.strokeWidth = 1;
}
Path.prototype.moveTo = function(x, y) {
  this.commands.push({
    type: "M",
    x,
    y
  });
};
Path.prototype.lineTo = function(x, y) {
  this.commands.push({
    type: "L",
    x,
    y
  });
};
Path.prototype.curveTo = Path.prototype.bezierCurveTo = function(x1, y1, x2, y2, x, y) {
  this.commands.push({
    type: "C",
    x1,
    y1,
    x2,
    y2,
    x,
    y
  });
};
Path.prototype.quadTo = Path.prototype.quadraticCurveTo = function(x1, y1, x, y) {
  this.commands.push({
    type: "Q",
    x1,
    y1,
    x,
    y
  });
};
Path.prototype.close = Path.prototype.closePath = function() {
  this.commands.push({
    type: "Z"
  });
};
Path.prototype.extend = function(pathOrCommands) {
  if (pathOrCommands.commands) {
    pathOrCommands = pathOrCommands.commands;
  }
  Array.prototype.push.apply(this.commands, pathOrCommands);
};
Path.prototype.toPathData = function(decimalPlaces) {
  decimalPlaces = decimalPlaces !== void 0 ? decimalPlaces : 2;
  function floatToString(v) {
    if (Math.round(v) === v) {
      return "" + Math.round(v);
    } else {
      return v.toFixed(decimalPlaces);
    }
  }
  function packValues() {
    var arguments$1 = arguments;
    var s = "";
    for (var i2 = 0; i2 < arguments.length; i2 += 1) {
      var v = arguments$1[i2];
      if (v >= 0 && i2 > 0) {
        s += " ";
      }
      s += floatToString(v);
    }
    return s;
  }
  var d = "";
  for (var i = 0; i < this.commands.length; i += 1) {
    var cmd = this.commands[i];
    if (cmd.type === "M") {
      d += "M" + packValues(cmd.x, cmd.y);
    } else if (cmd.type === "L") {
      d += "L" + packValues(cmd.x, cmd.y);
    } else if (cmd.type === "C") {
      d += "C" + packValues(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    } else if (cmd.type === "Q") {
      d += "Q" + packValues(cmd.x1, cmd.y1, cmd.x, cmd.y);
    } else if (cmd.type === "Z") {
      d += "Z";
    }
  }
  return d;
};
var cffStandardStrings = [
  ".notdef",
  "space",
  "exclam",
  "quotedbl",
  "numbersign",
  "dollar",
  "percent",
  "ampersand",
  "quoteright",
  "parenleft",
  "parenright",
  "asterisk",
  "plus",
  "comma",
  "hyphen",
  "period",
  "slash",
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "colon",
  "semicolon",
  "less",
  "equal",
  "greater",
  "question",
  "at",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "bracketleft",
  "backslash",
  "bracketright",
  "asciicircum",
  "underscore",
  "quoteleft",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "braceleft",
  "bar",
  "braceright",
  "asciitilde",
  "exclamdown",
  "cent",
  "sterling",
  "fraction",
  "yen",
  "florin",
  "section",
  "currency",
  "quotesingle",
  "quotedblleft",
  "guillemotleft",
  "guilsinglleft",
  "guilsinglright",
  "fi",
  "fl",
  "endash",
  "dagger",
  "daggerdbl",
  "periodcentered",
  "paragraph",
  "bullet",
  "quotesinglbase",
  "quotedblbase",
  "quotedblright",
  "guillemotright",
  "ellipsis",
  "perthousand",
  "questiondown",
  "grave",
  "acute",
  "circumflex",
  "tilde",
  "macron",
  "breve",
  "dotaccent",
  "dieresis",
  "ring",
  "cedilla",
  "hungarumlaut",
  "ogonek",
  "caron",
  "emdash",
  "AE",
  "ordfeminine",
  "Lslash",
  "Oslash",
  "OE",
  "ordmasculine",
  "ae",
  "dotlessi",
  "lslash",
  "oslash",
  "oe",
  "germandbls",
  "onesuperior",
  "logicalnot",
  "mu",
  "trademark",
  "Eth",
  "onehalf",
  "plusminus",
  "Thorn",
  "onequarter",
  "divide",
  "brokenbar",
  "degree",
  "thorn",
  "threequarters",
  "twosuperior",
  "registered",
  "minus",
  "eth",
  "multiply",
  "threesuperior",
  "copyright",
  "Aacute",
  "Acircumflex",
  "Adieresis",
  "Agrave",
  "Aring",
  "Atilde",
  "Ccedilla",
  "Eacute",
  "Ecircumflex",
  "Edieresis",
  "Egrave",
  "Iacute",
  "Icircumflex",
  "Idieresis",
  "Igrave",
  "Ntilde",
  "Oacute",
  "Ocircumflex",
  "Odieresis",
  "Ograve",
  "Otilde",
  "Scaron",
  "Uacute",
  "Ucircumflex",
  "Udieresis",
  "Ugrave",
  "Yacute",
  "Ydieresis",
  "Zcaron",
  "aacute",
  "acircumflex",
  "adieresis",
  "agrave",
  "aring",
  "atilde",
  "ccedilla",
  "eacute",
  "ecircumflex",
  "edieresis",
  "egrave",
  "iacute",
  "icircumflex",
  "idieresis",
  "igrave",
  "ntilde",
  "oacute",
  "ocircumflex",
  "odieresis",
  "ograve",
  "otilde",
  "scaron",
  "uacute",
  "ucircumflex",
  "udieresis",
  "ugrave",
  "yacute",
  "ydieresis",
  "zcaron",
  "exclamsmall",
  "Hungarumlautsmall",
  "dollaroldstyle",
  "dollarsuperior",
  "ampersandsmall",
  "Acutesmall",
  "parenleftsuperior",
  "parenrightsuperior",
  "266 ff",
  "onedotenleader",
  "zerooldstyle",
  "oneoldstyle",
  "twooldstyle",
  "threeoldstyle",
  "fouroldstyle",
  "fiveoldstyle",
  "sixoldstyle",
  "sevenoldstyle",
  "eightoldstyle",
  "nineoldstyle",
  "commasuperior",
  "threequartersemdash",
  "periodsuperior",
  "questionsmall",
  "asuperior",
  "bsuperior",
  "centsuperior",
  "dsuperior",
  "esuperior",
  "isuperior",
  "lsuperior",
  "msuperior",
  "nsuperior",
  "osuperior",
  "rsuperior",
  "ssuperior",
  "tsuperior",
  "ff",
  "ffi",
  "ffl",
  "parenleftinferior",
  "parenrightinferior",
  "Circumflexsmall",
  "hyphensuperior",
  "Gravesmall",
  "Asmall",
  "Bsmall",
  "Csmall",
  "Dsmall",
  "Esmall",
  "Fsmall",
  "Gsmall",
  "Hsmall",
  "Ismall",
  "Jsmall",
  "Ksmall",
  "Lsmall",
  "Msmall",
  "Nsmall",
  "Osmall",
  "Psmall",
  "Qsmall",
  "Rsmall",
  "Ssmall",
  "Tsmall",
  "Usmall",
  "Vsmall",
  "Wsmall",
  "Xsmall",
  "Ysmall",
  "Zsmall",
  "colonmonetary",
  "onefitted",
  "rupiah",
  "Tildesmall",
  "exclamdownsmall",
  "centoldstyle",
  "Lslashsmall",
  "Scaronsmall",
  "Zcaronsmall",
  "Dieresissmall",
  "Brevesmall",
  "Caronsmall",
  "Dotaccentsmall",
  "Macronsmall",
  "figuredash",
  "hypheninferior",
  "Ogoneksmall",
  "Ringsmall",
  "Cedillasmall",
  "questiondownsmall",
  "oneeighth",
  "threeeighths",
  "fiveeighths",
  "seveneighths",
  "onethird",
  "twothirds",
  "zerosuperior",
  "foursuperior",
  "fivesuperior",
  "sixsuperior",
  "sevensuperior",
  "eightsuperior",
  "ninesuperior",
  "zeroinferior",
  "oneinferior",
  "twoinferior",
  "threeinferior",
  "fourinferior",
  "fiveinferior",
  "sixinferior",
  "seveninferior",
  "eightinferior",
  "nineinferior",
  "centinferior",
  "dollarinferior",
  "periodinferior",
  "commainferior",
  "Agravesmall",
  "Aacutesmall",
  "Acircumflexsmall",
  "Atildesmall",
  "Adieresissmall",
  "Aringsmall",
  "AEsmall",
  "Ccedillasmall",
  "Egravesmall",
  "Eacutesmall",
  "Ecircumflexsmall",
  "Edieresissmall",
  "Igravesmall",
  "Iacutesmall",
  "Icircumflexsmall",
  "Idieresissmall",
  "Ethsmall",
  "Ntildesmall",
  "Ogravesmall",
  "Oacutesmall",
  "Ocircumflexsmall",
  "Otildesmall",
  "Odieresissmall",
  "OEsmall",
  "Oslashsmall",
  "Ugravesmall",
  "Uacutesmall",
  "Ucircumflexsmall",
  "Udieresissmall",
  "Yacutesmall",
  "Thornsmall",
  "Ydieresissmall",
  "001.000",
  "001.001",
  "001.002",
  "001.003",
  "Black",
  "Bold",
  "Book",
  "Light",
  "Medium",
  "Regular",
  "Roman",
  "Semibold"
];
var cffStandardEncoding = [
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "space",
  "exclam",
  "quotedbl",
  "numbersign",
  "dollar",
  "percent",
  "ampersand",
  "quoteright",
  "parenleft",
  "parenright",
  "asterisk",
  "plus",
  "comma",
  "hyphen",
  "period",
  "slash",
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "colon",
  "semicolon",
  "less",
  "equal",
  "greater",
  "question",
  "at",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "bracketleft",
  "backslash",
  "bracketright",
  "asciicircum",
  "underscore",
  "quoteleft",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "braceleft",
  "bar",
  "braceright",
  "asciitilde",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "exclamdown",
  "cent",
  "sterling",
  "fraction",
  "yen",
  "florin",
  "section",
  "currency",
  "quotesingle",
  "quotedblleft",
  "guillemotleft",
  "guilsinglleft",
  "guilsinglright",
  "fi",
  "fl",
  "",
  "endash",
  "dagger",
  "daggerdbl",
  "periodcentered",
  "",
  "paragraph",
  "bullet",
  "quotesinglbase",
  "quotedblbase",
  "quotedblright",
  "guillemotright",
  "ellipsis",
  "perthousand",
  "",
  "questiondown",
  "",
  "grave",
  "acute",
  "circumflex",
  "tilde",
  "macron",
  "breve",
  "dotaccent",
  "dieresis",
  "",
  "ring",
  "cedilla",
  "",
  "hungarumlaut",
  "ogonek",
  "caron",
  "emdash",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "AE",
  "",
  "ordfeminine",
  "",
  "",
  "",
  "",
  "Lslash",
  "Oslash",
  "OE",
  "ordmasculine",
  "",
  "",
  "",
  "",
  "",
  "ae",
  "",
  "",
  "",
  "dotlessi",
  "",
  "",
  "lslash",
  "oslash",
  "oe",
  "germandbls"
];
var cffExpertEncoding = [
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "space",
  "exclamsmall",
  "Hungarumlautsmall",
  "",
  "dollaroldstyle",
  "dollarsuperior",
  "ampersandsmall",
  "Acutesmall",
  "parenleftsuperior",
  "parenrightsuperior",
  "twodotenleader",
  "onedotenleader",
  "comma",
  "hyphen",
  "period",
  "fraction",
  "zerooldstyle",
  "oneoldstyle",
  "twooldstyle",
  "threeoldstyle",
  "fouroldstyle",
  "fiveoldstyle",
  "sixoldstyle",
  "sevenoldstyle",
  "eightoldstyle",
  "nineoldstyle",
  "colon",
  "semicolon",
  "commasuperior",
  "threequartersemdash",
  "periodsuperior",
  "questionsmall",
  "",
  "asuperior",
  "bsuperior",
  "centsuperior",
  "dsuperior",
  "esuperior",
  "",
  "",
  "isuperior",
  "",
  "",
  "lsuperior",
  "msuperior",
  "nsuperior",
  "osuperior",
  "",
  "",
  "rsuperior",
  "ssuperior",
  "tsuperior",
  "",
  "ff",
  "fi",
  "fl",
  "ffi",
  "ffl",
  "parenleftinferior",
  "",
  "parenrightinferior",
  "Circumflexsmall",
  "hyphensuperior",
  "Gravesmall",
  "Asmall",
  "Bsmall",
  "Csmall",
  "Dsmall",
  "Esmall",
  "Fsmall",
  "Gsmall",
  "Hsmall",
  "Ismall",
  "Jsmall",
  "Ksmall",
  "Lsmall",
  "Msmall",
  "Nsmall",
  "Osmall",
  "Psmall",
  "Qsmall",
  "Rsmall",
  "Ssmall",
  "Tsmall",
  "Usmall",
  "Vsmall",
  "Wsmall",
  "Xsmall",
  "Ysmall",
  "Zsmall",
  "colonmonetary",
  "onefitted",
  "rupiah",
  "Tildesmall",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "exclamdownsmall",
  "centoldstyle",
  "Lslashsmall",
  "",
  "",
  "Scaronsmall",
  "Zcaronsmall",
  "Dieresissmall",
  "Brevesmall",
  "Caronsmall",
  "",
  "Dotaccentsmall",
  "",
  "",
  "Macronsmall",
  "",
  "",
  "figuredash",
  "hypheninferior",
  "",
  "",
  "Ogoneksmall",
  "Ringsmall",
  "Cedillasmall",
  "",
  "",
  "",
  "onequarter",
  "onehalf",
  "threequarters",
  "questiondownsmall",
  "oneeighth",
  "threeeighths",
  "fiveeighths",
  "seveneighths",
  "onethird",
  "twothirds",
  "",
  "",
  "zerosuperior",
  "onesuperior",
  "twosuperior",
  "threesuperior",
  "foursuperior",
  "fivesuperior",
  "sixsuperior",
  "sevensuperior",
  "eightsuperior",
  "ninesuperior",
  "zeroinferior",
  "oneinferior",
  "twoinferior",
  "threeinferior",
  "fourinferior",
  "fiveinferior",
  "sixinferior",
  "seveninferior",
  "eightinferior",
  "nineinferior",
  "centinferior",
  "dollarinferior",
  "periodinferior",
  "commainferior",
  "Agravesmall",
  "Aacutesmall",
  "Acircumflexsmall",
  "Atildesmall",
  "Adieresissmall",
  "Aringsmall",
  "AEsmall",
  "Ccedillasmall",
  "Egravesmall",
  "Eacutesmall",
  "Ecircumflexsmall",
  "Edieresissmall",
  "Igravesmall",
  "Iacutesmall",
  "Icircumflexsmall",
  "Idieresissmall",
  "Ethsmall",
  "Ntildesmall",
  "Ogravesmall",
  "Oacutesmall",
  "Ocircumflexsmall",
  "Otildesmall",
  "Odieresissmall",
  "OEsmall",
  "Oslashsmall",
  "Ugravesmall",
  "Uacutesmall",
  "Ucircumflexsmall",
  "Udieresissmall",
  "Yacutesmall",
  "Thornsmall",
  "Ydieresissmall"
];
function DefaultEncoding(font) {
  this.font = font;
}
DefaultEncoding.prototype.charToGlyphIndex = function(c) {
  var code = c.codePointAt(0);
  var glyphs = this.font.glyphs;
  if (glyphs) {
    for (var i = 0; i < glyphs.length; i += 1) {
      var glyph = glyphs.get(i);
      for (var j = 0; j < glyph.unicodes.length; j += 1) {
        if (glyph.unicodes[j] === code) {
          return i;
        }
      }
    }
  }
  return null;
};
function CmapEncoding(cmap2) {
  this.cmap = cmap2;
}
CmapEncoding.prototype.charToGlyphIndex = function(c) {
  return this.cmap.glyphIndexMap[c.codePointAt(0)] || 0;
};
function CffEncoding(encoding, charset) {
  this.encoding = encoding;
  this.charset = charset;
}
CffEncoding.prototype.charToGlyphIndex = function(s) {
  var code = s.codePointAt(0);
  var charName = this.encoding[code];
  return this.charset.indexOf(charName);
};
function addGlyphNamesAll(font) {
  var glyph;
  var glyphIndexMap = font.tables.cmap.glyphIndexMap;
  var charCodes = Object.keys(glyphIndexMap);
  for (var i = 0; i < charCodes.length; i += 1) {
    var c = charCodes[i];
    var glyphIndex = glyphIndexMap[c];
    glyph = font.glyphs.get(glyphIndex);
    glyph.addUnicode(parseInt(c));
  }
}
function addGlyphNamesToUnicodeMap(font) {
  font._IndexToUnicodeMap = {};
  var glyphIndexMap = font.tables.cmap.glyphIndexMap;
  var charCodes = Object.keys(glyphIndexMap);
  for (var i = 0; i < charCodes.length; i += 1) {
    var c = charCodes[i];
    var glyphIndex = glyphIndexMap[c];
    if (font._IndexToUnicodeMap[glyphIndex] === void 0) {
      font._IndexToUnicodeMap[glyphIndex] = {
        unicodes: [parseInt(c)]
      };
    } else {
      font._IndexToUnicodeMap[glyphIndex].unicodes.push(parseInt(c));
    }
  }
}
function addGlyphNames(font, opt) {
  if (opt.lowMemory) {
    addGlyphNamesToUnicodeMap(font);
  } else {
    addGlyphNamesAll(font);
  }
}
function fail(message) {
  throw new Error(message);
}
function argument(predicate, message) {
  if (!predicate) {
    fail(message);
  }
}
var check = { fail, argument, assert: argument };
function getPathDefinition(glyph, path) {
  var _path = path || new Path();
  return {
    configurable: true,
    get: function() {
      if (typeof _path === "function") {
        _path = _path();
      }
      return _path;
    },
    set: function(p) {
      _path = p;
    }
  };
}
function Glyph(options) {
  this.bindConstructorValues(options);
}
Glyph.prototype.bindConstructorValues = function(options) {
  this.index = options.index || 0;
  this.name = options.name || null;
  this.unicode = options.unicode || void 0;
  this.unicodes = options.unicodes || options.unicode !== void 0 ? [options.unicode] : [];
  if ("xMin" in options) {
    this.xMin = options.xMin;
  }
  if ("yMin" in options) {
    this.yMin = options.yMin;
  }
  if ("xMax" in options) {
    this.xMax = options.xMax;
  }
  if ("yMax" in options) {
    this.yMax = options.yMax;
  }
  if ("advanceWidth" in options) {
    this.advanceWidth = options.advanceWidth;
  }
  Object.defineProperty(this, "path", getPathDefinition(this, options.path));
};
Glyph.prototype.addUnicode = function(unicode) {
  if (this.unicodes.length === 0) {
    this.unicode = unicode;
  }
  this.unicodes.push(unicode);
};
Glyph.prototype.getPath = function(x, y, fontSize, options, font) {
  x = x !== void 0 ? x : 0;
  y = y !== void 0 ? y : 0;
  fontSize = fontSize !== void 0 ? fontSize : 72;
  var commands;
  var hPoints;
  if (!options) {
    options = {};
  }
  var xScale = options.xScale;
  var yScale = options.yScale;
  if (options.hinting && font && font.hinting) {
    hPoints = this.path && font.hinting.exec(this, fontSize);
  }
  if (hPoints) {
    commands = font.hinting.getCommands(hPoints);
    x = Math.round(x);
    y = Math.round(y);
    xScale = yScale = 1;
  } else {
    commands = this.path.commands;
    var scale = 1 / (this.path.unitsPerEm || 1e3) * fontSize;
    if (xScale === void 0) {
      xScale = scale;
    }
    if (yScale === void 0) {
      yScale = scale;
    }
  }
  var p = new Path();
  for (var i = 0; i < commands.length; i += 1) {
    var cmd = commands[i];
    if (cmd.type === "M") {
      p.moveTo(x + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "L") {
      p.lineTo(x + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "Q") {
      p.quadraticCurveTo(x + cmd.x1 * xScale, y + -cmd.y1 * yScale, x + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "C") {
      p.curveTo(x + cmd.x1 * xScale, y + -cmd.y1 * yScale, x + cmd.x2 * xScale, y + -cmd.y2 * yScale, x + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "Z") {
      p.closePath();
    }
  }
  return p;
};
Glyph.prototype.getContours = function() {
  if (this.points === void 0) {
    return [];
  }
  var contours = [];
  var currentContour = [];
  for (var i = 0; i < this.points.length; i += 1) {
    var pt = this.points[i];
    currentContour.push(pt);
    if (pt.lastPointOfContour) {
      contours.push(currentContour);
      currentContour = [];
    }
  }
  check.argument(currentContour.length === 0, "There are still points left in the current contour.");
  return contours;
};
Glyph.prototype.getMetrics = function() {
  var commands = this.path.commands;
  var xCoords = [];
  var yCoords = [];
  for (var i = 0; i < commands.length; i += 1) {
    var cmd = commands[i];
    if (cmd.type !== "Z") {
      xCoords.push(cmd.x);
      yCoords.push(cmd.y);
    }
    if (cmd.type === "Q" || cmd.type === "C") {
      xCoords.push(cmd.x1);
      yCoords.push(cmd.y1);
    }
    if (cmd.type === "C") {
      xCoords.push(cmd.x2);
      yCoords.push(cmd.y2);
    }
  }
  var metrics = {
    xMin: Math.min.apply(null, xCoords),
    yMin: Math.min.apply(null, yCoords),
    xMax: Math.max.apply(null, xCoords),
    yMax: Math.max.apply(null, yCoords),
    leftSideBearing: this.leftSideBearing
  };
  if (!isFinite(metrics.xMin)) {
    metrics.xMin = 0;
  }
  if (!isFinite(metrics.xMax)) {
    metrics.xMax = this.advanceWidth;
  }
  if (!isFinite(metrics.yMin)) {
    metrics.yMin = 0;
  }
  if (!isFinite(metrics.yMax)) {
    metrics.yMax = 0;
  }
  metrics.rightSideBearing = this.advanceWidth - metrics.leftSideBearing - (metrics.xMax - metrics.xMin);
  return metrics;
};
function defineDependentProperty(glyph, externalName, internalName) {
  Object.defineProperty(glyph, externalName, {
    get: function() {
      glyph.path;
      return glyph[internalName];
    },
    set: function(newValue) {
      glyph[internalName] = newValue;
    },
    enumerable: true,
    configurable: true
  });
}
function GlyphSet(font, glyphs) {
  this.font = font;
  this.glyphs = {};
  if (Array.isArray(glyphs)) {
    for (var i = 0; i < glyphs.length; i++) {
      var glyph = glyphs[i];
      glyph.path.unitsPerEm = font.unitsPerEm;
      this.glyphs[i] = glyph;
    }
  }
  this.length = glyphs && glyphs.length || 0;
}
GlyphSet.prototype.get = function(index) {
  if (this.glyphs[index] === void 0) {
    this.font._push(index);
    if (typeof this.glyphs[index] === "function") {
      this.glyphs[index] = this.glyphs[index]();
    }
    var glyph = this.glyphs[index];
    var unicodeObj = this.font._IndexToUnicodeMap[index];
    if (unicodeObj) {
      for (var j = 0; j < unicodeObj.unicodes.length; j++) {
        glyph.addUnicode(unicodeObj.unicodes[j]);
      }
    }
    this.glyphs[index].advanceWidth = this.font._hmtxTableData[index].advanceWidth;
    this.glyphs[index].leftSideBearing = this.font._hmtxTableData[index].leftSideBearing;
  } else {
    if (typeof this.glyphs[index] === "function") {
      this.glyphs[index] = this.glyphs[index]();
    }
  }
  return this.glyphs[index];
};
GlyphSet.prototype.push = function(index, loader) {
  this.glyphs[index] = loader;
  this.length++;
};
function glyphLoader(font, index) {
  return new Glyph({ index, font });
}
function ttfGlyphLoader(font, index, parseGlyph2, data, position, buildPath2) {
  return function() {
    var glyph = new Glyph({ index, font });
    glyph.path = function() {
      parseGlyph2(glyph, data, position);
      var path = buildPath2(font.glyphs, glyph);
      path.unitsPerEm = font.unitsPerEm;
      return path;
    };
    defineDependentProperty(glyph, "xMin", "_xMin");
    defineDependentProperty(glyph, "xMax", "_xMax");
    defineDependentProperty(glyph, "yMin", "_yMin");
    defineDependentProperty(glyph, "yMax", "_yMax");
    return glyph;
  };
}
function cffGlyphLoader(font, index, parseCFFCharstring2, charstring) {
  return function() {
    var glyph = new Glyph({ index, font });
    glyph.path = function() {
      var path = parseCFFCharstring2(font, glyph, charstring);
      path.unitsPerEm = font.unitsPerEm;
      return path;
    };
    return glyph;
  };
}
var glyphset = { GlyphSet, glyphLoader, ttfGlyphLoader, cffGlyphLoader };
function searchTag(arr, tag) {
  var imin = 0;
  var imax = arr.length - 1;
  while (imin <= imax) {
    var imid = imin + imax >>> 1;
    var val = arr[imid].tag;
    if (val === tag) {
      return imid;
    } else if (val < tag) {
      imin = imid + 1;
    } else {
      imax = imid - 1;
    }
  }
  return -imin - 1;
}
function binSearch(arr, value) {
  var imin = 0;
  var imax = arr.length - 1;
  while (imin <= imax) {
    var imid = imin + imax >>> 1;
    var val = arr[imid];
    if (val === value) {
      return imid;
    } else if (val < value) {
      imin = imid + 1;
    } else {
      imax = imid - 1;
    }
  }
  return -imin - 1;
}
function searchRange(ranges, value) {
  var range;
  var imin = 0;
  var imax = ranges.length - 1;
  while (imin <= imax) {
    var imid = imin + imax >>> 1;
    range = ranges[imid];
    var start = range.start;
    if (start === value) {
      return range;
    } else if (start < value) {
      imin = imid + 1;
    } else {
      imax = imid - 1;
    }
  }
  if (imin > 0) {
    range = ranges[imin - 1];
    if (value > range.end) {
      return 0;
    }
    return range;
  }
}
function Layout(font, tableName) {
  this.font = font;
  this.tableName = tableName;
}
Layout.prototype = {
  searchTag,
  binSearch,
  getTable: function(create) {
    var layout = this.font.tables[this.tableName];
    if (!layout && create) {
      layout = this.font.tables[this.tableName] = this.createDefaultTable();
    }
    return layout;
  },
  getDefaultScriptName: function() {
    var layout = this.getTable();
    if (!layout) {
      return;
    }
    var hasLatn = false;
    for (var i = 0; i < layout.scripts.length; i++) {
      var name = layout.scripts[i].tag;
      if (name === "DFLT") {
        return name;
      }
      if (name === "latn") {
        hasLatn = true;
      }
    }
    if (hasLatn) {
      return "latn";
    }
  },
  getScriptTable: function(script, create) {
    var layout = this.getTable(create);
    if (layout) {
      script = script || "DFLT";
      var scripts = layout.scripts;
      var pos = searchTag(layout.scripts, script);
      if (pos >= 0) {
        return scripts[pos].script;
      } else if (create) {
        var scr = {
          tag: script,
          script: {
            defaultLangSys: {
              reserved: 0,
              reqFeatureIndex: 65535,
              featureIndexes: []
            },
            langSysRecords: []
          }
        };
        scripts.splice(-1 - pos, 0, scr);
        return scr.script;
      }
    }
  },
  getLangSysTable: function(script, language, create) {
    var scriptTable = this.getScriptTable(script, create);
    if (scriptTable) {
      if (!language || language === "dflt" || language === "DFLT") {
        return scriptTable.defaultLangSys;
      }
      var pos = searchTag(scriptTable.langSysRecords, language);
      if (pos >= 0) {
        return scriptTable.langSysRecords[pos].langSys;
      } else if (create) {
        var langSysRecord = {
          tag: language,
          langSys: {
            reserved: 0,
            reqFeatureIndex: 65535,
            featureIndexes: []
          }
        };
        scriptTable.langSysRecords.splice(-1 - pos, 0, langSysRecord);
        return langSysRecord.langSys;
      }
    }
  },
  getFeatureTable: function(script, language, feature, create) {
    var langSysTable2 = this.getLangSysTable(script, language, create);
    if (langSysTable2) {
      var featureRecord;
      var featIndexes = langSysTable2.featureIndexes;
      var allFeatures = this.font.tables[this.tableName].features;
      for (var i = 0; i < featIndexes.length; i++) {
        featureRecord = allFeatures[featIndexes[i]];
        if (featureRecord.tag === feature) {
          return featureRecord.feature;
        }
      }
      if (create) {
        var index = allFeatures.length;
        check.assert(index === 0 || feature >= allFeatures[index - 1].tag, "Features must be added in alphabetical order.");
        featureRecord = {
          tag: feature,
          feature: { params: 0, lookupListIndexes: [] }
        };
        allFeatures.push(featureRecord);
        featIndexes.push(index);
        return featureRecord.feature;
      }
    }
  },
  getLookupTables: function(script, language, feature, lookupType, create) {
    var featureTable = this.getFeatureTable(script, language, feature, create);
    var tables = [];
    if (featureTable) {
      var lookupTable;
      var lookupListIndexes = featureTable.lookupListIndexes;
      var allLookups = this.font.tables[this.tableName].lookups;
      for (var i = 0; i < lookupListIndexes.length; i++) {
        lookupTable = allLookups[lookupListIndexes[i]];
        if (lookupTable.lookupType === lookupType) {
          tables.push(lookupTable);
        }
      }
      if (tables.length === 0 && create) {
        lookupTable = {
          lookupType,
          lookupFlag: 0,
          subtables: [],
          markFilteringSet: void 0
        };
        var index = allLookups.length;
        allLookups.push(lookupTable);
        lookupListIndexes.push(index);
        return [lookupTable];
      }
    }
    return tables;
  },
  getGlyphClass: function(classDefTable, glyphIndex) {
    switch (classDefTable.format) {
      case 1:
        if (classDefTable.startGlyph <= glyphIndex && glyphIndex < classDefTable.startGlyph + classDefTable.classes.length) {
          return classDefTable.classes[glyphIndex - classDefTable.startGlyph];
        }
        return 0;
      case 2:
        var range = searchRange(classDefTable.ranges, glyphIndex);
        return range ? range.classId : 0;
    }
  },
  getCoverageIndex: function(coverageTable, glyphIndex) {
    switch (coverageTable.format) {
      case 1:
        var index = binSearch(coverageTable.glyphs, glyphIndex);
        return index >= 0 ? index : -1;
      case 2:
        var range = searchRange(coverageTable.ranges, glyphIndex);
        return range ? range.index + glyphIndex - range.start : -1;
    }
  },
  expandCoverage: function(coverageTable) {
    if (coverageTable.format === 1) {
      return coverageTable.glyphs;
    } else {
      var glyphs = [];
      var ranges = coverageTable.ranges;
      for (var i = 0; i < ranges.length; i++) {
        var range = ranges[i];
        var start = range.start;
        var end = range.end;
        for (var j = start; j <= end; j++) {
          glyphs.push(j);
        }
      }
      return glyphs;
    }
  }
};
function Position(font) {
  Layout.call(this, font, "gpos");
}
Position.prototype = Layout.prototype;
Position.prototype.init = function() {
  var script = this.getDefaultScriptName();
  this.defaultKerningTables = this.getKerningTables(script);
};
Position.prototype.getKerningValue = function(kerningLookups, leftIndex, rightIndex) {
  for (var i = 0; i < kerningLookups.length; i++) {
    var subtables = kerningLookups[i].subtables;
    for (var j = 0; j < subtables.length; j++) {
      var subtable = subtables[j];
      var covIndex = this.getCoverageIndex(subtable.coverage, leftIndex);
      if (covIndex < 0) {
        continue;
      }
      switch (subtable.posFormat) {
        case 1:
          var pairSet = subtable.pairSets[covIndex];
          for (var k = 0; k < pairSet.length; k++) {
            var pair = pairSet[k];
            if (pair.secondGlyph === rightIndex) {
              return pair.value1 && pair.value1.xAdvance || 0;
            }
          }
          break;
        case 2:
          var class1 = this.getGlyphClass(subtable.classDef1, leftIndex);
          var class2 = this.getGlyphClass(subtable.classDef2, rightIndex);
          var pair$1 = subtable.classRecords[class1][class2];
          return pair$1.value1 && pair$1.value1.xAdvance || 0;
      }
    }
  }
  return 0;
};
Position.prototype.getKerningTables = function(script, language) {
  if (this.font.tables.gpos) {
    return this.getLookupTables(script, language, "kern", 2);
  }
};
function Substitution(font) {
  Layout.call(this, font, "gsub");
}
function arraysEqual(ar1, ar2) {
  var n = ar1.length;
  if (n !== ar2.length) {
    return false;
  }
  for (var i = 0; i < n; i++) {
    if (ar1[i] !== ar2[i]) {
      return false;
    }
  }
  return true;
}
function getSubstFormat(lookupTable, format, defaultSubtable) {
  var subtables = lookupTable.subtables;
  for (var i = 0; i < subtables.length; i++) {
    var subtable = subtables[i];
    if (subtable.substFormat === format) {
      return subtable;
    }
  }
  if (defaultSubtable) {
    subtables.push(defaultSubtable);
    return defaultSubtable;
  }
  return void 0;
}
Substitution.prototype = Layout.prototype;
Substitution.prototype.createDefaultTable = function() {
  return {
    version: 1,
    scripts: [
      {
        tag: "DFLT",
        script: {
          defaultLangSys: {
            reserved: 0,
            reqFeatureIndex: 65535,
            featureIndexes: []
          },
          langSysRecords: []
        }
      }
    ],
    features: [],
    lookups: []
  };
};
Substitution.prototype.getSingle = function(feature, script, language) {
  var substitutions = [];
  var lookupTables = this.getLookupTables(script, language, feature, 1);
  for (var idx = 0; idx < lookupTables.length; idx++) {
    var subtables = lookupTables[idx].subtables;
    for (var i = 0; i < subtables.length; i++) {
      var subtable = subtables[i];
      var glyphs = this.expandCoverage(subtable.coverage);
      var j = void 0;
      if (subtable.substFormat === 1) {
        var delta = subtable.deltaGlyphId;
        for (j = 0; j < glyphs.length; j++) {
          var glyph = glyphs[j];
          substitutions.push({ sub: glyph, by: glyph + delta });
        }
      } else {
        var substitute = subtable.substitute;
        for (j = 0; j < glyphs.length; j++) {
          substitutions.push({ sub: glyphs[j], by: substitute[j] });
        }
      }
    }
  }
  return substitutions;
};
Substitution.prototype.getMultiple = function(feature, script, language) {
  var substitutions = [];
  var lookupTables = this.getLookupTables(script, language, feature, 2);
  for (var idx = 0; idx < lookupTables.length; idx++) {
    var subtables = lookupTables[idx].subtables;
    for (var i = 0; i < subtables.length; i++) {
      var subtable = subtables[i];
      var glyphs = this.expandCoverage(subtable.coverage);
      var j = void 0;
      for (j = 0; j < glyphs.length; j++) {
        var glyph = glyphs[j];
        var replacements = subtable.sequences[j];
        substitutions.push({ sub: glyph, by: replacements });
      }
    }
  }
  return substitutions;
};
Substitution.prototype.getAlternates = function(feature, script, language) {
  var alternates = [];
  var lookupTables = this.getLookupTables(script, language, feature, 3);
  for (var idx = 0; idx < lookupTables.length; idx++) {
    var subtables = lookupTables[idx].subtables;
    for (var i = 0; i < subtables.length; i++) {
      var subtable = subtables[i];
      var glyphs = this.expandCoverage(subtable.coverage);
      var alternateSets = subtable.alternateSets;
      for (var j = 0; j < glyphs.length; j++) {
        alternates.push({ sub: glyphs[j], by: alternateSets[j] });
      }
    }
  }
  return alternates;
};
Substitution.prototype.getLigatures = function(feature, script, language) {
  var ligatures = [];
  var lookupTables = this.getLookupTables(script, language, feature, 4);
  for (var idx = 0; idx < lookupTables.length; idx++) {
    var subtables = lookupTables[idx].subtables;
    for (var i = 0; i < subtables.length; i++) {
      var subtable = subtables[i];
      var glyphs = this.expandCoverage(subtable.coverage);
      var ligatureSets = subtable.ligatureSets;
      for (var j = 0; j < glyphs.length; j++) {
        var startGlyph = glyphs[j];
        var ligSet = ligatureSets[j];
        for (var k = 0; k < ligSet.length; k++) {
          var lig = ligSet[k];
          ligatures.push({
            sub: [startGlyph].concat(lig.components),
            by: lig.ligGlyph
          });
        }
      }
    }
  }
  return ligatures;
};
Substitution.prototype.addSingle = function(feature, substitution, script, language) {
  var lookupTable = this.getLookupTables(script, language, feature, 1, true)[0];
  var subtable = getSubstFormat(lookupTable, 2, {
    substFormat: 2,
    coverage: { format: 1, glyphs: [] },
    substitute: []
  });
  check.assert(subtable.coverage.format === 1, "Single: unable to modify coverage table format " + subtable.coverage.format);
  var coverageGlyph = substitution.sub;
  var pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
  if (pos < 0) {
    pos = -1 - pos;
    subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
    subtable.substitute.splice(pos, 0, 0);
  }
  subtable.substitute[pos] = substitution.by;
};
Substitution.prototype.addMultiple = function(feature, substitution, script, language) {
  check.assert(substitution.by instanceof Array && substitution.by.length > 1, 'Multiple: "by" must be an array of two or more ids');
  var lookupTable = this.getLookupTables(script, language, feature, 2, true)[0];
  var subtable = getSubstFormat(lookupTable, 1, {
    substFormat: 1,
    coverage: { format: 1, glyphs: [] },
    sequences: []
  });
  check.assert(subtable.coverage.format === 1, "Multiple: unable to modify coverage table format " + subtable.coverage.format);
  var coverageGlyph = substitution.sub;
  var pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
  if (pos < 0) {
    pos = -1 - pos;
    subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
    subtable.sequences.splice(pos, 0, 0);
  }
  subtable.sequences[pos] = substitution.by;
};
Substitution.prototype.addAlternate = function(feature, substitution, script, language) {
  var lookupTable = this.getLookupTables(script, language, feature, 3, true)[0];
  var subtable = getSubstFormat(lookupTable, 1, {
    substFormat: 1,
    coverage: { format: 1, glyphs: [] },
    alternateSets: []
  });
  check.assert(subtable.coverage.format === 1, "Alternate: unable to modify coverage table format " + subtable.coverage.format);
  var coverageGlyph = substitution.sub;
  var pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
  if (pos < 0) {
    pos = -1 - pos;
    subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
    subtable.alternateSets.splice(pos, 0, 0);
  }
  subtable.alternateSets[pos] = substitution.by;
};
Substitution.prototype.addLigature = function(feature, ligature, script, language) {
  var lookupTable = this.getLookupTables(script, language, feature, 4, true)[0];
  var subtable = lookupTable.subtables[0];
  if (!subtable) {
    subtable = {
      substFormat: 1,
      coverage: { format: 1, glyphs: [] },
      ligatureSets: []
    };
    lookupTable.subtables[0] = subtable;
  }
  check.assert(subtable.coverage.format === 1, "Ligature: unable to modify coverage table format " + subtable.coverage.format);
  var coverageGlyph = ligature.sub[0];
  var ligComponents = ligature.sub.slice(1);
  var ligatureTable = {
    ligGlyph: ligature.by,
    components: ligComponents
  };
  var pos = this.binSearch(subtable.coverage.glyphs, coverageGlyph);
  if (pos >= 0) {
    var ligatureSet = subtable.ligatureSets[pos];
    for (var i = 0; i < ligatureSet.length; i++) {
      if (arraysEqual(ligatureSet[i].components, ligComponents)) {
        return;
      }
    }
    ligatureSet.push(ligatureTable);
  } else {
    pos = -1 - pos;
    subtable.coverage.glyphs.splice(pos, 0, coverageGlyph);
    subtable.ligatureSets.splice(pos, 0, [ligatureTable]);
  }
};
Substitution.prototype.getFeature = function(feature, script, language) {
  if (/ss\d\d/.test(feature)) {
    return this.getSingle(feature, script, language);
  }
  switch (feature) {
    case "aalt":
    case "salt":
      return this.getSingle(feature, script, language).concat(this.getAlternates(feature, script, language));
    case "dlig":
    case "liga":
    case "rlig":
      return this.getLigatures(feature, script, language);
    case "ccmp":
      return this.getMultiple(feature, script, language).concat(this.getLigatures(feature, script, language));
    case "stch":
      return this.getMultiple(feature, script, language);
  }
  return void 0;
};
Substitution.prototype.add = function(feature, sub, script, language) {
  if (/ss\d\d/.test(feature)) {
    return this.addSingle(feature, sub, script, language);
  }
  switch (feature) {
    case "aalt":
    case "salt":
      if (typeof sub.by === "number") {
        return this.addSingle(feature, sub, script, language);
      }
      return this.addAlternate(feature, sub, script, language);
    case "dlig":
    case "liga":
    case "rlig":
      return this.addLigature(feature, sub, script, language);
    case "ccmp":
      if (sub.by instanceof Array) {
        return this.addMultiple(feature, sub, script, language);
      }
      return this.addLigature(feature, sub, script, language);
  }
  return void 0;
};
function checkArgument(expression, message) {
  if (!expression) {
    throw message;
  }
}
function getByte(dataView, offset) {
  return dataView.getUint8(offset);
}
function getUShort(dataView, offset) {
  return dataView.getUint16(offset, false);
}
function getShort(dataView, offset) {
  return dataView.getInt16(offset, false);
}
function getULong(dataView, offset) {
  return dataView.getUint32(offset, false);
}
function getFixed(dataView, offset) {
  var decimal = dataView.getInt16(offset, false);
  var fraction = dataView.getUint16(offset + 2, false);
  return decimal + fraction / 65535;
}
function getTag(dataView, offset) {
  var tag = "";
  for (var i = offset; i < offset + 4; i += 1) {
    tag += String.fromCharCode(dataView.getInt8(i));
  }
  return tag;
}
function getOffset(dataView, offset, offSize) {
  var v = 0;
  for (var i = 0; i < offSize; i += 1) {
    v <<= 8;
    v += dataView.getUint8(offset + i);
  }
  return v;
}
function getBytes(dataView, startOffset, endOffset) {
  var bytes = [];
  for (var i = startOffset; i < endOffset; i += 1) {
    bytes.push(dataView.getUint8(i));
  }
  return bytes;
}
function bytesToString(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i += 1) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}
var typeOffsets = {
  byte: 1,
  uShort: 2,
  short: 2,
  uLong: 4,
  fixed: 4,
  longDateTime: 8,
  tag: 4
};
function Parser(data, offset) {
  this.data = data;
  this.offset = offset;
  this.relativeOffset = 0;
}
Parser.prototype.parseByte = function() {
  var v = this.data.getUint8(this.offset + this.relativeOffset);
  this.relativeOffset += 1;
  return v;
};
Parser.prototype.parseChar = function() {
  var v = this.data.getInt8(this.offset + this.relativeOffset);
  this.relativeOffset += 1;
  return v;
};
Parser.prototype.parseCard8 = Parser.prototype.parseByte;
Parser.prototype.parseUShort = function() {
  var v = this.data.getUint16(this.offset + this.relativeOffset);
  this.relativeOffset += 2;
  return v;
};
Parser.prototype.parseCard16 = Parser.prototype.parseUShort;
Parser.prototype.parseSID = Parser.prototype.parseUShort;
Parser.prototype.parseOffset16 = Parser.prototype.parseUShort;
Parser.prototype.parseShort = function() {
  var v = this.data.getInt16(this.offset + this.relativeOffset);
  this.relativeOffset += 2;
  return v;
};
Parser.prototype.parseF2Dot14 = function() {
  var v = this.data.getInt16(this.offset + this.relativeOffset) / 16384;
  this.relativeOffset += 2;
  return v;
};
Parser.prototype.parseULong = function() {
  var v = getULong(this.data, this.offset + this.relativeOffset);
  this.relativeOffset += 4;
  return v;
};
Parser.prototype.parseOffset32 = Parser.prototype.parseULong;
Parser.prototype.parseFixed = function() {
  var v = getFixed(this.data, this.offset + this.relativeOffset);
  this.relativeOffset += 4;
  return v;
};
Parser.prototype.parseString = function(length) {
  var dataView = this.data;
  var offset = this.offset + this.relativeOffset;
  var string = "";
  this.relativeOffset += length;
  for (var i = 0; i < length; i++) {
    string += String.fromCharCode(dataView.getUint8(offset + i));
  }
  return string;
};
Parser.prototype.parseTag = function() {
  return this.parseString(4);
};
Parser.prototype.parseLongDateTime = function() {
  var v = getULong(this.data, this.offset + this.relativeOffset + 4);
  v -= 2082844800;
  this.relativeOffset += 8;
  return v;
};
Parser.prototype.parseVersion = function(minorBase) {
  var major = getUShort(this.data, this.offset + this.relativeOffset);
  var minor = getUShort(this.data, this.offset + this.relativeOffset + 2);
  this.relativeOffset += 4;
  if (minorBase === void 0) {
    minorBase = 4096;
  }
  return major + minor / minorBase / 10;
};
Parser.prototype.skip = function(type, amount) {
  if (amount === void 0) {
    amount = 1;
  }
  this.relativeOffset += typeOffsets[type] * amount;
};
Parser.prototype.parseULongList = function(count) {
  if (count === void 0) {
    count = this.parseULong();
  }
  var offsets = new Array(count);
  var dataView = this.data;
  var offset = this.offset + this.relativeOffset;
  for (var i = 0; i < count; i++) {
    offsets[i] = dataView.getUint32(offset);
    offset += 4;
  }
  this.relativeOffset += count * 4;
  return offsets;
};
Parser.prototype.parseOffset16List = Parser.prototype.parseUShortList = function(count) {
  if (count === void 0) {
    count = this.parseUShort();
  }
  var offsets = new Array(count);
  var dataView = this.data;
  var offset = this.offset + this.relativeOffset;
  for (var i = 0; i < count; i++) {
    offsets[i] = dataView.getUint16(offset);
    offset += 2;
  }
  this.relativeOffset += count * 2;
  return offsets;
};
Parser.prototype.parseShortList = function(count) {
  var list = new Array(count);
  var dataView = this.data;
  var offset = this.offset + this.relativeOffset;
  for (var i = 0; i < count; i++) {
    list[i] = dataView.getInt16(offset);
    offset += 2;
  }
  this.relativeOffset += count * 2;
  return list;
};
Parser.prototype.parseByteList = function(count) {
  var list = new Array(count);
  var dataView = this.data;
  var offset = this.offset + this.relativeOffset;
  for (var i = 0; i < count; i++) {
    list[i] = dataView.getUint8(offset++);
  }
  this.relativeOffset += count;
  return list;
};
Parser.prototype.parseList = function(count, itemCallback) {
  if (!itemCallback) {
    itemCallback = count;
    count = this.parseUShort();
  }
  var list = new Array(count);
  for (var i = 0; i < count; i++) {
    list[i] = itemCallback.call(this);
  }
  return list;
};
Parser.prototype.parseList32 = function(count, itemCallback) {
  if (!itemCallback) {
    itemCallback = count;
    count = this.parseULong();
  }
  var list = new Array(count);
  for (var i = 0; i < count; i++) {
    list[i] = itemCallback.call(this);
  }
  return list;
};
Parser.prototype.parseRecordList = function(count, recordDescription) {
  if (!recordDescription) {
    recordDescription = count;
    count = this.parseUShort();
  }
  var records = new Array(count);
  var fields = Object.keys(recordDescription);
  for (var i = 0; i < count; i++) {
    var rec = {};
    for (var j = 0; j < fields.length; j++) {
      var fieldName = fields[j];
      var fieldType = recordDescription[fieldName];
      rec[fieldName] = fieldType.call(this);
    }
    records[i] = rec;
  }
  return records;
};
Parser.prototype.parseRecordList32 = function(count, recordDescription) {
  if (!recordDescription) {
    recordDescription = count;
    count = this.parseULong();
  }
  var records = new Array(count);
  var fields = Object.keys(recordDescription);
  for (var i = 0; i < count; i++) {
    var rec = {};
    for (var j = 0; j < fields.length; j++) {
      var fieldName = fields[j];
      var fieldType = recordDescription[fieldName];
      rec[fieldName] = fieldType.call(this);
    }
    records[i] = rec;
  }
  return records;
};
Parser.prototype.parseStruct = function(description) {
  if (typeof description === "function") {
    return description.call(this);
  } else {
    var fields = Object.keys(description);
    var struct = {};
    for (var j = 0; j < fields.length; j++) {
      var fieldName = fields[j];
      var fieldType = description[fieldName];
      struct[fieldName] = fieldType.call(this);
    }
    return struct;
  }
};
Parser.prototype.parseValueRecord = function(valueFormat) {
  if (valueFormat === void 0) {
    valueFormat = this.parseUShort();
  }
  if (valueFormat === 0) {
    return;
  }
  var valueRecord = {};
  if (valueFormat & 1) {
    valueRecord.xPlacement = this.parseShort();
  }
  if (valueFormat & 2) {
    valueRecord.yPlacement = this.parseShort();
  }
  if (valueFormat & 4) {
    valueRecord.xAdvance = this.parseShort();
  }
  if (valueFormat & 8) {
    valueRecord.yAdvance = this.parseShort();
  }
  if (valueFormat & 16) {
    valueRecord.xPlaDevice = void 0;
    this.parseShort();
  }
  if (valueFormat & 32) {
    valueRecord.yPlaDevice = void 0;
    this.parseShort();
  }
  if (valueFormat & 64) {
    valueRecord.xAdvDevice = void 0;
    this.parseShort();
  }
  if (valueFormat & 128) {
    valueRecord.yAdvDevice = void 0;
    this.parseShort();
  }
  return valueRecord;
};
Parser.prototype.parseValueRecordList = function() {
  var valueFormat = this.parseUShort();
  var valueCount = this.parseUShort();
  var values = new Array(valueCount);
  for (var i = 0; i < valueCount; i++) {
    values[i] = this.parseValueRecord(valueFormat);
  }
  return values;
};
Parser.prototype.parsePointer = function(description) {
  var structOffset = this.parseOffset16();
  if (structOffset > 0) {
    return new Parser(this.data, this.offset + structOffset).parseStruct(description);
  }
  return void 0;
};
Parser.prototype.parsePointer32 = function(description) {
  var structOffset = this.parseOffset32();
  if (structOffset > 0) {
    return new Parser(this.data, this.offset + structOffset).parseStruct(description);
  }
  return void 0;
};
Parser.prototype.parseListOfLists = function(itemCallback) {
  var offsets = this.parseOffset16List();
  var count = offsets.length;
  var relativeOffset = this.relativeOffset;
  var list = new Array(count);
  for (var i = 0; i < count; i++) {
    var start = offsets[i];
    if (start === 0) {
      list[i] = void 0;
      continue;
    }
    this.relativeOffset = start;
    if (itemCallback) {
      var subOffsets = this.parseOffset16List();
      var subList = new Array(subOffsets.length);
      for (var j = 0; j < subOffsets.length; j++) {
        this.relativeOffset = start + subOffsets[j];
        subList[j] = itemCallback.call(this);
      }
      list[i] = subList;
    } else {
      list[i] = this.parseUShortList();
    }
  }
  this.relativeOffset = relativeOffset;
  return list;
};
Parser.prototype.parseCoverage = function() {
  var startOffset = this.offset + this.relativeOffset;
  var format = this.parseUShort();
  var count = this.parseUShort();
  if (format === 1) {
    return {
      format: 1,
      glyphs: this.parseUShortList(count)
    };
  } else if (format === 2) {
    var ranges = new Array(count);
    for (var i = 0; i < count; i++) {
      ranges[i] = {
        start: this.parseUShort(),
        end: this.parseUShort(),
        index: this.parseUShort()
      };
    }
    return {
      format: 2,
      ranges
    };
  }
  throw new Error("0x" + startOffset.toString(16) + ": Coverage format must be 1 or 2.");
};
Parser.prototype.parseClassDef = function() {
  var startOffset = this.offset + this.relativeOffset;
  var format = this.parseUShort();
  if (format === 1) {
    return {
      format: 1,
      startGlyph: this.parseUShort(),
      classes: this.parseUShortList()
    };
  } else if (format === 2) {
    return {
      format: 2,
      ranges: this.parseRecordList({
        start: Parser.uShort,
        end: Parser.uShort,
        classId: Parser.uShort
      })
    };
  }
  throw new Error("0x" + startOffset.toString(16) + ": ClassDef format must be 1 or 2.");
};
Parser.list = function(count, itemCallback) {
  return function() {
    return this.parseList(count, itemCallback);
  };
};
Parser.list32 = function(count, itemCallback) {
  return function() {
    return this.parseList32(count, itemCallback);
  };
};
Parser.recordList = function(count, recordDescription) {
  return function() {
    return this.parseRecordList(count, recordDescription);
  };
};
Parser.recordList32 = function(count, recordDescription) {
  return function() {
    return this.parseRecordList32(count, recordDescription);
  };
};
Parser.pointer = function(description) {
  return function() {
    return this.parsePointer(description);
  };
};
Parser.pointer32 = function(description) {
  return function() {
    return this.parsePointer32(description);
  };
};
Parser.tag = Parser.prototype.parseTag;
Parser.byte = Parser.prototype.parseByte;
Parser.uShort = Parser.offset16 = Parser.prototype.parseUShort;
Parser.uShortList = Parser.prototype.parseUShortList;
Parser.uLong = Parser.offset32 = Parser.prototype.parseULong;
Parser.uLongList = Parser.prototype.parseULongList;
Parser.struct = Parser.prototype.parseStruct;
Parser.coverage = Parser.prototype.parseCoverage;
Parser.classDef = Parser.prototype.parseClassDef;
var langSysTable = {
  reserved: Parser.uShort,
  reqFeatureIndex: Parser.uShort,
  featureIndexes: Parser.uShortList
};
Parser.prototype.parseScriptList = function() {
  return this.parsePointer(Parser.recordList({
    tag: Parser.tag,
    script: Parser.pointer({
      defaultLangSys: Parser.pointer(langSysTable),
      langSysRecords: Parser.recordList({
        tag: Parser.tag,
        langSys: Parser.pointer(langSysTable)
      })
    })
  })) || [];
};
Parser.prototype.parseFeatureList = function() {
  return this.parsePointer(Parser.recordList({
    tag: Parser.tag,
    feature: Parser.pointer({
      featureParams: Parser.offset16,
      lookupListIndexes: Parser.uShortList
    })
  })) || [];
};
Parser.prototype.parseLookupList = function(lookupTableParsers) {
  return this.parsePointer(Parser.list(Parser.pointer(function() {
    var lookupType = this.parseUShort();
    check.argument(1 <= lookupType && lookupType <= 9, "GPOS/GSUB lookup type " + lookupType + " unknown.");
    var lookupFlag = this.parseUShort();
    var useMarkFilteringSet = lookupFlag & 16;
    return {
      lookupType,
      lookupFlag,
      subtables: this.parseList(Parser.pointer(lookupTableParsers[lookupType])),
      markFilteringSet: useMarkFilteringSet ? this.parseUShort() : void 0
    };
  }))) || [];
};
Parser.prototype.parseFeatureVariationsList = function() {
  return this.parsePointer32(function() {
    var majorVersion = this.parseUShort();
    var minorVersion = this.parseUShort();
    check.argument(majorVersion === 1 && minorVersion < 1, "GPOS/GSUB feature variations table unknown.");
    var featureVariations = this.parseRecordList32({
      conditionSetOffset: Parser.offset32,
      featureTableSubstitutionOffset: Parser.offset32
    });
    return featureVariations;
  }) || [];
};
var parse = {
  getByte,
  getCard8: getByte,
  getUShort,
  getCard16: getUShort,
  getShort,
  getULong,
  getFixed,
  getTag,
  getOffset,
  getBytes,
  bytesToString,
  Parser
};
function parseGlyphCoordinate(p, flag, previousValue, shortVectorBitMask, sameBitMask) {
  var v;
  if ((flag & shortVectorBitMask) > 0) {
    v = p.parseByte();
    if ((flag & sameBitMask) === 0) {
      v = -v;
    }
    v = previousValue + v;
  } else {
    if ((flag & sameBitMask) > 0) {
      v = previousValue;
    } else {
      v = previousValue + p.parseShort();
    }
  }
  return v;
}
function parseGlyph(glyph, data, start) {
  var p = new parse.Parser(data, start);
  glyph.numberOfContours = p.parseShort();
  glyph._xMin = p.parseShort();
  glyph._yMin = p.parseShort();
  glyph._xMax = p.parseShort();
  glyph._yMax = p.parseShort();
  var flags;
  var flag;
  if (glyph.numberOfContours > 0) {
    var endPointIndices = glyph.endPointIndices = [];
    for (var i = 0; i < glyph.numberOfContours; i += 1) {
      endPointIndices.push(p.parseUShort());
    }
    glyph.instructionLength = p.parseUShort();
    glyph.instructions = [];
    for (var i$1 = 0; i$1 < glyph.instructionLength; i$1 += 1) {
      glyph.instructions.push(p.parseByte());
    }
    var numberOfCoordinates = endPointIndices[endPointIndices.length - 1] + 1;
    flags = [];
    for (var i$2 = 0; i$2 < numberOfCoordinates; i$2 += 1) {
      flag = p.parseByte();
      flags.push(flag);
      if ((flag & 8) > 0) {
        var repeatCount = p.parseByte();
        for (var j = 0; j < repeatCount; j += 1) {
          flags.push(flag);
          i$2 += 1;
        }
      }
    }
    check.argument(flags.length === numberOfCoordinates, "Bad flags.");
    if (endPointIndices.length > 0) {
      var points = [];
      var point;
      if (numberOfCoordinates > 0) {
        for (var i$3 = 0; i$3 < numberOfCoordinates; i$3 += 1) {
          flag = flags[i$3];
          point = {};
          point.onCurve = !!(flag & 1);
          point.lastPointOfContour = endPointIndices.indexOf(i$3) >= 0;
          points.push(point);
        }
        var px = 0;
        for (var i$4 = 0; i$4 < numberOfCoordinates; i$4 += 1) {
          flag = flags[i$4];
          point = points[i$4];
          point.x = parseGlyphCoordinate(p, flag, px, 2, 16);
          px = point.x;
        }
        var py = 0;
        for (var i$5 = 0; i$5 < numberOfCoordinates; i$5 += 1) {
          flag = flags[i$5];
          point = points[i$5];
          point.y = parseGlyphCoordinate(p, flag, py, 4, 32);
          py = point.y;
        }
      }
      glyph.points = points;
    } else {
      glyph.points = [];
    }
  } else if (glyph.numberOfContours === 0) {
    glyph.points = [];
  } else {
    glyph.isComposite = true;
    glyph.points = [];
    glyph.components = [];
    var moreComponents = true;
    while (moreComponents) {
      flags = p.parseUShort();
      var component = {
        glyphIndex: p.parseUShort(),
        xScale: 1,
        scale01: 0,
        scale10: 0,
        yScale: 1,
        dx: 0,
        dy: 0
      };
      if ((flags & 1) > 0) {
        if ((flags & 2) > 0) {
          component.dx = p.parseShort();
          component.dy = p.parseShort();
        } else {
          component.matchedPoints = [p.parseUShort(), p.parseUShort()];
        }
      } else {
        if ((flags & 2) > 0) {
          component.dx = p.parseChar();
          component.dy = p.parseChar();
        } else {
          component.matchedPoints = [p.parseByte(), p.parseByte()];
        }
      }
      if ((flags & 8) > 0) {
        component.xScale = component.yScale = p.parseF2Dot14();
      } else if ((flags & 64) > 0) {
        component.xScale = p.parseF2Dot14();
        component.yScale = p.parseF2Dot14();
      } else if ((flags & 128) > 0) {
        component.xScale = p.parseF2Dot14();
        component.scale01 = p.parseF2Dot14();
        component.scale10 = p.parseF2Dot14();
        component.yScale = p.parseF2Dot14();
      }
      glyph.components.push(component);
      moreComponents = !!(flags & 32);
    }
    if (flags & 256) {
      glyph.instructionLength = p.parseUShort();
      glyph.instructions = [];
      for (var i$6 = 0; i$6 < glyph.instructionLength; i$6 += 1) {
        glyph.instructions.push(p.parseByte());
      }
    }
  }
}
function transformPoints(points, transform) {
  var newPoints = [];
  for (var i = 0; i < points.length; i += 1) {
    var pt = points[i];
    var newPt = {
      x: transform.xScale * pt.x + transform.scale01 * pt.y + transform.dx,
      y: transform.scale10 * pt.x + transform.yScale * pt.y + transform.dy,
      onCurve: pt.onCurve,
      lastPointOfContour: pt.lastPointOfContour
    };
    newPoints.push(newPt);
  }
  return newPoints;
}
function getContours(points) {
  var contours = [];
  var currentContour = [];
  for (var i = 0; i < points.length; i += 1) {
    var pt = points[i];
    currentContour.push(pt);
    if (pt.lastPointOfContour) {
      contours.push(currentContour);
      currentContour = [];
    }
  }
  check.argument(currentContour.length === 0, "There are still points left in the current contour.");
  return contours;
}
function getPath(points) {
  var p = new Path();
  if (!points) {
    return p;
  }
  var contours = getContours(points);
  for (var contourIndex = 0; contourIndex < contours.length; ++contourIndex) {
    var contour = contours[contourIndex];
    var prev = null;
    var curr = contour[contour.length - 1];
    var next = contour[0];
    if (curr.onCurve) {
      p.moveTo(curr.x, curr.y);
    } else {
      if (next.onCurve) {
        p.moveTo(next.x, next.y);
      } else {
        var start = { x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5 };
        p.moveTo(start.x, start.y);
      }
    }
    for (var i = 0; i < contour.length; ++i) {
      prev = curr;
      curr = next;
      next = contour[(i + 1) % contour.length];
      if (curr.onCurve) {
        p.lineTo(curr.x, curr.y);
      } else {
        var prev2 = prev;
        var next2 = next;
        if (!prev.onCurve) {
          prev2 = { x: (curr.x + prev.x) * 0.5, y: (curr.y + prev.y) * 0.5 };
        }
        if (!next.onCurve) {
          next2 = { x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5 };
        }
        p.quadraticCurveTo(curr.x, curr.y, next2.x, next2.y);
      }
    }
    p.closePath();
  }
  return p;
}
function buildPath(glyphs, glyph) {
  if (glyph.isComposite) {
    for (var j = 0; j < glyph.components.length; j += 1) {
      var component = glyph.components[j];
      var componentGlyph = glyphs.get(component.glyphIndex);
      componentGlyph.getPath();
      if (componentGlyph.points) {
        var transformedPoints = void 0;
        if (component.matchedPoints === void 0) {
          transformedPoints = transformPoints(componentGlyph.points, component);
        } else {
          if (component.matchedPoints[0] > glyph.points.length - 1 || component.matchedPoints[1] > componentGlyph.points.length - 1) {
            throw Error("Matched points out of range in " + glyph.name);
          }
          var firstPt = glyph.points[component.matchedPoints[0]];
          var secondPt = componentGlyph.points[component.matchedPoints[1]];
          var transform = {
            xScale: component.xScale,
            scale01: component.scale01,
            scale10: component.scale10,
            yScale: component.yScale,
            dx: 0,
            dy: 0
          };
          secondPt = transformPoints([secondPt], transform)[0];
          transform.dx = firstPt.x - secondPt.x;
          transform.dy = firstPt.y - secondPt.y;
          transformedPoints = transformPoints(componentGlyph.points, transform);
        }
        glyph.points = glyph.points.concat(transformedPoints);
      }
    }
  }
  return getPath(glyph.points);
}
function parseGlyfTableAll(data, start, loca2, font) {
  var glyphs = new glyphset.GlyphSet(font);
  for (var i = 0; i < loca2.length - 1; i += 1) {
    var offset = loca2[i];
    var nextOffset = loca2[i + 1];
    if (offset !== nextOffset) {
      glyphs.push(i, glyphset.ttfGlyphLoader(font, i, parseGlyph, data, start + offset, buildPath));
    } else {
      glyphs.push(i, glyphset.glyphLoader(font, i));
    }
  }
  return glyphs;
}
function parseGlyfTableOnLowMemory(data, start, loca2, font) {
  var glyphs = new glyphset.GlyphSet(font);
  font._push = function(i) {
    var offset = loca2[i];
    var nextOffset = loca2[i + 1];
    if (offset !== nextOffset) {
      glyphs.push(i, glyphset.ttfGlyphLoader(font, i, parseGlyph, data, start + offset, buildPath));
    } else {
      glyphs.push(i, glyphset.glyphLoader(font, i));
    }
  };
  return glyphs;
}
function parseGlyfTable(data, start, loca2, font, opt) {
  if (opt.lowMemory) {
    return parseGlyfTableOnLowMemory(data, start, loca2, font);
  } else {
    return parseGlyfTableAll(data, start, loca2, font);
  }
}
var glyf = { getPath, parse: parseGlyfTable };
var instructionTable;
var exec;
var execGlyph;
var execComponent;
function Hinting(font) {
  this.font = font;
  this.getCommands = function(hPoints) {
    return glyf.getPath(hPoints).commands;
  };
  this._fpgmState = this._prepState = void 0;
  this._errorState = 0;
}
function roundOff(v) {
  return v;
}
function roundToGrid(v) {
  return Math.sign(v) * Math.round(Math.abs(v));
}
function roundToDoubleGrid(v) {
  return Math.sign(v) * Math.round(Math.abs(v * 2)) / 2;
}
function roundToHalfGrid(v) {
  return Math.sign(v) * (Math.round(Math.abs(v) + 0.5) - 0.5);
}
function roundUpToGrid(v) {
  return Math.sign(v) * Math.ceil(Math.abs(v));
}
function roundDownToGrid(v) {
  return Math.sign(v) * Math.floor(Math.abs(v));
}
var roundSuper = function(v) {
  var period = this.srPeriod;
  var phase = this.srPhase;
  var threshold = this.srThreshold;
  var sign = 1;
  if (v < 0) {
    v = -v;
    sign = -1;
  }
  v += threshold - phase;
  v = Math.trunc(v / period) * period;
  v += phase;
  if (v < 0) {
    return phase * sign;
  }
  return v * sign;
};
var xUnitVector = {
  x: 1,
  y: 0,
  axis: "x",
  distance: function(p1, p2, o1, o2) {
    return (o1 ? p1.xo : p1.x) - (o2 ? p2.xo : p2.x);
  },
  interpolate: function(p, rp1, rp2, pv) {
    var do1;
    var do2;
    var doa1;
    var doa2;
    var dm1;
    var dm2;
    var dt2;
    if (!pv || pv === this) {
      do1 = p.xo - rp1.xo;
      do2 = p.xo - rp2.xo;
      dm1 = rp1.x - rp1.xo;
      dm2 = rp2.x - rp2.xo;
      doa1 = Math.abs(do1);
      doa2 = Math.abs(do2);
      dt2 = doa1 + doa2;
      if (dt2 === 0) {
        p.x = p.xo + (dm1 + dm2) / 2;
        return;
      }
      p.x = p.xo + (dm1 * doa2 + dm2 * doa1) / dt2;
      return;
    }
    do1 = pv.distance(p, rp1, true, true);
    do2 = pv.distance(p, rp2, true, true);
    dm1 = pv.distance(rp1, rp1, false, true);
    dm2 = pv.distance(rp2, rp2, false, true);
    doa1 = Math.abs(do1);
    doa2 = Math.abs(do2);
    dt2 = doa1 + doa2;
    if (dt2 === 0) {
      xUnitVector.setRelative(p, p, (dm1 + dm2) / 2, pv, true);
      return;
    }
    xUnitVector.setRelative(p, p, (dm1 * doa2 + dm2 * doa1) / dt2, pv, true);
  },
  normalSlope: Number.NEGATIVE_INFINITY,
  setRelative: function(p, rp, d, pv, org) {
    if (!pv || pv === this) {
      p.x = (org ? rp.xo : rp.x) + d;
      return;
    }
    var rpx = org ? rp.xo : rp.x;
    var rpy = org ? rp.yo : rp.y;
    var rpdx = rpx + d * pv.x;
    var rpdy = rpy + d * pv.y;
    p.x = rpdx + (p.y - rpdy) / pv.normalSlope;
  },
  slope: 0,
  touch: function(p) {
    p.xTouched = true;
  },
  touched: function(p) {
    return p.xTouched;
  },
  untouch: function(p) {
    p.xTouched = false;
  }
};
var yUnitVector = {
  x: 0,
  y: 1,
  axis: "y",
  distance: function(p1, p2, o1, o2) {
    return (o1 ? p1.yo : p1.y) - (o2 ? p2.yo : p2.y);
  },
  interpolate: function(p, rp1, rp2, pv) {
    var do1;
    var do2;
    var doa1;
    var doa2;
    var dm1;
    var dm2;
    var dt2;
    if (!pv || pv === this) {
      do1 = p.yo - rp1.yo;
      do2 = p.yo - rp2.yo;
      dm1 = rp1.y - rp1.yo;
      dm2 = rp2.y - rp2.yo;
      doa1 = Math.abs(do1);
      doa2 = Math.abs(do2);
      dt2 = doa1 + doa2;
      if (dt2 === 0) {
        p.y = p.yo + (dm1 + dm2) / 2;
        return;
      }
      p.y = p.yo + (dm1 * doa2 + dm2 * doa1) / dt2;
      return;
    }
    do1 = pv.distance(p, rp1, true, true);
    do2 = pv.distance(p, rp2, true, true);
    dm1 = pv.distance(rp1, rp1, false, true);
    dm2 = pv.distance(rp2, rp2, false, true);
    doa1 = Math.abs(do1);
    doa2 = Math.abs(do2);
    dt2 = doa1 + doa2;
    if (dt2 === 0) {
      yUnitVector.setRelative(p, p, (dm1 + dm2) / 2, pv, true);
      return;
    }
    yUnitVector.setRelative(p, p, (dm1 * doa2 + dm2 * doa1) / dt2, pv, true);
  },
  normalSlope: 0,
  setRelative: function(p, rp, d, pv, org) {
    if (!pv || pv === this) {
      p.y = (org ? rp.yo : rp.y) + d;
      return;
    }
    var rpx = org ? rp.xo : rp.x;
    var rpy = org ? rp.yo : rp.y;
    var rpdx = rpx + d * pv.x;
    var rpdy = rpy + d * pv.y;
    p.y = rpdy + pv.normalSlope * (p.x - rpdx);
  },
  slope: Number.POSITIVE_INFINITY,
  touch: function(p) {
    p.yTouched = true;
  },
  touched: function(p) {
    return p.yTouched;
  },
  untouch: function(p) {
    p.yTouched = false;
  }
};
Object.freeze(xUnitVector);
Object.freeze(yUnitVector);
function UnitVector(x, y) {
  this.x = x;
  this.y = y;
  this.axis = void 0;
  this.slope = y / x;
  this.normalSlope = -x / y;
  Object.freeze(this);
}
UnitVector.prototype.distance = function(p1, p2, o1, o2) {
  return this.x * xUnitVector.distance(p1, p2, o1, o2) + this.y * yUnitVector.distance(p1, p2, o1, o2);
};
UnitVector.prototype.interpolate = function(p, rp1, rp2, pv) {
  var dm1;
  var dm2;
  var do1;
  var do2;
  var doa1;
  var doa2;
  var dt2;
  do1 = pv.distance(p, rp1, true, true);
  do2 = pv.distance(p, rp2, true, true);
  dm1 = pv.distance(rp1, rp1, false, true);
  dm2 = pv.distance(rp2, rp2, false, true);
  doa1 = Math.abs(do1);
  doa2 = Math.abs(do2);
  dt2 = doa1 + doa2;
  if (dt2 === 0) {
    this.setRelative(p, p, (dm1 + dm2) / 2, pv, true);
    return;
  }
  this.setRelative(p, p, (dm1 * doa2 + dm2 * doa1) / dt2, pv, true);
};
UnitVector.prototype.setRelative = function(p, rp, d, pv, org) {
  pv = pv || this;
  var rpx = org ? rp.xo : rp.x;
  var rpy = org ? rp.yo : rp.y;
  var rpdx = rpx + d * pv.x;
  var rpdy = rpy + d * pv.y;
  var pvns = pv.normalSlope;
  var fvs = this.slope;
  var px = p.x;
  var py = p.y;
  p.x = (fvs * px - pvns * rpdx + rpdy - py) / (fvs - pvns);
  p.y = fvs * (p.x - px) + py;
};
UnitVector.prototype.touch = function(p) {
  p.xTouched = true;
  p.yTouched = true;
};
function getUnitVector(x, y) {
  var d = Math.sqrt(x * x + y * y);
  x /= d;
  y /= d;
  if (x === 1 && y === 0) {
    return xUnitVector;
  } else if (x === 0 && y === 1) {
    return yUnitVector;
  } else {
    return new UnitVector(x, y);
  }
}
function HPoint(x, y, lastPointOfContour, onCurve) {
  this.x = this.xo = Math.round(x * 64) / 64;
  this.y = this.yo = Math.round(y * 64) / 64;
  this.lastPointOfContour = lastPointOfContour;
  this.onCurve = onCurve;
  this.prevPointOnContour = void 0;
  this.nextPointOnContour = void 0;
  this.xTouched = false;
  this.yTouched = false;
  Object.preventExtensions(this);
}
HPoint.prototype.nextTouched = function(v) {
  var p = this.nextPointOnContour;
  while (!v.touched(p) && p !== this) {
    p = p.nextPointOnContour;
  }
  return p;
};
HPoint.prototype.prevTouched = function(v) {
  var p = this.prevPointOnContour;
  while (!v.touched(p) && p !== this) {
    p = p.prevPointOnContour;
  }
  return p;
};
var HPZero = Object.freeze(new HPoint(0, 0));
var defaultState = {
  cvCutIn: 17 / 16,
  deltaBase: 9,
  deltaShift: 0.125,
  loop: 1,
  minDis: 1,
  autoFlip: true
};
function State(env, prog) {
  this.env = env;
  this.stack = [];
  this.prog = prog;
  switch (env) {
    case "glyf":
      this.zp0 = this.zp1 = this.zp2 = 1;
      this.rp0 = this.rp1 = this.rp2 = 0;
    case "prep":
      this.fv = this.pv = this.dpv = xUnitVector;
      this.round = roundToGrid;
  }
}
Hinting.prototype.exec = function(glyph, ppem) {
  if (typeof ppem !== "number") {
    throw new Error("Point size is not a number!");
  }
  if (this._errorState > 2) {
    return;
  }
  var font = this.font;
  var prepState = this._prepState;
  if (!prepState || prepState.ppem !== ppem) {
    var fpgmState = this._fpgmState;
    if (!fpgmState) {
      State.prototype = defaultState;
      fpgmState = this._fpgmState = new State("fpgm", font.tables.fpgm);
      fpgmState.funcs = [];
      fpgmState.font = font;
      if (exports.DEBUG) {
        console.log("---EXEC FPGM---");
        fpgmState.step = -1;
      }
      try {
        exec(fpgmState);
      } catch (e) {
        console.log("Hinting error in FPGM:" + e);
        this._errorState = 3;
        return;
      }
    }
    State.prototype = fpgmState;
    prepState = this._prepState = new State("prep", font.tables.prep);
    prepState.ppem = ppem;
    var oCvt = font.tables.cvt;
    if (oCvt) {
      var cvt = prepState.cvt = new Array(oCvt.length);
      var scale = ppem / font.unitsPerEm;
      for (var c = 0; c < oCvt.length; c++) {
        cvt[c] = oCvt[c] * scale;
      }
    } else {
      prepState.cvt = [];
    }
    if (exports.DEBUG) {
      console.log("---EXEC PREP---");
      prepState.step = -1;
    }
    try {
      exec(prepState);
    } catch (e) {
      if (this._errorState < 2) {
        console.log("Hinting error in PREP:" + e);
      }
      this._errorState = 2;
    }
  }
  if (this._errorState > 1) {
    return;
  }
  try {
    return execGlyph(glyph, prepState);
  } catch (e) {
    if (this._errorState < 1) {
      console.log("Hinting error:" + e);
      console.log("Note: further hinting errors are silenced");
    }
    this._errorState = 1;
    return void 0;
  }
};
execGlyph = function(glyph, prepState) {
  var xScale = prepState.ppem / prepState.font.unitsPerEm;
  var yScale = xScale;
  var components = glyph.components;
  var contours;
  var gZone;
  var state;
  State.prototype = prepState;
  if (!components) {
    state = new State("glyf", glyph.instructions);
    if (exports.DEBUG) {
      console.log("---EXEC GLYPH---");
      state.step = -1;
    }
    execComponent(glyph, state, xScale, yScale);
    gZone = state.gZone;
  } else {
    var font = prepState.font;
    gZone = [];
    contours = [];
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      var cg = font.glyphs.get(c.glyphIndex);
      state = new State("glyf", cg.instructions);
      if (exports.DEBUG) {
        console.log("---EXEC COMP " + i + "---");
        state.step = -1;
      }
      execComponent(cg, state, xScale, yScale);
      var dx = Math.round(c.dx * xScale);
      var dy = Math.round(c.dy * yScale);
      var gz = state.gZone;
      var cc = state.contours;
      for (var pi = 0; pi < gz.length; pi++) {
        var p = gz[pi];
        p.xTouched = p.yTouched = false;
        p.xo = p.x = p.x + dx;
        p.yo = p.y = p.y + dy;
      }
      var gLen = gZone.length;
      gZone.push.apply(gZone, gz);
      for (var j = 0; j < cc.length; j++) {
        contours.push(cc[j] + gLen);
      }
    }
    if (glyph.instructions && !state.inhibitGridFit) {
      state = new State("glyf", glyph.instructions);
      state.gZone = state.z0 = state.z1 = state.z2 = gZone;
      state.contours = contours;
      gZone.push(new HPoint(0, 0), new HPoint(Math.round(glyph.advanceWidth * xScale), 0));
      if (exports.DEBUG) {
        console.log("---EXEC COMPOSITE---");
        state.step = -1;
      }
      exec(state);
      gZone.length -= 2;
    }
  }
  return gZone;
};
execComponent = function(glyph, state, xScale, yScale) {
  var points = glyph.points || [];
  var pLen = points.length;
  var gZone = state.gZone = state.z0 = state.z1 = state.z2 = [];
  var contours = state.contours = [];
  var cp;
  for (var i = 0; i < pLen; i++) {
    cp = points[i];
    gZone[i] = new HPoint(cp.x * xScale, cp.y * yScale, cp.lastPointOfContour, cp.onCurve);
  }
  var sp;
  var np;
  for (var i$1 = 0; i$1 < pLen; i$1++) {
    cp = gZone[i$1];
    if (!sp) {
      sp = cp;
      contours.push(i$1);
    }
    if (cp.lastPointOfContour) {
      cp.nextPointOnContour = sp;
      sp.prevPointOnContour = cp;
      sp = void 0;
    } else {
      np = gZone[i$1 + 1];
      cp.nextPointOnContour = np;
      np.prevPointOnContour = cp;
    }
  }
  if (state.inhibitGridFit) {
    return;
  }
  if (exports.DEBUG) {
    console.log("PROCESSING GLYPH", state.stack);
    for (var i$2 = 0; i$2 < pLen; i$2++) {
      console.log(i$2, gZone[i$2].x, gZone[i$2].y);
    }
  }
  gZone.push(new HPoint(0, 0), new HPoint(Math.round(glyph.advanceWidth * xScale), 0));
  exec(state);
  gZone.length -= 2;
  if (exports.DEBUG) {
    console.log("FINISHED GLYPH", state.stack);
    for (var i$3 = 0; i$3 < pLen; i$3++) {
      console.log(i$3, gZone[i$3].x, gZone[i$3].y);
    }
  }
};
exec = function(state) {
  var prog = state.prog;
  if (!prog) {
    return;
  }
  var pLen = prog.length;
  var ins;
  for (state.ip = 0; state.ip < pLen; state.ip++) {
    if (exports.DEBUG) {
      state.step++;
    }
    ins = instructionTable[prog[state.ip]];
    if (!ins) {
      throw new Error("unknown instruction: 0x" + Number(prog[state.ip]).toString(16));
    }
    ins(state);
  }
};
function initTZone(state) {
  var tZone = state.tZone = new Array(state.gZone.length);
  for (var i = 0; i < tZone.length; i++) {
    tZone[i] = new HPoint(0, 0);
  }
}
function skip(state, handleElse) {
  var prog = state.prog;
  var ip = state.ip;
  var nesting = 1;
  var ins;
  do {
    ins = prog[++ip];
    if (ins === 88) {
      nesting++;
    } else if (ins === 89) {
      nesting--;
    } else if (ins === 64) {
      ip += prog[ip + 1] + 1;
    } else if (ins === 65) {
      ip += 2 * prog[ip + 1] + 1;
    } else if (ins >= 176 && ins <= 183) {
      ip += ins - 176 + 1;
    } else if (ins >= 184 && ins <= 191) {
      ip += (ins - 184 + 1) * 2;
    } else if (handleElse && nesting === 1 && ins === 27) {
      break;
    }
  } while (nesting > 0);
  state.ip = ip;
}
function SVTCA(v, state) {
  if (exports.DEBUG) {
    console.log(state.step, "SVTCA[" + v.axis + "]");
  }
  state.fv = state.pv = state.dpv = v;
}
function SPVTCA(v, state) {
  if (exports.DEBUG) {
    console.log(state.step, "SPVTCA[" + v.axis + "]");
  }
  state.pv = state.dpv = v;
}
function SFVTCA(v, state) {
  if (exports.DEBUG) {
    console.log(state.step, "SFVTCA[" + v.axis + "]");
  }
  state.fv = v;
}
function SPVTL(a, state) {
  var stack = state.stack;
  var p2i = stack.pop();
  var p1i = stack.pop();
  var p2 = state.z2[p2i];
  var p1 = state.z1[p1i];
  if (exports.DEBUG) {
    console.log("SPVTL[" + a + "]", p2i, p1i);
  }
  var dx;
  var dy;
  if (!a) {
    dx = p1.x - p2.x;
    dy = p1.y - p2.y;
  } else {
    dx = p2.y - p1.y;
    dy = p1.x - p2.x;
  }
  state.pv = state.dpv = getUnitVector(dx, dy);
}
function SFVTL(a, state) {
  var stack = state.stack;
  var p2i = stack.pop();
  var p1i = stack.pop();
  var p2 = state.z2[p2i];
  var p1 = state.z1[p1i];
  if (exports.DEBUG) {
    console.log("SFVTL[" + a + "]", p2i, p1i);
  }
  var dx;
  var dy;
  if (!a) {
    dx = p1.x - p2.x;
    dy = p1.y - p2.y;
  } else {
    dx = p2.y - p1.y;
    dy = p1.x - p2.x;
  }
  state.fv = getUnitVector(dx, dy);
}
function SPVFS(state) {
  var stack = state.stack;
  var y = stack.pop();
  var x = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SPVFS[]", y, x);
  }
  state.pv = state.dpv = getUnitVector(x, y);
}
function SFVFS(state) {
  var stack = state.stack;
  var y = stack.pop();
  var x = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SPVFS[]", y, x);
  }
  state.fv = getUnitVector(x, y);
}
function GPV(state) {
  var stack = state.stack;
  var pv = state.pv;
  if (exports.DEBUG) {
    console.log(state.step, "GPV[]");
  }
  stack.push(pv.x * 16384);
  stack.push(pv.y * 16384);
}
function GFV(state) {
  var stack = state.stack;
  var fv = state.fv;
  if (exports.DEBUG) {
    console.log(state.step, "GFV[]");
  }
  stack.push(fv.x * 16384);
  stack.push(fv.y * 16384);
}
function SFVTPV(state) {
  state.fv = state.pv;
  if (exports.DEBUG) {
    console.log(state.step, "SFVTPV[]");
  }
}
function ISECT(state) {
  var stack = state.stack;
  var pa0i = stack.pop();
  var pa1i = stack.pop();
  var pb0i = stack.pop();
  var pb1i = stack.pop();
  var pi = stack.pop();
  var z0 = state.z0;
  var z1 = state.z1;
  var pa0 = z0[pa0i];
  var pa1 = z0[pa1i];
  var pb0 = z1[pb0i];
  var pb1 = z1[pb1i];
  var p = state.z2[pi];
  if (exports.DEBUG) {
    console.log("ISECT[], ", pa0i, pa1i, pb0i, pb1i, pi);
  }
  var x1 = pa0.x;
  var y1 = pa0.y;
  var x2 = pa1.x;
  var y2 = pa1.y;
  var x3 = pb0.x;
  var y3 = pb0.y;
  var x4 = pb1.x;
  var y4 = pb1.y;
  var div = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  var f1 = x1 * y2 - y1 * x2;
  var f2 = x3 * y4 - y3 * x4;
  p.x = (f1 * (x3 - x4) - f2 * (x1 - x2)) / div;
  p.y = (f1 * (y3 - y4) - f2 * (y1 - y2)) / div;
}
function SRP0(state) {
  state.rp0 = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SRP0[]", state.rp0);
  }
}
function SRP1(state) {
  state.rp1 = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SRP1[]", state.rp1);
  }
}
function SRP2(state) {
  state.rp2 = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SRP2[]", state.rp2);
  }
}
function SZP0(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SZP0[]", n);
  }
  state.zp0 = n;
  switch (n) {
    case 0:
      if (!state.tZone) {
        initTZone(state);
      }
      state.z0 = state.tZone;
      break;
    case 1:
      state.z0 = state.gZone;
      break;
    default:
      throw new Error("Invalid zone pointer");
  }
}
function SZP1(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SZP1[]", n);
  }
  state.zp1 = n;
  switch (n) {
    case 0:
      if (!state.tZone) {
        initTZone(state);
      }
      state.z1 = state.tZone;
      break;
    case 1:
      state.z1 = state.gZone;
      break;
    default:
      throw new Error("Invalid zone pointer");
  }
}
function SZP2(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SZP2[]", n);
  }
  state.zp2 = n;
  switch (n) {
    case 0:
      if (!state.tZone) {
        initTZone(state);
      }
      state.z2 = state.tZone;
      break;
    case 1:
      state.z2 = state.gZone;
      break;
    default:
      throw new Error("Invalid zone pointer");
  }
}
function SZPS(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SZPS[]", n);
  }
  state.zp0 = state.zp1 = state.zp2 = n;
  switch (n) {
    case 0:
      if (!state.tZone) {
        initTZone(state);
      }
      state.z0 = state.z1 = state.z2 = state.tZone;
      break;
    case 1:
      state.z0 = state.z1 = state.z2 = state.gZone;
      break;
    default:
      throw new Error("Invalid zone pointer");
  }
}
function SLOOP(state) {
  state.loop = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SLOOP[]", state.loop);
  }
}
function RTG(state) {
  if (exports.DEBUG) {
    console.log(state.step, "RTG[]");
  }
  state.round = roundToGrid;
}
function RTHG(state) {
  if (exports.DEBUG) {
    console.log(state.step, "RTHG[]");
  }
  state.round = roundToHalfGrid;
}
function SMD(state) {
  var d = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SMD[]", d);
  }
  state.minDis = d / 64;
}
function ELSE(state) {
  if (exports.DEBUG) {
    console.log(state.step, "ELSE[]");
  }
  skip(state, false);
}
function JMPR(state) {
  var o = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "JMPR[]", o);
  }
  state.ip += o - 1;
}
function SCVTCI(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SCVTCI[]", n);
  }
  state.cvCutIn = n / 64;
}
function DUP(state) {
  var stack = state.stack;
  if (exports.DEBUG) {
    console.log(state.step, "DUP[]");
  }
  stack.push(stack[stack.length - 1]);
}
function POP(state) {
  if (exports.DEBUG) {
    console.log(state.step, "POP[]");
  }
  state.stack.pop();
}
function CLEAR(state) {
  if (exports.DEBUG) {
    console.log(state.step, "CLEAR[]");
  }
  state.stack.length = 0;
}
function SWAP(state) {
  var stack = state.stack;
  var a = stack.pop();
  var b = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SWAP[]");
  }
  stack.push(a);
  stack.push(b);
}
function DEPTH(state) {
  var stack = state.stack;
  if (exports.DEBUG) {
    console.log(state.step, "DEPTH[]");
  }
  stack.push(stack.length);
}
function LOOPCALL(state) {
  var stack = state.stack;
  var fn = stack.pop();
  var c = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "LOOPCALL[]", fn, c);
  }
  var cip = state.ip;
  var cprog = state.prog;
  state.prog = state.funcs[fn];
  for (var i = 0; i < c; i++) {
    exec(state);
    if (exports.DEBUG) {
      console.log(++state.step, i + 1 < c ? "next loopcall" : "done loopcall", i);
    }
  }
  state.ip = cip;
  state.prog = cprog;
}
function CALL(state) {
  var fn = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "CALL[]", fn);
  }
  var cip = state.ip;
  var cprog = state.prog;
  state.prog = state.funcs[fn];
  exec(state);
  state.ip = cip;
  state.prog = cprog;
  if (exports.DEBUG) {
    console.log(++state.step, "returning from", fn);
  }
}
function CINDEX(state) {
  var stack = state.stack;
  var k = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "CINDEX[]", k);
  }
  stack.push(stack[stack.length - k]);
}
function MINDEX(state) {
  var stack = state.stack;
  var k = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "MINDEX[]", k);
  }
  stack.push(stack.splice(stack.length - k, 1)[0]);
}
function FDEF(state) {
  if (state.env !== "fpgm") {
    throw new Error("FDEF not allowed here");
  }
  var stack = state.stack;
  var prog = state.prog;
  var ip = state.ip;
  var fn = stack.pop();
  var ipBegin = ip;
  if (exports.DEBUG) {
    console.log(state.step, "FDEF[]", fn);
  }
  while (prog[++ip] !== 45) {
  }
  state.ip = ip;
  state.funcs[fn] = prog.slice(ipBegin + 1, ip);
}
function MDAP(round, state) {
  var pi = state.stack.pop();
  var p = state.z0[pi];
  var fv = state.fv;
  var pv = state.pv;
  if (exports.DEBUG) {
    console.log(state.step, "MDAP[" + round + "]", pi);
  }
  var d = pv.distance(p, HPZero);
  if (round) {
    d = state.round(d);
  }
  fv.setRelative(p, HPZero, d, pv);
  fv.touch(p);
  state.rp0 = state.rp1 = pi;
}
function IUP(v, state) {
  var z2 = state.z2;
  var pLen = z2.length - 2;
  var cp;
  var pp;
  var np;
  if (exports.DEBUG) {
    console.log(state.step, "IUP[" + v.axis + "]");
  }
  for (var i = 0; i < pLen; i++) {
    cp = z2[i];
    if (v.touched(cp)) {
      continue;
    }
    pp = cp.prevTouched(v);
    if (pp === cp) {
      continue;
    }
    np = cp.nextTouched(v);
    if (pp === np) {
      v.setRelative(cp, cp, v.distance(pp, pp, false, true), v, true);
    }
    v.interpolate(cp, pp, np, v);
  }
}
function SHP(a, state) {
  var stack = state.stack;
  var rpi = a ? state.rp1 : state.rp2;
  var rp = (a ? state.z0 : state.z1)[rpi];
  var fv = state.fv;
  var pv = state.pv;
  var loop = state.loop;
  var z2 = state.z2;
  while (loop--) {
    var pi = stack.pop();
    var p = z2[pi];
    var d = pv.distance(rp, rp, false, true);
    fv.setRelative(p, p, d, pv);
    fv.touch(p);
    if (exports.DEBUG) {
      console.log(state.step, (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHP[" + (a ? "rp1" : "rp2") + "]", pi);
    }
  }
  state.loop = 1;
}
function SHC(a, state) {
  var stack = state.stack;
  var rpi = a ? state.rp1 : state.rp2;
  var rp = (a ? state.z0 : state.z1)[rpi];
  var fv = state.fv;
  var pv = state.pv;
  var ci2 = stack.pop();
  var sp = state.z2[state.contours[ci2]];
  var p = sp;
  if (exports.DEBUG) {
    console.log(state.step, "SHC[" + a + "]", ci2);
  }
  var d = pv.distance(rp, rp, false, true);
  do {
    if (p !== rp) {
      fv.setRelative(p, p, d, pv);
    }
    p = p.nextPointOnContour;
  } while (p !== sp);
}
function SHZ(a, state) {
  var stack = state.stack;
  var rpi = a ? state.rp1 : state.rp2;
  var rp = (a ? state.z0 : state.z1)[rpi];
  var fv = state.fv;
  var pv = state.pv;
  var e = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SHZ[" + a + "]", e);
  }
  var z2;
  switch (e) {
    case 0:
      z2 = state.tZone;
      break;
    case 1:
      z2 = state.gZone;
      break;
    default:
      throw new Error("Invalid zone");
  }
  var p;
  var d = pv.distance(rp, rp, false, true);
  var pLen = z2.length - 2;
  for (var i = 0; i < pLen; i++) {
    p = z2[i];
    fv.setRelative(p, p, d, pv);
  }
}
function SHPIX(state) {
  var stack = state.stack;
  var loop = state.loop;
  var fv = state.fv;
  var d = stack.pop() / 64;
  var z2 = state.z2;
  while (loop--) {
    var pi = stack.pop();
    var p = z2[pi];
    if (exports.DEBUG) {
      console.log(state.step, (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHPIX[]", pi, d);
    }
    fv.setRelative(p, p, d);
    fv.touch(p);
  }
  state.loop = 1;
}
function IP(state) {
  var stack = state.stack;
  var rp1i = state.rp1;
  var rp2i = state.rp2;
  var loop = state.loop;
  var rp1 = state.z0[rp1i];
  var rp2 = state.z1[rp2i];
  var fv = state.fv;
  var pv = state.dpv;
  var z2 = state.z2;
  while (loop--) {
    var pi = stack.pop();
    var p = z2[pi];
    if (exports.DEBUG) {
      console.log(state.step, (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "IP[]", pi, rp1i, "<->", rp2i);
    }
    fv.interpolate(p, rp1, rp2, pv);
    fv.touch(p);
  }
  state.loop = 1;
}
function MSIRP(a, state) {
  var stack = state.stack;
  var d = stack.pop() / 64;
  var pi = stack.pop();
  var p = state.z1[pi];
  var rp0 = state.z0[state.rp0];
  var fv = state.fv;
  var pv = state.pv;
  fv.setRelative(p, rp0, d, pv);
  fv.touch(p);
  if (exports.DEBUG) {
    console.log(state.step, "MSIRP[" + a + "]", d, pi);
  }
  state.rp1 = state.rp0;
  state.rp2 = pi;
  if (a) {
    state.rp0 = pi;
  }
}
function ALIGNRP(state) {
  var stack = state.stack;
  var rp0i = state.rp0;
  var rp0 = state.z0[rp0i];
  var loop = state.loop;
  var fv = state.fv;
  var pv = state.pv;
  var z1 = state.z1;
  while (loop--) {
    var pi = stack.pop();
    var p = z1[pi];
    if (exports.DEBUG) {
      console.log(state.step, (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "ALIGNRP[]", pi);
    }
    fv.setRelative(p, rp0, 0, pv);
    fv.touch(p);
  }
  state.loop = 1;
}
function RTDG(state) {
  if (exports.DEBUG) {
    console.log(state.step, "RTDG[]");
  }
  state.round = roundToDoubleGrid;
}
function MIAP(round, state) {
  var stack = state.stack;
  var n = stack.pop();
  var pi = stack.pop();
  var p = state.z0[pi];
  var fv = state.fv;
  var pv = state.pv;
  var cv = state.cvt[n];
  if (exports.DEBUG) {
    console.log(state.step, "MIAP[" + round + "]", n, "(", cv, ")", pi);
  }
  var d = pv.distance(p, HPZero);
  if (round) {
    if (Math.abs(d - cv) < state.cvCutIn) {
      d = cv;
    }
    d = state.round(d);
  }
  fv.setRelative(p, HPZero, d, pv);
  if (state.zp0 === 0) {
    p.xo = p.x;
    p.yo = p.y;
  }
  fv.touch(p);
  state.rp0 = state.rp1 = pi;
}
function NPUSHB(state) {
  var prog = state.prog;
  var ip = state.ip;
  var stack = state.stack;
  var n = prog[++ip];
  if (exports.DEBUG) {
    console.log(state.step, "NPUSHB[]", n);
  }
  for (var i = 0; i < n; i++) {
    stack.push(prog[++ip]);
  }
  state.ip = ip;
}
function NPUSHW(state) {
  var ip = state.ip;
  var prog = state.prog;
  var stack = state.stack;
  var n = prog[++ip];
  if (exports.DEBUG) {
    console.log(state.step, "NPUSHW[]", n);
  }
  for (var i = 0; i < n; i++) {
    var w = prog[++ip] << 8 | prog[++ip];
    if (w & 32768) {
      w = -((w ^ 65535) + 1);
    }
    stack.push(w);
  }
  state.ip = ip;
}
function WS(state) {
  var stack = state.stack;
  var store = state.store;
  if (!store) {
    store = state.store = [];
  }
  var v = stack.pop();
  var l = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "WS", v, l);
  }
  store[l] = v;
}
function RS(state) {
  var stack = state.stack;
  var store = state.store;
  var l = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "RS", l);
  }
  var v = store && store[l] || 0;
  stack.push(v);
}
function WCVTP(state) {
  var stack = state.stack;
  var v = stack.pop();
  var l = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "WCVTP", v, l);
  }
  state.cvt[l] = v / 64;
}
function RCVT(state) {
  var stack = state.stack;
  var cvte = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "RCVT", cvte);
  }
  stack.push(state.cvt[cvte] * 64);
}
function GC(a, state) {
  var stack = state.stack;
  var pi = stack.pop();
  var p = state.z2[pi];
  if (exports.DEBUG) {
    console.log(state.step, "GC[" + a + "]", pi);
  }
  stack.push(state.dpv.distance(p, HPZero, a, false) * 64);
}
function MD(a, state) {
  var stack = state.stack;
  var pi2 = stack.pop();
  var pi1 = stack.pop();
  var p2 = state.z1[pi2];
  var p1 = state.z0[pi1];
  var d = state.dpv.distance(p1, p2, a, a);
  if (exports.DEBUG) {
    console.log(state.step, "MD[" + a + "]", pi2, pi1, "->", d);
  }
  state.stack.push(Math.round(d * 64));
}
function MPPEM(state) {
  if (exports.DEBUG) {
    console.log(state.step, "MPPEM[]");
  }
  state.stack.push(state.ppem);
}
function FLIPON(state) {
  if (exports.DEBUG) {
    console.log(state.step, "FLIPON[]");
  }
  state.autoFlip = true;
}
function LT(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "LT[]", e2, e1);
  }
  stack.push(e1 < e2 ? 1 : 0);
}
function LTEQ(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "LTEQ[]", e2, e1);
  }
  stack.push(e1 <= e2 ? 1 : 0);
}
function GT(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "GT[]", e2, e1);
  }
  stack.push(e1 > e2 ? 1 : 0);
}
function GTEQ(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "GTEQ[]", e2, e1);
  }
  stack.push(e1 >= e2 ? 1 : 0);
}
function EQ(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "EQ[]", e2, e1);
  }
  stack.push(e2 === e1 ? 1 : 0);
}
function NEQ(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "NEQ[]", e2, e1);
  }
  stack.push(e2 !== e1 ? 1 : 0);
}
function ODD(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "ODD[]", n);
  }
  stack.push(Math.trunc(n) % 2 ? 1 : 0);
}
function EVEN(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "EVEN[]", n);
  }
  stack.push(Math.trunc(n) % 2 ? 0 : 1);
}
function IF(state) {
  var test = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "IF[]", test);
  }
  if (!test) {
    skip(state, true);
    if (exports.DEBUG) {
      console.log(state.step, "EIF[]");
    }
  }
}
function EIF(state) {
  if (exports.DEBUG) {
    console.log(state.step, "EIF[]");
  }
}
function AND(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "AND[]", e2, e1);
  }
  stack.push(e2 && e1 ? 1 : 0);
}
function OR(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "OR[]", e2, e1);
  }
  stack.push(e2 || e1 ? 1 : 0);
}
function NOT(state) {
  var stack = state.stack;
  var e = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "NOT[]", e);
  }
  stack.push(e ? 0 : 1);
}
function DELTAP123(b, state) {
  var stack = state.stack;
  var n = stack.pop();
  var fv = state.fv;
  var pv = state.pv;
  var ppem = state.ppem;
  var base = state.deltaBase + (b - 1) * 16;
  var ds = state.deltaShift;
  var z0 = state.z0;
  if (exports.DEBUG) {
    console.log(state.step, "DELTAP[" + b + "]", n, stack);
  }
  for (var i = 0; i < n; i++) {
    var pi = stack.pop();
    var arg = stack.pop();
    var appem = base + ((arg & 240) >> 4);
    if (appem !== ppem) {
      continue;
    }
    var mag = (arg & 15) - 8;
    if (mag >= 0) {
      mag++;
    }
    if (exports.DEBUG) {
      console.log(state.step, "DELTAPFIX", pi, "by", mag * ds);
    }
    var p = z0[pi];
    fv.setRelative(p, p, mag * ds, pv);
  }
}
function SDB(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SDB[]", n);
  }
  state.deltaBase = n;
}
function SDS(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SDS[]", n);
  }
  state.deltaShift = Math.pow(0.5, n);
}
function ADD(state) {
  var stack = state.stack;
  var n2 = stack.pop();
  var n1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "ADD[]", n2, n1);
  }
  stack.push(n1 + n2);
}
function SUB(state) {
  var stack = state.stack;
  var n2 = stack.pop();
  var n1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SUB[]", n2, n1);
  }
  stack.push(n1 - n2);
}
function DIV(state) {
  var stack = state.stack;
  var n2 = stack.pop();
  var n1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "DIV[]", n2, n1);
  }
  stack.push(n1 * 64 / n2);
}
function MUL(state) {
  var stack = state.stack;
  var n2 = stack.pop();
  var n1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "MUL[]", n2, n1);
  }
  stack.push(n1 * n2 / 64);
}
function ABS(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "ABS[]", n);
  }
  stack.push(Math.abs(n));
}
function NEG(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "NEG[]", n);
  }
  stack.push(-n);
}
function FLOOR(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "FLOOR[]", n);
  }
  stack.push(Math.floor(n / 64) * 64);
}
function CEILING(state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "CEILING[]", n);
  }
  stack.push(Math.ceil(n / 64) * 64);
}
function ROUND(dt2, state) {
  var stack = state.stack;
  var n = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "ROUND[]");
  }
  stack.push(state.round(n / 64) * 64);
}
function WCVTF(state) {
  var stack = state.stack;
  var v = stack.pop();
  var l = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "WCVTF[]", v, l);
  }
  state.cvt[l] = v * state.ppem / state.font.unitsPerEm;
}
function DELTAC123(b, state) {
  var stack = state.stack;
  var n = stack.pop();
  var ppem = state.ppem;
  var base = state.deltaBase + (b - 1) * 16;
  var ds = state.deltaShift;
  if (exports.DEBUG) {
    console.log(state.step, "DELTAC[" + b + "]", n, stack);
  }
  for (var i = 0; i < n; i++) {
    var c = stack.pop();
    var arg = stack.pop();
    var appem = base + ((arg & 240) >> 4);
    if (appem !== ppem) {
      continue;
    }
    var mag = (arg & 15) - 8;
    if (mag >= 0) {
      mag++;
    }
    var delta = mag * ds;
    if (exports.DEBUG) {
      console.log(state.step, "DELTACFIX", c, "by", delta);
    }
    state.cvt[c] += delta;
  }
}
function SROUND(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SROUND[]", n);
  }
  state.round = roundSuper;
  var period;
  switch (n & 192) {
    case 0:
      period = 0.5;
      break;
    case 64:
      period = 1;
      break;
    case 128:
      period = 2;
      break;
    default:
      throw new Error("invalid SROUND value");
  }
  state.srPeriod = period;
  switch (n & 48) {
    case 0:
      state.srPhase = 0;
      break;
    case 16:
      state.srPhase = 0.25 * period;
      break;
    case 32:
      state.srPhase = 0.5 * period;
      break;
    case 48:
      state.srPhase = 0.75 * period;
      break;
    default:
      throw new Error("invalid SROUND value");
  }
  n &= 15;
  if (n === 0) {
    state.srThreshold = 0;
  } else {
    state.srThreshold = (n / 8 - 0.5) * period;
  }
}
function S45ROUND(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "S45ROUND[]", n);
  }
  state.round = roundSuper;
  var period;
  switch (n & 192) {
    case 0:
      period = Math.sqrt(2) / 2;
      break;
    case 64:
      period = Math.sqrt(2);
      break;
    case 128:
      period = 2 * Math.sqrt(2);
      break;
    default:
      throw new Error("invalid S45ROUND value");
  }
  state.srPeriod = period;
  switch (n & 48) {
    case 0:
      state.srPhase = 0;
      break;
    case 16:
      state.srPhase = 0.25 * period;
      break;
    case 32:
      state.srPhase = 0.5 * period;
      break;
    case 48:
      state.srPhase = 0.75 * period;
      break;
    default:
      throw new Error("invalid S45ROUND value");
  }
  n &= 15;
  if (n === 0) {
    state.srThreshold = 0;
  } else {
    state.srThreshold = (n / 8 - 0.5) * period;
  }
}
function ROFF(state) {
  if (exports.DEBUG) {
    console.log(state.step, "ROFF[]");
  }
  state.round = roundOff;
}
function RUTG(state) {
  if (exports.DEBUG) {
    console.log(state.step, "RUTG[]");
  }
  state.round = roundUpToGrid;
}
function RDTG(state) {
  if (exports.DEBUG) {
    console.log(state.step, "RDTG[]");
  }
  state.round = roundDownToGrid;
}
function SCANCTRL(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SCANCTRL[]", n);
  }
}
function SDPVTL(a, state) {
  var stack = state.stack;
  var p2i = stack.pop();
  var p1i = stack.pop();
  var p2 = state.z2[p2i];
  var p1 = state.z1[p1i];
  if (exports.DEBUG) {
    console.log(state.step, "SDPVTL[" + a + "]", p2i, p1i);
  }
  var dx;
  var dy;
  if (!a) {
    dx = p1.x - p2.x;
    dy = p1.y - p2.y;
  } else {
    dx = p2.y - p1.y;
    dy = p1.x - p2.x;
  }
  state.dpv = getUnitVector(dx, dy);
}
function GETINFO(state) {
  var stack = state.stack;
  var sel = stack.pop();
  var r = 0;
  if (exports.DEBUG) {
    console.log(state.step, "GETINFO[]", sel);
  }
  if (sel & 1) {
    r = 35;
  }
  if (sel & 32) {
    r |= 4096;
  }
  stack.push(r);
}
function ROLL(state) {
  var stack = state.stack;
  var a = stack.pop();
  var b = stack.pop();
  var c = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "ROLL[]");
  }
  stack.push(b);
  stack.push(a);
  stack.push(c);
}
function MAX(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "MAX[]", e2, e1);
  }
  stack.push(Math.max(e1, e2));
}
function MIN(state) {
  var stack = state.stack;
  var e2 = stack.pop();
  var e1 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "MIN[]", e2, e1);
  }
  stack.push(Math.min(e1, e2));
}
function SCANTYPE(state) {
  var n = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SCANTYPE[]", n);
  }
}
function INSTCTRL(state) {
  var s = state.stack.pop();
  var v = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "INSTCTRL[]", s, v);
  }
  switch (s) {
    case 1:
      state.inhibitGridFit = !!v;
      return;
    case 2:
      state.ignoreCvt = !!v;
      return;
    default:
      throw new Error("invalid INSTCTRL[] selector");
  }
}
function PUSHB(n, state) {
  var stack = state.stack;
  var prog = state.prog;
  var ip = state.ip;
  if (exports.DEBUG) {
    console.log(state.step, "PUSHB[" + n + "]");
  }
  for (var i = 0; i < n; i++) {
    stack.push(prog[++ip]);
  }
  state.ip = ip;
}
function PUSHW(n, state) {
  var ip = state.ip;
  var prog = state.prog;
  var stack = state.stack;
  if (exports.DEBUG) {
    console.log(state.ip, "PUSHW[" + n + "]");
  }
  for (var i = 0; i < n; i++) {
    var w = prog[++ip] << 8 | prog[++ip];
    if (w & 32768) {
      w = -((w ^ 65535) + 1);
    }
    stack.push(w);
  }
  state.ip = ip;
}
function MDRP_MIRP(indirect, setRp0, keepD, ro, dt2, state) {
  var stack = state.stack;
  var cvte = indirect && stack.pop();
  var pi = stack.pop();
  var rp0i = state.rp0;
  var rp = state.z0[rp0i];
  var p = state.z1[pi];
  var md = state.minDis;
  var fv = state.fv;
  var pv = state.dpv;
  var od;
  var d;
  var sign;
  var cv;
  d = od = pv.distance(p, rp, true, true);
  sign = d >= 0 ? 1 : -1;
  d = Math.abs(d);
  if (indirect) {
    cv = state.cvt[cvte];
    if (ro && Math.abs(d - cv) < state.cvCutIn) {
      d = cv;
    }
  }
  if (keepD && d < md) {
    d = md;
  }
  if (ro) {
    d = state.round(d);
  }
  fv.setRelative(p, rp, sign * d, pv);
  fv.touch(p);
  if (exports.DEBUG) {
    console.log(state.step, (indirect ? "MIRP[" : "MDRP[") + (setRp0 ? "M" : "m") + (keepD ? ">" : "_") + (ro ? "R" : "_") + (dt2 === 0 ? "Gr" : dt2 === 1 ? "Bl" : dt2 === 2 ? "Wh" : "") + "]", indirect ? cvte + "(" + state.cvt[cvte] + "," + cv + ")" : "", pi, "(d =", od, "->", sign * d, ")");
  }
  state.rp1 = state.rp0;
  state.rp2 = pi;
  if (setRp0) {
    state.rp0 = pi;
  }
}
instructionTable = [
  SVTCA.bind(void 0, yUnitVector),
  SVTCA.bind(void 0, xUnitVector),
  SPVTCA.bind(void 0, yUnitVector),
  SPVTCA.bind(void 0, xUnitVector),
  SFVTCA.bind(void 0, yUnitVector),
  SFVTCA.bind(void 0, xUnitVector),
  SPVTL.bind(void 0, 0),
  SPVTL.bind(void 0, 1),
  SFVTL.bind(void 0, 0),
  SFVTL.bind(void 0, 1),
  SPVFS,
  SFVFS,
  GPV,
  GFV,
  SFVTPV,
  ISECT,
  SRP0,
  SRP1,
  SRP2,
  SZP0,
  SZP1,
  SZP2,
  SZPS,
  SLOOP,
  RTG,
  RTHG,
  SMD,
  ELSE,
  JMPR,
  SCVTCI,
  void 0,
  void 0,
  DUP,
  POP,
  CLEAR,
  SWAP,
  DEPTH,
  CINDEX,
  MINDEX,
  void 0,
  void 0,
  void 0,
  LOOPCALL,
  CALL,
  FDEF,
  void 0,
  MDAP.bind(void 0, 0),
  MDAP.bind(void 0, 1),
  IUP.bind(void 0, yUnitVector),
  IUP.bind(void 0, xUnitVector),
  SHP.bind(void 0, 0),
  SHP.bind(void 0, 1),
  SHC.bind(void 0, 0),
  SHC.bind(void 0, 1),
  SHZ.bind(void 0, 0),
  SHZ.bind(void 0, 1),
  SHPIX,
  IP,
  MSIRP.bind(void 0, 0),
  MSIRP.bind(void 0, 1),
  ALIGNRP,
  RTDG,
  MIAP.bind(void 0, 0),
  MIAP.bind(void 0, 1),
  NPUSHB,
  NPUSHW,
  WS,
  RS,
  WCVTP,
  RCVT,
  GC.bind(void 0, 0),
  GC.bind(void 0, 1),
  void 0,
  MD.bind(void 0, 0),
  MD.bind(void 0, 1),
  MPPEM,
  void 0,
  FLIPON,
  void 0,
  void 0,
  LT,
  LTEQ,
  GT,
  GTEQ,
  EQ,
  NEQ,
  ODD,
  EVEN,
  IF,
  EIF,
  AND,
  OR,
  NOT,
  DELTAP123.bind(void 0, 1),
  SDB,
  SDS,
  ADD,
  SUB,
  DIV,
  MUL,
  ABS,
  NEG,
  FLOOR,
  CEILING,
  ROUND.bind(void 0, 0),
  ROUND.bind(void 0, 1),
  ROUND.bind(void 0, 2),
  ROUND.bind(void 0, 3),
  void 0,
  void 0,
  void 0,
  void 0,
  WCVTF,
  DELTAP123.bind(void 0, 2),
  DELTAP123.bind(void 0, 3),
  DELTAC123.bind(void 0, 1),
  DELTAC123.bind(void 0, 2),
  DELTAC123.bind(void 0, 3),
  SROUND,
  S45ROUND,
  void 0,
  void 0,
  ROFF,
  void 0,
  RUTG,
  RDTG,
  POP,
  POP,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  SCANCTRL,
  SDPVTL.bind(void 0, 0),
  SDPVTL.bind(void 0, 1),
  GETINFO,
  void 0,
  ROLL,
  MAX,
  MIN,
  SCANTYPE,
  INSTCTRL,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  void 0,
  PUSHB.bind(void 0, 1),
  PUSHB.bind(void 0, 2),
  PUSHB.bind(void 0, 3),
  PUSHB.bind(void 0, 4),
  PUSHB.bind(void 0, 5),
  PUSHB.bind(void 0, 6),
  PUSHB.bind(void 0, 7),
  PUSHB.bind(void 0, 8),
  PUSHW.bind(void 0, 1),
  PUSHW.bind(void 0, 2),
  PUSHW.bind(void 0, 3),
  PUSHW.bind(void 0, 4),
  PUSHW.bind(void 0, 5),
  PUSHW.bind(void 0, 6),
  PUSHW.bind(void 0, 7),
  PUSHW.bind(void 0, 8),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 0),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 1),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 2),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 3),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 0),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 1),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 2),
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 3),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 0),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 1),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 2),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 3),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 0),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 1),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 2),
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 3),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 0),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 1),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 2),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 3),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 0),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 1),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 2),
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 3),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 0),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 1),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 2),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 3),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 0),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 1),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 2),
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 3),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 0),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 1),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 2),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 3),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 0),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 1),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 2),
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 3),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 0),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 1),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 2),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 3),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 0),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 1),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 2),
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 3),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 0),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 1),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 2),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 3),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 0),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 1),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 2),
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 3),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 0),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 1),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 2),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 3),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 0),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 1),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 2),
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 3)
];
function Token(char) {
  this.char = char;
  this.state = {};
  this.activeState = null;
}
function ContextRange(startIndex, endOffset, contextName) {
  this.contextName = contextName;
  this.startIndex = startIndex;
  this.endOffset = endOffset;
}
function ContextChecker(contextName, checkStart, checkEnd) {
  this.contextName = contextName;
  this.openRange = null;
  this.ranges = [];
  this.checkStart = checkStart;
  this.checkEnd = checkEnd;
}
function ContextParams(context, currentIndex) {
  this.context = context;
  this.index = currentIndex;
  this.length = context.length;
  this.current = context[currentIndex];
  this.backtrack = context.slice(0, currentIndex);
  this.lookahead = context.slice(currentIndex + 1);
}
function Event(eventId) {
  this.eventId = eventId;
  this.subscribers = [];
}
function initializeCoreEvents(events) {
  var this$1 = this;
  var coreEvents = [
    "start",
    "end",
    "next",
    "newToken",
    "contextStart",
    "contextEnd",
    "insertToken",
    "removeToken",
    "removeRange",
    "replaceToken",
    "replaceRange",
    "composeRUD",
    "updateContextsRanges"
  ];
  coreEvents.forEach(function(eventId) {
    Object.defineProperty(this$1.events, eventId, {
      value: new Event(eventId)
    });
  });
  if (!!events) {
    coreEvents.forEach(function(eventId) {
      var event = events[eventId];
      if (typeof event === "function") {
        this$1.events[eventId].subscribe(event);
      }
    });
  }
  var requiresContextUpdate = [
    "insertToken",
    "removeToken",
    "removeRange",
    "replaceToken",
    "replaceRange",
    "composeRUD"
  ];
  requiresContextUpdate.forEach(function(eventId) {
    this$1.events[eventId].subscribe(this$1.updateContextsRanges);
  });
}
function Tokenizer(events) {
  this.tokens = [];
  this.registeredContexts = {};
  this.contextCheckers = [];
  this.events = {};
  this.registeredModifiers = [];
  initializeCoreEvents.call(this, events);
}
Token.prototype.setState = function(key, value) {
  this.state[key] = value;
  this.activeState = { key, value: this.state[key] };
  return this.activeState;
};
Token.prototype.getState = function(stateId) {
  return this.state[stateId] || null;
};
Tokenizer.prototype.inboundIndex = function(index) {
  return index >= 0 && index < this.tokens.length;
};
Tokenizer.prototype.composeRUD = function(RUDs) {
  var this$1 = this;
  var silent = true;
  var state = RUDs.map(function(RUD) {
    return this$1[RUD[0]].apply(this$1, RUD.slice(1).concat(silent));
  });
  var hasFAILObject = function(obj) {
    return typeof obj === "object" && obj.hasOwnProperty("FAIL");
  };
  if (state.every(hasFAILObject)) {
    return {
      FAIL: "composeRUD: one or more operations hasn't completed successfully",
      report: state.filter(hasFAILObject)
    };
  }
  this.dispatch("composeRUD", [state.filter(function(op) {
    return !hasFAILObject(op);
  })]);
};
Tokenizer.prototype.replaceRange = function(startIndex, offset, tokens, silent) {
  offset = offset !== null ? offset : this.tokens.length;
  var isTokenType = tokens.every(function(token) {
    return token instanceof Token;
  });
  if (!isNaN(startIndex) && this.inboundIndex(startIndex) && isTokenType) {
    var replaced = this.tokens.splice.apply(this.tokens, [startIndex, offset].concat(tokens));
    if (!silent) {
      this.dispatch("replaceToken", [startIndex, offset, tokens]);
    }
    return [replaced, tokens];
  } else {
    return { FAIL: "replaceRange: invalid tokens or startIndex." };
  }
};
Tokenizer.prototype.replaceToken = function(index, token, silent) {
  if (!isNaN(index) && this.inboundIndex(index) && token instanceof Token) {
    var replaced = this.tokens.splice(index, 1, token);
    if (!silent) {
      this.dispatch("replaceToken", [index, token]);
    }
    return [replaced[0], token];
  } else {
    return { FAIL: "replaceToken: invalid token or index." };
  }
};
Tokenizer.prototype.removeRange = function(startIndex, offset, silent) {
  offset = !isNaN(offset) ? offset : this.tokens.length;
  var tokens = this.tokens.splice(startIndex, offset);
  if (!silent) {
    this.dispatch("removeRange", [tokens, startIndex, offset]);
  }
  return tokens;
};
Tokenizer.prototype.removeToken = function(index, silent) {
  if (!isNaN(index) && this.inboundIndex(index)) {
    var token = this.tokens.splice(index, 1);
    if (!silent) {
      this.dispatch("removeToken", [token, index]);
    }
    return token;
  } else {
    return { FAIL: "removeToken: invalid token index." };
  }
};
Tokenizer.prototype.insertToken = function(tokens, index, silent) {
  var tokenType = tokens.every(function(token) {
    return token instanceof Token;
  });
  if (tokenType) {
    this.tokens.splice.apply(this.tokens, [index, 0].concat(tokens));
    if (!silent) {
      this.dispatch("insertToken", [tokens, index]);
    }
    return tokens;
  } else {
    return { FAIL: "insertToken: invalid token(s)." };
  }
};
Tokenizer.prototype.registerModifier = function(modifierId, condition, modifier) {
  this.events.newToken.subscribe(function(token, contextParams) {
    var conditionParams = [token, contextParams];
    var canApplyModifier = condition === null || condition.apply(this, conditionParams) === true;
    var modifierParams = [token, contextParams];
    if (canApplyModifier) {
      var newStateValue = modifier.apply(this, modifierParams);
      token.setState(modifierId, newStateValue);
    }
  });
  this.registeredModifiers.push(modifierId);
};
Event.prototype.subscribe = function(eventHandler) {
  if (typeof eventHandler === "function") {
    return this.subscribers.push(eventHandler) - 1;
  } else {
    return { FAIL: "invalid '" + this.eventId + "' event handler" };
  }
};
Event.prototype.unsubscribe = function(subsId) {
  this.subscribers.splice(subsId, 1);
};
ContextParams.prototype.setCurrentIndex = function(index) {
  this.index = index;
  this.current = this.context[index];
  this.backtrack = this.context.slice(0, index);
  this.lookahead = this.context.slice(index + 1);
};
ContextParams.prototype.get = function(offset) {
  switch (true) {
    case offset === 0:
      return this.current;
    case (offset < 0 && Math.abs(offset) <= this.backtrack.length):
      return this.backtrack.slice(offset)[0];
    case (offset > 0 && offset <= this.lookahead.length):
      return this.lookahead[offset - 1];
    default:
      return null;
  }
};
Tokenizer.prototype.rangeToText = function(range) {
  if (range instanceof ContextRange) {
    return this.getRangeTokens(range).map(function(token) {
      return token.char;
    }).join("");
  }
};
Tokenizer.prototype.getText = function() {
  return this.tokens.map(function(token) {
    return token.char;
  }).join("");
};
Tokenizer.prototype.getContext = function(contextName) {
  var context = this.registeredContexts[contextName];
  return !!context ? context : null;
};
Tokenizer.prototype.on = function(eventName, eventHandler) {
  var event = this.events[eventName];
  if (!!event) {
    return event.subscribe(eventHandler);
  } else {
    return null;
  }
};
Tokenizer.prototype.dispatch = function(eventName, args) {
  var this$1 = this;
  var event = this.events[eventName];
  if (event instanceof Event) {
    event.subscribers.forEach(function(subscriber) {
      subscriber.apply(this$1, args || []);
    });
  }
};
Tokenizer.prototype.registerContextChecker = function(contextName, contextStartCheck, contextEndCheck) {
  if (!!this.getContext(contextName)) {
    return {
      FAIL: "context name '" + contextName + "' is already registered."
    };
  }
  if (typeof contextStartCheck !== "function") {
    return {
      FAIL: "missing context start check."
    };
  }
  if (typeof contextEndCheck !== "function") {
    return {
      FAIL: "missing context end check."
    };
  }
  var contextCheckers = new ContextChecker(contextName, contextStartCheck, contextEndCheck);
  this.registeredContexts[contextName] = contextCheckers;
  this.contextCheckers.push(contextCheckers);
  return contextCheckers;
};
Tokenizer.prototype.getRangeTokens = function(range) {
  var endIndex = range.startIndex + range.endOffset;
  return [].concat(this.tokens.slice(range.startIndex, endIndex));
};
Tokenizer.prototype.getContextRanges = function(contextName) {
  var context = this.getContext(contextName);
  if (!!context) {
    return context.ranges;
  } else {
    return { FAIL: "context checker '" + contextName + "' is not registered." };
  }
};
Tokenizer.prototype.resetContextsRanges = function() {
  var registeredContexts = this.registeredContexts;
  for (var contextName in registeredContexts) {
    if (registeredContexts.hasOwnProperty(contextName)) {
      var context = registeredContexts[contextName];
      context.ranges = [];
    }
  }
};
Tokenizer.prototype.updateContextsRanges = function() {
  this.resetContextsRanges();
  var chars = this.tokens.map(function(token) {
    return token.char;
  });
  for (var i = 0; i < chars.length; i++) {
    var contextParams = new ContextParams(chars, i);
    this.runContextCheck(contextParams);
  }
  this.dispatch("updateContextsRanges", [this.registeredContexts]);
};
Tokenizer.prototype.setEndOffset = function(offset, contextName) {
  var startIndex = this.getContext(contextName).openRange.startIndex;
  var range = new ContextRange(startIndex, offset, contextName);
  var ranges = this.getContext(contextName).ranges;
  range.rangeId = contextName + "." + ranges.length;
  ranges.push(range);
  this.getContext(contextName).openRange = null;
  return range;
};
Tokenizer.prototype.runContextCheck = function(contextParams) {
  var this$1 = this;
  var index = contextParams.index;
  this.contextCheckers.forEach(function(contextChecker) {
    var contextName = contextChecker.contextName;
    var openRange = this$1.getContext(contextName).openRange;
    if (!openRange && contextChecker.checkStart(contextParams)) {
      openRange = new ContextRange(index, null, contextName);
      this$1.getContext(contextName).openRange = openRange;
      this$1.dispatch("contextStart", [contextName, index]);
    }
    if (!!openRange && contextChecker.checkEnd(contextParams)) {
      var offset = index - openRange.startIndex + 1;
      var range = this$1.setEndOffset(offset, contextName);
      this$1.dispatch("contextEnd", [contextName, range]);
    }
  });
};
Tokenizer.prototype.tokenize = function(text) {
  this.tokens = [];
  this.resetContextsRanges();
  var chars = Array.from(text);
  this.dispatch("start");
  for (var i = 0; i < chars.length; i++) {
    var char = chars[i];
    var contextParams = new ContextParams(chars, i);
    this.dispatch("next", [contextParams]);
    this.runContextCheck(contextParams);
    var token = new Token(char);
    this.tokens.push(token);
    this.dispatch("newToken", [token, contextParams]);
  }
  this.dispatch("end", [this.tokens]);
  return this.tokens;
};
function isArabicChar(c) {
  return /[\u0600-\u065F\u066A-\u06D2\u06FA-\u06FF]/.test(c);
}
function isIsolatedArabicChar(char) {
  return /[\u0630\u0690\u0621\u0631\u0661\u0671\u0622\u0632\u0672\u0692\u06C2\u0623\u0673\u0693\u06C3\u0624\u0694\u06C4\u0625\u0675\u0695\u06C5\u06E5\u0676\u0696\u06C6\u0627\u0677\u0697\u06C7\u0648\u0688\u0698\u06C8\u0689\u0699\u06C9\u068A\u06CA\u066B\u068B\u06CB\u068C\u068D\u06CD\u06FD\u068E\u06EE\u06FE\u062F\u068F\u06CF\u06EF]/.test(char);
}
function isTashkeelArabicChar(char) {
  return /[\u0600-\u0605\u060C-\u060E\u0610-\u061B\u061E\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/.test(char);
}
function isLatinChar(c) {
  return /[A-z]/.test(c);
}
function isWhiteSpace(c) {
  return /\s/.test(c);
}
function FeatureQuery(font) {
  this.font = font;
  this.features = {};
}
function SubstitutionAction(action) {
  this.id = action.id;
  this.tag = action.tag;
  this.substitution = action.substitution;
}
function lookupCoverage(glyphIndex, coverage) {
  if (!glyphIndex) {
    return -1;
  }
  switch (coverage.format) {
    case 1:
      return coverage.glyphs.indexOf(glyphIndex);
    case 2:
      var ranges = coverage.ranges;
      for (var i = 0; i < ranges.length; i++) {
        var range = ranges[i];
        if (glyphIndex >= range.start && glyphIndex <= range.end) {
          var offset = glyphIndex - range.start;
          return range.index + offset;
        }
      }
      break;
    default:
      return -1;
  }
  return -1;
}
function singleSubstitutionFormat1(glyphIndex, subtable) {
  var substituteIndex = lookupCoverage(glyphIndex, subtable.coverage);
  if (substituteIndex === -1) {
    return null;
  }
  return glyphIndex + subtable.deltaGlyphId;
}
function singleSubstitutionFormat2(glyphIndex, subtable) {
  var substituteIndex = lookupCoverage(glyphIndex, subtable.coverage);
  if (substituteIndex === -1) {
    return null;
  }
  return subtable.substitute[substituteIndex];
}
function lookupCoverageList(coverageList, contextParams) {
  var lookupList = [];
  for (var i = 0; i < coverageList.length; i++) {
    var coverage = coverageList[i];
    var glyphIndex = contextParams.current;
    glyphIndex = Array.isArray(glyphIndex) ? glyphIndex[0] : glyphIndex;
    var lookupIndex = lookupCoverage(glyphIndex, coverage);
    if (lookupIndex !== -1) {
      lookupList.push(lookupIndex);
    }
  }
  if (lookupList.length !== coverageList.length) {
    return -1;
  }
  return lookupList;
}
function chainingSubstitutionFormat3(contextParams, subtable) {
  var lookupsCount = subtable.inputCoverage.length + subtable.lookaheadCoverage.length + subtable.backtrackCoverage.length;
  if (contextParams.context.length < lookupsCount) {
    return [];
  }
  var inputLookups = lookupCoverageList(subtable.inputCoverage, contextParams);
  if (inputLookups === -1) {
    return [];
  }
  var lookaheadOffset = subtable.inputCoverage.length - 1;
  if (contextParams.lookahead.length < subtable.lookaheadCoverage.length) {
    return [];
  }
  var lookaheadContext = contextParams.lookahead.slice(lookaheadOffset);
  while (lookaheadContext.length && isTashkeelArabicChar(lookaheadContext[0].char)) {
    lookaheadContext.shift();
  }
  var lookaheadParams = new ContextParams(lookaheadContext, 0);
  var lookaheadLookups = lookupCoverageList(subtable.lookaheadCoverage, lookaheadParams);
  var backtrackContext = [].concat(contextParams.backtrack);
  backtrackContext.reverse();
  while (backtrackContext.length && isTashkeelArabicChar(backtrackContext[0].char)) {
    backtrackContext.shift();
  }
  if (backtrackContext.length < subtable.backtrackCoverage.length) {
    return [];
  }
  var backtrackParams = new ContextParams(backtrackContext, 0);
  var backtrackLookups = lookupCoverageList(subtable.backtrackCoverage, backtrackParams);
  var contextRulesMatch = inputLookups.length === subtable.inputCoverage.length && lookaheadLookups.length === subtable.lookaheadCoverage.length && backtrackLookups.length === subtable.backtrackCoverage.length;
  var substitutions = [];
  if (contextRulesMatch) {
    for (var i = 0; i < subtable.lookupRecords.length; i++) {
      var lookupRecord = subtable.lookupRecords[i];
      var lookupListIndex = lookupRecord.lookupListIndex;
      var lookupTable = this.getLookupByIndex(lookupListIndex);
      for (var s = 0; s < lookupTable.subtables.length; s++) {
        var subtable$1 = lookupTable.subtables[s];
        var lookup = this.getLookupMethod(lookupTable, subtable$1);
        var substitutionType = this.getSubstitutionType(lookupTable, subtable$1);
        if (substitutionType === "12") {
          for (var n = 0; n < inputLookups.length; n++) {
            var glyphIndex = contextParams.get(n);
            var substitution = lookup(glyphIndex);
            if (substitution) {
              substitutions.push(substitution);
            }
          }
        }
      }
    }
  }
  return substitutions;
}
function ligatureSubstitutionFormat1(contextParams, subtable) {
  var glyphIndex = contextParams.current;
  var ligSetIndex = lookupCoverage(glyphIndex, subtable.coverage);
  if (ligSetIndex === -1) {
    return null;
  }
  var ligature;
  var ligatureSet = subtable.ligatureSets[ligSetIndex];
  for (var s = 0; s < ligatureSet.length; s++) {
    ligature = ligatureSet[s];
    for (var l = 0; l < ligature.components.length; l++) {
      var lookaheadItem = contextParams.lookahead[l];
      var component = ligature.components[l];
      if (lookaheadItem !== component) {
        break;
      }
      if (l === ligature.components.length - 1) {
        return ligature;
      }
    }
  }
  return null;
}
function decompositionSubstitutionFormat1(glyphIndex, subtable) {
  var substituteIndex = lookupCoverage(glyphIndex, subtable.coverage);
  if (substituteIndex === -1) {
    return null;
  }
  return subtable.sequences[substituteIndex];
}
FeatureQuery.prototype.getDefaultScriptFeaturesIndexes = function() {
  var scripts = this.font.tables.gsub.scripts;
  for (var s = 0; s < scripts.length; s++) {
    var script = scripts[s];
    if (script.tag === "DFLT") {
      return script.script.defaultLangSys.featureIndexes;
    }
  }
  return [];
};
FeatureQuery.prototype.getScriptFeaturesIndexes = function(scriptTag) {
  var tables = this.font.tables;
  if (!tables.gsub) {
    return [];
  }
  if (!scriptTag) {
    return this.getDefaultScriptFeaturesIndexes();
  }
  var scripts = this.font.tables.gsub.scripts;
  for (var i = 0; i < scripts.length; i++) {
    var script = scripts[i];
    if (script.tag === scriptTag && script.script.defaultLangSys) {
      return script.script.defaultLangSys.featureIndexes;
    } else {
      var langSysRecords = script.langSysRecords;
      if (!!langSysRecords) {
        for (var j = 0; j < langSysRecords.length; j++) {
          var langSysRecord = langSysRecords[j];
          if (langSysRecord.tag === scriptTag) {
            var langSys = langSysRecord.langSys;
            return langSys.featureIndexes;
          }
        }
      }
    }
  }
  return this.getDefaultScriptFeaturesIndexes();
};
FeatureQuery.prototype.mapTagsToFeatures = function(features, scriptTag) {
  var tags = {};
  for (var i = 0; i < features.length; i++) {
    var tag = features[i].tag;
    var feature = features[i].feature;
    tags[tag] = feature;
  }
  this.features[scriptTag].tags = tags;
};
FeatureQuery.prototype.getScriptFeatures = function(scriptTag) {
  var features = this.features[scriptTag];
  if (this.features.hasOwnProperty(scriptTag)) {
    return features;
  }
  var featuresIndexes = this.getScriptFeaturesIndexes(scriptTag);
  if (!featuresIndexes) {
    return null;
  }
  var gsub2 = this.font.tables.gsub;
  features = featuresIndexes.map(function(index) {
    return gsub2.features[index];
  });
  this.features[scriptTag] = features;
  this.mapTagsToFeatures(features, scriptTag);
  return features;
};
FeatureQuery.prototype.getSubstitutionType = function(lookupTable, subtable) {
  var lookupType = lookupTable.lookupType.toString();
  var substFormat = subtable.substFormat.toString();
  return lookupType + substFormat;
};
FeatureQuery.prototype.getLookupMethod = function(lookupTable, subtable) {
  var this$1 = this;
  var substitutionType = this.getSubstitutionType(lookupTable, subtable);
  switch (substitutionType) {
    case "11":
      return function(glyphIndex) {
        return singleSubstitutionFormat1.apply(this$1, [glyphIndex, subtable]);
      };
    case "12":
      return function(glyphIndex) {
        return singleSubstitutionFormat2.apply(this$1, [glyphIndex, subtable]);
      };
    case "63":
      return function(contextParams) {
        return chainingSubstitutionFormat3.apply(this$1, [contextParams, subtable]);
      };
    case "41":
      return function(contextParams) {
        return ligatureSubstitutionFormat1.apply(this$1, [contextParams, subtable]);
      };
    case "21":
      return function(glyphIndex) {
        return decompositionSubstitutionFormat1.apply(this$1, [glyphIndex, subtable]);
      };
    default:
      throw new Error("lookupType: " + lookupTable.lookupType + " - substFormat: " + subtable.substFormat + " is not yet supported");
  }
};
FeatureQuery.prototype.lookupFeature = function(query) {
  var contextParams = query.contextParams;
  var currentIndex = contextParams.index;
  var feature = this.getFeature({
    tag: query.tag,
    script: query.script
  });
  if (!feature) {
    return new Error("font '" + this.font.names.fullName.en + "' doesn't support feature '" + query.tag + "' for script '" + query.script + "'.");
  }
  var lookups = this.getFeatureLookups(feature);
  var substitutions = [].concat(contextParams.context);
  for (var l = 0; l < lookups.length; l++) {
    var lookupTable = lookups[l];
    var subtables = this.getLookupSubtables(lookupTable);
    for (var s = 0; s < subtables.length; s++) {
      var subtable = subtables[s];
      var substType = this.getSubstitutionType(lookupTable, subtable);
      var lookup = this.getLookupMethod(lookupTable, subtable);
      var substitution = void 0;
      switch (substType) {
        case "11":
          substitution = lookup(contextParams.current);
          if (substitution) {
            substitutions.splice(currentIndex, 1, new SubstitutionAction({
              id: 11,
              tag: query.tag,
              substitution
            }));
          }
          break;
        case "12":
          substitution = lookup(contextParams.current);
          if (substitution) {
            substitutions.splice(currentIndex, 1, new SubstitutionAction({
              id: 12,
              tag: query.tag,
              substitution
            }));
          }
          break;
        case "63":
          substitution = lookup(contextParams);
          if (Array.isArray(substitution) && substitution.length) {
            substitutions.splice(currentIndex, 1, new SubstitutionAction({
              id: 63,
              tag: query.tag,
              substitution
            }));
          }
          break;
        case "41":
          substitution = lookup(contextParams);
          if (substitution) {
            substitutions.splice(currentIndex, 1, new SubstitutionAction({
              id: 41,
              tag: query.tag,
              substitution
            }));
          }
          break;
        case "21":
          substitution = lookup(contextParams.current);
          if (substitution) {
            substitutions.splice(currentIndex, 1, new SubstitutionAction({
              id: 21,
              tag: query.tag,
              substitution
            }));
          }
          break;
      }
      contextParams = new ContextParams(substitutions, currentIndex);
      if (Array.isArray(substitution) && !substitution.length) {
        continue;
      }
      substitution = null;
    }
  }
  return substitutions.length ? substitutions : null;
};
FeatureQuery.prototype.supports = function(query) {
  if (!query.script) {
    return false;
  }
  this.getScriptFeatures(query.script);
  var supportedScript = this.features.hasOwnProperty(query.script);
  if (!query.tag) {
    return supportedScript;
  }
  var supportedFeature = this.features[query.script].some(function(feature) {
    return feature.tag === query.tag;
  });
  return supportedScript && supportedFeature;
};
FeatureQuery.prototype.getLookupSubtables = function(lookupTable) {
  return lookupTable.subtables || null;
};
FeatureQuery.prototype.getLookupByIndex = function(index) {
  var lookups = this.font.tables.gsub.lookups;
  return lookups[index] || null;
};
FeatureQuery.prototype.getFeatureLookups = function(feature) {
  return feature.lookupListIndexes.map(this.getLookupByIndex.bind(this));
};
FeatureQuery.prototype.getFeature = function getFeature(query) {
  if (!this.font) {
    return { FAIL: "No font was found" };
  }
  if (!this.features.hasOwnProperty(query.script)) {
    this.getScriptFeatures(query.script);
  }
  var scriptFeatures = this.features[query.script];
  if (!scriptFeatures) {
    return { FAIL: "No feature for script " + query.script };
  }
  if (!scriptFeatures.tags[query.tag]) {
    return null;
  }
  return this.features[query.script].tags[query.tag];
};
function arabicWordStartCheck(contextParams) {
  var char = contextParams.current;
  var prevChar = contextParams.get(-1);
  return prevChar === null && isArabicChar(char) || !isArabicChar(prevChar) && isArabicChar(char);
}
function arabicWordEndCheck(contextParams) {
  var nextChar = contextParams.get(1);
  return nextChar === null || !isArabicChar(nextChar);
}
var arabicWordCheck = {
  startCheck: arabicWordStartCheck,
  endCheck: arabicWordEndCheck
};
function arabicSentenceStartCheck(contextParams) {
  var char = contextParams.current;
  var prevChar = contextParams.get(-1);
  return (isArabicChar(char) || isTashkeelArabicChar(char)) && !isArabicChar(prevChar);
}
function arabicSentenceEndCheck(contextParams) {
  var nextChar = contextParams.get(1);
  switch (true) {
    case nextChar === null:
      return true;
    case (!isArabicChar(nextChar) && !isTashkeelArabicChar(nextChar)):
      var nextIsWhitespace = isWhiteSpace(nextChar);
      if (!nextIsWhitespace) {
        return true;
      }
      if (nextIsWhitespace) {
        var arabicCharAhead = false;
        arabicCharAhead = contextParams.lookahead.some(function(c) {
          return isArabicChar(c) || isTashkeelArabicChar(c);
        });
        if (!arabicCharAhead) {
          return true;
        }
      }
      break;
    default:
      return false;
  }
}
var arabicSentenceCheck = {
  startCheck: arabicSentenceStartCheck,
  endCheck: arabicSentenceEndCheck
};
function singleSubstitutionFormat1$1(action, tokens, index) {
  tokens[index].setState(action.tag, action.substitution);
}
function singleSubstitutionFormat2$1(action, tokens, index) {
  tokens[index].setState(action.tag, action.substitution);
}
function chainingSubstitutionFormat3$1(action, tokens, index) {
  action.substitution.forEach(function(subst, offset) {
    var token = tokens[index + offset];
    token.setState(action.tag, subst);
  });
}
function ligatureSubstitutionFormat1$1(action, tokens, index) {
  var token = tokens[index];
  token.setState(action.tag, action.substitution.ligGlyph);
  var compsCount = action.substitution.components.length;
  for (var i = 0; i < compsCount; i++) {
    token = tokens[index + i + 1];
    token.setState("deleted", true);
  }
}
var SUBSTITUTIONS = {
  11: singleSubstitutionFormat1$1,
  12: singleSubstitutionFormat2$1,
  63: chainingSubstitutionFormat3$1,
  41: ligatureSubstitutionFormat1$1
};
function applySubstitution(action, tokens, index) {
  if (action instanceof SubstitutionAction && SUBSTITUTIONS[action.id]) {
    SUBSTITUTIONS[action.id](action, tokens, index);
  }
}
function willConnectPrev(charContextParams) {
  var backtrack = [].concat(charContextParams.backtrack);
  for (var i = backtrack.length - 1; i >= 0; i--) {
    var prevChar = backtrack[i];
    var isolated = isIsolatedArabicChar(prevChar);
    var tashkeel = isTashkeelArabicChar(prevChar);
    if (!isolated && !tashkeel) {
      return true;
    }
    if (isolated) {
      return false;
    }
  }
  return false;
}
function willConnectNext(charContextParams) {
  if (isIsolatedArabicChar(charContextParams.current)) {
    return false;
  }
  for (var i = 0; i < charContextParams.lookahead.length; i++) {
    var nextChar = charContextParams.lookahead[i];
    var tashkeel = isTashkeelArabicChar(nextChar);
    if (!tashkeel) {
      return true;
    }
  }
  return false;
}
function arabicPresentationForms(range) {
  var this$1 = this;
  var script = "arab";
  var tags = this.featuresTags[script];
  var tokens = this.tokenizer.getRangeTokens(range);
  if (tokens.length === 1) {
    return;
  }
  var contextParams = new ContextParams(tokens.map(function(token) {
    return token.getState("glyphIndex");
  }), 0);
  var charContextParams = new ContextParams(tokens.map(function(token) {
    return token.char;
  }), 0);
  tokens.forEach(function(token, index) {
    if (isTashkeelArabicChar(token.char)) {
      return;
    }
    contextParams.setCurrentIndex(index);
    charContextParams.setCurrentIndex(index);
    var CONNECT = 0;
    if (willConnectPrev(charContextParams)) {
      CONNECT |= 1;
    }
    if (willConnectNext(charContextParams)) {
      CONNECT |= 2;
    }
    var tag;
    switch (CONNECT) {
      case 1:
        tag = "fina";
        break;
      case 2:
        tag = "init";
        break;
      case 3:
        tag = "medi";
        break;
    }
    if (tags.indexOf(tag) === -1) {
      return;
    }
    var substitutions = this$1.query.lookupFeature({
      tag,
      script,
      contextParams
    });
    if (substitutions instanceof Error) {
      return console.info(substitutions.message);
    }
    substitutions.forEach(function(action, index2) {
      if (action instanceof SubstitutionAction) {
        applySubstitution(action, tokens, index2);
        contextParams.context[index2] = action.substitution;
      }
    });
  });
}
function getContextParams(tokens, index) {
  var context = tokens.map(function(token) {
    return token.activeState.value;
  });
  return new ContextParams(context, index || 0);
}
function arabicRequiredLigatures(range) {
  var this$1 = this;
  var script = "arab";
  var tokens = this.tokenizer.getRangeTokens(range);
  var contextParams = getContextParams(tokens);
  contextParams.context.forEach(function(glyphIndex, index) {
    contextParams.setCurrentIndex(index);
    var substitutions = this$1.query.lookupFeature({
      tag: "rlig",
      script,
      contextParams
    });
    if (substitutions.length) {
      substitutions.forEach(function(action) {
        return applySubstitution(action, tokens, index);
      });
      contextParams = getContextParams(tokens);
    }
  });
}
function latinWordStartCheck(contextParams) {
  var char = contextParams.current;
  var prevChar = contextParams.get(-1);
  return prevChar === null && isLatinChar(char) || !isLatinChar(prevChar) && isLatinChar(char);
}
function latinWordEndCheck(contextParams) {
  var nextChar = contextParams.get(1);
  return nextChar === null || !isLatinChar(nextChar);
}
var latinWordCheck = {
  startCheck: latinWordStartCheck,
  endCheck: latinWordEndCheck
};
function getContextParams$1(tokens, index) {
  var context = tokens.map(function(token) {
    return token.activeState.value;
  });
  return new ContextParams(context, index || 0);
}
function latinLigature(range) {
  var this$1 = this;
  var script = "latn";
  var tokens = this.tokenizer.getRangeTokens(range);
  var contextParams = getContextParams$1(tokens);
  contextParams.context.forEach(function(glyphIndex, index) {
    contextParams.setCurrentIndex(index);
    var substitutions = this$1.query.lookupFeature({
      tag: "liga",
      script,
      contextParams
    });
    if (substitutions.length) {
      substitutions.forEach(function(action) {
        return applySubstitution(action, tokens, index);
      });
      contextParams = getContextParams$1(tokens);
    }
  });
}
function Bidi(baseDir) {
  this.baseDir = baseDir || "ltr";
  this.tokenizer = new Tokenizer();
  this.featuresTags = {};
}
Bidi.prototype.setText = function(text) {
  this.text = text;
};
Bidi.prototype.contextChecks = {
  latinWordCheck,
  arabicWordCheck,
  arabicSentenceCheck
};
function registerContextChecker(checkId) {
  var check2 = this.contextChecks[checkId + "Check"];
  return this.tokenizer.registerContextChecker(checkId, check2.startCheck, check2.endCheck);
}
function tokenizeText() {
  registerContextChecker.call(this, "latinWord");
  registerContextChecker.call(this, "arabicWord");
  registerContextChecker.call(this, "arabicSentence");
  return this.tokenizer.tokenize(this.text);
}
function reverseArabicSentences() {
  var this$1 = this;
  var ranges = this.tokenizer.getContextRanges("arabicSentence");
  ranges.forEach(function(range) {
    var rangeTokens = this$1.tokenizer.getRangeTokens(range);
    this$1.tokenizer.replaceRange(range.startIndex, range.endOffset, rangeTokens.reverse());
  });
}
Bidi.prototype.registerFeatures = function(script, tags) {
  var this$1 = this;
  var supportedTags = tags.filter(function(tag) {
    return this$1.query.supports({ script, tag });
  });
  if (!this.featuresTags.hasOwnProperty(script)) {
    this.featuresTags[script] = supportedTags;
  } else {
    this.featuresTags[script] = this.featuresTags[script].concat(supportedTags);
  }
};
Bidi.prototype.applyFeatures = function(font, features) {
  if (!font) {
    throw new Error("No valid font was provided to apply features");
  }
  if (!this.query) {
    this.query = new FeatureQuery(font);
  }
  for (var f = 0; f < features.length; f++) {
    var feature = features[f];
    if (!this.query.supports({ script: feature.script })) {
      continue;
    }
    this.registerFeatures(feature.script, feature.tags);
  }
};
Bidi.prototype.registerModifier = function(modifierId, condition, modifier) {
  this.tokenizer.registerModifier(modifierId, condition, modifier);
};
function checkGlyphIndexStatus() {
  if (this.tokenizer.registeredModifiers.indexOf("glyphIndex") === -1) {
    throw new Error("glyphIndex modifier is required to apply arabic presentation features.");
  }
}
function applyArabicPresentationForms() {
  var this$1 = this;
  var script = "arab";
  if (!this.featuresTags.hasOwnProperty(script)) {
    return;
  }
  checkGlyphIndexStatus.call(this);
  var ranges = this.tokenizer.getContextRanges("arabicWord");
  ranges.forEach(function(range) {
    arabicPresentationForms.call(this$1, range);
  });
}
function applyArabicRequireLigatures() {
  var this$1 = this;
  var script = "arab";
  if (!this.featuresTags.hasOwnProperty(script)) {
    return;
  }
  var tags = this.featuresTags[script];
  if (tags.indexOf("rlig") === -1) {
    return;
  }
  checkGlyphIndexStatus.call(this);
  var ranges = this.tokenizer.getContextRanges("arabicWord");
  ranges.forEach(function(range) {
    arabicRequiredLigatures.call(this$1, range);
  });
}
function applyLatinLigatures() {
  var this$1 = this;
  var script = "latn";
  if (!this.featuresTags.hasOwnProperty(script)) {
    return;
  }
  var tags = this.featuresTags[script];
  if (tags.indexOf("liga") === -1) {
    return;
  }
  checkGlyphIndexStatus.call(this);
  var ranges = this.tokenizer.getContextRanges("latinWord");
  ranges.forEach(function(range) {
    latinLigature.call(this$1, range);
  });
}
Bidi.prototype.checkContextReady = function(contextId) {
  return !!this.tokenizer.getContext(contextId);
};
Bidi.prototype.applyFeaturesToContexts = function() {
  if (this.checkContextReady("arabicWord")) {
    applyArabicPresentationForms.call(this);
    applyArabicRequireLigatures.call(this);
  }
  if (this.checkContextReady("latinWord")) {
    applyLatinLigatures.call(this);
  }
  if (this.checkContextReady("arabicSentence")) {
    reverseArabicSentences.call(this);
  }
};
Bidi.prototype.processText = function(text) {
  if (!this.text || this.text !== text) {
    this.setText(text);
    tokenizeText.call(this);
    this.applyFeaturesToContexts();
  }
};
Bidi.prototype.getBidiText = function(text) {
  this.processText(text);
  return this.tokenizer.getText();
};
Bidi.prototype.getTextGlyphs = function(text) {
  this.processText(text);
  var indexes = [];
  for (var i = 0; i < this.tokenizer.tokens.length; i++) {
    var token = this.tokenizer.tokens[i];
    if (token.state.deleted) {
      continue;
    }
    var index = token.activeState.value;
    indexes.push(Array.isArray(index) ? index[0] : index);
  }
  return indexes;
};
function Font(options) {
  options = options || {};
  options.tables = options.tables || {};
  if (!options.empty) {
    checkArgument(options.familyName, "When creating a new Font object, familyName is required.");
    checkArgument(options.styleName, "When creating a new Font object, styleName is required.");
    checkArgument(options.unitsPerEm, "When creating a new Font object, unitsPerEm is required.");
    checkArgument(options.ascender, "When creating a new Font object, ascender is required.");
    checkArgument(options.descender <= 0, "When creating a new Font object, negative descender value is required.");
    this.unitsPerEm = options.unitsPerEm || 1e3;
    this.ascender = options.ascender;
    this.descender = options.descender;
    this.createdTimestamp = options.createdTimestamp;
    this.tables = Object.assign(options.tables, {
      os2: Object.assign({
        usWeightClass: options.weightClass || this.usWeightClasses.MEDIUM,
        usWidthClass: options.widthClass || this.usWidthClasses.MEDIUM,
        fsSelection: options.fsSelection || this.fsSelectionValues.REGULAR
      }, options.tables.os2)
    });
  }
  this.supported = true;
  this.glyphs = new glyphset.GlyphSet(this, options.glyphs || []);
  this.encoding = new DefaultEncoding(this);
  this.position = new Position(this);
  this.substitution = new Substitution(this);
  this.tables = this.tables || {};
  this._push = null;
  this._hmtxTableData = {};
  Object.defineProperty(this, "hinting", {
    get: function() {
      if (this._hinting) {
        return this._hinting;
      }
      if (this.outlinesFormat === "truetype") {
        return this._hinting = new Hinting(this);
      }
    }
  });
}
Font.prototype.hasChar = function(c) {
  return this.encoding.charToGlyphIndex(c) !== null;
};
Font.prototype.charToGlyphIndex = function(s) {
  return this.encoding.charToGlyphIndex(s);
};
Font.prototype.charToGlyph = function(c) {
  var glyphIndex = this.charToGlyphIndex(c);
  var glyph = this.glyphs.get(glyphIndex);
  if (!glyph) {
    glyph = this.glyphs.get(0);
  }
  return glyph;
};
Font.prototype.updateFeatures = function(options) {
  return this.defaultRenderOptions.features.map(function(feature) {
    if (feature.script === "latn") {
      return {
        script: "latn",
        tags: feature.tags.filter(function(tag) {
          return options[tag];
        })
      };
    } else {
      return feature;
    }
  });
};
Font.prototype.stringToGlyphs = function(s, options) {
  var this$1 = this;
  var bidi = new Bidi();
  var charToGlyphIndexMod = function(token) {
    return this$1.charToGlyphIndex(token.char);
  };
  bidi.registerModifier("glyphIndex", null, charToGlyphIndexMod);
  var features = options ? this.updateFeatures(options.features) : this.defaultRenderOptions.features;
  bidi.applyFeatures(this, features);
  var indexes = bidi.getTextGlyphs(s);
  var length = indexes.length;
  var glyphs = new Array(length);
  var notdef = this.glyphs.get(0);
  for (var i = 0; i < length; i += 1) {
    glyphs[i] = this.glyphs.get(indexes[i]) || notdef;
  }
  return glyphs;
};
Font.prototype.getKerningValue = function(leftGlyph, rightGlyph) {
  leftGlyph = leftGlyph.index || leftGlyph;
  rightGlyph = rightGlyph.index || rightGlyph;
  var gposKerning = this.position.defaultKerningTables;
  if (gposKerning) {
    return this.position.getKerningValue(gposKerning, leftGlyph, rightGlyph);
  }
  return this.kerningPairs[leftGlyph + "," + rightGlyph] || 0;
};
Font.prototype.defaultRenderOptions = {
  kerning: true,
  features: [
    { script: "arab", tags: ["init", "medi", "fina", "rlig"] },
    { script: "latn", tags: ["liga", "rlig"] }
  ]
};
Font.prototype.forEachGlyph = function(text, x, y, fontSize, options, callback) {
  x = x !== void 0 ? x : 0;
  y = y !== void 0 ? y : 0;
  fontSize = fontSize !== void 0 ? fontSize : 72;
  options = Object.assign({}, this.defaultRenderOptions, options);
  var fontScale = 1 / this.unitsPerEm * fontSize;
  var glyphs = this.stringToGlyphs(text, options);
  var kerningLookups;
  if (options.kerning) {
    var script = options.script || this.position.getDefaultScriptName();
    kerningLookups = this.position.getKerningTables(script, options.language);
  }
  for (var i = 0; i < glyphs.length; i += 1) {
    var glyph = glyphs[i];
    callback.call(this, glyph, x, y, fontSize, options);
    if (glyph.advanceWidth) {
      x += glyph.advanceWidth * fontScale;
    }
    if (options.kerning && i < glyphs.length - 1) {
      var kerningValue = kerningLookups ? this.position.getKerningValue(kerningLookups, glyph.index, glyphs[i + 1].index) : this.getKerningValue(glyph, glyphs[i + 1]);
      x += kerningValue * fontScale;
    }
    if (options.letterSpacing) {
      x += options.letterSpacing * fontSize;
    } else if (options.tracking) {
      x += options.tracking / 1e3 * fontSize;
    }
  }
  return x;
};
Font.prototype.getPath = function(text, x, y, fontSize, options) {
  var fullPath = new Path();
  this.forEachGlyph(text, x, y, fontSize, options, function(glyph, gX, gY, gFontSize) {
    var glyphPath = glyph.getPath(gX, gY, gFontSize, options, this);
    fullPath.extend(glyphPath);
  });
  return fullPath;
};
Font.prototype.getPaths = function(text, x, y, fontSize, options) {
  var glyphPaths = [];
  this.forEachGlyph(text, x, y, fontSize, options, function(glyph, gX, gY, gFontSize) {
    var glyphPath = glyph.getPath(gX, gY, gFontSize, options, this);
    glyphPaths.push(glyphPath);
  });
  return glyphPaths;
};
Font.prototype.getAdvanceWidth = function(text, fontSize, options) {
  return this.forEachGlyph(text, 0, 0, fontSize, options, function() {
  });
};
Font.prototype.fsSelectionValues = {
  ITALIC: 1,
  UNDERSCORE: 2,
  NEGATIVE: 4,
  OUTLINED: 8,
  STRIKEOUT: 16,
  BOLD: 32,
  REGULAR: 64,
  USER_TYPO_METRICS: 128,
  WWS: 256,
  OBLIQUE: 512
};
Font.prototype.usWidthClasses = {
  ULTRA_CONDENSED: 1,
  EXTRA_CONDENSED: 2,
  CONDENSED: 3,
  SEMI_CONDENSED: 4,
  MEDIUM: 5,
  SEMI_EXPANDED: 6,
  EXPANDED: 7,
  EXTRA_EXPANDED: 8,
  ULTRA_EXPANDED: 9
};
Font.prototype.usWeightClasses = {
  THIN: 100,
  EXTRA_LIGHT: 200,
  LIGHT: 300,
  NORMAL: 400,
  MEDIUM: 500,
  SEMI_BOLD: 600,
  BOLD: 700,
  EXTRA_BOLD: 800,
  BLACK: 900
};
function parseCmapTableFormat12(cmap2, p) {
  p.parseUShort();
  cmap2.length = p.parseULong();
  cmap2.language = p.parseULong();
  var groupCount;
  cmap2.groupCount = groupCount = p.parseULong();
  cmap2.glyphIndexMap = {};
  for (var i = 0; i < groupCount; i += 1) {
    var startCharCode = p.parseULong();
    var endCharCode = p.parseULong();
    var startGlyphId = p.parseULong();
    for (var c = startCharCode; c <= endCharCode; c += 1) {
      cmap2.glyphIndexMap[c] = startGlyphId;
      startGlyphId++;
    }
  }
}
function parseCmapTableFormat4(cmap2, p, data, start, offset) {
  cmap2.length = p.parseUShort();
  cmap2.language = p.parseUShort();
  var segCount;
  cmap2.segCount = segCount = p.parseUShort() >> 1;
  p.skip("uShort", 3);
  cmap2.glyphIndexMap = {};
  var endCountParser = new parse.Parser(data, start + offset + 14);
  var startCountParser = new parse.Parser(data, start + offset + 16 + segCount * 2);
  var idDeltaParser = new parse.Parser(data, start + offset + 16 + segCount * 4);
  var idRangeOffsetParser = new parse.Parser(data, start + offset + 16 + segCount * 6);
  var glyphIndexOffset = start + offset + 16 + segCount * 8;
  for (var i = 0; i < segCount - 1; i += 1) {
    var glyphIndex = void 0;
    var endCount = endCountParser.parseUShort();
    var startCount = startCountParser.parseUShort();
    var idDelta = idDeltaParser.parseShort();
    var idRangeOffset = idRangeOffsetParser.parseUShort();
    for (var c = startCount; c <= endCount; c += 1) {
      if (idRangeOffset !== 0) {
        glyphIndexOffset = idRangeOffsetParser.offset + idRangeOffsetParser.relativeOffset - 2;
        glyphIndexOffset += idRangeOffset;
        glyphIndexOffset += (c - startCount) * 2;
        glyphIndex = parse.getUShort(data, glyphIndexOffset);
        if (glyphIndex !== 0) {
          glyphIndex = glyphIndex + idDelta & 65535;
        }
      } else {
        glyphIndex = c + idDelta & 65535;
      }
      cmap2.glyphIndexMap[c] = glyphIndex;
    }
  }
}
function parseCmapTable(data, start) {
  var cmap2 = {};
  cmap2.version = parse.getUShort(data, start);
  check.argument(cmap2.version === 0, "cmap table version should be 0.");
  cmap2.numTables = parse.getUShort(data, start + 2);
  var offset = -1;
  for (var i = cmap2.numTables - 1; i >= 0; i -= 1) {
    var platformId = parse.getUShort(data, start + 4 + i * 8);
    var encodingId = parse.getUShort(data, start + 4 + i * 8 + 2);
    if (platformId === 3 && (encodingId === 0 || encodingId === 1 || encodingId === 10) || platformId === 0 && (encodingId === 0 || encodingId === 1 || encodingId === 2 || encodingId === 3 || encodingId === 4)) {
      offset = parse.getULong(data, start + 4 + i * 8 + 4);
      break;
    }
  }
  if (offset === -1) {
    throw new Error("No valid cmap sub-tables found.");
  }
  var p = new parse.Parser(data, start + offset);
  cmap2.format = p.parseUShort();
  if (cmap2.format === 12) {
    parseCmapTableFormat12(cmap2, p);
  } else if (cmap2.format === 4) {
    parseCmapTableFormat4(cmap2, p, data, start, offset);
  } else {
    throw new Error("Only format 4 and 12 cmap tables are supported (found format " + cmap2.format + ").");
  }
  return cmap2;
}
var cmap = { parse: parseCmapTable };
function calcCFFSubroutineBias(subrs) {
  var bias;
  if (subrs.length < 1240) {
    bias = 107;
  } else if (subrs.length < 33900) {
    bias = 1131;
  } else {
    bias = 32768;
  }
  return bias;
}
function parseCFFIndex(data, start, conversionFn) {
  var offsets = [];
  var objects = [];
  var count = parse.getCard16(data, start);
  var objectOffset;
  var endOffset;
  if (count !== 0) {
    var offsetSize = parse.getByte(data, start + 2);
    objectOffset = start + (count + 1) * offsetSize + 2;
    var pos = start + 3;
    for (var i = 0; i < count + 1; i += 1) {
      offsets.push(parse.getOffset(data, pos, offsetSize));
      pos += offsetSize;
    }
    endOffset = objectOffset + offsets[count];
  } else {
    endOffset = start + 2;
  }
  for (var i$1 = 0; i$1 < offsets.length - 1; i$1 += 1) {
    var value = parse.getBytes(data, objectOffset + offsets[i$1], objectOffset + offsets[i$1 + 1]);
    if (conversionFn) {
      value = conversionFn(value);
    }
    objects.push(value);
  }
  return { objects, startOffset: start, endOffset };
}
function parseCFFIndexLowMemory(data, start) {
  var offsets = [];
  var count = parse.getCard16(data, start);
  var objectOffset;
  var endOffset;
  if (count !== 0) {
    var offsetSize = parse.getByte(data, start + 2);
    objectOffset = start + (count + 1) * offsetSize + 2;
    var pos = start + 3;
    for (var i = 0; i < count + 1; i += 1) {
      offsets.push(parse.getOffset(data, pos, offsetSize));
      pos += offsetSize;
    }
    endOffset = objectOffset + offsets[count];
  } else {
    endOffset = start + 2;
  }
  return { offsets, startOffset: start, endOffset };
}
function getCffIndexObject(i, offsets, data, start, conversionFn) {
  var count = parse.getCard16(data, start);
  var objectOffset = 0;
  if (count !== 0) {
    var offsetSize = parse.getByte(data, start + 2);
    objectOffset = start + (count + 1) * offsetSize + 2;
  }
  var value = parse.getBytes(data, objectOffset + offsets[i], objectOffset + offsets[i + 1]);
  if (conversionFn) {
    value = conversionFn(value);
  }
  return value;
}
function parseFloatOperand(parser) {
  var s = "";
  var eof = 15;
  var lookup = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    ".",
    "E",
    "E-",
    null,
    "-"
  ];
  while (true) {
    var b = parser.parseByte();
    var n1 = b >> 4;
    var n2 = b & 15;
    if (n1 === eof) {
      break;
    }
    s += lookup[n1];
    if (n2 === eof) {
      break;
    }
    s += lookup[n2];
  }
  return parseFloat(s);
}
function parseOperand(parser, b0) {
  var b1;
  var b2;
  var b3;
  var b4;
  if (b0 === 28) {
    b1 = parser.parseByte();
    b2 = parser.parseByte();
    return b1 << 8 | b2;
  }
  if (b0 === 29) {
    b1 = parser.parseByte();
    b2 = parser.parseByte();
    b3 = parser.parseByte();
    b4 = parser.parseByte();
    return b1 << 24 | b2 << 16 | b3 << 8 | b4;
  }
  if (b0 === 30) {
    return parseFloatOperand(parser);
  }
  if (b0 >= 32 && b0 <= 246) {
    return b0 - 139;
  }
  if (b0 >= 247 && b0 <= 250) {
    b1 = parser.parseByte();
    return (b0 - 247) * 256 + b1 + 108;
  }
  if (b0 >= 251 && b0 <= 254) {
    b1 = parser.parseByte();
    return -(b0 - 251) * 256 - b1 - 108;
  }
  throw new Error("Invalid b0 " + b0);
}
function entriesToObject(entries) {
  var o = {};
  for (var i = 0; i < entries.length; i += 1) {
    var key = entries[i][0];
    var values = entries[i][1];
    var value = void 0;
    if (values.length === 1) {
      value = values[0];
    } else {
      value = values;
    }
    if (o.hasOwnProperty(key) && !isNaN(o[key])) {
      throw new Error("Object " + o + " already has key " + key);
    }
    o[key] = value;
  }
  return o;
}
function parseCFFDict(data, start, size) {
  start = start !== void 0 ? start : 0;
  var parser = new parse.Parser(data, start);
  var entries = [];
  var operands = [];
  size = size !== void 0 ? size : data.length;
  while (parser.relativeOffset < size) {
    var op = parser.parseByte();
    if (op <= 21) {
      if (op === 12) {
        op = 1200 + parser.parseByte();
      }
      entries.push([op, operands]);
      operands = [];
    } else {
      operands.push(parseOperand(parser, op));
    }
  }
  return entriesToObject(entries);
}
function getCFFString(strings, index) {
  if (index <= 390) {
    index = cffStandardStrings[index];
  } else {
    index = strings[index - 391];
  }
  return index;
}
function interpretDict(dict, meta2, strings) {
  var newDict = {};
  var value;
  for (var i = 0; i < meta2.length; i += 1) {
    var m = meta2[i];
    if (Array.isArray(m.type)) {
      var values = [];
      values.length = m.type.length;
      for (var j = 0; j < m.type.length; j++) {
        value = dict[m.op] !== void 0 ? dict[m.op][j] : void 0;
        if (value === void 0) {
          value = m.value !== void 0 && m.value[j] !== void 0 ? m.value[j] : null;
        }
        if (m.type[j] === "SID") {
          value = getCFFString(strings, value);
        }
        values[j] = value;
      }
      newDict[m.name] = values;
    } else {
      value = dict[m.op];
      if (value === void 0) {
        value = m.value !== void 0 ? m.value : null;
      }
      if (m.type === "SID") {
        value = getCFFString(strings, value);
      }
      newDict[m.name] = value;
    }
  }
  return newDict;
}
function parseCFFHeader(data, start) {
  var header = {};
  header.formatMajor = parse.getCard8(data, start);
  header.formatMinor = parse.getCard8(data, start + 1);
  header.size = parse.getCard8(data, start + 2);
  header.offsetSize = parse.getCard8(data, start + 3);
  header.startOffset = start;
  header.endOffset = start + 4;
  return header;
}
var TOP_DICT_META = [
  { name: "version", op: 0, type: "SID" },
  { name: "notice", op: 1, type: "SID" },
  { name: "copyright", op: 1200, type: "SID" },
  { name: "fullName", op: 2, type: "SID" },
  { name: "familyName", op: 3, type: "SID" },
  { name: "weight", op: 4, type: "SID" },
  { name: "isFixedPitch", op: 1201, type: "number", value: 0 },
  { name: "italicAngle", op: 1202, type: "number", value: 0 },
  { name: "underlinePosition", op: 1203, type: "number", value: -100 },
  { name: "underlineThickness", op: 1204, type: "number", value: 50 },
  { name: "paintType", op: 1205, type: "number", value: 0 },
  { name: "charstringType", op: 1206, type: "number", value: 2 },
  {
    name: "fontMatrix",
    op: 1207,
    type: ["real", "real", "real", "real", "real", "real"],
    value: [1e-3, 0, 0, 1e-3, 0, 0]
  },
  { name: "uniqueId", op: 13, type: "number" },
  {
    name: "fontBBox",
    op: 5,
    type: ["number", "number", "number", "number"],
    value: [0, 0, 0, 0]
  },
  { name: "strokeWidth", op: 1208, type: "number", value: 0 },
  { name: "xuid", op: 14, type: [], value: null },
  { name: "charset", op: 15, type: "offset", value: 0 },
  { name: "encoding", op: 16, type: "offset", value: 0 },
  { name: "charStrings", op: 17, type: "offset", value: 0 },
  { name: "private", op: 18, type: ["number", "offset"], value: [0, 0] },
  { name: "ros", op: 1230, type: ["SID", "SID", "number"] },
  { name: "cidFontVersion", op: 1231, type: "number", value: 0 },
  { name: "cidFontRevision", op: 1232, type: "number", value: 0 },
  { name: "cidFontType", op: 1233, type: "number", value: 0 },
  { name: "cidCount", op: 1234, type: "number", value: 8720 },
  { name: "uidBase", op: 1235, type: "number" },
  { name: "fdArray", op: 1236, type: "offset" },
  { name: "fdSelect", op: 1237, type: "offset" },
  { name: "fontName", op: 1238, type: "SID" }
];
var PRIVATE_DICT_META = [
  { name: "subrs", op: 19, type: "offset", value: 0 },
  { name: "defaultWidthX", op: 20, type: "number", value: 0 },
  { name: "nominalWidthX", op: 21, type: "number", value: 0 }
];
function parseCFFTopDict(data, strings) {
  var dict = parseCFFDict(data, 0, data.byteLength);
  return interpretDict(dict, TOP_DICT_META, strings);
}
function parseCFFPrivateDict(data, start, size, strings) {
  var dict = parseCFFDict(data, start, size);
  return interpretDict(dict, PRIVATE_DICT_META, strings);
}
function gatherCFFTopDicts(data, start, cffIndex, strings) {
  var topDictArray = [];
  for (var iTopDict = 0; iTopDict < cffIndex.length; iTopDict += 1) {
    var topDictData = new DataView(new Uint8Array(cffIndex[iTopDict]).buffer);
    var topDict = parseCFFTopDict(topDictData, strings);
    topDict._subrs = [];
    topDict._subrsBias = 0;
    topDict._defaultWidthX = 0;
    topDict._nominalWidthX = 0;
    var privateSize = topDict.private[0];
    var privateOffset = topDict.private[1];
    if (privateSize !== 0 && privateOffset !== 0) {
      var privateDict = parseCFFPrivateDict(data, privateOffset + start, privateSize, strings);
      topDict._defaultWidthX = privateDict.defaultWidthX;
      topDict._nominalWidthX = privateDict.nominalWidthX;
      if (privateDict.subrs !== 0) {
        var subrOffset = privateOffset + privateDict.subrs;
        var subrIndex = parseCFFIndex(data, subrOffset + start);
        topDict._subrs = subrIndex.objects;
        topDict._subrsBias = calcCFFSubroutineBias(topDict._subrs);
      }
      topDict._privateDict = privateDict;
    }
    topDictArray.push(topDict);
  }
  return topDictArray;
}
function parseCFFCharset(data, start, nGlyphs, strings) {
  var sid;
  var count;
  var parser = new parse.Parser(data, start);
  nGlyphs -= 1;
  var charset = [".notdef"];
  var format = parser.parseCard8();
  if (format === 0) {
    for (var i = 0; i < nGlyphs; i += 1) {
      sid = parser.parseSID();
      charset.push(getCFFString(strings, sid));
    }
  } else if (format === 1) {
    while (charset.length <= nGlyphs) {
      sid = parser.parseSID();
      count = parser.parseCard8();
      for (var i$1 = 0; i$1 <= count; i$1 += 1) {
        charset.push(getCFFString(strings, sid));
        sid += 1;
      }
    }
  } else if (format === 2) {
    while (charset.length <= nGlyphs) {
      sid = parser.parseSID();
      count = parser.parseCard16();
      for (var i$2 = 0; i$2 <= count; i$2 += 1) {
        charset.push(getCFFString(strings, sid));
        sid += 1;
      }
    }
  } else {
    throw new Error("Unknown charset format " + format);
  }
  return charset;
}
function parseCFFEncoding(data, start, charset) {
  var code;
  var enc = {};
  var parser = new parse.Parser(data, start);
  var format = parser.parseCard8();
  if (format === 0) {
    var nCodes = parser.parseCard8();
    for (var i = 0; i < nCodes; i += 1) {
      code = parser.parseCard8();
      enc[code] = i;
    }
  } else if (format === 1) {
    var nRanges = parser.parseCard8();
    code = 1;
    for (var i$1 = 0; i$1 < nRanges; i$1 += 1) {
      var first = parser.parseCard8();
      var nLeft = parser.parseCard8();
      for (var j = first; j <= first + nLeft; j += 1) {
        enc[j] = code;
        code += 1;
      }
    }
  } else {
    throw new Error("Unknown encoding format " + format);
  }
  return new CffEncoding(enc, charset);
}
function parseCFFCharstring(font, glyph, code) {
  var c1x;
  var c1y;
  var c2x;
  var c2y;
  var p = new Path();
  var stack = [];
  var nStems = 0;
  var haveWidth = false;
  var open = false;
  var x = 0;
  var y = 0;
  var subrs;
  var subrsBias;
  var defaultWidthX;
  var nominalWidthX;
  if (font.isCIDFont) {
    var fdIndex = font.tables.cff.topDict._fdSelect[glyph.index];
    var fdDict = font.tables.cff.topDict._fdArray[fdIndex];
    subrs = fdDict._subrs;
    subrsBias = fdDict._subrsBias;
    defaultWidthX = fdDict._defaultWidthX;
    nominalWidthX = fdDict._nominalWidthX;
  } else {
    subrs = font.tables.cff.topDict._subrs;
    subrsBias = font.tables.cff.topDict._subrsBias;
    defaultWidthX = font.tables.cff.topDict._defaultWidthX;
    nominalWidthX = font.tables.cff.topDict._nominalWidthX;
  }
  var width = defaultWidthX;
  function newContour(x2, y2) {
    if (open) {
      p.closePath();
    }
    p.moveTo(x2, y2);
    open = true;
  }
  function parseStems() {
    var hasWidthArg;
    hasWidthArg = stack.length % 2 !== 0;
    if (hasWidthArg && !haveWidth) {
      width = stack.shift() + nominalWidthX;
    }
    nStems += stack.length >> 1;
    stack.length = 0;
    haveWidth = true;
  }
  function parse2(code2) {
    var b1;
    var b2;
    var b3;
    var b4;
    var codeIndex;
    var subrCode;
    var jpx;
    var jpy;
    var c3x;
    var c3y;
    var c4x;
    var c4y;
    var i = 0;
    while (i < code2.length) {
      var v = code2[i];
      i += 1;
      switch (v) {
        case 1:
          parseStems();
          break;
        case 3:
          parseStems();
          break;
        case 4:
          if (stack.length > 1 && !haveWidth) {
            width = stack.shift() + nominalWidthX;
            haveWidth = true;
          }
          y += stack.pop();
          newContour(x, y);
          break;
        case 5:
          while (stack.length > 0) {
            x += stack.shift();
            y += stack.shift();
            p.lineTo(x, y);
          }
          break;
        case 6:
          while (stack.length > 0) {
            x += stack.shift();
            p.lineTo(x, y);
            if (stack.length === 0) {
              break;
            }
            y += stack.shift();
            p.lineTo(x, y);
          }
          break;
        case 7:
          while (stack.length > 0) {
            y += stack.shift();
            p.lineTo(x, y);
            if (stack.length === 0) {
              break;
            }
            x += stack.shift();
            p.lineTo(x, y);
          }
          break;
        case 8:
          while (stack.length > 0) {
            c1x = x + stack.shift();
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x = c2x + stack.shift();
            y = c2y + stack.shift();
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
          }
          break;
        case 10:
          codeIndex = stack.pop() + subrsBias;
          subrCode = subrs[codeIndex];
          if (subrCode) {
            parse2(subrCode);
          }
          break;
        case 11:
          return;
        case 12:
          v = code2[i];
          i += 1;
          switch (v) {
            case 35:
              c1x = x + stack.shift();
              c1y = y + stack.shift();
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y + stack.shift();
              c3x = jpx + stack.shift();
              c3y = jpy + stack.shift();
              c4x = c3x + stack.shift();
              c4y = c3y + stack.shift();
              x = c4x + stack.shift();
              y = c4y + stack.shift();
              stack.shift();
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x, y);
              break;
            case 34:
              c1x = x + stack.shift();
              c1y = y;
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y;
              c3x = jpx + stack.shift();
              c3y = c2y;
              c4x = c3x + stack.shift();
              c4y = y;
              x = c4x + stack.shift();
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x, y);
              break;
            case 36:
              c1x = x + stack.shift();
              c1y = y + stack.shift();
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y;
              c3x = jpx + stack.shift();
              c3y = c2y;
              c4x = c3x + stack.shift();
              c4y = c3y + stack.shift();
              x = c4x + stack.shift();
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x, y);
              break;
            case 37:
              c1x = x + stack.shift();
              c1y = y + stack.shift();
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y + stack.shift();
              c3x = jpx + stack.shift();
              c3y = jpy + stack.shift();
              c4x = c3x + stack.shift();
              c4y = c3y + stack.shift();
              if (Math.abs(c4x - x) > Math.abs(c4y - y)) {
                x = c4x + stack.shift();
              } else {
                y = c4y + stack.shift();
              }
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x, y);
              break;
            default:
              console.log("Glyph " + glyph.index + ": unknown operator " + 1200 + v);
              stack.length = 0;
          }
          break;
        case 14:
          if (stack.length > 0 && !haveWidth) {
            width = stack.shift() + nominalWidthX;
            haveWidth = true;
          }
          if (open) {
            p.closePath();
            open = false;
          }
          break;
        case 18:
          parseStems();
          break;
        case 19:
        case 20:
          parseStems();
          i += nStems + 7 >> 3;
          break;
        case 21:
          if (stack.length > 2 && !haveWidth) {
            width = stack.shift() + nominalWidthX;
            haveWidth = true;
          }
          y += stack.pop();
          x += stack.pop();
          newContour(x, y);
          break;
        case 22:
          if (stack.length > 1 && !haveWidth) {
            width = stack.shift() + nominalWidthX;
            haveWidth = true;
          }
          x += stack.pop();
          newContour(x, y);
          break;
        case 23:
          parseStems();
          break;
        case 24:
          while (stack.length > 2) {
            c1x = x + stack.shift();
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x = c2x + stack.shift();
            y = c2y + stack.shift();
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
          }
          x += stack.shift();
          y += stack.shift();
          p.lineTo(x, y);
          break;
        case 25:
          while (stack.length > 6) {
            x += stack.shift();
            y += stack.shift();
            p.lineTo(x, y);
          }
          c1x = x + stack.shift();
          c1y = y + stack.shift();
          c2x = c1x + stack.shift();
          c2y = c1y + stack.shift();
          x = c2x + stack.shift();
          y = c2y + stack.shift();
          p.curveTo(c1x, c1y, c2x, c2y, x, y);
          break;
        case 26:
          if (stack.length % 2) {
            x += stack.shift();
          }
          while (stack.length > 0) {
            c1x = x;
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x = c2x;
            y = c2y + stack.shift();
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
          }
          break;
        case 27:
          if (stack.length % 2) {
            y += stack.shift();
          }
          while (stack.length > 0) {
            c1x = x + stack.shift();
            c1y = y;
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x = c2x + stack.shift();
            y = c2y;
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
          }
          break;
        case 28:
          b1 = code2[i];
          b2 = code2[i + 1];
          stack.push((b1 << 24 | b2 << 16) >> 16);
          i += 2;
          break;
        case 29:
          codeIndex = stack.pop() + font.gsubrsBias;
          subrCode = font.gsubrs[codeIndex];
          if (subrCode) {
            parse2(subrCode);
          }
          break;
        case 30:
          while (stack.length > 0) {
            c1x = x;
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x = c2x + stack.shift();
            y = c2y + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
            if (stack.length === 0) {
              break;
            }
            c1x = x + stack.shift();
            c1y = y;
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            y = c2y + stack.shift();
            x = c2x + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
          }
          break;
        case 31:
          while (stack.length > 0) {
            c1x = x + stack.shift();
            c1y = y;
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            y = c2y + stack.shift();
            x = c2x + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
            if (stack.length === 0) {
              break;
            }
            c1x = x;
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x = c2x + stack.shift();
            y = c2y + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x, y);
          }
          break;
        default:
          if (v < 32) {
            console.log("Glyph " + glyph.index + ": unknown operator " + v);
          } else if (v < 247) {
            stack.push(v - 139);
          } else if (v < 251) {
            b1 = code2[i];
            i += 1;
            stack.push((v - 247) * 256 + b1 + 108);
          } else if (v < 255) {
            b1 = code2[i];
            i += 1;
            stack.push(-(v - 251) * 256 - b1 - 108);
          } else {
            b1 = code2[i];
            b2 = code2[i + 1];
            b3 = code2[i + 2];
            b4 = code2[i + 3];
            i += 4;
            stack.push((b1 << 24 | b2 << 16 | b3 << 8 | b4) / 65536);
          }
      }
    }
  }
  parse2(code);
  glyph.advanceWidth = width;
  return p;
}
function parseCFFFDSelect(data, start, nGlyphs, fdArrayCount) {
  var fdSelect = [];
  var fdIndex;
  var parser = new parse.Parser(data, start);
  var format = parser.parseCard8();
  if (format === 0) {
    for (var iGid = 0; iGid < nGlyphs; iGid++) {
      fdIndex = parser.parseCard8();
      if (fdIndex >= fdArrayCount) {
        throw new Error("CFF table CID Font FDSelect has bad FD index value " + fdIndex + " (FD count " + fdArrayCount + ")");
      }
      fdSelect.push(fdIndex);
    }
  } else if (format === 3) {
    var nRanges = parser.parseCard16();
    var first = parser.parseCard16();
    if (first !== 0) {
      throw new Error("CFF Table CID Font FDSelect format 3 range has bad initial GID " + first);
    }
    var next;
    for (var iRange = 0; iRange < nRanges; iRange++) {
      fdIndex = parser.parseCard8();
      next = parser.parseCard16();
      if (fdIndex >= fdArrayCount) {
        throw new Error("CFF table CID Font FDSelect has bad FD index value " + fdIndex + " (FD count " + fdArrayCount + ")");
      }
      if (next > nGlyphs) {
        throw new Error("CFF Table CID Font FDSelect format 3 range has bad GID " + next);
      }
      for (; first < next; first++) {
        fdSelect.push(fdIndex);
      }
      first = next;
    }
    if (next !== nGlyphs) {
      throw new Error("CFF Table CID Font FDSelect format 3 range has bad final GID " + next);
    }
  } else {
    throw new Error("CFF Table CID Font FDSelect table has unsupported format " + format);
  }
  return fdSelect;
}
function parseCFFTable(data, start, font, opt) {
  font.tables.cff = {};
  var header = parseCFFHeader(data, start);
  var nameIndex = parseCFFIndex(data, header.endOffset, parse.bytesToString);
  var topDictIndex = parseCFFIndex(data, nameIndex.endOffset);
  var stringIndex = parseCFFIndex(data, topDictIndex.endOffset, parse.bytesToString);
  var globalSubrIndex = parseCFFIndex(data, stringIndex.endOffset);
  font.gsubrs = globalSubrIndex.objects;
  font.gsubrsBias = calcCFFSubroutineBias(font.gsubrs);
  var topDictArray = gatherCFFTopDicts(data, start, topDictIndex.objects, stringIndex.objects);
  if (topDictArray.length !== 1) {
    throw new Error("CFF table has too many fonts in 'FontSet' - count of fonts NameIndex.length = " + topDictArray.length);
  }
  var topDict = topDictArray[0];
  font.tables.cff.topDict = topDict;
  if (topDict._privateDict) {
    font.defaultWidthX = topDict._privateDict.defaultWidthX;
    font.nominalWidthX = topDict._privateDict.nominalWidthX;
  }
  if (topDict.ros[0] !== void 0 && topDict.ros[1] !== void 0) {
    font.isCIDFont = true;
  }
  if (font.isCIDFont) {
    var fdArrayOffset = topDict.fdArray;
    var fdSelectOffset = topDict.fdSelect;
    if (fdArrayOffset === 0 || fdSelectOffset === 0) {
      throw new Error("Font is marked as a CID font, but FDArray and/or FDSelect information is missing");
    }
    fdArrayOffset += start;
    var fdArrayIndex = parseCFFIndex(data, fdArrayOffset);
    var fdArray = gatherCFFTopDicts(data, start, fdArrayIndex.objects, stringIndex.objects);
    topDict._fdArray = fdArray;
    fdSelectOffset += start;
    topDict._fdSelect = parseCFFFDSelect(data, fdSelectOffset, font.numGlyphs, fdArray.length);
  }
  var privateDictOffset = start + topDict.private[1];
  var privateDict = parseCFFPrivateDict(data, privateDictOffset, topDict.private[0], stringIndex.objects);
  font.defaultWidthX = privateDict.defaultWidthX;
  font.nominalWidthX = privateDict.nominalWidthX;
  if (privateDict.subrs !== 0) {
    var subrOffset = privateDictOffset + privateDict.subrs;
    var subrIndex = parseCFFIndex(data, subrOffset);
    font.subrs = subrIndex.objects;
    font.subrsBias = calcCFFSubroutineBias(font.subrs);
  } else {
    font.subrs = [];
    font.subrsBias = 0;
  }
  var charStringsIndex;
  if (opt.lowMemory) {
    charStringsIndex = parseCFFIndexLowMemory(data, start + topDict.charStrings);
    font.nGlyphs = charStringsIndex.offsets.length;
  } else {
    charStringsIndex = parseCFFIndex(data, start + topDict.charStrings);
    font.nGlyphs = charStringsIndex.objects.length;
  }
  var charset = parseCFFCharset(data, start + topDict.charset, font.nGlyphs, stringIndex.objects);
  if (topDict.encoding === 0) {
    font.cffEncoding = new CffEncoding(cffStandardEncoding, charset);
  } else if (topDict.encoding === 1) {
    font.cffEncoding = new CffEncoding(cffExpertEncoding, charset);
  } else {
    font.cffEncoding = parseCFFEncoding(data, start + topDict.encoding, charset);
  }
  font.encoding = font.encoding || font.cffEncoding;
  font.glyphs = new glyphset.GlyphSet(font);
  if (opt.lowMemory) {
    font._push = function(i2) {
      var charString2 = getCffIndexObject(i2, charStringsIndex.offsets, data, start + topDict.charStrings);
      font.glyphs.push(i2, glyphset.cffGlyphLoader(font, i2, parseCFFCharstring, charString2));
    };
  } else {
    for (var i = 0; i < font.nGlyphs; i += 1) {
      var charString = charStringsIndex.objects[i];
      font.glyphs.push(i, glyphset.cffGlyphLoader(font, i, parseCFFCharstring, charString));
    }
  }
}
var cff = { parse: parseCFFTable };
function parseFvarAxis(data, start, names) {
  var axis = {};
  var p = new parse.Parser(data, start);
  axis.tag = p.parseTag();
  axis.minValue = p.parseFixed();
  axis.defaultValue = p.parseFixed();
  axis.maxValue = p.parseFixed();
  p.skip("uShort", 1);
  axis.name = names[p.parseUShort()] || {};
  return axis;
}
function parseFvarInstance(data, start, axes, names) {
  var inst = {};
  var p = new parse.Parser(data, start);
  inst.name = names[p.parseUShort()] || {};
  p.skip("uShort", 1);
  inst.coordinates = {};
  for (var i = 0; i < axes.length; ++i) {
    inst.coordinates[axes[i].tag] = p.parseFixed();
  }
  return inst;
}
function parseFvarTable(data, start, names) {
  var p = new parse.Parser(data, start);
  var tableVersion = p.parseULong();
  check.argument(tableVersion === 65536, "Unsupported fvar table version.");
  var offsetToData = p.parseOffset16();
  p.skip("uShort", 1);
  var axisCount = p.parseUShort();
  var axisSize = p.parseUShort();
  var instanceCount = p.parseUShort();
  var instanceSize = p.parseUShort();
  var axes = [];
  for (var i = 0; i < axisCount; i++) {
    axes.push(parseFvarAxis(data, start + offsetToData + i * axisSize, names));
  }
  var instances = [];
  var instanceStart = start + offsetToData + axisCount * axisSize;
  for (var j = 0; j < instanceCount; j++) {
    instances.push(parseFvarInstance(data, instanceStart + j * instanceSize, axes, names));
  }
  return { axes, instances };
}
var fvar = { parse: parseFvarTable };
var attachList = function() {
  return {
    coverage: this.parsePointer(Parser.coverage),
    attachPoints: this.parseList(Parser.pointer(Parser.uShortList))
  };
};
var caretValue = function() {
  var format = this.parseUShort();
  check.argument(format === 1 || format === 2 || format === 3, "Unsupported CaretValue table version.");
  if (format === 1) {
    return { coordinate: this.parseShort() };
  } else if (format === 2) {
    return { pointindex: this.parseShort() };
  } else if (format === 3) {
    return { coordinate: this.parseShort() };
  }
};
var ligGlyph = function() {
  return this.parseList(Parser.pointer(caretValue));
};
var ligCaretList = function() {
  return {
    coverage: this.parsePointer(Parser.coverage),
    ligGlyphs: this.parseList(Parser.pointer(ligGlyph))
  };
};
var markGlyphSets = function() {
  this.parseUShort();
  return this.parseList(Parser.pointer(Parser.coverage));
};
function parseGDEFTable(data, start) {
  start = start || 0;
  var p = new Parser(data, start);
  var tableVersion = p.parseVersion(1);
  check.argument(tableVersion === 1 || tableVersion === 1.2 || tableVersion === 1.3, "Unsupported GDEF table version.");
  var gdef2 = {
    version: tableVersion,
    classDef: p.parsePointer(Parser.classDef),
    attachList: p.parsePointer(attachList),
    ligCaretList: p.parsePointer(ligCaretList),
    markAttachClassDef: p.parsePointer(Parser.classDef)
  };
  if (tableVersion >= 1.2) {
    gdef2.markGlyphSets = p.parsePointer(markGlyphSets);
  }
  return gdef2;
}
var gdef = { parse: parseGDEFTable };
var subtableParsers = new Array(10);
subtableParsers[1] = function parseLookup1() {
  var start = this.offset + this.relativeOffset;
  var posformat = this.parseUShort();
  if (posformat === 1) {
    return {
      posFormat: 1,
      coverage: this.parsePointer(Parser.coverage),
      value: this.parseValueRecord()
    };
  } else if (posformat === 2) {
    return {
      posFormat: 2,
      coverage: this.parsePointer(Parser.coverage),
      values: this.parseValueRecordList()
    };
  }
  check.assert(false, "0x" + start.toString(16) + ": GPOS lookup type 1 format must be 1 or 2.");
};
subtableParsers[2] = function parseLookup2() {
  var start = this.offset + this.relativeOffset;
  var posFormat = this.parseUShort();
  check.assert(posFormat === 1 || posFormat === 2, "0x" + start.toString(16) + ": GPOS lookup type 2 format must be 1 or 2.");
  var coverage = this.parsePointer(Parser.coverage);
  var valueFormat1 = this.parseUShort();
  var valueFormat2 = this.parseUShort();
  if (posFormat === 1) {
    return {
      posFormat,
      coverage,
      valueFormat1,
      valueFormat2,
      pairSets: this.parseList(Parser.pointer(Parser.list(function() {
        return {
          secondGlyph: this.parseUShort(),
          value1: this.parseValueRecord(valueFormat1),
          value2: this.parseValueRecord(valueFormat2)
        };
      })))
    };
  } else if (posFormat === 2) {
    var classDef1 = this.parsePointer(Parser.classDef);
    var classDef2 = this.parsePointer(Parser.classDef);
    var class1Count = this.parseUShort();
    var class2Count = this.parseUShort();
    return {
      posFormat,
      coverage,
      valueFormat1,
      valueFormat2,
      classDef1,
      classDef2,
      class1Count,
      class2Count,
      classRecords: this.parseList(class1Count, Parser.list(class2Count, function() {
        return {
          value1: this.parseValueRecord(valueFormat1),
          value2: this.parseValueRecord(valueFormat2)
        };
      }))
    };
  }
};
subtableParsers[3] = function parseLookup3() {
  return { error: "GPOS Lookup 3 not supported" };
};
subtableParsers[4] = function parseLookup4() {
  return { error: "GPOS Lookup 4 not supported" };
};
subtableParsers[5] = function parseLookup5() {
  return { error: "GPOS Lookup 5 not supported" };
};
subtableParsers[6] = function parseLookup6() {
  return { error: "GPOS Lookup 6 not supported" };
};
subtableParsers[7] = function parseLookup7() {
  return { error: "GPOS Lookup 7 not supported" };
};
subtableParsers[8] = function parseLookup8() {
  return { error: "GPOS Lookup 8 not supported" };
};
subtableParsers[9] = function parseLookup9() {
  return { error: "GPOS Lookup 9 not supported" };
};
function parseGposTable(data, start) {
  start = start || 0;
  var p = new Parser(data, start);
  var tableVersion = p.parseVersion(1);
  check.argument(tableVersion === 1 || tableVersion === 1.1, "Unsupported GPOS table version " + tableVersion);
  if (tableVersion === 1) {
    return {
      version: tableVersion,
      scripts: p.parseScriptList(),
      features: p.parseFeatureList(),
      lookups: p.parseLookupList(subtableParsers)
    };
  } else {
    return {
      version: tableVersion,
      scripts: p.parseScriptList(),
      features: p.parseFeatureList(),
      lookups: p.parseLookupList(subtableParsers),
      variations: p.parseFeatureVariationsList()
    };
  }
}
var gpos = { parse: parseGposTable };
var subtableParsers$1 = new Array(9);
subtableParsers$1[1] = function parseLookup12() {
  var start = this.offset + this.relativeOffset;
  var substFormat = this.parseUShort();
  if (substFormat === 1) {
    return {
      substFormat: 1,
      coverage: this.parsePointer(Parser.coverage),
      deltaGlyphId: this.parseUShort()
    };
  } else if (substFormat === 2) {
    return {
      substFormat: 2,
      coverage: this.parsePointer(Parser.coverage),
      substitute: this.parseOffset16List()
    };
  }
  check.assert(false, "0x" + start.toString(16) + ": lookup type 1 format must be 1 or 2.");
};
subtableParsers$1[2] = function parseLookup22() {
  var substFormat = this.parseUShort();
  check.argument(substFormat === 1, "GSUB Multiple Substitution Subtable identifier-format must be 1");
  return {
    substFormat,
    coverage: this.parsePointer(Parser.coverage),
    sequences: this.parseListOfLists()
  };
};
subtableParsers$1[3] = function parseLookup32() {
  var substFormat = this.parseUShort();
  check.argument(substFormat === 1, "GSUB Alternate Substitution Subtable identifier-format must be 1");
  return {
    substFormat,
    coverage: this.parsePointer(Parser.coverage),
    alternateSets: this.parseListOfLists()
  };
};
subtableParsers$1[4] = function parseLookup42() {
  var substFormat = this.parseUShort();
  check.argument(substFormat === 1, "GSUB ligature table identifier-format must be 1");
  return {
    substFormat,
    coverage: this.parsePointer(Parser.coverage),
    ligatureSets: this.parseListOfLists(function() {
      return {
        ligGlyph: this.parseUShort(),
        components: this.parseUShortList(this.parseUShort() - 1)
      };
    })
  };
};
var lookupRecordDesc = {
  sequenceIndex: Parser.uShort,
  lookupListIndex: Parser.uShort
};
subtableParsers$1[5] = function parseLookup52() {
  var start = this.offset + this.relativeOffset;
  var substFormat = this.parseUShort();
  if (substFormat === 1) {
    return {
      substFormat,
      coverage: this.parsePointer(Parser.coverage),
      ruleSets: this.parseListOfLists(function() {
        var glyphCount2 = this.parseUShort();
        var substCount2 = this.parseUShort();
        return {
          input: this.parseUShortList(glyphCount2 - 1),
          lookupRecords: this.parseRecordList(substCount2, lookupRecordDesc)
        };
      })
    };
  } else if (substFormat === 2) {
    return {
      substFormat,
      coverage: this.parsePointer(Parser.coverage),
      classDef: this.parsePointer(Parser.classDef),
      classSets: this.parseListOfLists(function() {
        var glyphCount2 = this.parseUShort();
        var substCount2 = this.parseUShort();
        return {
          classes: this.parseUShortList(glyphCount2 - 1),
          lookupRecords: this.parseRecordList(substCount2, lookupRecordDesc)
        };
      })
    };
  } else if (substFormat === 3) {
    var glyphCount = this.parseUShort();
    var substCount = this.parseUShort();
    return {
      substFormat,
      coverages: this.parseList(glyphCount, Parser.pointer(Parser.coverage)),
      lookupRecords: this.parseRecordList(substCount, lookupRecordDesc)
    };
  }
  check.assert(false, "0x" + start.toString(16) + ": lookup type 5 format must be 1, 2 or 3.");
};
subtableParsers$1[6] = function parseLookup62() {
  var start = this.offset + this.relativeOffset;
  var substFormat = this.parseUShort();
  if (substFormat === 1) {
    return {
      substFormat: 1,
      coverage: this.parsePointer(Parser.coverage),
      chainRuleSets: this.parseListOfLists(function() {
        return {
          backtrack: this.parseUShortList(),
          input: this.parseUShortList(this.parseShort() - 1),
          lookahead: this.parseUShortList(),
          lookupRecords: this.parseRecordList(lookupRecordDesc)
        };
      })
    };
  } else if (substFormat === 2) {
    return {
      substFormat: 2,
      coverage: this.parsePointer(Parser.coverage),
      backtrackClassDef: this.parsePointer(Parser.classDef),
      inputClassDef: this.parsePointer(Parser.classDef),
      lookaheadClassDef: this.parsePointer(Parser.classDef),
      chainClassSet: this.parseListOfLists(function() {
        return {
          backtrack: this.parseUShortList(),
          input: this.parseUShortList(this.parseShort() - 1),
          lookahead: this.parseUShortList(),
          lookupRecords: this.parseRecordList(lookupRecordDesc)
        };
      })
    };
  } else if (substFormat === 3) {
    return {
      substFormat: 3,
      backtrackCoverage: this.parseList(Parser.pointer(Parser.coverage)),
      inputCoverage: this.parseList(Parser.pointer(Parser.coverage)),
      lookaheadCoverage: this.parseList(Parser.pointer(Parser.coverage)),
      lookupRecords: this.parseRecordList(lookupRecordDesc)
    };
  }
  check.assert(false, "0x" + start.toString(16) + ": lookup type 6 format must be 1, 2 or 3.");
};
subtableParsers$1[7] = function parseLookup72() {
  var substFormat = this.parseUShort();
  check.argument(substFormat === 1, "GSUB Extension Substitution subtable identifier-format must be 1");
  var extensionLookupType = this.parseUShort();
  var extensionParser = new Parser(this.data, this.offset + this.parseULong());
  return {
    substFormat: 1,
    lookupType: extensionLookupType,
    extension: subtableParsers$1[extensionLookupType].call(extensionParser)
  };
};
subtableParsers$1[8] = function parseLookup82() {
  var substFormat = this.parseUShort();
  check.argument(substFormat === 1, "GSUB Reverse Chaining Contextual Single Substitution Subtable identifier-format must be 1");
  return {
    substFormat,
    coverage: this.parsePointer(Parser.coverage),
    backtrackCoverage: this.parseList(Parser.pointer(Parser.coverage)),
    lookaheadCoverage: this.parseList(Parser.pointer(Parser.coverage)),
    substitutes: this.parseUShortList()
  };
};
function parseGsubTable(data, start) {
  start = start || 0;
  var p = new Parser(data, start);
  var tableVersion = p.parseVersion(1);
  check.argument(tableVersion === 1 || tableVersion === 1.1, "Unsupported GSUB table version.");
  if (tableVersion === 1) {
    return {
      version: tableVersion,
      scripts: p.parseScriptList(),
      features: p.parseFeatureList(),
      lookups: p.parseLookupList(subtableParsers$1)
    };
  } else {
    return {
      version: tableVersion,
      scripts: p.parseScriptList(),
      features: p.parseFeatureList(),
      lookups: p.parseLookupList(subtableParsers$1),
      variations: p.parseFeatureVariationsList()
    };
  }
}
var gsub = { parse: parseGsubTable };
function parseHeadTable(data, start) {
  var head2 = {};
  var p = new parse.Parser(data, start);
  head2.version = p.parseVersion();
  head2.fontRevision = Math.round(p.parseFixed() * 1e3) / 1e3;
  head2.checkSumAdjustment = p.parseULong();
  head2.magicNumber = p.parseULong();
  check.argument(head2.magicNumber === 1594834165, "Font header has wrong magic number.");
  head2.flags = p.parseUShort();
  head2.unitsPerEm = p.parseUShort();
  head2.created = p.parseLongDateTime();
  head2.modified = p.parseLongDateTime();
  head2.xMin = p.parseShort();
  head2.yMin = p.parseShort();
  head2.xMax = p.parseShort();
  head2.yMax = p.parseShort();
  head2.macStyle = p.parseUShort();
  head2.lowestRecPPEM = p.parseUShort();
  head2.fontDirectionHint = p.parseShort();
  head2.indexToLocFormat = p.parseShort();
  head2.glyphDataFormat = p.parseShort();
  return head2;
}
var head = { parse: parseHeadTable };
function parseHheaTable(data, start) {
  var hhea2 = {};
  var p = new parse.Parser(data, start);
  hhea2.version = p.parseVersion();
  hhea2.ascender = p.parseShort();
  hhea2.descender = p.parseShort();
  hhea2.lineGap = p.parseShort();
  hhea2.advanceWidthMax = p.parseUShort();
  hhea2.minLeftSideBearing = p.parseShort();
  hhea2.minRightSideBearing = p.parseShort();
  hhea2.xMaxExtent = p.parseShort();
  hhea2.caretSlopeRise = p.parseShort();
  hhea2.caretSlopeRun = p.parseShort();
  hhea2.caretOffset = p.parseShort();
  p.relativeOffset += 8;
  hhea2.metricDataFormat = p.parseShort();
  hhea2.numberOfHMetrics = p.parseUShort();
  return hhea2;
}
var hhea = { parse: parseHheaTable };
function parseHmtxTableAll(data, start, numMetrics, numGlyphs, glyphs) {
  var advanceWidth;
  var leftSideBearing;
  var p = new parse.Parser(data, start);
  for (var i = 0; i < numGlyphs; i += 1) {
    if (i < numMetrics) {
      advanceWidth = p.parseUShort();
      leftSideBearing = p.parseShort();
    }
    var glyph = glyphs.get(i);
    glyph.advanceWidth = advanceWidth;
    glyph.leftSideBearing = leftSideBearing;
  }
}
function parseHmtxTableOnLowMemory(font, data, start, numMetrics, numGlyphs) {
  font._hmtxTableData = {};
  var advanceWidth;
  var leftSideBearing;
  var p = new parse.Parser(data, start);
  for (var i = 0; i < numGlyphs; i += 1) {
    if (i < numMetrics) {
      advanceWidth = p.parseUShort();
      leftSideBearing = p.parseShort();
    }
    font._hmtxTableData[i] = {
      advanceWidth,
      leftSideBearing
    };
  }
}
function parseHmtxTable(font, data, start, numMetrics, numGlyphs, glyphs, opt) {
  if (opt.lowMemory) {
    parseHmtxTableOnLowMemory(font, data, start, numMetrics, numGlyphs);
  } else {
    parseHmtxTableAll(data, start, numMetrics, numGlyphs, glyphs);
  }
}
var hmtx = { parse: parseHmtxTable };
function parseWindowsKernTable(p) {
  var pairs = {};
  p.skip("uShort");
  var subtableVersion = p.parseUShort();
  check.argument(subtableVersion === 0, "Unsupported kern sub-table version.");
  p.skip("uShort", 2);
  var nPairs = p.parseUShort();
  p.skip("uShort", 3);
  for (var i = 0; i < nPairs; i += 1) {
    var leftIndex = p.parseUShort();
    var rightIndex = p.parseUShort();
    var value = p.parseShort();
    pairs[leftIndex + "," + rightIndex] = value;
  }
  return pairs;
}
function parseMacKernTable(p) {
  var pairs = {};
  p.skip("uShort");
  var nTables = p.parseULong();
  if (nTables > 1) {
    console.warn("Only the first kern subtable is supported.");
  }
  p.skip("uLong");
  var coverage = p.parseUShort();
  var subtableVersion = coverage & 255;
  p.skip("uShort");
  if (subtableVersion === 0) {
    var nPairs = p.parseUShort();
    p.skip("uShort", 3);
    for (var i = 0; i < nPairs; i += 1) {
      var leftIndex = p.parseUShort();
      var rightIndex = p.parseUShort();
      var value = p.parseShort();
      pairs[leftIndex + "," + rightIndex] = value;
    }
  }
  return pairs;
}
function parseKernTable(data, start) {
  var p = new parse.Parser(data, start);
  var tableVersion = p.parseUShort();
  if (tableVersion === 0) {
    return parseWindowsKernTable(p);
  } else if (tableVersion === 1) {
    return parseMacKernTable(p);
  } else {
    throw new Error("Unsupported kern table version (" + tableVersion + ").");
  }
}
var kern = { parse: parseKernTable };
function parseLtagTable(data, start) {
  var p = new parse.Parser(data, start);
  var tableVersion = p.parseULong();
  check.argument(tableVersion === 1, "Unsupported ltag table version.");
  p.skip("uLong", 1);
  var numTags = p.parseULong();
  var tags = [];
  for (var i = 0; i < numTags; i++) {
    var tag = "";
    var offset = start + p.parseUShort();
    var length = p.parseUShort();
    for (var j = offset; j < offset + length; ++j) {
      tag += String.fromCharCode(data.getInt8(j));
    }
    tags.push(tag);
  }
  return tags;
}
var ltag = { parse: parseLtagTable };
function parseLocaTable(data, start, numGlyphs, shortVersion) {
  var p = new parse.Parser(data, start);
  var parseFn = shortVersion ? p.parseUShort : p.parseULong;
  var glyphOffsets = [];
  for (var i = 0; i < numGlyphs + 1; i += 1) {
    var glyphOffset = parseFn.call(p);
    if (shortVersion) {
      glyphOffset *= 2;
    }
    glyphOffsets.push(glyphOffset);
  }
  return glyphOffsets;
}
var loca = { parse: parseLocaTable };
function parseMaxpTable(data, start) {
  var maxp2 = {};
  var p = new parse.Parser(data, start);
  maxp2.version = p.parseVersion();
  maxp2.numGlyphs = p.parseUShort();
  if (maxp2.version === 1) {
    maxp2.maxPoints = p.parseUShort();
    maxp2.maxContours = p.parseUShort();
    maxp2.maxCompositePoints = p.parseUShort();
    maxp2.maxCompositeContours = p.parseUShort();
    maxp2.maxZones = p.parseUShort();
    maxp2.maxTwilightPoints = p.parseUShort();
    maxp2.maxStorage = p.parseUShort();
    maxp2.maxFunctionDefs = p.parseUShort();
    maxp2.maxInstructionDefs = p.parseUShort();
    maxp2.maxStackElements = p.parseUShort();
    maxp2.maxSizeOfInstructions = p.parseUShort();
    maxp2.maxComponentElements = p.parseUShort();
    maxp2.maxComponentDepth = p.parseUShort();
  }
  return maxp2;
}
var maxp = { parse: parseMaxpTable };
function parseOS2Table(data, start) {
  var os22 = {};
  var p = new parse.Parser(data, start);
  os22.version = p.parseUShort();
  os22.xAvgCharWidth = p.parseShort();
  os22.usWeightClass = p.parseUShort();
  os22.usWidthClass = p.parseUShort();
  os22.fsType = p.parseUShort();
  os22.ySubscriptXSize = p.parseShort();
  os22.ySubscriptYSize = p.parseShort();
  os22.ySubscriptXOffset = p.parseShort();
  os22.ySubscriptYOffset = p.parseShort();
  os22.ySuperscriptXSize = p.parseShort();
  os22.ySuperscriptYSize = p.parseShort();
  os22.ySuperscriptXOffset = p.parseShort();
  os22.ySuperscriptYOffset = p.parseShort();
  os22.yStrikeoutSize = p.parseShort();
  os22.yStrikeoutPosition = p.parseShort();
  os22.sFamilyClass = p.parseShort();
  os22.panose = [];
  for (var i = 0; i < 10; i++) {
    os22.panose[i] = p.parseByte();
  }
  os22.ulUnicodeRange1 = p.parseULong();
  os22.ulUnicodeRange2 = p.parseULong();
  os22.ulUnicodeRange3 = p.parseULong();
  os22.ulUnicodeRange4 = p.parseULong();
  os22.achVendID = String.fromCharCode(p.parseByte(), p.parseByte(), p.parseByte(), p.parseByte());
  os22.fsSelection = p.parseUShort();
  os22.usFirstCharIndex = p.parseUShort();
  os22.usLastCharIndex = p.parseUShort();
  os22.sTypoAscender = p.parseShort();
  os22.sTypoDescender = p.parseShort();
  os22.sTypoLineGap = p.parseShort();
  os22.usWinAscent = p.parseUShort();
  os22.usWinDescent = p.parseUShort();
  if (os22.version >= 1) {
    os22.ulCodePageRange1 = p.parseULong();
    os22.ulCodePageRange2 = p.parseULong();
  }
  if (os22.version >= 2) {
    os22.sxHeight = p.parseShort();
    os22.sCapHeight = p.parseShort();
    os22.usDefaultChar = p.parseUShort();
    os22.usBreakChar = p.parseUShort();
    os22.usMaxContent = p.parseUShort();
  }
  return os22;
}
var os2 = { parse: parseOS2Table };
function parsePostTable(data, start) {
  var post2 = {};
  var p = new parse.Parser(data, start);
  post2.version = p.parseVersion();
  post2.italicAngle = p.parseFixed();
  post2.underlinePosition = p.parseShort();
  post2.underlineThickness = p.parseShort();
  post2.isFixedPitch = p.parseULong();
  post2.minMemType42 = p.parseULong();
  post2.maxMemType42 = p.parseULong();
  post2.minMemType1 = p.parseULong();
  post2.maxMemType1 = p.parseULong();
  post2.names = [];
  switch (post2.version) {
    case 1:
      break;
    case 2:
      post2.numberOfGlyphs = p.parseUShort();
      post2.glyphNameIndex = new Array(post2.numberOfGlyphs);
      for (var i = 0; i < post2.numberOfGlyphs; i++) {
        post2.glyphNameIndex[i] = p.parseUShort();
      }
      break;
    case 2.5:
      post2.numberOfGlyphs = p.parseUShort();
      post2.offset = new Array(post2.numberOfGlyphs);
      for (var i$1 = 0; i$1 < post2.numberOfGlyphs; i$1++) {
        post2.offset[i$1] = p.parseChar();
      }
      break;
  }
  return post2;
}
var post = { parse: parsePostTable };
var decode = {};
decode.UTF8 = function(data, offset, numBytes) {
  var codePoints = [];
  var numChars = numBytes;
  for (var j = 0; j < numChars; j++, offset += 1) {
    codePoints[j] = data.getUint8(offset);
  }
  return String.fromCharCode.apply(null, codePoints);
};
decode.UTF16 = function(data, offset, numBytes) {
  var codePoints = [];
  var numChars = numBytes / 2;
  for (var j = 0; j < numChars; j++, offset += 2) {
    codePoints[j] = data.getUint16(offset);
  }
  return String.fromCharCode.apply(null, codePoints);
};
var eightBitMacEncodings = {
  "x-mac-croatian": "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\u0160\u2122\xB4\xA8\u2260\u017D\xD8\u221E\xB1\u2264\u2265\u2206\xB5\u2202\u2211\u220F\u0161\u222B\xAA\xBA\u03A9\u017E\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u0106\xAB\u010C\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u0110\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\uF8FF\xA9\u2044\u20AC\u2039\u203A\xC6\xBB\u2013\xB7\u201A\u201E\u2030\xC2\u0107\xC1\u010D\xC8\xCD\xCE\xCF\xCC\xD3\xD4\u0111\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u03C0\xCB\u02DA\xB8\xCA\xE6\u02C7",
  "x-mac-cyrillic": "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\u2020\xB0\u0490\xA3\xA7\u2022\xB6\u0406\xAE\xA9\u2122\u0402\u0452\u2260\u0403\u0453\u221E\xB1\u2264\u2265\u0456\xB5\u0491\u0408\u0404\u0454\u0407\u0457\u0409\u0459\u040A\u045A\u0458\u0405\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\u040B\u045B\u040C\u045C\u0455\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u201E\u040E\u045E\u040F\u045F\u2116\u0401\u0451\u044F\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E",
  "x-mac-gaelic": "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u1E02\xB1\u2264\u2265\u1E03\u010A\u010B\u1E0A\u1E0B\u1E1E\u1E1F\u0120\u0121\u1E40\xE6\xF8\u1E41\u1E56\u1E57\u027C\u0192\u017F\u1E60\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\u1E61\u1E9B\xFF\u0178\u1E6A\u20AC\u2039\u203A\u0176\u0177\u1E6B\xB7\u1EF2\u1EF3\u204A\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\u2663\xD2\xDA\xDB\xD9\u0131\xDD\xFD\u0174\u0175\u1E84\u1E85\u1E80\u1E81\u1E82\u1E83",
  "x-mac-greek": "\xC4\xB9\xB2\xC9\xB3\xD6\xDC\u0385\xE0\xE2\xE4\u0384\xA8\xE7\xE9\xE8\xEA\xEB\xA3\u2122\xEE\xEF\u2022\xBD\u2030\xF4\xF6\xA6\u20AC\xF9\xFB\xFC\u2020\u0393\u0394\u0398\u039B\u039E\u03A0\xDF\xAE\xA9\u03A3\u03AA\xA7\u2260\xB0\xB7\u0391\xB1\u2264\u2265\xA5\u0392\u0395\u0396\u0397\u0399\u039A\u039C\u03A6\u03AB\u03A8\u03A9\u03AC\u039D\xAC\u039F\u03A1\u2248\u03A4\xAB\xBB\u2026\xA0\u03A5\u03A7\u0386\u0388\u0153\u2013\u2015\u201C\u201D\u2018\u2019\xF7\u0389\u038A\u038C\u038E\u03AD\u03AE\u03AF\u03CC\u038F\u03CD\u03B1\u03B2\u03C8\u03B4\u03B5\u03C6\u03B3\u03B7\u03B9\u03BE\u03BA\u03BB\u03BC\u03BD\u03BF\u03C0\u03CE\u03C1\u03C3\u03C4\u03B8\u03C9\u03C2\u03C7\u03C5\u03B6\u03CA\u03CB\u0390\u03B0\xAD",
  "x-mac-icelandic": "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\xDD\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\xD0\xF0\xDE\xFE\xFD\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7",
  "x-mac-inuit": "\u1403\u1404\u1405\u1406\u140A\u140B\u1431\u1432\u1433\u1434\u1438\u1439\u1449\u144E\u144F\u1450\u1451\u1455\u1456\u1466\u146D\u146E\u146F\u1470\u1472\u1473\u1483\u148B\u148C\u148D\u148E\u1490\u1491\xB0\u14A1\u14A5\u14A6\u2022\xB6\u14A7\xAE\xA9\u2122\u14A8\u14AA\u14AB\u14BB\u14C2\u14C3\u14C4\u14C5\u14C7\u14C8\u14D0\u14EF\u14F0\u14F1\u14F2\u14F4\u14F5\u1505\u14D5\u14D6\u14D7\u14D8\u14DA\u14DB\u14EA\u1528\u1529\u152A\u152B\u152D\u2026\xA0\u152E\u153E\u1555\u1556\u1557\u2013\u2014\u201C\u201D\u2018\u2019\u1558\u1559\u155A\u155D\u1546\u1547\u1548\u1549\u154B\u154C\u1550\u157F\u1580\u1581\u1582\u1583\u1584\u1585\u158F\u1590\u1591\u1592\u1593\u1594\u1595\u1671\u1672\u1673\u1674\u1675\u1676\u1596\u15A0\u15A1\u15A2\u15A3\u15A4\u15A5\u15A6\u157C\u0141\u0142",
  "x-mac-ce": "\xC4\u0100\u0101\xC9\u0104\xD6\xDC\xE1\u0105\u010C\xE4\u010D\u0106\u0107\xE9\u0179\u017A\u010E\xED\u010F\u0112\u0113\u0116\xF3\u0117\xF4\xF6\xF5\xFA\u011A\u011B\xFC\u2020\xB0\u0118\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\u0119\xA8\u2260\u0123\u012E\u012F\u012A\u2264\u2265\u012B\u0136\u2202\u2211\u0142\u013B\u013C\u013D\u013E\u0139\u013A\u0145\u0146\u0143\xAC\u221A\u0144\u0147\u2206\xAB\xBB\u2026\xA0\u0148\u0150\xD5\u0151\u014C\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\u014D\u0154\u0155\u0158\u2039\u203A\u0159\u0156\u0157\u0160\u201A\u201E\u0161\u015A\u015B\xC1\u0164\u0165\xCD\u017D\u017E\u016A\xD3\xD4\u016B\u016E\xDA\u016F\u0170\u0171\u0172\u0173\xDD\xFD\u0137\u017B\u0141\u017C\u0122\u02C7",
  macintosh: "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\uFB01\uFB02\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7",
  "x-mac-romanian": "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\u0102\u0218\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\u0103\u0219\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\u021A\u021B\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7",
  "x-mac-turkish": "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u011E\u011F\u0130\u0131\u015E\u015F\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\uF8A0\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7"
};
decode.MACSTRING = function(dataView, offset, dataLength, encoding) {
  var table = eightBitMacEncodings[encoding];
  if (table === void 0) {
    return void 0;
  }
  var result = "";
  for (var i = 0; i < dataLength; i++) {
    var c = dataView.getUint8(offset + i);
    if (c <= 127) {
      result += String.fromCharCode(c);
    } else {
      result += table[c & 127];
    }
  }
  return result;
};
function parseMetaTable(data, start) {
  var p = new parse.Parser(data, start);
  var tableVersion = p.parseULong();
  check.argument(tableVersion === 1, "Unsupported META table version.");
  p.parseULong();
  p.parseULong();
  var numDataMaps = p.parseULong();
  var tags = {};
  for (var i = 0; i < numDataMaps; i++) {
    var tag = p.parseTag();
    var dataOffset = p.parseULong();
    var dataLength = p.parseULong();
    var text = decode.UTF8(data, start + dataOffset, dataLength);
    tags[tag] = text;
  }
  return tags;
}
var meta = { parse: parseMetaTable };
function parseOpenTypeTableEntries(data, numTables) {
  var tableEntries = [];
  var p = 12;
  for (var i = 0; i < numTables; i += 1) {
    var tag = parse.getTag(data, p);
    var checksum = parse.getULong(data, p + 4);
    var offset = parse.getULong(data, p + 8);
    var length = parse.getULong(data, p + 12);
    tableEntries.push({
      tag,
      checksum,
      offset,
      length,
      compression: false
    });
    p += 16;
  }
  return tableEntries;
}
function parseWOFFTableEntries(data, numTables) {
  var tableEntries = [];
  var p = 44;
  for (var i = 0; i < numTables; i += 1) {
    var tag = parse.getTag(data, p);
    var offset = parse.getULong(data, p + 4);
    var compLength = parse.getULong(data, p + 8);
    var origLength = parse.getULong(data, p + 12);
    var compression = void 0;
    if (compLength < origLength) {
      compression = "WOFF";
    } else {
      compression = false;
    }
    tableEntries.push({
      tag,
      offset,
      compression,
      compressedLength: compLength,
      length: origLength
    });
    p += 20;
  }
  return tableEntries;
}
function uncompressTable(data, tableEntry) {
  if (tableEntry.compression === "WOFF") {
    var inBuffer = new Uint8Array(data.buffer, tableEntry.offset + 2, tableEntry.compressedLength - 2);
    var outBuffer = new Uint8Array(tableEntry.length);
    inflateSync(inBuffer, outBuffer);
    if (outBuffer.byteLength !== tableEntry.length) {
      throw new Error("Decompression error: " + tableEntry.tag + " decompressed length doesn't match recorded length");
    }
    var view = new DataView(outBuffer.buffer, 0);
    return { data: view, offset: 0 };
  } else {
    return { data, offset: tableEntry.offset };
  }
}
function parseBuffer(buffer, opt) {
  opt = opt === void 0 || opt === null ? {} : opt;
  var indexToLocFormat;
  var font = new Font({ empty: true });
  var data = new DataView(buffer, 0);
  var numTables;
  var tableEntries = [];
  var signature = parse.getTag(data, 0);
  if (signature === String.fromCharCode(0, 1, 0, 0) || signature === "true" || signature === "typ1") {
    font.outlinesFormat = "truetype";
    numTables = parse.getUShort(data, 4);
    tableEntries = parseOpenTypeTableEntries(data, numTables);
  } else if (signature === "OTTO") {
    font.outlinesFormat = "cff";
    numTables = parse.getUShort(data, 4);
    tableEntries = parseOpenTypeTableEntries(data, numTables);
  } else if (signature === "wOFF") {
    var flavor = parse.getTag(data, 4);
    if (flavor === String.fromCharCode(0, 1, 0, 0)) {
      font.outlinesFormat = "truetype";
    } else if (flavor === "OTTO") {
      font.outlinesFormat = "cff";
    } else {
      throw new Error("Unsupported OpenType flavor " + signature);
    }
    numTables = parse.getUShort(data, 12);
    tableEntries = parseWOFFTableEntries(data, numTables);
  } else {
    throw new Error("Unsupported OpenType signature " + signature);
  }
  var cffTableEntry;
  var fvarTableEntry;
  var glyfTableEntry;
  var gdefTableEntry;
  var gposTableEntry;
  var gsubTableEntry;
  var hmtxTableEntry;
  var kernTableEntry;
  var locaTableEntry;
  var metaTableEntry;
  var p;
  for (var i = 0; i < numTables; i += 1) {
    var tableEntry = tableEntries[i];
    var table = void 0;
    switch (tableEntry.tag) {
      case "cmap":
        table = uncompressTable(data, tableEntry);
        font.tables.cmap = cmap.parse(table.data, table.offset);
        font.encoding = new CmapEncoding(font.tables.cmap);
        break;
      case "cvt ":
        table = uncompressTable(data, tableEntry);
        p = new parse.Parser(table.data, table.offset);
        font.tables.cvt = p.parseShortList(tableEntry.length / 2);
        break;
      case "fvar":
        fvarTableEntry = tableEntry;
        break;
      case "fpgm":
        table = uncompressTable(data, tableEntry);
        p = new parse.Parser(table.data, table.offset);
        font.tables.fpgm = p.parseByteList(tableEntry.length);
        break;
      case "head":
        table = uncompressTable(data, tableEntry);
        font.tables.head = head.parse(table.data, table.offset);
        font.unitsPerEm = font.tables.head.unitsPerEm;
        indexToLocFormat = font.tables.head.indexToLocFormat;
        break;
      case "hhea":
        table = uncompressTable(data, tableEntry);
        font.tables.hhea = hhea.parse(table.data, table.offset);
        font.ascender = font.tables.hhea.ascender;
        font.descender = font.tables.hhea.descender;
        font.numberOfHMetrics = font.tables.hhea.numberOfHMetrics;
        break;
      case "hmtx":
        hmtxTableEntry = tableEntry;
        break;
      case "ltag":
        table = uncompressTable(data, tableEntry);
        ltagTable = ltag.parse(table.data, table.offset);
        break;
      case "maxp":
        table = uncompressTable(data, tableEntry);
        font.tables.maxp = maxp.parse(table.data, table.offset);
        font.numGlyphs = font.tables.maxp.numGlyphs;
        break;
      case "OS/2":
        table = uncompressTable(data, tableEntry);
        font.tables.os2 = os2.parse(table.data, table.offset);
        break;
      case "post":
        table = uncompressTable(data, tableEntry);
        font.tables.post = post.parse(table.data, table.offset);
        break;
      case "prep":
        table = uncompressTable(data, tableEntry);
        p = new parse.Parser(table.data, table.offset);
        font.tables.prep = p.parseByteList(tableEntry.length);
        break;
      case "glyf":
        glyfTableEntry = tableEntry;
        break;
      case "loca":
        locaTableEntry = tableEntry;
        break;
      case "CFF ":
        cffTableEntry = tableEntry;
        break;
      case "kern":
        kernTableEntry = tableEntry;
        break;
      case "GDEF":
        gdefTableEntry = tableEntry;
        break;
      case "GPOS":
        gposTableEntry = tableEntry;
        break;
      case "GSUB":
        gsubTableEntry = tableEntry;
        break;
      case "meta":
        metaTableEntry = tableEntry;
        break;
    }
  }
  if (glyfTableEntry && locaTableEntry) {
    var shortVersion = indexToLocFormat === 0;
    var locaTable = uncompressTable(data, locaTableEntry);
    var locaOffsets = loca.parse(locaTable.data, locaTable.offset, font.numGlyphs, shortVersion);
    var glyfTable = uncompressTable(data, glyfTableEntry);
    font.glyphs = glyf.parse(glyfTable.data, glyfTable.offset, locaOffsets, font, opt);
  } else if (cffTableEntry) {
    var cffTable = uncompressTable(data, cffTableEntry);
    cff.parse(cffTable.data, cffTable.offset, font, opt);
  } else {
    throw new Error("Font doesn't contain TrueType or CFF outlines.");
  }
  var hmtxTable = uncompressTable(data, hmtxTableEntry);
  hmtx.parse(font, hmtxTable.data, hmtxTable.offset, font.numberOfHMetrics, font.numGlyphs, font.glyphs, opt);
  addGlyphNames(font, opt);
  if (kernTableEntry) {
    var kernTable = uncompressTable(data, kernTableEntry);
    font.kerningPairs = kern.parse(kernTable.data, kernTable.offset);
  } else {
    font.kerningPairs = {};
  }
  if (gdefTableEntry) {
    var gdefTable = uncompressTable(data, gdefTableEntry);
    font.tables.gdef = gdef.parse(gdefTable.data, gdefTable.offset);
  }
  if (gposTableEntry) {
    var gposTable = uncompressTable(data, gposTableEntry);
    font.tables.gpos = gpos.parse(gposTable.data, gposTable.offset);
    font.position.init();
  }
  if (gsubTableEntry) {
    var gsubTable = uncompressTable(data, gsubTableEntry);
    font.tables.gsub = gsub.parse(gsubTable.data, gsubTable.offset);
  }
  if (fvarTableEntry) {
    var fvarTable = uncompressTable(data, fvarTableEntry);
    font.tables.fvar = fvar.parse(fvarTable.data, fvarTable.offset, font.names);
  }
  if (metaTableEntry) {
    var metaTable = uncompressTable(data, metaTableEntry);
    font.tables.meta = meta.parse(metaTable.data, metaTable.offset);
    font.metas = font.tables.meta;
  }
  return font;
}
function load() {
}
function loadSync() {
}
var opentype = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  Font,
  Glyph,
  Path,
  _parse: parse,
  parse: parseBuffer,
  load,
  loadSync
});
var opentype_module_default = opentype;

// node_modules/.pnpm/satori@0.10.9/node_modules/satori/dist/index.wasm.js
var kl = Object.create;
var Pr = Object.defineProperty;
var Tl = Object.getOwnPropertyDescriptor;
var Al = Object.getOwnPropertyNames;
var Ol = Object.getPrototypeOf;
var Pl = Object.prototype.hasOwnProperty;
var vn = (e, t) => () => (e && (t = e(e = 0)), t);
var T = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var yn = (e, t) => {
  for (var n in t)
    Pr(e, n, { get: t[n], enumerable: true });
};
var Go = (e, t, n, r) => {
  if (t && typeof t == "object" || typeof t == "function")
    for (let i of Al(t))
      !Pl.call(e, i) && i !== n && Pr(e, i, { get: () => t[i], enumerable: !(r = Tl(t, i)) || r.enumerable });
  return e;
};
var Bl = (e, t, n) => (n = e != null ? kl(Ol(e)) : {}, Go(t || !e || !e.__esModule ? Pr(n, "default", { value: e, enumerable: true }) : n, e));
var Br = (e) => Go(Pr({}, "__esModule", { value: true }), e);
var jo = {};
yn(jo, { getYogaModule: () => Il });
async function Il() {
  return {};
}
var Ho = vn(() => {
});
var Xn = T((Yn) => {
  "use strict";
  Object.defineProperty(Yn, "__esModule", { value: true });
  Object.defineProperty(Yn, "default", { enumerable: true, get: () => zf });
  function zf(e) {
    if (e = `${e}`, e === "0")
      return "0";
    if (/^[+-]?(\d+|\d*\.\d+)(e[+-]?\d+)?(%|\w+)?$/.test(e))
      return e.replace(/^[+-]?/, (t) => t === "-" ? "" : "-");
    if (e.includes("var(") || e.includes("calc("))
      return `calc(${e} * -1)`;
  }
});
var zu = T((Qn) => {
  "use strict";
  Object.defineProperty(Qn, "__esModule", { value: true });
  Object.defineProperty(Qn, "default", { enumerable: true, get: () => Uf });
  var Uf = ["preflight", "container", "accessibility", "pointerEvents", "visibility", "position", "inset", "isolation", "zIndex", "order", "gridColumn", "gridColumnStart", "gridColumnEnd", "gridRow", "gridRowStart", "gridRowEnd", "float", "clear", "margin", "boxSizing", "display", "aspectRatio", "height", "maxHeight", "minHeight", "width", "minWidth", "maxWidth", "flex", "flexShrink", "flexGrow", "flexBasis", "tableLayout", "borderCollapse", "borderSpacing", "transformOrigin", "translate", "rotate", "skew", "scale", "transform", "animation", "cursor", "touchAction", "userSelect", "resize", "scrollSnapType", "scrollSnapAlign", "scrollSnapStop", "scrollMargin", "scrollPadding", "listStylePosition", "listStyleType", "appearance", "columns", "breakBefore", "breakInside", "breakAfter", "gridAutoColumns", "gridAutoFlow", "gridAutoRows", "gridTemplateColumns", "gridTemplateRows", "flexDirection", "flexWrap", "placeContent", "placeItems", "alignContent", "alignItems", "justifyContent", "justifyItems", "gap", "space", "divideWidth", "divideStyle", "divideColor", "divideOpacity", "placeSelf", "alignSelf", "justifySelf", "overflow", "overscrollBehavior", "scrollBehavior", "textOverflow", "whitespace", "wordBreak", "borderRadius", "borderWidth", "borderStyle", "borderColor", "borderOpacity", "backgroundColor", "backgroundOpacity", "backgroundImage", "gradientColorStops", "boxDecorationBreak", "backgroundSize", "backgroundAttachment", "backgroundClip", "backgroundPosition", "backgroundRepeat", "backgroundOrigin", "fill", "stroke", "strokeWidth", "objectFit", "objectPosition", "padding", "textAlign", "textIndent", "verticalAlign", "fontFamily", "fontSize", "fontWeight", "textTransform", "fontStyle", "fontVariantNumeric", "lineHeight", "letterSpacing", "textColor", "textOpacity", "textDecoration", "textDecorationColor", "textDecorationStyle", "textDecorationThickness", "textUnderlineOffset", "fontSmoothing", "placeholderColor", "placeholderOpacity", "caretColor", "accentColor", "opacity", "backgroundBlendMode", "mixBlendMode", "boxShadow", "boxShadowColor", "outlineStyle", "outlineWidth", "outlineOffset", "outlineColor", "ringWidth", "ringColor", "ringOpacity", "ringOffsetWidth", "ringOffsetColor", "blur", "brightness", "contrast", "dropShadow", "grayscale", "hueRotate", "invert", "saturate", "sepia", "filter", "backdropBlur", "backdropBrightness", "backdropContrast", "backdropGrayscale", "backdropHueRotate", "backdropInvert", "backdropOpacity", "backdropSaturate", "backdropSepia", "backdropFilter", "transitionProperty", "transitionDelay", "transitionDuration", "transitionTimingFunction", "willChange", "content"];
});
var Uu = T((Kn) => {
  "use strict";
  Object.defineProperty(Kn, "__esModule", { value: true });
  Object.defineProperty(Kn, "default", { enumerable: true, get: () => Gf });
  function Gf(e, t) {
    return e === void 0 ? t : Array.isArray(e) ? e : [...new Set(t.filter((r) => e !== false && e[r] !== false).concat(Object.keys(e).filter((r) => e[r] !== false)))];
  }
});
var Jn = T((sb, Gu) => {
  Gu.exports = { content: [], presets: [], darkMode: "media", theme: { screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" }, colors: ({ colors: e }) => ({ inherit: e.inherit, current: e.current, transparent: e.transparent, black: e.black, white: e.white, slate: e.slate, gray: e.gray, zinc: e.zinc, neutral: e.neutral, stone: e.stone, red: e.red, orange: e.orange, amber: e.amber, yellow: e.yellow, lime: e.lime, green: e.green, emerald: e.emerald, teal: e.teal, cyan: e.cyan, sky: e.sky, blue: e.blue, indigo: e.indigo, violet: e.violet, purple: e.purple, fuchsia: e.fuchsia, pink: e.pink, rose: e.rose }), columns: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem" }, spacing: { px: "1px", 0: "0px", 0.5: "0.125rem", 1: "0.25rem", 1.5: "0.375rem", 2: "0.5rem", 2.5: "0.625rem", 3: "0.75rem", 3.5: "0.875rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem", 11: "2.75rem", 12: "3rem", 14: "3.5rem", 16: "4rem", 20: "5rem", 24: "6rem", 28: "7rem", 32: "8rem", 36: "9rem", 40: "10rem", 44: "11rem", 48: "12rem", 52: "13rem", 56: "14rem", 60: "15rem", 64: "16rem", 72: "18rem", 80: "20rem", 96: "24rem" }, animation: { none: "none", spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite", pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", bounce: "bounce 1s infinite" }, aspectRatio: { auto: "auto", square: "1 / 1", video: "16 / 9" }, backdropBlur: ({ theme: e }) => e("blur"), backdropBrightness: ({ theme: e }) => e("brightness"), backdropContrast: ({ theme: e }) => e("contrast"), backdropGrayscale: ({ theme: e }) => e("grayscale"), backdropHueRotate: ({ theme: e }) => e("hueRotate"), backdropInvert: ({ theme: e }) => e("invert"), backdropOpacity: ({ theme: e }) => e("opacity"), backdropSaturate: ({ theme: e }) => e("saturate"), backdropSepia: ({ theme: e }) => e("sepia"), backgroundColor: ({ theme: e }) => e("colors"), backgroundImage: { none: "none", "gradient-to-t": "linear-gradient(to top, var(--tw-gradient-stops))", "gradient-to-tr": "linear-gradient(to top right, var(--tw-gradient-stops))", "gradient-to-r": "linear-gradient(to right, var(--tw-gradient-stops))", "gradient-to-br": "linear-gradient(to bottom right, var(--tw-gradient-stops))", "gradient-to-b": "linear-gradient(to bottom, var(--tw-gradient-stops))", "gradient-to-bl": "linear-gradient(to bottom left, var(--tw-gradient-stops))", "gradient-to-l": "linear-gradient(to left, var(--tw-gradient-stops))", "gradient-to-tl": "linear-gradient(to top left, var(--tw-gradient-stops))" }, backgroundOpacity: ({ theme: e }) => e("opacity"), backgroundPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, backgroundSize: { auto: "auto", cover: "cover", contain: "contain" }, blur: { 0: "0", none: "0", sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" }, brightness: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5", 200: "2" }, borderColor: ({ theme: e }) => ({ ...e("colors"), DEFAULT: e("colors.gray.200", "currentColor") }), borderOpacity: ({ theme: e }) => e("opacity"), borderRadius: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" }, borderSpacing: ({ theme: e }) => ({ ...e("spacing") }), borderWidth: { DEFAULT: "1px", 0: "0px", 2: "2px", 4: "4px", 8: "8px" }, boxShadow: { sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)", none: "none" }, boxShadowColor: ({ theme: e }) => e("colors"), caretColor: ({ theme: e }) => e("colors"), accentColor: ({ theme: e }) => ({ ...e("colors"), auto: "auto" }), contrast: { 0: "0", 50: ".5", 75: ".75", 100: "1", 125: "1.25", 150: "1.5", 200: "2" }, container: {}, content: { none: "none" }, cursor: { auto: "auto", default: "default", pointer: "pointer", wait: "wait", text: "text", move: "move", help: "help", "not-allowed": "not-allowed", none: "none", "context-menu": "context-menu", progress: "progress", cell: "cell", crosshair: "crosshair", "vertical-text": "vertical-text", alias: "alias", copy: "copy", "no-drop": "no-drop", grab: "grab", grabbing: "grabbing", "all-scroll": "all-scroll", "col-resize": "col-resize", "row-resize": "row-resize", "n-resize": "n-resize", "e-resize": "e-resize", "s-resize": "s-resize", "w-resize": "w-resize", "ne-resize": "ne-resize", "nw-resize": "nw-resize", "se-resize": "se-resize", "sw-resize": "sw-resize", "ew-resize": "ew-resize", "ns-resize": "ns-resize", "nesw-resize": "nesw-resize", "nwse-resize": "nwse-resize", "zoom-in": "zoom-in", "zoom-out": "zoom-out" }, divideColor: ({ theme: e }) => e("borderColor"), divideOpacity: ({ theme: e }) => e("borderOpacity"), divideWidth: ({ theme: e }) => e("borderWidth"), dropShadow: { sm: "0 1px 1px rgb(0 0 0 / 0.05)", DEFAULT: ["0 1px 2px rgb(0 0 0 / 0.1)", "0 1px 1px rgb(0 0 0 / 0.06)"], md: ["0 4px 3px rgb(0 0 0 / 0.07)", "0 2px 2px rgb(0 0 0 / 0.06)"], lg: ["0 10px 8px rgb(0 0 0 / 0.04)", "0 4px 3px rgb(0 0 0 / 0.1)"], xl: ["0 20px 13px rgb(0 0 0 / 0.03)", "0 8px 5px rgb(0 0 0 / 0.08)"], "2xl": "0 25px 25px rgb(0 0 0 / 0.15)", none: "0 0 #0000" }, fill: ({ theme: e }) => e("colors"), grayscale: { 0: "0", DEFAULT: "100%" }, hueRotate: { 0: "0deg", 15: "15deg", 30: "30deg", 60: "60deg", 90: "90deg", 180: "180deg" }, invert: { 0: "0", DEFAULT: "100%" }, flex: { 1: "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }, flexBasis: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%" }), flexGrow: { 0: "0", DEFAULT: "1" }, flexShrink: { 0: "0", DEFAULT: "1" }, fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", '"Noto Sans"', "sans-serif", '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'], serif: ["ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', '"Courier New"', "monospace"] }, fontSize: { xs: ["0.75rem", { lineHeight: "1rem" }], sm: ["0.875rem", { lineHeight: "1.25rem" }], base: ["1rem", { lineHeight: "1.5rem" }], lg: ["1.125rem", { lineHeight: "1.75rem" }], xl: ["1.25rem", { lineHeight: "1.75rem" }], "2xl": ["1.5rem", { lineHeight: "2rem" }], "3xl": ["1.875rem", { lineHeight: "2.25rem" }], "4xl": ["2.25rem", { lineHeight: "2.5rem" }], "5xl": ["3rem", { lineHeight: "1" }], "6xl": ["3.75rem", { lineHeight: "1" }], "7xl": ["4.5rem", { lineHeight: "1" }], "8xl": ["6rem", { lineHeight: "1" }], "9xl": ["8rem", { lineHeight: "1" }] }, fontWeight: { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" }, gap: ({ theme: e }) => e("spacing"), gradientColorStops: ({ theme: e }) => e("colors"), gridAutoColumns: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridAutoRows: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridColumn: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-7": "span 7 / span 7", "span-8": "span 8 / span 8", "span-9": "span 9 / span 9", "span-10": "span 10 / span 10", "span-11": "span 11 / span 11", "span-12": "span 12 / span 12", "span-full": "1 / -1" }, gridColumnEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridColumnStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridRow: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-full": "1 / -1" }, gridRowStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridRowEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridTemplateColumns: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))", 7: "repeat(7, minmax(0, 1fr))", 8: "repeat(8, minmax(0, 1fr))", 9: "repeat(9, minmax(0, 1fr))", 10: "repeat(10, minmax(0, 1fr))", 11: "repeat(11, minmax(0, 1fr))", 12: "repeat(12, minmax(0, 1fr))" }, gridTemplateRows: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))" }, height: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), inset: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), keyframes: { spin: { to: { transform: "rotate(360deg)" } }, ping: { "75%, 100%": { transform: "scale(2)", opacity: "0" } }, pulse: { "50%": { opacity: ".5" } }, bounce: { "0%, 100%": { transform: "translateY(-25%)", animationTimingFunction: "cubic-bezier(0.8,0,1,1)" }, "50%": { transform: "none", animationTimingFunction: "cubic-bezier(0,0,0.2,1)" } } }, letterSpacing: { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }, lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2", 3: ".75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem" }, listStyleType: { none: "none", disc: "disc", decimal: "decimal" }, margin: ({ theme: e }) => ({ auto: "auto", ...e("spacing") }), maxHeight: ({ theme: e }) => ({ ...e("spacing"), full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), maxWidth: ({ theme: e, breakpoints: t }) => ({ none: "none", 0: "0rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch", ...t(e("screens")) }), minHeight: { 0: "0px", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }, minWidth: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" }, objectPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, opacity: { 0: "0", 5: "0.05", 10: "0.1", 20: "0.2", 25: "0.25", 30: "0.3", 40: "0.4", 50: "0.5", 60: "0.6", 70: "0.7", 75: "0.75", 80: "0.8", 90: "0.9", 95: "0.95", 100: "1" }, order: { first: "-9999", last: "9999", none: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12" }, padding: ({ theme: e }) => e("spacing"), placeholderColor: ({ theme: e }) => e("colors"), placeholderOpacity: ({ theme: e }) => e("opacity"), outlineColor: ({ theme: e }) => e("colors"), outlineOffset: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, outlineWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringColor: ({ theme: e }) => ({ DEFAULT: e("colors.blue.500", "#3b82f6"), ...e("colors") }), ringOffsetColor: ({ theme: e }) => e("colors"), ringOffsetWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringOpacity: ({ theme: e }) => ({ DEFAULT: "0.5", ...e("opacity") }), ringWidth: { DEFAULT: "3px", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, rotate: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg", 45: "45deg", 90: "90deg", 180: "180deg" }, saturate: { 0: "0", 50: ".5", 100: "1", 150: "1.5", 200: "2" }, scale: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5" }, scrollMargin: ({ theme: e }) => ({ ...e("spacing") }), scrollPadding: ({ theme: e }) => e("spacing"), sepia: { 0: "0", DEFAULT: "100%" }, skew: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg" }, space: ({ theme: e }) => ({ ...e("spacing") }), stroke: ({ theme: e }) => e("colors"), strokeWidth: { 0: "0", 1: "1", 2: "2" }, textColor: ({ theme: e }) => e("colors"), textDecorationColor: ({ theme: e }) => e("colors"), textDecorationThickness: { auto: "auto", "from-font": "from-font", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textUnderlineOffset: { auto: "auto", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textIndent: ({ theme: e }) => ({ ...e("spacing") }), textOpacity: ({ theme: e }) => e("opacity"), transformOrigin: { center: "center", top: "top", "top-right": "top right", right: "right", "bottom-right": "bottom right", bottom: "bottom", "bottom-left": "bottom left", left: "left", "top-left": "top left" }, transitionDelay: { 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionDuration: { DEFAULT: "150ms", 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionProperty: { none: "none", all: "all", DEFAULT: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter", colors: "color, background-color, border-color, text-decoration-color, fill, stroke", opacity: "opacity", shadow: "box-shadow", transform: "transform" }, transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)", linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" }, translate: ({ theme: e }) => ({ ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), width: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%", screen: "100vw", min: "min-content", max: "max-content", fit: "fit-content" }), willChange: { auto: "auto", scroll: "scroll-position", contents: "contents", transform: "transform" }, zIndex: { auto: "auto", 0: "0", 10: "10", 20: "20", 30: "30", 40: "40", 50: "50" } }, variantOrder: ["first", "last", "odd", "even", "visited", "checked", "empty", "read-only", "group-hover", "group-focus", "focus-within", "hover", "focus", "focus-visible", "active", "disabled"], plugins: [] };
});
var Xr = {};
yn(Xr, { default: () => jf });
var jf;
var Qr = vn(() => {
  jf = { info(e, t) {
    console.info(...Array.isArray(e) ? [e] : [t, e]);
  }, warn(e, t) {
    console.warn(...Array.isArray(e) ? [e] : [t, e]);
  }, risk(e, t) {
    console.error(...Array.isArray(e) ? [e] : [t, e]);
  } };
});
var ju = T((Zn) => {
  "use strict";
  Object.defineProperty(Zn, "__esModule", { value: true });
  Object.defineProperty(Zn, "default", { enumerable: true, get: () => Yf });
  var Hf = Vf((Qr(), Br(Xr)));
  function Vf(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ut({ version: e, from: t, to: n }) {
    Hf.default.warn(`${t}-color-renamed`, [`As of Tailwind CSS ${e}, \`${t}\` has been renamed to \`${n}\`.`, "Update your configuration file to silence this warning."]);
  }
  var Yf = { inherit: "inherit", current: "currentColor", transparent: "transparent", black: "#000", white: "#fff", slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" }, gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151", 800: "#1f2937", 900: "#111827" }, zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b" }, neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717" }, stone: { 50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1", 400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c", 800: "#292524", 900: "#1c1917" }, red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" }, orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" }, amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" }, yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" }, lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314" }, green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" }, emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" }, teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a" }, cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63" }, sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e" }, blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" }, indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" }, violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95" }, purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" }, fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75" }, pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" }, rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337" }, get lightBlue() {
    return Ut({ version: "v2.2", from: "lightBlue", to: "sky" }), this.sky;
  }, get warmGray() {
    return Ut({ version: "v3.0", from: "warmGray", to: "stone" }), this.stone;
  }, get trueGray() {
    return Ut({ version: "v3.0", from: "trueGray", to: "neutral" }), this.neutral;
  }, get coolGray() {
    return Ut({ version: "v3.0", from: "coolGray", to: "gray" }), this.gray;
  }, get blueGray() {
    return Ut({ version: "v3.0", from: "blueGray", to: "slate" }), this.slate;
  } };
});
var Hu = T((ei) => {
  "use strict";
  Object.defineProperty(ei, "__esModule", { value: true });
  Object.defineProperty(ei, "defaults", { enumerable: true, get: () => Xf });
  function Xf(e, ...t) {
    for (let i of t) {
      for (let o in i) {
        var n;
        !(e == null || (n = e.hasOwnProperty) === null || n === void 0) && n.call(e, o) || (e[o] = i[o]);
      }
      for (let o of Object.getOwnPropertySymbols(i)) {
        var r;
        !(e == null || (r = e.hasOwnProperty) === null || r === void 0) && r.call(e, o) || (e[o] = i[o]);
      }
    }
    return e;
  }
});
var Vu = T((ti) => {
  "use strict";
  Object.defineProperty(ti, "__esModule", { value: true });
  Object.defineProperty(ti, "toPath", { enumerable: true, get: () => Qf });
  function Qf(e) {
    if (Array.isArray(e))
      return e;
    let t = e.split("[").length - 1, n = e.split("]").length - 1;
    if (t !== n)
      throw new Error(`Path is invalid. Has unbalanced brackets: ${e}`);
    return e.split(/\.(?![^\[]*\])|[\[\]]/g).filter(Boolean);
  }
});
var Xu = T((ri) => {
  "use strict";
  Object.defineProperty(ri, "__esModule", { value: true });
  Object.defineProperty(ri, "normalizeConfig", { enumerable: true, get: () => Jf });
  var Gt = Kf((Qr(), Br(Xr)));
  function Yu(e) {
    if (typeof WeakMap != "function")
      return null;
    var t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new WeakMap();
    return (Yu = function(r) {
      return r ? n : t;
    })(e);
  }
  function Kf(e, t) {
    if (!t && e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var n = Yu(t);
    if (n && n.has(e))
      return n.get(e);
    var r = {}, i = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var o in e)
      if (o !== "default" && Object.prototype.hasOwnProperty.call(e, o)) {
        var u = i ? Object.getOwnPropertyDescriptor(e, o) : null;
        u && (u.get || u.set) ? Object.defineProperty(r, o, u) : r[o] = e[o];
      }
    return r.default = e, n && n.set(e, r), r;
  }
  function Jf(e) {
    if ((() => {
      if (e.purge || !e.content || !Array.isArray(e.content) && !(typeof e.content == "object" && e.content !== null))
        return false;
      if (Array.isArray(e.content))
        return e.content.every((r) => typeof r == "string" ? true : !(typeof (r == null ? void 0 : r.raw) != "string" || r != null && r.extension && typeof (r == null ? void 0 : r.extension) != "string"));
      if (typeof e.content == "object" && e.content !== null) {
        if (Object.keys(e.content).some((r) => !["files", "extract", "transform"].includes(r)))
          return false;
        if (Array.isArray(e.content.files)) {
          if (!e.content.files.every((r) => typeof r == "string" ? true : !(typeof (r == null ? void 0 : r.raw) != "string" || r != null && r.extension && typeof (r == null ? void 0 : r.extension) != "string")))
            return false;
          if (typeof e.content.extract == "object") {
            for (let r of Object.values(e.content.extract))
              if (typeof r != "function")
                return false;
          } else if (!(e.content.extract === void 0 || typeof e.content.extract == "function"))
            return false;
          if (typeof e.content.transform == "object") {
            for (let r of Object.values(e.content.transform))
              if (typeof r != "function")
                return false;
          } else if (!(e.content.transform === void 0 || typeof e.content.transform == "function"))
            return false;
        }
        return true;
      }
      return false;
    })() || Gt.default.warn("purge-deprecation", ["The `purge`/`content` options have changed in Tailwind CSS v3.0.", "Update your configuration file to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#configure-content-sources"]), e.safelist = (() => {
      var r;
      let { content: i, purge: o, safelist: u } = e;
      return Array.isArray(u) ? u : Array.isArray(i == null ? void 0 : i.safelist) ? i.safelist : Array.isArray(o == null ? void 0 : o.safelist) ? o.safelist : Array.isArray(o == null || (r = o.options) === null || r === void 0 ? void 0 : r.safelist) ? o.options.safelist : [];
    })(), typeof e.prefix == "function")
      Gt.default.warn("prefix-function", ["As of Tailwind CSS v3.0, `prefix` cannot be a function.", "Update `prefix` in your configuration to be a string to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#prefix-cannot-be-a-function"]), e.prefix = "";
    else {
      var n;
      e.prefix = (n = e.prefix) !== null && n !== void 0 ? n : "";
    }
    e.content = { files: (() => {
      let { content: r, purge: i } = e;
      return Array.isArray(i) ? i : Array.isArray(i == null ? void 0 : i.content) ? i.content : Array.isArray(r) ? r : Array.isArray(r == null ? void 0 : r.content) ? r.content : Array.isArray(r == null ? void 0 : r.files) ? r.files : [];
    })(), extract: (() => {
      let r = (() => {
        var u, s, a, l, f, c, d, h, p, m;
        return !((u = e.purge) === null || u === void 0) && u.extract ? e.purge.extract : !((s = e.content) === null || s === void 0) && s.extract ? e.content.extract : !((a = e.purge) === null || a === void 0 || (l = a.extract) === null || l === void 0) && l.DEFAULT ? e.purge.extract.DEFAULT : !((f = e.content) === null || f === void 0 || (c = f.extract) === null || c === void 0) && c.DEFAULT ? e.content.extract.DEFAULT : !((d = e.purge) === null || d === void 0 || (h = d.options) === null || h === void 0) && h.extractors ? e.purge.options.extractors : !((p = e.content) === null || p === void 0 || (m = p.options) === null || m === void 0) && m.extractors ? e.content.options.extractors : {};
      })(), i = {}, o = (() => {
        var u, s, a, l;
        if (!((u = e.purge) === null || u === void 0 || (s = u.options) === null || s === void 0) && s.defaultExtractor)
          return e.purge.options.defaultExtractor;
        if (!((a = e.content) === null || a === void 0 || (l = a.options) === null || l === void 0) && l.defaultExtractor)
          return e.content.options.defaultExtractor;
      })();
      if (o !== void 0 && (i.DEFAULT = o), typeof r == "function")
        i.DEFAULT = r;
      else if (Array.isArray(r))
        for (let { extensions: u, extractor: s } of r ?? [])
          for (let a of u)
            i[a] = s;
      else
        typeof r == "object" && r !== null && Object.assign(i, r);
      return i;
    })(), transform: (() => {
      let r = (() => {
        var o, u, s, a, l, f;
        return !((o = e.purge) === null || o === void 0) && o.transform ? e.purge.transform : !((u = e.content) === null || u === void 0) && u.transform ? e.content.transform : !((s = e.purge) === null || s === void 0 || (a = s.transform) === null || a === void 0) && a.DEFAULT ? e.purge.transform.DEFAULT : !((l = e.content) === null || l === void 0 || (f = l.transform) === null || f === void 0) && f.DEFAULT ? e.content.transform.DEFAULT : {};
      })(), i = {};
      return typeof r == "function" && (i.DEFAULT = r), typeof r == "object" && r !== null && Object.assign(i, r), i;
    })() };
    for (let r of e.content.files)
      if (typeof r == "string" && /{([^,]*?)}/g.test(r)) {
        Gt.default.warn("invalid-glob-braces", [`The glob pattern ${(0, Gt.dim)(r)} in your Tailwind CSS configuration is invalid.`, `Update it to ${(0, Gt.dim)(r.replace(/{([^,]*?)}/g, "$1"))} to silence this warning.`]);
        break;
      }
    return e;
  }
});
var Qu = T((ni) => {
  "use strict";
  Object.defineProperty(ni, "__esModule", { value: true });
  Object.defineProperty(ni, "default", { enumerable: true, get: () => Zf });
  function Zf(e) {
    if (Object.prototype.toString.call(e) !== "[object Object]")
      return false;
    let t = Object.getPrototypeOf(e);
    return t === null || t === Object.prototype;
  }
});
var Ku = T((oi) => {
  "use strict";
  Object.defineProperty(oi, "__esModule", { value: true });
  Object.defineProperty(oi, "cloneDeep", { enumerable: true, get: () => ii });
  function ii(e) {
    return Array.isArray(e) ? e.map((t) => ii(t)) : typeof e == "object" && e !== null ? Object.fromEntries(Object.entries(e).map(([t, n]) => [t, ii(n)])) : e;
  }
});
var ui = T((Kr, Ju) => {
  "use strict";
  Kr.__esModule = true;
  Kr.default = rc;
  function ec2(e) {
    for (var t = e.toLowerCase(), n = "", r = false, i = 0; i < 6 && t[i] !== void 0; i++) {
      var o = t.charCodeAt(i), u = o >= 97 && o <= 102 || o >= 48 && o <= 57;
      if (r = o === 32, !u)
        break;
      n += t[i];
    }
    if (n.length !== 0) {
      var s = parseInt(n, 16), a = s >= 55296 && s <= 57343;
      return a || s === 0 || s > 1114111 ? ["\uFFFD", n.length + (r ? 1 : 0)] : [String.fromCodePoint(s), n.length + (r ? 1 : 0)];
    }
  }
  var tc = /\\/;
  function rc(e) {
    var t = tc.test(e);
    if (!t)
      return e;
    for (var n = "", r = 0; r < e.length; r++) {
      if (e[r] === "\\") {
        var i = ec2(e.slice(r + 1, r + 7));
        if (i !== void 0) {
          n += i[0], r += i[1];
          continue;
        }
        if (e[r + 1] === "\\") {
          n += "\\", r++;
          continue;
        }
        e.length === r + 1 && (n += e[r]);
        continue;
      }
      n += e[r];
    }
    return n;
  }
  Ju.exports = Kr.default;
});
var es = T((Jr, Zu) => {
  "use strict";
  Jr.__esModule = true;
  Jr.default = nc;
  function nc(e) {
    for (var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)
      n[r - 1] = arguments[r];
    for (; n.length > 0; ) {
      var i = n.shift();
      if (!e[i])
        return;
      e = e[i];
    }
    return e;
  }
  Zu.exports = Jr.default;
});
var rs = T((Zr, ts) => {
  "use strict";
  Zr.__esModule = true;
  Zr.default = ic;
  function ic(e) {
    for (var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)
      n[r - 1] = arguments[r];
    for (; n.length > 0; ) {
      var i = n.shift();
      e[i] || (e[i] = {}), e = e[i];
    }
  }
  ts.exports = Zr.default;
});
var is = T((en, ns) => {
  "use strict";
  en.__esModule = true;
  en.default = oc;
  function oc(e) {
    for (var t = "", n = e.indexOf("/*"), r = 0; n >= 0; ) {
      t = t + e.slice(r, n);
      var i = e.indexOf("*/", n + 2);
      if (i < 0)
        return t;
      r = i + 2, n = e.indexOf("/*", r);
    }
    return t = t + e.slice(r), t;
  }
  ns.exports = en.default;
});
var jt = T((Le) => {
  "use strict";
  Le.__esModule = true;
  Le.stripComments = Le.ensureObject = Le.getProp = Le.unesc = void 0;
  var uc = tn(ui());
  Le.unesc = uc.default;
  var sc = tn(es());
  Le.getProp = sc.default;
  var ac = tn(rs());
  Le.ensureObject = ac.default;
  var lc = tn(is());
  Le.stripComments = lc.default;
  function tn(e) {
    return e && e.__esModule ? e : { default: e };
  }
});
var ze = T((Ht, ss) => {
  "use strict";
  Ht.__esModule = true;
  Ht.default = void 0;
  var os = jt();
  function us(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function fc(e, t, n) {
    return t && us(e.prototype, t), n && us(e, n), e;
  }
  var cc = function e(t, n) {
    if (typeof t != "object" || t === null)
      return t;
    var r = new t.constructor();
    for (var i in t)
      if (t.hasOwnProperty(i)) {
        var o = t[i], u = typeof o;
        i === "parent" && u === "object" ? n && (r[i] = n) : o instanceof Array ? r[i] = o.map(function(s) {
          return e(s, r);
        }) : r[i] = e(o, r);
      }
    return r;
  }, dc = function() {
    function e(n) {
      n === void 0 && (n = {}), Object.assign(this, n), this.spaces = this.spaces || {}, this.spaces.before = this.spaces.before || "", this.spaces.after = this.spaces.after || "";
    }
    var t = e.prototype;
    return t.remove = function() {
      return this.parent && this.parent.removeChild(this), this.parent = void 0, this;
    }, t.replaceWith = function() {
      if (this.parent) {
        for (var r in arguments)
          this.parent.insertBefore(this, arguments[r]);
        this.remove();
      }
      return this;
    }, t.next = function() {
      return this.parent.at(this.parent.index(this) + 1);
    }, t.prev = function() {
      return this.parent.at(this.parent.index(this) - 1);
    }, t.clone = function(r) {
      r === void 0 && (r = {});
      var i = cc(this);
      for (var o in r)
        i[o] = r[o];
      return i;
    }, t.appendToPropertyAndEscape = function(r, i, o) {
      this.raws || (this.raws = {});
      var u = this[r], s = this.raws[r];
      this[r] = u + i, s || o !== i ? this.raws[r] = (s || u) + o : delete this.raws[r];
    }, t.setPropertyAndEscape = function(r, i, o) {
      this.raws || (this.raws = {}), this[r] = i, this.raws[r] = o;
    }, t.setPropertyWithoutEscape = function(r, i) {
      this[r] = i, this.raws && delete this.raws[r];
    }, t.isAtPosition = function(r, i) {
      if (this.source && this.source.start && this.source.end)
        return !(this.source.start.line > r || this.source.end.line < r || this.source.start.line === r && this.source.start.column > i || this.source.end.line === r && this.source.end.column < i);
    }, t.stringifyProperty = function(r) {
      return this.raws && this.raws[r] || this[r];
    }, t.valueToString = function() {
      return String(this.stringifyProperty("value"));
    }, t.toString = function() {
      return [this.rawSpaceBefore, this.valueToString(), this.rawSpaceAfter].join("");
    }, fc(e, [{ key: "rawSpaceBefore", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.before;
      return r === void 0 && (r = this.spaces && this.spaces.before), r || "";
    }, set: function(r) {
      (0, os.ensureObject)(this, "raws", "spaces"), this.raws.spaces.before = r;
    } }, { key: "rawSpaceAfter", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.after;
      return r === void 0 && (r = this.spaces.after), r || "";
    }, set: function(r) {
      (0, os.ensureObject)(this, "raws", "spaces"), this.raws.spaces.after = r;
    } }]), e;
  }();
  Ht.default = dc;
  ss.exports = Ht.default;
});
var pe = T((X) => {
  "use strict";
  X.__esModule = true;
  X.UNIVERSAL = X.ATTRIBUTE = X.CLASS = X.COMBINATOR = X.COMMENT = X.ID = X.NESTING = X.PSEUDO = X.ROOT = X.SELECTOR = X.STRING = X.TAG = void 0;
  var pc = "tag";
  X.TAG = pc;
  var hc = "string";
  X.STRING = hc;
  var mc = "selector";
  X.SELECTOR = mc;
  var Dc = "root";
  X.ROOT = Dc;
  var gc = "pseudo";
  X.PSEUDO = gc;
  var bc = "nesting";
  X.NESTING = bc;
  var vc = "id";
  X.ID = vc;
  var yc = "comment";
  X.COMMENT = yc;
  var xc = "combinator";
  X.COMBINATOR = xc;
  var Fc = "class";
  X.CLASS = Fc;
  var wc = "attribute";
  X.ATTRIBUTE = wc;
  var Ec = "universal";
  X.UNIVERSAL = Ec;
});
var rn = T((Vt, cs) => {
  "use strict";
  Vt.__esModule = true;
  Vt.default = void 0;
  var Sc = _c(ze()), Ue = Cc(pe());
  function fs() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return fs = function() {
      return e;
    }, e;
  }
  function Cc(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = fs();
    if (t && t.has(e))
      return t.get(e);
    var n = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var i in e)
      if (Object.prototype.hasOwnProperty.call(e, i)) {
        var o = r ? Object.getOwnPropertyDescriptor(e, i) : null;
        o && (o.get || o.set) ? Object.defineProperty(n, i, o) : n[i] = e[i];
      }
    return n.default = e, t && t.set(e, n), n;
  }
  function _c(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function kc(e, t) {
    var n;
    if (typeof Symbol > "u" || e[Symbol.iterator] == null) {
      if (Array.isArray(e) || (n = Tc(e)) || t && e && typeof e.length == "number") {
        n && (e = n);
        var r = 0;
        return function() {
          return r >= e.length ? { done: true } : { done: false, value: e[r++] };
        };
      }
      throw new TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
    }
    return n = e[Symbol.iterator](), n.next.bind(n);
  }
  function Tc(e, t) {
    if (e) {
      if (typeof e == "string")
        return as(e, t);
      var n = Object.prototype.toString.call(e).slice(8, -1);
      if (n === "Object" && e.constructor && (n = e.constructor.name), n === "Map" || n === "Set")
        return Array.from(e);
      if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
        return as(e, t);
    }
  }
  function as(e, t) {
    (t == null || t > e.length) && (t = e.length);
    for (var n = 0, r = new Array(t); n < t; n++)
      r[n] = e[n];
    return r;
  }
  function ls(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Ac(e, t, n) {
    return t && ls(e.prototype, t), n && ls(e, n), e;
  }
  function Oc(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, si(e, t);
  }
  function si(e, t) {
    return si = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, si(e, t);
  }
  var Pc = function(e) {
    Oc(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.nodes || (i.nodes = []), i;
    }
    var n = t.prototype;
    return n.append = function(i) {
      return i.parent = this, this.nodes.push(i), this;
    }, n.prepend = function(i) {
      return i.parent = this, this.nodes.unshift(i), this;
    }, n.at = function(i) {
      return this.nodes[i];
    }, n.index = function(i) {
      return typeof i == "number" ? i : this.nodes.indexOf(i);
    }, n.removeChild = function(i) {
      i = this.index(i), this.at(i).parent = void 0, this.nodes.splice(i, 1);
      var o;
      for (var u in this.indexes)
        o = this.indexes[u], o >= i && (this.indexes[u] = o - 1);
      return this;
    }, n.removeAll = function() {
      for (var i = kc(this.nodes), o; !(o = i()).done; ) {
        var u = o.value;
        u.parent = void 0;
      }
      return this.nodes = [], this;
    }, n.empty = function() {
      return this.removeAll();
    }, n.insertAfter = function(i, o) {
      o.parent = this;
      var u = this.index(i);
      this.nodes.splice(u + 1, 0, o), o.parent = this;
      var s;
      for (var a in this.indexes)
        s = this.indexes[a], u <= s && (this.indexes[a] = s + 1);
      return this;
    }, n.insertBefore = function(i, o) {
      o.parent = this;
      var u = this.index(i);
      this.nodes.splice(u, 0, o), o.parent = this;
      var s;
      for (var a in this.indexes)
        s = this.indexes[a], s <= u && (this.indexes[a] = s + 1);
      return this;
    }, n._findChildAtPosition = function(i, o) {
      var u = void 0;
      return this.each(function(s) {
        if (s.atPosition) {
          var a = s.atPosition(i, o);
          if (a)
            return u = a, false;
        } else if (s.isAtPosition(i, o))
          return u = s, false;
      }), u;
    }, n.atPosition = function(i, o) {
      if (this.isAtPosition(i, o))
        return this._findChildAtPosition(i, o) || this;
    }, n._inferEndPosition = function() {
      this.last && this.last.source && this.last.source.end && (this.source = this.source || {}, this.source.end = this.source.end || {}, Object.assign(this.source.end, this.last.source.end));
    }, n.each = function(i) {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach++;
      var o = this.lastEach;
      if (this.indexes[o] = 0, !!this.length) {
        for (var u, s; this.indexes[o] < this.length && (u = this.indexes[o], s = i(this.at(u), u), s !== false); )
          this.indexes[o] += 1;
        if (delete this.indexes[o], s === false)
          return false;
      }
    }, n.walk = function(i) {
      return this.each(function(o, u) {
        var s = i(o, u);
        if (s !== false && o.length && (s = o.walk(i)), s === false)
          return false;
      });
    }, n.walkAttributes = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.ATTRIBUTE)
          return i.call(o, u);
      });
    }, n.walkClasses = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.CLASS)
          return i.call(o, u);
      });
    }, n.walkCombinators = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.COMBINATOR)
          return i.call(o, u);
      });
    }, n.walkComments = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.COMMENT)
          return i.call(o, u);
      });
    }, n.walkIds = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.ID)
          return i.call(o, u);
      });
    }, n.walkNesting = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.NESTING)
          return i.call(o, u);
      });
    }, n.walkPseudos = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.PSEUDO)
          return i.call(o, u);
      });
    }, n.walkTags = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.TAG)
          return i.call(o, u);
      });
    }, n.walkUniversals = function(i) {
      var o = this;
      return this.walk(function(u) {
        if (u.type === Ue.UNIVERSAL)
          return i.call(o, u);
      });
    }, n.split = function(i) {
      var o = this, u = [];
      return this.reduce(function(s, a, l) {
        var f = i.call(o, a);
        return u.push(a), f ? (s.push(u), u = []) : l === o.length - 1 && s.push(u), s;
      }, []);
    }, n.map = function(i) {
      return this.nodes.map(i);
    }, n.reduce = function(i, o) {
      return this.nodes.reduce(i, o);
    }, n.every = function(i) {
      return this.nodes.every(i);
    }, n.some = function(i) {
      return this.nodes.some(i);
    }, n.filter = function(i) {
      return this.nodes.filter(i);
    }, n.sort = function(i) {
      return this.nodes.sort(i);
    }, n.toString = function() {
      return this.map(String).join("");
    }, Ac(t, [{ key: "first", get: function() {
      return this.at(0);
    } }, { key: "last", get: function() {
      return this.at(this.length - 1);
    } }, { key: "length", get: function() {
      return this.nodes.length;
    } }]), t;
  }(Sc.default);
  Vt.default = Pc;
  cs.exports = Vt.default;
});
var li = T((Yt, ps) => {
  "use strict";
  Yt.__esModule = true;
  Yt.default = void 0;
  var Bc = Rc(rn()), Ic = pe();
  function Rc(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function ds(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Lc(e, t, n) {
    return t && ds(e.prototype, t), n && ds(e, n), e;
  }
  function Mc(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, ai(e, t);
  }
  function ai(e, t) {
    return ai = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, ai(e, t);
  }
  var Nc = function(e) {
    Mc(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = Ic.ROOT, i;
    }
    var n = t.prototype;
    return n.toString = function() {
      var i = this.reduce(function(o, u) {
        return o.push(String(u)), o;
      }, []).join(",");
      return this.trailingComma ? i + "," : i;
    }, n.error = function(i, o) {
      return this._error ? this._error(i, o) : new Error(i);
    }, Lc(t, [{ key: "errorGenerator", set: function(i) {
      this._error = i;
    } }]), t;
  }(Bc.default);
  Yt.default = Nc;
  ps.exports = Yt.default;
});
var ci = T((Xt, hs) => {
  "use strict";
  Xt.__esModule = true;
  Xt.default = void 0;
  var Wc = qc(rn()), $c = pe();
  function qc(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function zc(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, fi(e, t);
  }
  function fi(e, t) {
    return fi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, fi(e, t);
  }
  var Uc = function(e) {
    zc(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = $c.SELECTOR, r;
    }
    return t;
  }(Wc.default);
  Xt.default = Uc;
  hs.exports = Xt.default;
});
var nn = T((Db, ms) => {
  "use strict";
  var Gc = {}, jc = Gc.hasOwnProperty, Hc = function(t, n) {
    if (!t)
      return n;
    var r = {};
    for (var i in n)
      r[i] = jc.call(t, i) ? t[i] : n[i];
    return r;
  }, Vc = /[ -,\.\/:-@\[-\^`\{-~]/, Yc = /[ -,\.\/:-@\[\]\^`\{-~]/, Xc = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g, di = function e(t, n) {
    n = Hc(n, e.options), n.quotes != "single" && n.quotes != "double" && (n.quotes = "single");
    for (var r = n.quotes == "double" ? '"' : "'", i = n.isIdentifier, o = t.charAt(0), u = "", s = 0, a = t.length; s < a; ) {
      var l = t.charAt(s++), f = l.charCodeAt(), c = void 0;
      if (f < 32 || f > 126) {
        if (f >= 55296 && f <= 56319 && s < a) {
          var d = t.charCodeAt(s++);
          (d & 64512) == 56320 ? f = ((f & 1023) << 10) + (d & 1023) + 65536 : s--;
        }
        c = "\\" + f.toString(16).toUpperCase() + " ";
      } else
        n.escapeEverything ? Vc.test(l) ? c = "\\" + l : c = "\\" + f.toString(16).toUpperCase() + " " : /[\t\n\f\r\x0B]/.test(l) ? c = "\\" + f.toString(16).toUpperCase() + " " : l == "\\" || !i && (l == '"' && r == l || l == "'" && r == l) || i && Yc.test(l) ? c = "\\" + l : c = l;
      u += c;
    }
    return i && (/^-[-\d]/.test(u) ? u = "\\-" + u.slice(1) : /\d/.test(o) && (u = "\\3" + o + " " + u.slice(1))), u = u.replace(Xc, function(h, p, m) {
      return p && p.length % 2 ? h : (p || "") + m;
    }), !i && n.wrap ? r + u + r : u;
  };
  di.options = { escapeEverything: false, isIdentifier: false, quotes: "single", wrap: false };
  di.version = "3.0.0";
  ms.exports = di;
});
var hi = T((Qt, bs) => {
  "use strict";
  Qt.__esModule = true;
  Qt.default = void 0;
  var Qc = gs(nn()), Kc = jt(), Jc = gs(ze()), Zc = pe();
  function gs(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ds(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function ed(e, t, n) {
    return t && Ds(e.prototype, t), n && Ds(e, n), e;
  }
  function td2(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, pi(e, t);
  }
  function pi(e, t) {
    return pi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, pi(e, t);
  }
  var rd = function(e) {
    td2(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = Zc.CLASS, i._constructed = true, i;
    }
    var n = t.prototype;
    return n.valueToString = function() {
      return "." + e.prototype.valueToString.call(this);
    }, ed(t, [{ key: "value", get: function() {
      return this._value;
    }, set: function(i) {
      if (this._constructed) {
        var o = (0, Qc.default)(i, { isIdentifier: true });
        o !== i ? ((0, Kc.ensureObject)(this, "raws"), this.raws.value = o) : this.raws && delete this.raws.value;
      }
      this._value = i;
    } }]), t;
  }(Jc.default);
  Qt.default = rd;
  bs.exports = Qt.default;
});
var Di = T((Kt, vs) => {
  "use strict";
  Kt.__esModule = true;
  Kt.default = void 0;
  var nd = od(ze()), id = pe();
  function od(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function ud(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, mi(e, t);
  }
  function mi(e, t) {
    return mi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, mi(e, t);
  }
  var sd = function(e) {
    ud(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = id.COMMENT, r;
    }
    return t;
  }(nd.default);
  Kt.default = sd;
  vs.exports = Kt.default;
});
var bi = T((Jt, ys) => {
  "use strict";
  Jt.__esModule = true;
  Jt.default = void 0;
  var ad = fd2(ze()), ld = pe();
  function fd2(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function cd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, gi(e, t);
  }
  function gi(e, t) {
    return gi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, gi(e, t);
  }
  var dd = function(e) {
    cd(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = ld.ID, i;
    }
    var n = t.prototype;
    return n.valueToString = function() {
      return "#" + e.prototype.valueToString.call(this);
    }, t;
  }(ad.default);
  Jt.default = dd;
  ys.exports = Jt.default;
});
var on = T((Zt, ws) => {
  "use strict";
  Zt.__esModule = true;
  Zt.default = void 0;
  var pd = Fs(nn()), hd = jt(), md = Fs(ze());
  function Fs(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function xs(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Dd(e, t, n) {
    return t && xs(e.prototype, t), n && xs(e, n), e;
  }
  function gd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, vi(e, t);
  }
  function vi(e, t) {
    return vi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, vi(e, t);
  }
  var bd = function(e) {
    gd(t, e);
    function t() {
      return e.apply(this, arguments) || this;
    }
    var n = t.prototype;
    return n.qualifiedName = function(i) {
      return this.namespace ? this.namespaceString + "|" + i : i;
    }, n.valueToString = function() {
      return this.qualifiedName(e.prototype.valueToString.call(this));
    }, Dd(t, [{ key: "namespace", get: function() {
      return this._namespace;
    }, set: function(i) {
      if (i === true || i === "*" || i === "&") {
        this._namespace = i, this.raws && delete this.raws.namespace;
        return;
      }
      var o = (0, pd.default)(i, { isIdentifier: true });
      this._namespace = i, o !== i ? ((0, hd.ensureObject)(this, "raws"), this.raws.namespace = o) : this.raws && delete this.raws.namespace;
    } }, { key: "ns", get: function() {
      return this._namespace;
    }, set: function(i) {
      this.namespace = i;
    } }, { key: "namespaceString", get: function() {
      if (this.namespace) {
        var i = this.stringifyProperty("namespace");
        return i === true ? "" : i;
      } else
        return "";
    } }]), t;
  }(md.default);
  Zt.default = bd;
  ws.exports = Zt.default;
});
var xi = T((er, Es) => {
  "use strict";
  er.__esModule = true;
  er.default = void 0;
  var vd = xd(on()), yd = pe();
  function xd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Fd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, yi(e, t);
  }
  function yi(e, t) {
    return yi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, yi(e, t);
  }
  var wd = function(e) {
    Fd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = yd.TAG, r;
    }
    return t;
  }(vd.default);
  er.default = wd;
  Es.exports = er.default;
});
var wi = T((tr, Ss) => {
  "use strict";
  tr.__esModule = true;
  tr.default = void 0;
  var Ed = Cd(ze()), Sd = pe();
  function Cd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function _d(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Fi(e, t);
  }
  function Fi(e, t) {
    return Fi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Fi(e, t);
  }
  var kd = function(e) {
    _d(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Sd.STRING, r;
    }
    return t;
  }(Ed.default);
  tr.default = kd;
  Ss.exports = tr.default;
});
var Si = T((rr, Cs) => {
  "use strict";
  rr.__esModule = true;
  rr.default = void 0;
  var Td = Od(rn()), Ad = pe();
  function Od(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Pd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Ei(e, t);
  }
  function Ei(e, t) {
    return Ei = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Ei(e, t);
  }
  var Bd = function(e) {
    Pd(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = Ad.PSEUDO, i;
    }
    var n = t.prototype;
    return n.toString = function() {
      var i = this.length ? "(" + this.map(String).join(",") + ")" : "";
      return [this.rawSpaceBefore, this.stringifyProperty("value"), i, this.rawSpaceAfter].join("");
    }, t;
  }(Td.default);
  rr.default = Bd;
  Cs.exports = rr.default;
});
var ks = T((gb, _s) => {
  _s.exports = function(t, n) {
    return function(...r) {
      return console.warn(n), t(...r);
    };
  };
});
var Oi = T((or) => {
  "use strict";
  or.__esModule = true;
  or.unescapeValue = Ai;
  or.default = void 0;
  var nr = Ti(nn()), Id = Ti(ui()), Rd = Ti(on()), Ld = pe(), Ci;
  function Ti(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ts(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Md(e, t, n) {
    return t && Ts(e.prototype, t), n && Ts(e, n), e;
  }
  function Nd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, ki(e, t);
  }
  function ki(e, t) {
    return ki = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, ki(e, t);
  }
  var ir = ks(), Wd = /^('|")([^]*)\1$/, $d = ir(function() {
  }, "Assigning an attribute a value containing characters that might need to be escaped is deprecated. Call attribute.setValue() instead."), qd = ir(function() {
  }, "Assigning attr.quoted is deprecated and has no effect. Assign to attr.quoteMark instead."), zd = ir(function() {
  }, "Constructing an Attribute selector with a value without specifying quoteMark is deprecated. Note: The value should be unescaped now.");
  function Ai(e) {
    var t = false, n = null, r = e, i = r.match(Wd);
    return i && (n = i[1], r = i[2]), r = (0, Id.default)(r), r !== e && (t = true), { deprecatedUsage: t, unescaped: r, quoteMark: n };
  }
  function Ud(e) {
    if (e.quoteMark !== void 0 || e.value === void 0)
      return e;
    zd();
    var t = Ai(e.value), n = t.quoteMark, r = t.unescaped;
    return e.raws || (e.raws = {}), e.raws.value === void 0 && (e.raws.value = e.value), e.value = r, e.quoteMark = n, e;
  }
  var un = function(e) {
    Nd(t, e);
    function t(r) {
      var i;
      return r === void 0 && (r = {}), i = e.call(this, Ud(r)) || this, i.type = Ld.ATTRIBUTE, i.raws = i.raws || {}, Object.defineProperty(i.raws, "unquoted", { get: ir(function() {
        return i.value;
      }, "attr.raws.unquoted is deprecated. Call attr.value instead."), set: ir(function() {
        return i.value;
      }, "Setting attr.raws.unquoted is deprecated and has no effect. attr.value is unescaped by default now.") }), i._constructed = true, i;
    }
    var n = t.prototype;
    return n.getQuotedValue = function(i) {
      i === void 0 && (i = {});
      var o = this._determineQuoteMark(i), u = _i[o], s = (0, nr.default)(this._value, u);
      return s;
    }, n._determineQuoteMark = function(i) {
      return i.smart ? this.smartQuoteMark(i) : this.preferredQuoteMark(i);
    }, n.setValue = function(i, o) {
      o === void 0 && (o = {}), this._value = i, this._quoteMark = this._determineQuoteMark(o), this._syncRawValue();
    }, n.smartQuoteMark = function(i) {
      var o = this.value, u = o.replace(/[^']/g, "").length, s = o.replace(/[^"]/g, "").length;
      if (u + s === 0) {
        var a = (0, nr.default)(o, { isIdentifier: true });
        if (a === o)
          return t.NO_QUOTE;
        var l = this.preferredQuoteMark(i);
        if (l === t.NO_QUOTE) {
          var f = this.quoteMark || i.quoteMark || t.DOUBLE_QUOTE, c = _i[f], d = (0, nr.default)(o, c);
          if (d.length < a.length)
            return f;
        }
        return l;
      } else
        return s === u ? this.preferredQuoteMark(i) : s < u ? t.DOUBLE_QUOTE : t.SINGLE_QUOTE;
    }, n.preferredQuoteMark = function(i) {
      var o = i.preferCurrentQuoteMark ? this.quoteMark : i.quoteMark;
      return o === void 0 && (o = i.preferCurrentQuoteMark ? i.quoteMark : this.quoteMark), o === void 0 && (o = t.DOUBLE_QUOTE), o;
    }, n._syncRawValue = function() {
      var i = (0, nr.default)(this._value, _i[this.quoteMark]);
      i === this._value ? this.raws && delete this.raws.value : this.raws.value = i;
    }, n._handleEscapes = function(i, o) {
      if (this._constructed) {
        var u = (0, nr.default)(o, { isIdentifier: true });
        u !== o ? this.raws[i] = u : delete this.raws[i];
      }
    }, n._spacesFor = function(i) {
      var o = { before: "", after: "" }, u = this.spaces[i] || {}, s = this.raws.spaces && this.raws.spaces[i] || {};
      return Object.assign(o, u, s);
    }, n._stringFor = function(i, o, u) {
      o === void 0 && (o = i), u === void 0 && (u = As);
      var s = this._spacesFor(o);
      return u(this.stringifyProperty(i), s);
    }, n.offsetOf = function(i) {
      var o = 1, u = this._spacesFor("attribute");
      if (o += u.before.length, i === "namespace" || i === "ns")
        return this.namespace ? o : -1;
      if (i === "attributeNS" || (o += this.namespaceString.length, this.namespace && (o += 1), i === "attribute"))
        return o;
      o += this.stringifyProperty("attribute").length, o += u.after.length;
      var s = this._spacesFor("operator");
      o += s.before.length;
      var a = this.stringifyProperty("operator");
      if (i === "operator")
        return a ? o : -1;
      o += a.length, o += s.after.length;
      var l = this._spacesFor("value");
      o += l.before.length;
      var f = this.stringifyProperty("value");
      if (i === "value")
        return f ? o : -1;
      o += f.length, o += l.after.length;
      var c = this._spacesFor("insensitive");
      return o += c.before.length, i === "insensitive" && this.insensitive ? o : -1;
    }, n.toString = function() {
      var i = this, o = [this.rawSpaceBefore, "["];
      return o.push(this._stringFor("qualifiedAttribute", "attribute")), this.operator && (this.value || this.value === "") && (o.push(this._stringFor("operator")), o.push(this._stringFor("value")), o.push(this._stringFor("insensitiveFlag", "insensitive", function(u, s) {
        return u.length > 0 && !i.quoted && s.before.length === 0 && !(i.spaces.value && i.spaces.value.after) && (s.before = " "), As(u, s);
      }))), o.push("]"), o.push(this.rawSpaceAfter), o.join("");
    }, Md(t, [{ key: "quoted", get: function() {
      var i = this.quoteMark;
      return i === "'" || i === '"';
    }, set: function(i) {
      qd();
    } }, { key: "quoteMark", get: function() {
      return this._quoteMark;
    }, set: function(i) {
      if (!this._constructed) {
        this._quoteMark = i;
        return;
      }
      this._quoteMark !== i && (this._quoteMark = i, this._syncRawValue());
    } }, { key: "qualifiedAttribute", get: function() {
      return this.qualifiedName(this.raws.attribute || this.attribute);
    } }, { key: "insensitiveFlag", get: function() {
      return this.insensitive ? "i" : "";
    } }, { key: "value", get: function() {
      return this._value;
    }, set: function(i) {
      if (this._constructed) {
        var o = Ai(i), u = o.deprecatedUsage, s = o.unescaped, a = o.quoteMark;
        if (u && $d(), s === this._value && a === this._quoteMark)
          return;
        this._value = s, this._quoteMark = a, this._syncRawValue();
      } else
        this._value = i;
    } }, { key: "attribute", get: function() {
      return this._attribute;
    }, set: function(i) {
      this._handleEscapes("attribute", i), this._attribute = i;
    } }]), t;
  }(Rd.default);
  or.default = un;
  un.NO_QUOTE = null;
  un.SINGLE_QUOTE = "'";
  un.DOUBLE_QUOTE = '"';
  var _i = (Ci = { "'": { quotes: "single", wrap: true }, '"': { quotes: "double", wrap: true } }, Ci[null] = { isIdentifier: true }, Ci);
  function As(e, t) {
    return "" + t.before + e + t.after;
  }
});
var Bi = T((ur, Os) => {
  "use strict";
  ur.__esModule = true;
  ur.default = void 0;
  var Gd = Hd(on()), jd = pe();
  function Hd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Vd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Pi(e, t);
  }
  function Pi(e, t) {
    return Pi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Pi(e, t);
  }
  var Yd = function(e) {
    Vd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = jd.UNIVERSAL, r.value = "*", r;
    }
    return t;
  }(Gd.default);
  ur.default = Yd;
  Os.exports = ur.default;
});
var Ri = T((sr, Ps) => {
  "use strict";
  sr.__esModule = true;
  sr.default = void 0;
  var Xd = Kd(ze()), Qd = pe();
  function Kd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Jd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Ii(e, t);
  }
  function Ii(e, t) {
    return Ii = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Ii(e, t);
  }
  var Zd = function(e) {
    Jd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Qd.COMBINATOR, r;
    }
    return t;
  }(Xd.default);
  sr.default = Zd;
  Ps.exports = sr.default;
});
var Mi = T((ar, Bs) => {
  "use strict";
  ar.__esModule = true;
  ar.default = void 0;
  var ep = rp(ze()), tp = pe();
  function rp(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function np(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Li(e, t);
  }
  function Li(e, t) {
    return Li = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Li(e, t);
  }
  var ip = function(e) {
    np(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = tp.NESTING, r.value = "&", r;
    }
    return t;
  }(ep.default);
  ar.default = ip;
  Bs.exports = ar.default;
});
var Rs = T((sn, Is) => {
  "use strict";
  sn.__esModule = true;
  sn.default = op;
  function op(e) {
    return e.sort(function(t, n) {
      return t - n;
    });
  }
  Is.exports = sn.default;
});
var Ni = T((_) => {
  "use strict";
  _.__esModule = true;
  _.combinator = _.word = _.comment = _.str = _.tab = _.newline = _.feed = _.cr = _.backslash = _.bang = _.slash = _.doubleQuote = _.singleQuote = _.space = _.greaterThan = _.pipe = _.equals = _.plus = _.caret = _.tilde = _.dollar = _.closeSquare = _.openSquare = _.closeParenthesis = _.openParenthesis = _.semicolon = _.colon = _.comma = _.at = _.asterisk = _.ampersand = void 0;
  var up = 38;
  _.ampersand = up;
  var sp = 42;
  _.asterisk = sp;
  var ap = 64;
  _.at = ap;
  var lp = 44;
  _.comma = lp;
  var fp = 58;
  _.colon = fp;
  var cp = 59;
  _.semicolon = cp;
  var dp = 40;
  _.openParenthesis = dp;
  var pp = 41;
  _.closeParenthesis = pp;
  var hp = 91;
  _.openSquare = hp;
  var mp = 93;
  _.closeSquare = mp;
  var Dp = 36;
  _.dollar = Dp;
  var gp = 126;
  _.tilde = gp;
  var bp = 94;
  _.caret = bp;
  var vp = 43;
  _.plus = vp;
  var yp = 61;
  _.equals = yp;
  var xp = 124;
  _.pipe = xp;
  var Fp = 62;
  _.greaterThan = Fp;
  var wp = 32;
  _.space = wp;
  var Ls = 39;
  _.singleQuote = Ls;
  var Ep = 34;
  _.doubleQuote = Ep;
  var Sp = 47;
  _.slash = Sp;
  var Cp = 33;
  _.bang = Cp;
  var _p = 92;
  _.backslash = _p;
  var kp = 13;
  _.cr = kp;
  var Tp = 12;
  _.feed = Tp;
  var Ap = 10;
  _.newline = Ap;
  var Op = 9;
  _.tab = Op;
  var Pp = Ls;
  _.str = Pp;
  var Bp = -1;
  _.comment = Bp;
  var Ip = -2;
  _.word = Ip;
  var Rp = -3;
  _.combinator = Rp;
});
var Ws = T((lr) => {
  "use strict";
  lr.__esModule = true;
  lr.default = zp;
  lr.FIELDS = void 0;
  var E = Lp(Ni()), Ft, V;
  function Ns() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return Ns = function() {
      return e;
    }, e;
  }
  function Lp(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = Ns();
    if (t && t.has(e))
      return t.get(e);
    var n = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var i in e)
      if (Object.prototype.hasOwnProperty.call(e, i)) {
        var o = r ? Object.getOwnPropertyDescriptor(e, i) : null;
        o && (o.get || o.set) ? Object.defineProperty(n, i, o) : n[i] = e[i];
      }
    return n.default = e, t && t.set(e, n), n;
  }
  var Mp = (Ft = {}, Ft[E.tab] = true, Ft[E.newline] = true, Ft[E.cr] = true, Ft[E.feed] = true, Ft), Np = (V = {}, V[E.space] = true, V[E.tab] = true, V[E.newline] = true, V[E.cr] = true, V[E.feed] = true, V[E.ampersand] = true, V[E.asterisk] = true, V[E.bang] = true, V[E.comma] = true, V[E.colon] = true, V[E.semicolon] = true, V[E.openParenthesis] = true, V[E.closeParenthesis] = true, V[E.openSquare] = true, V[E.closeSquare] = true, V[E.singleQuote] = true, V[E.doubleQuote] = true, V[E.plus] = true, V[E.pipe] = true, V[E.tilde] = true, V[E.greaterThan] = true, V[E.equals] = true, V[E.dollar] = true, V[E.caret] = true, V[E.slash] = true, V), Wi = {}, Ms = "0123456789abcdefABCDEF";
  for (an = 0; an < Ms.length; an++)
    Wi[Ms.charCodeAt(an)] = true;
  var an;
  function Wp(e, t) {
    var n = t, r;
    do {
      if (r = e.charCodeAt(n), Np[r])
        return n - 1;
      r === E.backslash ? n = $p(e, n) + 1 : n++;
    } while (n < e.length);
    return n - 1;
  }
  function $p(e, t) {
    var n = t, r = e.charCodeAt(n + 1);
    if (!Mp[r])
      if (Wi[r]) {
        var i = 0;
        do
          n++, i++, r = e.charCodeAt(n + 1);
        while (Wi[r] && i < 6);
        i < 6 && r === E.space && n++;
      } else
        n++;
    return n;
  }
  var qp = { TYPE: 0, START_LINE: 1, START_COL: 2, END_LINE: 3, END_COL: 4, START_POS: 5, END_POS: 6 };
  lr.FIELDS = qp;
  function zp(e) {
    var t = [], n = e.css.valueOf(), r = n, i = r.length, o = -1, u = 1, s = 0, a = 0, l, f, c, d, h, p, m, v, D, b, y, F, x;
    function k(B, I) {
      if (e.safe)
        n += I, D = n.length - 1;
      else
        throw e.error("Unclosed " + B, u, s - o, s);
    }
    for (; s < i; ) {
      switch (l = n.charCodeAt(s), l === E.newline && (o = s, u += 1), l) {
        case E.space:
        case E.tab:
        case E.newline:
        case E.cr:
        case E.feed:
          D = s;
          do
            D += 1, l = n.charCodeAt(D), l === E.newline && (o = D, u += 1);
          while (l === E.space || l === E.newline || l === E.tab || l === E.cr || l === E.feed);
          x = E.space, d = u, c = D - o - 1, a = D;
          break;
        case E.plus:
        case E.greaterThan:
        case E.tilde:
        case E.pipe:
          D = s;
          do
            D += 1, l = n.charCodeAt(D);
          while (l === E.plus || l === E.greaterThan || l === E.tilde || l === E.pipe);
          x = E.combinator, d = u, c = s - o, a = D;
          break;
        case E.asterisk:
        case E.ampersand:
        case E.bang:
        case E.comma:
        case E.equals:
        case E.dollar:
        case E.caret:
        case E.openSquare:
        case E.closeSquare:
        case E.colon:
        case E.semicolon:
        case E.openParenthesis:
        case E.closeParenthesis:
          D = s, x = l, d = u, c = s - o, a = D + 1;
          break;
        case E.singleQuote:
        case E.doubleQuote:
          F = l === E.singleQuote ? "'" : '"', D = s;
          do
            for (h = false, D = n.indexOf(F, D + 1), D === -1 && k("quote", F), p = D; n.charCodeAt(p - 1) === E.backslash; )
              p -= 1, h = !h;
          while (h);
          x = E.str, d = u, c = s - o, a = D + 1;
          break;
        default:
          l === E.slash && n.charCodeAt(s + 1) === E.asterisk ? (D = n.indexOf("*/", s + 2) + 1, D === 0 && k("comment", "*/"), f = n.slice(s, D + 1), v = f.split(`
`), m = v.length - 1, m > 0 ? (b = u + m, y = D - v[m].length) : (b = u, y = o), x = E.comment, u = b, d = b, c = D - y) : l === E.slash ? (D = s, x = l, d = u, c = s - o, a = D + 1) : (D = Wp(n, s), x = E.word, d = u, c = D - o), a = D + 1;
          break;
      }
      t.push([x, u, s - o, d, c, s, a]), y && (o = y, y = null), s = a;
    }
    return t;
  }
});
var Vs = T((fr, Hs) => {
  "use strict";
  fr.__esModule = true;
  fr.default = void 0;
  var Up = Se(li()), $i = Se(ci()), Gp = Se(hi()), $s = Se(Di()), jp = Se(bi()), Hp = Se(xi()), qi = Se(wi()), Vp = Se(Si()), qs = ln(Oi()), Yp = Se(Bi()), zi = Se(Ri()), Xp = Se(Mi()), Qp = Se(Rs()), w = ln(Ws()), C = ln(Ni()), Kp = ln(pe()), re = jt(), st, Ui;
  function js() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return js = function() {
      return e;
    }, e;
  }
  function ln(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = js();
    if (t && t.has(e))
      return t.get(e);
    var n = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var i in e)
      if (Object.prototype.hasOwnProperty.call(e, i)) {
        var o = r ? Object.getOwnPropertyDescriptor(e, i) : null;
        o && (o.get || o.set) ? Object.defineProperty(n, i, o) : n[i] = e[i];
      }
    return n.default = e, t && t.set(e, n), n;
  }
  function Se(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function zs(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Jp(e, t, n) {
    return t && zs(e.prototype, t), n && zs(e, n), e;
  }
  var Hi = (st = {}, st[C.space] = true, st[C.cr] = true, st[C.feed] = true, st[C.newline] = true, st[C.tab] = true, st), Zp = Object.assign({}, Hi, (Ui = {}, Ui[C.comment] = true, Ui));
  function Us(e) {
    return { line: e[w.FIELDS.START_LINE], column: e[w.FIELDS.START_COL] };
  }
  function Gs(e) {
    return { line: e[w.FIELDS.END_LINE], column: e[w.FIELDS.END_COL] };
  }
  function at(e, t, n, r) {
    return { start: { line: e, column: t }, end: { line: n, column: r } };
  }
  function wt(e) {
    return at(e[w.FIELDS.START_LINE], e[w.FIELDS.START_COL], e[w.FIELDS.END_LINE], e[w.FIELDS.END_COL]);
  }
  function Gi(e, t) {
    if (e)
      return at(e[w.FIELDS.START_LINE], e[w.FIELDS.START_COL], t[w.FIELDS.END_LINE], t[w.FIELDS.END_COL]);
  }
  function Et(e, t) {
    var n = e[t];
    if (typeof n == "string")
      return n.indexOf("\\") !== -1 && ((0, re.ensureObject)(e, "raws"), e[t] = (0, re.unesc)(n), e.raws[t] === void 0 && (e.raws[t] = n)), e;
  }
  function ji(e, t) {
    for (var n = -1, r = []; (n = e.indexOf(t, n + 1)) !== -1; )
      r.push(n);
    return r;
  }
  function e0() {
    var e = Array.prototype.concat.apply([], arguments);
    return e.filter(function(t, n) {
      return n === e.indexOf(t);
    });
  }
  var t0 = function() {
    function e(n, r) {
      r === void 0 && (r = {}), this.rule = n, this.options = Object.assign({ lossy: false, safe: false }, r), this.position = 0, this.css = typeof this.rule == "string" ? this.rule : this.rule.selector, this.tokens = (0, w.default)({ css: this.css, error: this._errorGenerator(), safe: this.options.safe });
      var i = Gi(this.tokens[0], this.tokens[this.tokens.length - 1]);
      this.root = new Up.default({ source: i }), this.root.errorGenerator = this._errorGenerator();
      var o = new $i.default({ source: { start: { line: 1, column: 1 } } });
      this.root.append(o), this.current = o, this.loop();
    }
    var t = e.prototype;
    return t._errorGenerator = function() {
      var r = this;
      return function(i, o) {
        return typeof r.rule == "string" ? new Error(i) : r.rule.error(i, o);
      };
    }, t.attribute = function() {
      var r = [], i = this.currToken;
      for (this.position++; this.position < this.tokens.length && this.currToken[w.FIELDS.TYPE] !== C.closeSquare; )
        r.push(this.currToken), this.position++;
      if (this.currToken[w.FIELDS.TYPE] !== C.closeSquare)
        return this.expected("closing square bracket", this.currToken[w.FIELDS.START_POS]);
      var o = r.length, u = { source: at(i[1], i[2], this.currToken[3], this.currToken[4]), sourceIndex: i[w.FIELDS.START_POS] };
      if (o === 1 && !~[C.word].indexOf(r[0][w.FIELDS.TYPE]))
        return this.expected("attribute", r[0][w.FIELDS.START_POS]);
      for (var s = 0, a = "", l = "", f = null, c = false; s < o; ) {
        var d = r[s], h = this.content(d), p = r[s + 1];
        switch (d[w.FIELDS.TYPE]) {
          case C.space:
            if (c = true, this.options.lossy)
              break;
            if (f) {
              (0, re.ensureObject)(u, "spaces", f);
              var m = u.spaces[f].after || "";
              u.spaces[f].after = m + h;
              var v = (0, re.getProp)(u, "raws", "spaces", f, "after") || null;
              v && (u.raws.spaces[f].after = v + h);
            } else
              a = a + h, l = l + h;
            break;
          case C.asterisk:
            if (p[w.FIELDS.TYPE] === C.equals)
              u.operator = h, f = "operator";
            else if ((!u.namespace || f === "namespace" && !c) && p) {
              a && ((0, re.ensureObject)(u, "spaces", "attribute"), u.spaces.attribute.before = a, a = ""), l && ((0, re.ensureObject)(u, "raws", "spaces", "attribute"), u.raws.spaces.attribute.before = a, l = ""), u.namespace = (u.namespace || "") + h;
              var D = (0, re.getProp)(u, "raws", "namespace") || null;
              D && (u.raws.namespace += h), f = "namespace";
            }
            c = false;
            break;
          case C.dollar:
            if (f === "value") {
              var b = (0, re.getProp)(u, "raws", "value");
              u.value += "$", b && (u.raws.value = b + "$");
              break;
            }
          case C.caret:
            p[w.FIELDS.TYPE] === C.equals && (u.operator = h, f = "operator"), c = false;
            break;
          case C.combinator:
            if (h === "~" && p[w.FIELDS.TYPE] === C.equals && (u.operator = h, f = "operator"), h !== "|") {
              c = false;
              break;
            }
            p[w.FIELDS.TYPE] === C.equals ? (u.operator = h, f = "operator") : !u.namespace && !u.attribute && (u.namespace = true), c = false;
            break;
          case C.word:
            if (p && this.content(p) === "|" && r[s + 2] && r[s + 2][w.FIELDS.TYPE] !== C.equals && !u.operator && !u.namespace)
              u.namespace = h, f = "namespace";
            else if (!u.attribute || f === "attribute" && !c) {
              a && ((0, re.ensureObject)(u, "spaces", "attribute"), u.spaces.attribute.before = a, a = ""), l && ((0, re.ensureObject)(u, "raws", "spaces", "attribute"), u.raws.spaces.attribute.before = l, l = ""), u.attribute = (u.attribute || "") + h;
              var y = (0, re.getProp)(u, "raws", "attribute") || null;
              y && (u.raws.attribute += h), f = "attribute";
            } else if (!u.value && u.value !== "" || f === "value" && !c) {
              var F = (0, re.unesc)(h), x = (0, re.getProp)(u, "raws", "value") || "", k = u.value || "";
              u.value = k + F, u.quoteMark = null, (F !== h || x) && ((0, re.ensureObject)(u, "raws"), u.raws.value = (x || k) + h), f = "value";
            } else {
              var B = h === "i" || h === "I";
              (u.value || u.value === "") && (u.quoteMark || c) ? (u.insensitive = B, (!B || h === "I") && ((0, re.ensureObject)(u, "raws"), u.raws.insensitiveFlag = h), f = "insensitive", a && ((0, re.ensureObject)(u, "spaces", "insensitive"), u.spaces.insensitive.before = a, a = ""), l && ((0, re.ensureObject)(u, "raws", "spaces", "insensitive"), u.raws.spaces.insensitive.before = l, l = "")) : (u.value || u.value === "") && (f = "value", u.value += h, u.raws.value && (u.raws.value += h));
            }
            c = false;
            break;
          case C.str:
            if (!u.attribute || !u.operator)
              return this.error("Expected an attribute followed by an operator preceding the string.", { index: d[w.FIELDS.START_POS] });
            var I = (0, qs.unescapeValue)(h), G = I.unescaped, ue = I.quoteMark;
            u.value = G, u.quoteMark = ue, f = "value", (0, re.ensureObject)(u, "raws"), u.raws.value = h, c = false;
            break;
          case C.equals:
            if (!u.attribute)
              return this.expected("attribute", d[w.FIELDS.START_POS], h);
            if (u.value)
              return this.error('Unexpected "=" found; an operator was already defined.', { index: d[w.FIELDS.START_POS] });
            u.operator = u.operator ? u.operator + h : h, f = "operator", c = false;
            break;
          case C.comment:
            if (f)
              if (c || p && p[w.FIELDS.TYPE] === C.space || f === "insensitive") {
                var ae = (0, re.getProp)(u, "spaces", f, "after") || "", ie = (0, re.getProp)(u, "raws", "spaces", f, "after") || ae;
                (0, re.ensureObject)(u, "raws", "spaces", f), u.raws.spaces[f].after = ie + h;
              } else {
                var N = u[f] || "", R = (0, re.getProp)(u, "raws", f) || N;
                (0, re.ensureObject)(u, "raws"), u.raws[f] = R + h;
              }
            else
              l = l + h;
            break;
          default:
            return this.error('Unexpected "' + h + '" found.', { index: d[w.FIELDS.START_POS] });
        }
        s++;
      }
      Et(u, "attribute"), Et(u, "namespace"), this.newNode(new qs.default(u)), this.position++;
    }, t.parseWhitespaceEquivalentTokens = function(r) {
      r < 0 && (r = this.tokens.length);
      var i = this.position, o = [], u = "", s = void 0;
      do
        if (Hi[this.currToken[w.FIELDS.TYPE]])
          this.options.lossy || (u += this.content());
        else if (this.currToken[w.FIELDS.TYPE] === C.comment) {
          var a = {};
          u && (a.before = u, u = ""), s = new $s.default({ value: this.content(), source: wt(this.currToken), sourceIndex: this.currToken[w.FIELDS.START_POS], spaces: a }), o.push(s);
        }
      while (++this.position < r);
      if (u) {
        if (s)
          s.spaces.after = u;
        else if (!this.options.lossy) {
          var l = this.tokens[i], f = this.tokens[this.position - 1];
          o.push(new qi.default({ value: "", source: at(l[w.FIELDS.START_LINE], l[w.FIELDS.START_COL], f[w.FIELDS.END_LINE], f[w.FIELDS.END_COL]), sourceIndex: l[w.FIELDS.START_POS], spaces: { before: u, after: "" } }));
        }
      }
      return o;
    }, t.convertWhitespaceNodesToSpace = function(r, i) {
      var o = this;
      i === void 0 && (i = false);
      var u = "", s = "";
      r.forEach(function(l) {
        var f = o.lossySpace(l.spaces.before, i), c = o.lossySpace(l.rawSpaceBefore, i);
        u += f + o.lossySpace(l.spaces.after, i && f.length === 0), s += f + l.value + o.lossySpace(l.rawSpaceAfter, i && c.length === 0);
      }), s === u && (s = void 0);
      var a = { space: u, rawSpace: s };
      return a;
    }, t.isNamedCombinator = function(r) {
      return r === void 0 && (r = this.position), this.tokens[r + 0] && this.tokens[r + 0][w.FIELDS.TYPE] === C.slash && this.tokens[r + 1] && this.tokens[r + 1][w.FIELDS.TYPE] === C.word && this.tokens[r + 2] && this.tokens[r + 2][w.FIELDS.TYPE] === C.slash;
    }, t.namedCombinator = function() {
      if (this.isNamedCombinator()) {
        var r = this.content(this.tokens[this.position + 1]), i = (0, re.unesc)(r).toLowerCase(), o = {};
        i !== r && (o.value = "/" + r + "/");
        var u = new zi.default({ value: "/" + i + "/", source: at(this.currToken[w.FIELDS.START_LINE], this.currToken[w.FIELDS.START_COL], this.tokens[this.position + 2][w.FIELDS.END_LINE], this.tokens[this.position + 2][w.FIELDS.END_COL]), sourceIndex: this.currToken[w.FIELDS.START_POS], raws: o });
        return this.position = this.position + 3, u;
      } else
        this.unexpected();
    }, t.combinator = function() {
      var r = this;
      if (this.content() === "|")
        return this.namespace();
      var i = this.locateNextMeaningfulToken(this.position);
      if (i < 0 || this.tokens[i][w.FIELDS.TYPE] === C.comma) {
        var o = this.parseWhitespaceEquivalentTokens(i);
        if (o.length > 0) {
          var u = this.current.last;
          if (u) {
            var s = this.convertWhitespaceNodesToSpace(o), a = s.space, l = s.rawSpace;
            l !== void 0 && (u.rawSpaceAfter += l), u.spaces.after += a;
          } else
            o.forEach(function(x) {
              return r.newNode(x);
            });
        }
        return;
      }
      var f = this.currToken, c = void 0;
      i > this.position && (c = this.parseWhitespaceEquivalentTokens(i));
      var d;
      if (this.isNamedCombinator() ? d = this.namedCombinator() : this.currToken[w.FIELDS.TYPE] === C.combinator ? (d = new zi.default({ value: this.content(), source: wt(this.currToken), sourceIndex: this.currToken[w.FIELDS.START_POS] }), this.position++) : Hi[this.currToken[w.FIELDS.TYPE]] || c || this.unexpected(), d) {
        if (c) {
          var h = this.convertWhitespaceNodesToSpace(c), p = h.space, m = h.rawSpace;
          d.spaces.before = p, d.rawSpaceBefore = m;
        }
      } else {
        var v = this.convertWhitespaceNodesToSpace(c, true), D = v.space, b = v.rawSpace;
        b || (b = D);
        var y = {}, F = { spaces: {} };
        D.endsWith(" ") && b.endsWith(" ") ? (y.before = D.slice(0, D.length - 1), F.spaces.before = b.slice(0, b.length - 1)) : D.startsWith(" ") && b.startsWith(" ") ? (y.after = D.slice(1), F.spaces.after = b.slice(1)) : F.value = b, d = new zi.default({ value: " ", source: Gi(f, this.tokens[this.position - 1]), sourceIndex: f[w.FIELDS.START_POS], spaces: y, raws: F });
      }
      return this.currToken && this.currToken[w.FIELDS.TYPE] === C.space && (d.spaces.after = this.optionalSpace(this.content()), this.position++), this.newNode(d);
    }, t.comma = function() {
      if (this.position === this.tokens.length - 1) {
        this.root.trailingComma = true, this.position++;
        return;
      }
      this.current._inferEndPosition();
      var r = new $i.default({ source: { start: Us(this.tokens[this.position + 1]) } });
      this.current.parent.append(r), this.current = r, this.position++;
    }, t.comment = function() {
      var r = this.currToken;
      this.newNode(new $s.default({ value: this.content(), source: wt(r), sourceIndex: r[w.FIELDS.START_POS] })), this.position++;
    }, t.error = function(r, i) {
      throw this.root.error(r, i);
    }, t.missingBackslash = function() {
      return this.error("Expected a backslash preceding the semicolon.", { index: this.currToken[w.FIELDS.START_POS] });
    }, t.missingParenthesis = function() {
      return this.expected("opening parenthesis", this.currToken[w.FIELDS.START_POS]);
    }, t.missingSquareBracket = function() {
      return this.expected("opening square bracket", this.currToken[w.FIELDS.START_POS]);
    }, t.unexpected = function() {
      return this.error("Unexpected '" + this.content() + "'. Escaping special characters with \\ may help.", this.currToken[w.FIELDS.START_POS]);
    }, t.namespace = function() {
      var r = this.prevToken && this.content(this.prevToken) || true;
      if (this.nextToken[w.FIELDS.TYPE] === C.word)
        return this.position++, this.word(r);
      if (this.nextToken[w.FIELDS.TYPE] === C.asterisk)
        return this.position++, this.universal(r);
    }, t.nesting = function() {
      if (this.nextToken) {
        var r = this.content(this.nextToken);
        if (r === "|") {
          this.position++;
          return;
        }
      }
      var i = this.currToken;
      this.newNode(new Xp.default({ value: this.content(), source: wt(i), sourceIndex: i[w.FIELDS.START_POS] })), this.position++;
    }, t.parentheses = function() {
      var r = this.current.last, i = 1;
      if (this.position++, r && r.type === Kp.PSEUDO) {
        var o = new $i.default({ source: { start: Us(this.tokens[this.position - 1]) } }), u = this.current;
        for (r.append(o), this.current = o; this.position < this.tokens.length && i; )
          this.currToken[w.FIELDS.TYPE] === C.openParenthesis && i++, this.currToken[w.FIELDS.TYPE] === C.closeParenthesis && i--, i ? this.parse() : (this.current.source.end = Gs(this.currToken), this.current.parent.source.end = Gs(this.currToken), this.position++);
        this.current = u;
      } else {
        for (var s = this.currToken, a = "(", l; this.position < this.tokens.length && i; )
          this.currToken[w.FIELDS.TYPE] === C.openParenthesis && i++, this.currToken[w.FIELDS.TYPE] === C.closeParenthesis && i--, l = this.currToken, a += this.parseParenthesisToken(this.currToken), this.position++;
        r ? r.appendToPropertyAndEscape("value", a, a) : this.newNode(new qi.default({ value: a, source: at(s[w.FIELDS.START_LINE], s[w.FIELDS.START_COL], l[w.FIELDS.END_LINE], l[w.FIELDS.END_COL]), sourceIndex: s[w.FIELDS.START_POS] }));
      }
      if (i)
        return this.expected("closing parenthesis", this.currToken[w.FIELDS.START_POS]);
    }, t.pseudo = function() {
      for (var r = this, i = "", o = this.currToken; this.currToken && this.currToken[w.FIELDS.TYPE] === C.colon; )
        i += this.content(), this.position++;
      if (!this.currToken)
        return this.expected(["pseudo-class", "pseudo-element"], this.position - 1);
      if (this.currToken[w.FIELDS.TYPE] === C.word)
        this.splitWord(false, function(u, s) {
          i += u, r.newNode(new Vp.default({ value: i, source: Gi(o, r.currToken), sourceIndex: o[w.FIELDS.START_POS] })), s > 1 && r.nextToken && r.nextToken[w.FIELDS.TYPE] === C.openParenthesis && r.error("Misplaced parenthesis.", { index: r.nextToken[w.FIELDS.START_POS] });
        });
      else
        return this.expected(["pseudo-class", "pseudo-element"], this.currToken[w.FIELDS.START_POS]);
    }, t.space = function() {
      var r = this.content();
      this.position === 0 || this.prevToken[w.FIELDS.TYPE] === C.comma || this.prevToken[w.FIELDS.TYPE] === C.openParenthesis || this.current.nodes.every(function(i) {
        return i.type === "comment";
      }) ? (this.spaces = this.optionalSpace(r), this.position++) : this.position === this.tokens.length - 1 || this.nextToken[w.FIELDS.TYPE] === C.comma || this.nextToken[w.FIELDS.TYPE] === C.closeParenthesis ? (this.current.last.spaces.after = this.optionalSpace(r), this.position++) : this.combinator();
    }, t.string = function() {
      var r = this.currToken;
      this.newNode(new qi.default({ value: this.content(), source: wt(r), sourceIndex: r[w.FIELDS.START_POS] })), this.position++;
    }, t.universal = function(r) {
      var i = this.nextToken;
      if (i && this.content(i) === "|")
        return this.position++, this.namespace();
      var o = this.currToken;
      this.newNode(new Yp.default({ value: this.content(), source: wt(o), sourceIndex: o[w.FIELDS.START_POS] }), r), this.position++;
    }, t.splitWord = function(r, i) {
      for (var o = this, u = this.nextToken, s = this.content(); u && ~[C.dollar, C.caret, C.equals, C.word].indexOf(u[w.FIELDS.TYPE]); ) {
        this.position++;
        var a = this.content();
        if (s += a, a.lastIndexOf("\\") === a.length - 1) {
          var l = this.nextToken;
          l && l[w.FIELDS.TYPE] === C.space && (s += this.requiredSpace(this.content(l)), this.position++);
        }
        u = this.nextToken;
      }
      var f = ji(s, ".").filter(function(p) {
        var m = s[p - 1] === "\\", v = /^\d+\.\d+%$/.test(s);
        return !m && !v;
      }), c = ji(s, "#").filter(function(p) {
        return s[p - 1] !== "\\";
      }), d = ji(s, "#{");
      d.length && (c = c.filter(function(p) {
        return !~d.indexOf(p);
      }));
      var h = (0, Qp.default)(e0([0].concat(f, c)));
      h.forEach(function(p, m) {
        var v = h[m + 1] || s.length, D = s.slice(p, v);
        if (m === 0 && i)
          return i.call(o, D, h.length);
        var b, y = o.currToken, F = y[w.FIELDS.START_POS] + h[m], x = at(y[1], y[2] + p, y[3], y[2] + (v - 1));
        if (~f.indexOf(p)) {
          var k = { value: D.slice(1), source: x, sourceIndex: F };
          b = new Gp.default(Et(k, "value"));
        } else if (~c.indexOf(p)) {
          var B = { value: D.slice(1), source: x, sourceIndex: F };
          b = new jp.default(Et(B, "value"));
        } else {
          var I = { value: D, source: x, sourceIndex: F };
          Et(I, "value"), b = new Hp.default(I);
        }
        o.newNode(b, r), r = null;
      }), this.position++;
    }, t.word = function(r) {
      var i = this.nextToken;
      return i && this.content(i) === "|" ? (this.position++, this.namespace()) : this.splitWord(r);
    }, t.loop = function() {
      for (; this.position < this.tokens.length; )
        this.parse(true);
      return this.current._inferEndPosition(), this.root;
    }, t.parse = function(r) {
      switch (this.currToken[w.FIELDS.TYPE]) {
        case C.space:
          this.space();
          break;
        case C.comment:
          this.comment();
          break;
        case C.openParenthesis:
          this.parentheses();
          break;
        case C.closeParenthesis:
          r && this.missingParenthesis();
          break;
        case C.openSquare:
          this.attribute();
          break;
        case C.dollar:
        case C.caret:
        case C.equals:
        case C.word:
          this.word();
          break;
        case C.colon:
          this.pseudo();
          break;
        case C.comma:
          this.comma();
          break;
        case C.asterisk:
          this.universal();
          break;
        case C.ampersand:
          this.nesting();
          break;
        case C.slash:
        case C.combinator:
          this.combinator();
          break;
        case C.str:
          this.string();
          break;
        case C.closeSquare:
          this.missingSquareBracket();
        case C.semicolon:
          this.missingBackslash();
        default:
          this.unexpected();
      }
    }, t.expected = function(r, i, o) {
      if (Array.isArray(r)) {
        var u = r.pop();
        r = r.join(", ") + " or " + u;
      }
      var s = /^[aeiou]/.test(r[0]) ? "an" : "a";
      return o ? this.error("Expected " + s + " " + r + ', found "' + o + '" instead.', { index: i }) : this.error("Expected " + s + " " + r + ".", { index: i });
    }, t.requiredSpace = function(r) {
      return this.options.lossy ? " " : r;
    }, t.optionalSpace = function(r) {
      return this.options.lossy ? "" : r;
    }, t.lossySpace = function(r, i) {
      return this.options.lossy ? i ? " " : "" : r;
    }, t.parseParenthesisToken = function(r) {
      var i = this.content(r);
      return r[w.FIELDS.TYPE] === C.space ? this.requiredSpace(i) : i;
    }, t.newNode = function(r, i) {
      return i && (/^ +$/.test(i) && (this.options.lossy || (this.spaces = (this.spaces || "") + i), i = true), r.namespace = i, Et(r, "namespace")), this.spaces && (r.spaces.before = this.spaces, this.spaces = ""), this.current.append(r);
    }, t.content = function(r) {
      return r === void 0 && (r = this.currToken), this.css.slice(r[w.FIELDS.START_POS], r[w.FIELDS.END_POS]);
    }, t.locateNextMeaningfulToken = function(r) {
      r === void 0 && (r = this.position + 1);
      for (var i = r; i < this.tokens.length; )
        if (Zp[this.tokens[i][w.FIELDS.TYPE]]) {
          i++;
          continue;
        } else
          return i;
      return -1;
    }, Jp(e, [{ key: "currToken", get: function() {
      return this.tokens[this.position];
    } }, { key: "nextToken", get: function() {
      return this.tokens[this.position + 1];
    } }, { key: "prevToken", get: function() {
      return this.tokens[this.position - 1];
    } }]), e;
  }();
  fr.default = t0;
  Hs.exports = fr.default;
});
var Xs = T((cr, Ys) => {
  "use strict";
  cr.__esModule = true;
  cr.default = void 0;
  var r0 = n0(Vs());
  function n0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var i0 = function() {
    function e(n, r) {
      this.func = n || function() {
      }, this.funcRes = null, this.options = r;
    }
    var t = e.prototype;
    return t._shouldUpdateSelector = function(r, i) {
      i === void 0 && (i = {});
      var o = Object.assign({}, this.options, i);
      return o.updateSelector === false ? false : typeof r != "string";
    }, t._isLossy = function(r) {
      r === void 0 && (r = {});
      var i = Object.assign({}, this.options, r);
      return i.lossless === false;
    }, t._root = function(r, i) {
      i === void 0 && (i = {});
      var o = new r0.default(r, this._parseOptions(i));
      return o.root;
    }, t._parseOptions = function(r) {
      return { lossy: this._isLossy(r) };
    }, t._run = function(r, i) {
      var o = this;
      return i === void 0 && (i = {}), new Promise(function(u, s) {
        try {
          var a = o._root(r, i);
          Promise.resolve(o.func(a)).then(function(l) {
            var f = void 0;
            return o._shouldUpdateSelector(r, i) && (f = a.toString(), r.selector = f), { transform: l, root: a, string: f };
          }).then(u, s);
        } catch (l) {
          s(l);
          return;
        }
      });
    }, t._runSync = function(r, i) {
      i === void 0 && (i = {});
      var o = this._root(r, i), u = this.func(o);
      if (u && typeof u.then == "function")
        throw new Error("Selector processor returned a promise to a synchronous call.");
      var s = void 0;
      return i.updateSelector && typeof r != "string" && (s = o.toString(), r.selector = s), { transform: u, root: o, string: s };
    }, t.ast = function(r, i) {
      return this._run(r, i).then(function(o) {
        return o.root;
      });
    }, t.astSync = function(r, i) {
      return this._runSync(r, i).root;
    }, t.transform = function(r, i) {
      return this._run(r, i).then(function(o) {
        return o.transform;
      });
    }, t.transformSync = function(r, i) {
      return this._runSync(r, i).transform;
    }, t.process = function(r, i) {
      return this._run(r, i).then(function(o) {
        return o.string || o.root.toString();
      });
    }, t.processSync = function(r, i) {
      var o = this._runSync(r, i);
      return o.string || o.root.toString();
    }, e;
  }();
  cr.default = i0;
  Ys.exports = cr.default;
});
var Qs = T((Q) => {
  "use strict";
  Q.__esModule = true;
  Q.universal = Q.tag = Q.string = Q.selector = Q.root = Q.pseudo = Q.nesting = Q.id = Q.comment = Q.combinator = Q.className = Q.attribute = void 0;
  var o0 = Ce(Oi()), u0 = Ce(hi()), s0 = Ce(Ri()), a0 = Ce(Di()), l0 = Ce(bi()), f0 = Ce(Mi()), c0 = Ce(Si()), d0 = Ce(li()), p0 = Ce(ci()), h0 = Ce(wi()), m0 = Ce(xi()), D0 = Ce(Bi());
  function Ce(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var g0 = function(t) {
    return new o0.default(t);
  };
  Q.attribute = g0;
  var b0 = function(t) {
    return new u0.default(t);
  };
  Q.className = b0;
  var v0 = function(t) {
    return new s0.default(t);
  };
  Q.combinator = v0;
  var y0 = function(t) {
    return new a0.default(t);
  };
  Q.comment = y0;
  var x0 = function(t) {
    return new l0.default(t);
  };
  Q.id = x0;
  var F0 = function(t) {
    return new f0.default(t);
  };
  Q.nesting = F0;
  var w0 = function(t) {
    return new c0.default(t);
  };
  Q.pseudo = w0;
  var E0 = function(t) {
    return new d0.default(t);
  };
  Q.root = E0;
  var S0 = function(t) {
    return new p0.default(t);
  };
  Q.selector = S0;
  var C0 = function(t) {
    return new h0.default(t);
  };
  Q.string = C0;
  var _0 = function(t) {
    return new m0.default(t);
  };
  Q.tag = _0;
  var k0 = function(t) {
    return new D0.default(t);
  };
  Q.universal = k0;
});
var ea = T((q) => {
  "use strict";
  q.__esModule = true;
  q.isNode = Vi;
  q.isPseudoElement = Zs;
  q.isPseudoClass = W0;
  q.isContainer = $0;
  q.isNamespace = q0;
  q.isUniversal = q.isTag = q.isString = q.isSelector = q.isRoot = q.isPseudo = q.isNesting = q.isIdentifier = q.isComment = q.isCombinator = q.isClassName = q.isAttribute = void 0;
  var ne = pe(), ye, T0 = (ye = {}, ye[ne.ATTRIBUTE] = true, ye[ne.CLASS] = true, ye[ne.COMBINATOR] = true, ye[ne.COMMENT] = true, ye[ne.ID] = true, ye[ne.NESTING] = true, ye[ne.PSEUDO] = true, ye[ne.ROOT] = true, ye[ne.SELECTOR] = true, ye[ne.STRING] = true, ye[ne.TAG] = true, ye[ne.UNIVERSAL] = true, ye);
  function Vi(e) {
    return typeof e == "object" && T0[e.type];
  }
  function _e(e, t) {
    return Vi(t) && t.type === e;
  }
  var Ks = _e.bind(null, ne.ATTRIBUTE);
  q.isAttribute = Ks;
  var A0 = _e.bind(null, ne.CLASS);
  q.isClassName = A0;
  var O0 = _e.bind(null, ne.COMBINATOR);
  q.isCombinator = O0;
  var P0 = _e.bind(null, ne.COMMENT);
  q.isComment = P0;
  var B0 = _e.bind(null, ne.ID);
  q.isIdentifier = B0;
  var I0 = _e.bind(null, ne.NESTING);
  q.isNesting = I0;
  var Yi = _e.bind(null, ne.PSEUDO);
  q.isPseudo = Yi;
  var R0 = _e.bind(null, ne.ROOT);
  q.isRoot = R0;
  var L0 = _e.bind(null, ne.SELECTOR);
  q.isSelector = L0;
  var M0 = _e.bind(null, ne.STRING);
  q.isString = M0;
  var Js = _e.bind(null, ne.TAG);
  q.isTag = Js;
  var N0 = _e.bind(null, ne.UNIVERSAL);
  q.isUniversal = N0;
  function Zs(e) {
    return Yi(e) && e.value && (e.value.startsWith("::") || e.value.toLowerCase() === ":before" || e.value.toLowerCase() === ":after" || e.value.toLowerCase() === ":first-letter" || e.value.toLowerCase() === ":first-line");
  }
  function W0(e) {
    return Yi(e) && !Zs(e);
  }
  function $0(e) {
    return !!(Vi(e) && e.walk);
  }
  function q0(e) {
    return Ks(e) || Js(e);
  }
});
var ta = T((Pe) => {
  "use strict";
  Pe.__esModule = true;
  var Xi = pe();
  Object.keys(Xi).forEach(function(e) {
    e === "default" || e === "__esModule" || e in Pe && Pe[e] === Xi[e] || (Pe[e] = Xi[e]);
  });
  var Qi = Qs();
  Object.keys(Qi).forEach(function(e) {
    e === "default" || e === "__esModule" || e in Pe && Pe[e] === Qi[e] || (Pe[e] = Qi[e]);
  });
  var Ki = ea();
  Object.keys(Ki).forEach(function(e) {
    e === "default" || e === "__esModule" || e in Pe && Pe[e] === Ki[e] || (Pe[e] = Ki[e]);
  });
});
var ia = T((dr, na) => {
  "use strict";
  dr.__esModule = true;
  dr.default = void 0;
  var z0 = j0(Xs()), U0 = G0(ta());
  function ra() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return ra = function() {
      return e;
    }, e;
  }
  function G0(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = ra();
    if (t && t.has(e))
      return t.get(e);
    var n = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var i in e)
      if (Object.prototype.hasOwnProperty.call(e, i)) {
        var o = r ? Object.getOwnPropertyDescriptor(e, i) : null;
        o && (o.get || o.set) ? Object.defineProperty(n, i, o) : n[i] = e[i];
      }
    return n.default = e, t && t.set(e, n), n;
  }
  function j0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var Ji = function(t) {
    return new z0.default(t);
  };
  Object.assign(Ji, U0);
  delete Ji.__esModule;
  var H0 = Ji;
  dr.default = H0;
  na.exports = dr.default;
});
var oa = T((Zi) => {
  "use strict";
  Object.defineProperty(Zi, "__esModule", { value: true });
  Object.defineProperty(Zi, "default", { enumerable: true, get: () => V0 });
  function V0(e) {
    return e.replace(/\\,/g, "\\2c ");
  }
});
var sa = T((Sb, ua) => {
  "use strict";
  ua.exports = { aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255], aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220], bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205], blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42], burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0], chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237], cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11], darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169], darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139], darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209], darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255], dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255], firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34], fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255], gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128], green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128], honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92], indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140], lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0], lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128], lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211], lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250], lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222], lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50], linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0], mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211], mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238], mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133], midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225], moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128], oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35], orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214], palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238], palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185], peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221], powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153], red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225], saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96], seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45], silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205], slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250], springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140], teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71], turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179], white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0], yellowgreen: [154, 205, 50] };
});
var to = T((eo) => {
  "use strict";
  Object.defineProperty(eo, "__esModule", { value: true });
  function Y0(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  Y0(eo, { parseColor: () => eh, formatColor: () => th });
  var aa = X0(sa());
  function X0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var Q0 = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i, K0 = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i, Ze = /(?:\d+|\d*\.\d+)%?/, fn = /(?:\s*,\s*|\s+)/, la = /\s*[,/]\s*/, et2 = /var\(--(?:[^ )]*?)\)/, J0 = new RegExp(`^(rgb)a?\\(\\s*(${Ze.source}|${et2.source})(?:${fn.source}(${Ze.source}|${et2.source}))?(?:${fn.source}(${Ze.source}|${et2.source}))?(?:${la.source}(${Ze.source}|${et2.source}))?\\s*\\)$`), Z0 = new RegExp(`^(hsl)a?\\(\\s*((?:${Ze.source})(?:deg|rad|grad|turn)?|${et2.source})(?:${fn.source}(${Ze.source}|${et2.source}))?(?:${fn.source}(${Ze.source}|${et2.source}))?(?:${la.source}(${Ze.source}|${et2.source}))?\\s*\\)$`);
  function eh(e, { loose: t = false } = {}) {
    var n, r;
    if (typeof e != "string")
      return null;
    if (e = e.trim(), e === "transparent")
      return { mode: "rgb", color: ["0", "0", "0"], alpha: "0" };
    if (e in aa.default)
      return { mode: "rgb", color: aa.default[e].map((a) => a.toString()) };
    let i = e.replace(K0, (a, l, f, c, d) => ["#", l, l, f, f, c, c, d ? d + d : ""].join("")).match(Q0);
    if (i !== null)
      return { mode: "rgb", color: [parseInt(i[1], 16), parseInt(i[2], 16), parseInt(i[3], 16)].map((a) => a.toString()), alpha: i[4] ? (parseInt(i[4], 16) / 255).toString() : void 0 };
    var o;
    let u = (o = e.match(J0)) !== null && o !== void 0 ? o : e.match(Z0);
    if (u === null)
      return null;
    let s = [u[2], u[3], u[4]].filter(Boolean).map((a) => a.toString());
    return !t && s.length !== 3 || s.length < 3 && !s.some((a) => /^var\(.*?\)$/.test(a)) ? null : { mode: u[1], color: s, alpha: (n = u[5]) === null || n === void 0 || (r = n.toString) === null || r === void 0 ? void 0 : r.call(n) };
  }
  function th({ mode: e, color: t, alpha: n }) {
    let r = n !== void 0;
    return `${e}(${t.join(" ")}${r ? ` / ${n}` : ""})`;
  }
});
var no = T((ro) => {
  "use strict";
  Object.defineProperty(ro, "__esModule", { value: true });
  function rh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  rh(ro, { withAlphaValue: () => nh, default: () => ih });
  var cn = to();
  function nh(e, t, n) {
    if (typeof e == "function")
      return e({ opacityValue: t });
    let r = (0, cn.parseColor)(e, { loose: true });
    return r === null ? n : (0, cn.formatColor)({ ...r, alpha: t });
  }
  function ih({ color: e, property: t, variable: n }) {
    let r = [].concat(t);
    if (typeof e == "function")
      return { [n]: "1", ...Object.fromEntries(r.map((o) => [o, e({ opacityVariable: n, opacityValue: `var(${n})` })])) };
    let i = (0, cn.parseColor)(e);
    return i === null ? Object.fromEntries(r.map((o) => [o, e])) : i.alpha !== void 0 ? Object.fromEntries(r.map((o) => [o, e])) : { [n]: "1", ...Object.fromEntries(r.map((o) => [o, (0, cn.formatColor)({ ...i, alpha: `var(${n})` })])) };
  }
});
var ha = T((io) => {
  "use strict";
  Object.defineProperty(io, "__esModule", { value: true });
  function oh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  oh(io, { pattern: () => sh, withoutCapturing: () => ca, any: () => da, optional: () => ah, zeroOrMore: () => lh, nestedBrackets: () => pa, escape: () => lt });
  var fa = /[\\^$.*+?()[\]{}|]/g, uh = RegExp(fa.source);
  function pr(e) {
    return e = Array.isArray(e) ? e : [e], e = e.map((t) => t instanceof RegExp ? t.source : t), e.join("");
  }
  function sh(e) {
    return new RegExp(pr(e), "g");
  }
  function ca(e) {
    return new RegExp(`(?:${pr(e)})`, "g");
  }
  function da(e) {
    return `(?:${e.map(pr).join("|")})`;
  }
  function ah(e) {
    return `(?:${pr(e)})?`;
  }
  function lh(e) {
    return `(?:${pr(e)})*`;
  }
  function pa(e, t, n = 1) {
    return ca([lt(e), /[^\s]*/, n === 1 ? `[^${lt(e)}${lt(t)}s]*` : da([`[^${lt(e)}${lt(t)}s]*`, pa(e, t, n - 1)]), /[^\s]*/, lt(t)]);
  }
  function lt(e) {
    return e && uh.test(e) ? e.replace(fa, "\\$&") : e || "";
  }
});
var Da = T((oo) => {
  "use strict";
  Object.defineProperty(oo, "__esModule", { value: true });
  Object.defineProperty(oo, "splitAtTopLevelOnly", { enumerable: true, get: () => dh });
  var fh = ch(ha());
  function ma(e) {
    if (typeof WeakMap != "function")
      return null;
    var t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new WeakMap();
    return (ma = function(r) {
      return r ? n : t;
    })(e);
  }
  function ch(e, t) {
    if (!t && e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var n = ma(t);
    if (n && n.has(e))
      return n.get(e);
    var r = {}, i = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var o in e)
      if (o !== "default" && Object.prototype.hasOwnProperty.call(e, o)) {
        var u = i ? Object.getOwnPropertyDescriptor(e, o) : null;
        u && (u.get || u.set) ? Object.defineProperty(r, o, u) : r[o] = e[o];
      }
    return r.default = e, n && n.set(e, r), r;
  }
  function* dh(e, t) {
    let n = new RegExp(`[(){}\\[\\]${fh.escape(t)}]`, "g"), r = 0, i = 0, o = false, u = 0, s = 0, a = t.length;
    for (let l of e.matchAll(n)) {
      let f = l[0] === t[u], c = u === a - 1, d = f && c;
      l[0] === "(" && r++, l[0] === ")" && r--, l[0] === "[" && r++, l[0] === "]" && r--, l[0] === "{" && r++, l[0] === "}" && r--, f && r === 0 && (s === 0 && (s = l.index), u++), d && r === 0 && (o = true, yield e.substring(i, s), i = s + a), u === a && (u = 0, s = 0);
    }
    o ? yield e.substring(i) : yield e;
  }
});
var ba = T((uo) => {
  "use strict";
  Object.defineProperty(uo, "__esModule", { value: true });
  function ph(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  ph(uo, { parseBoxShadowValue: () => gh, formatBoxShadowValue: () => bh });
  var hh = Da(), mh = /* @__PURE__ */ new Set(["inset", "inherit", "initial", "revert", "unset"]), Dh = /\ +(?![^(]*\))/g, ga = /^-?(\d+|\.\d+)(.*?)$/g;
  function gh(e) {
    return Array.from((0, hh.splitAtTopLevelOnly)(e, ",")).map((n) => {
      let r = n.trim(), i = { raw: r }, o = r.split(Dh), u = /* @__PURE__ */ new Set();
      for (let s of o)
        ga.lastIndex = 0, !u.has("KEYWORD") && mh.has(s) ? (i.keyword = s, u.add("KEYWORD")) : ga.test(s) ? u.has("X") ? u.has("Y") ? u.has("BLUR") ? u.has("SPREAD") || (i.spread = s, u.add("SPREAD")) : (i.blur = s, u.add("BLUR")) : (i.y = s, u.add("Y")) : (i.x = s, u.add("X")) : i.color ? (i.unknown || (i.unknown = []), i.unknown.push(s)) : i.color = s;
      return i.valid = i.x !== void 0 && i.y !== void 0, i;
    });
  }
  function bh(e) {
    return e.map((t) => t.valid ? [t.keyword, t.x, t.y, t.blur, t.spread, t.color].filter(Boolean).join(" ") : t.raw).join(", ");
  }
});
var Sa = T((ao) => {
  "use strict";
  Object.defineProperty(ao, "__esModule", { value: true });
  function vh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  vh(ao, { normalize: () => tt, url: () => xa, number: () => Fh, percentage: () => Fa, length: () => wa, lineWidth: () => Sh, shadow: () => Ch, color: () => _h, image: () => kh, gradient: () => Ea, position: () => Oh, familyName: () => Ph, genericName: () => Ih, absoluteSize: () => Lh, relativeSize: () => Nh });
  var yh = to(), xh = ba(), so = ["min", "max", "clamp", "calc"], ya = /,(?![^(]*\))/g, dn = /_(?![^(]*\))/g;
  function tt(e, t = true) {
    return e.includes("url(") ? e.split(/(url\(.*?\))/g).filter(Boolean).map((n) => /^url\(.*?\)$/.test(n) ? n : tt(n, false)).join("") : (e = e.replace(/([^\\])_+/g, (n, r) => r + " ".repeat(n.length - 1)).replace(/^_/g, " ").replace(/\\_/g, "_"), t && (e = e.trim()), e = e.replace(/(calc|min|max|clamp)\(.+\)/g, (n) => n.replace(/(-?\d*\.?\d(?!\b-.+[,)](?![^+\-/*])\D)(?:%|[a-z]+)?|\))([+\-/*])/g, "$1 $2 ")), e);
  }
  function xa(e) {
    return e.startsWith("url(");
  }
  function Fh(e) {
    return !isNaN(Number(e)) || so.some((t) => new RegExp(`^${t}\\(.+?`).test(e));
  }
  function Fa(e) {
    return e.split(dn).every((t) => /%$/g.test(t) || so.some((n) => new RegExp(`^${n}\\(.+?%`).test(t)));
  }
  var wh = ["cm", "mm", "Q", "in", "pc", "pt", "px", "em", "ex", "ch", "rem", "lh", "vw", "vh", "vmin", "vmax"], va = `(?:${wh.join("|")})`;
  function wa(e) {
    return e.split(dn).every((t) => t === "0" || new RegExp(`${va}$`).test(t) || so.some((n) => new RegExp(`^${n}\\(.+?${va}`).test(t)));
  }
  var Eh = /* @__PURE__ */ new Set(["thin", "medium", "thick"]);
  function Sh(e) {
    return Eh.has(e);
  }
  function Ch(e) {
    let t = (0, xh.parseBoxShadowValue)(tt(e));
    for (let n of t)
      if (!n.valid)
        return false;
    return true;
  }
  function _h(e) {
    let t = 0;
    return e.split(dn).every((r) => (r = tt(r), r.startsWith("var(") ? true : (0, yh.parseColor)(r, { loose: true }) !== null ? (t++, true) : false)) ? t > 0 : false;
  }
  function kh(e) {
    let t = 0;
    return e.split(ya).every((r) => (r = tt(r), r.startsWith("var(") ? true : xa(r) || Ea(r) || ["element(", "image(", "cross-fade(", "image-set("].some((i) => r.startsWith(i)) ? (t++, true) : false)) ? t > 0 : false;
  }
  var Th = /* @__PURE__ */ new Set(["linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "conic-gradient"]);
  function Ea(e) {
    e = tt(e);
    for (let t of Th)
      if (e.startsWith(`${t}(`))
        return true;
    return false;
  }
  var Ah = /* @__PURE__ */ new Set(["center", "top", "right", "bottom", "left"]);
  function Oh(e) {
    let t = 0;
    return e.split(dn).every((r) => (r = tt(r), r.startsWith("var(") ? true : Ah.has(r) || wa(r) || Fa(r) ? (t++, true) : false)) ? t > 0 : false;
  }
  function Ph(e) {
    let t = 0;
    return e.split(ya).every((r) => (r = tt(r), r.startsWith("var(") ? true : r.includes(" ") && !/(['"])([^"']+)\1/g.test(r) || /^\d/g.test(r) ? false : (t++, true))) ? t > 0 : false;
  }
  var Bh = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
  function Ih(e) {
    return Bh.has(e);
  }
  var Rh = /* @__PURE__ */ new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "x-large", "xxx-large"]);
  function Lh(e) {
    return Rh.has(e);
  }
  var Mh = /* @__PURE__ */ new Set(["larger", "smaller"]);
  function Nh(e) {
    return Mh.has(e);
  }
});
var Ba = T((co) => {
  "use strict";
  Object.defineProperty(co, "__esModule", { value: true });
  function Wh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  Wh(co, { updateAllClasses: () => zh, asValue: () => mr, parseColorFormat: () => lo, asColor: () => Aa, asLookupValue: () => Oa, coerceValue: () => Hh });
  var $h = fo(ia()), qh = fo(oa()), Ca = no(), xe = Sa(), _a2 = fo(Xn());
  function fo(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function zh(e, t) {
    return (0, $h.default)((i) => {
      i.walkClasses((o) => {
        let u = t(o.value);
        o.value = u, o.raws && o.raws.value && (o.raws.value = (0, qh.default)(o.raws.value));
      });
    }).processSync(e);
  }
  function Ta(e, t) {
    if (!hr(e))
      return;
    let n = e.slice(1, -1);
    if (t(n))
      return (0, xe.normalize)(n);
  }
  function Uh(e, t = {}, n) {
    let r = t[e];
    if (r !== void 0)
      return (0, _a2.default)(r);
    if (hr(e)) {
      let i = Ta(e, n);
      return i === void 0 ? void 0 : (0, _a2.default)(i);
    }
  }
  function mr(e, t = {}, { validate: n = () => true } = {}) {
    var r;
    let i = (r = t.values) === null || r === void 0 ? void 0 : r[e];
    return i !== void 0 ? i : t.supportsNegativeValues && e.startsWith("-") ? Uh(e.slice(1), t.values, n) : Ta(e, n);
  }
  function hr(e) {
    return e.startsWith("[") && e.endsWith("]");
  }
  function Gh(e) {
    let t = e.lastIndexOf("/");
    return t === -1 || t === e.length - 1 ? [e] : [e.slice(0, t), e.slice(t + 1)];
  }
  function lo(e) {
    if (typeof e == "string" && e.includes("<alpha-value>")) {
      let t = e;
      return ({ opacityValue: n = 1 }) => t.replace("<alpha-value>", n);
    }
    return e;
  }
  function Aa(e, t = {}, { tailwindConfig: n = {} } = {}) {
    var r;
    if (((r = t.values) === null || r === void 0 ? void 0 : r[e]) !== void 0) {
      var i;
      return lo((i = t.values) === null || i === void 0 ? void 0 : i[e]);
    }
    let [o, u] = Gh(e);
    if (u !== void 0) {
      var s, a, l, f;
      let c = (f = (s = t.values) === null || s === void 0 ? void 0 : s[o]) !== null && f !== void 0 ? f : hr(o) ? o.slice(1, -1) : void 0;
      return c === void 0 ? void 0 : (c = lo(c), hr(u) ? (0, Ca.withAlphaValue)(c, u.slice(1, -1)) : ((a = n.theme) === null || a === void 0 || (l = a.opacity) === null || l === void 0 ? void 0 : l[u]) === void 0 ? void 0 : (0, Ca.withAlphaValue)(c, n.theme.opacity[u]));
    }
    return mr(e, t, { validate: xe.color });
  }
  function Oa(e, t = {}) {
    var n;
    return (n = t.values) === null || n === void 0 ? void 0 : n[e];
  }
  function ke(e) {
    return (t, n) => mr(t, n, { validate: e });
  }
  var Pa = { any: mr, color: Aa, url: ke(xe.url), image: ke(xe.image), length: ke(xe.length), percentage: ke(xe.percentage), position: ke(xe.position), lookup: Oa, "generic-name": ke(xe.genericName), "family-name": ke(xe.familyName), number: ke(xe.number), "line-width": ke(xe.lineWidth), "absolute-size": ke(xe.absoluteSize), "relative-size": ke(xe.relativeSize), shadow: ke(xe.shadow) }, ka = Object.keys(Pa);
  function jh(e, t) {
    let n = e.indexOf(t);
    return n === -1 ? [void 0, e] : [e.slice(0, n), e.slice(n + 1)];
  }
  function Hh(e, t, n, r) {
    if (hr(t)) {
      let i = t.slice(1, -1), [o, u] = jh(i, ":");
      if (!/^[\w-_]+$/g.test(o))
        u = i;
      else if (o !== void 0 && !ka.includes(o))
        return [];
      if (u.length > 0 && ka.includes(o))
        return [mr(`[${u}]`, n), o];
    }
    for (let i of [].concat(e)) {
      let o = Pa[i](t, n, { tailwindConfig: r });
      if (o !== void 0)
        return [o, i];
    }
    return [];
  }
});
var Ia = T((po) => {
  "use strict";
  Object.defineProperty(po, "__esModule", { value: true });
  Object.defineProperty(po, "default", { enumerable: true, get: () => Vh });
  function Vh(e) {
    return typeof e == "function" ? e({}) : e;
  }
});
var Wa = T((mo) => {
  "use strict";
  Object.defineProperty(mo, "__esModule", { value: true });
  Object.defineProperty(mo, "default", { enumerable: true, get: () => pm });
  var Yh = ft(Xn()), Xh = ft(zu()), Qh = ft(Uu()), Kh = ft(Jn()), Jh = ft(ju()), Ma = Hu(), Ra = Vu(), Zh = Xu(), em = ft(Qu()), tm = Ku(), rm = Ba(), nm = no(), im = ft(Ia());
  function ft(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function St(e) {
    return typeof e == "function";
  }
  function Dr(e) {
    return typeof e == "object" && e !== null;
  }
  function gr(e, ...t) {
    let n = t.pop();
    for (let r of t)
      for (let i in r) {
        let o = n(e[i], r[i]);
        o === void 0 ? Dr(e[i]) && Dr(r[i]) ? e[i] = gr(e[i], r[i], n) : e[i] = r[i] : e[i] = o;
      }
    return e;
  }
  var ho = { colors: Jh.default, negative(e) {
    return Object.keys(e).filter((t) => e[t] !== "0").reduce((t, n) => {
      let r = (0, Yh.default)(e[n]);
      return r !== void 0 && (t[`-${n}`] = r), t;
    }, {});
  }, breakpoints(e) {
    return Object.keys(e).filter((t) => typeof e[t] == "string").reduce((t, n) => ({ ...t, [`screen-${n}`]: e[n] }), {});
  } };
  function om(e, ...t) {
    return St(e) ? e(...t) : e;
  }
  function um(e) {
    return e.reduce((t, { extend: n }) => gr(t, n, (r, i) => r === void 0 ? [i] : Array.isArray(r) ? [i, ...r] : [i, r]), {});
  }
  function sm(e) {
    return { ...e.reduce((t, n) => (0, Ma.defaults)(t, n), {}), extend: um(e) };
  }
  function La(e, t) {
    if (Array.isArray(e) && Dr(e[0]))
      return e.concat(t);
    if (Array.isArray(t) && Dr(t[0]) && Dr(e))
      return [e, ...t];
    if (Array.isArray(t))
      return t;
  }
  function am({ extend: e, ...t }) {
    return gr(t, e, (n, r) => !St(n) && !r.some(St) ? gr({}, n, ...r, La) : (i, o) => gr({}, ...[n, ...r].map((u) => om(u, i, o)), La));
  }
  function* lm(e) {
    let t = (0, Ra.toPath)(e);
    if (t.length === 0 || (yield t, Array.isArray(e)))
      return;
    let n = /^(.*?)\s*\/\s*([^/]+)$/, r = e.match(n);
    if (r !== null) {
      let [, i, o] = r, u = (0, Ra.toPath)(i);
      u.alpha = o, yield u;
    }
  }
  function fm(e) {
    let t = (n, r) => {
      for (let i of lm(n)) {
        let o = 0, u = e;
        for (; u != null && o < i.length; )
          u = u[i[o++]], u = St(u) && (i.alpha === void 0 || o <= i.length - 1) ? u(t, ho) : u;
        if (u !== void 0) {
          if (i.alpha !== void 0) {
            let s = (0, rm.parseColorFormat)(u);
            return (0, nm.withAlphaValue)(s, i.alpha, (0, im.default)(s));
          }
          return (0, em.default)(u) ? (0, tm.cloneDeep)(u) : u;
        }
      }
      return r;
    };
    return Object.assign(t, { theme: t, ...ho }), Object.keys(e).reduce((n, r) => (n[r] = St(e[r]) ? e[r](t, ho) : e[r], n), {});
  }
  function Na(e) {
    let t = [];
    return e.forEach((n) => {
      t = [...t, n];
      var r;
      let i = (r = n == null ? void 0 : n.plugins) !== null && r !== void 0 ? r : [];
      i.length !== 0 && i.forEach((o) => {
        o.__isOptionsFunction && (o = o());
        var u;
        t = [...t, ...Na([(u = o == null ? void 0 : o.config) !== null && u !== void 0 ? u : {}])];
      });
    }), t;
  }
  function cm(e) {
    return [...e].reduceRight((n, r) => St(r) ? r({ corePlugins: n }) : (0, Qh.default)(r, n), Xh.default);
  }
  function dm(e) {
    return [...e].reduceRight((n, r) => [...n, ...r], []);
  }
  function pm(e) {
    let t = [...Na(e), { prefix: "", important: false, separator: ":", variantOrder: Kh.default.variantOrder }];
    var n, r;
    return (0, Zh.normalizeConfig)((0, Ma.defaults)({ theme: fm(am(sm(t.map((i) => (n = i == null ? void 0 : i.theme) !== null && n !== void 0 ? n : {})))), corePlugins: cm(t.map((i) => i.corePlugins)), plugins: dm(e.map((i) => (r = i == null ? void 0 : i.plugins) !== null && r !== void 0 ? r : [])) }, ...t));
  }
});
var $a = {};
yn($a, { default: () => hm });
var hm;
var qa = vn(() => {
  hm = { yellow: (e) => e };
});
var ja = T((Do) => {
  "use strict";
  Object.defineProperty(Do, "__esModule", { value: true });
  function mm(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  mm(Do, { flagEnabled: () => bm, issueFlagNotices: () => vm, default: () => ym });
  var Dm = Ga((qa(), Br($a))), gm = Ga((Qr(), Br(Xr)));
  function Ga(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var za = { optimizeUniversalDefaults: false }, br = { future: ["hoverOnlyWhenSupported", "respectDefaultRingColorOpacity"], experimental: ["optimizeUniversalDefaults", "matchVariant"] };
  function bm(e, t) {
    if (br.future.includes(t)) {
      var n, r, i;
      return e.future === "all" || ((i = (r = e == null || (n = e.future) === null || n === void 0 ? void 0 : n[t]) !== null && r !== void 0 ? r : za[t]) !== null && i !== void 0 ? i : false);
    }
    if (br.experimental.includes(t)) {
      var o, u, s;
      return e.experimental === "all" || ((s = (u = e == null || (o = e.experimental) === null || o === void 0 ? void 0 : o[t]) !== null && u !== void 0 ? u : za[t]) !== null && s !== void 0 ? s : false);
    }
    return false;
  }
  function Ua(e) {
    if (e.experimental === "all")
      return br.experimental;
    var t;
    return Object.keys((t = e == null ? void 0 : e.experimental) !== null && t !== void 0 ? t : {}).filter((n) => br.experimental.includes(n) && e.experimental[n]);
  }
  function vm(e) {
    if (process.env.JEST_WORKER_ID === void 0 && Ua(e).length > 0) {
      let t = Ua(e).map((n) => Dm.default.yellow(n)).join(", ");
      gm.default.warn("experimental-flags-enabled", [`You have enabled experimental features: ${t}`, "Experimental features in Tailwind CSS are not covered by semver, may introduce breaking changes, and can change at any time."]);
    }
  }
  var ym = br;
});
var Va = T((go) => {
  "use strict";
  Object.defineProperty(go, "__esModule", { value: true });
  Object.defineProperty(go, "default", { enumerable: true, get: () => Ha });
  var xm = wm(Jn()), Fm = ja();
  function wm(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ha(e) {
    var t;
    let n = ((t = e == null ? void 0 : e.presets) !== null && t !== void 0 ? t : [xm.default]).slice().reverse().flatMap((o) => Ha(typeof o == "function" ? o() : o)), r = { respectDefaultRingColorOpacity: { theme: { ringColor: { DEFAULT: "#3b82f67f" } } } }, i = Object.keys(r).filter((o) => (0, Fm.flagEnabled)(e, o)).map((o) => r[o]);
    return [e, ...i, ...n];
  }
});
var Xa = T((bo) => {
  "use strict";
  Object.defineProperty(bo, "__esModule", { value: true });
  Object.defineProperty(bo, "default", { enumerable: true, get: () => Cm });
  var Em = Ya(Wa()), Sm = Ya(Va());
  function Ya(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Cm(...e) {
    let [, ...t] = (0, Sm.default)(e[0]);
    return (0, Em.default)([...e, ...t]);
  }
});
var Ka = T((Nb, Qa) => {
  var vo = Xa();
  Qa.exports = (vo.__esModule ? vo : { default: vo }).default;
});
var gt;
function Rl(e) {
  gt = e;
}
var Ot = null;
async function qe() {
  return gt || (Ot ? (await Ot, gt) : (Ot = Promise.resolve().then(() => (Ho(), jo)).then((e) => e.getYogaModule()).then((e) => gt = e), await Ot, Ot = null, gt));
}
var Pt = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var Ll = Pt((e, t) => {
  t.exports = ["em", "ex", "ch", "rem", "vh", "vw", "vmin", "vmax", "px", "mm", "cm", "in", "pt", "pc", "mozmm"];
});
var Ml = Pt((e, t) => {
  t.exports = ["deg", "grad", "rad", "turn"];
});
var Nl = Pt((e, t) => {
  t.exports = ["dpi", "dpcm", "dppx"];
});
var Wl = Pt((e, t) => {
  t.exports = ["Hz", "kHz"];
});
var $l = Pt((e, t) => {
  t.exports = ["s", "ms"];
});
var ql = Ll();
var Vo = Ml();
var Yo = Nl();
var Xo = Wl();
var Qo = $l();
function Fn(e) {
  if (/\.\D?$/.test(e))
    throw new Error("The dot should be followed by a number");
  if (/^[+-]{2}/.test(e))
    throw new Error("Only one leading +/- is allowed");
  if (zl(e) > 1)
    throw new Error("Only one dot is allowed");
  if (/%$/.test(e)) {
    this.type = "percentage", this.value = xn(e), this.unit = "%";
    return;
  }
  var t = Gl(e);
  if (!t) {
    this.type = "number", this.value = xn(e);
    return;
  }
  this.type = Hl(t), this.value = xn(e.substr(0, e.length - t.length)), this.unit = t;
}
Fn.prototype.valueOf = function() {
  return this.value;
};
Fn.prototype.toString = function() {
  return this.value + (this.unit || "");
};
function Qe(e) {
  return new Fn(e);
}
function zl(e) {
  var t = e.match(/\./g);
  return t ? t.length : 0;
}
function xn(e) {
  var t = parseFloat(e);
  if (isNaN(t))
    throw new Error("Invalid number: " + e);
  return t;
}
var Ul = [].concat(Vo, Xo, ql, Yo, Qo);
function Gl(e) {
  var t = e.match(/\D+$/), n = t && t[0];
  if (n && Ul.indexOf(n) === -1)
    throw new Error("Invalid unit: " + n);
  return n;
}
var jl = Object.assign(Ir(Vo, "angle"), Ir(Xo, "frequency"), Ir(Yo, "resolution"), Ir(Qo, "time"));
function Ir(e, t) {
  return Object.fromEntries(e.map((n) => [n, t]));
}
function Hl(e) {
  return jl[e] || "length";
}
function bt(e) {
  let t = typeof e;
  return !(t === "number" || t === "bigint" || t === "string" || t === "boolean");
}
function Ko(e) {
  return /^class\s/.test(e.toString());
}
function Jo(e) {
  return "dangerouslySetInnerHTML" in e;
}
function Zo(e) {
  let t = typeof e > "u" ? [] : [].concat(e).flat(1 / 0), n = [];
  for (let r = 0; r < t.length; r++) {
    let i = t[r];
    typeof i > "u" || typeof i == "boolean" || i === null || (typeof i == "number" && (i = String(i)), typeof i == "string" && n.length && typeof n[n.length - 1] == "string" ? n[n.length - 1] += i : n.push(i));
  }
  return n;
}
function W(e, t, n, r, i = false) {
  if (typeof e == "number")
    return e;
  try {
    if (e = e.trim(), /[ /\(,]/.test(e))
      return;
    if (e === String(+e))
      return +e;
    let o = new Qe(e);
    if (o.type === "length")
      switch (o.unit) {
        case "em":
          return o.value * t;
        case "rem":
          return o.value * 16;
        case "vw":
          return ~~(o.value * r._viewportWidth / 100);
        case "vh":
          return ~~(o.value * r._viewportHeight / 100);
        default:
          return o.value;
      }
    else if (o.type === "angle")
      switch (o.unit) {
        case "deg":
          return o.value;
        case "rad":
          return o.value * 180 / Math.PI;
        default:
          return o.value;
      }
    else if (o.type === "percentage" && i)
      return o.value / 100 * n;
  } catch {
  }
}
function Bt(e, t) {
  return [e[0] * t[0] + e[2] * t[1], e[1] * t[0] + e[3] * t[1], e[0] * t[2] + e[2] * t[3], e[1] * t[2] + e[3] * t[3], e[0] * t[4] + e[2] * t[5] + e[4], e[1] * t[4] + e[3] * t[5] + e[5]];
}
function ve(e, t, n, r) {
  let i = t[e];
  if (typeof i > "u") {
    if (r && typeof e < "u")
      throw new Error(`Invalid value for CSS property "${r}". Allowed values: ${Object.keys(t).map((o) => `"${o}"`).join(" | ")}. Received: "${e}".`);
    i = n;
  }
  return i;
}
var wn;
var En;
var eu = [32, 160, 4961, 65792, 65793, 4153, 4241, 10].map((e) => String.fromCodePoint(e));
function be(e, t, n) {
  if (!wn || !En) {
    if (!(typeof Intl < "u" && "Segmenter" in Intl))
      throw new Error("Intl.Segmenter does not exist, please use import a polyfill.");
    wn = new Intl.Segmenter(n, { granularity: "word" }), En = new Intl.Segmenter(n, { granularity: "grapheme" });
  }
  if (t === "grapheme")
    return [...En.segment(e)].map((r) => r.segment);
  {
    let r = [...wn.segment(e)].map((u) => u.segment), i = [], o = 0;
    for (; o < r.length; ) {
      let u = r[o];
      if (u == "\xA0") {
        let s = o === 0 ? "" : i.pop(), a = o === r.length - 1 ? "" : r[o + 1];
        i.push(s + "\xA0" + a), o += 2;
      } else
        i.push(u), o++;
    }
    return i;
  }
}
function S(e, t, n) {
  let r = "";
  for (let [i, o] of Object.entries(t))
    typeof o < "u" && (r += ` ${i}="${o}"`);
  return n ? `<${e}${r}>${n}</${e}>` : `<${e}${r}/>`;
}
function tu(e = 20) {
  let t = /* @__PURE__ */ new Map();
  function n(o, u) {
    if (t.size >= e) {
      let s = t.keys().next().value;
      t.delete(s);
    }
    t.set(o, u);
  }
  function r(o) {
    if (!t.has(o))
      return;
    let s = t.get(o);
    return t.delete(o), t.set(o, s), s;
  }
  function i() {
    t.clear();
  }
  return { set: n, get: r, clear: i };
}
function vt(e) {
  return e ? e.split(/[, ]/).filter(Boolean).map(Number) : null;
}
function Yl(e) {
  return Object.prototype.toString.call(e);
}
function Rr(e) {
  return typeof e == "string";
}
function ru(e) {
  return typeof e == "number";
}
function nu(e) {
  return Yl(e) === "[object Undefined]";
}
function iu(e, t) {
  if (t === "break-all")
    return { words: be(e, "grapheme"), requiredBreaks: [] };
  if (t === "keep-all")
    return { words: be(e, "word"), requiredBreaks: [] };
  let n = new $557adaaeb0c7885f$exports(e), r = 0, i = n.nextBreak(), o = [], u = [false];
  for (; i; ) {
    let s = e.slice(r, i.position);
    o.push(s), i.required ? u.push(true) : u.push(false), r = i.position, i = n.nextBreak();
  }
  return { words: o, requiredBreaks: u };
}
var ou = (e) => e.replaceAll(/([A-Z])/g, (t, n) => `-${n.toLowerCase()}`);
function Lr(e, t = ",") {
  let n = [], r = 0, i = 0;
  t = new RegExp(t);
  for (let o = 0; o < e.length; o++)
    e[o] === "(" ? i++ : e[o] === ")" && i--, i === 0 && t.test(e[o]) && (n.push(e.slice(r, o).trim()), r = o + 1);
  return n.push(e.slice(r).trim()), n;
}
var Xl = "image/avif";
var Ql = "image/webp";
var Mr = "image/apng";
var Nr = "image/png";
var Wr = "image/jpeg";
var $r = "image/gif";
var Cn = "image/svg+xml";
function au(e) {
  let t = new DataView(e), n = 4, r = t.byteLength;
  for (; n < r; ) {
    let i = t.getUint16(n, false);
    if (i > r)
      throw new TypeError("Invalid JPEG");
    let o = t.getUint8(i + 1 + n);
    if (o === 192 || o === 193 || o === 194)
      return [t.getUint16(i + 7 + n, false), t.getUint16(i + 5 + n, false)];
    n += i + 2;
  }
  throw new TypeError("Invalid JPEG");
}
function lu(e) {
  let t = new Uint8Array(e.slice(6, 10));
  return [t[0] | t[1] << 8, t[2] | t[3] << 8];
}
function fu(e) {
  let t = new DataView(e);
  return [t.getUint16(18, false), t.getUint16(22, false)];
}
var Re = tu(100);
var Sn = /* @__PURE__ */ new Map();
var Kl = [Nr, Mr, Wr, $r, Cn];
function Jl(e) {
  let t = "", n = new Uint8Array(e);
  for (let r = 0; r < n.byteLength; r++)
    t += String.fromCharCode(n[r]);
  return btoa(t);
}
function Zl(e) {
  let t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    r[i] = t.charCodeAt(i);
  return r.buffer;
}
function uu(e, t) {
  let n = t.match(/<svg[^>]*>/)[0], r = n.match(/viewBox=['"](.+)['"]/), i = r ? vt(r[1]) : null, o = n.match(/width=['"](\d*\.\d+|\d+)['"]/), u = n.match(/height=['"](\d*\.\d+|\d+)['"]/);
  if (!i && (!o || !u))
    throw new Error(`Failed to parse SVG from ${e}: missing "viewBox"`);
  let s = i ? [i[2], i[3]] : [+o[1], +u[1]], a = s[0] / s[1];
  return o && u ? [+o[1], +u[1]] : o ? [+o[1], +o[1] / a] : u ? [+u[1] * a, +u[1]] : [s[0], s[1]];
}
function su(e) {
  let t, n = ef(new Uint8Array(e));
  switch (n) {
    case Nr:
    case Mr:
      t = fu(e);
      break;
    case $r:
      t = lu(e);
      break;
    case Wr:
      t = au(e);
      break;
  }
  if (!Kl.includes(n))
    throw new Error(`Unsupported image type: ${n || "unknown"}`);
  return [`data:${n};base64,${Jl(e)}`, t];
}
async function yt(e) {
  if (!e)
    throw new Error("Image source is not provided.");
  if (typeof e == "object") {
    let [i, o] = su(e);
    return [i, ...o];
  }
  if ((e.startsWith('"') && e.endsWith('"') || e.startsWith("'") && e.endsWith("'")) && (e = e.slice(1, -1)), typeof window > "u" && !e.startsWith("http") && !e.startsWith("data:"))
    throw new Error(`Image source must be an absolute URL: ${e}`);
  if (e.startsWith("data:")) {
    let i;
    try {
      i = /data:(?<imageType>[a-z/+]+)(;(charset=)?(?<encodingType>.*))?,(?<dataString>.*)/g.exec(e).groups;
    } catch {
      return console.warn("Image data URI resolved without size:" + e), [e];
    }
    let { imageType: o, encodingType: u, dataString: s } = i;
    if (o === Cn) {
      let a = u === "base64" ? atob(s) : decodeURIComponent(s.replace(/ /g, "%20")), l = u === "base64" ? e : `data:image/svg+xml;base64,${btoa(a)}`, f = uu(e, a);
      return Re.set(e, [l, ...f]), [l, ...f];
    } else if (u === "base64") {
      let a, l = Zl(s);
      switch (o) {
        case Nr:
        case Mr:
          a = fu(l);
          break;
        case $r:
          a = lu(l);
          break;
        case Wr:
          a = au(l);
          break;
      }
      return Re.set(e, [e, ...a]), [e, ...a];
    } else
      return console.warn("Image data URI resolved without size:" + e), Re.set(e, [e]), [e];
  }
  if (!globalThis.fetch)
    throw new Error("`fetch` is required to be polyfilled to load images.");
  if (Sn.has(e))
    return Sn.get(e);
  let t = Re.get(e);
  if (t)
    return t;
  let n = e, r = fetch(n).then((i) => {
    let o = i.headers.get("content-type");
    return o === "image/svg+xml" || o === "application/svg+xml" ? i.text() : i.arrayBuffer();
  }).then((i) => {
    if (typeof i == "string")
      try {
        let s = `data:image/svg+xml;base64,${btoa(i)}`, a = uu(n, i);
        return [s, ...a];
      } catch (s) {
        throw new Error(`Failed to parse SVG image: ${s.message}`);
      }
    let [o, u] = su(i);
    return [o, ...u];
  }).then((i) => (Re.set(n, i), i)).catch((i) => (console.error(`Can't load image ${n}: ` + i.message), Re.set(n, []), []));
  return Sn.set(n, r), r;
}
function ef(e) {
  return [255, 216, 255].every((t, n) => e[n] === t) ? Wr : [137, 80, 78, 71, 13, 10, 26, 10].every((t, n) => e[n] === t) ? tf(e) ? Mr : Nr : [71, 73, 70, 56].every((t, n) => e[n] === t) ? $r : [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80].every((t, n) => !t || e[n] === t) ? Ql : [60, 63, 120, 109, 108].every((t, n) => e[n] === t) ? Cn : [0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102].every((t, n) => !t || e[n] === t) ? Xl : null;
}
function tf(e) {
  let t = new DataView(e.buffer), n, r, i = 8, o = false;
  for (; !o && n !== "IEND" && i < e.length; ) {
    r = t.getUint32(i);
    let u = e.subarray(i + 4, i + 8);
    n = String.fromCharCode(...u), o = n === "acTL", i += 12 + r;
  }
  return o;
}
var _n = { accentHeight: "accent-height", alignmentBaseline: "alignment-baseline", arabicForm: "arabic-form", baselineShift: "baseline-shift", capHeight: "cap-height", clipPath: "clip-path", clipRule: "clip-rule", colorInterpolation: "color-interpolation", colorInterpolationFilters: "color-interpolation-filters", colorProfile: "color-profile", colorRendering: "color-rendering", dominantBaseline: "dominant-baseline", enableBackground: "enable-background", fillOpacity: "fill-opacity", fillRule: "fill-rule", floodColor: "flood-color", floodOpacity: "flood-opacity", fontFamily: "font-family", fontSize: "font-size", fontSizeAdjust: "font-size-adjust", fontStretch: "font-stretch", fontStyle: "font-style", fontVariant: "font-variant", fontWeight: "font-weight", glyphName: "glyph-name", glyphOrientationHorizontal: "glyph-orientation-horizontal", glyphOrientationVertical: "glyph-orientation-vertical", horizAdvX: "horiz-adv-x", horizOriginX: "horiz-origin-x", href: "href", imageRendering: "image-rendering", letterSpacing: "letter-spacing", lightingColor: "lighting-color", markerEnd: "marker-end", markerMid: "marker-mid", markerStart: "marker-start", overlinePosition: "overline-position", overlineThickness: "overline-thickness", paintOrder: "paint-order", panose1: "panose-1", pointerEvents: "pointer-events", renderingIntent: "rendering-intent", shapeRendering: "shape-rendering", stopColor: "stop-color", stopOpacity: "stop-opacity", strikethroughPosition: "strikethrough-position", strikethroughThickness: "strikethrough-thickness", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width", textAnchor: "text-anchor", textDecoration: "text-decoration", textRendering: "text-rendering", underlinePosition: "underline-position", underlineThickness: "underline-thickness", unicodeBidi: "unicode-bidi", unicodeRange: "unicode-range", unitsPerEm: "units-per-em", vAlphabetic: "v-alphabetic", vHanging: "v-hanging", vIdeographic: "v-ideographic", vMathematical: "v-mathematical", vectorEffect: "vector-effect", vertAdvY: "vert-adv-y", vertOriginX: "vert-origin-x", vertOriginY: "vert-origin-y", wordSpacing: "word-spacing", writingMode: "writing-mode", xHeight: "x-height", xlinkActuate: "xlink:actuate", xlinkArcrole: "xlink:arcrole", xlinkHref: "xlink:href", xlinkRole: "xlink:role", xlinkShow: "xlink:show", xlinkTitle: "xlink:title", xlinkType: "xlink:type", xmlBase: "xml:base", xmlLang: "xml:lang", xmlSpace: "xml:space", xmlnsXlink: "xmlns:xlink" };
var rf = /[\r\n%#()<>?[\\\]^`{|}"']/g;
function kn(e, t) {
  if (!e)
    return "";
  if (Array.isArray(e))
    return e.map((l) => kn(l, t)).join("");
  if (typeof e != "object")
    return String(e);
  let n = e.type;
  if (n === "text")
    throw new Error("<text> nodes are not currently supported, please convert them to <path>");
  let { children: r, style: i, ...o } = e.props || {}, u = (i == null ? void 0 : i.color) || t, s = `${Object.entries(o).map(([l, f]) => (typeof f == "string" && f.toLowerCase() === "currentcolor" && (f = u), l === "href" && n === "image" ? ` ${_n[l] || l}="${Re.get(f)[0]}"` : ` ${_n[l] || l}="${f}"`)).join("")}`, a = i ? ` style="${Object.entries(i).map(([l, f]) => `${ou(l)}:${f}`).join(";")}"` : "";
  return `<${n}${s}${a}>${kn(r, u)}</${n}>`;
}
async function cu(e) {
  let t = /* @__PURE__ */ new Set(), n = (r) => {
    if (r && bt(r)) {
      if (Array.isArray(r)) {
        r.forEach((i) => n(i));
        return;
      } else
        typeof r == "object" && (r.type === "image" ? t.has(r.props.href) || t.add(r.props.href) : r.type === "img" && (t.has(r.props.src) || t.add(r.props.src)));
      Array.isArray(r.props.children) ? r.props.children.map((i) => n(i)) : n(r.props.children);
    }
  };
  return n(e), Promise.all(Array.from(t).map((r) => yt(r)));
}
async function du(e, t) {
  let { viewBox: n, viewbox: r, width: i, height: o, className: u, style: s, children: a, ...l } = e.props || {};
  n || (n = r), l.xmlns = "http://www.w3.org/2000/svg";
  let f = (s == null ? void 0 : s.color) || t, c = vt(n), d = c ? c[3] / c[2] : null;
  return i = i || d && o ? o / d : null, o = o || d && i ? i * d : null, l.width = i, l.height = o, n && (l.viewBox = n), `data:image/svg+xml;utf8,${`<svg ${Object.entries(l).map(([h, p]) => (typeof p == "string" && p.toLowerCase() === "currentcolor" && (p = f), ` ${_n[h] || h}="${p}"`)).join("")}>${kn(a, f)}</svg>`.replace(rf, encodeURIComponent)}`;
}
var Ee = "flex";
var pu = { p: { display: Ee, marginTop: "1em", marginBottom: "1em" }, div: { display: Ee }, blockquote: { display: Ee, marginTop: "1em", marginBottom: "1em", marginLeft: 40, marginRight: 40 }, center: { display: Ee, textAlign: "center" }, hr: { display: Ee, marginTop: "0.5em", marginBottom: "0.5em", marginLeft: "auto", marginRight: "auto", borderWidth: 1, borderStyle: "solid" }, h1: { display: Ee, fontSize: "2em", marginTop: "0.67em", marginBottom: "0.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h2: { display: Ee, fontSize: "1.5em", marginTop: "0.83em", marginBottom: "0.83em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h3: { display: Ee, fontSize: "1.17em", marginTop: "1em", marginBottom: "1em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h4: { display: Ee, marginTop: "1.33em", marginBottom: "1.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h5: { display: Ee, fontSize: "0.83em", marginTop: "1.67em", marginBottom: "1.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h6: { display: Ee, fontSize: "0.67em", marginTop: "2.33em", marginBottom: "2.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, u: { textDecoration: "underline" }, strong: { fontWeight: "bold" }, b: { fontWeight: "bold" }, i: { fontStyle: "italic" }, em: { fontStyle: "italic" }, code: { fontFamily: "monospace" }, kbd: { fontFamily: "monospace" }, pre: { display: Ee, fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", marginBottom: "1em" }, mark: { backgroundColor: "yellow", color: "black" }, big: { fontSize: "larger" }, small: { fontSize: "smaller" }, s: { textDecoration: "line-through" } };
var nf = /* @__PURE__ */ new Set(["color", "font", "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textTransform", "textShadowOffset", "textShadowColor", "textShadowRadius", "textDecorationLine", "textDecorationStyle", "textDecorationColor", "whiteSpace", "transform", "wordBreak", "tabSize", "opacity", "filter", "_viewportWidth", "_viewportHeight", "_inheritedClipPathId", "_inheritedMaskId", "_inheritedBackgroundClipTextPath"]);
function Tn(e) {
  let t = {};
  for (let n in e)
    nf.has(n) && (t[n] = e[n]);
  return t;
}
function uf(e, t) {
  try {
    let n = new Qe(e);
    switch (n.unit) {
      case "px":
        return { absolute: n.value };
      case "em":
        return { absolute: n.value * t };
      case "rem":
        return { absolute: n.value * 16 };
      case "%":
        return { relative: n.value };
      default:
        return {};
    }
  } catch {
    return {};
  }
}
function An(e, t, n) {
  switch (e) {
    case "top":
      return { yRelative: 0 };
    case "left":
      return { xRelative: 0 };
    case "right":
      return { xRelative: 100 };
    case "bottom":
      return { yRelative: 100 };
    case "center":
      return {};
    default: {
      let r = uf(e, t);
      return r.absolute ? { [n ? "xAbsolute" : "yAbsolute"]: r.absolute } : r.relative ? { [n ? "xRelative" : "yRelative"]: r.relative } : {};
    }
  }
}
function On(e, t) {
  if (typeof e == "number")
    return { xAbsolute: e };
  let n;
  try {
    n = (0, import_postcss_value_parser.default)(e).nodes.filter((r) => r.type === "word").map((r) => r.value);
  } catch {
    return {};
  }
  return n.length === 1 ? An(n[0], t, true) : n.length === 2 ? ((n[0] === "top" || n[0] === "bottom" || n[1] === "left" || n[1] === "right") && n.reverse(), { ...An(n[0], t, true), ...An(n[1], t, false) }) : {};
}
function It(e, t) {
  let n = (0, import_css_to_react_native2.getPropertyName)(`mask-${t}`);
  return e[n] || e[`WebkitM${n.substring(1)}`];
}
function hu(e) {
  let t = e.maskImage || e.WebkitMaskImage, n = { position: It(e, "position") || "0% 0%", size: It(e, "size") || "100% 100%", repeat: It(e, "repeat") || "repeat", origin: It(e, "origin") || "border-box", clip: It(e, "origin") || "border-box" };
  return Lr(t).filter((i) => i && i !== "none").reverse().map((i) => ({ image: i, ...n }));
}
var df = /* @__PURE__ */ new Set(["flex", "flexGrow", "flexShrink", "flexBasis", "fontWeight", "lineHeight", "opacity", "scale", "scaleX", "scaleY"]);
var pf = /* @__PURE__ */ new Set(["lineHeight"]);
function hf(e, t, n, r) {
  return e === "textDecoration" && !n.includes(t.textDecorationColor) && (t.textDecorationColor = r), t;
}
function Rt(e, t) {
  let n = Number(t);
  return isNaN(n) ? t : df.has(e) ? pf.has(e) ? n : String(t) : n + "px";
}
function mf(e, t, n) {
  if (e === "lineHeight")
    return { lineHeight: Rt(e, t) };
  if (e === "fontFamily")
    return { fontFamily: t.split(",").map((r) => r.trim().replace(/(^['"])|(['"]$)/g, "").toLocaleLowerCase()) };
  if (e === "borderRadius") {
    if (typeof t != "string" || !t.includes("/"))
      return;
    let [r, i] = t.split("/"), o = (0, import_css_to_react_native.getStylesForProperty)(e, r, true), u = (0, import_css_to_react_native.getStylesForProperty)(e, i, true);
    for (let s in o)
      u[s] = Rt(e, o[s]) + " " + Rt(e, u[s]);
    return u;
  }
  if (/^border(Top|Right|Bottom|Left)?$/.test(e)) {
    let r = (0, import_css_to_react_native.getStylesForProperty)("border", t, true);
    r.borderWidth === 1 && !String(t).includes("1px") && (r.borderWidth = 3), r.borderColor === "black" && !String(t).includes("black") && (r.borderColor = n);
    let i = { Width: Rt(e + "Width", r.borderWidth), Style: ve(r.borderStyle, { solid: "solid", dashed: "dashed" }, "solid", e + "Style"), Color: r.borderColor }, o = {};
    for (let u of e === "border" ? ["Top", "Right", "Bottom", "Left"] : [e.slice(6)])
      for (let s in i)
        o["border" + u + s] = i[s];
    return o;
  }
  if (e === "boxShadow") {
    if (!t)
      throw new Error('Invalid `boxShadow` value: "' + t + '".');
    return { [e]: typeof t == "string" ? (0, import_css_box_shadow.parse)(t) : t };
  }
  if (e === "transform") {
    if (typeof t != "string")
      throw new Error("Invalid `transform` value.");
    let r = {}, i = t.replace(/(-?[\d.]+%)/g, (u, s) => {
      let a = ~~(Math.random() * 1e9);
      return r[a] = s, a + "px";
    }), o = (0, import_css_to_react_native.getStylesForProperty)("transform", i, true);
    for (let u of o.transform)
      for (let s in u)
        r[u[s]] && (u[s] = r[u[s]]);
    return o;
  }
  if (e === "background")
    return t = t.toString().trim(), /^(linear-gradient|radial-gradient|url)\(/.test(t) ? (0, import_css_to_react_native.getStylesForProperty)("backgroundImage", t, true) : (0, import_css_to_react_native.getStylesForProperty)("background", t, true);
  if (e === "textShadow") {
    t = t.toString().trim();
    let r = {}, i = Lr(t);
    for (let o of i) {
      let u = (0, import_css_to_react_native.getStylesForProperty)("textShadow", o, true);
      for (let s in u)
        r[s] ? r[s].push(u[s]) : r[s] = [u[s]];
    }
    return r;
  }
}
function mu(e) {
  return e === "transform" ? " Only absolute lengths such as `10px` are supported." : "";
}
var Du = /rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\.\d]+)\)/;
function bu(e) {
  if (typeof e == "string" && Du.test(e.trim()))
    return e.trim().replace(Du, (t, n, r, i, o) => `rgba(${n}, ${r}, ${i}, ${o})`);
  if (typeof e == "object" && e !== null) {
    for (let t in e)
      e[t] = bu(e[t]);
    return e;
  }
  return e;
}
function qr(e, t) {
  let n = {};
  if (e) {
    let i = gf(e.color, t.color);
    n.color = i;
    for (let o in e) {
      if (o.startsWith("_")) {
        n[o] = e[o];
        continue;
      }
      if (o === "color")
        continue;
      let u = (0, import_css_to_react_native.getPropertyName)(o), s = vf(e[o], i);
      try {
        let a = mf(u, s, i) || hf(u, (0, import_css_to_react_native.getStylesForProperty)(u, Rt(u, s), true), s, i);
        Object.assign(n, a);
      } catch (a) {
        throw new Error(a.message + (a.message.includes(s) ? `
  ` + mu(u) : `
  in CSS rule \`${u}: ${s}\`.${mu(u)}`));
      }
    }
  }
  if (n.backgroundImage) {
    let { backgrounds: i } = (0, import_css_background_parser.parseElementStyle)(n);
    n.backgroundImage = i;
  }
  (n.maskImage || n.WebkitMaskImage) && (n.maskImage = hu(n));
  let r = Df(n.fontSize, t.fontSize);
  typeof n.fontSize < "u" && (n.fontSize = r), n.transformOrigin && (n.transformOrigin = On(n.transformOrigin, r));
  for (let i in n) {
    let o = n[i];
    if (i === "lineHeight")
      typeof o == "string" && (o = n[i] = W(o, r, r, t, true) / r);
    else {
      if (typeof o == "string") {
        let u = W(o, r, r, t);
        typeof u < "u" && (n[i] = u), o = n[i];
      }
      if (typeof o == "string" || typeof o == "object") {
        let u = bu(o);
        u && (n[i] = u), o = n[i];
      }
    }
    if (i === "opacity" && typeof o == "number" && (n.opacity = o * t.opacity), i === "transform") {
      let u = o;
      for (let s of u) {
        let a = Object.keys(s)[0], l = s[a], f = typeof l == "string" ? W(l, r, r, t) ?? l : l;
        s[a] = f;
      }
    }
    if (i === "textShadowRadius") {
      let u = o;
      n.textShadowRadius = u.map((s) => W(s, r, 0, t, false));
    }
    if (i === "textShadowOffset") {
      let u = o;
      n.textShadowOffset = u.map(({ height: s, width: a }) => ({ height: W(s, r, 0, t, false), width: W(a, r, 0, t, false) }));
    }
  }
  return n;
}
function Df(e, t) {
  if (typeof e == "number")
    return e;
  try {
    let n = new Qe(e);
    switch (n.unit) {
      case "em":
        return n.value * t;
      case "rem":
        return n.value * 16;
    }
  } catch {
    return t;
  }
}
function gu(e) {
  if (e.startsWith("hsl")) {
    let t = index_esm_default(e), [n, r, i] = t.values;
    return `hsl(${[n, `${r}%`, `${i}%`].concat(t.alpha === 1 ? [] : [t.alpha]).join(",")})`;
  }
  return e;
}
function gf(e, t) {
  return e && e.toLowerCase() !== "currentcolor" ? gu(e) : gu(t);
}
function bf(e, t) {
  return e.replace(/currentcolor/gi, t);
}
function vf(e, t) {
  return Rr(e) && (e = bf(e, t)), e;
}
async function Pn(e, t, n, r, i) {
  let o = await qe(), u = { ...n, ...qr(pu[t], n), ...qr(r, n) };
  if (t === "img") {
    let [s, a, l] = await yt(i.src);
    if (a === void 0 && l === void 0) {
      if (i.width === void 0 || i.height === void 0)
        throw new Error("Image size cannot be determined. Please provide the width and height of the image.");
      a = parseInt(i.width), l = parseInt(i.height);
    }
    let f = l / a, c = (u.borderLeftWidth || 0) + (u.borderRightWidth || 0) + (u.paddingLeft || 0) + (u.paddingRight || 0), d = (u.borderTopWidth || 0) + (u.borderBottomWidth || 0) + (u.paddingTop || 0) + (u.paddingBottom || 0), h = u.width || i.width, p = u.height || i.height, m = typeof h == "number" && typeof p == "number";
    m && (h -= c, p -= d), h === void 0 && p === void 0 ? (h = "100%", e.setAspectRatio(1 / f)) : h === void 0 ? typeof p == "number" ? h = p / f : e.setAspectRatio(1 / f) : p === void 0 && (typeof h == "number" ? p = h * f : e.setAspectRatio(1 / f)), u.width = m ? h + c : h, u.height = m ? p + d : p, u.__src = s;
  }
  if (t === "svg") {
    let s = i.viewBox || i.viewbox, a = vt(s), l = a ? a[3] / a[2] : null, { width: f, height: c } = i;
    typeof f > "u" && c ? l == null ? f = 0 : typeof c == "string" && c.endsWith("%") ? f = parseInt(c) / l + "%" : (c = W(c, n.fontSize, 1, n), f = c / l) : typeof c > "u" && f ? l == null ? f = 0 : typeof f == "string" && f.endsWith("%") ? c = parseInt(f) * l + "%" : (f = W(f, n.fontSize, 1, n), c = f * l) : (typeof f < "u" && (f = W(f, n.fontSize, 1, n) || f), typeof c < "u" && (c = W(c, n.fontSize, 1, n) || c), f || (f = a == null ? void 0 : a[2]), c || (c = a == null ? void 0 : a[3])), !u.width && f && (u.width = f), !u.height && c && (u.height = c);
  }
  return e.setDisplay(ve(u.display, { flex: o.DISPLAY_FLEX, block: o.DISPLAY_FLEX, none: o.DISPLAY_NONE, "-webkit-box": o.DISPLAY_FLEX }, o.DISPLAY_FLEX, "display")), e.setAlignContent(ve(u.alignContent, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, "space-between": o.ALIGN_SPACE_BETWEEN, "space-around": o.ALIGN_SPACE_AROUND, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_AUTO, "alignContent")), e.setAlignItems(ve(u.alignItems, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_STRETCH, "alignItems")), e.setAlignSelf(ve(u.alignSelf, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_AUTO, "alignSelf")), e.setJustifyContent(ve(u.justifyContent, { center: o.JUSTIFY_CENTER, "flex-start": o.JUSTIFY_FLEX_START, "flex-end": o.JUSTIFY_FLEX_END, "space-between": o.JUSTIFY_SPACE_BETWEEN, "space-around": o.JUSTIFY_SPACE_AROUND }, o.JUSTIFY_FLEX_START, "justifyContent")), e.setFlexDirection(ve(u.flexDirection, { row: o.FLEX_DIRECTION_ROW, column: o.FLEX_DIRECTION_COLUMN, "row-reverse": o.FLEX_DIRECTION_ROW_REVERSE, "column-reverse": o.FLEX_DIRECTION_COLUMN_REVERSE }, o.FLEX_DIRECTION_ROW, "flexDirection")), e.setFlexWrap(ve(u.flexWrap, { wrap: o.WRAP_WRAP, nowrap: o.WRAP_NO_WRAP, "wrap-reverse": o.WRAP_WRAP_REVERSE }, o.WRAP_NO_WRAP, "flexWrap")), typeof u.gap < "u" && e.setGap(o.GUTTER_ALL, u.gap), typeof u.rowGap < "u" && e.setGap(o.GUTTER_ROW, u.rowGap), typeof u.columnGap < "u" && e.setGap(o.GUTTER_COLUMN, u.columnGap), typeof u.flexBasis < "u" && e.setFlexBasis(u.flexBasis), e.setFlexGrow(typeof u.flexGrow > "u" ? 0 : u.flexGrow), e.setFlexShrink(typeof u.flexShrink > "u" ? 0 : u.flexShrink), typeof u.maxHeight < "u" && e.setMaxHeight(u.maxHeight), typeof u.maxWidth < "u" && e.setMaxWidth(u.maxWidth), typeof u.minHeight < "u" && e.setMinHeight(u.minHeight), typeof u.minWidth < "u" && e.setMinWidth(u.minWidth), e.setOverflow(ve(u.overflow, { visible: o.OVERFLOW_VISIBLE, hidden: o.OVERFLOW_HIDDEN }, o.OVERFLOW_VISIBLE, "overflow")), e.setMargin(o.EDGE_TOP, u.marginTop || 0), e.setMargin(o.EDGE_BOTTOM, u.marginBottom || 0), e.setMargin(o.EDGE_LEFT, u.marginLeft || 0), e.setMargin(o.EDGE_RIGHT, u.marginRight || 0), e.setBorder(o.EDGE_TOP, u.borderTopWidth || 0), e.setBorder(o.EDGE_BOTTOM, u.borderBottomWidth || 0), e.setBorder(o.EDGE_LEFT, u.borderLeftWidth || 0), e.setBorder(o.EDGE_RIGHT, u.borderRightWidth || 0), e.setPadding(o.EDGE_TOP, u.paddingTop || 0), e.setPadding(o.EDGE_BOTTOM, u.paddingBottom || 0), e.setPadding(o.EDGE_LEFT, u.paddingLeft || 0), e.setPadding(o.EDGE_RIGHT, u.paddingRight || 0), e.setPositionType(ve(u.position, { absolute: o.POSITION_TYPE_ABSOLUTE, relative: o.POSITION_TYPE_RELATIVE }, o.POSITION_TYPE_RELATIVE, "position")), typeof u.top < "u" && e.setPosition(o.EDGE_TOP, u.top), typeof u.bottom < "u" && e.setPosition(o.EDGE_BOTTOM, u.bottom), typeof u.left < "u" && e.setPosition(o.EDGE_LEFT, u.left), typeof u.right < "u" && e.setPosition(o.EDGE_RIGHT, u.right), typeof u.height < "u" ? e.setHeight(u.height) : e.setHeightAuto(), typeof u.width < "u" ? e.setWidth(u.width) : e.setWidthAuto(), [u, Tn(u)];
}
var vu = [1, 0, 0, 1, 0, 0];
function yf(e, t, n) {
  let r = [...vu];
  for (let i of e) {
    let o = Object.keys(i)[0], u = i[o];
    if (typeof u == "string")
      if (o === "translateX")
        u = parseFloat(u) / 100 * t, i[o] = u;
      else if (o === "translateY")
        u = parseFloat(u) / 100 * n, i[o] = u;
      else
        throw new Error(`Invalid transform: "${o}: ${u}".`);
    let s = u, a = [...vu];
    switch (o) {
      case "translateX":
        a[4] = s;
        break;
      case "translateY":
        a[5] = s;
        break;
      case "scale":
        a[0] = s, a[3] = s;
        break;
      case "scaleX":
        a[0] = s;
        break;
      case "scaleY":
        a[3] = s;
        break;
      case "rotate": {
        let l = s * Math.PI / 180, f = Math.cos(l), c = Math.sin(l);
        a[0] = f, a[1] = c, a[2] = -c, a[3] = f;
        break;
      }
      case "skewX":
        a[2] = Math.tan(s * Math.PI / 180);
        break;
      case "skewY":
        a[1] = Math.tan(s * Math.PI / 180);
        break;
    }
    r = Bt(a, r);
  }
  e.splice(0, e.length), e.push(...r), e.__resolved = true;
}
function Lt({ left: e, top: t, width: n, height: r }, i, o, u) {
  let s;
  i.__resolved || yf(i, n, r);
  let a = i;
  if (o)
    s = a;
  else {
    let l = (u == null ? void 0 : u.xAbsolute) ?? ((u == null ? void 0 : u.xRelative) ?? 50) * n / 100, f = (u == null ? void 0 : u.yAbsolute) ?? ((u == null ? void 0 : u.yRelative) ?? 50) * r / 100, c = e + l, d = t + f;
    s = Bt([1, 0, 0, 1, c, d], Bt(a, [1, 0, 0, 1, -c, -d])), a.__parent && (s = Bt(a.__parent, s)), a.splice(0, 6, ...s);
  }
  return `matrix(${s.map((l) => l.toFixed(2)).join(",")})`;
}
function xu({ left: e, top: t, width: n, height: r, isInheritingTransform: i }, o) {
  let u = "", s = 1;
  return o.transform && (u = Lt({ left: e, top: t, width: n, height: r }, o.transform, i, o.transformOrigin)), o.opacity !== void 0 && (s = +o.opacity), { matrix: u, opacity: s };
}
function Bn({ id: e, content: t, filter: n, left: r, top: i, width: o, height: u, matrix: s, opacity: a, image: l, clipPathId: f, debug: c, shape: d, decorationShape: h }, p) {
  let m = "";
  if (c && (m = S("rect", { x: r, y: i - u, width: o, height: u, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: s || void 0, "clip-path": f ? `url(#${f})` : void 0 })), l) {
    let D = { href: l, x: r, y: i, width: o, height: u, transform: s || void 0, "clip-path": f ? `url(#${f})` : void 0, style: p.filter ? `filter:${p.filter}` : void 0 };
    return [(n ? `${n}<g filter="url(#satori_s-${e})">` : "") + S("image", { ...D, opacity: a !== 1 ? a : void 0 }) + (h || "") + (n ? "</g>" : "") + m, ""];
  }
  let v = { x: r, y: i, width: o, height: u, "font-weight": p.fontWeight, "font-style": p.fontStyle, "font-size": p.fontSize, "font-family": p.fontFamily, "letter-spacing": p.letterSpacing || void 0, transform: s || void 0, "clip-path": f ? `url(#${f})` : void 0, style: p.filter ? `filter:${p.filter}` : void 0 };
  return [(n ? `${n}<g filter="url(#satori_s-${e})">` : "") + S("text", { ...v, fill: p.color, opacity: a !== 1 ? a : void 0 }, (0, import_escape_html.default)(t)) + (h || "") + (n ? "</g>" : "") + m, d ? S("text", v, (0, import_escape_html.default)(t)) : ""];
}
function xf(e, t, n) {
  return e.replace(/([MA])([0-9.-]+),([0-9.-]+)/g, function(r, i, o, u) {
    return i + (parseFloat(o) + t) + "," + (parseFloat(u) + n);
  });
}
var zr = 1.1;
function Fu({ id: e, width: t, height: n }, r) {
  if (!r.shadowColor || !r.shadowOffset || typeof r.shadowRadius > "u")
    return "";
  let i = r.shadowColor.length, o = "", u = "", s = 0, a = t, l = 0, f = n;
  for (let c = 0; c < i; c++) {
    let d = r.shadowRadius[c] * r.shadowRadius[c] / 4;
    s = Math.min(r.shadowOffset[c].width - d, s), a = Math.max(r.shadowOffset[c].width + d + t, a), l = Math.min(r.shadowOffset[c].height - d, l), f = Math.max(r.shadowOffset[c].height + d + n, f), o += S("feDropShadow", { dx: r.shadowOffset[c].width, dy: r.shadowOffset[c].height, stdDeviation: r.shadowRadius[c] / 2, "flood-color": r.shadowColor[c], "flood-opacity": 1, ...i > 1 ? { in: "SourceGraphic", result: `satori_s-${e}-result-${c}` } : {} }), i > 1 && (u = S("feMergeNode", { in: `satori_s-${e}-result-${c}` }) + u);
  }
  return S("filter", { id: `satori_s-${e}`, x: (s / t * 100 * zr).toFixed(2) + "%", y: (l / n * 100 * zr).toFixed(2) + "%", width: ((a - s) / t * 100 * zr).toFixed(2) + "%", height: ((f - l) / n * 100 * zr).toFixed(2) + "%" }, o + (u ? S("feMerge", {}, u) : ""));
}
function wu({ width: e, height: t, shape: n, opacity: r, id: i }, o) {
  if (!o.boxShadow)
    return null;
  let u = "", s = "";
  for (let a = o.boxShadow.length - 1; a >= 0; a--) {
    let l = "", f = o.boxShadow[a];
    f.spreadRadius && f.inset && (f.spreadRadius = -f.spreadRadius);
    let c = f.blurRadius * f.blurRadius / 4 + (f.spreadRadius || 0), d = Math.min(-c - (f.inset ? f.offsetX : 0), 0), h = Math.max(c + e - (f.inset ? f.offsetX : 0), e), p = Math.min(-c - (f.inset ? f.offsetY : 0), 0), m = Math.max(c + t - (f.inset ? f.offsetY : 0), t), v = `satori_s-${i}-${a}`, D = `satori_ms-${i}-${a}`, b = f.spreadRadius ? n.replace('stroke-width="0"', `stroke-width="${f.spreadRadius * 2}"`) : n;
    l += S("mask", { id: D, maskUnits: "userSpaceOnUse" }, S("rect", { x: 0, y: 0, width: o._viewportWidth || "100%", height: o._viewportHeight || "100%", fill: f.inset ? "#000" : "#fff" }) + b.replace('fill="#fff"', f.inset ? 'fill="#fff"' : 'fill="#000"').replace('stroke="#fff"', ""));
    let y = b.replace(/d="([^"]+)"/, (F, x) => 'd="' + xf(x, f.offsetX, f.offsetY) + '"').replace(/x="([^"]+)"/, (F, x) => 'x="' + (parseFloat(x) + f.offsetX) + '"').replace(/y="([^"]+)"/, (F, x) => 'y="' + (parseFloat(x) + f.offsetY) + '"');
    f.spreadRadius && f.spreadRadius < 0 && (l += S("mask", { id: D + "-neg", maskUnits: "userSpaceOnUse" }, y.replace('stroke="#fff"', 'stroke="#000"').replace(/stroke-width="[^"]+"/, `stroke-width="${-f.spreadRadius * 2}"`))), f.spreadRadius && f.spreadRadius < 0 && (y = S("g", { mask: `url(#${D}-neg)` }, y)), l += S("defs", {}, S("filter", { id: v, x: `${d / e * 100}%`, y: `${p / t * 100}%`, width: `${(h - d) / e * 100}%`, height: `${(m - p) / t * 100}%` }, S("feGaussianBlur", { stdDeviation: f.blurRadius / 2, result: "b" }) + S("feFlood", { "flood-color": f.color, in: "SourceGraphic", result: "f" }) + S("feComposite", { in: "f", in2: "b", operator: f.inset ? "out" : "in" }))) + S("g", { mask: `url(#${D})`, filter: `url(#${v})`, opacity: r }, y), f.inset ? s += l : u += l;
  }
  return [u, s];
}
function In({ width: e, left: t, top: n, ascender: r, clipPathId: i }, o) {
  let { textDecorationColor: u, textDecorationStyle: s, textDecorationLine: a, fontSize: l, color: f } = o;
  if (!a || a === "none")
    return "";
  let c = Math.max(1, l * 0.1), d = a === "line-through" ? n + r * 0.7 : a === "underline" ? n + r * 1.1 : n, h = s === "dashed" ? `${c * 1.2} ${c * 2}` : s === "dotted" ? `0 ${c * 2}` : void 0;
  return S("line", { x1: t, y1: d, x2: t + e, y2: d, stroke: u || f, "stroke-width": c, "stroke-dasharray": h, "stroke-linecap": s === "dotted" ? "round" : "square", "clip-path": i ? `url(#${i})` : void 0 });
}
function Rn(e) {
  return e = e.replace("U+", "0x"), String.fromCodePoint(Number(e));
}
var ut = Rn("U+0020");
var Ln = Rn("U+0009");
var xt = Rn("U+2026");
function Eu(e, t, n) {
  let { fontSize: r, letterSpacing: i } = n, o = /* @__PURE__ */ new Map();
  function u(l) {
    if (o.has(l))
      return o.get(l);
    let f = e.measure(l, { fontSize: r, letterSpacing: i });
    return o.set(l, f), f;
  }
  function s(l) {
    let f = 0;
    for (let c of l)
      t(c) ? f += r : f += u(c);
    return f;
  }
  function a(l) {
    return s(be(l, "grapheme"));
  }
  return { measureGrapheme: u, measureGraphemeArray: s, measureText: a };
}
function Su(e, t, n) {
  let { textTransform: r, whiteSpace: i, wordBreak: o } = t;
  e = Ff(e, r, n);
  let { content: u, shouldCollapseTabsAndSpaces: s, allowSoftWrap: a } = Sf(e, i), { words: l, requiredBreaks: f, allowBreakWord: c } = Ef(u, o), [d, h] = wf(t, a);
  return { words: l, requiredBreaks: f, allowSoftWrap: a, allowBreakWord: c, processedContent: u, shouldCollapseTabsAndSpaces: s, lineLimit: d, blockEllipsis: h };
}
function Ff(e, t, n) {
  return t === "uppercase" ? e = e.toLocaleUpperCase(n) : t === "lowercase" ? e = e.toLocaleLowerCase(n) : t === "capitalize" && (e = be(e, "word", n).map((r) => be(r, "grapheme", n).map((i, o) => o === 0 ? i.toLocaleUpperCase(n) : i).join("")).join("")), e;
}
function wf(e, t) {
  let { textOverflow: n, lineClamp: r, WebkitLineClamp: i, WebkitBoxOrient: o, overflow: u, display: s } = e;
  if (s === "block" && r) {
    let [a, l = xt] = Cf(r);
    if (a)
      return [a, l];
  }
  return n === "ellipsis" && s === "-webkit-box" && o === "vertical" && ru(i) && i > 0 ? [i, xt] : n === "ellipsis" && u === "hidden" && !t ? [1, xt] : [1 / 0];
}
function Ef(e, t) {
  let n = ["break-all", "break-word"].includes(t), { words: r, requiredBreaks: i } = iu(e, t);
  return { words: r, requiredBreaks: i, allowBreakWord: n };
}
function Sf(e, t) {
  let n = ["pre", "pre-wrap", "pre-line"].includes(t), r = ["normal", "nowrap", "pre-line"].includes(t), i = !["pre", "nowrap"].includes(t);
  return n || (e = e.replace(/\n/g, ut)), r && (e = e.replace(/([ ]|\t)+/g, ut).trim()), { content: e, shouldCollapseTabsAndSpaces: r, allowSoftWrap: i };
}
function Cf(e) {
  if (typeof e == "number")
    return [e];
  let t = /^(\d+)\s*"(.*)"$/, n = /^(\d+)\s*'(.*)'$/, r = t.exec(e), i = n.exec(e);
  if (r) {
    let o = +r[1], u = r[2];
    return [o, u];
  } else if (i) {
    let o = +i[1], u = i[2];
    return [o, u];
  }
  return [];
}
var _f = /* @__PURE__ */ new Set([Ln]);
function kf(e) {
  return _f.has(e);
}
async function* Mn(e, t) {
  let n = await qe(), { parentStyle: r, inheritedStyle: i, parent: o, font: u, id: s, isInheritingTransform: a, debug: l, embedFont: f, graphemeImages: c, locale: d, canLoadAdditionalAssets: h } = t, { textAlign: p, lineHeight: m, textWrap: v, fontSize: D, filter: b, tabSize: y = 8, letterSpacing: F, _inheritedBackgroundClipTextPath: x, flexShrink: k } = r, { words: B, requiredBreaks: I, allowSoftWrap: G, allowBreakWord: ue, processedContent: ae, shouldCollapseTabsAndSpaces: ie, lineLimit: N, blockEllipsis: R } = Su(e, r, d), j = Tf(n, p);
  o.insertChild(j, o.getChildCount()), nu(k) && o.setFlexShrink(1);
  let K = u.getEngine(D, m, r, d), ce = h ? be(ae, "grapheme").filter((M) => !kf(M) && !K.has(M)) : [];
  yield ce.map((M) => ({ word: M, locale: d })), ce.length && (K = u.getEngine(D, m, r, d));
  function ee(M) {
    return !!(c && c[M]);
  }
  let { measureGrapheme: te, measureGraphemeArray: Ae, measureText: A } = Eu(K, ee, { fontSize: D, letterSpacing: F }), O = Rr(y) ? W(y, D, 1, r) : te(ut) * y, L = (M, J) => {
    if (M.length === 0)
      return { originWidth: 0, endingSpacesWidth: 0, text: M };
    let { index: oe, tabCount: U } = Af(M), le = 0;
    if (U > 0) {
      let fe = M.slice(0, oe), se = M.slice(oe + U), Y = A(fe), Ie = Y + J;
      le = (O === 0 ? Y : (Math.floor(Ie / O) + U) * O) + A(se);
    } else
      le = A(M);
    let H = M.trimEnd() === M ? le : A(M.trimEnd());
    return { originWidth: le, endingSpacesWidth: le - H, text: M };
  }, P = [], he = [], me = [], Be = [], kt = [];
  function Dn(M) {
    let J = 0, oe = 0, U = -1, le = 0, H = 0, fe = 0, se = 0;
    P = [], me = [0], Be = [], kt = [];
    let Y = 0, Ie = 0;
    for (; Y < B.length && J < N; ) {
      let $ = B[Y], nt = I[Y], we = 0, { originWidth: Ve, endingSpacesWidth: Ar, text: Ye } = L($, H);
      $ = Ye, we = Ve;
      let Z = Ar;
      nt && fe === 0 && (fe = K.height($));
      let De = ",.!?:-@)>]}%#".indexOf($[0]) < 0, Xe = !H, Or = Y && De && H + we > M + Z && G;
      if (ue && we > M && (!H || Or || nt)) {
        let ge = be($, "grapheme");
        B.splice(Y, 1, ...ge), H > 0 && (P.push(H - Ie), he.push(se), J++, le += fe, H = 0, fe = 0, se = 0, me.push(1), U = -1), Ie = Z;
        continue;
      }
      if (nt || Or)
        ie && $ === ut && (we = 0), P.push(H - Ie), he.push(se), J++, le += fe, H = we, fe = we ? K.height($) : 0, se = we ? K.baseline($) : 0, me.push(1), U = -1, nt || (oe = Math.max(oe, M));
      else {
        H += we;
        let ge = K.height($);
        ge > fe && (fe = ge, se = K.baseline($)), Xe && me[me.length - 1]++;
      }
      Xe && U++, oe = Math.max(oe, H);
      let it = H - we;
      if (we === 0)
        kt.push({ y: le, x: it, width: 0, line: J, lineIndex: U, isImage: false });
      else {
        let ge = be($, "word");
        for (let Oe = 0; Oe < ge.length; Oe++) {
          let ot = ge[Oe], $e = 0, At = false;
          ee(ot) ? ($e = D, At = true) : $e = te(ot), Be.push(ot), kt.push({ y: le, x: it, width: $e, line: J, lineIndex: U, isImage: At }), it += $e;
        }
      }
      Y++, Ie = Z;
    }
    return H && (J < N && (le += fe), J++, P.push(H), he.push(se)), { width: oe, height: le };
  }
  let Er = { width: 0, height: 0 };
  j.setMeasureFunc((M) => {
    let { width: J, height: oe } = Dn(M);
    if (v === "balance") {
      let le = J / 2, H = J, fe = J;
      for (; le + 1 < H; ) {
        fe = (le + H) / 2;
        let { height: Y } = Dn(fe);
        Y > oe ? le = fe : H = fe;
      }
      Dn(H);
      let se = Math.ceil(H);
      return Er = { width: se, height: oe }, { width: se, height: oe };
    }
    let U = Math.ceil(J);
    return Er = { width: U, height: oe }, { width: U, height: oe };
  });
  let [El, Sl] = yield, gn = "", Sr = "", je = i._inheritedClipPathId, Mo = i._inheritedMaskId, { left: No, top: Wo, width: bn, height: Cl } = j.getComputedLayout(), Cr = o.getComputedWidth() - o.getComputedPadding(n.EDGE_LEFT) - o.getComputedPadding(n.EDGE_RIGHT) - o.getComputedBorder(n.EDGE_LEFT) - o.getComputedBorder(n.EDGE_RIGHT), pt = El + No, ht = Sl + Wo, { matrix: We, opacity: _r } = xu({ left: No, top: Wo, width: bn, height: Cl, isInheritingTransform: a }, r), mt = "";
  if (r.textShadowOffset) {
    let { textShadowColor: M, textShadowOffset: J, textShadowRadius: oe } = r;
    mt = Fu({ width: Er.width, height: Er.height, id: s }, { shadowColor: M, shadowOffset: J, shadowRadius: oe }), mt = S("defs", {}, mt);
  }
  let Tt = "", kr = "", $o = "", Tr = -1, Dt = {}, He = null, qo = 0;
  for (let M = 0; M < Be.length; M++) {
    let J = kt[M], oe = kt[M + 1];
    if (!J)
      continue;
    let U = Be[M], le = null, H = false, fe = c ? c[U] : null, se = J.y, Y = J.x, Ie = J.width, $ = J.line;
    if ($ === Tr)
      continue;
    let nt = false;
    if (P.length > 1) {
      let Z = bn - P[$];
      if (p === "right" || p === "end")
        Y += Z;
      else if (p === "center")
        Y += Z / 2;
      else if (p === "justify" && $ < P.length - 1) {
        let De = me[$], Xe = De > 1 ? Z / (De - 1) : 0;
        Y += Xe * J.lineIndex, nt = true;
      }
    }
    let we = he[$], Ve = K.baseline(U), Ar = K.height(U), Ye = we - Ve;
    if (Dt[$] || (Dt[$] = [Y, ht + se + Ye, Ve, nt ? bn : P[$]]), N !== 1 / 0) {
      let it = function(ge, Oe) {
        let ot = be(Oe, "grapheme", d), $e = "", At = 0;
        for (let zo of ot) {
          let Uo = ge + Ae([$e + zo]);
          if ($e && Uo + De > Cr)
            break;
          $e += zo, At = Uo;
        }
        return { subset: $e, resolvedWidth: At };
      }, Z = R, De = te(R);
      De > Cr && (Z = xt, De = te(Z));
      let Xe = te(ut), Or = $ < P.length - 1;
      if ($ + 1 === N && (Or || P[$] > Cr)) {
        if (Y + Ie + De + Xe > Cr) {
          let { subset: ge, resolvedWidth: Oe } = it(Y, U);
          U = ge + Z, Tr = $, Dt[$][2] = Oe, H = true;
        } else if (oe && oe.line !== $)
          if (p === "center") {
            let { subset: ge, resolvedWidth: Oe } = it(Y, U);
            U = ge + Z, Tr = $, Dt[$][2] = Oe, H = true;
          } else {
            let ge = Be[M + 1], { subset: Oe, resolvedWidth: ot } = it(Ie + Y, ge);
            U = U + Oe + Z, Tr = $, Dt[$][2] = ot, H = true;
          }
      }
    }
    if (fe)
      se += 0;
    else if (f) {
      if (!U.includes(Ln) && !eu.includes(U) && Be[M + 1] && oe && !oe.isImage && se === oe.y && !H) {
        He === null && (qo = Y), He = He === null ? U : He + U;
        continue;
      }
      let Z = He === null ? U : He + U, De = He === null ? Y : qo, Xe = J.width + Y - De;
      le = K.getSVG(Z.replace(/(\t)+/g, ""), { fontSize: D, left: pt + De, top: ht + se + Ve + Ye, letterSpacing: F }), He = null, l && ($o += S("rect", { x: pt + De, y: ht + se + Ye, width: Xe, height: Ar, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: We || void 0, "clip-path": je ? `url(#${je})` : void 0 }) + S("line", { x1: pt + Y, x2: pt + Y + J.width, y1: ht + se + Ye + Ve, y2: ht + se + Ye + Ve, stroke: "#14c000", "stroke-width": 1, transform: We || void 0, "clip-path": je ? `url(#${je})` : void 0 }));
    } else
      se += Ve + Ye;
    if (r.textDecorationLine) {
      let Z = Dt[$];
      Z && !Z[4] && (Tt += In({ left: pt + Z[0], top: Z[1], width: Z[3], ascender: Z[2], clipPathId: je }, r), Z[4] = 1);
    }
    if (le !== null)
      kr += le + " ";
    else {
      let [Z, De] = Bn({ content: U, filter: mt, id: s, left: pt + Y, top: ht + se, width: Ie, height: Ar, matrix: We, opacity: _r, image: fe, clipPathId: je, debug: l, shape: !!x, decorationShape: Tt }, r);
      gn += Z, Sr += De, Tt = "";
    }
    if (H)
      break;
  }
  if (kr) {
    let M = r.color !== "transparent" && _r !== 0 ? S("path", { fill: r.color, d: kr, transform: We || void 0, opacity: _r !== 1 ? _r : void 0, "clip-path": je ? `url(#${je})` : void 0, mask: Mo ? `url(#${Mo})` : void 0, style: b ? `filter:${b}` : void 0 }) : "";
    x && (Sr = S("path", { d: kr, transform: We || void 0 })), gn += (mt ? mt + S("g", { filter: `url(#satori_s-${s})` }, M + Tt) : M + Tt) + $o;
  }
  return Sr && (r._inheritedBackgroundClipTextPath.value += Sr), gn;
}
function Tf(e, t) {
  let n = e.Node.create();
  return n.setAlignItems(e.ALIGN_BASELINE), n.setJustifyContent(ve(t, { left: e.JUSTIFY_FLEX_START, right: e.JUSTIFY_FLEX_END, center: e.JUSTIFY_CENTER, justify: e.JUSTIFY_SPACE_BETWEEN, start: e.JUSTIFY_FLEX_START, end: e.JUSTIFY_FLEX_END }, e.JUSTIFY_FLEX_START, "textAlign")), n;
}
function Af(e) {
  let t = /(\t)+/.exec(e);
  return t ? { index: t.index, tabCount: t[0].length } : { index: null, tabCount: 0 };
}
var Nn = Nn || {};
var Cu = { type: "directional", value: "bottom" };
Nn.parse = function() {
  var e = { linearGradient: /^(\-(webkit|o|ms|moz)\-)?(linear\-gradient)/i, repeatingLinearGradient: /^(\-(webkit|o|ms|moz)\-)?(repeating\-linear\-gradient)/i, radialGradient: /^(\-(webkit|o|ms|moz)\-)?(radial\-gradient)/i, repeatingRadialGradient: /^(\-(webkit|o|ms|moz)\-)?(repeating\-radial\-gradient)/i, sideOrCorner: /^to (left (top|bottom)|right (top|bottom)|top (left|right)|bottom (left|right)|left|right|top|bottom)/i, extentKeywords: /^(closest\-side|closest\-corner|farthest\-side|farthest\-corner|contain|cover)/, positionKeywords: /^(left|center|right|top|bottom)/i, pixelValue: /^(-?(([0-9]*\.[0-9]+)|([0-9]+\.?)))px/, percentageValue: /^(-?(([0-9]*\.[0-9]+)|([0-9]+\.?)))\%/, emLikeValue: /^(-?(([0-9]*\.[0-9]+)|([0-9]+\.?)))(r?em|vw|vh)/, angleValue: /^(-?(([0-9]*\.[0-9]+)|([0-9]+\.?)))deg/, zeroValue: /[0]/, startCall: /^\(/, endCall: /^\)/, comma: /^,/, hexColor: /^\#([0-9a-fA-F]+)/, literalColor: /^([a-zA-Z]+)/, rgbColor: /^rgb/i, rgbaColor: /^rgba/i, number: /^(([0-9]*\.[0-9]+)|([0-9]+\.?))/ }, t = "";
  function n(A) {
    var O = new Error(t + ": " + A);
    throw O.source = t, O;
  }
  function r() {
    var A = i();
    return t.length > 0 && n("Invalid input not EOF"), A;
  }
  function i() {
    return k(o);
  }
  function o() {
    return s("linear-gradient", e.linearGradient, l, Cu) || s("repeating-linear-gradient", e.repeatingLinearGradient, l, Cu) || s("radial-gradient", e.radialGradient, h) || s("repeating-radial-gradient", e.repeatingRadialGradient, h);
  }
  function u(A = {}) {
    var L, P, he, me;
    let O = { ...A };
    return Object.assign(O, { style: (O.style || []).length > 0 ? O.style : [{ type: "extent-keyword", value: "farthest-corner" }], at: { type: "position", value: { x: { type: "position-keyword", value: "center", ...((P = (L = O.at) == null ? void 0 : L.value) == null ? void 0 : P.x) || {} }, y: { type: "position-keyword", value: "center", ...((me = (he = O.at) == null ? void 0 : he.value) == null ? void 0 : me.y) || {} } } } }), A.value || Object.assign(O, { type: "shape", value: O.style.some((Be) => ["%", "extent-keyword"].includes(Be.type)) ? "ellipse" : "circle" }), O;
  }
  function s(A, O, L, P) {
    return a(O, function(he) {
      var me = L();
      return me ? te(e.comma) || n("Missing comma before color stops") : me = P, { type: A, orientation: A.endsWith("radial-gradient") ? (me == null ? void 0 : me.map((Be) => u(Be))) ?? [u()] : me, colorStops: k(B) };
    });
  }
  function a(A, O) {
    var L = te(A);
    if (L) {
      te(e.startCall) || n("Missing (");
      var P = O(L);
      return te(e.endCall) || n("Missing )"), P;
    }
  }
  function l() {
    return f() || c() || d();
  }
  function f() {
    return ee("directional", e.sideOrCorner, 1);
  }
  function c() {
    return ee("angular", e.angleValue, 1);
  }
  function d() {
    return ee("directional", e.zeroValue, 0);
  }
  function h() {
    var A, O = p(), L;
    return O && (A = [], A.push(O), L = t, te(e.comma) && (O = p(), O ? A.push(O) : t = L)), A;
  }
  function p() {
    let A = m(), O = y();
    if (!(!A && !O))
      return { ...A, at: O };
  }
  function m() {
    let A = v() || D(), O = b() || K() || R(), L = ee("%", e.percentageValue, 1);
    if (A)
      return { ...A, style: [O, L].filter((P) => P) };
    if (O)
      return { style: [O, L].filter((P) => P), ...v() || D() };
  }
  function v() {
    return ee("shape", /^(circle)/i, 0);
  }
  function D() {
    return ee("shape", /^(ellipse)/i, 0);
  }
  function b() {
    return ee("extent-keyword", e.extentKeywords, 1);
  }
  function y() {
    if (ee("position", /^at/, 0)) {
      var A = F();
      return A || n("Missing positioning value"), A;
    }
  }
  function F() {
    var A = x();
    if (A.x || A.y)
      return { type: "position", value: A };
  }
  function x() {
    return { x: R(), y: R() };
  }
  function k(A) {
    var O = A(), L = [];
    if (O)
      for (L.push(O); te(e.comma); )
        O = A(), O ? L.push(O) : n("One extra comma");
    return L;
  }
  function B() {
    var A = I();
    return A || n("Expected color definition"), A.length = R(), A;
  }
  function I() {
    return ue() || ie() || ae() || G();
  }
  function G() {
    return ee("literal", e.literalColor, 0);
  }
  function ue() {
    return ee("hex", e.hexColor, 1);
  }
  function ae() {
    return a(e.rgbColor, function() {
      return { type: "rgb", value: k(N) };
    });
  }
  function ie() {
    return a(e.rgbaColor, function() {
      return { type: "rgba", value: k(N) };
    });
  }
  function N() {
    return te(e.number)[1];
  }
  function R() {
    return ee("%", e.percentageValue, 1) || j() || K();
  }
  function j() {
    return ee("position-keyword", e.positionKeywords, 1);
  }
  function K() {
    return ee("px", e.pixelValue, 1) || ce(e.emLikeValue, 1);
  }
  function ce(A, O) {
    var L = te(A);
    if (L)
      return { type: L[5], value: L[O] };
  }
  function ee(A, O, L) {
    var P = te(O);
    if (P)
      return { type: A, value: P[L] };
  }
  function te(A) {
    var O, L;
    return L = /^[\n\r\t\s]+/.exec(t), L && Ae(L[0].length), O = A.exec(t), O && Ae(O[0].length), O;
  }
  function Ae(A) {
    t = t.substr(A);
  }
  return function(A) {
    return t = A.toString(), r();
  };
}();
var Wn = Nn;
function Pf(e) {
  return e.type === "literal" ? e.value : e.type === "hex" ? `#${e.value}` : e.type === "rgb" ? `rgb(${e.value.join(",")})` : e.type === "rgba" ? `rgba(${e.value.join(",")})` : "transparent";
}
function Bf(e) {
  let t = 0, n = 0, r = 0, i = 0;
  return e.includes("top") ? n = 1 : e.includes("bottom") && (i = 1), e.includes("left") ? t = 1 : e.includes("right") && (r = 1), !t && !r && !n && !i && (n = 1), [t, n, r, i];
}
function If(e, t) {
  return typeof e == "string" && e.endsWith("%") ? t * parseFloat(e) / 100 : +e;
}
function $n(e, { x: t, y: n, defaultX: r, defaultY: i }) {
  return (e ? e.split(" ").map((o) => {
    try {
      let u = new Qe(o);
      return u.type === "length" || u.type === "number" ? u.value : u.value + u.unit;
    } catch {
      return null;
    }
  }).filter((o) => o !== null) : [r, i]).map((o, u) => If(o, [t, n][u]));
}
function _u(e, t, n) {
  let r = [];
  for (let s of t) {
    let a = Pf(s);
    if (!r.length && (r.push({ offset: 0, color: a }), typeof s.length > "u" || s.length.value === "0"))
      continue;
    let l = typeof s.length > "u" ? void 0 : s.length.type === "%" ? s.length.value / 100 : s.length.value / e;
    r.push({ offset: l, color: a });
  }
  r.length || r.push({ offset: 0, color: "transparent" });
  let i = r[r.length - 1];
  i.offset !== 1 && (typeof i.offset > "u" ? i.offset = 1 : r.push({ offset: 1, color: i.color }));
  let o = 0, u = 1;
  for (let s = 0; s < r.length; s++)
    if (typeof r[s].offset > "u") {
      for (u < s && (u = s); typeof r[u].offset > "u"; )
        u++;
      r[s].offset = (r[u].offset - r[o].offset) / (u - o) * (s - o) + r[o].offset;
    } else
      o = s;
  return n === "mask" ? r.map((s) => {
    let a = index_esm_default(s.color);
    return a.alpha === 0 ? { ...s, color: "rgba(0, 0, 0, 1)" } : { ...s, color: `rgba(255, 255, 255, ${a.alpha})` };
  }) : r;
}
async function Mt({ id: e, width: t, height: n, left: r, top: i }, { image: o, size: u, position: s, repeat: a }, l, f) {
  a = a || "repeat", f = f || "background";
  let c = a === "repeat-x" || a === "repeat", d = a === "repeat-y" || a === "repeat", h = $n(u, { x: t, y: n, defaultX: t, defaultY: n }), p = $n(s, { x: t, y: n, defaultX: 0, defaultY: 0 });
  if (o.startsWith("linear-gradient(")) {
    let m = Wn.parse(o)[0], [v, D] = h, b, y, F, x, k;
    if (m.orientation.type === "directional")
      [b, y, F, x] = Bf(m.orientation.value), k = Math.sqrt(Math.pow((F - b) * v, 2) + Math.pow((x - y) * D, 2));
    else if (m.orientation.type === "angular") {
      let N = function(R) {
        if (R = (R % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), Math.abs(R - Math.PI / 2) < 1e-6) {
          b = 0, y = 0, F = 1, x = 0, k = v;
          return;
        } else if (Math.abs(R) < 1e-6) {
          b = 0, y = 1, F = 0, x = 0, k = D;
          return;
        }
        if (R >= Math.PI / 2 && R < Math.PI) {
          N(Math.PI - R), y = 1 - y, x = 1 - x;
          return;
        } else if (R >= Math.PI) {
          N(R - Math.PI);
          let L = b;
          b = F, F = L, L = y, y = x, x = L;
          return;
        }
        let j = Math.tan(R), K = j * ie, ce = Math.atan(K), ee = Math.sqrt(2) * Math.cos(Math.PI / 4 - ce);
        b = 0, y = 1, F = Math.sin(ce) * ee, x = 1 - Math.cos(ce) * ee;
        let te = 1, Ae = 1 / j, A = Math.abs((te * ie + Ae) / Math.sqrt(te * te + Ae * Ae) / Math.sqrt(ie * ie + 1));
        k = Math.sqrt(v * v + D * D) * A;
      }, ie = v / D;
      N(+m.orientation.value / 180 * Math.PI);
    }
    let B = _u(k, m.colorStops, f), I = `satori_bi${e}`, G = `satori_pattern_${e}`, ue = S("pattern", { id: G, x: p[0] / t, y: p[1] / n, width: c ? v / t : "1", height: d ? D / n : "1", patternUnits: "objectBoundingBox" }, S("linearGradient", { id: I, x1: b, y1: y, x2: F, y2: x }, B.map((ae) => S("stop", { offset: ae.offset * 100 + "%", "stop-color": ae.color })).join("")) + S("rect", { x: 0, y: 0, width: v, height: D, fill: `url(#${I})` }));
    return [G, ue];
  }
  if (o.startsWith("radial-gradient(")) {
    let m = Wn.parse(o)[0], v = m.orientation[0], [D, b] = h, y = "circle", F = D / 2, x = b / 2;
    if (v.type === "shape") {
      if (y = v.value, v.at)
        if (v.at.type === "position") {
          let N = Rf(v.at.value.x, v.at.value.y, D, b, l.fontSize, l);
          F = N.x, x = N.y;
        } else
          throw new Error("orientation.at.type not implemented: " + v.at.type);
    } else
      throw new Error("orientation.type not implemented: " + v.type);
    let k = _u(t, m.colorStops, f), B = `satori_radial_${e}`, I = `satori_pattern_${e}`, G = `satori_mask_${e}`, ue = Lf(y, v.style, l.fontSize, { x: F, y: x }, [D, b], l), ae = S("pattern", { id: I, x: p[0] / t, y: p[1] / n, width: c ? D / t : "1", height: d ? b / n : "1", patternUnits: "objectBoundingBox" }, S("radialGradient", { id: B }, k.map((N) => S("stop", { offset: N.offset, "stop-color": N.color })).join("")) + S("mask", { id: G }, S("rect", { x: 0, y: 0, width: D, height: b, fill: "#fff" })) + S("rect", { x: 0, y: 0, width: D, height: b, fill: k.at(-1).color }) + S(y, { cx: F, cy: x, width: D, height: b, ...ue, fill: `url(#${B})`, mask: `url(#${G})` }));
    return [I, ae];
  }
  if (o.startsWith("url(")) {
    let m = $n(u, { x: t, y: n, defaultX: 0, defaultY: 0 }), [v, D, b] = await yt(o.slice(4, -1)), y = f === "mask" ? D || m[0] : m[0] || D, F = f === "mask" ? b || m[1] : m[1] || b;
    return [`satori_bi${e}`, S("pattern", { id: `satori_bi${e}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: p[0] + r, y: p[1] + i, width: c ? y : "100%", height: d ? F : "100%" }, S("image", { x: 0, y: 0, width: y, height: F, preserveAspectRatio: "none", href: v }))];
  }
  throw new Error(`Invalid background image: "${o}"`);
}
function Rf(e, t, n, r, i, o) {
  let u = { x: n / 2, y: r / 2 };
  return e.type === "position-keyword" ? Object.assign(u, ku(e.value, n, r, "x")) : u.x = W(`${e.value}${e.type}`, i, n, o, true), t.type === "position-keyword" ? Object.assign(u, ku(t.value, n, r, "y")) : u.y = W(`${t.value}${t.type}`, i, r, o, true), u;
}
function ku(e, t, n, r) {
  switch (e) {
    case "center":
      return { [r]: r === "x" ? t / 2 : n / 2 };
    case "left":
      return { x: 0 };
    case "top":
      return { y: 0 };
    case "right":
      return { x: t };
    case "bottom":
      return { y: n };
  }
}
function Lf(e, t, n, r, i, o) {
  let [u, s] = i, { x: a, y: l } = r, f = {}, c = 0, d = 0;
  if (!t.some((p) => p.type === "extent-keyword")) {
    if (t.some((p) => p.value.startsWith("-")))
      throw new Error("disallow setting negative values to the size of the shape. Check https://w3c.github.io/csswg-drafts/css-images/#valdef-rg-size-length-0");
    return e === "circle" ? { r: W(`${t[0].value}${t[0].type}`, n, u, o, true) } : { rx: W(`${t[0].value}${t[0].type}`, n, u, o, true), ry: W(`${t[1].value}${t[1].type}`, n, s, o, true) };
  }
  switch (t[0].value) {
    case "farthest-corner":
      c = Math.max(Math.abs(u - a), Math.abs(a)), d = Math.max(Math.abs(s - l), Math.abs(l));
      break;
    case "closest-corner":
      c = Math.min(Math.abs(u - a), Math.abs(a)), d = Math.min(Math.abs(s - l), Math.abs(l));
      break;
    case "farthest-side":
      return e === "circle" ? f.r = Math.max(Math.abs(u - a), Math.abs(a), Math.abs(s - l), Math.abs(l)) : (f.rx = Math.max(Math.abs(u - a), Math.abs(a)), f.ry = Math.max(Math.abs(s - l), Math.abs(l))), f;
    case "closest-side":
      return e === "circle" ? f.r = Math.min(Math.abs(u - a), Math.abs(a), Math.abs(s - l), Math.abs(l)) : (f.rx = Math.min(Math.abs(u - a), Math.abs(a)), f.ry = Math.min(Math.abs(s - l), Math.abs(l))), f;
  }
  if (e === "circle")
    f.r = Math.sqrt(c * c + d * d);
  else {
    let p = d !== 0 ? c / d : 1;
    c === 0 ? (f.rx = 0, f.ry = 0) : (f.ry = Math.sqrt(c * c + d * d * p * p) / p, f.rx = f.ry * p);
  }
  return f;
}
function Mf([e, t]) {
  return Math.round(e * 1e3) === 0 && Math.round(t * 1e3) === 0 ? 0 : Math.round(e * t / Math.sqrt(e * e + t * t) * 1e3) / 1e3;
}
function Ur(e, t, n) {
  return n < e + t && (n / 2 < e && n / 2 < t ? e = t = n / 2 : n / 2 < e ? e = n - t : n / 2 < t && (t = n - e)), [e, t];
}
function Gr(e) {
  e[0] = e[1] = Math.min(e[0], e[1]);
}
function jr(e, t, n, r, i) {
  if (typeof e == "string") {
    let o = e.split(" ").map((s) => s.trim()), u = !o[1] && !o[0].endsWith("%");
    return o[1] = o[1] || o[0], [u, [Math.min(W(o[0], r, t, i, true), t), Math.min(W(o[1], r, n, i, true), n)]];
  }
  return typeof e == "number" ? [true, [Math.min(e, t), Math.min(e, n)]] : [true, void 0];
}
var Hr = (e) => e && e[0] !== 0 && e[1] !== 0;
function Je({ left: e, top: t, width: n, height: r }, i, o) {
  let { borderTopLeftRadius: u, borderTopRightRadius: s, borderBottomLeftRadius: a, borderBottomRightRadius: l, fontSize: f } = i, c, d, h, p;
  if ([c, u] = jr(u, n, r, f, i), [d, s] = jr(s, n, r, f, i), [h, a] = jr(a, n, r, f, i), [p, l] = jr(l, n, r, f, i), !o && !Hr(u) && !Hr(s) && !Hr(a) && !Hr(l))
    return "";
  u || (u = [0, 0]), s || (s = [0, 0]), a || (a = [0, 0]), l || (l = [0, 0]), [u[0], s[0]] = Ur(u[0], s[0], n), [a[0], l[0]] = Ur(a[0], l[0], n), [u[1], a[1]] = Ur(u[1], a[1], r), [s[1], l[1]] = Ur(s[1], l[1], r), c && Gr(u), d && Gr(s), h && Gr(a), p && Gr(l);
  let m = [];
  m[0] = [s, s], m[1] = [l, [-l[0], l[1]]], m[2] = [a, [-a[0], -a[1]]], m[3] = [u, [u[0], -u[1]]];
  let v = `h${n - u[0] - s[0]} a${m[0][0]} 0 0 1 ${m[0][1]}`, D = `v${r - s[1] - l[1]} a${m[1][0]} 0 0 1 ${m[1][1]}`, b = `h${l[0] + a[0] - n} a${m[2][0]} 0 0 1 ${m[2][1]}`, y = `v${a[1] + u[1] - r} a${m[3][0]} 0 0 1 ${m[3][1]}`;
  if (o) {
    let x = function(ie) {
      let N = Mf([u, s, l, a][ie]);
      return ie === 0 ? [[e + u[0] - N, t + u[1] - N], [e + u[0], t]] : ie === 1 ? [[e + n - s[0] + N, t + s[1] - N], [e + n, t + s[1]]] : ie === 2 ? [[e + n - l[0] + N, t + r - l[1] + N], [e + n - l[0], t + r]] : [[e + a[0] - N, t + r - a[1] + N], [e, t + r - a[1]]];
    }, F = o.indexOf(false);
    if (!o.includes(true))
      throw new Error("Invalid `partialSides`.");
    if (F === -1)
      F = 0;
    else
      for (; !o[F]; )
        F = (F + 1) % 4;
    let k = "", B = x(F), I = `M${B[0]} A${m[(F + 3) % 4][0]} 0 0 1 ${B[1]}`, G = 0;
    for (; G < 4 && o[(F + G) % 4]; G++)
      k += I + " ", I = [v, D, b, y][(F + G) % 4];
    let ue = (F + G) % 4;
    k += I.split(" ")[0];
    let ae = x(ue);
    return k += ` A${m[(ue + 3) % 4][0]} 0 0 1 ${ae[0]}`, k;
  }
  return `M${e + u[0]},${t} ${v} ${D} ${b} ${y}`;
}
function Tu(e, t, n) {
  return n[e + "Width"] === n[t + "Width"] && n[e + "Style"] === n[t + "Style"] && n[e + "Color"] === n[t + "Color"];
}
function Au({ id: e, currentClipPathId: t, borderPath: n, borderType: r, left: i, top: o, width: u, height: s }, a) {
  if (!(a.borderTopWidth || a.borderRightWidth || a.borderBottomWidth || a.borderLeftWidth))
    return null;
  let f = `satori_bc-${e}`;
  return [S("clipPath", { id: f, "clip-path": t ? `url(#${t})` : void 0 }, S(r, { x: i, y: o, width: u, height: s, d: n || void 0 })), f];
}
function Nt({ left: e, top: t, width: n, height: r, props: i, asContentMask: o, maskBorderOnly: u }, s) {
  let a = ["borderTop", "borderRight", "borderBottom", "borderLeft"];
  if (!o && !a.some((h) => s[h + "Width"]))
    return "";
  let l = "", f = 0;
  for (; f > 0 && Tu(a[f], a[(f + 3) % 4], s); )
    f = (f + 3) % 4;
  let c = [false, false, false, false], d = [];
  for (let h = 0; h < 4; h++) {
    let p = (f + h) % 4, m = (f + h + 1) % 4, v = a[p], D = a[m];
    if (c[p] = true, d = [s[v + "Width"], s[v + "Style"], s[v + "Color"], v], !Tu(v, D, s)) {
      let b = (d[0] || 0) + (o && !u && s[v.replace("border", "padding")] || 0);
      b && (l += S("path", { width: n, height: r, ...i, fill: "none", stroke: o ? "#000" : d[2], "stroke-width": b * 2, "stroke-dasharray": !o && d[1] === "dashed" ? b * 2 + " " + b : void 0, d: Je({ left: e, top: t, width: n, height: r }, s, c) })), c = [false, false, false, false];
    }
  }
  if (c.some(Boolean)) {
    let h = (d[0] || 0) + (o && !u && s[d[3].replace("border", "padding")] || 0);
    h && (l += S("path", { width: n, height: r, ...i, fill: "none", stroke: o ? "#000" : d[2], "stroke-width": h * 2, "stroke-dasharray": !o && d[1] === "dashed" ? h * 2 + " " + h : void 0, d: Je({ left: e, top: t, width: n, height: r }, s, c) }));
  }
  return l;
}
function qn({ id: e, left: t, top: n, width: r, height: i, matrix: o, borderOnly: u }, s) {
  let a = (s.borderLeftWidth || 0) + (u ? 0 : s.paddingLeft || 0), l = (s.borderTopWidth || 0) + (u ? 0 : s.paddingTop || 0), f = (s.borderRightWidth || 0) + (u ? 0 : s.paddingRight || 0), c = (s.borderBottomWidth || 0) + (u ? 0 : s.paddingBottom || 0), d = { x: t + a, y: n + l, width: r - a - f, height: i - l - c };
  return S("mask", { id: e }, S("rect", { ...d, fill: "#fff", mask: s._inheritedMaskId ? `url(#${s._inheritedMaskId})` : void 0 }) + Nt({ left: t, top: n, width: r, height: i, props: { transform: o || void 0 }, asContentMask: true, maskBorderOnly: u }, s));
}
var Wt = { circle: /circle\((.+)\)/, ellipse: /ellipse\((.+)\)/, path: /path\((.+)\)/, polygon: /polygon\((.+)\)/, inset: /inset\((.+)\)/ };
function Iu({ width: e, height: t }, n, r) {
  function i(l) {
    let f = l.match(Wt.circle);
    if (!f)
      return null;
    let [, c] = f, [d, h = ""] = c.split("at").map((v) => v.trim()), { x: p, y: m } = Bu(h, e, t);
    return { type: "circle", r: W(d, r.fontSize, Math.sqrt(Math.pow(e, 2) + Math.pow(t, 2)) / Math.sqrt(2), r, true), cx: W(p, r.fontSize, e, r, true), cy: W(m, r.fontSize, t, r, true) };
  }
  function o(l) {
    let f = l.match(Wt.ellipse);
    if (!f)
      return null;
    let [, c] = f, [d, h = ""] = c.split("at").map((b) => b.trim()), [p, m] = d.split(" "), { x: v, y: D } = Bu(h, e, t);
    return { type: "ellipse", rx: W(p || "50%", r.fontSize, e, r, true), ry: W(m || "50%", r.fontSize, t, r, true), cx: W(v, r.fontSize, e, r, true), cy: W(D, r.fontSize, t, r, true) };
  }
  function u(l) {
    let f = l.match(Wt.path);
    if (!f)
      return null;
    let [c, d] = Pu(f[1]);
    return { type: "path", d, "fill-rule": c };
  }
  function s(l) {
    let f = l.match(Wt.polygon);
    if (!f)
      return null;
    let [c, d] = Pu(f[1]);
    return { type: "polygon", "fill-rule": c, points: d.split(",").map((h) => h.split(" ").map((p, m) => W(p, r.fontSize, m === 0 ? e : t, r, true)).join(" ")).join(",") };
  }
  function a(l) {
    let f = l.match(Wt.inset);
    if (!f)
      return null;
    let [c, d] = (f[1].includes("round") ? f[1] : `${f[1].trim()} round 0`).split("round"), h = (0, import_css_to_react_native3.getStylesForProperty)("borderRadius", d, true), p = Object.values(h).map((F) => String(F)).map((F, x) => W(F, r.fontSize, x === 0 || x === 2 ? t : e, r, true) || 0), m = Object.values((0, import_css_to_react_native3.getStylesForProperty)("margin", c, true)).map((F) => String(F)).map((F, x) => W(F, r.fontSize, x === 0 || x === 2 ? t : e, r, true) || 0), v = m[3], D = m[0], b = e - (m[1] + m[3]), y = t - (m[0] + m[2]);
    return p.some((F) => F > 0) ? { type: "path", d: Je({ left: v, top: D, width: b, height: y }, { ...n, ...h }) } : { type: "rect", x: v, y: D, width: b, height: y };
  }
  return { parseCircle: i, parseEllipse: o, parsePath: u, parsePolygon: s, parseInset: a };
}
function Pu(e) {
  let [, t = "nonzero", n] = e.replace(/('|")/g, "").match(/^(nonzero|evenodd)?,?(.+)/) || [];
  return [t, n];
}
function Bu(e, t, n) {
  let r = e.split(" "), i = { x: r[0] || "50%", y: r[1] || "50%" };
  return r.forEach((o) => {
    o === "top" ? i.y = 0 : o === "bottom" ? i.y = n : o === "left" ? i.x = 0 : o === "right" ? i.x = t : o === "center" && (i.x = t / 2, i.y = n / 2);
  }), i;
}
function Vr(e) {
  return `satori_cp-${e}`;
}
function Ru(e) {
  return `url(#${Vr(e)})`;
}
function Lu(e, t, n) {
  if (t.clipPath === "none")
    return "";
  let r = Iu(e, t, n), i = t.clipPath, o = { type: "" };
  for (let u of Object.keys(r))
    if (o = r[u](i), o)
      break;
  if (o) {
    let { type: u, ...s } = o;
    return S("clipPath", { id: Vr(e.id), "clip-path": e.currentClipPath, transform: `translate(${e.left}, ${e.top})` }, S(u, s));
  }
  return "";
}
function zn({ left: e, top: t, width: n, height: r, path: i, matrix: o, id: u, currentClipPath: s, src: a }, l, f) {
  let c = "", d = l.clipPath && l.clipPath !== "none" ? Lu({ left: e, top: t, width: n, height: r, path: i, id: u, matrix: o, currentClipPath: s, src: a }, l, f) : "";
  if (l.overflow !== "hidden" && !a)
    c = "";
  else {
    let p = d ? `satori_ocp-${u}` : Vr(u);
    c = S("clipPath", { id: p, "clip-path": s }, S(i ? "path" : "rect", { x: e, y: t, width: n, height: r, d: i || void 0 }));
  }
  let h = qn({ id: `satori_om-${u}`, left: e, top: t, width: n, height: r, matrix: o, borderOnly: !a }, l);
  return d + c + h;
}
var Nf = (e) => `satori_mi-${e}`;
async function Un(e, t, n) {
  if (!t.maskImage)
    return ["", ""];
  let { left: r, top: i, width: o, height: u, id: s } = e, a = t.maskImage, l = a.length;
  if (!l)
    return ["", ""];
  let f = Nf(s), c = "";
  for (let d = 0; d < l; d++) {
    let h = a[d], [p, m] = await Mt({ id: `${f}-${d}`, left: r, top: i, width: o, height: u }, h, n, "mask");
    c += m + S("rect", { x: 0, y: 0, width: o, height: u, fill: `url(#${p})` });
  }
  return c = S("mask", { id: f }, c), [f, c];
}
async function $t({ id: e, left: t, top: n, width: r, height: i, isInheritingTransform: o, src: u, debug: s }, a, l) {
  if (a.display === "none")
    return "";
  let f = !!u, c = "rect", d = "", h = "", p = [], m = 1, v = "";
  a.backgroundColor && p.push(a.backgroundColor), a.opacity !== void 0 && (m = +a.opacity), a.transform && (d = Lt({ left: t, top: n, width: r, height: i }, a.transform, o, a.transformOrigin));
  let D = "";
  if (a.backgroundImage) {
    let R = [];
    for (let j = 0; j < a.backgroundImage.length; j++) {
      let K = a.backgroundImage[j], ce = await Mt({ id: e + "_" + j, width: r, height: i, left: t, top: n }, K, l);
      ce && R.unshift(ce);
    }
    for (let j of R)
      p.push(`url(#${j[0]})`), h += j[1], j[2] && (D += j[2]);
  }
  let [b, y] = await Un({ id: e, left: t, top: n, width: r, height: i }, a, l);
  h += y;
  let F = b ? `url(#${b})` : a._inheritedMaskId ? `url(#${a._inheritedMaskId})` : void 0, x = Je({ left: t, top: n, width: r, height: i }, a);
  x && (c = "path");
  let k = a._inheritedClipPathId;
  s && (v = S("rect", { x: t, y: n, width: r, height: i, fill: "transparent", stroke: "#ff5757", "stroke-width": 1, transform: d || void 0, "clip-path": k ? `url(#${k})` : void 0 }));
  let { backgroundClip: B, filter: I } = a, G = B === "text" ? `url(#satori_bct-${e})` : k ? `url(#${k})` : a.clipPath ? Ru(e) : void 0, ue = zn({ left: t, top: n, width: r, height: i, path: x, id: e, matrix: d, currentClipPath: G, src: u }, a, l), ae = p.map((R) => S(c, { x: t, y: n, width: r, height: i, fill: R, d: x || void 0, transform: d || void 0, "clip-path": G, style: I ? `filter:${I}` : void 0, mask: F })).join(""), ie = Au({ id: e, left: t, top: n, width: r, height: i, currentClipPathId: k, borderPath: x, borderType: c }, a);
  if (f) {
    let R = (a.borderLeftWidth || 0) + (a.paddingLeft || 0), j = (a.borderTopWidth || 0) + (a.paddingTop || 0), K = (a.borderRightWidth || 0) + (a.paddingRight || 0), ce = (a.borderBottomWidth || 0) + (a.paddingBottom || 0), ee = a.objectFit === "contain" ? "xMidYMid" : a.objectFit === "cover" ? "xMidYMid slice" : "none";
    ae += S("image", { x: t + R, y: n + j, width: r - R - K, height: i - j - ce, href: u, preserveAspectRatio: ee, transform: d || void 0, style: I ? `filter:${I}` : void 0, "clip-path": `url(#satori_cp-${e})`, mask: b ? `url(#${b})` : `url(#satori_om-${e})` });
  }
  if (ie) {
    h += ie[0];
    let R = ie[1];
    ae += Nt({ left: t, top: n, width: r, height: i, props: { transform: d || void 0, "clip-path": `url(#${R})` } }, a);
  }
  let N = wu({ width: r, height: i, id: e, opacity: m, shape: S(c, { x: t, y: n, width: r, height: i, fill: "#fff", stroke: "#fff", "stroke-width": 0, d: x || void 0, transform: d || void 0, "clip-path": G, mask: F }) }, a);
  return (h ? S("defs", {}, h) : "") + (N ? N[0] : "") + ue + (m !== 1 ? `<g opacity="${m}">` : "") + (D || ae) + (m !== 1 ? "</g>" : "") + (N ? N[1] : "") + v;
}
var Mu = () => /[#*0-9]\uFE0F?\u20E3|[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26AA\u26B0\u26B1\u26BD\u26BE\u26C4\u26C8\u26CF\u26D1\u26D3\u26E9\u26F0-\u26F5\u26F7\u26F8\u26FA\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u27A1\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B55\u3030\u303D\u3297\u3299]\uFE0F?|[\u261D\u270C\u270D](?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?|[\u270A\u270B](?:\uD83C[\uDFFB-\uDFFF])?|[\u23E9-\u23EC\u23F0\u23F3\u25FD\u2693\u26A1\u26AB\u26C5\u26CE\u26D4\u26EA\u26FD\u2705\u2728\u274C\u274E\u2753-\u2755\u2795-\u2797\u27B0\u27BF\u2B50]|\u26F9(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|\u2764\uFE0F?(?:\u200D(?:\uD83D\uDD25|\uD83E\uDE79))?|\uD83C(?:[\uDC04\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF5\uDFF7]\uFE0F?|[\uDF85\uDFC2\uDFC7](?:\uD83C[\uDFFB-\uDFFF])?|[\uDFC3\uDFC4\uDFCA](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDFCB\uDFCC](?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDCCF\uDD8E\uDD91-\uDD9A\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF84\uDF86-\uDF93\uDFA0-\uDFC1\uDFC5\uDFC6\uDFC8\uDFC9\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF8-\uDFFF]|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|\uDFF3\uFE0F?(?:\u200D(?:\u26A7\uFE0F?|\uD83C\uDF08))?|\uDFF4(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDC73\uDB40\uDC63\uDB40\uDC74|\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F)?)|\uD83D(?:[\uDC08\uDC26](?:\u200D\u2B1B)?|[\uDC3F\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3]\uFE0F?|[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC6E\uDC70\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD74\uDD90](?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?|[\uDC00-\uDC07\uDC09-\uDC14\uDC16-\uDC25\uDC27-\uDC3A\uDC3C-\uDC3E\uDC40\uDC44\uDC45\uDC51-\uDC65\uDC6A\uDC79-\uDC7B\uDC7D-\uDC80\uDC84\uDC88-\uDC8E\uDC90\uDC92-\uDCA9\uDCAB-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDDA4\uDDFB-\uDE2D\uDE2F-\uDE34\uDE37-\uDE44\uDE48-\uDE4A\uDE80-\uDEA2\uDEA4-\uDEB3\uDEB7-\uDEBF\uDEC1-\uDEC5\uDED0-\uDED2\uDED5-\uDED7\uDEDC-\uDEDF\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB\uDFF0]|\uDC15(?:\u200D\uD83E\uDDBA)?|\uDC3B(?:\u200D\u2744\uFE0F?)?|\uDC41\uFE0F?(?:\u200D\uD83D\uDDE8\uFE0F?)?|\uDC68(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDC68\uDC69]\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE])))?))?|\uDC69(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?[\uDC68\uDC69]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?))|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFE])))?))?|\uDC6F(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDD75(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDE2E(?:\u200D\uD83D\uDCA8)?|\uDE35(?:\u200D\uD83D\uDCAB)?|\uDE36(?:\u200D\uD83C\uDF2B\uFE0F?)?)|\uD83E(?:[\uDD0C\uDD0F\uDD18-\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5\uDEC3-\uDEC5\uDEF0\uDEF2-\uDEF8](?:\uD83C[\uDFFB-\uDFFF])?|[\uDD26\uDD35\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD4\uDDD6-\uDDDD](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDDDE\uDDDF](?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD0D\uDD0E\uDD10-\uDD17\uDD20-\uDD25\uDD27-\uDD2F\uDD3A\uDD3F-\uDD45\uDD47-\uDD76\uDD78-\uDDB4\uDDB7\uDDBA\uDDBC-\uDDCC\uDDD0\uDDE0-\uDDFF\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC2\uDECE-\uDEDB\uDEE0-\uDEE8]|\uDD3C(?:\u200D[\u2640\u2642]\uFE0F?|\uD83C[\uDFFB-\uDFFF])?|\uDDD1(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?))?|\uDEF1(?:\uD83C(?:\uDFFB(?:\u200D\uD83E\uDEF2\uD83C[\uDFFC-\uDFFF])?|\uDFFC(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFD-\uDFFF])?|\uDFFD(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])?|\uDFFE(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFD\uDFFF])?|\uDFFF(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFE])?))?)/g;
var Wf = new RegExp(Mu(), "");
var Gn = { emoji: Wf, symbol: /\p{Symbol}/u, math: /\p{Math}/u };
var jn = { "ja-JP": /\p{scx=Hira}|\p{scx=Kana}|\p{scx=Han}|[\u3000]|[\uFF00-\uFFEF]/u, "ko-KR": /\p{scx=Hangul}/u, "zh-CN": /\p{scx=Han}/u, "zh-TW": /\p{scx=Han}/u, "zh-HK": /\p{scx=Han}/u, "th-TH": /\p{scx=Thai}/u, "bn-IN": /\p{scx=Bengali}/u, "ar-AR": /\p{scx=Arabic}/u, "ta-IN": /\p{scx=Tamil}/u, "ml-IN": /\p{scx=Malayalam}/u, "he-IL": /\p{scx=Hebrew}/u, "te-IN": /\p{scx=Telugu}/u, devanagari: /\p{scx=Devanagari}/u, kannada: /\p{scx=Kannada}/u };
var Yr = Object.keys({ ...jn, ...Gn });
function Nu(e) {
  return Yr.includes(e);
}
function Wu(e, t) {
  for (let r of Object.keys(Gn))
    if (Gn[r].test(e))
      return [r];
  let n = Object.keys(jn).filter((r) => jn[r].test(e));
  if (n.length === 0)
    return ["unknown"];
  if (t) {
    let r = n.findIndex((i) => i === t);
    r !== -1 && (n.splice(r, 1), n.unshift(t));
  }
  return n;
}
function $u(e) {
  if (e)
    return Yr.find((t) => t.toLowerCase().startsWith(e.toLowerCase()));
}
async function* qt(e, t) {
  var L;
  let n = await qe(), { id: r, inheritedStyle: i, parent: o, font: u, debug: s, locale: a, embedFont: l = true, graphemeImages: f, canLoadAdditionalAssets: c, getTwStyles: d } = t;
  if (e === null || typeof e > "u")
    return yield, yield, "";
  if (!bt(e) || typeof e.type == "function") {
    let P;
    if (!bt(e))
      P = Mn(String(e), t), yield (await P.next()).value;
    else {
      if (Ko(e.type))
        throw new Error("Class component is not supported.");
      P = qt(e.type(e.props), t), yield (await P.next()).value;
    }
    await P.next();
    let he = yield;
    return (await P.next(he)).value;
  }
  let { type: h, props: p } = e;
  if (p && Jo(p))
    throw new Error("dangerouslySetInnerHTML property is not supported. See documentation for more information https://github.com/vercel/satori#jsx.");
  let { style: m, children: v, tw: D, lang: b = a } = p || {}, y = $u(b);
  if (D) {
    let P = d(D, m);
    m = Object.assign(P, m);
  }
  let F = n.Node.create();
  o.insertChild(F, o.getChildCount());
  let [x, k] = await Pn(F, h, i, m, p), B = x.transform === i.transform;
  if (B || (x.transform.__parent = i.transform), (x.overflow === "hidden" || x.clipPath && x.clipPath !== "none") && (k._inheritedClipPathId = `satori_cp-${r}`, k._inheritedMaskId = `satori_om-${r}`), x.maskImage && (k._inheritedMaskId = `satori_mi-${r}`), x.backgroundClip === "text") {
    let P = { value: "" };
    k._inheritedBackgroundClipTextPath = P, x._inheritedBackgroundClipTextPath = P;
  }
  let I = Zo(v), G = [], ue = 0, ae = [];
  for (let P of I) {
    let he = qt(P, { id: r + "-" + ue++, parentStyle: x, inheritedStyle: k, isInheritingTransform: true, parent: F, font: u, embedFont: l, debug: s, graphemeImages: f, canLoadAdditionalAssets: c, locale: y, getTwStyles: d, onNodeDetected: t.onNodeDetected });
    c ? ae.push(...(await he.next()).value || []) : await he.next(), G.push(he);
  }
  yield ae;
  for (let P of G)
    await P.next();
  let [ie, N] = yield, { left: R, top: j, width: K, height: ce } = F.getComputedLayout();
  R += ie, j += N;
  let ee = "", te = "", Ae = "", { children: A, ...O } = p;
  if ((L = t.onNodeDetected) == null || L.call(t, { left: R, top: j, width: K, height: ce, type: h, props: O, key: e.key, textContent: bt(A) ? void 0 : A }), h === "img") {
    let P = x.__src;
    te = await $t({ id: r, left: R, top: j, width: K, height: ce, src: P, isInheritingTransform: B, debug: s }, x, k);
  } else if (h === "svg") {
    let P = x.color, he = await du(e, P);
    te = await $t({ id: r, left: R, top: j, width: K, height: ce, src: he, isInheritingTransform: B, debug: s }, x, k);
  } else {
    let P = m == null ? void 0 : m.display;
    if (h === "div" && v && typeof v != "string" && P !== "flex" && P !== "none")
      throw new Error('Expected <div> to have explicit "display: flex" or "display: none" if it has more than one child node.');
    te = await $t({ id: r, left: R, top: j, width: K, height: ce, isInheritingTransform: B, debug: s }, x, k);
  }
  for (let P of G)
    ee += (await P.next([R, j])).value;
  return x._inheritedBackgroundClipTextPath && (Ae += S("clipPath", { id: `satori_bct-${r}`, "clip-path": x._inheritedClipPathId ? `url(#${x._inheritedClipPathId})` : void 0 }, x._inheritedBackgroundClipTextPath.value)), Ae + te + ee;
}
var qu = "unknown";
function $f(e, t, [n, r], [i, o]) {
  if (n !== i)
    return n ? !i || n === e ? -1 : i === e ? 1 : e === 400 && n === 500 || e === 500 && n === 400 ? -1 : e === 400 && i === 500 || e === 500 && i === 400 ? 1 : e < 400 ? n < e && i < e ? i - n : n < e ? -1 : i < e ? 1 : n - i : e < n && e < i ? n - i : e < n ? -1 : e < i ? 1 : i - n : 1;
  if (r !== o) {
    if (r === t)
      return -1;
    if (o === t)
      return 1;
  }
  return -1;
}
var zt = class {
  defaultFont;
  fonts = /* @__PURE__ */ new Map();
  constructor(t) {
    this.addFonts(t);
  }
  get({ name: t, weight: n, style: r }) {
    if (!this.fonts.has(t))
      return null;
    n === "normal" && (n = 400), n === "bold" && (n = 700), typeof n == "string" && (n = Number.parseInt(n, 10));
    let i = [...this.fonts.get(t)], o = i[0];
    for (let u = 1; u < i.length; u++) {
      let [, s, a] = o, [, l, f] = i[u];
      $f(n, r, [s, a], [l, f]) > 0 && (o = i[u]);
    }
    return o[0];
  }
  addFonts(t) {
    for (let n of t) {
      let { name: r, data: i, lang: o } = n;
      if (o && !Nu(o))
        throw new Error(`Invalid value for props \`lang\`: "${o}". The value must be one of the following: ${Yr.join(", ")}.`);
      let u = o ?? qu, s = opentype_module_default.parse("buffer" in i ? i.buffer.slice(i.byteOffset, i.byteOffset + i.byteLength) : i, { lowMemory: true }), a = s.charToGlyphIndex;
      s.charToGlyphIndex = (f) => {
        let c = a.call(s, f);
        return c === 0 && s._trackBrokenChars && s._trackBrokenChars.push(f), c;
      }, this.defaultFont || (this.defaultFont = s);
      let l = `${r.toLowerCase()}_${u}`;
      this.fonts.has(l) || this.fonts.set(l, []), this.fonts.get(l).push([s, n.weight, n.style]);
    }
  }
  getEngine(t = 16, n = 1.2, { fontFamily: r = "sans-serif", fontWeight: i = 400, fontStyle: o = "normal" }, u) {
    if (!this.fonts.size)
      throw new Error("No fonts are loaded. At least one font is required to calculate the layout.");
    r = (Array.isArray(r) ? r : [r]).map((b) => b.toLowerCase());
    let s = [];
    r.forEach((b) => {
      let y = this.get({ name: b, weight: i, style: o });
      if (y) {
        s.push(y);
        return;
      }
      let F = this.get({ name: b + "_unknown", weight: i, style: o });
      if (F) {
        s.push(F);
        return;
      }
    });
    let a = Array.from(this.fonts.keys()), l = [], f = [], c = [];
    for (let b of a)
      if (!r.includes(b))
        if (u) {
          let y = qf(b);
          y ? y === u ? l.push(this.get({ name: b, weight: i, style: o })) : f.push(this.get({ name: b, weight: i, style: o })) : c.push(this.get({ name: b, weight: i, style: o }));
        } else
          c.push(this.get({ name: b, weight: i, style: o }));
    let d = /* @__PURE__ */ new Map(), h = (b, y = true) => {
      let F = [...s, ...c, ...l, ...y ? f : []];
      if (typeof b > "u")
        return y ? F[F.length - 1] : void 0;
      let x = b.charCodeAt(0);
      if (d.has(x))
        return d.get(x);
      let k = F.find((B, I) => !!B.charToGlyphIndex(b) || y && I === F.length - 1);
      return k && d.set(x, k), k;
    }, p = (b, y = false) => {
      var x, k;
      return ((y ? (k = (x = b.tables) == null ? void 0 : x.os2) == null ? void 0 : k.sTypoAscender : 0) || b.ascender) / b.unitsPerEm * t;
    }, m = (b, y = false) => {
      var x, k;
      return ((y ? (k = (x = b.tables) == null ? void 0 : x.os2) == null ? void 0 : k.sTypoDescender : 0) || b.descender) / b.unitsPerEm * t;
    }, v = (b) => h(b, false), D = { has: (b) => {
      if (b === `
`)
        return true;
      let y = v(b);
      return y ? (y._trackBrokenChars = [], y.stringToGlyphs(b), y._trackBrokenChars.length ? (y._trackBrokenChars = void 0, false) : true) : false;
    }, baseline: (b, y = typeof b > "u" ? s[0] : h(b)) => {
      let F = p(y, true), x = m(y, true), k = D.height(b, y), { yMax: B, yMin: I } = y.tables.head, G = F - x, ue = (B / (B - I) - 1) * G;
      return k * ((1.2 / n + 1) / 2) + ue;
    }, height: (b, y = typeof b > "u" ? s[0] : h(b)) => (p(y) - m(y)) * (n / 1.2), measure: (b, y) => this.measure(h, b, y), getSVG: (b, y) => this.getSVG(h, b, y) };
    return D;
  }
  patchFontFallbackResolver(t, n) {
    let r = [];
    t._trackBrokenChars = r;
    let i = t.stringToGlyphs;
    return t.stringToGlyphs = (o, ...u) => {
      let s = i.call(t, o, ...u);
      for (let a = 0; a < s.length; a++)
        if (s[a].unicode === void 0) {
          let l = r.shift(), f = n(l);
          if (f !== t) {
            let c = f.charToGlyph(l), d = t.unitsPerEm / f.unitsPerEm, h = new opentype_module_default.Path();
            h.unitsPerEm = t.unitsPerEm, h.commands = c.path.commands.map((m) => {
              let v = { ...m };
              for (let D in v)
                typeof v[D] == "number" && (v[D] *= d);
              return v;
            });
            let p = new opentype_module_default.Glyph({ ...c, advanceWidth: c.advanceWidth * d, xMin: c.xMin * d, xMax: c.xMax * d, yMin: c.yMin * d, yMax: c.yMax * d, path: h });
            s[a] = p;
          }
        }
      return s;
    }, () => {
      t.stringToGlyphs = i, t._trackBrokenChars = void 0;
    };
  }
  measure(t, n, { fontSize: r, letterSpacing: i = 0 }) {
    let o = t(n), u = this.patchFontFallbackResolver(o, t);
    try {
      return o.getAdvanceWidth(n, r, { letterSpacing: i / r });
    } finally {
      u();
    }
  }
  getSVG(t, n, { fontSize: r, top: i, left: o, letterSpacing: u = 0 }) {
    let s = t(n), a = this.patchFontFallbackResolver(s, t);
    try {
      return r === 0 ? "" : s.getPath(n.replace(/\n/g, ""), o, i, r, { letterSpacing: u / r }).toPathData(1);
    } finally {
      a();
    }
  }
};
function qf(e) {
  let t = e.split("_"), n = t[t.length - 1];
  return n === qu ? void 0 : n;
}
function Vn({ width: e, height: t, content: n }) {
  return S("svg", { width: e, height: t, viewBox: `0 0 ${e} ${t}`, xmlns: "http://www.w3.org/2000/svg" }, n);
}
var yl = Bl(Ka());
var _m = ["ios", "android", "windows", "macos", "web"];
function Za(e) {
  return _m.includes(e);
}
var km = ["portrait", "landscape"];
function el(e) {
  return km.includes(e);
}
var Ja;
(function(e) {
  e.fontSize = "fontSize", e.lineHeight = "lineHeight";
})(Ja || (Ja = {}));
var z;
(function(e) {
  e.rem = "rem", e.em = "em", e.px = "px", e.percent = "%", e.vw = "vw", e.vh = "vh", e.none = "<no-css-unit>";
})(z || (z = {}));
function yo(e) {
  return typeof e == "string";
}
function xo(e) {
  return typeof e == "object";
}
var Fo;
function g(e) {
  return { kind: "complete", style: e };
}
function de(e, t = {}) {
  let { fractions: n } = t;
  if (n && e.includes("/")) {
    let [o = "", u = ""] = e.split("/", 2), s = de(o), a = de(u);
    return !s || !a ? null : [s[0] / a[0], a[1]];
  }
  let r = parseFloat(e);
  if (Number.isNaN(r))
    return null;
  let i = e.match(/(([a-z]{2,}|%))$/);
  if (!i)
    return [r, z.none];
  switch (i == null ? void 0 : i[1]) {
    case "rem":
      return [r, z.rem];
    case "px":
      return [r, z.px];
    case "em":
      return [r, z.em];
    case "%":
      return [r, z.percent];
    case "vw":
      return [r, z.vw];
    case "vh":
      return [r, z.vh];
    default:
      return null;
  }
}
function Ge(e, t, n = {}) {
  let r = Me(t, n);
  return r === null ? null : g({ [e]: r });
}
function pn(e, t, n) {
  let r = Me(t);
  return r !== null && (n[e] = r), n;
}
function rl(e, t) {
  let n = Me(t);
  return n === null ? null : { [e]: n };
}
function Me(e, t = {}) {
  if (e === void 0)
    return null;
  let n = de(String(e), t);
  return n ? rt(...n, t) : null;
}
function rt(e, t, n = {}) {
  let { isNegative: r, device: i } = n;
  switch (t) {
    case z.rem:
      return e * 16 * (r ? -1 : 1);
    case z.px:
      return e * (r ? -1 : 1);
    case z.percent:
      return `${r ? "-" : ""}${e}%`;
    case z.none:
      return e * (r ? -1 : 1);
    case z.vw:
      return i != null && i.windowDimensions ? i.windowDimensions.width * (e / 100) : (Fe("`vw` CSS unit requires configuration with `useDeviceContext()`"), null);
    case z.vh:
      return i != null && i.windowDimensions ? i.windowDimensions.height * (e / 100) : (Fe("`vh` CSS unit requires configuration with `useDeviceContext()`"), null);
    default:
      return null;
  }
}
function wo(e) {
  let t = de(e);
  if (!t)
    return null;
  let [n, r] = t;
  switch (r) {
    case z.rem:
      return n * 16;
    case z.px:
      return n;
    default:
      return null;
  }
}
var Tm = { t: "Top", tr: "TopRight", tl: "TopLeft", b: "Bottom", br: "BottomRight", bl: "BottomLeft", l: "Left", r: "Right", x: "Horizontal", y: "Vertical" };
function Eo(e) {
  return Tm[e ?? ""] || "All";
}
function So(e) {
  let t = "All";
  return [e.replace(/^-(t|b|r|l|tr|tl|br|bl)(-|$)/, (r, i) => (t = Eo(i), "")), t];
}
function ct(e, t = {}) {
  if (e.includes("/")) {
    let n = tl(e, { ...t, fractions: true });
    if (n)
      return n;
  }
  return e[0] === "[" && (e = e.slice(1, -1)), tl(e, t);
}
function Te(e, t, n = {}) {
  let r = ct(t, n);
  return r === null ? null : g({ [e]: r });
}
function tl(e, t = {}) {
  if (e === "px")
    return 1;
  let n = de(e, t);
  if (!n)
    return null;
  let [r, i] = n;
  return t.fractions && (i = z.percent, r *= 100), i === z.none && (r = r / 4, i = z.rem), rt(r, i, t);
}
function Am(...e) {
  console.warn(...e);
}
function Om(...e) {
}
var Fe = typeof process > "u" || ((Fo = process == null ? void 0 : process.env) === null || Fo === void 0 ? void 0 : Fo.JEST_WORKER_ID) === void 0 ? Am : Om;
var Pm = [["aspect-square", g({ aspectRatio: 1 })], ["aspect-video", g({ aspectRatio: 16 / 9 })], ["items-center", g({ alignItems: "center" })], ["items-start", g({ alignItems: "flex-start" })], ["items-end", g({ alignItems: "flex-end" })], ["items-baseline", g({ alignItems: "baseline" })], ["items-stretch", g({ alignItems: "stretch" })], ["justify-start", g({ justifyContent: "flex-start" })], ["justify-end", g({ justifyContent: "flex-end" })], ["justify-center", g({ justifyContent: "center" })], ["justify-between", g({ justifyContent: "space-between" })], ["justify-around", g({ justifyContent: "space-around" })], ["justify-evenly", g({ justifyContent: "space-evenly" })], ["content-start", g({ alignContent: "flex-start" })], ["content-end", g({ alignContent: "flex-end" })], ["content-between", g({ alignContent: "space-between" })], ["content-around", g({ alignContent: "space-around" })], ["content-stretch", g({ alignContent: "stretch" })], ["content-center", g({ alignContent: "center" })], ["self-auto", g({ alignSelf: "auto" })], ["self-start", g({ alignSelf: "flex-start" })], ["self-end", g({ alignSelf: "flex-end" })], ["self-center", g({ alignSelf: "center" })], ["self-stretch", g({ alignSelf: "stretch" })], ["self-baseline", g({ alignSelf: "baseline" })], ["direction-inherit", g({ direction: "inherit" })], ["direction-ltr", g({ direction: "ltr" })], ["direction-rtl", g({ direction: "rtl" })], ["hidden", g({ display: "none" })], ["flex", g({ display: "flex" })], ["flex-row", g({ flexDirection: "row" })], ["flex-row-reverse", g({ flexDirection: "row-reverse" })], ["flex-col", g({ flexDirection: "column" })], ["flex-col-reverse", g({ flexDirection: "column-reverse" })], ["flex-wrap", g({ flexWrap: "wrap" })], ["flex-wrap-reverse", g({ flexWrap: "wrap-reverse" })], ["flex-nowrap", g({ flexWrap: "nowrap" })], ["flex-auto", g({ flexGrow: 1, flexShrink: 1, flexBasis: "auto" })], ["flex-initial", g({ flexGrow: 0, flexShrink: 1, flexBasis: "auto" })], ["flex-none", g({ flexGrow: 0, flexShrink: 0, flexBasis: "auto" })], ["overflow-hidden", g({ overflow: "hidden" })], ["overflow-visible", g({ overflow: "visible" })], ["overflow-scroll", g({ overflow: "scroll" })], ["absolute", g({ position: "absolute" })], ["relative", g({ position: "relative" })], ["italic", g({ fontStyle: "italic" })], ["not-italic", g({ fontStyle: "normal" })], ["oldstyle-nums", vr("oldstyle-nums")], ["small-caps", vr("small-caps")], ["lining-nums", vr("lining-nums")], ["tabular-nums", vr("tabular-nums")], ["proportional-nums", vr("proportional-nums")], ["font-thin", g({ fontWeight: "100" })], ["font-100", g({ fontWeight: "100" })], ["font-extralight", g({ fontWeight: "200" })], ["font-200", g({ fontWeight: "200" })], ["font-light", g({ fontWeight: "300" })], ["font-300", g({ fontWeight: "300" })], ["font-normal", g({ fontWeight: "normal" })], ["font-400", g({ fontWeight: "400" })], ["font-medium", g({ fontWeight: "500" })], ["font-500", g({ fontWeight: "500" })], ["font-semibold", g({ fontWeight: "600" })], ["font-600", g({ fontWeight: "600" })], ["font-bold", g({ fontWeight: "bold" })], ["font-700", g({ fontWeight: "700" })], ["font-extrabold", g({ fontWeight: "800" })], ["font-800", g({ fontWeight: "800" })], ["font-black", g({ fontWeight: "900" })], ["font-900", g({ fontWeight: "900" })], ["include-font-padding", g({ includeFontPadding: true })], ["remove-font-padding", g({ includeFontPadding: false })], ["max-w-none", g({ maxWidth: "99999%" })], ["text-left", g({ textAlign: "left" })], ["text-center", g({ textAlign: "center" })], ["text-right", g({ textAlign: "right" })], ["text-justify", g({ textAlign: "justify" })], ["text-auto", g({ textAlign: "auto" })], ["underline", g({ textDecorationLine: "underline" })], ["line-through", g({ textDecorationLine: "line-through" })], ["no-underline", g({ textDecorationLine: "none" })], ["uppercase", g({ textTransform: "uppercase" })], ["lowercase", g({ textTransform: "lowercase" })], ["capitalize", g({ textTransform: "capitalize" })], ["normal-case", g({ textTransform: "none" })], ["w-auto", g({ width: "auto" })], ["h-auto", g({ height: "auto" })], ["shadow-sm", g({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.025, elevation: 1 })], ["shadow", g({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.075, elevation: 2 })], ["shadow-md", g({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 3, shadowOpacity: 0.125, elevation: 3 })], ["shadow-lg", g({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 })], ["shadow-xl", g({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.19, shadowRadius: 20, elevation: 12 })], ["shadow-2xl", g({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 30, elevation: 16 })], ["shadow-none", g({ shadowOffset: { width: 0, height: 0 }, shadowColor: "#000", shadowRadius: 0, shadowOpacity: 0, elevation: 0 })]];
var Co = Pm;
function vr(e) {
  return { kind: "dependent", complete(t) {
    (!t.fontVariant || !Array.isArray(t.fontVariant)) && (t.fontVariant = []), t.fontVariant.push(e);
  } };
}
var yr = class {
  constructor(t) {
    this.ir = new Map(Co), this.styles = /* @__PURE__ */ new Map(), this.prefixes = /* @__PURE__ */ new Map(), this.ir = new Map([...Co, ...t ?? []]);
  }
  getStyle(t) {
    return this.styles.get(t);
  }
  setStyle(t, n) {
    this.styles.set(t, n);
  }
  getIr(t) {
    return this.ir.get(t);
  }
  setIr(t, n) {
    this.ir.set(t, n);
  }
  getPrefixMatch(t) {
    return this.prefixes.get(t);
  }
  setPrefixMatch(t, n) {
    this.prefixes.set(t, n);
  }
};
function _o(e, t, n = {}) {
  let r = t == null ? void 0 : t[e];
  if (!r)
    return Te("fontSize", e, n);
  if (typeof r == "string")
    return Ge("fontSize", r);
  let i = {}, [o, u] = r, s = rl("fontSize", o);
  if (s && (i = s), typeof u == "string")
    return g(pn("lineHeight", nl(u, i), i));
  let { lineHeight: a, letterSpacing: l } = u;
  return a && pn("lineHeight", nl(a, i), i), l && pn("letterSpacing", l, i), g(i);
}
function nl(e, t) {
  let n = de(e);
  if (n) {
    let [r, i] = n;
    if ((i === z.none || i === z.em) && typeof t.fontSize == "number")
      return t.fontSize * r;
  }
  return e;
}
function ko(e, t) {
  var n;
  let r = (n = t == null ? void 0 : t[e]) !== null && n !== void 0 ? n : e.startsWith("[") ? e.slice(1, -1) : e, i = de(r);
  if (!i)
    return null;
  let [o, u] = i;
  if (u === z.none)
    return { kind: "dependent", complete(a) {
      if (typeof a.fontSize != "number")
        return "relative line-height utilities require that font-size be set";
      a.lineHeight = a.fontSize * o;
    } };
  let s = rt(o, u);
  return s !== null ? g({ lineHeight: s }) : null;
}
function To(e, t, n, r, i) {
  let o = "";
  if (r[0] === "[")
    o = r.slice(1, -1);
  else {
    let l = i == null ? void 0 : i[r];
    if (l)
      o = l;
    else {
      let f = ct(r);
      return f && typeof f == "number" ? il(f, z.px, t, e) : null;
    }
  }
  if (o === "auto")
    return ol(t, e, "auto");
  let u = de(o);
  if (!u)
    return null;
  let [s, a] = u;
  return n && (s = -s), il(s, a, t, e);
}
function il(e, t, n, r) {
  let i = rt(e, t);
  return i === null ? null : ol(n, r, i);
}
function ol(e, t, n) {
  switch (e) {
    case "All":
      return { kind: "complete", style: { [`${t}Top`]: n, [`${t}Right`]: n, [`${t}Bottom`]: n, [`${t}Left`]: n } };
    case "Bottom":
    case "Top":
    case "Left":
    case "Right":
      return { kind: "complete", style: { [`${t}${e}`]: n } };
    case "Vertical":
      return { kind: "complete", style: { [`${t}Top`]: n, [`${t}Bottom`]: n } };
    case "Horizontal":
      return { kind: "complete", style: { [`${t}Left`]: n, [`${t}Right`]: n } };
    default:
      return null;
  }
}
function Ao(e) {
  if (!e)
    return {};
  let t = Object.entries(e).reduce((i, [o, u]) => {
    let s = [0, 1 / 0, 0], a = typeof u == "string" ? { min: u } : u, l = a.min ? wo(a.min) : 0;
    l === null ? Fe(`invalid screen config value: ${o}->min: ${a.min}`) : s[0] = l;
    let f = a.max ? wo(a.max) : 1 / 0;
    return f === null ? Fe(`invalid screen config value: ${o}->max: ${a.max}`) : s[1] = f, i[o] = s, i;
  }, {}), n = Object.values(t);
  n.sort((i, o) => {
    let [u, s] = i, [a, l] = o;
    return s === 1 / 0 || l === 1 / 0 ? u - a : s - l;
  });
  let r = 0;
  return n.forEach((i) => i[2] = r++), t;
}
function Oo(e, t) {
  let n = t == null ? void 0 : t[e];
  if (!n)
    return null;
  if (typeof n == "string")
    return g({ fontFamily: n });
  let r = n[0];
  return r ? g({ fontFamily: r }) : null;
}
function dt(e, t, n) {
  if (!n)
    return null;
  let r;
  t.includes("/") && ([t = "", r] = t.split("/", 2));
  let i = "";
  if (t.startsWith("[#") || t.startsWith("[rgb") ? i = t.slice(1, -1) : i = al(t, n), !i)
    return null;
  if (r) {
    let o = Number(r);
    if (!Number.isNaN(o))
      return i = ul(i, o / 100), g({ [hn[e].color]: i });
  }
  return { kind: "dependent", complete(o) {
    let u = hn[e].opacity, s = o[u];
    typeof s == "number" && (i = ul(i, s)), o[hn[e].color] = i;
  } };
}
function xr(e, t) {
  let n = parseInt(t, 10);
  if (Number.isNaN(n))
    return null;
  let r = n / 100;
  return { kind: "complete", style: { [hn[e].opacity]: r } };
}
function ul(e, t) {
  return e.startsWith("#") ? e = Bm(e) : e.startsWith("rgb(") && (e = e.replace(/^rgb\(/, "rgba(").replace(/\)$/, ", 1)")), e.replace(/, ?\d*\.?(\d+)\)$/, `, ${t})`);
}
function sl(e) {
  for (let t in e)
    t.startsWith("__opacity_") && delete e[t];
}
var hn = { bg: { opacity: "__opacity_bg", color: "backgroundColor" }, text: { opacity: "__opacity_text", color: "color" }, border: { opacity: "__opacity_border", color: "borderColor" }, borderTop: { opacity: "__opacity_border", color: "borderTopColor" }, borderBottom: { opacity: "__opacity_border", color: "borderBottomColor" }, borderLeft: { opacity: "__opacity_border", color: "borderLeftColor" }, borderRight: { opacity: "__opacity_border", color: "borderRightColor" }, shadow: { opacity: "__opacity_shadow", color: "shadowColor" }, tint: { opacity: "__opacity_tint", color: "tintColor" } };
function Bm(e) {
  let t = e;
  e = e.replace(Im, (u, s, a, l) => s + s + a + a + l + l);
  let n = Rm.exec(e);
  if (!n)
    return Fe(`invalid config hex color value: ${t}`), "rgba(0, 0, 0, 1)";
  let r = parseInt(n[1], 16), i = parseInt(n[2], 16), o = parseInt(n[3], 16);
  return `rgba(${r}, ${i}, ${o}, 1)`;
}
function al(e, t) {
  let n = t[e];
  if (yo(n))
    return n;
  if (xo(n) && yo(n.DEFAULT))
    return n.DEFAULT;
  let [r = "", ...i] = e.split("-");
  for (; r !== e; ) {
    let o = t[r];
    if (xo(o))
      return al(i.join("-"), o);
    if (i.length === 0)
      return "";
    r = `${r}-${i.shift()}`;
  }
  return "";
}
var Im = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
var Rm = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
function fl2(e, t) {
  let [n, r] = So(e);
  if (n.match(/^(-?(\d)+)?$/))
    return Lm(n, r, t == null ? void 0 : t.borderWidth);
  if (n = n.replace(/^-/, ""), ["dashed", "solid", "dotted"].includes(n))
    return g({ borderStyle: n });
  let o = "border";
  switch (r) {
    case "Bottom":
      o = "borderBottom";
      break;
    case "Top":
      o = "borderTop";
      break;
    case "Left":
      o = "borderLeft";
      break;
    case "Right":
      o = "borderRight";
      break;
  }
  let u = dt(o, n, t == null ? void 0 : t.borderColor);
  if (u)
    return u;
  let s = `border${r === "All" ? "" : r}Width`;
  n = n.replace(/^-/, "");
  let a = n.slice(1, -1), l = Te(s, a);
  return typeof (l == null ? void 0 : l.style[s]) != "number" ? null : l;
}
function Lm(e, t, n) {
  if (!n)
    return null;
  e = e.replace(/^-/, "");
  let i = n[e === "" ? "DEFAULT" : e];
  if (i === void 0)
    return null;
  let o = `border${t === "All" ? "" : t}Width`;
  return Ge(o, i);
}
function cl(e, t) {
  if (!t)
    return null;
  let [n, r] = So(e);
  n = n.replace(/^-/, ""), n === "" && (n = "DEFAULT");
  let i = `border${r === "All" ? "" : r}Radius`, o = t[n];
  if (o)
    return ll(Ge(i, o));
  let u = Te(i, n);
  return typeof (u == null ? void 0 : u.style[i]) != "number" ? null : ll(u);
}
function ll(e) {
  if ((e == null ? void 0 : e.kind) !== "complete")
    return e;
  let t = e.style.borderTopRadius;
  t !== void 0 && (e.style.borderTopLeftRadius = t, e.style.borderTopRightRadius = t, delete e.style.borderTopRadius);
  let n = e.style.borderBottomRadius;
  n !== void 0 && (e.style.borderBottomLeftRadius = n, e.style.borderBottomRightRadius = n, delete e.style.borderBottomRadius);
  let r = e.style.borderLeftRadius;
  r !== void 0 && (e.style.borderBottomLeftRadius = r, e.style.borderTopLeftRadius = r, delete e.style.borderLeftRadius);
  let i = e.style.borderRightRadius;
  return i !== void 0 && (e.style.borderBottomRightRadius = i, e.style.borderTopRightRadius = i, delete e.style.borderRightRadius), e;
}
function Ct(e, t, n, r) {
  let i = null;
  e === "inset" && (t = t.replace(/^(x|y)-/, (s, a) => (i = a === "x" ? "x" : "y", "")));
  let o = r == null ? void 0 : r[t];
  if (o) {
    let s = Me(o, { isNegative: n });
    if (s !== null)
      return dl(e, i, s);
  }
  let u = ct(t, { isNegative: n });
  return u !== null ? dl(e, i, u) : null;
}
function dl(e, t, n) {
  if (e !== "inset")
    return g({ [e]: n });
  switch (t) {
    case null:
      return g({ top: n, left: n, right: n, bottom: n });
    case "y":
      return g({ top: n, bottom: n });
    case "x":
      return g({ left: n, right: n });
  }
}
function Fr(e, t, n) {
  var r;
  t = t.replace(/^-/, "");
  let i = t === "" ? "DEFAULT" : t, o = Number((r = n == null ? void 0 : n[i]) !== null && r !== void 0 ? r : t);
  return Number.isNaN(o) ? null : g({ [`flex${e}`]: o });
}
function pl(e, t) {
  var n, r;
  if (e = (t == null ? void 0 : t[e]) || e, ["min-content", "revert", "unset"].includes(e))
    return null;
  if (e.match(/^\d+(\.\d+)?$/))
    return g({ flexGrow: Number(e), flexBasis: "0%" });
  let i = e.match(/^(\d+)\s+(\d+)$/);
  if (i)
    return g({ flexGrow: Number(i[1]), flexShrink: Number(i[2]) });
  if (i = e.match(/^(\d+)\s+([^ ]+)$/), i) {
    let o = Me((n = i[2]) !== null && n !== void 0 ? n : "");
    return o ? g({ flexGrow: Number(i[1]), flexBasis: o }) : null;
  }
  if (i = e.match(/^(\d+)\s+(\d+)\s+(.+)$/), i) {
    let o = Me((r = i[3]) !== null && r !== void 0 ? r : "");
    return o ? g({ flexGrow: Number(i[1]), flexShrink: Number(i[2]), flexBasis: o }) : null;
  }
  return null;
}
function Po(e, t, n = {}, r) {
  let i = r == null ? void 0 : r[t];
  return i !== void 0 ? Ge(e, i, n) : Te(e, t, n);
}
function wr(e, t, n = {}, r) {
  let i = Me(r == null ? void 0 : r[t], n);
  return i ? g({ [e]: i }) : (t === "screen" && (t = e.includes("Width") ? "100vw" : "100vh"), Te(e, t, n));
}
function hl(e, t, n) {
  let r = n == null ? void 0 : n[e];
  if (r) {
    let i = de(r, { isNegative: t });
    if (!i)
      return null;
    let [o, u] = i;
    if (u === z.em)
      return Mm(o);
    if (u === z.percent)
      return Fe("percentage-based letter-spacing configuration currently unsupported, switch to `em`s, or open an issue if you'd like to see support added."), null;
    let s = rt(o, u, { isNegative: t });
    return s !== null ? g({ letterSpacing: s }) : null;
  }
  return Te("letterSpacing", e, { isNegative: t });
}
function Mm(e) {
  return { kind: "dependent", complete(t) {
    let n = t.fontSize;
    if (typeof n != "number" || Number.isNaN(n))
      return "tracking-X relative letter spacing classes require font-size to be set";
    t.letterSpacing = Math.round((e * n + Number.EPSILON) * 100) / 100;
  } };
}
function ml(e, t) {
  let n = t == null ? void 0 : t[e];
  if (n) {
    let i = de(String(n));
    if (i)
      return g({ opacity: i[0] });
  }
  let r = de(e);
  return r ? g({ opacity: r[0] / 100 }) : null;
}
function Dl(e) {
  let t = parseInt(e, 10);
  return Number.isNaN(t) ? null : { kind: "complete", style: { shadowOpacity: t / 100 } };
}
function gl(e) {
  if (e.includes("/")) {
    let [n = "", r = ""] = e.split("/", 2), i = Bo(n), o = Bo(r);
    return i === null || o === null ? null : { kind: "complete", style: { shadowOffset: { width: i, height: o } } };
  }
  let t = Bo(e);
  return t === null ? null : { kind: "complete", style: { shadowOffset: { width: t, height: t } } };
}
function Bo(e) {
  let t = ct(e);
  return typeof t == "number" ? t : null;
}
var _t = class {
  constructor(t, n = {}, r, i, o) {
    var u, s, a, l, f, c;
    this.config = n, this.cache = r, this.position = 0, this.isNull = false, this.isNegative = false, this.context = {}, this.context.device = i;
    let d = t.trim().split(":"), h = [];
    d.length === 1 ? this.string = t : (this.string = (u = d.pop()) !== null && u !== void 0 ? u : "", h = d), this.char = this.string[0];
    let p = Ao((s = this.config.theme) === null || s === void 0 ? void 0 : s.screens);
    for (let m of h)
      if (p[m]) {
        let v = (a = p[m]) === null || a === void 0 ? void 0 : a[2];
        v !== void 0 && (this.order = ((l = this.order) !== null && l !== void 0 ? l : 0) + v);
        let D = (f = i.windowDimensions) === null || f === void 0 ? void 0 : f.width;
        if (D) {
          let [b, y] = (c = p[m]) !== null && c !== void 0 ? c : [0, 0];
          (D <= b || D > y) && (this.isNull = true);
        } else
          this.isNull = true;
      } else
        Za(m) ? this.isNull = m !== o : el(m) ? i.windowDimensions ? (i.windowDimensions.width > i.windowDimensions.height ? "landscape" : "portrait") !== m ? this.isNull = true : this.incrementOrder() : this.isNull = true : m === "retina" ? i.pixelDensity === 2 ? this.incrementOrder() : this.isNull = true : m === "dark" ? i.colorScheme !== "dark" ? this.isNull = true : this.incrementOrder() : this.handlePossibleArbitraryBreakpointPrefix(m) || (this.isNull = true);
  }
  parse() {
    if (this.isNull)
      return { kind: "null" };
    let t = this.cache.getIr(this.rest);
    if (t)
      return t;
    this.parseIsNegative();
    let n = this.parseUtility();
    return n ? this.order !== void 0 ? { kind: "ordered", order: this.order, styleIr: n } : n : { kind: "null" };
  }
  parseUtility() {
    var t, n, r, i, o;
    let u = this.config.theme, s = null;
    switch (this.char) {
      case "m":
      case "p": {
        let a = this.peekSlice(1, 3).match(/^(t|b|r|l|x|y)?-/);
        if (a) {
          let l = this.char === "m" ? "margin" : "padding";
          this.advance(((n = (t = a[0]) === null || t === void 0 ? void 0 : t.length) !== null && n !== void 0 ? n : 0) + 1);
          let f = Eo(a[1]), c = To(l, f, this.isNegative, this.rest, (r = this.config.theme) === null || r === void 0 ? void 0 : r[l]);
          if (c)
            return c;
        }
      }
    }
    if (this.consumePeeked("h-") && (s = Po("height", this.rest, this.context, u == null ? void 0 : u.height), s) || this.consumePeeked("w-") && (s = Po("width", this.rest, this.context, u == null ? void 0 : u.width), s) || this.consumePeeked("min-w-") && (s = wr("minWidth", this.rest, this.context, u == null ? void 0 : u.minWidth), s) || this.consumePeeked("min-h-") && (s = wr("minHeight", this.rest, this.context, u == null ? void 0 : u.minHeight), s) || this.consumePeeked("max-w-") && (s = wr("maxWidth", this.rest, this.context, u == null ? void 0 : u.maxWidth), s) || this.consumePeeked("max-h-") && (s = wr("maxHeight", this.rest, this.context, u == null ? void 0 : u.maxHeight), s) || this.consumePeeked("leading-") && (s = ko(this.rest, u == null ? void 0 : u.lineHeight), s) || this.consumePeeked("text-") && (s = _o(this.rest, u == null ? void 0 : u.fontSize, this.context), s || (s = dt("text", this.rest, u == null ? void 0 : u.textColor), s) || this.consumePeeked("opacity-") && (s = xr("text", this.rest), s)) || this.consumePeeked("font-") && (s = Oo(this.rest, u == null ? void 0 : u.fontFamily), s) || this.consumePeeked("aspect-") && (this.consumePeeked("ratio-") && Fe("`aspect-ratio-{ratio}` is deprecated, use `aspect-{ratio}` instead"), s = Ge("aspectRatio", this.rest, { fractions: true }), s) || this.consumePeeked("tint-") && (s = dt("tint", this.rest, u == null ? void 0 : u.colors), s) || this.consumePeeked("bg-") && (s = dt("bg", this.rest, u == null ? void 0 : u.backgroundColor), s || this.consumePeeked("opacity-") && (s = xr("bg", this.rest), s)) || this.consumePeeked("border") && (s = fl2(this.rest, u), s || this.consumePeeked("-opacity-") && (s = xr("border", this.rest), s)) || this.consumePeeked("rounded") && (s = cl(this.rest, u == null ? void 0 : u.borderRadius), s) || this.consumePeeked("bottom-") && (s = Ct("bottom", this.rest, this.isNegative, u == null ? void 0 : u.inset), s) || this.consumePeeked("top-") && (s = Ct("top", this.rest, this.isNegative, u == null ? void 0 : u.inset), s) || this.consumePeeked("left-") && (s = Ct("left", this.rest, this.isNegative, u == null ? void 0 : u.inset), s) || this.consumePeeked("right-") && (s = Ct("right", this.rest, this.isNegative, u == null ? void 0 : u.inset), s) || this.consumePeeked("inset-") && (s = Ct("inset", this.rest, this.isNegative, u == null ? void 0 : u.inset), s) || this.consumePeeked("flex-") && (this.consumePeeked("grow") ? s = Fr("Grow", this.rest, u == null ? void 0 : u.flexGrow) : this.consumePeeked("shrink") ? s = Fr("Shrink", this.rest, u == null ? void 0 : u.flexShrink) : s = pl(this.rest, u == null ? void 0 : u.flex), s) || this.consumePeeked("grow") && (s = Fr("Grow", this.rest, u == null ? void 0 : u.flexGrow), s) || this.consumePeeked("shrink") && (s = Fr("Shrink", this.rest, u == null ? void 0 : u.flexShrink), s) || this.consumePeeked("shadow-color-opacity-") && (s = xr("shadow", this.rest), s) || this.consumePeeked("shadow-opacity-") && (s = Dl(this.rest), s) || this.consumePeeked("shadow-offset-") && (s = gl(this.rest), s) || this.consumePeeked("shadow-radius-") && (s = Te("shadowRadius", this.rest), s) || this.consumePeeked("shadow-") && (s = dt("shadow", this.rest, u == null ? void 0 : u.colors), s))
      return s;
    if (this.consumePeeked("elevation-")) {
      let a = parseInt(this.rest, 10);
      if (!Number.isNaN(a))
        return g({ elevation: a });
    }
    if (this.consumePeeked("opacity-") && (s = ml(this.rest, u == null ? void 0 : u.opacity), s) || this.consumePeeked("tracking-") && (s = hl(this.rest, this.isNegative, u == null ? void 0 : u.letterSpacing), s))
      return s;
    if (this.consumePeeked("z-")) {
      let a = Number((o = (i = u == null ? void 0 : u.zIndex) === null || i === void 0 ? void 0 : i[this.rest]) !== null && o !== void 0 ? o : this.rest);
      if (!Number.isNaN(a))
        return g({ zIndex: a });
    }
    return Fe(`\`${this.rest}\` unknown or invalid utility`), null;
  }
  handlePossibleArbitraryBreakpointPrefix(t) {
    var n;
    if (t[0] !== "m")
      return false;
    let r = t.match(/^(min|max)-(w|h)-\[([^\]]+)\]$/);
    if (!r)
      return false;
    if (!(!((n = this.context.device) === null || n === void 0) && n.windowDimensions))
      return this.isNull = true, true;
    let i = this.context.device.windowDimensions, [, o = "", u = "", s = ""] = r, a = u === "w" ? i.width : i.height, l = de(s, this.context);
    if (l === null)
      return this.isNull = true, true;
    let [f, c] = l;
    return c !== "px" && (this.isNull = true), (o === "min" ? a >= f : a <= f) ? this.incrementOrder() : this.isNull = true, true;
  }
  advance(t = 1) {
    this.position += t, this.char = this.string[this.position];
  }
  get rest() {
    return this.peekSlice(0, this.string.length);
  }
  peekSlice(t, n) {
    return this.string.slice(this.position + t, this.position + n);
  }
  consumePeeked(t) {
    return this.peekSlice(0, t.length) === t ? (this.advance(t.length), true) : false;
  }
  parseIsNegative() {
    this.char === "-" && (this.advance(), this.isNegative = true, this.context.isNegative = true);
  }
  incrementOrder() {
    var t;
    this.order = ((t = this.order) !== null && t !== void 0 ? t : 0) + 1;
  }
};
function bl(e) {
  let t = [], n = null;
  return e.forEach((r) => {
    if (typeof r == "string")
      t = [...t, ...Io(r)];
    else if (Array.isArray(r))
      t = [...t, ...r.flatMap(Io)];
    else if (typeof r == "object" && r !== null)
      for (let [i, o] of Object.entries(r))
        typeof o == "boolean" ? t = [...t, ...o ? Io(i) : []] : n ? n[i] = o : n = { [i]: o };
  }), [t.filter(Boolean).filter(Nm), n];
}
function Io(e) {
  return e.trim().split(/\s+/);
}
function Nm(e, t, n) {
  return n.indexOf(e) === t;
}
function vl(e) {
  var t;
  return (t = e == null ? void 0 : e.reduce((n, r) => ({ ...n, ...Wm(r.handler) }), {})) !== null && t !== void 0 ? t : {};
}
function Wm(e) {
  let t = {};
  return e({ addUtilities: (n) => {
    t = n;
  }, ...$m }), t;
}
function Ne(e) {
  throw new Error(`tailwindcss plugin function argument object prop "${e}" not implemented`);
}
var $m = { addComponents: Ne, addBase: Ne, addVariant: Ne, e: Ne, prefix: Ne, theme: Ne, variants: Ne, config: Ne, corePlugins: Ne, matchUtilities: Ne, postcss: null };
function xl(e, t) {
  let n = (0, yl.default)(qm(e)), r = {}, i = vl(n.plugins), o = {}, u = Object.entries(i).map(([p, m]) => typeof m == "string" ? (o[p] = m, [p, { kind: "null" }]) : [p, g(m)]).filter(([, p]) => p.kind !== "null");
  function s() {
    return [r.windowDimensions ? `w${r.windowDimensions.width}` : false, r.windowDimensions ? `h${r.windowDimensions.height}` : false, r.fontScale ? `fs${r.fontScale}` : false, r.colorScheme === "dark" ? "dark" : false, r.pixelDensity === 2 ? "retina" : false].filter(Boolean).join("--") || "default";
  }
  let a = s(), l = {};
  function f() {
    let p = l[a];
    if (p)
      return p;
    let m = new yr(u);
    return l[a] = m, m;
  }
  function c(...p) {
    let m = f(), v = {}, D = [], b = [], [y, F] = bl(p), x = y.join(" "), k = m.getStyle(x);
    if (k)
      return { ...k, ...F || {} };
    for (let B of y) {
      let I = m.getIr(B);
      if (!I && B in o) {
        let ue = c(o[B]);
        m.setIr(B, g(ue)), v = { ...v, ...ue };
        continue;
      }
      switch (I = new _t(B, n, m, r, t).parse(), I.kind) {
        case "complete":
          v = { ...v, ...I.style }, m.setIr(B, I);
          break;
        case "dependent":
          D.push(I);
          break;
        case "ordered":
          b.push(I);
          break;
        case "null":
          m.setIr(B, I);
          break;
      }
    }
    if (b.length > 0) {
      b.sort((B, I) => B.order - I.order);
      for (let B of b)
        switch (B.styleIr.kind) {
          case "complete":
            v = { ...v, ...B.styleIr.style };
            break;
          case "dependent":
            D.push(B.styleIr);
            break;
        }
    }
    if (D.length > 0) {
      for (let B of D) {
        let I = B.complete(v);
        I && Fe(I);
      }
      sl(v);
    }
    return x !== "" && m.setStyle(x, v), F && (v = { ...v, ...F }), v;
  }
  function d(p) {
    let m = c(p.split(/\s+/g).map((v) => v.replace(/^(bg|text|border)-/, "")).map((v) => `bg-${v}`).join(" "));
    return typeof m.backgroundColor == "string" ? m.backgroundColor : void 0;
  }
  let h = (p, ...m) => {
    let v = "";
    return p.forEach((D, b) => {
      var y;
      v += D + ((y = m[b]) !== null && y !== void 0 ? y : "");
    }), c(v);
  };
  return h.style = c, h.color = d, h.prefixMatch = (...p) => {
    let m = p.sort().join(":"), v = f(), D = v.getPrefixMatch(m);
    if (D !== void 0)
      return D;
    let F = new _t(`${m}:flex`, n, v, r, t).parse().kind !== "null";
    return v.setPrefixMatch(m, F), F;
  }, h.setWindowDimensions = (p) => {
    r.windowDimensions = p, a = s();
  }, h.setFontScale = (p) => {
    r.fontScale = p, a = s();
  }, h.setPixelDensity = (p) => {
    r.pixelDensity = p, a = s();
  }, h.setColorScheme = (p) => {
    r.colorScheme = p, a = s();
  }, h;
}
function qm(e) {
  return { ...e, content: ["_no_warnings_please"] };
}
var Um = { handler: ({ addUtilities: e }) => {
  e({ "shadow-sm": { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }, shadow: { boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" }, "shadow-md": { boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }, "shadow-lg": { boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }, "shadow-xl": { boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }, "shadow-2xl": { boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)" }, "shadow-inner": { boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" }, "shadow-none": { boxShadow: "0 0 #0000" } });
} };
function Gm(e) {
  return xl({ ...e, plugins: [...(e == null ? void 0 : e.plugins) ?? [], Um] }, "web");
}
var mn;
function Ro({ width: e, height: t, config: n }) {
  return mn || (mn = Gm(n)), mn.setWindowDimensions({ width: +e, height: +t }), mn;
}
var Lo = /* @__PURE__ */ new WeakMap();
async function wl(e, t) {
  let n = await qe();
  if (!n || !n.Node)
    throw new Error("Satori is not initialized: expect `yoga` to be loaded, got " + n);
  t.fonts = t.fonts || [];
  let r;
  Lo.has(t.fonts) ? r = Lo.get(t.fonts) : Lo.set(t.fonts, r = new zt(t.fonts));
  let i = "width" in t ? t.width : void 0, o = "height" in t ? t.height : void 0, u = n.Node.create();
  i && u.setWidth(i), o && u.setHeight(o), u.setFlexDirection(n.FLEX_DIRECTION_ROW), u.setFlexWrap(n.WRAP_WRAP), u.setAlignContent(n.ALIGN_AUTO), u.setAlignItems(n.ALIGN_FLEX_START), u.setJustifyContent(n.JUSTIFY_FLEX_START), u.setOverflow(n.OVERFLOW_HIDDEN);
  let s = { ...t.graphemeImages }, a = /* @__PURE__ */ new Set();
  Re.clear(), await cu(e);
  let l = qt(e, { id: "id", parentStyle: {}, inheritedStyle: { fontSize: 16, fontWeight: "normal", fontFamily: "serif", fontStyle: "normal", lineHeight: 1.2, color: "black", opacity: 1, whiteSpace: "normal", _viewportWidth: i, _viewportHeight: o }, parent: u, font: r, embedFont: t.embedFont, debug: t.debug, graphemeImages: s, canLoadAdditionalAssets: !!t.loadAdditionalAsset, onNodeDetected: t.onNodeDetected, getTwStyles: (p, m) => {
    let D = { ...Ro({ width: i, height: o, config: t.tailwindConfig })([p]) };
    return typeof D.lineHeight == "number" && (D.lineHeight = D.lineHeight / (+D.fontSize || m.fontSize || 16)), D.shadowColor && D.boxShadow && (D.boxShadow = D.boxShadow.replace(/rgba?\([^)]+\)/, D.shadowColor)), D;
  } }), f = (await l.next()).value;
  if (t.loadAdditionalAsset && f.length) {
    let p = jm(f), m = [], v = {};
    await Promise.all(Object.entries(p).flatMap(([D, b]) => b.map((y) => {
      let F = `${D}_${y}`;
      return a.has(F) ? null : (a.add(F), t.loadAdditionalAsset(D, y).then((x) => {
        typeof x == "string" ? v[y] = x : x && (Array.isArray(x) ? m.push(...x) : m.push(x));
      }));
    }))), r.addFonts(m), Object.assign(s, v);
  }
  await l.next(), u.calculateLayout(i, o, n.DIRECTION_LTR);
  let c = (await l.next([0, 0])).value, d = u.getComputedWidth(), h = u.getComputedHeight();
  return u.freeRecursive(), Vn({ width: d, height: h, content: c });
}
function jm(e) {
  let t = {}, n = {};
  for (let { word: r, locale: i } of e) {
    let o = Wu(r, i).join("|");
    n[o] = n[o] || "", n[o] += r;
  }
  return Object.keys(n).forEach((r) => {
    t[r] = t[r] || [], r === "emoji" ? t[r].push(...Fl(be(n[r], "grapheme"))) : (t[r][0] = t[r][0] || "", t[r][0] += Fl(be(n[r], "grapheme", r === "unknown" ? void 0 : r)).join(""));
  }), t;
}
function Fl(e) {
  return Array.from(new Set(e));
}

// node_modules/.pnpm/yoga-wasm-web@0.3.3/node_modules/yoga-wasm-web/dist/wrapAsm-f766f97f.js
var YGEnums = {};
var ALIGN_AUTO = YGEnums.ALIGN_AUTO = 0;
var ALIGN_FLEX_START = YGEnums.ALIGN_FLEX_START = 1;
var ALIGN_CENTER = YGEnums.ALIGN_CENTER = 2;
var ALIGN_FLEX_END = YGEnums.ALIGN_FLEX_END = 3;
var ALIGN_STRETCH = YGEnums.ALIGN_STRETCH = 4;
var ALIGN_BASELINE = YGEnums.ALIGN_BASELINE = 5;
var ALIGN_SPACE_BETWEEN = YGEnums.ALIGN_SPACE_BETWEEN = 6;
var ALIGN_SPACE_AROUND = YGEnums.ALIGN_SPACE_AROUND = 7;
var DIMENSION_WIDTH = YGEnums.DIMENSION_WIDTH = 0;
var DIMENSION_HEIGHT = YGEnums.DIMENSION_HEIGHT = 1;
var DIRECTION_INHERIT = YGEnums.DIRECTION_INHERIT = 0;
var DIRECTION_LTR = YGEnums.DIRECTION_LTR = 1;
var DIRECTION_RTL = YGEnums.DIRECTION_RTL = 2;
var DISPLAY_FLEX = YGEnums.DISPLAY_FLEX = 0;
var DISPLAY_NONE = YGEnums.DISPLAY_NONE = 1;
var EDGE_LEFT = YGEnums.EDGE_LEFT = 0;
var EDGE_TOP = YGEnums.EDGE_TOP = 1;
var EDGE_RIGHT = YGEnums.EDGE_RIGHT = 2;
var EDGE_BOTTOM = YGEnums.EDGE_BOTTOM = 3;
var EDGE_START = YGEnums.EDGE_START = 4;
var EDGE_END = YGEnums.EDGE_END = 5;
var EDGE_HORIZONTAL = YGEnums.EDGE_HORIZONTAL = 6;
var EDGE_VERTICAL = YGEnums.EDGE_VERTICAL = 7;
var EDGE_ALL = YGEnums.EDGE_ALL = 8;
var EXPERIMENTAL_FEATURE_WEB_FLEX_BASIS = YGEnums.EXPERIMENTAL_FEATURE_WEB_FLEX_BASIS = 0;
var EXPERIMENTAL_FEATURE_ABSOLUTE_PERCENTAGE_AGAINST_PADDING_EDGE = YGEnums.EXPERIMENTAL_FEATURE_ABSOLUTE_PERCENTAGE_AGAINST_PADDING_EDGE = 1;
var EXPERIMENTAL_FEATURE_FIX_ABSOLUTE_TRAILING_COLUMN_MARGIN = YGEnums.EXPERIMENTAL_FEATURE_FIX_ABSOLUTE_TRAILING_COLUMN_MARGIN = 2;
var FLEX_DIRECTION_COLUMN = YGEnums.FLEX_DIRECTION_COLUMN = 0;
var FLEX_DIRECTION_COLUMN_REVERSE = YGEnums.FLEX_DIRECTION_COLUMN_REVERSE = 1;
var FLEX_DIRECTION_ROW = YGEnums.FLEX_DIRECTION_ROW = 2;
var FLEX_DIRECTION_ROW_REVERSE = YGEnums.FLEX_DIRECTION_ROW_REVERSE = 3;
var GUTTER_COLUMN = YGEnums.GUTTER_COLUMN = 0;
var GUTTER_ROW = YGEnums.GUTTER_ROW = 1;
var GUTTER_ALL = YGEnums.GUTTER_ALL = 2;
var JUSTIFY_FLEX_START = YGEnums.JUSTIFY_FLEX_START = 0;
var JUSTIFY_CENTER = YGEnums.JUSTIFY_CENTER = 1;
var JUSTIFY_FLEX_END = YGEnums.JUSTIFY_FLEX_END = 2;
var JUSTIFY_SPACE_BETWEEN = YGEnums.JUSTIFY_SPACE_BETWEEN = 3;
var JUSTIFY_SPACE_AROUND = YGEnums.JUSTIFY_SPACE_AROUND = 4;
var JUSTIFY_SPACE_EVENLY = YGEnums.JUSTIFY_SPACE_EVENLY = 5;
var LOG_LEVEL_ERROR = YGEnums.LOG_LEVEL_ERROR = 0;
var LOG_LEVEL_WARN = YGEnums.LOG_LEVEL_WARN = 1;
var LOG_LEVEL_INFO = YGEnums.LOG_LEVEL_INFO = 2;
var LOG_LEVEL_DEBUG = YGEnums.LOG_LEVEL_DEBUG = 3;
var LOG_LEVEL_VERBOSE = YGEnums.LOG_LEVEL_VERBOSE = 4;
var LOG_LEVEL_FATAL = YGEnums.LOG_LEVEL_FATAL = 5;
var MEASURE_MODE_UNDEFINED = YGEnums.MEASURE_MODE_UNDEFINED = 0;
var MEASURE_MODE_EXACTLY = YGEnums.MEASURE_MODE_EXACTLY = 1;
var MEASURE_MODE_AT_MOST = YGEnums.MEASURE_MODE_AT_MOST = 2;
var NODE_TYPE_DEFAULT = YGEnums.NODE_TYPE_DEFAULT = 0;
var NODE_TYPE_TEXT = YGEnums.NODE_TYPE_TEXT = 1;
var OVERFLOW_VISIBLE = YGEnums.OVERFLOW_VISIBLE = 0;
var OVERFLOW_HIDDEN = YGEnums.OVERFLOW_HIDDEN = 1;
var OVERFLOW_SCROLL = YGEnums.OVERFLOW_SCROLL = 2;
var POSITION_TYPE_STATIC = YGEnums.POSITION_TYPE_STATIC = 0;
var POSITION_TYPE_RELATIVE = YGEnums.POSITION_TYPE_RELATIVE = 1;
var POSITION_TYPE_ABSOLUTE = YGEnums.POSITION_TYPE_ABSOLUTE = 2;
var PRINT_OPTIONS_LAYOUT = YGEnums.PRINT_OPTIONS_LAYOUT = 1;
var PRINT_OPTIONS_STYLE = YGEnums.PRINT_OPTIONS_STYLE = 2;
var PRINT_OPTIONS_CHILDREN = YGEnums.PRINT_OPTIONS_CHILDREN = 4;
var UNIT_UNDEFINED = YGEnums.UNIT_UNDEFINED = 0;
var UNIT_POINT = YGEnums.UNIT_POINT = 1;
var UNIT_PERCENT = YGEnums.UNIT_PERCENT = 2;
var UNIT_AUTO = YGEnums.UNIT_AUTO = 3;
var WRAP_NO_WRAP = YGEnums.WRAP_NO_WRAP = 0;
var WRAP_WRAP = YGEnums.WRAP_WRAP = 1;
var WRAP_WRAP_REVERSE = YGEnums.WRAP_WRAP_REVERSE = 2;
var wrapAsm = (E) => {
  function _(E2, _2, T3) {
    let N2 = E2[_2];
    E2[_2] = function(...E3) {
      return T3.call(this, N2, ...E3);
    };
  }
  for (let T3 of ["setPosition", "setMargin", "setFlexBasis", "setWidth", "setHeight", "setMinWidth", "setMinHeight", "setMaxWidth", "setMaxHeight", "setPadding"]) {
    let N2 = { [YGEnums.UNIT_POINT]: E.Node.prototype[T3], [YGEnums.UNIT_PERCENT]: E.Node.prototype[`${T3}Percent`], [YGEnums.UNIT_AUTO]: E.Node.prototype[`${T3}Auto`] };
    _(E.Node.prototype, T3, function(E2, ..._2) {
      let I, L;
      let O = _2.pop();
      if (O === "auto")
        I = YGEnums.UNIT_AUTO, L = void 0;
      else if (typeof O == "object")
        I = O.unit, L = O.valueOf();
      else if (I = typeof O == "string" && O.endsWith("%") ? YGEnums.UNIT_PERCENT : YGEnums.UNIT_POINT, L = parseFloat(O), !Number.isNaN(O) && Number.isNaN(L))
        throw Error(`Invalid value ${O} for ${T3}`);
      if (!N2[I])
        throw Error(`Failed to execute "${T3}": Unsupported unit '${O}'`);
      return L !== void 0 ? N2[I].call(this, ..._2, L) : N2[I].call(this, ..._2);
    });
  }
  function T2(_2) {
    return E.MeasureCallback.implement({ measure: (...E2) => {
      let { width: T3, height: N2 } = _2(...E2);
      return { width: T3 ?? NaN, height: N2 ?? NaN };
    } });
  }
  function N(_2) {
    return E.DirtiedCallback.implement({ dirtied: _2 });
  }
  return _(E.Node.prototype, "setMeasureFunc", function(E2, _2) {
    return _2 ? E2.call(this, T2(_2)) : this.unsetMeasureFunc();
  }), _(E.Node.prototype, "setDirtiedFunc", function(E2, _2) {
    E2.call(this, N(_2));
  }), _(E.Config.prototype, "free", function() {
    E.Config.destroy(this);
  }), _(E.Node, "create", (_2, T3) => T3 ? E.Node.createWithConfig(T3) : E.Node.createDefault()), _(E.Node.prototype, "free", function() {
    E.Node.destroy(this);
  }), _(E.Node.prototype, "freeRecursive", function() {
    for (let E2 = 0, _2 = this.getChildCount(); E2 < _2; ++E2)
      this.getChild(0).freeRecursive();
    this.free();
  }), _(E.Node.prototype, "calculateLayout", function(E2, _2 = NaN, T3 = NaN, N2 = YGEnums.DIRECTION_LTR) {
    return E2.call(this, _2, T3, N2);
  }), { Config: E.Config, Node: E.Node, ...YGEnums };
};

// node_modules/.pnpm/yoga-wasm-web@0.3.3/node_modules/yoga-wasm-web/dist/index.js
var yoga = (() => {
  var n = typeof document != "undefined" && document.currentScript ? document.currentScript.src : void 0;
  return function(t = {}) {
    u || (u = t !== void 0 ? t : {}), u.ready = new Promise(function(n2, t2) {
      c = n2, f = t2;
    });
    var r, e, a = Object.assign({}, u), i = "";
    typeof document != "undefined" && document.currentScript && (i = document.currentScript.src), n && (i = n), i = i.indexOf("blob:") !== 0 ? i.substr(0, i.replace(/[?#].*/, "").lastIndexOf("/") + 1) : "";
    var o = console.log.bind(console), s = console.warn.bind(console);
    Object.assign(u, a), a = null, typeof WebAssembly != "object" && w("no native wasm support detected");
    var u, c, f, l, h = false;
    function p(n2, t2, r2) {
      r2 = t2 + r2;
      for (var e2 = ""; !(t2 >= r2); ) {
        var a2 = n2[t2++];
        if (!a2)
          break;
        if (128 & a2) {
          var i2 = 63 & n2[t2++];
          if ((224 & a2) == 192)
            e2 += String.fromCharCode((31 & a2) << 6 | i2);
          else {
            var o2 = 63 & n2[t2++];
            65536 > (a2 = (240 & a2) == 224 ? (15 & a2) << 12 | i2 << 6 | o2 : (7 & a2) << 18 | i2 << 12 | o2 << 6 | 63 & n2[t2++]) ? e2 += String.fromCharCode(a2) : (a2 -= 65536, e2 += String.fromCharCode(55296 | a2 >> 10, 56320 | 1023 & a2));
          }
        } else
          e2 += String.fromCharCode(a2);
      }
      return e2;
    }
    function v() {
      var n2 = l.buffer;
      u.HEAP8 = d = new Int8Array(n2), u.HEAP16 = m = new Int16Array(n2), u.HEAP32 = g2 = new Int32Array(n2), u.HEAPU8 = y = new Uint8Array(n2), u.HEAPU16 = E = new Uint16Array(n2), u.HEAPU32 = _ = new Uint32Array(n2), u.HEAPF32 = T2 = new Float32Array(n2), u.HEAPF64 = L = new Float64Array(n2);
    }
    var d, y, m, E, g2, _, T2, L, A, O = [], P = [], b = [], N = 0, I = null;
    function w(n2) {
      throw s(n2 = "Aborted(" + n2 + ")"), h = true, f(n2 = new WebAssembly.RuntimeError(n2 + ". Build with -sASSERTIONS for more info.")), n2;
    }
    function S2() {
      return r.startsWith("data:application/octet-stream;base64,");
    }
    function R() {
      try {
        throw "both async and sync fetching of the wasm failed";
      } catch (n2) {
        w(n2);
      }
    }
    function C(n2) {
      for (; 0 < n2.length; )
        n2.shift()(u);
    }
    function W2(n2) {
      if (n2 === void 0)
        return "_unknown";
      var t2 = (n2 = n2.replace(/[^a-zA-Z0-9_]/g, "$")).charCodeAt(0);
      return 48 <= t2 && 57 >= t2 ? "_" + n2 : n2;
    }
    function U(n2, t2) {
      return n2 = W2(n2), function() {
        return t2.apply(this, arguments);
      };
    }
    r = "yoga.wasm", S2() || (r = i + r);
    var M = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }], F = [];
    function D(n2) {
      var t2 = Error, r2 = U(n2, function(t3) {
        this.name = n2, this.message = t3, (t3 = Error(t3).stack) !== void 0 && (this.stack = this.toString() + "\n" + t3.replace(/^Error(:[^\n]*)?\n/, ""));
      });
      return r2.prototype = Object.create(t2.prototype), r2.prototype.constructor = r2, r2.prototype.toString = function() {
        return this.message === void 0 ? this.name : this.name + ": " + this.message;
      }, r2;
    }
    var k = void 0;
    function V(n2) {
      throw new k(n2);
    }
    var j = (n2) => (n2 || V("Cannot use deleted val. handle = " + n2), M[n2].value), G = (n2) => {
      switch (n2) {
        case void 0:
          return 1;
        case null:
          return 2;
        case true:
          return 3;
        case false:
          return 4;
        default:
          var t2 = F.length ? F.pop() : M.length;
          return M[t2] = { fa: 1, value: n2 }, t2;
      }
    }, Y = void 0, X = void 0;
    function B(n2) {
      for (var t2 = ""; y[n2]; )
        t2 += X[y[n2++]];
      return t2;
    }
    var H = [];
    function x() {
      for (; H.length; ) {
        var n2 = H.pop();
        n2.L.Z = false, n2.delete();
      }
    }
    var z2 = void 0, $ = {};
    function Z(n2, t2) {
      for (t2 === void 0 && V("ptr should not be undefined"); n2.P; )
        t2 = n2.aa(t2), n2 = n2.P;
      return t2;
    }
    var J = {};
    function q(n2) {
      var t2 = B(n2 = nz(n2));
      return nZ(n2), t2;
    }
    function K(n2, t2) {
      var r2 = J[n2];
      return r2 === void 0 && V(t2 + " has unknown type " + q(n2)), r2;
    }
    function Q() {
    }
    var nn2 = false;
    function nt(n2) {
      --n2.count.value, n2.count.value === 0 && (n2.S ? n2.T.V(n2.S) : n2.O.M.V(n2.N));
    }
    var nr = {}, ne = void 0;
    function na(n2) {
      throw new ne(n2);
    }
    function ni(n2, t2) {
      return t2.O && t2.N || na("makeClassHandle requires ptr and ptrType"), !!t2.T != !!t2.S && na("Both smartPtrType and smartPtr must be specified"), t2.count = { value: 1 }, no2(Object.create(n2, { L: { value: t2 } }));
    }
    function no2(n2) {
      return typeof FinalizationRegistry == "undefined" ? (no2 = (n3) => n3, n2) : (nn2 = new FinalizationRegistry((n3) => {
        nt(n3.L);
      }), no2 = (n3) => {
        var t2 = n3.L;
        return t2.S && nn2.register(n3, { L: t2 }, n3), n3;
      }, Q = (n3) => {
        nn2.unregister(n3);
      }, no2(n2));
    }
    var ns = {};
    function nu2(n2) {
      for (; n2.length; ) {
        var t2 = n2.pop();
        n2.pop()(t2);
      }
    }
    function nc(n2) {
      return this.fromWireType(g2[n2 >> 2]);
    }
    var nf2 = {}, nl2 = {};
    function nh(n2, t2, r2) {
      function e2(t3) {
        (t3 = r2(t3)).length !== n2.length && na("Mismatched type converter count");
        for (var e3 = 0; e3 < n2.length; ++e3)
          nv(n2[e3], t3[e3]);
      }
      n2.forEach(function(n3) {
        nl2[n3] = t2;
      });
      var a2 = Array(t2.length), i2 = [], o2 = 0;
      t2.forEach((n3, t3) => {
        J.hasOwnProperty(n3) ? a2[t3] = J[n3] : (i2.push(n3), nf2.hasOwnProperty(n3) || (nf2[n3] = []), nf2[n3].push(() => {
          a2[t3] = J[n3], ++o2 === i2.length && e2(a2);
        }));
      }), i2.length === 0 && e2(a2);
    }
    function np(n2) {
      switch (n2) {
        case 1:
          return 0;
        case 2:
          return 1;
        case 4:
          return 2;
        case 8:
          return 3;
        default:
          throw TypeError("Unknown type size: " + n2);
      }
    }
    function nv(n2, t2, r2 = {}) {
      if (!("argPackAdvance" in t2))
        throw TypeError("registerType registeredInstance requires argPackAdvance");
      var e2 = t2.name;
      if (n2 || V('type "' + e2 + '" must have a positive integer typeid pointer'), J.hasOwnProperty(n2)) {
        if (r2.ta)
          return;
        V("Cannot register type '" + e2 + "' twice");
      }
      J[n2] = t2, delete nl2[n2], nf2.hasOwnProperty(n2) && (t2 = nf2[n2], delete nf2[n2], t2.forEach((n3) => n3()));
    }
    function nd(n2) {
      V(n2.L.O.M.name + " instance already deleted");
    }
    function ny() {
    }
    function nm(n2, t2, r2) {
      if (n2[t2].R === void 0) {
        var e2 = n2[t2];
        n2[t2] = function() {
          return n2[t2].R.hasOwnProperty(arguments.length) || V("Function '" + r2 + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + n2[t2].R + ")!"), n2[t2].R[arguments.length].apply(this, arguments);
        }, n2[t2].R = [], n2[t2].R[e2.Y] = e2;
      }
    }
    function nE(n2, t2, r2, e2, a2, i2, o2, s2) {
      this.name = n2, this.constructor = t2, this.W = r2, this.V = e2, this.P = a2, this.oa = i2, this.aa = o2, this.ma = s2, this.ia = [];
    }
    function ng(n2, t2, r2) {
      for (; t2 !== r2; )
        t2.aa || V("Expected null or instance of " + r2.name + ", got an instance of " + t2.name), n2 = t2.aa(n2), t2 = t2.P;
      return n2;
    }
    function n_(n2, t2) {
      return t2 === null ? (this.da && V("null is not a valid " + this.name), 0) : (t2.L || V('Cannot pass "' + nC(t2) + '" as a ' + this.name), t2.L.N || V("Cannot pass deleted object as a pointer of type " + this.name), ng(t2.L.N, t2.L.O.M, this.M));
    }
    function nT(n2, t2) {
      if (t2 === null) {
        if (this.da && V("null is not a valid " + this.name), this.ca) {
          var r2 = this.ea();
          return n2 !== null && n2.push(this.V, r2), r2;
        }
        return 0;
      }
      if (t2.L || V('Cannot pass "' + nC(t2) + '" as a ' + this.name), t2.L.N || V("Cannot pass deleted object as a pointer of type " + this.name), !this.ba && t2.L.O.ba && V("Cannot convert argument of type " + (t2.L.T ? t2.L.T.name : t2.L.O.name) + " to parameter type " + this.name), r2 = ng(t2.L.N, t2.L.O.M, this.M), this.ca)
        switch (t2.L.S === void 0 && V("Passing raw pointer to smart pointer is illegal"), this.Aa) {
          case 0:
            t2.L.T === this ? r2 = t2.L.S : V("Cannot convert argument of type " + (t2.L.T ? t2.L.T.name : t2.L.O.name) + " to parameter type " + this.name);
            break;
          case 1:
            r2 = t2.L.S;
            break;
          case 2:
            if (t2.L.T === this)
              r2 = t2.L.S;
            else {
              var e2 = t2.clone();
              r2 = this.wa(r2, G(function() {
                e2.delete();
              })), n2 !== null && n2.push(this.V, r2);
            }
            break;
          default:
            V("Unsupporting sharing policy");
        }
      return r2;
    }
    function nL(n2, t2) {
      return t2 === null ? (this.da && V("null is not a valid " + this.name), 0) : (t2.L || V('Cannot pass "' + nC(t2) + '" as a ' + this.name), t2.L.N || V("Cannot pass deleted object as a pointer of type " + this.name), t2.L.O.ba && V("Cannot convert argument of type " + t2.L.O.name + " to parameter type " + this.name), ng(t2.L.N, t2.L.O.M, this.M));
    }
    function nA(n2, t2, r2, e2) {
      this.name = n2, this.M = t2, this.da = r2, this.ba = e2, this.ca = false, this.V = this.wa = this.ea = this.ja = this.Aa = this.va = void 0, t2.P !== void 0 ? this.toWireType = nT : (this.toWireType = e2 ? n_ : nL, this.U = null);
    }
    var nO = [];
    function nP(n2) {
      var t2 = nO[n2];
      return t2 || (n2 >= nO.length && (nO.length = n2 + 1), nO[n2] = t2 = A.get(n2)), t2;
    }
    function nb(n2, t2) {
      var r2, e2, a2 = (n2 = B(n2)).includes("j") ? (r2 = n2, e2 = [], function() {
        if (e2.length = 0, Object.assign(e2, arguments), r2.includes("j")) {
          var n3 = u["dynCall_" + r2];
          n3 = e2 && e2.length ? n3.apply(null, [t2].concat(e2)) : n3.call(null, t2);
        } else
          n3 = nP(t2).apply(null, e2);
        return n3;
      }) : nP(t2);
      return typeof a2 != "function" && V("unknown function pointer with signature " + n2 + ": " + t2), a2;
    }
    var nN = void 0;
    function nI(n2, t2) {
      var r2 = [], e2 = {};
      throw t2.forEach(function n3(t3) {
        e2[t3] || J[t3] || (nl2[t3] ? nl2[t3].forEach(n3) : (r2.push(t3), e2[t3] = true));
      }), new nN(n2 + ": " + r2.map(q).join([", "]));
    }
    function nw(n2, t2, r2, e2, a2) {
      var i2 = t2.length;
      2 > i2 && V("argTypes array size mismatch! Must at least get return value and 'this' types!");
      var o2 = t2[1] !== null && r2 !== null, s2 = false;
      for (r2 = 1; r2 < t2.length; ++r2)
        if (t2[r2] !== null && t2[r2].U === void 0) {
          s2 = true;
          break;
        }
      var u2 = t2[0].name !== "void", c2 = i2 - 2, f2 = Array(c2), l2 = [], h2 = [];
      return function() {
        if (arguments.length !== c2 && V("function " + n2 + " called with " + arguments.length + " arguments, expected " + c2 + " args!"), h2.length = 0, l2.length = o2 ? 2 : 1, l2[0] = a2, o2) {
          var r3 = t2[1].toWireType(h2, this);
          l2[1] = r3;
        }
        for (var i3 = 0; i3 < c2; ++i3)
          f2[i3] = t2[i3 + 2].toWireType(h2, arguments[i3]), l2.push(f2[i3]);
        if (i3 = e2.apply(null, l2), s2)
          nu2(h2);
        else
          for (var p2 = o2 ? 1 : 2; p2 < t2.length; p2++) {
            var v2 = p2 === 1 ? r3 : f2[p2 - 2];
            t2[p2].U !== null && t2[p2].U(v2);
          }
        return u2 ? t2[0].fromWireType(i3) : void 0;
      };
    }
    function nS(n2, t2) {
      for (var r2 = [], e2 = 0; e2 < n2; e2++)
        r2.push(_[t2 + 4 * e2 >> 2]);
      return r2;
    }
    function nR(n2) {
      4 < n2 && --M[n2].fa == 0 && (M[n2] = void 0, F.push(n2));
    }
    function nC(n2) {
      if (n2 === null)
        return "null";
      var t2 = typeof n2;
      return t2 === "object" || t2 === "array" || t2 === "function" ? n2.toString() : "" + n2;
    }
    function nW(n2, t2) {
      for (var r2 = "", e2 = 0; !(e2 >= t2 / 2); ++e2) {
        var a2 = m[n2 + 2 * e2 >> 1];
        if (a2 == 0)
          break;
        r2 += String.fromCharCode(a2);
      }
      return r2;
    }
    function nU(n2, t2, r2) {
      if (r2 === void 0 && (r2 = 2147483647), 2 > r2)
        return 0;
      r2 -= 2;
      var e2 = t2;
      r2 = r2 < 2 * n2.length ? r2 / 2 : n2.length;
      for (var a2 = 0; a2 < r2; ++a2)
        m[t2 >> 1] = n2.charCodeAt(a2), t2 += 2;
      return m[t2 >> 1] = 0, t2 - e2;
    }
    function nM(n2) {
      return 2 * n2.length;
    }
    function nF(n2, t2) {
      for (var r2 = 0, e2 = ""; !(r2 >= t2 / 4); ) {
        var a2 = g2[n2 + 4 * r2 >> 2];
        if (a2 == 0)
          break;
        ++r2, 65536 <= a2 ? (a2 -= 65536, e2 += String.fromCharCode(55296 | a2 >> 10, 56320 | 1023 & a2)) : e2 += String.fromCharCode(a2);
      }
      return e2;
    }
    function nD(n2, t2, r2) {
      if (r2 === void 0 && (r2 = 2147483647), 4 > r2)
        return 0;
      var e2 = t2;
      r2 = e2 + r2 - 4;
      for (var a2 = 0; a2 < n2.length; ++a2) {
        var i2 = n2.charCodeAt(a2);
        if (55296 <= i2 && 57343 >= i2 && (i2 = 65536 + ((1023 & i2) << 10) | 1023 & n2.charCodeAt(++a2)), g2[t2 >> 2] = i2, (t2 += 4) + 4 > r2)
          break;
      }
      return g2[t2 >> 2] = 0, t2 - e2;
    }
    function nk(n2) {
      for (var t2 = 0, r2 = 0; r2 < n2.length; ++r2) {
        var e2 = n2.charCodeAt(r2);
        55296 <= e2 && 57343 >= e2 && ++r2, t2 += 4;
      }
      return t2;
    }
    var nV = {};
    function nj(n2) {
      var t2 = nV[n2];
      return t2 === void 0 ? B(n2) : t2;
    }
    var nG = [], nY = [], nX = [null, [], []];
    k = u.BindingError = D("BindingError"), u.count_emval_handles = function() {
      for (var n2 = 0, t2 = 5; t2 < M.length; ++t2)
        M[t2] !== void 0 && ++n2;
      return n2;
    }, u.get_first_emval = function() {
      for (var n2 = 5; n2 < M.length; ++n2)
        if (M[n2] !== void 0)
          return M[n2];
      return null;
    }, Y = u.PureVirtualError = D("PureVirtualError");
    for (var nB = Array(256), nH = 0; 256 > nH; ++nH)
      nB[nH] = String.fromCharCode(nH);
    X = nB, u.getInheritedInstanceCount = function() {
      return Object.keys($).length;
    }, u.getLiveInheritedInstances = function() {
      var n2, t2 = [];
      for (n2 in $)
        $.hasOwnProperty(n2) && t2.push($[n2]);
      return t2;
    }, u.flushPendingDeletes = x, u.setDelayFunction = function(n2) {
      z2 = n2, H.length && z2 && z2(x);
    }, ne = u.InternalError = D("InternalError"), ny.prototype.isAliasOf = function(n2) {
      if (!(this instanceof ny && n2 instanceof ny))
        return false;
      var t2 = this.L.O.M, r2 = this.L.N, e2 = n2.L.O.M;
      for (n2 = n2.L.N; t2.P; )
        r2 = t2.aa(r2), t2 = t2.P;
      for (; e2.P; )
        n2 = e2.aa(n2), e2 = e2.P;
      return t2 === e2 && r2 === n2;
    }, ny.prototype.clone = function() {
      if (this.L.N || nd(this), this.L.$)
        return this.L.count.value += 1, this;
      var n2 = no2, t2 = Object, r2 = t2.create, e2 = Object.getPrototypeOf(this), a2 = this.L;
      return n2 = n2(r2.call(t2, e2, { L: { value: { count: a2.count, Z: a2.Z, $: a2.$, N: a2.N, O: a2.O, S: a2.S, T: a2.T } } })), n2.L.count.value += 1, n2.L.Z = false, n2;
    }, ny.prototype.delete = function() {
      this.L.N || nd(this), this.L.Z && !this.L.$ && V("Object already scheduled for deletion"), Q(this), nt(this.L), this.L.$ || (this.L.S = void 0, this.L.N = void 0);
    }, ny.prototype.isDeleted = function() {
      return !this.L.N;
    }, ny.prototype.deleteLater = function() {
      return this.L.N || nd(this), this.L.Z && !this.L.$ && V("Object already scheduled for deletion"), H.push(this), H.length === 1 && z2 && z2(x), this.L.Z = true, this;
    }, nA.prototype.pa = function(n2) {
      return this.ja && (n2 = this.ja(n2)), n2;
    }, nA.prototype.ga = function(n2) {
      this.V && this.V(n2);
    }, nA.prototype.argPackAdvance = 8, nA.prototype.readValueFromPointer = nc, nA.prototype.deleteObject = function(n2) {
      n2 !== null && n2.delete();
    }, nA.prototype.fromWireType = function(n2) {
      function t2() {
        return this.ca ? ni(this.M.W, { O: this.va, N: e2, T: this, S: n2 }) : ni(this.M.W, { O: this, N: n2 });
      }
      var r2, e2 = this.pa(n2);
      if (!e2)
        return this.ga(n2), null;
      var a2 = $[Z(this.M, e2)];
      if (a2 !== void 0)
        return a2.L.count.value === 0 ? (a2.L.N = e2, a2.L.S = n2, a2.clone()) : (a2 = a2.clone(), this.ga(n2), a2);
      if (!(a2 = nr[a2 = this.M.oa(e2)]))
        return t2.call(this);
      a2 = this.ba ? a2.ka : a2.pointerType;
      var i2 = function n3(t3, r3, e3) {
        return r3 === e3 ? t3 : e3.P === void 0 ? null : (t3 = n3(t3, r3, e3.P)) === null ? null : e3.ma(t3);
      }(e2, this.M, a2.M);
      return i2 === null ? t2.call(this) : this.ca ? ni(a2.M.W, { O: a2, N: i2, T: this, S: n2 }) : ni(a2.M.W, { O: a2, N: i2 });
    }, nN = u.UnboundTypeError = D("UnboundTypeError");
    var nx = { q: function(n2, t2, r2) {
      n2 = B(n2), t2 = K(t2, "wrapper"), r2 = j(r2);
      var e2 = [].slice, a2 = t2.M, i2 = a2.W, o2 = a2.P.W, s2 = a2.P.constructor;
      for (var u2 in n2 = U(n2, function() {
        a2.P.ia.forEach(function(n3) {
          if (this[n3] === o2[n3])
            throw new Y("Pure virtual function " + n3 + " must be implemented in JavaScript");
        }.bind(this)), Object.defineProperty(this, "__parent", { value: i2 }), this.__construct.apply(this, e2.call(arguments));
      }), i2.__construct = function() {
        this === i2 && V("Pass correct 'this' to __construct");
        var n3 = s2.implement.apply(void 0, [this].concat(e2.call(arguments)));
        Q(n3);
        var t3 = n3.L;
        n3.notifyOnDestruction(), t3.$ = true, Object.defineProperties(this, { L: { value: t3 } }), no2(this), n3 = Z(a2, n3 = t3.N), $.hasOwnProperty(n3) ? V("Tried to register registered instance: " + n3) : $[n3] = this;
      }, i2.__destruct = function() {
        this === i2 && V("Pass correct 'this' to __destruct"), Q(this);
        var n3 = this.L.N;
        n3 = Z(a2, n3), $.hasOwnProperty(n3) ? delete $[n3] : V("Tried to unregister unregistered instance: " + n3);
      }, n2.prototype = Object.create(i2), r2)
        n2.prototype[u2] = r2[u2];
      return G(n2);
    }, l: function(n2) {
      var t2 = ns[n2];
      delete ns[n2];
      var r2 = t2.ea, e2 = t2.V, a2 = t2.ha;
      nh([n2], a2.map((n3) => n3.sa).concat(a2.map((n3) => n3.ya)), (n3) => {
        var i2 = {};
        return a2.forEach((t3, r3) => {
          var e3 = n3[r3], o2 = t3.qa, s2 = t3.ra, u2 = n3[r3 + a2.length], c2 = t3.xa, f2 = t3.za;
          i2[t3.na] = { read: (n4) => e3.fromWireType(o2(s2, n4)), write: (n4, t4) => {
            var r4 = [];
            c2(f2, n4, u2.toWireType(r4, t4)), nu2(r4);
          } };
        }), [{ name: t2.name, fromWireType: function(n4) {
          var t3, r3 = {};
          for (t3 in i2)
            r3[t3] = i2[t3].read(n4);
          return e2(n4), r3;
        }, toWireType: function(n4, t3) {
          for (var a3 in i2)
            if (!(a3 in t3))
              throw TypeError('Missing field:  "' + a3 + '"');
          var o2 = r2();
          for (a3 in i2)
            i2[a3].write(o2, t3[a3]);
          return n4 !== null && n4.push(e2, o2), o2;
        }, argPackAdvance: 8, readValueFromPointer: nc, U: e2 }];
      });
    }, v: function() {
    }, B: function(n2, t2, r2, e2, a2) {
      var i2 = np(r2);
      nv(n2, { name: t2 = B(t2), fromWireType: function(n3) {
        return !!n3;
      }, toWireType: function(n3, t3) {
        return t3 ? e2 : a2;
      }, argPackAdvance: 8, readValueFromPointer: function(n3) {
        if (r2 === 1)
          var e3 = d;
        else if (r2 === 2)
          e3 = m;
        else if (r2 === 4)
          e3 = g2;
        else
          throw TypeError("Unknown boolean type size: " + t2);
        return this.fromWireType(e3[n3 >> i2]);
      }, U: null });
    }, h: function(n2, t2, r2, e2, a2, i2, o2, s2, c2, f2, l2, h2, p2) {
      l2 = B(l2), i2 = nb(a2, i2), s2 && (s2 = nb(o2, s2)), f2 && (f2 = nb(c2, f2)), p2 = nb(h2, p2);
      var v2, d2 = W2(l2);
      v2 = function() {
        nI("Cannot construct " + l2 + " due to unbound types", [e2]);
      }, u.hasOwnProperty(d2) ? (V("Cannot register public name '" + d2 + "' twice"), nm(u, d2, d2), u.hasOwnProperty(void 0) && V("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"), u[d2].R[void 0] = v2) : u[d2] = v2, nh([n2, t2, r2], e2 ? [e2] : [], function(t3) {
        if (t3 = t3[0], e2)
          var r3, a3 = t3.M, o3 = a3.W;
        else
          o3 = ny.prototype;
        t3 = U(d2, function() {
          if (Object.getPrototypeOf(this) !== c3)
            throw new k("Use 'new' to construct " + l2);
          if (h3.X === void 0)
            throw new k(l2 + " has no accessible constructor");
          var n3 = h3.X[arguments.length];
          if (n3 === void 0)
            throw new k("Tried to invoke ctor of " + l2 + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(h3.X).toString() + ") parameters instead!");
          return n3.apply(this, arguments);
        });
        var c3 = Object.create(o3, { constructor: { value: t3 } });
        t3.prototype = c3;
        var h3 = new nE(l2, t3, c3, p2, a3, i2, s2, f2);
        a3 = new nA(l2, h3, true, false), o3 = new nA(l2 + "*", h3, false, false);
        var v3 = new nA(l2 + " const*", h3, false, true);
        return nr[n2] = { pointerType: o3, ka: v3 }, r3 = t3, u.hasOwnProperty(d2) || na("Replacing nonexistant public symbol"), u[d2] = r3, u[d2].Y = void 0, [a3, o3, v3];
      });
    }, d: function(n2, t2, r2, e2, a2, i2, o2) {
      var s2 = nS(r2, e2);
      t2 = B(t2), i2 = nb(a2, i2), nh([], [n2], function(n3) {
        function e3() {
          nI("Cannot call " + a3 + " due to unbound types", s2);
        }
        var a3 = (n3 = n3[0]).name + "." + t2;
        t2.startsWith("@@") && (t2 = Symbol[t2.substring(2)]);
        var u2 = n3.M.constructor;
        return u2[t2] === void 0 ? (e3.Y = r2 - 1, u2[t2] = e3) : (nm(u2, t2, a3), u2[t2].R[r2 - 1] = e3), nh([], s2, function(n4) {
          return n4 = nw(a3, [n4[0], null].concat(n4.slice(1)), null, i2, o2), u2[t2].R === void 0 ? (n4.Y = r2 - 1, u2[t2] = n4) : u2[t2].R[r2 - 1] = n4, [];
        }), [];
      });
    }, p: function(n2, t2, r2, e2, a2, i2) {
      0 < t2 || w();
      var o2 = nS(t2, r2);
      a2 = nb(e2, a2), nh([], [n2], function(n3) {
        var r3 = "constructor " + (n3 = n3[0]).name;
        if (n3.M.X === void 0 && (n3.M.X = []), n3.M.X[t2 - 1] !== void 0)
          throw new k("Cannot register multiple constructors with identical number of parameters (" + (t2 - 1) + ") for class '" + n3.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
        return n3.M.X[t2 - 1] = () => {
          nI("Cannot construct " + n3.name + " due to unbound types", o2);
        }, nh([], o2, function(e3) {
          return e3.splice(1, 0, null), n3.M.X[t2 - 1] = nw(r3, e3, null, a2, i2), [];
        }), [];
      });
    }, a: function(n2, t2, r2, e2, a2, i2, o2, s2) {
      var u2 = nS(r2, e2);
      t2 = B(t2), i2 = nb(a2, i2), nh([], [n2], function(n3) {
        function e3() {
          nI("Cannot call " + a3 + " due to unbound types", u2);
        }
        var a3 = (n3 = n3[0]).name + "." + t2;
        t2.startsWith("@@") && (t2 = Symbol[t2.substring(2)]), s2 && n3.M.ia.push(t2);
        var c2 = n3.M.W, f2 = c2[t2];
        return f2 === void 0 || f2.R === void 0 && f2.className !== n3.name && f2.Y === r2 - 2 ? (e3.Y = r2 - 2, e3.className = n3.name, c2[t2] = e3) : (nm(c2, t2, a3), c2[t2].R[r2 - 2] = e3), nh([], u2, function(e4) {
          return e4 = nw(a3, e4, n3, i2, o2), c2[t2].R === void 0 ? (e4.Y = r2 - 2, c2[t2] = e4) : c2[t2].R[r2 - 2] = e4, [];
        }), [];
      });
    }, A: function(n2, t2) {
      nv(n2, { name: t2 = B(t2), fromWireType: function(n3) {
        var t3 = j(n3);
        return nR(n3), t3;
      }, toWireType: function(n3, t3) {
        return G(t3);
      }, argPackAdvance: 8, readValueFromPointer: nc, U: null });
    }, n: function(n2, t2, r2) {
      r2 = np(r2), nv(n2, { name: t2 = B(t2), fromWireType: function(n3) {
        return n3;
      }, toWireType: function(n3, t3) {
        return t3;
      }, argPackAdvance: 8, readValueFromPointer: function(n3, t3) {
        switch (t3) {
          case 2:
            return function(n4) {
              return this.fromWireType(T2[n4 >> 2]);
            };
          case 3:
            return function(n4) {
              return this.fromWireType(L[n4 >> 3]);
            };
          default:
            throw TypeError("Unknown float type: " + n3);
        }
      }(t2, r2), U: null });
    }, e: function(n2, t2, r2, e2, a2) {
      t2 = B(t2), a2 === -1 && (a2 = 4294967295), a2 = np(r2);
      var i2 = (n3) => n3;
      if (e2 === 0) {
        var o2 = 32 - 8 * r2;
        i2 = (n3) => n3 << o2 >>> o2;
      }
      r2 = t2.includes("unsigned") ? function(n3, t3) {
        return t3 >>> 0;
      } : function(n3, t3) {
        return t3;
      }, nv(n2, { name: t2, fromWireType: i2, toWireType: r2, argPackAdvance: 8, readValueFromPointer: function(n3, t3, r3) {
        switch (t3) {
          case 0:
            return r3 ? function(n4) {
              return d[n4];
            } : function(n4) {
              return y[n4];
            };
          case 1:
            return r3 ? function(n4) {
              return m[n4 >> 1];
            } : function(n4) {
              return E[n4 >> 1];
            };
          case 2:
            return r3 ? function(n4) {
              return g2[n4 >> 2];
            } : function(n4) {
              return _[n4 >> 2];
            };
          default:
            throw TypeError("Unknown integer type: " + n3);
        }
      }(t2, a2, e2 !== 0), U: null });
    }, b: function(n2, t2, r2) {
      function e2(n3) {
        n3 >>= 2;
        var t3 = _;
        return new a2(t3.buffer, t3[n3 + 1], t3[n3]);
      }
      var a2 = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][t2];
      nv(n2, { name: r2 = B(r2), fromWireType: e2, argPackAdvance: 8, readValueFromPointer: e2 }, { ta: true });
    }, o: function(n2, t2) {
      var r2 = (t2 = B(t2)) === "std::string";
      nv(n2, { name: t2, fromWireType: function(n3) {
        var t3 = _[n3 >> 2], e2 = n3 + 4;
        if (r2)
          for (var a2 = e2, i2 = 0; i2 <= t3; ++i2) {
            var o2 = e2 + i2;
            if (i2 == t3 || y[o2] == 0) {
              if (a2 = a2 ? p(y, a2, o2 - a2) : "", s2 === void 0)
                var s2 = a2;
              else
                s2 += "\0" + a2;
              a2 = o2 + 1;
            }
          }
        else {
          for (i2 = 0, s2 = Array(t3); i2 < t3; ++i2)
            s2[i2] = String.fromCharCode(y[e2 + i2]);
          s2 = s2.join("");
        }
        return nZ(n3), s2;
      }, toWireType: function(n3, t3) {
        t3 instanceof ArrayBuffer && (t3 = new Uint8Array(t3));
        var e2, a2 = typeof t3 == "string";
        if (a2 || t3 instanceof Uint8Array || t3 instanceof Uint8ClampedArray || t3 instanceof Int8Array || V("Cannot pass non-string to std::string"), r2 && a2) {
          var i2 = 0;
          for (e2 = 0; e2 < t3.length; ++e2) {
            var o2 = t3.charCodeAt(e2);
            127 >= o2 ? i2++ : 2047 >= o2 ? i2 += 2 : 55296 <= o2 && 57343 >= o2 ? (i2 += 4, ++e2) : i2 += 3;
          }
          e2 = i2;
        } else
          e2 = t3.length;
        if (o2 = (i2 = n$(4 + e2 + 1)) + 4, _[i2 >> 2] = e2, r2 && a2) {
          if (a2 = o2, o2 = e2 + 1, e2 = y, 0 < o2) {
            o2 = a2 + o2 - 1;
            for (var s2 = 0; s2 < t3.length; ++s2) {
              var u2 = t3.charCodeAt(s2);
              if (55296 <= u2 && 57343 >= u2 && (u2 = 65536 + ((1023 & u2) << 10) | 1023 & t3.charCodeAt(++s2)), 127 >= u2) {
                if (a2 >= o2)
                  break;
                e2[a2++] = u2;
              } else {
                if (2047 >= u2) {
                  if (a2 + 1 >= o2)
                    break;
                  e2[a2++] = 192 | u2 >> 6;
                } else {
                  if (65535 >= u2) {
                    if (a2 + 2 >= o2)
                      break;
                    e2[a2++] = 224 | u2 >> 12;
                  } else {
                    if (a2 + 3 >= o2)
                      break;
                    e2[a2++] = 240 | u2 >> 18, e2[a2++] = 128 | u2 >> 12 & 63;
                  }
                  e2[a2++] = 128 | u2 >> 6 & 63;
                }
                e2[a2++] = 128 | 63 & u2;
              }
            }
            e2[a2] = 0;
          }
        } else if (a2)
          for (a2 = 0; a2 < e2; ++a2)
            255 < (s2 = t3.charCodeAt(a2)) && (nZ(o2), V("String has UTF-16 code units that do not fit in 8 bits")), y[o2 + a2] = s2;
        else
          for (a2 = 0; a2 < e2; ++a2)
            y[o2 + a2] = t3[a2];
        return n3 !== null && n3.push(nZ, i2), i2;
      }, argPackAdvance: 8, readValueFromPointer: nc, U: function(n3) {
        nZ(n3);
      } });
    }, k: function(n2, t2, r2) {
      if (r2 = B(r2), t2 === 2)
        var e2 = nW, a2 = nU, i2 = nM, o2 = () => E, s2 = 1;
      else
        t2 === 4 && (e2 = nF, a2 = nD, i2 = nk, o2 = () => _, s2 = 2);
      nv(n2, { name: r2, fromWireType: function(n3) {
        for (var r3, a3 = _[n3 >> 2], i3 = o2(), u2 = n3 + 4, c2 = 0; c2 <= a3; ++c2) {
          var f2 = n3 + 4 + c2 * t2;
          (c2 == a3 || i3[f2 >> s2] == 0) && (u2 = e2(u2, f2 - u2), r3 === void 0 ? r3 = u2 : r3 += "\0" + u2, u2 = f2 + t2);
        }
        return nZ(n3), r3;
      }, toWireType: function(n3, e3) {
        typeof e3 != "string" && V("Cannot pass non-string to C++ string type " + r2);
        var o3 = i2(e3), u2 = n$(4 + o3 + t2);
        return _[u2 >> 2] = o3 >> s2, a2(e3, u2 + 4, o3 + t2), n3 !== null && n3.push(nZ, u2), u2;
      }, argPackAdvance: 8, readValueFromPointer: nc, U: function(n3) {
        nZ(n3);
      } });
    }, m: function(n2, t2, r2, e2, a2, i2) {
      ns[n2] = { name: B(t2), ea: nb(r2, e2), V: nb(a2, i2), ha: [] };
    }, c: function(n2, t2, r2, e2, a2, i2, o2, s2, u2, c2) {
      ns[n2].ha.push({ na: B(t2), sa: r2, qa: nb(e2, a2), ra: i2, ya: o2, xa: nb(s2, u2), za: c2 });
    }, C: function(n2, t2) {
      nv(n2, { ua: true, name: t2 = B(t2), argPackAdvance: 0, fromWireType: function() {
      }, toWireType: function() {
      } });
    }, t: function(n2, t2, r2, e2, a2) {
      n2 = nG[n2], t2 = j(t2), r2 = nj(r2);
      var i2 = [];
      return _[e2 >> 2] = G(i2), n2(t2, r2, i2, a2);
    }, j: function(n2, t2, r2, e2) {
      n2 = nG[n2], n2(t2 = j(t2), r2 = nj(r2), null, e2);
    }, f: nR, g: function(n2, t2) {
      var r2, e2, a2 = function(n3, t3) {
        for (var r3 = Array(n3), e3 = 0; e3 < n3; ++e3)
          r3[e3] = K(_[t3 + 4 * e3 >> 2], "parameter " + e3);
        return r3;
      }(n2, t2), i2 = a2[0], o2 = nY[t2 = i2.name + "_$" + a2.slice(1).map(function(n3) {
        return n3.name;
      }).join("_") + "$"];
      if (o2 !== void 0)
        return o2;
      var s2 = Array(n2 - 1);
      return r2 = (t3, r3, e3, o3) => {
        for (var u2 = 0, c2 = 0; c2 < n2 - 1; ++c2)
          s2[c2] = a2[c2 + 1].readValueFromPointer(o3 + u2), u2 += a2[c2 + 1].argPackAdvance;
        for (c2 = 0, t3 = t3[r3].apply(t3, s2); c2 < n2 - 1; ++c2)
          a2[c2 + 1].la && a2[c2 + 1].la(s2[c2]);
        if (!i2.ua)
          return i2.toWireType(e3, t3);
      }, e2 = nG.length, nG.push(r2), o2 = e2, nY[t2] = o2;
    }, r: function(n2) {
      4 < n2 && (M[n2].fa += 1);
    }, s: function(n2) {
      nu2(j(n2)), nR(n2);
    }, i: function() {
      w("");
    }, x: function(n2, t2, r2) {
      y.copyWithin(n2, t2, t2 + r2);
    }, w: function(n2) {
      var t2 = y.length;
      if (2147483648 < (n2 >>>= 0))
        return false;
      for (var r2 = 1; 4 >= r2; r2 *= 2) {
        var e2 = t2 * (1 + 0.2 / r2);
        e2 = Math.min(e2, n2 + 100663296);
        var a2 = Math, i2 = a2.min;
        e2 = Math.max(n2, e2), e2 += (65536 - e2 % 65536) % 65536;
        n: {
          var o2 = l.buffer;
          try {
            l.grow(i2.call(a2, 2147483648, e2) - o2.byteLength + 65535 >>> 16), v();
            var s2 = 1;
            break n;
          } catch (n3) {
          }
          s2 = void 0;
        }
        if (s2)
          return true;
      }
      return false;
    }, z: function() {
      return 52;
    }, u: function() {
      return 70;
    }, y: function(n2, t2, r2, e2) {
      for (var a2 = 0, i2 = 0; i2 < r2; i2++) {
        var u2 = _[t2 >> 2], c2 = _[t2 + 4 >> 2];
        t2 += 8;
        for (var f2 = 0; f2 < c2; f2++) {
          var l2 = y[u2 + f2], h2 = nX[n2];
          l2 === 0 || l2 === 10 ? ((n2 === 1 ? o : s)(p(h2, 0)), h2.length = 0) : h2.push(l2);
        }
        a2 += c2;
      }
      return _[e2 >> 2] = a2, 0;
    } };
    !function() {
      function n2(n3) {
        u.asm = n3.exports, l = u.asm.D, v(), A = u.asm.I, P.unshift(u.asm.E), --N == 0 && I && (n3 = I, I = null, n3());
      }
      function t2(t3) {
        n2(t3.instance);
      }
      function e2(n3) {
        return (typeof fetch == "function" ? fetch(r, { credentials: "same-origin" }).then(function(n4) {
          if (!n4.ok)
            throw "failed to load wasm binary file at '" + r + "'";
          return n4.arrayBuffer();
        }).catch(function() {
          return R();
        }) : Promise.resolve().then(function() {
          return R();
        })).then(function(n4) {
          return WebAssembly.instantiate(n4, a2);
        }).then(function(n4) {
          return n4;
        }).then(n3, function(n4) {
          s("failed to asynchronously prepare wasm: " + n4), w(n4);
        });
      }
      var a2 = { a: nx };
      if (N++, u.instantiateWasm)
        try {
          return u.instantiateWasm(a2, n2);
        } catch (n3) {
          s("Module.instantiateWasm callback failed with error: " + n3), f(n3);
        }
      (typeof WebAssembly.instantiateStreaming != "function" || S2() || typeof fetch != "function" ? e2(t2) : fetch(r, { credentials: "same-origin" }).then(function(n3) {
        return WebAssembly.instantiateStreaming(n3, a2).then(t2, function(n4) {
          return s("wasm streaming compile failed: " + n4), s("falling back to ArrayBuffer instantiation"), e2(t2);
        });
      })).catch(f);
    }();
    var nz = u.___getTypeName = function() {
      return (nz = u.___getTypeName = u.asm.F).apply(null, arguments);
    };
    function n$() {
      return (n$ = u.asm.H).apply(null, arguments);
    }
    function nZ() {
      return (nZ = u.asm.J).apply(null, arguments);
    }
    function nJ() {
      0 < N || (C(O), 0 < N || e || (e = true, u.calledRun = true, h || (C(P), c(u), C(b))));
    }
    return u.__embind_initialize_bindings = function() {
      return (u.__embind_initialize_bindings = u.asm.G).apply(null, arguments);
    }, u.dynCall_jiji = function() {
      return (u.dynCall_jiji = u.asm.K).apply(null, arguments);
    }, I = function n2() {
      e || nJ(), e || (I = n2);
    }, nJ(), t.ready;
  };
})();
async function initYoga(t) {
  let r = await yoga({ instantiateWasm(n, r2) {
    WebAssembly.instantiate(t, n).then((n2) => {
      n2 instanceof WebAssembly.Instance ? r2(n2) : r2(n2.instance);
    });
  } });
  return wrapAsm(r);
}

// node_modules/.pnpm/@resvg+resvg-wasm@2.4.0/node_modules/@resvg/resvg-wasm/index.mjs
var resvg_wasm_exports = {};
__export(resvg_wasm_exports, {
  Resvg: () => Resvg2,
  initWasm: () => initWasm
});
var wasm;
var heap = new Array(128).fill(void 0);
heap.push(void 0, null, true, false);
var heap_next = heap.length;
function addHeapObject(obj) {
  if (heap_next === heap.length)
    heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function getObject(idx) {
  return heap[idx];
}
function dropObject(idx) {
  if (idx < 132)
    return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
var WASM_VECTOR_LEN = 0;
var cachedUint8Memory0 = null;
function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}
var cachedTextEncoder = new TextEncoder("utf-8");
var encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
} : function(arg, view) {
  const buf = cachedTextEncoder.encode(arg);
  view.set(buf);
  return {
    read: arg.length,
    written: buf.length
  };
};
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length);
    getUint8Memory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len);
  const mem = getUint8Memory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3);
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
var cachedInt32Memory0 = null;
function getInt32Memory0() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}
var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
  return instance.ptr;
}
var BBox = class {
  static __wrap(ptr) {
    const obj = Object.create(BBox.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_bbox_free(ptr);
  }
  get x() {
    const ret = wasm.__wbg_get_bbox_x(this.ptr);
    return ret;
  }
  set x(arg0) {
    wasm.__wbg_set_bbox_x(this.ptr, arg0);
  }
  get y() {
    const ret = wasm.__wbg_get_bbox_y(this.ptr);
    return ret;
  }
  set y(arg0) {
    wasm.__wbg_set_bbox_y(this.ptr, arg0);
  }
  get width() {
    const ret = wasm.__wbg_get_bbox_width(this.ptr);
    return ret;
  }
  set width(arg0) {
    wasm.__wbg_set_bbox_width(this.ptr, arg0);
  }
  get height() {
    const ret = wasm.__wbg_get_bbox_height(this.ptr);
    return ret;
  }
  set height(arg0) {
    wasm.__wbg_set_bbox_height(this.ptr, arg0);
  }
};
var RenderedImage = class {
  static __wrap(ptr) {
    const obj = Object.create(RenderedImage.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_renderedimage_free(ptr);
  }
  get width() {
    const ret = wasm.renderedimage_width(this.ptr);
    return ret >>> 0;
  }
  get height() {
    const ret = wasm.renderedimage_height(this.ptr);
    return ret >>> 0;
  }
  asPng() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.renderedimage_asPng(retptr, this.ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  get pixels() {
    const ret = wasm.renderedimage_pixels(this.ptr);
    return takeObject(ret);
  }
};
var Resvg = class {
  static __wrap(ptr) {
    const obj = Object.create(Resvg.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_resvg_free(ptr);
  }
  constructor(svg, options) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      var ptr0 = isLikeNone(options) ? 0 : passStringToWasm0(options, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      wasm.resvg_new(retptr, addHeapObject(svg), ptr0, len0);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return Resvg.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  get width() {
    const ret = wasm.resvg_width(this.ptr);
    return ret;
  }
  get height() {
    const ret = wasm.resvg_height(this.ptr);
    return ret;
  }
  render() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.resvg_render(retptr, this.ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return RenderedImage.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  toString() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.resvg_toString(retptr, this.ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_free(r0, r1);
    }
  }
  innerBBox() {
    const ret = wasm.resvg_innerBBox(this.ptr);
    return ret === 0 ? void 0 : BBox.__wrap(ret);
  }
  getBBox() {
    const ret = wasm.resvg_getBBox(this.ptr);
    return ret === 0 ? void 0 : BBox.__wrap(ret);
  }
  cropByBBox(bbox) {
    _assertClass(bbox, BBox);
    wasm.resvg_cropByBBox(this.ptr, bbox.ptr);
  }
  imagesToResolve() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.resvg_imagesToResolve(retptr, this.ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  resolveImage(href, buffer) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(href, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      wasm.resvg_resolveImage(retptr, this.ptr, ptr0, len0, addHeapObject(buffer));
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
};
async function load2(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function getImports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_new_15d3966e9981a196 = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_buffer_cf65c07de34b9a08 = function(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_9fb2f11355ecadf5 = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbg_new_537b7341ce90bb31 = function(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_instanceof_Uint8Array_01cebe79ca606cca = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Uint8Array;
    } catch (e) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };
  imports.wbg.__wbg_new_b525de17f44a8943 = function() {
    const ret = new Array();
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_push_49c286f04dd3bf59 = function(arg0, arg1) {
    const ret = getObject(arg0).push(getObject(arg1));
    return ret;
  };
  imports.wbg.__wbg_length_27a2afe8ab42b09f = function(arg0) {
    const ret = getObject(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_set_17499e8aa4003ebd = function(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  return imports;
}
function initMemory(imports, maybe_memory) {
}
function finalizeInit(instance, module) {
  wasm = instance.exports;
  init.__wbindgen_wasm_module = module;
  cachedInt32Memory0 = null;
  cachedUint8Memory0 = null;
  return wasm;
}
async function init(input) {
  if (typeof input === "undefined") {
    input = new URL("index_bg.wasm", void 0);
  }
  const imports = getImports();
  if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
    input = fetch(input);
  }
  initMemory(imports);
  const { instance, module } = await load2(await input, imports);
  return finalizeInit(instance, module);
}
var dist_default = init;
var initialized = false;
var initWasm = async (module_or_path) => {
  if (initialized) {
    throw new Error("Already initialized. The `initWasm()` function can be used only once.");
  }
  await dist_default(await module_or_path);
  initialized = true;
};
var Resvg2 = class extends Resvg {
  constructor(svg, options) {
    if (!initialized)
      throw new Error("Wasm has not been initialized. Call `initWasm()` function.");
    super(svg, JSON.stringify(options));
  }
};

// src/index.edge.ts
import resvg_wasm from "./resvg.wasm?module";
import yoga_wasm from "./yoga.wasm?module";

// src/emoji/index.ts
var U200D = String.fromCharCode(8205);
var UFE0Fg = /\uFE0F/g;
function getIconCode(char) {
  return toCodePoint(char.indexOf(U200D) < 0 ? char.replace(UFE0Fg, "") : char);
}
function toCodePoint(unicodeSurrogates) {
  var r = [], c = 0, p = 0, i = 0;
  while (i < unicodeSurrogates.length) {
    c = unicodeSurrogates.charCodeAt(i++);
    if (p) {
      r.push((65536 + (p - 55296 << 10) + (c - 56320)).toString(16));
      p = 0;
    } else if (55296 <= c && c <= 56319) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join("-");
}
var apis = {
  twemoji: (code) => "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/" + code.toLowerCase() + ".svg",
  openmoji: "https://cdn.jsdelivr.net/npm/@svgmoji/openmoji@2.0.0/svg/",
  blobmoji: "https://cdn.jsdelivr.net/npm/@svgmoji/blob@2.0.0/svg/",
  noto: "https://cdn.jsdelivr.net/gh/svgmoji/svgmoji/packages/svgmoji__noto/svg/",
  fluent: (code) => "https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/" + code.toLowerCase() + "_color.svg",
  fluentFlat: (code) => "https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/" + code.toLowerCase() + "_flat.svg"
};
function loadEmoji(code, type) {
  if (!type || !apis[type]) {
    type = "twemoji";
  }
  const api = apis[type];
  if (typeof api === "function") {
    return fetch(api(code));
  }
  return fetch(`${api}${code.toUpperCase()}.svg`);
}

// src/language/index.ts
var FontDetector = class {
  constructor() {
    this.rangesByLang = {};
  }
  async detect(text, fonts) {
    await this.load(fonts);
    const result = {};
    for (const segment of text) {
      const lang = this.detectSegment(segment, fonts);
      if (lang) {
        result[lang] = result[lang] || "";
        result[lang] += segment;
      }
    }
    return result;
  }
  detectSegment(segment, fonts) {
    for (const font of fonts) {
      const range = this.rangesByLang[font];
      if (range && checkSegmentInRange(segment, range)) {
        return font;
      }
    }
    return null;
  }
  async load(fonts) {
    let params = "";
    const existingLang = Object.keys(this.rangesByLang);
    const langNeedsToLoad = fonts.filter((font) => !existingLang.includes(font));
    if (langNeedsToLoad.length === 0) {
      return;
    }
    for (const font of langNeedsToLoad) {
      params += `family=${font}&`;
    }
    params += "display=swap";
    const API = `https://fonts.googleapis.com/css2?${params}`;
    const fontFace = await (await fetch(API, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"
      }
    })).text();
    this.addDetectors(fontFace);
  }
  addDetectors(input) {
    const regex = /font-family:\s*'(.+?)';.+?unicode-range:\s*(.+?);/gms;
    const matches = input.matchAll(regex);
    for (const [, _lang, range] of matches) {
      const lang = _lang.replaceAll(" ", "+");
      if (!this.rangesByLang[lang]) {
        this.rangesByLang[lang] = [];
      }
      this.rangesByLang[lang].push(...convert(range));
    }
  }
};
function convert(input) {
  return input.split(", ").map((range) => {
    range = range.replaceAll("U+", "");
    const [start, end] = range.split("-").map((hex) => parseInt(hex, 16));
    if (isNaN(end)) {
      return start;
    }
    return [start, end];
  });
}
function checkSegmentInRange(segment, range) {
  const codePoint = segment.codePointAt(0);
  if (!codePoint)
    return false;
  return range.some((val) => {
    if (typeof val === "number") {
      return codePoint === val;
    } else {
      const [start, end] = val;
      return start <= codePoint && codePoint <= end;
    }
  });
}
var languageFontMap = {
  "ja-JP": "Noto+Sans+JP",
  "ko-KR": "Noto+Sans+KR",
  "zh-CN": "Noto+Sans+SC",
  "zh-TW": "Noto+Sans+TC",
  "zh-HK": "Noto+Sans+HK",
  "th-TH": "Noto+Sans+Thai",
  "bn-IN": "Noto+Sans+Bengali",
  "ar-AR": "Noto+Sans+Arabic",
  "ta-IN": "Noto+Sans+Tamil",
  "ml-IN": "Noto+Sans+Malayalam",
  "he-IL": "Noto+Sans+Hebrew",
  "te-IN": "Noto+Sans+Telugu",
  devanagari: "Noto+Sans+Devanagari",
  kannada: "Noto+Sans+Kannada",
  symbol: ["Noto+Sans+Symbols", "Noto+Sans+Symbols+2"],
  math: "Noto+Sans+Math",
  unknown: "Noto+Sans"
};

// src/og.ts
async function loadGoogleFont(font, text) {
  if (!font || !text)
    return;
  const API = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(API, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1"
    }
  })).text();
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);
  if (!resource)
    throw new Error("Failed to download dynamic font");
  const res = await fetch(resource[1]);
  if (!res.ok) {
    throw new Error("Failed to download dynamic font. Status: " + res.status);
  }
  return res.arrayBuffer();
}
var detector = new FontDetector();
var assetCache = /* @__PURE__ */ new Map();
var loadDynamicAsset = ({ emoji }) => {
  const fn = async (code, text) => {
    if (code === "emoji") {
      return `data:image/svg+xml;base64,` + btoa(await (await loadEmoji(getIconCode(text), emoji)).text());
    }
    const codes = code.split("|");
    const names = codes.map((code2) => languageFontMap[code2]).filter(Boolean).flat();
    if (names.length === 0)
      return [];
    try {
      const textByFont = await detector.detect(text, names);
      const fonts = Object.keys(textByFont);
      const fontData = await Promise.all(fonts.map((font) => loadGoogleFont(font, textByFont[font])));
      return fontData.map((data, index) => ({
        name: `satori_${codes[index]}_fallback_${text}`,
        data,
        weight: 400,
        style: "normal",
        lang: codes[index] === "unknown" ? void 0 : codes[index]
      }));
    } catch (e) {
      console.error("Failed to load dynamic font for", text, ". Error:", e);
    }
  };
  return async (...args) => {
    const key = JSON.stringify(args);
    const cache = assetCache.get(key);
    if (cache)
      return cache;
    const asset = await fn(...args);
    assetCache.set(key, asset);
    return asset;
  };
};
async function render(satori, resvg, opts, defaultFonts, element) {
  const options = Object.assign({
    width: 1200,
    height: 630,
    debug: false
  }, opts);
  const svg = await satori(element, {
    width: options.width,
    height: options.height,
    debug: options.debug,
    fonts: options.fonts || defaultFonts,
    loadAdditionalAsset: loadDynamicAsset({
      emoji: options.emoji
    })
  });
  const resvgJS = new resvg.Resvg(svg, {
    fitTo: {
      mode: "width",
      value: options.width
    }
  });
  return resvgJS.render().asPng();
}

// src/figma/index.tsx
var FigmaImageResponse = async ({
  url,
  template,
  fonts,
  imageResponseOptions,
  Response: Response2
}) => {
  const { fileId, nodeId } = parseFigmaUrl(url);
  const figmaAPIToken = assertValue(process.env.FIGMA_PERSONAL_ACCESS_TOKEN, "Missing environment variable: `FIGMA_PERSONAL_ACCESS_TOKEN`. You can get one at https://www.figma.com/developers/api#authentication");
  const figmaResponse = await fetch(`https://api.figma.com/v1/images/${fileId}?ids=${nodeId}&svg_outline_text=false&format=svg&svg_include_id=true`, {
    method: "GET",
    headers: {
      "X-FIGMA-TOKEN": figmaAPIToken
    },
    cache: "no-store"
  });
  const figmaResponseJson = await figmaResponse.json();
  const svgDownloadPath = figmaResponseJson.images[nodeId.replace("-", ":")];
  const svgResponse = await fetch(svgDownloadPath, { cache: "no-store" });
  const svg = await svgResponse.text();
  const { width, height } = getSvgDimensions(svg);
  const textNodes = getTextNodes(svg);
  const textNodeAttributes = textNodes.map(parseSvgText);
  return new Response2({
    key: "0",
    type: "div",
    props: {
      style: { display: "flex" },
      children: [
        {
          type: "img",
          props: {
            style: { position: "absolute" },
            alt: "",
            width,
            height,
            src: svgToBase64(svg)
          }
        },
        {
          type: "div",
          props: {
            style: { display: "flex", position: "relative", width: "100%" },
            children: textNodeAttributes.map((textNode) => {
              const t = template[textNode.id];
              let value = "";
              if (t === void 0) {
                value = textNode.content;
              } else if (isComplexTemplate(t)) {
                value = t.value;
              } else {
                value = t;
              }
              let cssProps = {};
              let centerHorizontally = false;
              if (isComplexTemplate(t) && t.props) {
                const {
                  centerHorizontally: centerHorizontallyProp,
                  ...otherCSSProps
                } = t.props;
                cssProps = otherCSSProps;
                centerHorizontally = centerHorizontallyProp || false;
              }
              if (centerHorizontally) {
                const templateStyles = {
                  color: textNode.fill,
                  marginTop: `${parseInt(textNode.y) - parseInt(textNode.fontSize)}px`,
                  fontWeight: textNode.fontWeight || "400",
                  fontSize: textNode.fontSize,
                  fontFamily: textNode.fontFamily,
                  letterSpacing: textNode.letterSpacing,
                  textAlign: "center",
                  ...cssProps
                };
                return {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      justifyContent: "center",
                      position: "absolute",
                      width: "100%"
                    },
                    children: {
                      type: "div",
                      props: {
                        style: templateStyles,
                        children: value
                      }
                    }
                  }
                };
              }
              return {
                type: "div",
                props: {
                  style: {
                    position: "absolute",
                    color: textNode.fill,
                    left: `${textNode.x}px`,
                    top: `${parseInt(textNode.y) - parseInt(textNode.fontSize)}px`,
                    fontWeight: textNode.fontWeight || "400",
                    fontSize: textNode.fontSize,
                    fontFamily: textNode.fontFamily,
                    letterSpacing: textNode.letterSpacing,
                    ...cssProps
                  },
                  children: value
                }
              };
            })
          }
        }
      ]
    }
  }, {
    width,
    height,
    fonts,
    ...imageResponseOptions
  });
};
var isComplexTemplate = (template) => {
  return typeof template !== "string" && template !== void 0 && "value" in template;
};
function svgToBase64(svg) {
  const base64 = Buffer.from(svg).toString("base64");
  return "data:image/svg+xml;base64," + base64;
}
function getSvgDimensions(svg) {
  const widthMatch = svg.match(/width="(\d+)/);
  const heightMatch = svg.match(/height="(\d+)/);
  if (widthMatch && heightMatch) {
    const width = parseInt(widthMatch[1], 10);
    const height = parseInt(heightMatch[1], 10);
    return { width, height };
  }
  return { width: 0, height: 0 };
}
function getTextNodes(svg) {
  const regex = /<text[^>]*>(.*?)<\/text>/g;
  let match;
  const matches = [];
  while ((match = regex.exec(svg)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}
function parseSvgText(svgText) {
  var _a2, _b2, _c, _d, _e, _f2, _g, _h, _i;
  const id = ((_a2 = svgText.match(/id="([^"]*)"/)) == null ? void 0 : _a2[1]) || "";
  const fill = ((_b2 = svgText.match(/fill="([^"]*)"/)) == null ? void 0 : _b2[1]) || "";
  const fontFamily = ((_c = svgText.match(/font-family="([^"]*)"/)) == null ? void 0 : _c[1]) || "";
  const fontSize = ((_d = svgText.match(/font-size="([^"]*)"/)) == null ? void 0 : _d[1]) || "";
  const fontWeight = ((_e = svgText.match(/font-weight="([^"]*)"/)) == null ? void 0 : _e[1]) || "";
  const letterSpacing = ((_f2 = svgText.match(/letter-spacing="([^"]*)"/)) == null ? void 0 : _f2[1]) || "";
  const x = ((_g = svgText.match(/<tspan[^>]*x="([^"]*)"/)) == null ? void 0 : _g[1]) || "";
  const y = ((_h = svgText.match(/<tspan[^>]*y="([^"]*)"/)) == null ? void 0 : _h[1]) || "";
  const content = ((_i = svgText.match(/<tspan[^>]*>([^<]*)<\/tspan>/)) == null ? void 0 : _i[1]) || "";
  return {
    id,
    fill,
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    x,
    y,
    content
  };
}
function parseFigmaUrl(figmaUrl) {
  const regex = /\/file\/([^/]+)\/[^?]+\?[^#]*node-id=([^&#]+)/;
  const match = figmaUrl.match(regex);
  let fileId = "";
  let nodeId = "";
  if (match) {
    fileId = match[1] || "";
    nodeId = match[2] || "";
  }
  return { fileId, nodeId };
}
function assertValue(v, errorMessage) {
  if (v === void 0) {
    throw new Error(errorMessage);
  }
  return v;
}

// src/index.edge.ts
var initializedResvg = initWasm(resvg_wasm);
var initializedYoga = initYoga(yoga_wasm).then((yoga2) => Rl(yoga2));
var fallbackFont = fetch(new URL("./noto-sans-v27-latin-regular.ttf", import.meta.url)).then((res) => res.arrayBuffer());
var ImageResponse = class extends Response {
  constructor(element, options = {}) {
    const result = new ReadableStream({
      async start(controller) {
        await initializedYoga;
        await initializedResvg;
        const fontData = await fallbackFont;
        const fonts = [
          {
            name: "sans serif",
            data: fontData,
            weight: 700,
            style: "normal"
          }
        ];
        const result2 = await render(wl, resvg_wasm_exports, options, fonts, element);
        controller.enqueue(result2);
        controller.close();
      }
    });
    super(result, {
      headers: {
        "content-type": "image/png",
        "cache-control": process.env.NODE_ENV === "development" ? "no-cache, no-store" : "public, immutable, no-transform, max-age=31536000",
        ...options.headers
      },
      status: options.status,
      statusText: options.statusText
    });
  }
};
var experimental_FigmaImageResponse = async (props) => {
  return FigmaImageResponse({ ...props, Response: ImageResponse });
};
export {
  ImageResponse,
  experimental_FigmaImageResponse
};
/*!
 * escape-html
 * Copyright(c) 2012-2013 TJ Holowaychuk
 * Copyright(c) 2015 Andreas Lubbe
 * Copyright(c) 2015 Tiancheng "Timothy" Gu
 * MIT Licensed
 */
/*!
 * https://github.com/gilmoreorless/css-background-parser
 * Copyright © 2015 Gilmore Davidson under the MIT license: http://gilmoreorless.mit-license.org/
 */
/*! Copyright Twitter Inc. and other contributors. Licensed under MIT */
/**
 * parse-css-color
 * @version v0.2.1
 * @link http://github.com/noeldelgado/parse-css-color/
 * @license MIT
 */
//# sourceMappingURL=index.edge.js.map