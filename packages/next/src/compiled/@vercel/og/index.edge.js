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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

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
    function tinf_getbit(d2) {
      if (!d2.bitcount--) {
        d2.tag = d2.source[d2.sourceIndex++];
        d2.bitcount = 7;
      }
      var bit = d2.tag & 1;
      d2.tag >>>= 1;
      return bit;
    }
    function tinf_read_bits(d2, num, base) {
      if (!num)
        return base;
      while (d2.bitcount < 24) {
        d2.tag |= d2.source[d2.sourceIndex++] << d2.bitcount;
        d2.bitcount += 8;
      }
      var val = d2.tag & 65535 >>> 16 - num;
      d2.tag >>>= num;
      d2.bitcount -= num;
      return val + base;
    }
    function tinf_decode_symbol(d2, t) {
      while (d2.bitcount < 24) {
        d2.tag |= d2.source[d2.sourceIndex++] << d2.bitcount;
        d2.bitcount += 8;
      }
      var sum = 0, cur = 0, len = 0;
      var tag = d2.tag;
      do {
        cur = 2 * cur + (tag & 1);
        tag >>>= 1;
        ++len;
        sum += t.table[len];
        cur -= t.table[len];
      } while (cur >= 0);
      d2.tag = tag;
      d2.bitcount -= len;
      return t.trans[sum + cur];
    }
    function tinf_decode_trees(d2, lt, dt2) {
      var hlit, hdist, hclen;
      var i, num, length;
      hlit = tinf_read_bits(d2, 5, 257);
      hdist = tinf_read_bits(d2, 5, 1);
      hclen = tinf_read_bits(d2, 4, 4);
      for (i = 0; i < 19; ++i)
        lengths[i] = 0;
      for (i = 0; i < hclen; ++i) {
        var clen = tinf_read_bits(d2, 3, 0);
        lengths[clcidx[i]] = clen;
      }
      tinf_build_tree(code_tree, lengths, 0, 19);
      for (num = 0; num < hlit + hdist; ) {
        var sym = tinf_decode_symbol(d2, code_tree);
        switch (sym) {
          case 16:
            var prev = lengths[num - 1];
            for (length = tinf_read_bits(d2, 2, 3); length; --length) {
              lengths[num++] = prev;
            }
            break;
          case 17:
            for (length = tinf_read_bits(d2, 3, 3); length; --length) {
              lengths[num++] = 0;
            }
            break;
          case 18:
            for (length = tinf_read_bits(d2, 7, 11); length; --length) {
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
    function tinf_inflate_block_data(d2, lt, dt2) {
      while (1) {
        var sym = tinf_decode_symbol(d2, lt);
        if (sym === 256) {
          return TINF_OK;
        }
        if (sym < 256) {
          d2.dest[d2.destLen++] = sym;
        } else {
          var length, dist, offs2;
          var i;
          sym -= 257;
          length = tinf_read_bits(d2, length_bits[sym], length_base[sym]);
          dist = tinf_decode_symbol(d2, dt2);
          offs2 = d2.destLen - tinf_read_bits(d2, dist_bits[dist], dist_base[dist]);
          for (i = offs2; i < offs2 + length; ++i) {
            d2.dest[d2.destLen++] = d2.dest[i];
          }
        }
      }
    }
    function tinf_inflate_uncompressed_block(d2) {
      var length, invlength;
      var i;
      while (d2.bitcount > 8) {
        d2.sourceIndex--;
        d2.bitcount -= 8;
      }
      length = d2.source[d2.sourceIndex + 1];
      length = 256 * length + d2.source[d2.sourceIndex];
      invlength = d2.source[d2.sourceIndex + 3];
      invlength = 256 * invlength + d2.source[d2.sourceIndex + 2];
      if (length !== (~invlength & 65535))
        return TINF_DATA_ERROR;
      d2.sourceIndex += 4;
      for (i = length; i; --i)
        d2.dest[d2.destLen++] = d2.source[d2.sourceIndex++];
      d2.bitcount = 0;
      return TINF_OK;
    }
    function tinf_uncompress(source, dest) {
      var d2 = new Data(source, dest);
      var bfinal, btype, res;
      do {
        bfinal = tinf_getbit(d2);
        btype = tinf_read_bits(d2, 2, 0);
        switch (btype) {
          case 0:
            res = tinf_inflate_uncompressed_block(d2);
            break;
          case 1:
            res = tinf_inflate_block_data(d2, sltree, sdtree);
            break;
          case 2:
            tinf_decode_trees(d2, d2.ltree, d2.dtree);
            res = tinf_inflate_block_data(d2, d2.ltree, d2.dtree);
            break;
          default:
            res = TINF_DATA_ERROR;
        }
        if (res !== TINF_OK)
          throw new Error("Data error");
      } while (!bfinal);
      if (d2.destLen < d2.dest.length) {
        if (typeof d2.dest.slice === "function")
          return d2.dest.slice(0, d2.destLen);
        else
          return d2.dest.subarray(0, d2.destLen);
      }
      return d2.dest;
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
    var swap = (b, n, m2) => {
      let i = b[n];
      b[n] = b[m2];
      b[m2] = i;
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
        var i, j, l2, tmp, placeHolders, arr;
        if (b64.length % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var len = b64.length;
        placeHolders = "=" === b64.charAt(len - 2) ? 2 : "=" === b64.charAt(len - 1) ? 1 : 0;
        arr = new Arr(b64.length * 3 / 4 - placeHolders);
        l2 = placeHolders > 0 ? b64.length - 4 : b64.length;
        var L = 0;
        function push(v2) {
          arr[L++] = v2;
        }
        for (i = 0, j = 0; i < l2; i += 4, j += 3) {
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

// node_modules/.pnpm/camelize@1.0.1/node_modules/camelize/index.js
var require_camelize = __commonJS({
  "node_modules/.pnpm/camelize@1.0.1/node_modules/camelize/index.js"(exports2, module) {
    "use strict";
    module.exports = function(obj) {
      if (typeof obj === "string") {
        return camelCase(obj);
      }
      return walk(obj);
    };
    function walk(obj) {
      if (!obj || typeof obj !== "object") {
        return obj;
      }
      if (isDate(obj) || isRegex(obj)) {
        return obj;
      }
      if (isArray(obj)) {
        return map(obj, walk);
      }
      return reduce(objectKeys(obj), function(acc, key) {
        var camel = camelCase(key);
        acc[camel] = walk(obj[key]);
        return acc;
      }, {});
    }
    function camelCase(str) {
      return str.replace(/[_.-](\w|$)/g, function(_2, x2) {
        return x2.toUpperCase();
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
        if (has.call(obj, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    function map(xs, f) {
      if (xs.map) {
        return xs.map(f);
      }
      var res = [];
      for (var i = 0; i < xs.length; i++) {
        res.push(f(xs[i], i));
      }
      return res;
    }
    function reduce(xs, f, acc) {
      if (xs.reduce) {
        return xs.reduce(f, acc);
      }
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

// node_modules/.pnpm/css-to-react-native@3.2.0/node_modules/css-to-react-native/index.js
var require_css_to_react_native = __commonJS({
  "node_modules/.pnpm/css-to-react-native@3.2.0/node_modules/css-to-react-native/index.js"(exports2) {
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
    var aspectRatio = function aspectRatio2(tokenStream) {
      var aspectRatio3 = tokenStream.expect(NUMBER);
      if (tokenStream.hasTokens()) {
        tokenStream.expect(SLASH);
        aspectRatio3 /= tokenStream.expect(NUMBER);
      }
      return {
        aspectRatio: aspectRatio3
      };
    };
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
    var fontVariant = function fontVariant2(tokenStream) {
      var values = [tokenStream.expect(IDENT)];
      while (tokenStream.hasTokens()) {
        tokenStream.expect(SPACE);
        values.push(tokenStream.expect(IDENT));
      }
      return {
        fontVariant: values
      };
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
          var x2 = functionStream.expect(tokenType);
          var y;
          if (functionStream.hasTokens()) {
            functionStream.expect(COMMA);
            y = functionStream.expect(tokenType);
          } else if (valueIfOmitted !== void 0) {
            y = valueIfOmitted;
          } else {
            return x2;
          }
          functionStream.expectEmpty();
          return [(_ref3 = {}, _ref3[key + "Y"] = y, _ref3), (_ref4 = {}, _ref4[key + "X"] = x2, _ref4)];
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
    var fontWeight = function fontWeight2(tokenStream) {
      return {
        fontWeight: tokenStream.expect(WORD)
        // Also match numbers as strings
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
      aspectRatio,
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
        for (var i = 0, ii2 = bgImage.length; i < ii2; i++) {
          background = new Background({
            image: bgImage[i],
            attachment: bgAttachment[i % bgAttachment.length],
            clip: bgClip[i % bgClip.length],
            origin: bgOrigin[i % bgOrigin.length],
            position: bgPosition[i % bgPosition.length],
            repeat: bgRepeat[i % bgRepeat.length],
            size: bgSize[i % bgSize.length]
          });
          if (i === ii2 - 1) {
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
      ].filter((v2) => v2 !== null && v2 !== void 0).map(toPx).map((s) => ("" + s).trim()).join(" ");
    };
    var isLength = (v2) => v2 === "0" || LENGTH_REG.test(v2);
    var toNum = (v2) => {
      if (!/px$/.test(v2) && v2 !== "0")
        return v2;
      const n = parseFloat(v2);
      return !isNaN(n) ? n : v2;
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
  //OP   , CL    , CP    , QU    , GL    , NS    , EX    , SY    , IS    , PR    , PO    , NU    , AL    , HL    , ID    , IN    , HY    , BA    , BB    , B2    , ZW    , CM    , WJ    , H2    , H3    , JL    , JV    , JT    , RI    , EB    , EM    , ZWJ   , CB
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
  // CB
];
var $557adaaeb0c7885f$var$data = import_base64_js.default.toByteArray("AAgOAAAAAAAQ4QAAAQ0P8vDtnQuMXUUZx+eyu7d7797d9m5bHoWltKVUlsjLWE0VJNigQoMVqkStEoNQQUl5GIo1KKmogEgqkKbBRki72lYabZMGKoGAjQRtJJDaCCIRiiigREBQS3z+xzOTnZ3O+3HOhd5NfpkzZx7fN9988zivu2M9hGwB28F94DnwEngd/Asc1EtIs9c/bIPDwCxwLDgezHcodyo4w5C+CCwBS8FnwSXgCnA1uFbI93XwbXAbWAfWgx+CzWAb+An4KfgFeAzsYWWfYuFz4CXwGvgb+Dfo6yNkEEwGh4CZYB44FpwI3g1OY+kfBItZOo2fB84Hy8DF4HJwNbiWpV8PVoO1LH4n2NRXyN+KcAd4kNVP9XsY4aPgcfAbsBfs6SniL4K/sPjfEf6HlanXCRkCw2BGvUh/keWfXS/CY+pFXs7x9XHmM94LTmWIeU2cgbxnS/k/B3kf86jDhU8L9V2E40vAFWAlWFUfb++NOL4F3C7JX4/4GiE+hvgWsF0oS7mXldspnN+F493gyXrh9xTav0cg3EvzgVfBG6wsmVSEkxBOBgdPGpd7JI6PnqRvJ68/xlbHof53gPeA94OzwLngk+ACsAwsByvASrAK3MB0Ws3CtQjvBJvAVrADPMDSHkb4CNijaccTwvnf4fiPEs8Lxy+D18A/QU8/xjgYBjPAbDAKTgYLwOngTHAO+EQ/8wuEF4EvsPiVCFf2+9tsFStzA8LVHuXXBsi6QyqzUYiPMR/7Mc7dAx7oL8bzw/3u/Bw8Bp4Az4AXwCtgHzsmDXP5fiF9iiVvly5d0sHngar16NKlS5cuXbp06fLmYlqHXrcd3ph4P0THUY3iXh49novju4S0tzfs5d+JPKewfAsRntZb3K9ZhOMlrO6lCC8An28U9+OuovcPcPxlVu5rCL/VmHh/iHIrzn3fIPu7SN8Axmg+8AOwEWwCm7tp3bRuWjetm5Y8bSu4B9zbKO6ZVsnORrVU3f4uXTqZ2H3sLoyx3eDXjfDndE9qyj6L838CfwVvgFpzYnof4oNgOhgBc8Fos9DrZIQLmtXPP1MmF6wGj4H+KXoWguvADkXaPil+YpuQy8Am8Ey7ODdtmJDF4HowBp4De6HDTNjhfHAHeBr0DBBy0kDxfPbcgSIusgrcWhtnJ8vL+TPix7UIOQtcBq4C28Cr4KRBnANbwSuDE+s50JgyNNFuXbp06XIgsXjIvPafjvXozKY+fVFz/z0LT1uCtKVSWbrOLWPnztG8e0Xfy7ol8XtZJi7WtG+5od2UFXQ/A12vUeS7jp27yVKHjdsU9lXB869TyNvAzt0lpP2oWbwLdjiO78bx/Sz+EMJHwK9Y/LcIfw+eZ3F67/Hl5vh9xX80J+rwX8SvRDhpgL17iPAQMHNArfPrqHPewLheI+AERV6efwV418B4nOZ/H+IfYHV8GOF5LJ3eAz0fx8sM9S0fUNud39O9CulfGZhY5huI3wzWgNvBelbHZoTbNPVpfYjKQpkHwUNgl0LWblbnk0LbbDxr0OMFpL3iqWdu9nWYPlVAWkXY39LnGdCkDbeqv1YNbfcMQ3t9oe8lzm6NH9N1ZB6Ln4BwfkJZJk7RyFnYKt6b/JDQXx9p5X+eFdqOjzM9P9MB/lUlFzr20aXIdzlY4dmn9F3YqtvoO76/2hp/D/xA5Zue88nNyL8GbFbs075X0tyUig3Qd2MCnf//HjnzpbsR3g9+1kHzzVjdnE71/qVBX9rGPUh/ysNWe1neFzvIDi5zAufV1sT0N0poR22wkFUfTOPfA4N2mbZ5fSrqOHSw+IbkSBbOGSzSRgf91/GTUWYBOB2cIZQ/G8cfBZ8CFwrnL8XxF8FKcA24jqXdiPA7Qr61OF7H4mMItwzuv2/YLth1ISt3Hzu3k4W7EH5JqPdRHD/O4k+z8A8IX5Lq3y7Z4nXE9xn6kX6vQ4bKfy+ok+hH+xf3hq9dnTTHhjKd2GmDuWA242iHMq4cC7A8kJ7i8o1+skSa7Jieo38HCWnoNjKFhdSFBxzpZ7QE6lI8N4S14aASZcryaV/WWHw66f6NHuCoxuQxmvM56GX9QMd8Q4D65ywGP+ZzRJuM+zQvx/MOS2VFeqQ4IXnH26zM9Xe6/E6D+4foAzzuajPZp8Qyw5ayZVDWuH0z0BtYRkeIDqH9KO9VbH1btd/lhNqCzvl8zeLnG0S/hnU6baHfpiuO6yy0rd+DHURo/zYF5H26j03rQsip2ndzz82u1z9N4VjWKWeb68Tedpt95HRVXp7H1R6p+/Wt4FPy/PpWwscOLRJ+PVWF/+W0iVyGzs18TIvXkOJ1Wxm66vSXz+vylenrZcj1ub439W+K8RNCGTJi2p/TJ1K23VaXr35tRpnzmjxequgfcfyk6B/TGBVlyedsNgpdd/h+W1U3P99QyFPNo1X3TwpM/WLTIWYfoBqXrv6iskHZ/RFr79R6hIyHBrH3f1nrUVnjP8SnZZ+rYtzr9Exld5MNbPNErusAPg+77u/eDOPftU9yj39TH7rezxd1LvsZQJlzkWlOirG/79zjMj/mtHUKu7vKy+3/LnXr9okyKedjX5/0He9iP/j63LwOQdarEVlfy8OO/Lqw023j6xcqmwxLiOd6heM2i9cV9LJy8jMJ23yQ+rpbfu7EQ/pXE8KYvUSqvVnb4XzZa6LrHMXHR+zcLvqWbm/Bn0/HzIs6fWPHoat8XfnDKmZGxRxeMbn2UqZ5Q94nmcZRbqqUXbZ8+lcjE+cPX11t814orvvAXNcG8vqj2vvk1MGn3anlj0bIT72v47bvE+Lc98T9b6r7AKn6j+8Duf7D0nnZx/j7Zjn0j9nbpSTndaLr9WNLivP+iN23xF7L+fqv6ZouFyb78jxVXvv5jJ9YUs9/sddO8h7KNg5jrhfaJGztT6G7KF+1d6yCmD5Kdb2fan60rSc552fZr3zeQ9DpnPp+Si5cx5Ktv2QfSzF/mMbWdOm46rFI4XstnU9xeqX4NKb7TKEdcr6pZOK3ID1k/LvFHkVczEuZLEDr499YqvqBym1aEHWgcvoYOtv0M91qQl5TfpO/in6rWx8OVpT1Wedkv3f5xom3T/xeR/6Gx6V86PWAOB4bBpqWdN+yTcVxjIyGRz/FrDGu6w/3d7kPm8StX8RyPu+uuvpNju/vTLJV37GpvoM0oZPnW87VLnL/5pDno1NoW1R6yedU6TyUv3u19a3KFnIbTLYz+ZCLP4T0tU1uivFgso0pnsJ/UtXvarNY28Xq5cvkBDrQP/E5ZaiuQwwfmTlsOiQRU1fMuqrDd/3ISSuwjOwXOfTyGUMpZIXq4GpLn3pUcdfzch2x7XO1u2uZHOPb1G6b3Xg9PH1IIWeEpJlPQtqos2EKW8b0u8rnuP1UeVLoXJb9be0uG9nnbchjU+XTszT5VeNBThPHnc5OKj1U9aj0GTHIVaGy1YhEWT4ixns00DT+XEzWn/7VAsIc63Cov3OdyhwjrnaqQqZvWKXdypRdlq+k8msZ031U+Rm4fA+3TtyeR9hwfW9G9yxDN0fZMN33F+9TE6md4hwoxumfaUzI9fN3PFT3xVV2msrQ3UsnChm6Nulk8TndpS28D3zX9tTIPsF/z7Am5OkTjm1tI1JZW74+4VgsZ0N3L1yXV3WeP5uR7TGHHdvC3JQlxybfpd22tDlk/2eofRK8TzrN/qnar/K/OUTth6I/+jAnEptNbPvFHP2gs40N3+dfMWtwqvVct7/wfd8gtQ7imifial9ZJ9/3IHLYU6eDj3+4PhsNhX+vwvcWLnu6kGfEMe8DuciPfUfGZB8X/7HJy/Gefe5n+VRGFd/wyP2ta7/LO4yh/sbLV/k9lev6kfO9Dt/5U67b1/6u/epqB1U9Me23jfHY9sscAg4tkbLl+e4/U36rJ9ddxfd6sg5vq5ice42Wpk/pb9FOJ36/W9tpv4kbC79nUbZceX8Zu6/qJ+P3WvhvA8v3reh7Jbn2d6rrNC7XNZTLma4Ba0JI9efX2uLzF5scG/w9UNU1ZxW+ymUfzELeTllXlQ1rUuhzjS5fp9c964iFBOqeSz63bU065nZKdU+mDEz3qHIjjifquw0pnb/raRtvrnsYcb46ihT3taoYz6brdNW9l6rWRnE/navdPn1XlR1km7hcz1WlH/elKuSOSvLLuE8U6m8uzwRdfcGl73VyTHuyMvzJ1Sa2cWDTP/Z63Kc94n2B1PYr24dz1JlyHLlcP+S4B6vD1c9EW4q2LWstCvUjeVy63k/LMYdUNd5D1xQfvVTzX1VjkMsUv88N8VH5fReVn/Fjn++/h6X6Q8a6b1/q3g/i/ewi0/Scs8zxXeV6mWIOUPlPzBgdFerW+bZrm2P18dnjuK6HunEp+rHvPMXbr+sHVb/lnL+pTP57jPw9Cvk3PW178JD9qChfzuvTf7Htl38L1QUf/VKu9SFjwWbTWPvFEvu7Uq76y7+31g6QlYPc669pbsm9Xur2LWI9Pu8ypfDXqm3A2z8s1FWGn4ntL9NfQu2oSlftX9uetvTtv7J8Ql4zxfXGZ3zk8PeQ9w59x2uMfqI8/q5eKh/l9cb2rwsu9rSNl06ZP2Pmxtz+rNMx93yno0n2/82rVH7rQ+y9P15H6FyRun9ViH81ATmffI7nJ5r8uXXW6enbP6b/B8/l5OifVHYLnb9S39s2zcc+Ph+rh8+eQgVPS72elzGWY/tUtbbabBpDiI7yN1q6/4th2y+ErAc5+9BVvu/7KamJbWNZeuqI/R4tRf+YyD1HmOZM1bMV3/14Sn10c0Xu+Sj1nOXb5jL73ncdy02uvlXZNde65dOHYl7Vs4KYuS6FzWLn2zJlpZqPXPVPOa5yzKOyn1VhT9lmMfdbfH7D11Wf2PXN5h9y+dD287+qxgSnaYmnIrRtIb8pJe6/Uv9OVer6Whn0zfGO/BEloZI9ojmfAlUflClDd178bTmVHVTpZXOkAlk/lb42UujmI89HH5V+cl7XtowY6vTxLVWok6UrGzoGTHN+bB+6ri05687VNpvfuvRfaP2uMlNQth1D5JjGelm/8yn+9p3p/7qk9gnfeddXZmq/Sm333PJT659Kv1zjNbZ9uv2Oi//67CV8/N1nj1DmviyXDNVeJkaeaX8UsyesYg8cu2+NvdaPfb+lLDu5tvt/");
var $557adaaeb0c7885f$var$classTrie = new import_unicode_trie.default($557adaaeb0c7885f$var$data);
var $557adaaeb0c7885f$var$mapClass = function(c2) {
  switch (c2) {
    case $1627905f8be2ef3f$export$d710c5f50fc7496a:
      return $1627905f8be2ef3f$export$1bb1140fe1358b00;
    case $1627905f8be2ef3f$export$da51c6332ad11d7b:
    case $1627905f8be2ef3f$export$bea437c40441867d:
    case $1627905f8be2ef3f$export$98e1f8a379849661:
      return $1627905f8be2ef3f$export$1bb1140fe1358b00;
    case $1627905f8be2ef3f$export$eb6c6d0b7c8826f2:
      return $1627905f8be2ef3f$export$fb4028874a74450;
    default:
      return c2;
  }
};
var $557adaaeb0c7885f$var$mapFirst = function(c2) {
  switch (c2) {
    case $1627905f8be2ef3f$export$606cfc2a8896c91f:
    case $1627905f8be2ef3f$export$e51d3c675bb0140d:
      return $1627905f8be2ef3f$export$66498d28055820a9;
    case $1627905f8be2ef3f$export$c4c7eecbfed13dc9:
      return $1627905f8be2ef3f$export$9e5d732f3676a9ba;
    default:
      return c2;
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/standalone.js
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
function getHSL([, h2, s, l2, a = 1]) {
  let hh = h2;
  if (hh.endsWith("turn")) {
    hh = parseFloat(hh) * 360 / 1;
  } else if (hh.endsWith("rad")) {
    hh = Math.round(parseFloat(hh) * 180 / Math.PI);
  } else {
    hh = parseFloat(hh);
  }
  return {
    type: "hsl",
    values: [hh, parsePercentage(s), parsePercentage(l2)],
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/standalone.js
var import_postcss_value_parser = __toESM(require_lib(), 1);
var import_css_to_react_native2 = __toESM(require_css_to_react_native(), 1);
var import_postcss_value_parser2 = __toESM(require_lib(), 1);
var import_escape_html = __toESM(require_escape_html(), 1);

// node_modules/.pnpm/css-gradient-parser@0.0.17/node_modules/css-gradient-parser/dist/index.js
function c(e, o = ",") {
  let t = [], n = 0, i = 0;
  o = new RegExp(o);
  for (let r = 0; r < e.length; r++)
    e[r] === "(" ? i++ : e[r] === ")" && i--, i === 0 && o.test(e[r]) && (t.push(e.slice(n, r).trim()), n = r + 1);
  return t.push(e.slice(n).trim()), t;
}
function g(e) {
  let o = [];
  for (let t = 0, n = e.length; t < n; ) {
    let [i, r] = c(e[t], /\s+/);
    m(e[t + 1]) ? (o.push({ color: i, offset: l(r), hint: l(e[t + 1]) }), t += 2) : (o.push({ color: i, offset: l(r) }), t++);
  }
  return o;
}
var u = /^(-?\d+\.?\d*)(%|vw|vh|px|em|rem|deg|rad|grad|turn|ch|vmin|vmax)?$/;
function m(e) {
  return u.test(e);
}
function l(e) {
  if (!e)
    return;
  let [, o, t] = e.trim().match(u) || [];
  return { value: o, unit: t ?? "px" };
}
function P(e) {
  if (!/^(repeating-)?linear-gradient/.test(e))
    throw new SyntaxError(`could not find syntax for this item: ${e}`);
  let [, o, t] = e.match(/(repeating-)?linear-gradient\((.+)\)/), n = { orientation: { type: "directional", value: "bottom" }, repeating: !!o, stops: [] }, i = c(t), r = x(i[0]);
  return r && (n.orientation = r, i.shift()), { ...n, stops: g(i) };
}
function x(e) {
  return e.startsWith("to ") ? { type: "directional", value: e.replace("to ", "") } : ["turn", "deg", "grad", "rad"].some((o) => e.endsWith(o)) ? { type: "angular", value: l(e) } : null;
}
var v = /* @__PURE__ */ new Set(["closest-corner", "closest-side", "farthest-corner", "farthest-side"]);
var w = /* @__PURE__ */ new Set(["center", "left", "top", "right", "bottom"]);
function d(e) {
  return v.has(e);
}
function h(e) {
  return w.has(e);
}
function R(e) {
  let o = Array(2).fill("");
  for (let t = 0; t < 2; t++)
    e[t] ? o[t] = e[t] : o[t] = "center";
  return o;
}
function K(e) {
  if (!/(repeating-)?radial-gradient/.test(e))
    throw new SyntaxError(`could not find syntax for this item: ${e}`);
  let [, o, t] = e.match(/(repeating-)?radial-gradient\((.+)\)/), n = { shape: "ellipse", repeating: !!o, size: [{ type: "keyword", value: "farthest-corner" }], position: { x: { type: "keyword", value: "center" }, y: { type: "keyword", value: "center" } }, stops: [] }, i = c(t);
  if (S(i[0]))
    return { ...n, stops: g(i) };
  let r = i[0].split("at").map((f) => f.trim()), p = ((r[0] || "").match(/(circle|ellipse)/) || [])[1], a = (r[0] || "").match(/(-?\d+\.?\d*(vw|vh|px|em|rem|%|rad|grad|turn|deg)?|closest-corner|closest-side|farthest-corner|farthest-side)/g) || [], s = R((r[1] || "").split(" "));
  return p ? n.shape = p : a.length === 1 && !d(a[0]) ? n.shape = "circle" : n.shape = "ellipse", a.length === 0 && a.push("farthest-corner"), n.size = a.map((f) => d(f) ? { type: "keyword", value: f } : { type: "length", value: l(f) }), n.position.x = h(s[0]) ? { type: "keyword", value: s[0] } : { type: "length", value: l(s[0]) }, n.position.y = h(s[1]) ? { type: "keyword", value: s[1] } : { type: "length", value: l(s[1]) }, (p || a.length > 0 || r[1]) && i.shift(), { ...n, stops: g(i) };
}
function S(e) {
  return /(circle|ellipse|at)/.test(e) ? false : /^(rgba?|hwb|hsl|lab|lch|oklab|color|#|[a-zA-Z]+)/.test(e);
}

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/standalone.js
var import_css_to_react_native3 = __toESM(require_css_to_react_native(), 1);

// node_modules/.pnpm/@shuding+opentype.js@1.4.0-beta.0/node_modules/@shuding/opentype.js/dist/opentype.module.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var u32 = Uint32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
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
  x2 = (i & 43690) >>> 1 | (i & 21845) << 1;
  x2 = (x2 & 52428) >>> 2 | (x2 & 13107) << 2;
  x2 = (x2 & 61680) >>> 4 | (x2 & 3855) << 4;
  rev[i] = ((x2 & 65280) >>> 8 | (x2 & 255) << 8) >>> 1;
}
var x2;
var i;
var hMap = function(cd2, mb, r) {
  var s = cd2.length;
  var i = 0;
  var l2 = new u16(mb);
  for (; i < s; ++i) {
    if (cd2[i]) {
      ++l2[cd2[i] - 1];
    }
  }
  var le = new u16(mb);
  for (i = 0; i < mb; ++i) {
    le[i] = le[i - 1] + l2[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd2[i]) {
        var sv = i << 4 | cd2[i];
        var r_1 = mb - cd2[i];
        var v2 = le[cd2[i] - 1]++ << r_1;
        for (var m2 = v2 | (1 << r_1) - 1; v2 <= m2; ++v2) {
          co[rev[v2] >>> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd2[i]) {
        co[i] = rev[le[cd2[i] - 1]++] >>> 15 - cd2[i];
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
  var m2 = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m2) {
      m2 = a[i];
    }
  }
  return m2;
};
var bits = function(d2, p, m2) {
  var o = p / 8 | 0;
  return (d2[o] | d2[o + 1] << 8) >> (p & 7) & m2;
};
var bits16 = function(d2, p) {
  var o = p / 8 | 0;
  return (d2[o] | d2[o + 1] << 8 | d2[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v2, s, e) {
  if (s == null || s < 0) {
    s = 0;
  }
  if (e == null || e > v2.length) {
    e = v2.length;
  }
  var n = new (v2.BYTES_PER_ELEMENT == 2 ? u16 : v2.BYTES_PER_ELEMENT == 4 ? u32 : u8)(e - s);
  n.set(v2.subarray(s, e));
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
  // determined by unknown compression method
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
  var sl = dat.length;
  if (!sl || st && st.f && !st.l) {
    return buf || new u8(0);
  }
  var noBuf = !buf || st;
  var noSt = !st || st.i;
  if (!st) {
    st = {};
  }
  if (!buf) {
    buf = new u8(sl * 3);
  }
  var cbuf = function(l3) {
    var bl = buf.length;
    if (l3 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l3));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l2 = dat[s - 4] | dat[s - 3] << 8, t = s + l2;
        if (t > sl) {
          if (noSt) {
            err(0);
          }
          break;
        }
        if (noBuf) {
          cbuf(bt + l2);
        }
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l2, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1) {
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      } else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >>> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c2 = 0, n = 0;
            if (s == 16) {
              n = 3 + bits(dat, pos, 3), pos += 2, c2 = ldt[i - 1];
            } else if (s == 17) {
              n = 3 + bits(dat, pos, 7), pos += 3;
            } else if (s == 18) {
              n = 11 + bits(dat, pos, 127), pos += 7;
            }
            while (n--) {
              ldt[i++] = c2;
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
      cbuf(bt + 131072);
    }
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c2 = lm[bits16(dat, pos) & lms], sym = c2 >>> 4;
      pos += c2 & 15;
      if (pos > tbts) {
        if (noSt) {
          err(0);
        }
        break;
      }
      if (!c2) {
        err(2);
      }
      if (sym < 256) {
        buf[bt++] = sym;
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
        var d2 = dm[bits16(dat, pos) & dms], dsym = d2 >>> 4;
        if (!d2) {
          err(3);
        }
        pos += d2 & 15;
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
          cbuf(bt + 131072);
        }
        var end = bt + add;
        for (; bt < end; bt += 4) {
          buf[bt] = buf[bt - dt2];
          buf[bt + 1] = buf[bt + 1 - dt2];
          buf[bt + 2] = buf[bt + 2 - dt2];
          buf[bt + 3] = buf[bt + 3 - dt2];
        }
        bt = end;
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm) {
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    }
  } while (!final);
  return bt == buf.length ? buf : slc(buf, 0, bt);
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
Path.prototype.moveTo = function(x2, y) {
  this.commands.push({
    type: "M",
    x: x2,
    y
  });
};
Path.prototype.lineTo = function(x2, y) {
  this.commands.push({
    type: "L",
    x: x2,
    y
  });
};
Path.prototype.curveTo = Path.prototype.bezierCurveTo = function(x1, y1, x2, y2, x3, y) {
  this.commands.push({
    type: "C",
    x1,
    y1,
    x2,
    y2,
    x: x3,
    y
  });
};
Path.prototype.quadTo = Path.prototype.quadraticCurveTo = function(x1, y1, x2, y) {
  this.commands.push({
    type: "Q",
    x1,
    y1,
    x: x2,
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
  function floatToString(v2) {
    if (Math.round(v2) === v2) {
      return "" + Math.round(v2);
    } else {
      return v2.toFixed(decimalPlaces);
    }
  }
  function packValues() {
    var arguments$1 = arguments;
    var s = "";
    for (var i2 = 0; i2 < arguments.length; i2 += 1) {
      var v2 = arguments$1[i2];
      if (v2 >= 0 && i2 > 0) {
        s += " ";
      }
      s += floatToString(v2);
    }
    return s;
  }
  var d2 = "";
  for (var i = 0; i < this.commands.length; i += 1) {
    var cmd = this.commands[i];
    if (cmd.type === "M") {
      d2 += "M" + packValues(cmd.x, cmd.y);
    } else if (cmd.type === "L") {
      d2 += "L" + packValues(cmd.x, cmd.y);
    } else if (cmd.type === "C") {
      d2 += "C" + packValues(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    } else if (cmd.type === "Q") {
      d2 += "Q" + packValues(cmd.x1, cmd.y1, cmd.x, cmd.y);
    } else if (cmd.type === "Z") {
      d2 += "Z";
    }
  }
  return d2;
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
DefaultEncoding.prototype.charToGlyphIndex = function(c2) {
  var code = c2.codePointAt(0);
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
CmapEncoding.prototype.charToGlyphIndex = function(c2) {
  return this.cmap.glyphIndexMap[c2.codePointAt(0)] || 0;
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
    var c2 = charCodes[i];
    var glyphIndex = glyphIndexMap[c2];
    glyph = font.glyphs.get(glyphIndex);
    glyph.addUnicode(parseInt(c2));
  }
}
function addGlyphNamesToUnicodeMap(font) {
  font._IndexToUnicodeMap = {};
  var glyphIndexMap = font.tables.cmap.glyphIndexMap;
  var charCodes = Object.keys(glyphIndexMap);
  for (var i = 0; i < charCodes.length; i += 1) {
    var c2 = charCodes[i];
    var glyphIndex = glyphIndexMap[c2];
    if (font._IndexToUnicodeMap[glyphIndex] === void 0) {
      font._IndexToUnicodeMap[glyphIndex] = {
        unicodes: [parseInt(c2)]
      };
    } else {
      font._IndexToUnicodeMap[glyphIndex].unicodes.push(parseInt(c2));
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
Glyph.prototype.getPath = function(x2, y, fontSize, options, font) {
  x2 = x2 !== void 0 ? x2 : 0;
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
    x2 = Math.round(x2);
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
      p.moveTo(x2 + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "L") {
      p.lineTo(x2 + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "Q") {
      p.quadraticCurveTo(
        x2 + cmd.x1 * xScale,
        y + -cmd.y1 * yScale,
        x2 + cmd.x * xScale,
        y + -cmd.y * yScale
      );
    } else if (cmd.type === "C") {
      p.curveTo(
        x2 + cmd.x1 * xScale,
        y + -cmd.y1 * yScale,
        x2 + cmd.x2 * xScale,
        y + -cmd.y2 * yScale,
        x2 + cmd.x * xScale,
        y + -cmd.y * yScale
      );
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
  check.argument(
    currentContour.length === 0,
    "There are still points left in the current contour."
  );
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
  /**
   * Binary search an object by "tag" property
   * @instance
   * @function searchTag
   * @memberof opentype.Layout
   * @param  {Array} arr
   * @param  {string} tag
   * @return {number}
   */
  searchTag,
  /**
   * Binary search in a list of numbers
   * @instance
   * @function binSearch
   * @memberof opentype.Layout
   * @param  {Array} arr
   * @param  {number} value
   * @return {number}
   */
  binSearch,
  /**
   * Get or create the Layout table (GSUB, GPOS etc).
   * @param  {boolean} create - Whether to create a new one.
   * @return {Object} The GSUB or GPOS table.
   */
  getTable: function(create) {
    var layout = this.font.tables[this.tableName];
    if (!layout && create) {
      layout = this.font.tables[this.tableName] = this.createDefaultTable();
    }
    return layout;
  },
  /**
   * Returns the best bet for a script name.
   * Returns 'DFLT' if it exists.
   * If not, returns 'latn' if it exists.
   * If neither exist, returns undefined.
   */
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
  /**
   * Returns all LangSysRecords in the given script.
   * @instance
   * @param {string} [script='DFLT']
   * @param {boolean} create - forces the creation of this script table if it doesn't exist.
   * @return {Object} An object with tag and script properties.
   */
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
  /**
   * Returns a language system table
   * @instance
   * @param {string} [script='DFLT']
   * @param {string} [language='dlft']
   * @param {boolean} create - forces the creation of this langSysTable if it doesn't exist.
   * @return {Object}
   */
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
  /**
   * Get a specific feature table.
   * @instance
   * @param {string} [script='DFLT']
   * @param {string} [language='dlft']
   * @param {string} feature - One of the codes listed at https://www.microsoft.com/typography/OTSPEC/featurelist.htm
   * @param {boolean} create - forces the creation of the feature table if it doesn't exist.
   * @return {Object}
   */
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
        check.assert(
          index === 0 || feature >= allFeatures[index - 1].tag,
          "Features must be added in alphabetical order."
        );
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
  /**
   * Get the lookup tables of a given type for a script/language/feature.
   * @instance
   * @param {string} [script='DFLT']
   * @param {string} [language='dlft']
   * @param {string} feature - 4-letter feature code
   * @param {number} lookupType - 1 to 9
   * @param {boolean} create - forces the creation of the lookup table if it doesn't exist, with no subtables.
   * @return {Object[]}
   */
  getLookupTables: function(script, language, feature, lookupType, create) {
    var featureTable = this.getFeatureTable(
      script,
      language,
      feature,
      create
    );
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
  /**
   * Find a glyph in a class definition table
   * https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#class-definition-table
   * @param {object} classDefTable - an OpenType Layout class definition table
   * @param {number} glyphIndex - the index of the glyph to find
   * @returns {number} -1 if not found
   */
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
  /**
   * Find a glyph in a coverage table
   * https://docs.microsoft.com/en-us/typography/opentype/spec/chapter2#coverage-table
   * @param {object} coverageTable - an OpenType Layout coverage table
   * @param {number} glyphIndex - the index of the glyph to find
   * @returns {number} -1 if not found
   */
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
  /**
   * Returns the list of glyph indexes of a coverage table.
   * Format 1: the list is stored raw
   * Format 2: compact list as range records.
   * @instance
   * @param  {Object} coverageTable
   * @return {Array}
   */
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
  var lookupTable = this.getLookupTables(
    script,
    language,
    feature,
    1,
    true
  )[0];
  var subtable = getSubstFormat(lookupTable, 2, {
    // lookup type 1 subtable, format 2, coverage format 1
    substFormat: 2,
    coverage: { format: 1, glyphs: [] },
    substitute: []
  });
  check.assert(
    subtable.coverage.format === 1,
    "Single: unable to modify coverage table format " + subtable.coverage.format
  );
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
  check.assert(
    substitution.by instanceof Array && substitution.by.length > 1,
    'Multiple: "by" must be an array of two or more ids'
  );
  var lookupTable = this.getLookupTables(
    script,
    language,
    feature,
    2,
    true
  )[0];
  var subtable = getSubstFormat(lookupTable, 1, {
    // lookup type 2 subtable, format 1, coverage format 1
    substFormat: 1,
    coverage: { format: 1, glyphs: [] },
    sequences: []
  });
  check.assert(
    subtable.coverage.format === 1,
    "Multiple: unable to modify coverage table format " + subtable.coverage.format
  );
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
  var lookupTable = this.getLookupTables(
    script,
    language,
    feature,
    3,
    true
  )[0];
  var subtable = getSubstFormat(lookupTable, 1, {
    // lookup type 3 subtable, format 1, coverage format 1
    substFormat: 1,
    coverage: { format: 1, glyphs: [] },
    alternateSets: []
  });
  check.assert(
    subtable.coverage.format === 1,
    "Alternate: unable to modify coverage table format " + subtable.coverage.format
  );
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
  var lookupTable = this.getLookupTables(
    script,
    language,
    feature,
    4,
    true
  )[0];
  var subtable = lookupTable.subtables[0];
  if (!subtable) {
    subtable = {
      // lookup type 4 subtable, format 1, coverage format 1
      substFormat: 1,
      coverage: { format: 1, glyphs: [] },
      ligatureSets: []
    };
    lookupTable.subtables[0] = subtable;
  }
  check.assert(
    subtable.coverage.format === 1,
    "Ligature: unable to modify coverage table format " + subtable.coverage.format
  );
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
      return this.getSingle(feature, script, language).concat(
        this.getAlternates(feature, script, language)
      );
    case "dlig":
    case "liga":
    case "rlig":
      return this.getLigatures(feature, script, language);
    case "ccmp":
      return this.getMultiple(feature, script, language).concat(
        this.getLigatures(feature, script, language)
      );
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
  var v2 = 0;
  for (var i = 0; i < offSize; i += 1) {
    v2 <<= 8;
    v2 += dataView.getUint8(offset + i);
  }
  return v2;
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
  var v2 = this.data.getUint8(this.offset + this.relativeOffset);
  this.relativeOffset += 1;
  return v2;
};
Parser.prototype.parseChar = function() {
  var v2 = this.data.getInt8(this.offset + this.relativeOffset);
  this.relativeOffset += 1;
  return v2;
};
Parser.prototype.parseCard8 = Parser.prototype.parseByte;
Parser.prototype.parseUShort = function() {
  var v2 = this.data.getUint16(this.offset + this.relativeOffset);
  this.relativeOffset += 2;
  return v2;
};
Parser.prototype.parseCard16 = Parser.prototype.parseUShort;
Parser.prototype.parseSID = Parser.prototype.parseUShort;
Parser.prototype.parseOffset16 = Parser.prototype.parseUShort;
Parser.prototype.parseShort = function() {
  var v2 = this.data.getInt16(this.offset + this.relativeOffset);
  this.relativeOffset += 2;
  return v2;
};
Parser.prototype.parseF2Dot14 = function() {
  var v2 = this.data.getInt16(this.offset + this.relativeOffset) / 16384;
  this.relativeOffset += 2;
  return v2;
};
Parser.prototype.parseULong = function() {
  var v2 = getULong(this.data, this.offset + this.relativeOffset);
  this.relativeOffset += 4;
  return v2;
};
Parser.prototype.parseOffset32 = Parser.prototype.parseULong;
Parser.prototype.parseFixed = function() {
  var v2 = getFixed(this.data, this.offset + this.relativeOffset);
  this.relativeOffset += 4;
  return v2;
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
  var v2 = getULong(this.data, this.offset + this.relativeOffset + 4);
  v2 -= 2082844800;
  this.relativeOffset += 8;
  return v2;
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
  var v2;
  if ((flag & shortVectorBitMask) > 0) {
    v2 = p.parseByte();
    if ((flag & sameBitMask) === 0) {
      v2 = -v2;
    }
    v2 = previousValue + v2;
  } else {
    if ((flag & sameBitMask) > 0) {
      v2 = previousValue;
    } else {
      v2 = previousValue + p.parseShort();
    }
  }
  return v2;
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
function roundOff(v2) {
  return v2;
}
function roundToGrid(v2) {
  return Math.sign(v2) * Math.round(Math.abs(v2));
}
function roundToDoubleGrid(v2) {
  return Math.sign(v2) * Math.round(Math.abs(v2 * 2)) / 2;
}
function roundToHalfGrid(v2) {
  return Math.sign(v2) * (Math.round(Math.abs(v2) + 0.5) - 0.5);
}
function roundUpToGrid(v2) {
  return Math.sign(v2) * Math.ceil(Math.abs(v2));
}
function roundDownToGrid(v2) {
  return Math.sign(v2) * Math.floor(Math.abs(v2));
}
var roundSuper = function(v2) {
  var period = this.srPeriod;
  var phase = this.srPhase;
  var threshold = this.srThreshold;
  var sign = 1;
  if (v2 < 0) {
    v2 = -v2;
    sign = -1;
  }
  v2 += threshold - phase;
  v2 = Math.trunc(v2 / period) * period;
  v2 += phase;
  if (v2 < 0) {
    return phase * sign;
  }
  return v2 * sign;
};
var xUnitVector = {
  x: 1,
  y: 0,
  axis: "x",
  // Gets the projected distance between two points.
  // o1/o2 ... if true, respective original position is used.
  distance: function(p1, p2, o1, o2) {
    return (o1 ? p1.xo : p1.x) - (o2 ? p2.xo : p2.x);
  },
  // Moves point p so the moved position has the same relative
  // position to the moved positions of rp1 and rp2 than the
  // original positions had.
  //
  // See APPENDIX on INTERPOLATE at the bottom of this file.
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
  // Slope of line normal to this
  normalSlope: Number.NEGATIVE_INFINITY,
  // Sets the point 'p' relative to point 'rp'
  // by the distance 'd'.
  //
  // See APPENDIX on SETRELATIVE at the bottom of this file.
  //
  // p   ... point to set
  // rp  ... reference point
  // d   ... distance on projection vector
  // pv  ... projection vector (undefined = this)
  // org ... if true, uses the original position of rp as reference.
  setRelative: function(p, rp, d2, pv, org) {
    if (!pv || pv === this) {
      p.x = (org ? rp.xo : rp.x) + d2;
      return;
    }
    var rpx = org ? rp.xo : rp.x;
    var rpy = org ? rp.yo : rp.y;
    var rpdx = rpx + d2 * pv.x;
    var rpdy = rpy + d2 * pv.y;
    p.x = rpdx + (p.y - rpdy) / pv.normalSlope;
  },
  // Slope of vector line.
  slope: 0,
  // Touches the point p.
  touch: function(p) {
    p.xTouched = true;
  },
  // Tests if a point p is touched.
  touched: function(p) {
    return p.xTouched;
  },
  // Untouches the point p.
  untouch: function(p) {
    p.xTouched = false;
  }
};
var yUnitVector = {
  x: 0,
  y: 1,
  axis: "y",
  // Gets the projected distance between two points.
  // o1/o2 ... if true, respective original position is used.
  distance: function(p1, p2, o1, o2) {
    return (o1 ? p1.yo : p1.y) - (o2 ? p2.yo : p2.y);
  },
  // Moves point p so the moved position has the same relative
  // position to the moved positions of rp1 and rp2 than the
  // original positions had.
  //
  // See APPENDIX on INTERPOLATE at the bottom of this file.
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
  // Slope of line normal to this.
  normalSlope: 0,
  // Sets the point 'p' relative to point 'rp'
  // by the distance 'd'
  //
  // See APPENDIX on SETRELATIVE at the bottom of this file.
  //
  // p   ... point to set
  // rp  ... reference point
  // d   ... distance on projection vector
  // pv  ... projection vector (undefined = this)
  // org ... if true, uses the original position of rp as reference.
  setRelative: function(p, rp, d2, pv, org) {
    if (!pv || pv === this) {
      p.y = (org ? rp.yo : rp.y) + d2;
      return;
    }
    var rpx = org ? rp.xo : rp.x;
    var rpy = org ? rp.yo : rp.y;
    var rpdx = rpx + d2 * pv.x;
    var rpdy = rpy + d2 * pv.y;
    p.y = rpdy + pv.normalSlope * (p.x - rpdx);
  },
  // Slope of vector line.
  slope: Number.POSITIVE_INFINITY,
  // Touches the point p.
  touch: function(p) {
    p.yTouched = true;
  },
  // Tests if a point p is touched.
  touched: function(p) {
    return p.yTouched;
  },
  // Untouches the point p.
  untouch: function(p) {
    p.yTouched = false;
  }
};
Object.freeze(xUnitVector);
Object.freeze(yUnitVector);
function UnitVector(x2, y) {
  this.x = x2;
  this.y = y;
  this.axis = void 0;
  this.slope = y / x2;
  this.normalSlope = -x2 / y;
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
UnitVector.prototype.setRelative = function(p, rp, d2, pv, org) {
  pv = pv || this;
  var rpx = org ? rp.xo : rp.x;
  var rpy = org ? rp.yo : rp.y;
  var rpdx = rpx + d2 * pv.x;
  var rpdy = rpy + d2 * pv.y;
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
function getUnitVector(x2, y) {
  var d2 = Math.sqrt(x2 * x2 + y * y);
  x2 /= d2;
  y /= d2;
  if (x2 === 1 && y === 0) {
    return xUnitVector;
  } else if (x2 === 0 && y === 1) {
    return yUnitVector;
  } else {
    return new UnitVector(x2, y);
  }
}
function HPoint(x2, y, lastPointOfContour, onCurve) {
  this.x = this.xo = Math.round(x2 * 64) / 64;
  this.y = this.yo = Math.round(y * 64) / 64;
  this.lastPointOfContour = lastPointOfContour;
  this.onCurve = onCurve;
  this.prevPointOnContour = void 0;
  this.nextPointOnContour = void 0;
  this.xTouched = false;
  this.yTouched = false;
  Object.preventExtensions(this);
}
HPoint.prototype.nextTouched = function(v2) {
  var p = this.nextPointOnContour;
  while (!v2.touched(p) && p !== this) {
    p = p.nextPointOnContour;
  }
  return p;
};
HPoint.prototype.prevTouched = function(v2) {
  var p = this.prevPointOnContour;
  while (!v2.touched(p) && p !== this) {
    p = p.prevPointOnContour;
  }
  return p;
};
var HPZero = Object.freeze(new HPoint(0, 0));
var defaultState = {
  cvCutIn: 17 / 16,
  // control value cut in
  deltaBase: 9,
  deltaShift: 0.125,
  loop: 1,
  // loops some instructions
  minDis: 1,
  // minimum distance
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
      for (var c2 = 0; c2 < oCvt.length; c2++) {
        cvt[c2] = oCvt[c2] * scale;
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
      var c2 = components[i];
      var cg = font.glyphs.get(c2.glyphIndex);
      state = new State("glyf", cg.instructions);
      if (exports.DEBUG) {
        console.log("---EXEC COMP " + i + "---");
        state.step = -1;
      }
      execComponent(cg, state, xScale, yScale);
      var dx = Math.round(c2.dx * xScale);
      var dy = Math.round(c2.dy * yScale);
      var gz = state.gZone;
      var cc2 = state.contours;
      for (var pi = 0; pi < gz.length; pi++) {
        var p = gz[pi];
        p.xTouched = p.yTouched = false;
        p.xo = p.x = p.x + dx;
        p.yo = p.y = p.y + dy;
      }
      var gLen = gZone.length;
      gZone.push.apply(gZone, gz);
      for (var j = 0; j < cc2.length; j++) {
        contours.push(cc2[j] + gLen);
      }
    }
    if (glyph.instructions && !state.inhibitGridFit) {
      state = new State("glyf", glyph.instructions);
      state.gZone = state.z0 = state.z1 = state.z2 = gZone;
      state.contours = contours;
      gZone.push(
        new HPoint(0, 0),
        new HPoint(Math.round(glyph.advanceWidth * xScale), 0)
      );
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
    gZone[i] = new HPoint(
      cp.x * xScale,
      cp.y * yScale,
      cp.lastPointOfContour,
      cp.onCurve
    );
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
  gZone.push(
    new HPoint(0, 0),
    new HPoint(Math.round(glyph.advanceWidth * xScale), 0)
  );
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
      throw new Error(
        "unknown instruction: 0x" + Number(prog[state.ip]).toString(16)
      );
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
function SVTCA(v2, state) {
  if (exports.DEBUG) {
    console.log(state.step, "SVTCA[" + v2.axis + "]");
  }
  state.fv = state.pv = state.dpv = v2;
}
function SPVTCA(v2, state) {
  if (exports.DEBUG) {
    console.log(state.step, "SPVTCA[" + v2.axis + "]");
  }
  state.pv = state.dpv = v2;
}
function SFVTCA(v2, state) {
  if (exports.DEBUG) {
    console.log(state.step, "SFVTCA[" + v2.axis + "]");
  }
  state.fv = v2;
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
  var x2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SPVFS[]", y, x2);
  }
  state.pv = state.dpv = getUnitVector(x2, y);
}
function SFVFS(state) {
  var stack = state.stack;
  var y = stack.pop();
  var x2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SPVFS[]", y, x2);
  }
  state.fv = getUnitVector(x2, y);
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
  var d2 = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "SMD[]", d2);
  }
  state.minDis = d2 / 64;
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
  var c2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "LOOPCALL[]", fn, c2);
  }
  var cip = state.ip;
  var cprog = state.prog;
  state.prog = state.funcs[fn];
  for (var i = 0; i < c2; i++) {
    exec(state);
    if (exports.DEBUG) {
      console.log(
        ++state.step,
        i + 1 < c2 ? "next loopcall" : "done loopcall",
        i
      );
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
  var d2 = pv.distance(p, HPZero);
  if (round) {
    d2 = state.round(d2);
  }
  fv.setRelative(p, HPZero, d2, pv);
  fv.touch(p);
  state.rp0 = state.rp1 = pi;
}
function IUP(v2, state) {
  var z2 = state.z2;
  var pLen = z2.length - 2;
  var cp;
  var pp;
  var np;
  if (exports.DEBUG) {
    console.log(state.step, "IUP[" + v2.axis + "]");
  }
  for (var i = 0; i < pLen; i++) {
    cp = z2[i];
    if (v2.touched(cp)) {
      continue;
    }
    pp = cp.prevTouched(v2);
    if (pp === cp) {
      continue;
    }
    np = cp.nextTouched(v2);
    if (pp === np) {
      v2.setRelative(cp, cp, v2.distance(pp, pp, false, true), v2, true);
    }
    v2.interpolate(cp, pp, np, v2);
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
    var d2 = pv.distance(rp, rp, false, true);
    fv.setRelative(p, p, d2, pv);
    fv.touch(p);
    if (exports.DEBUG) {
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHP[" + (a ? "rp1" : "rp2") + "]",
        pi
      );
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
  var d2 = pv.distance(rp, rp, false, true);
  do {
    if (p !== rp) {
      fv.setRelative(p, p, d2, pv);
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
  var z;
  switch (e) {
    case 0:
      z = state.tZone;
      break;
    case 1:
      z = state.gZone;
      break;
    default:
      throw new Error("Invalid zone");
  }
  var p;
  var d2 = pv.distance(rp, rp, false, true);
  var pLen = z.length - 2;
  for (var i = 0; i < pLen; i++) {
    p = z[i];
    fv.setRelative(p, p, d2, pv);
  }
}
function SHPIX(state) {
  var stack = state.stack;
  var loop = state.loop;
  var fv = state.fv;
  var d2 = stack.pop() / 64;
  var z2 = state.z2;
  while (loop--) {
    var pi = stack.pop();
    var p = z2[pi];
    if (exports.DEBUG) {
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHPIX[]",
        pi,
        d2
      );
    }
    fv.setRelative(p, p, d2);
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
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "IP[]",
        pi,
        rp1i,
        "<->",
        rp2i
      );
    }
    fv.interpolate(p, rp1, rp2, pv);
    fv.touch(p);
  }
  state.loop = 1;
}
function MSIRP(a, state) {
  var stack = state.stack;
  var d2 = stack.pop() / 64;
  var pi = stack.pop();
  var p = state.z1[pi];
  var rp0 = state.z0[state.rp0];
  var fv = state.fv;
  var pv = state.pv;
  fv.setRelative(p, rp0, d2, pv);
  fv.touch(p);
  if (exports.DEBUG) {
    console.log(state.step, "MSIRP[" + a + "]", d2, pi);
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
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "ALIGNRP[]",
        pi
      );
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
    console.log(
      state.step,
      "MIAP[" + round + "]",
      n,
      "(",
      cv,
      ")",
      pi
    );
  }
  var d2 = pv.distance(p, HPZero);
  if (round) {
    if (Math.abs(d2 - cv) < state.cvCutIn) {
      d2 = cv;
    }
    d2 = state.round(d2);
  }
  fv.setRelative(p, HPZero, d2, pv);
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
    var w2 = prog[++ip] << 8 | prog[++ip];
    if (w2 & 32768) {
      w2 = -((w2 ^ 65535) + 1);
    }
    stack.push(w2);
  }
  state.ip = ip;
}
function WS(state) {
  var stack = state.stack;
  var store = state.store;
  if (!store) {
    store = state.store = [];
  }
  var v2 = stack.pop();
  var l2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "WS", v2, l2);
  }
  store[l2] = v2;
}
function RS(state) {
  var stack = state.stack;
  var store = state.store;
  var l2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "RS", l2);
  }
  var v2 = store && store[l2] || 0;
  stack.push(v2);
}
function WCVTP(state) {
  var stack = state.stack;
  var v2 = stack.pop();
  var l2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "WCVTP", v2, l2);
  }
  state.cvt[l2] = v2 / 64;
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
  var d2 = state.dpv.distance(p1, p2, a, a);
  if (exports.DEBUG) {
    console.log(state.step, "MD[" + a + "]", pi2, pi1, "->", d2);
  }
  state.stack.push(Math.round(d2 * 64));
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
  var v2 = stack.pop();
  var l2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "WCVTF[]", v2, l2);
  }
  state.cvt[l2] = v2 * state.ppem / state.font.unitsPerEm;
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
    var c2 = stack.pop();
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
      console.log(state.step, "DELTACFIX", c2, "by", delta);
    }
    state.cvt[c2] += delta;
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
  var c2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "ROLL[]");
  }
  stack.push(b);
  stack.push(a);
  stack.push(c2);
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
  var v2 = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "INSTCTRL[]", s, v2);
  }
  switch (s) {
    case 1:
      state.inhibitGridFit = !!v2;
      return;
    case 2:
      state.ignoreCvt = !!v2;
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
    var w2 = prog[++ip] << 8 | prog[++ip];
    if (w2 & 32768) {
      w2 = -((w2 ^ 65535) + 1);
    }
    stack.push(w2);
  }
  state.ip = ip;
}
function MDRP_MIRP(indirect, setRp0, keepD, ro2, dt2, state) {
  var stack = state.stack;
  var cvte = indirect && stack.pop();
  var pi = stack.pop();
  var rp0i = state.rp0;
  var rp = state.z0[rp0i];
  var p = state.z1[pi];
  var md2 = state.minDis;
  var fv = state.fv;
  var pv = state.dpv;
  var od2;
  var d2;
  var sign;
  var cv;
  d2 = od2 = pv.distance(p, rp, true, true);
  sign = d2 >= 0 ? 1 : -1;
  d2 = Math.abs(d2);
  if (indirect) {
    cv = state.cvt[cvte];
    if (ro2 && Math.abs(d2 - cv) < state.cvCutIn) {
      d2 = cv;
    }
  }
  if (keepD && d2 < md2) {
    d2 = md2;
  }
  if (ro2) {
    d2 = state.round(d2);
  }
  fv.setRelative(p, rp, sign * d2, pv);
  fv.touch(p);
  if (exports.DEBUG) {
    console.log(
      state.step,
      (indirect ? "MIRP[" : "MDRP[") + (setRp0 ? "M" : "m") + (keepD ? ">" : "_") + (ro2 ? "R" : "_") + (dt2 === 0 ? "Gr" : dt2 === 1 ? "Bl" : dt2 === 2 ? "Wh" : "") + "]",
      indirect ? cvte + "(" + state.cvt[cvte] + "," + cv + ")" : "",
      pi,
      "(d =",
      od2,
      "->",
      sign * d2,
      ")"
    );
  }
  state.rp1 = state.rp0;
  state.rp2 = pi;
  if (setRp0) {
    state.rp0 = pi;
  }
}
instructionTable = [
  /* 0x00 */
  SVTCA.bind(void 0, yUnitVector),
  /* 0x01 */
  SVTCA.bind(void 0, xUnitVector),
  /* 0x02 */
  SPVTCA.bind(void 0, yUnitVector),
  /* 0x03 */
  SPVTCA.bind(void 0, xUnitVector),
  /* 0x04 */
  SFVTCA.bind(void 0, yUnitVector),
  /* 0x05 */
  SFVTCA.bind(void 0, xUnitVector),
  /* 0x06 */
  SPVTL.bind(void 0, 0),
  /* 0x07 */
  SPVTL.bind(void 0, 1),
  /* 0x08 */
  SFVTL.bind(void 0, 0),
  /* 0x09 */
  SFVTL.bind(void 0, 1),
  /* 0x0A */
  SPVFS,
  /* 0x0B */
  SFVFS,
  /* 0x0C */
  GPV,
  /* 0x0D */
  GFV,
  /* 0x0E */
  SFVTPV,
  /* 0x0F */
  ISECT,
  /* 0x10 */
  SRP0,
  /* 0x11 */
  SRP1,
  /* 0x12 */
  SRP2,
  /* 0x13 */
  SZP0,
  /* 0x14 */
  SZP1,
  /* 0x15 */
  SZP2,
  /* 0x16 */
  SZPS,
  /* 0x17 */
  SLOOP,
  /* 0x18 */
  RTG,
  /* 0x19 */
  RTHG,
  /* 0x1A */
  SMD,
  /* 0x1B */
  ELSE,
  /* 0x1C */
  JMPR,
  /* 0x1D */
  SCVTCI,
  /* 0x1E */
  void 0,
  // TODO SSWCI
  /* 0x1F */
  void 0,
  // TODO SSW
  /* 0x20 */
  DUP,
  /* 0x21 */
  POP,
  /* 0x22 */
  CLEAR,
  /* 0x23 */
  SWAP,
  /* 0x24 */
  DEPTH,
  /* 0x25 */
  CINDEX,
  /* 0x26 */
  MINDEX,
  /* 0x27 */
  void 0,
  // TODO ALIGNPTS
  /* 0x28 */
  void 0,
  /* 0x29 */
  void 0,
  // TODO UTP
  /* 0x2A */
  LOOPCALL,
  /* 0x2B */
  CALL,
  /* 0x2C */
  FDEF,
  /* 0x2D */
  void 0,
  // ENDF (eaten by FDEF)
  /* 0x2E */
  MDAP.bind(void 0, 0),
  /* 0x2F */
  MDAP.bind(void 0, 1),
  /* 0x30 */
  IUP.bind(void 0, yUnitVector),
  /* 0x31 */
  IUP.bind(void 0, xUnitVector),
  /* 0x32 */
  SHP.bind(void 0, 0),
  /* 0x33 */
  SHP.bind(void 0, 1),
  /* 0x34 */
  SHC.bind(void 0, 0),
  /* 0x35 */
  SHC.bind(void 0, 1),
  /* 0x36 */
  SHZ.bind(void 0, 0),
  /* 0x37 */
  SHZ.bind(void 0, 1),
  /* 0x38 */
  SHPIX,
  /* 0x39 */
  IP,
  /* 0x3A */
  MSIRP.bind(void 0, 0),
  /* 0x3B */
  MSIRP.bind(void 0, 1),
  /* 0x3C */
  ALIGNRP,
  /* 0x3D */
  RTDG,
  /* 0x3E */
  MIAP.bind(void 0, 0),
  /* 0x3F */
  MIAP.bind(void 0, 1),
  /* 0x40 */
  NPUSHB,
  /* 0x41 */
  NPUSHW,
  /* 0x42 */
  WS,
  /* 0x43 */
  RS,
  /* 0x44 */
  WCVTP,
  /* 0x45 */
  RCVT,
  /* 0x46 */
  GC.bind(void 0, 0),
  /* 0x47 */
  GC.bind(void 0, 1),
  /* 0x48 */
  void 0,
  // TODO SCFS
  /* 0x49 */
  MD.bind(void 0, 0),
  /* 0x4A */
  MD.bind(void 0, 1),
  /* 0x4B */
  MPPEM,
  /* 0x4C */
  void 0,
  // TODO MPS
  /* 0x4D */
  FLIPON,
  /* 0x4E */
  void 0,
  // TODO FLIPOFF
  /* 0x4F */
  void 0,
  // TODO DEBUG
  /* 0x50 */
  LT,
  /* 0x51 */
  LTEQ,
  /* 0x52 */
  GT,
  /* 0x53 */
  GTEQ,
  /* 0x54 */
  EQ,
  /* 0x55 */
  NEQ,
  /* 0x56 */
  ODD,
  /* 0x57 */
  EVEN,
  /* 0x58 */
  IF,
  /* 0x59 */
  EIF,
  /* 0x5A */
  AND,
  /* 0x5B */
  OR,
  /* 0x5C */
  NOT,
  /* 0x5D */
  DELTAP123.bind(void 0, 1),
  /* 0x5E */
  SDB,
  /* 0x5F */
  SDS,
  /* 0x60 */
  ADD,
  /* 0x61 */
  SUB,
  /* 0x62 */
  DIV,
  /* 0x63 */
  MUL,
  /* 0x64 */
  ABS,
  /* 0x65 */
  NEG,
  /* 0x66 */
  FLOOR,
  /* 0x67 */
  CEILING,
  /* 0x68 */
  ROUND.bind(void 0, 0),
  /* 0x69 */
  ROUND.bind(void 0, 1),
  /* 0x6A */
  ROUND.bind(void 0, 2),
  /* 0x6B */
  ROUND.bind(void 0, 3),
  /* 0x6C */
  void 0,
  // TODO NROUND[ab]
  /* 0x6D */
  void 0,
  // TODO NROUND[ab]
  /* 0x6E */
  void 0,
  // TODO NROUND[ab]
  /* 0x6F */
  void 0,
  // TODO NROUND[ab]
  /* 0x70 */
  WCVTF,
  /* 0x71 */
  DELTAP123.bind(void 0, 2),
  /* 0x72 */
  DELTAP123.bind(void 0, 3),
  /* 0x73 */
  DELTAC123.bind(void 0, 1),
  /* 0x74 */
  DELTAC123.bind(void 0, 2),
  /* 0x75 */
  DELTAC123.bind(void 0, 3),
  /* 0x76 */
  SROUND,
  /* 0x77 */
  S45ROUND,
  /* 0x78 */
  void 0,
  // TODO JROT[]
  /* 0x79 */
  void 0,
  // TODO JROF[]
  /* 0x7A */
  ROFF,
  /* 0x7B */
  void 0,
  /* 0x7C */
  RUTG,
  /* 0x7D */
  RDTG,
  /* 0x7E */
  POP,
  // actually SANGW, supposed to do only a pop though
  /* 0x7F */
  POP,
  // actually AA, supposed to do only a pop though
  /* 0x80 */
  void 0,
  // TODO FLIPPT
  /* 0x81 */
  void 0,
  // TODO FLIPRGON
  /* 0x82 */
  void 0,
  // TODO FLIPRGOFF
  /* 0x83 */
  void 0,
  /* 0x84 */
  void 0,
  /* 0x85 */
  SCANCTRL,
  /* 0x86 */
  SDPVTL.bind(void 0, 0),
  /* 0x87 */
  SDPVTL.bind(void 0, 1),
  /* 0x88 */
  GETINFO,
  /* 0x89 */
  void 0,
  // TODO IDEF
  /* 0x8A */
  ROLL,
  /* 0x8B */
  MAX,
  /* 0x8C */
  MIN,
  /* 0x8D */
  SCANTYPE,
  /* 0x8E */
  INSTCTRL,
  /* 0x8F */
  void 0,
  /* 0x90 */
  void 0,
  /* 0x91 */
  void 0,
  /* 0x92 */
  void 0,
  /* 0x93 */
  void 0,
  /* 0x94 */
  void 0,
  /* 0x95 */
  void 0,
  /* 0x96 */
  void 0,
  /* 0x97 */
  void 0,
  /* 0x98 */
  void 0,
  /* 0x99 */
  void 0,
  /* 0x9A */
  void 0,
  /* 0x9B */
  void 0,
  /* 0x9C */
  void 0,
  /* 0x9D */
  void 0,
  /* 0x9E */
  void 0,
  /* 0x9F */
  void 0,
  /* 0xA0 */
  void 0,
  /* 0xA1 */
  void 0,
  /* 0xA2 */
  void 0,
  /* 0xA3 */
  void 0,
  /* 0xA4 */
  void 0,
  /* 0xA5 */
  void 0,
  /* 0xA6 */
  void 0,
  /* 0xA7 */
  void 0,
  /* 0xA8 */
  void 0,
  /* 0xA9 */
  void 0,
  /* 0xAA */
  void 0,
  /* 0xAB */
  void 0,
  /* 0xAC */
  void 0,
  /* 0xAD */
  void 0,
  /* 0xAE */
  void 0,
  /* 0xAF */
  void 0,
  /* 0xB0 */
  PUSHB.bind(void 0, 1),
  /* 0xB1 */
  PUSHB.bind(void 0, 2),
  /* 0xB2 */
  PUSHB.bind(void 0, 3),
  /* 0xB3 */
  PUSHB.bind(void 0, 4),
  /* 0xB4 */
  PUSHB.bind(void 0, 5),
  /* 0xB5 */
  PUSHB.bind(void 0, 6),
  /* 0xB6 */
  PUSHB.bind(void 0, 7),
  /* 0xB7 */
  PUSHB.bind(void 0, 8),
  /* 0xB8 */
  PUSHW.bind(void 0, 1),
  /* 0xB9 */
  PUSHW.bind(void 0, 2),
  /* 0xBA */
  PUSHW.bind(void 0, 3),
  /* 0xBB */
  PUSHW.bind(void 0, 4),
  /* 0xBC */
  PUSHW.bind(void 0, 5),
  /* 0xBD */
  PUSHW.bind(void 0, 6),
  /* 0xBE */
  PUSHW.bind(void 0, 7),
  /* 0xBF */
  PUSHW.bind(void 0, 8),
  /* 0xC0 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 0),
  /* 0xC1 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 1),
  /* 0xC2 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 2),
  /* 0xC3 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 0, 3),
  /* 0xC4 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 0),
  /* 0xC5 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 1),
  /* 0xC6 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 2),
  /* 0xC7 */
  MDRP_MIRP.bind(void 0, 0, 0, 0, 1, 3),
  /* 0xC8 */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 0),
  /* 0xC9 */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 1),
  /* 0xCA */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 2),
  /* 0xCB */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 0, 3),
  /* 0xCC */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 0),
  /* 0xCD */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 1),
  /* 0xCE */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 2),
  /* 0xCF */
  MDRP_MIRP.bind(void 0, 0, 0, 1, 1, 3),
  /* 0xD0 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 0),
  /* 0xD1 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 1),
  /* 0xD2 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 2),
  /* 0xD3 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 0, 3),
  /* 0xD4 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 0),
  /* 0xD5 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 1),
  /* 0xD6 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 2),
  /* 0xD7 */
  MDRP_MIRP.bind(void 0, 0, 1, 0, 1, 3),
  /* 0xD8 */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 0),
  /* 0xD9 */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 1),
  /* 0xDA */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 2),
  /* 0xDB */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 0, 3),
  /* 0xDC */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 0),
  /* 0xDD */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 1),
  /* 0xDE */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 2),
  /* 0xDF */
  MDRP_MIRP.bind(void 0, 0, 1, 1, 1, 3),
  /* 0xE0 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 0),
  /* 0xE1 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 1),
  /* 0xE2 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 2),
  /* 0xE3 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 0, 3),
  /* 0xE4 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 0),
  /* 0xE5 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 1),
  /* 0xE6 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 2),
  /* 0xE7 */
  MDRP_MIRP.bind(void 0, 1, 0, 0, 1, 3),
  /* 0xE8 */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 0),
  /* 0xE9 */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 1),
  /* 0xEA */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 2),
  /* 0xEB */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 0, 3),
  /* 0xEC */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 0),
  /* 0xED */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 1),
  /* 0xEE */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 2),
  /* 0xEF */
  MDRP_MIRP.bind(void 0, 1, 0, 1, 1, 3),
  /* 0xF0 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 0),
  /* 0xF1 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 1),
  /* 0xF2 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 2),
  /* 0xF3 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 0, 3),
  /* 0xF4 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 0),
  /* 0xF5 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 1),
  /* 0xF6 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 2),
  /* 0xF7 */
  MDRP_MIRP.bind(void 0, 1, 1, 0, 1, 3),
  /* 0xF8 */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 0),
  /* 0xF9 */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 1),
  /* 0xFA */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 2),
  /* 0xFB */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 0, 3),
  /* 0xFC */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 0),
  /* 0xFD */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 1),
  /* 0xFE */
  MDRP_MIRP.bind(void 0, 1, 1, 1, 1, 2),
  /* 0xFF */
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
    this$1.events[eventId].subscribe(
      this$1.updateContextsRanges
    );
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
    var replaced = this.tokens.splice.apply(
      this.tokens,
      [startIndex, offset].concat(tokens)
    );
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
  var tokenType = tokens.every(
    function(token) {
      return token instanceof Token;
    }
  );
  if (tokenType) {
    this.tokens.splice.apply(
      this.tokens,
      [index, 0].concat(tokens)
    );
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
  var contextCheckers = new ContextChecker(
    contextName,
    contextStartCheck,
    contextEndCheck
  );
  this.registeredContexts[contextName] = contextCheckers;
  this.contextCheckers.push(contextCheckers);
  return contextCheckers;
};
Tokenizer.prototype.getRangeTokens = function(range) {
  var endIndex = range.startIndex + range.endOffset;
  return [].concat(
    this.tokens.slice(range.startIndex, endIndex)
  );
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
function isArabicChar(c2) {
  return /[\u0600-\u065F\u066A-\u06D2\u06FA-\u06FF]/.test(c2);
}
function isIsolatedArabicChar(char) {
  return /[\u0630\u0690\u0621\u0631\u0661\u0671\u0622\u0632\u0672\u0692\u06C2\u0623\u0673\u0693\u06C3\u0624\u0694\u06C4\u0625\u0675\u0695\u06C5\u06E5\u0676\u0696\u06C6\u0627\u0677\u0697\u06C7\u0648\u0688\u0698\u06C8\u0689\u0699\u06C9\u068A\u06CA\u066B\u068B\u06CB\u068C\u068D\u06CD\u06FD\u068E\u06EE\u06FE\u062F\u068F\u06CF\u06EF]/.test(char);
}
function isTashkeelArabicChar(char) {
  return /[\u0600-\u0605\u060C-\u060E\u0610-\u061B\u061E\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/.test(char);
}
function isLatinChar(c2) {
  return /[A-z]/.test(c2);
}
function isWhiteSpace(c2) {
  return /\s/.test(c2);
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
  var inputLookups = lookupCoverageList(
    subtable.inputCoverage,
    contextParams
  );
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
  var lookaheadLookups = lookupCoverageList(
    subtable.lookaheadCoverage,
    lookaheadParams
  );
  var backtrackContext = [].concat(contextParams.backtrack);
  backtrackContext.reverse();
  while (backtrackContext.length && isTashkeelArabicChar(backtrackContext[0].char)) {
    backtrackContext.shift();
  }
  if (backtrackContext.length < subtable.backtrackCoverage.length) {
    return [];
  }
  var backtrackParams = new ContextParams(backtrackContext, 0);
  var backtrackLookups = lookupCoverageList(
    subtable.backtrackCoverage,
    backtrackParams
  );
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
    for (var l2 = 0; l2 < ligature.components.length; l2++) {
      var lookaheadItem = contextParams.lookahead[l2];
      var component = ligature.components[l2];
      if (lookaheadItem !== component) {
        break;
      }
      if (l2 === ligature.components.length - 1) {
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
        return singleSubstitutionFormat1.apply(
          this$1,
          [glyphIndex, subtable]
        );
      };
    case "12":
      return function(glyphIndex) {
        return singleSubstitutionFormat2.apply(
          this$1,
          [glyphIndex, subtable]
        );
      };
    case "63":
      return function(contextParams) {
        return chainingSubstitutionFormat3.apply(
          this$1,
          [contextParams, subtable]
        );
      };
    case "41":
      return function(contextParams) {
        return ligatureSubstitutionFormat1.apply(
          this$1,
          [contextParams, subtable]
        );
      };
    case "21":
      return function(glyphIndex) {
        return decompositionSubstitutionFormat1.apply(
          this$1,
          [glyphIndex, subtable]
        );
      };
    default:
      throw new Error(
        "lookupType: " + lookupTable.lookupType + " - substFormat: " + subtable.substFormat + " is not yet supported"
      );
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
    return new Error(
      "font '" + this.font.names.fullName.en + "' doesn't support feature '" + query.tag + "' for script '" + query.script + "'."
    );
  }
  var lookups = this.getFeatureLookups(feature);
  var substitutions = [].concat(contextParams.context);
  for (var l2 = 0; l2 < lookups.length; l2++) {
    var lookupTable = lookups[l2];
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
  return (
    // ? arabic first char
    prevChar === null && isArabicChar(char) || // ? arabic char preceded with a non arabic char
    !isArabicChar(prevChar) && isArabicChar(char)
  );
}
function arabicWordEndCheck(contextParams) {
  var nextChar = contextParams.get(1);
  return (
    // ? last arabic char
    nextChar === null || // ? next char is not arabic
    !isArabicChar(nextChar)
  );
}
var arabicWordCheck = {
  startCheck: arabicWordStartCheck,
  endCheck: arabicWordEndCheck
};
function arabicSentenceStartCheck(contextParams) {
  var char = contextParams.current;
  var prevChar = contextParams.get(-1);
  return (
    // ? an arabic char preceded with a non arabic char
    (isArabicChar(char) || isTashkeelArabicChar(char)) && !isArabicChar(prevChar)
  );
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
        arabicCharAhead = contextParams.lookahead.some(
          function(c2) {
            return isArabicChar(c2) || isTashkeelArabicChar(c2);
          }
        );
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
  var contextParams = new ContextParams(
    tokens.map(
      function(token) {
        return token.getState("glyphIndex");
      }
    ),
    0
  );
  var charContextParams = new ContextParams(
    tokens.map(
      function(token) {
        return token.char;
      }
    ),
    0
  );
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
      substitutions.forEach(
        function(action) {
          return applySubstitution(action, tokens, index);
        }
      );
      contextParams = getContextParams(tokens);
    }
  });
}
function latinWordStartCheck(contextParams) {
  var char = contextParams.current;
  var prevChar = contextParams.get(-1);
  return (
    // ? latin first char
    prevChar === null && isLatinChar(char) || // ? latin char preceded with a non latin char
    !isLatinChar(prevChar) && isLatinChar(char)
  );
}
function latinWordEndCheck(contextParams) {
  var nextChar = contextParams.get(1);
  return (
    // ? last latin char
    nextChar === null || // ? next char is not latin
    !isLatinChar(nextChar)
  );
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
      substitutions.forEach(
        function(action) {
          return applySubstitution(action, tokens, index);
        }
      );
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
  return this.tokenizer.registerContextChecker(
    checkId,
    check2.startCheck,
    check2.endCheck
  );
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
    this$1.tokenizer.replaceRange(
      range.startIndex,
      range.endOffset,
      rangeTokens.reverse()
    );
  });
}
Bidi.prototype.registerFeatures = function(script, tags) {
  var this$1 = this;
  var supportedTags = tags.filter(
    function(tag) {
      return this$1.query.supports({ script, tag });
    }
  );
  if (!this.featuresTags.hasOwnProperty(script)) {
    this.featuresTags[script] = supportedTags;
  } else {
    this.featuresTags[script] = this.featuresTags[script].concat(supportedTags);
  }
};
Bidi.prototype.applyFeatures = function(font, features) {
  if (!font) {
    throw new Error(
      "No valid font was provided to apply features"
    );
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
    throw new Error(
      "glyphIndex modifier is required to apply arabic presentation features."
    );
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
    checkArgument(
      options.familyName,
      "When creating a new Font object, familyName is required."
    );
    checkArgument(
      options.styleName,
      "When creating a new Font object, styleName is required."
    );
    checkArgument(
      options.unitsPerEm,
      "When creating a new Font object, unitsPerEm is required."
    );
    checkArgument(
      options.ascender,
      "When creating a new Font object, ascender is required."
    );
    checkArgument(
      options.descender <= 0,
      "When creating a new Font object, negative descender value is required."
    );
    this.unitsPerEm = options.unitsPerEm || 1e3;
    this.ascender = options.ascender;
    this.descender = options.descender;
    this.createdTimestamp = options.createdTimestamp;
    this.tables = Object.assign(options.tables, {
      os2: Object.assign(
        {
          usWeightClass: options.weightClass || this.usWeightClasses.MEDIUM,
          usWidthClass: options.widthClass || this.usWidthClasses.MEDIUM,
          fsSelection: options.fsSelection || this.fsSelectionValues.REGULAR
        },
        options.tables.os2
      )
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
Font.prototype.hasChar = function(c2) {
  return this.encoding.charToGlyphIndex(c2) !== null;
};
Font.prototype.charToGlyphIndex = function(s) {
  return this.encoding.charToGlyphIndex(s);
};
Font.prototype.charToGlyph = function(c2) {
  var glyphIndex = this.charToGlyphIndex(c2);
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
    return this.position.getKerningValue(
      gposKerning,
      leftGlyph,
      rightGlyph
    );
  }
  return this.kerningPairs[leftGlyph + "," + rightGlyph] || 0;
};
Font.prototype.defaultRenderOptions = {
  kerning: true,
  features: [
    /**
     * these 4 features are required to render Arabic text properly
     * and shouldn't be turned off when rendering arabic text.
     */
    { script: "arab", tags: ["init", "medi", "fina", "rlig"] },
    { script: "latn", tags: ["liga", "rlig"] }
  ]
};
Font.prototype.forEachGlyph = function(text, x2, y, fontSize, options, callback) {
  x2 = x2 !== void 0 ? x2 : 0;
  y = y !== void 0 ? y : 0;
  fontSize = fontSize !== void 0 ? fontSize : 72;
  options = Object.assign({}, this.defaultRenderOptions, options);
  var fontScale = 1 / this.unitsPerEm * fontSize;
  var glyphs = this.stringToGlyphs(text, options);
  var kerningLookups;
  if (options.kerning) {
    var script = options.script || this.position.getDefaultScriptName();
    kerningLookups = this.position.getKerningTables(
      script,
      options.language
    );
  }
  for (var i = 0; i < glyphs.length; i += 1) {
    var glyph = glyphs[i];
    callback.call(this, glyph, x2, y, fontSize, options);
    if (glyph.advanceWidth) {
      x2 += glyph.advanceWidth * fontScale;
    }
    if (options.kerning && i < glyphs.length - 1) {
      var kerningValue = kerningLookups ? this.position.getKerningValue(
        kerningLookups,
        glyph.index,
        glyphs[i + 1].index
      ) : this.getKerningValue(glyph, glyphs[i + 1]);
      x2 += kerningValue * fontScale;
    }
    if (options.letterSpacing) {
      x2 += options.letterSpacing * fontSize;
    } else if (options.tracking) {
      x2 += options.tracking / 1e3 * fontSize;
    }
  }
  return x2;
};
Font.prototype.getPath = function(text, x2, y, fontSize, options) {
  var fullPath = new Path();
  this.forEachGlyph(
    text,
    x2,
    y,
    fontSize,
    options,
    function(glyph, gX, gY, gFontSize) {
      var glyphPath = glyph.getPath(gX, gY, gFontSize, options, this);
      fullPath.extend(glyphPath);
    }
  );
  return fullPath;
};
Font.prototype.getPaths = function(text, x2, y, fontSize, options) {
  var glyphPaths = [];
  this.forEachGlyph(
    text,
    x2,
    y,
    fontSize,
    options,
    function(glyph, gX, gY, gFontSize) {
      var glyphPath = glyph.getPath(gX, gY, gFontSize, options, this);
      glyphPaths.push(glyphPath);
    }
  );
  return glyphPaths;
};
Font.prototype.getAdvanceWidth = function(text, fontSize, options) {
  return this.forEachGlyph(text, 0, 0, fontSize, options, function() {
  });
};
Font.prototype.fsSelectionValues = {
  ITALIC: 1,
  //1
  UNDERSCORE: 2,
  //2
  NEGATIVE: 4,
  //4
  OUTLINED: 8,
  //8
  STRIKEOUT: 16,
  //16
  BOLD: 32,
  //32
  REGULAR: 64,
  //64
  USER_TYPO_METRICS: 128,
  //128
  WWS: 256,
  //256
  OBLIQUE: 512
  //512
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
    for (var c2 = startCharCode; c2 <= endCharCode; c2 += 1) {
      cmap2.glyphIndexMap[c2] = startGlyphId;
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
  var startCountParser = new parse.Parser(
    data,
    start + offset + 16 + segCount * 2
  );
  var idDeltaParser = new parse.Parser(
    data,
    start + offset + 16 + segCount * 4
  );
  var idRangeOffsetParser = new parse.Parser(
    data,
    start + offset + 16 + segCount * 6
  );
  var glyphIndexOffset = start + offset + 16 + segCount * 8;
  for (var i = 0; i < segCount - 1; i += 1) {
    var glyphIndex = void 0;
    var endCount = endCountParser.parseUShort();
    var startCount = startCountParser.parseUShort();
    var idDelta = idDeltaParser.parseShort();
    var idRangeOffset = idRangeOffsetParser.parseUShort();
    for (var c2 = startCount; c2 <= endCount; c2 += 1) {
      if (idRangeOffset !== 0) {
        glyphIndexOffset = idRangeOffsetParser.offset + idRangeOffsetParser.relativeOffset - 2;
        glyphIndexOffset += idRangeOffset;
        glyphIndexOffset += (c2 - startCount) * 2;
        glyphIndex = parse.getUShort(data, glyphIndexOffset);
        if (glyphIndex !== 0) {
          glyphIndex = glyphIndex + idDelta & 65535;
        }
      } else {
        glyphIndex = c2 + idDelta & 65535;
      }
      cmap2.glyphIndexMap[c2] = glyphIndex;
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
    throw new Error(
      "Only format 4 and 12 cmap tables are supported (found format " + cmap2.format + ")."
    );
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
    var value = parse.getBytes(
      data,
      objectOffset + offsets[i$1],
      objectOffset + offsets[i$1 + 1]
    );
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
  var value = parse.getBytes(
    data,
    objectOffset + offsets[i],
    objectOffset + offsets[i + 1]
  );
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
    var m2 = meta2[i];
    if (Array.isArray(m2.type)) {
      var values = [];
      values.length = m2.type.length;
      for (var j = 0; j < m2.type.length; j++) {
        value = dict[m2.op] !== void 0 ? dict[m2.op][j] : void 0;
        if (value === void 0) {
          value = m2.value !== void 0 && m2.value[j] !== void 0 ? m2.value[j] : null;
        }
        if (m2.type[j] === "SID") {
          value = getCFFString(strings, value);
        }
        values[j] = value;
      }
      newDict[m2.name] = values;
    } else {
      value = dict[m2.op];
      if (value === void 0) {
        value = m2.value !== void 0 ? m2.value : null;
      }
      if (m2.type === "SID") {
        value = getCFFString(strings, value);
      }
      newDict[m2.name] = value;
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
    var topDictData = new DataView(
      new Uint8Array(cffIndex[iTopDict]).buffer
    );
    var topDict = parseCFFTopDict(topDictData, strings);
    topDict._subrs = [];
    topDict._subrsBias = 0;
    topDict._defaultWidthX = 0;
    topDict._nominalWidthX = 0;
    var privateSize = topDict.private[0];
    var privateOffset = topDict.private[1];
    if (privateSize !== 0 && privateOffset !== 0) {
      var privateDict = parseCFFPrivateDict(
        data,
        privateOffset + start,
        privateSize,
        strings
      );
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
  var x2 = 0;
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
  function newContour(x3, y2) {
    if (open) {
      p.closePath();
    }
    p.moveTo(x3, y2);
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
      var v2 = code2[i];
      i += 1;
      switch (v2) {
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
          newContour(x2, y);
          break;
        case 5:
          while (stack.length > 0) {
            x2 += stack.shift();
            y += stack.shift();
            p.lineTo(x2, y);
          }
          break;
        case 6:
          while (stack.length > 0) {
            x2 += stack.shift();
            p.lineTo(x2, y);
            if (stack.length === 0) {
              break;
            }
            y += stack.shift();
            p.lineTo(x2, y);
          }
          break;
        case 7:
          while (stack.length > 0) {
            y += stack.shift();
            p.lineTo(x2, y);
            if (stack.length === 0) {
              break;
            }
            x2 += stack.shift();
            p.lineTo(x2, y);
          }
          break;
        case 8:
          while (stack.length > 0) {
            c1x = x2 + stack.shift();
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x2 = c2x + stack.shift();
            y = c2y + stack.shift();
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
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
          v2 = code2[i];
          i += 1;
          switch (v2) {
            case 35:
              c1x = x2 + stack.shift();
              c1y = y + stack.shift();
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y + stack.shift();
              c3x = jpx + stack.shift();
              c3y = jpy + stack.shift();
              c4x = c3x + stack.shift();
              c4y = c3y + stack.shift();
              x2 = c4x + stack.shift();
              y = c4y + stack.shift();
              stack.shift();
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x2, y);
              break;
            case 34:
              c1x = x2 + stack.shift();
              c1y = y;
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y;
              c3x = jpx + stack.shift();
              c3y = c2y;
              c4x = c3x + stack.shift();
              c4y = y;
              x2 = c4x + stack.shift();
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x2, y);
              break;
            case 36:
              c1x = x2 + stack.shift();
              c1y = y + stack.shift();
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y;
              c3x = jpx + stack.shift();
              c3y = c2y;
              c4x = c3x + stack.shift();
              c4y = c3y + stack.shift();
              x2 = c4x + stack.shift();
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x2, y);
              break;
            case 37:
              c1x = x2 + stack.shift();
              c1y = y + stack.shift();
              c2x = c1x + stack.shift();
              c2y = c1y + stack.shift();
              jpx = c2x + stack.shift();
              jpy = c2y + stack.shift();
              c3x = jpx + stack.shift();
              c3y = jpy + stack.shift();
              c4x = c3x + stack.shift();
              c4y = c3y + stack.shift();
              if (Math.abs(c4x - x2) > Math.abs(c4y - y)) {
                x2 = c4x + stack.shift();
              } else {
                y = c4y + stack.shift();
              }
              p.curveTo(c1x, c1y, c2x, c2y, jpx, jpy);
              p.curveTo(c3x, c3y, c4x, c4y, x2, y);
              break;
            default:
              console.log(
                "Glyph " + glyph.index + ": unknown operator 1200" + v2
              );
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
          x2 += stack.pop();
          newContour(x2, y);
          break;
        case 22:
          if (stack.length > 1 && !haveWidth) {
            width = stack.shift() + nominalWidthX;
            haveWidth = true;
          }
          x2 += stack.pop();
          newContour(x2, y);
          break;
        case 23:
          parseStems();
          break;
        case 24:
          while (stack.length > 2) {
            c1x = x2 + stack.shift();
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x2 = c2x + stack.shift();
            y = c2y + stack.shift();
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
          }
          x2 += stack.shift();
          y += stack.shift();
          p.lineTo(x2, y);
          break;
        case 25:
          while (stack.length > 6) {
            x2 += stack.shift();
            y += stack.shift();
            p.lineTo(x2, y);
          }
          c1x = x2 + stack.shift();
          c1y = y + stack.shift();
          c2x = c1x + stack.shift();
          c2y = c1y + stack.shift();
          x2 = c2x + stack.shift();
          y = c2y + stack.shift();
          p.curveTo(c1x, c1y, c2x, c2y, x2, y);
          break;
        case 26:
          if (stack.length % 2) {
            x2 += stack.shift();
          }
          while (stack.length > 0) {
            c1x = x2;
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x2 = c2x;
            y = c2y + stack.shift();
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
          }
          break;
        case 27:
          if (stack.length % 2) {
            y += stack.shift();
          }
          while (stack.length > 0) {
            c1x = x2 + stack.shift();
            c1y = y;
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x2 = c2x + stack.shift();
            y = c2y;
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
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
            c1x = x2;
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x2 = c2x + stack.shift();
            y = c2y + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
            if (stack.length === 0) {
              break;
            }
            c1x = x2 + stack.shift();
            c1y = y;
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            y = c2y + stack.shift();
            x2 = c2x + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
          }
          break;
        case 31:
          while (stack.length > 0) {
            c1x = x2 + stack.shift();
            c1y = y;
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            y = c2y + stack.shift();
            x2 = c2x + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
            if (stack.length === 0) {
              break;
            }
            c1x = x2;
            c1y = y + stack.shift();
            c2x = c1x + stack.shift();
            c2y = c1y + stack.shift();
            x2 = c2x + stack.shift();
            y = c2y + (stack.length === 1 ? stack.shift() : 0);
            p.curveTo(c1x, c1y, c2x, c2y, x2, y);
          }
          break;
        default:
          if (v2 < 32) {
            console.log(
              "Glyph " + glyph.index + ": unknown operator " + v2
            );
          } else if (v2 < 247) {
            stack.push(v2 - 139);
          } else if (v2 < 251) {
            b1 = code2[i];
            i += 1;
            stack.push((v2 - 247) * 256 + b1 + 108);
          } else if (v2 < 255) {
            b1 = code2[i];
            i += 1;
            stack.push(-(v2 - 251) * 256 - b1 - 108);
          } else {
            b1 = code2[i];
            b2 = code2[i + 1];
            b3 = code2[i + 2];
            b4 = code2[i + 3];
            i += 4;
            stack.push(
              (b1 << 24 | b2 << 16 | b3 << 8 | b4) / 65536
            );
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
        throw new Error(
          "CFF table CID Font FDSelect has bad FD index value " + fdIndex + " (FD count " + fdArrayCount + ")"
        );
      }
      fdSelect.push(fdIndex);
    }
  } else if (format === 3) {
    var nRanges = parser.parseCard16();
    var first = parser.parseCard16();
    if (first !== 0) {
      throw new Error(
        "CFF Table CID Font FDSelect format 3 range has bad initial GID " + first
      );
    }
    var next;
    for (var iRange = 0; iRange < nRanges; iRange++) {
      fdIndex = parser.parseCard8();
      next = parser.parseCard16();
      if (fdIndex >= fdArrayCount) {
        throw new Error(
          "CFF table CID Font FDSelect has bad FD index value " + fdIndex + " (FD count " + fdArrayCount + ")"
        );
      }
      if (next > nGlyphs) {
        throw new Error(
          "CFF Table CID Font FDSelect format 3 range has bad GID " + next
        );
      }
      for (; first < next; first++) {
        fdSelect.push(fdIndex);
      }
      first = next;
    }
    if (next !== nGlyphs) {
      throw new Error(
        "CFF Table CID Font FDSelect format 3 range has bad final GID " + next
      );
    }
  } else {
    throw new Error(
      "CFF Table CID Font FDSelect table has unsupported format " + format
    );
  }
  return fdSelect;
}
function parseCFFTable(data, start, font, opt) {
  font.tables.cff = {};
  var header = parseCFFHeader(data, start);
  var nameIndex = parseCFFIndex(
    data,
    header.endOffset,
    parse.bytesToString
  );
  var topDictIndex = parseCFFIndex(data, nameIndex.endOffset);
  var stringIndex = parseCFFIndex(
    data,
    topDictIndex.endOffset,
    parse.bytesToString
  );
  var globalSubrIndex = parseCFFIndex(data, stringIndex.endOffset);
  font.gsubrs = globalSubrIndex.objects;
  font.gsubrsBias = calcCFFSubroutineBias(font.gsubrs);
  var topDictArray = gatherCFFTopDicts(
    data,
    start,
    topDictIndex.objects,
    stringIndex.objects
  );
  if (topDictArray.length !== 1) {
    throw new Error(
      "CFF table has too many fonts in 'FontSet' - count of fonts NameIndex.length = " + topDictArray.length
    );
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
      throw new Error(
        "Font is marked as a CID font, but FDArray and/or FDSelect information is missing"
      );
    }
    fdArrayOffset += start;
    var fdArrayIndex = parseCFFIndex(data, fdArrayOffset);
    var fdArray = gatherCFFTopDicts(
      data,
      start,
      fdArrayIndex.objects,
      stringIndex.objects
    );
    topDict._fdArray = fdArray;
    fdSelectOffset += start;
    topDict._fdSelect = parseCFFFDSelect(
      data,
      fdSelectOffset,
      font.numGlyphs,
      fdArray.length
    );
  }
  var privateDictOffset = start + topDict.private[1];
  var privateDict = parseCFFPrivateDict(
    data,
    privateDictOffset,
    topDict.private[0],
    stringIndex.objects
  );
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
    charStringsIndex = parseCFFIndexLowMemory(
      data,
      start + topDict.charStrings
    );
    font.nGlyphs = charStringsIndex.offsets.length;
  } else {
    charStringsIndex = parseCFFIndex(data, start + topDict.charStrings);
    font.nGlyphs = charStringsIndex.objects.length;
  }
  var charset = parseCFFCharset(
    data,
    start + topDict.charset,
    font.nGlyphs,
    stringIndex.objects
  );
  if (topDict.encoding === 0) {
    font.cffEncoding = new CffEncoding(cffStandardEncoding, charset);
  } else if (topDict.encoding === 1) {
    font.cffEncoding = new CffEncoding(cffExpertEncoding, charset);
  } else {
    font.cffEncoding = parseCFFEncoding(
      data,
      start + topDict.encoding,
      charset
    );
  }
  font.encoding = font.encoding || font.cffEncoding;
  font.glyphs = new glyphset.GlyphSet(font);
  if (opt.lowMemory) {
    font._push = function(i2) {
      var charString2 = getCffIndexObject(
        i2,
        charStringsIndex.offsets,
        data,
        start + topDict.charStrings
      );
      font.glyphs.push(
        i2,
        glyphset.cffGlyphLoader(font, i2, parseCFFCharstring, charString2)
      );
    };
  } else {
    for (var i = 0; i < font.nGlyphs; i += 1) {
      var charString = charStringsIndex.objects[i];
      font.glyphs.push(
        i,
        glyphset.cffGlyphLoader(font, i, parseCFFCharstring, charString)
      );
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
  check.argument(
    tableVersion === 65536,
    "Unsupported fvar table version."
  );
  var offsetToData = p.parseOffset16();
  p.skip("uShort", 1);
  var axisCount = p.parseUShort();
  var axisSize = p.parseUShort();
  var instanceCount = p.parseUShort();
  var instanceSize = p.parseUShort();
  var axes = [];
  for (var i = 0; i < axisCount; i++) {
    axes.push(
      parseFvarAxis(data, start + offsetToData + i * axisSize, names)
    );
  }
  var instances = [];
  var instanceStart = start + offsetToData + axisCount * axisSize;
  for (var j = 0; j < instanceCount; j++) {
    instances.push(
      parseFvarInstance(
        data,
        instanceStart + j * instanceSize,
        axes,
        names
      )
    );
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
  check.argument(
    format === 1 || format === 2 || format === 3,
    "Unsupported CaretValue table version."
  );
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
  check.argument(
    tableVersion === 1 || tableVersion === 1.2 || tableVersion === 1.3,
    "Unsupported GDEF table version."
  );
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
  check.assert(
    false,
    "0x" + start.toString(16) + ": GPOS lookup type 1 format must be 1 or 2."
  );
};
subtableParsers[2] = function parseLookup2() {
  var start = this.offset + this.relativeOffset;
  var posFormat = this.parseUShort();
  check.assert(
    posFormat === 1 || posFormat === 2,
    "0x" + start.toString(16) + ": GPOS lookup type 2 format must be 1 or 2."
  );
  var coverage = this.parsePointer(Parser.coverage);
  var valueFormat1 = this.parseUShort();
  var valueFormat2 = this.parseUShort();
  if (posFormat === 1) {
    return {
      posFormat,
      coverage,
      valueFormat1,
      valueFormat2,
      pairSets: this.parseList(
        Parser.pointer(
          Parser.list(function() {
            return {
              // pairValueRecord
              secondGlyph: this.parseUShort(),
              value1: this.parseValueRecord(valueFormat1),
              value2: this.parseValueRecord(valueFormat2)
            };
          })
        )
      )
    };
  } else if (posFormat === 2) {
    var classDef1 = this.parsePointer(Parser.classDef);
    var classDef2 = this.parsePointer(Parser.classDef);
    var class1Count = this.parseUShort();
    var class2Count = this.parseUShort();
    return {
      // Class Pair Adjustment
      posFormat,
      coverage,
      valueFormat1,
      valueFormat2,
      classDef1,
      classDef2,
      class1Count,
      class2Count,
      classRecords: this.parseList(
        class1Count,
        Parser.list(class2Count, function() {
          return {
            value1: this.parseValueRecord(valueFormat1),
            value2: this.parseValueRecord(valueFormat2)
          };
        })
      )
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
  check.argument(
    tableVersion === 1 || tableVersion === 1.1,
    "Unsupported GPOS table version " + tableVersion
  );
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
  check.assert(
    false,
    "0x" + start.toString(16) + ": lookup type 1 format must be 1 or 2."
  );
};
subtableParsers$1[2] = function parseLookup22() {
  var substFormat = this.parseUShort();
  check.argument(
    substFormat === 1,
    "GSUB Multiple Substitution Subtable identifier-format must be 1"
  );
  return {
    substFormat,
    coverage: this.parsePointer(Parser.coverage),
    sequences: this.parseListOfLists()
  };
};
subtableParsers$1[3] = function parseLookup32() {
  var substFormat = this.parseUShort();
  check.argument(
    substFormat === 1,
    "GSUB Alternate Substitution Subtable identifier-format must be 1"
  );
  return {
    substFormat,
    coverage: this.parsePointer(Parser.coverage),
    alternateSets: this.parseListOfLists()
  };
};
subtableParsers$1[4] = function parseLookup42() {
  var substFormat = this.parseUShort();
  check.argument(
    substFormat === 1,
    "GSUB ligature table identifier-format must be 1"
  );
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
          lookupRecords: this.parseRecordList(
            substCount2,
            lookupRecordDesc
          )
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
          lookupRecords: this.parseRecordList(
            substCount2,
            lookupRecordDesc
          )
        };
      })
    };
  } else if (substFormat === 3) {
    var glyphCount = this.parseUShort();
    var substCount = this.parseUShort();
    return {
      substFormat,
      coverages: this.parseList(
        glyphCount,
        Parser.pointer(Parser.coverage)
      ),
      lookupRecords: this.parseRecordList(substCount, lookupRecordDesc)
    };
  }
  check.assert(
    false,
    "0x" + start.toString(16) + ": lookup type 5 format must be 1, 2 or 3."
  );
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
  check.assert(
    false,
    "0x" + start.toString(16) + ": lookup type 6 format must be 1, 2 or 3."
  );
};
subtableParsers$1[7] = function parseLookup72() {
  var substFormat = this.parseUShort();
  check.argument(
    substFormat === 1,
    "GSUB Extension Substitution subtable identifier-format must be 1"
  );
  var extensionLookupType = this.parseUShort();
  var extensionParser = new Parser(
    this.data,
    this.offset + this.parseULong()
  );
  return {
    substFormat: 1,
    lookupType: extensionLookupType,
    extension: subtableParsers$1[extensionLookupType].call(extensionParser)
  };
};
subtableParsers$1[8] = function parseLookup82() {
  var substFormat = this.parseUShort();
  check.argument(
    substFormat === 1,
    "GSUB Reverse Chaining Contextual Single Substitution Subtable identifier-format must be 1"
  );
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
  check.argument(
    tableVersion === 1 || tableVersion === 1.1,
    "Unsupported GSUB table version."
  );
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
  check.argument(
    head2.magicNumber === 1594834165,
    "Font header has wrong magic number."
  );
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
  os22.achVendID = String.fromCharCode(
    p.parseByte(),
    p.parseByte(),
    p.parseByte(),
    p.parseByte()
  );
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
  "x-mac-croatian": (
    // Python: 'mac_croatian'
    "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\u0160\u2122\xB4\xA8\u2260\u017D\xD8\u221E\xB1\u2264\u2265\u2206\xB5\u2202\u2211\u220F\u0161\u222B\xAA\xBA\u03A9\u017E\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u0106\xAB\u010C\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u0110\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\uF8FF\xA9\u2044\u20AC\u2039\u203A\xC6\xBB\u2013\xB7\u201A\u201E\u2030\xC2\u0107\xC1\u010D\xC8\xCD\xCE\xCF\xCC\xD3\xD4\u0111\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u03C0\xCB\u02DA\xB8\xCA\xE6\u02C7"
  ),
  "x-mac-cyrillic": (
    // Python: 'mac_cyrillic'
    "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\u2020\xB0\u0490\xA3\xA7\u2022\xB6\u0406\xAE\xA9\u2122\u0402\u0452\u2260\u0403\u0453\u221E\xB1\u2264\u2265\u0456\xB5\u0491\u0408\u0404\u0454\u0407\u0457\u0409\u0459\u040A\u045A\u0458\u0405\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\u040B\u045B\u040C\u045C\u0455\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u201E\u040E\u045E\u040F\u045F\u2116\u0401\u0451\u044F\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E"
  ),
  "x-mac-gaelic": (
    // http://unicode.org/Public/MAPPINGS/VENDORS/APPLE/GAELIC.TXT
    "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u1E02\xB1\u2264\u2265\u1E03\u010A\u010B\u1E0A\u1E0B\u1E1E\u1E1F\u0120\u0121\u1E40\xE6\xF8\u1E41\u1E56\u1E57\u027C\u0192\u017F\u1E60\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\u1E61\u1E9B\xFF\u0178\u1E6A\u20AC\u2039\u203A\u0176\u0177\u1E6B\xB7\u1EF2\u1EF3\u204A\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\u2663\xD2\xDA\xDB\xD9\u0131\xDD\xFD\u0174\u0175\u1E84\u1E85\u1E80\u1E81\u1E82\u1E83"
  ),
  "x-mac-greek": (
    // Python: 'mac_greek'
    "\xC4\xB9\xB2\xC9\xB3\xD6\xDC\u0385\xE0\xE2\xE4\u0384\xA8\xE7\xE9\xE8\xEA\xEB\xA3\u2122\xEE\xEF\u2022\xBD\u2030\xF4\xF6\xA6\u20AC\xF9\xFB\xFC\u2020\u0393\u0394\u0398\u039B\u039E\u03A0\xDF\xAE\xA9\u03A3\u03AA\xA7\u2260\xB0\xB7\u0391\xB1\u2264\u2265\xA5\u0392\u0395\u0396\u0397\u0399\u039A\u039C\u03A6\u03AB\u03A8\u03A9\u03AC\u039D\xAC\u039F\u03A1\u2248\u03A4\xAB\xBB\u2026\xA0\u03A5\u03A7\u0386\u0388\u0153\u2013\u2015\u201C\u201D\u2018\u2019\xF7\u0389\u038A\u038C\u038E\u03AD\u03AE\u03AF\u03CC\u038F\u03CD\u03B1\u03B2\u03C8\u03B4\u03B5\u03C6\u03B3\u03B7\u03B9\u03BE\u03BA\u03BB\u03BC\u03BD\u03BF\u03C0\u03CE\u03C1\u03C3\u03C4\u03B8\u03C9\u03C2\u03C7\u03C5\u03B6\u03CA\u03CB\u0390\u03B0\xAD"
  ),
  "x-mac-icelandic": (
    // Python: 'mac_iceland'
    "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\xDD\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\xD0\xF0\xDE\xFE\xFD\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7"
  ),
  "x-mac-inuit": (
    // http://unicode.org/Public/MAPPINGS/VENDORS/APPLE/INUIT.TXT
    "\u1403\u1404\u1405\u1406\u140A\u140B\u1431\u1432\u1433\u1434\u1438\u1439\u1449\u144E\u144F\u1450\u1451\u1455\u1456\u1466\u146D\u146E\u146F\u1470\u1472\u1473\u1483\u148B\u148C\u148D\u148E\u1490\u1491\xB0\u14A1\u14A5\u14A6\u2022\xB6\u14A7\xAE\xA9\u2122\u14A8\u14AA\u14AB\u14BB\u14C2\u14C3\u14C4\u14C5\u14C7\u14C8\u14D0\u14EF\u14F0\u14F1\u14F2\u14F4\u14F5\u1505\u14D5\u14D6\u14D7\u14D8\u14DA\u14DB\u14EA\u1528\u1529\u152A\u152B\u152D\u2026\xA0\u152E\u153E\u1555\u1556\u1557\u2013\u2014\u201C\u201D\u2018\u2019\u1558\u1559\u155A\u155D\u1546\u1547\u1548\u1549\u154B\u154C\u1550\u157F\u1580\u1581\u1582\u1583\u1584\u1585\u158F\u1590\u1591\u1592\u1593\u1594\u1595\u1671\u1672\u1673\u1674\u1675\u1676\u1596\u15A0\u15A1\u15A2\u15A3\u15A4\u15A5\u15A6\u157C\u0141\u0142"
  ),
  "x-mac-ce": (
    // Python: 'mac_latin2'
    "\xC4\u0100\u0101\xC9\u0104\xD6\xDC\xE1\u0105\u010C\xE4\u010D\u0106\u0107\xE9\u0179\u017A\u010E\xED\u010F\u0112\u0113\u0116\xF3\u0117\xF4\xF6\xF5\xFA\u011A\u011B\xFC\u2020\xB0\u0118\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\u0119\xA8\u2260\u0123\u012E\u012F\u012A\u2264\u2265\u012B\u0136\u2202\u2211\u0142\u013B\u013C\u013D\u013E\u0139\u013A\u0145\u0146\u0143\xAC\u221A\u0144\u0147\u2206\xAB\xBB\u2026\xA0\u0148\u0150\xD5\u0151\u014C\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\u014D\u0154\u0155\u0158\u2039\u203A\u0159\u0156\u0157\u0160\u201A\u201E\u0161\u015A\u015B\xC1\u0164\u0165\xCD\u017D\u017E\u016A\xD3\xD4\u016B\u016E\xDA\u016F\u0170\u0171\u0172\u0173\xDD\xFD\u0137\u017B\u0141\u017C\u0122\u02C7"
  ),
  macintosh: (
    // Python: 'mac_roman'
    "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\uFB01\uFB02\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7"
  ),
  "x-mac-romanian": (
    // Python: 'mac_romanian'
    "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\u0102\u0218\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\u0103\u0219\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\u021A\u021B\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7"
  ),
  "x-mac-turkish": (
    // Python: 'mac_turkish'
    "\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u011E\u011F\u0130\u0131\u015E\u015F\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4\uF8FF\xD2\xDA\xDB\xD9\uF8A0\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7"
  )
};
decode.MACSTRING = function(dataView, offset, dataLength, encoding) {
  var table = eightBitMacEncodings[encoding];
  if (table === void 0) {
    return void 0;
  }
  var result = "";
  for (var i = 0; i < dataLength; i++) {
    var c2 = dataView.getUint8(offset + i);
    if (c2 <= 127) {
      result += String.fromCharCode(c2);
    } else {
      result += table[c2 & 127];
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
    var inBuffer = new Uint8Array(
      data.buffer,
      tableEntry.offset + 2,
      tableEntry.compressedLength - 2
    );
    var outBuffer = new Uint8Array(tableEntry.length);
    inflateSync(inBuffer, outBuffer);
    if (outBuffer.byteLength !== tableEntry.length) {
      throw new Error(
        "Decompression error: " + tableEntry.tag + " decompressed length doesn't match recorded length"
      );
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
    var locaOffsets = loca.parse(
      locaTable.data,
      locaTable.offset,
      font.numGlyphs,
      shortVersion
    );
    var glyfTable = uncompressTable(data, glyfTableEntry);
    font.glyphs = glyf.parse(
      glyfTable.data,
      glyfTable.offset,
      locaOffsets,
      font,
      opt
    );
  } else if (cffTableEntry) {
    var cffTable = uncompressTable(data, cffTableEntry);
    cff.parse(cffTable.data, cffTable.offset, font, opt);
  } else {
    throw new Error("Font doesn't contain TrueType or CFF outlines.");
  }
  var hmtxTable = uncompressTable(data, hmtxTableEntry);
  hmtx.parse(
    font,
    hmtxTable.data,
    hmtxTable.offset,
    font.numberOfHMetrics,
    font.numGlyphs,
    font.glyphs,
    opt
  );
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
    font.tables.fvar = fvar.parse(
      fvarTable.data,
      fvarTable.offset,
      font.names
    );
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/standalone.js
var lc = Object.create;
var Nn = Object.defineProperty;
var fc = Object.getOwnPropertyDescriptor;
var cc = Object.getOwnPropertyNames;
var dc = Object.getPrototypeOf;
var pc = Object.prototype.hasOwnProperty;
var tr = (e, t) => () => (e && (t = e(e = 0)), t);
var U = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var Wn = (e, t) => {
  for (var n in t)
    Nn(e, n, { get: t[n], enumerable: true });
};
var na = (e, t, n, r) => {
  if (t && typeof t == "object" || typeof t == "function")
    for (let i of cc(t))
      !pc.call(e, i) && i !== n && Nn(e, i, { get: () => t[i], enumerable: !(r = fc(t, i)) || r.enumerable });
  return e;
};
var hc = (e, t, n) => (n = e != null ? lc(dc(e)) : {}, na(t || !e || !e.__esModule ? Nn(n, "default", { value: e, enumerable: true }) : n, e));
var Fn = (e) => na(Nn({}, "__esModule", { value: true }), e);
var Nt;
var va;
var ya;
var Nr;
var Ii;
var Wt;
var br;
var Pc;
var qn;
var Ri;
var vr;
var yr;
var Ci;
var xa;
var Li;
var Mi;
var wt;
var Ni;
var Ac;
var wa;
var Un = tr(() => {
  Nt = function(e) {
    return e[e.Auto = 0] = "Auto", e[e.FlexStart = 1] = "FlexStart", e[e.Center = 2] = "Center", e[e.FlexEnd = 3] = "FlexEnd", e[e.Stretch = 4] = "Stretch", e[e.Baseline = 5] = "Baseline", e[e.SpaceBetween = 6] = "SpaceBetween", e[e.SpaceAround = 7] = "SpaceAround", e[e.SpaceEvenly = 8] = "SpaceEvenly", e;
  }({}), va = function(e) {
    return e[e.BorderBox = 0] = "BorderBox", e[e.ContentBox = 1] = "ContentBox", e;
  }({}), ya = function(e) {
    return e[e.Width = 0] = "Width", e[e.Height = 1] = "Height", e;
  }({}), Nr = function(e) {
    return e[e.Inherit = 0] = "Inherit", e[e.LTR = 1] = "LTR", e[e.RTL = 2] = "RTL", e;
  }({}), Ii = function(e) {
    return e[e.Flex = 0] = "Flex", e[e.None = 1] = "None", e[e.Contents = 2] = "Contents", e;
  }({}), Wt = function(e) {
    return e[e.Left = 0] = "Left", e[e.Top = 1] = "Top", e[e.Right = 2] = "Right", e[e.Bottom = 3] = "Bottom", e[e.Start = 4] = "Start", e[e.End = 5] = "End", e[e.Horizontal = 6] = "Horizontal", e[e.Vertical = 7] = "Vertical", e[e.All = 8] = "All", e;
  }({}), br = function(e) {
    return e[e.None = 0] = "None", e[e.StretchFlexBasis = 1] = "StretchFlexBasis", e[e.AbsolutePositionWithoutInsetsExcludesPadding = 2] = "AbsolutePositionWithoutInsetsExcludesPadding", e[e.AbsolutePercentAgainstInnerSize = 4] = "AbsolutePercentAgainstInnerSize", e[e.All = 2147483647] = "All", e[e.Classic = 2147483646] = "Classic", e;
  }({}), Pc = function(e) {
    return e[e.WebFlexBasis = 0] = "WebFlexBasis", e;
  }({}), qn = function(e) {
    return e[e.Column = 0] = "Column", e[e.ColumnReverse = 1] = "ColumnReverse", e[e.Row = 2] = "Row", e[e.RowReverse = 3] = "RowReverse", e;
  }({}), Ri = function(e) {
    return e[e.Column = 0] = "Column", e[e.Row = 1] = "Row", e[e.All = 2] = "All", e;
  }({}), vr = function(e) {
    return e[e.FlexStart = 0] = "FlexStart", e[e.Center = 1] = "Center", e[e.FlexEnd = 2] = "FlexEnd", e[e.SpaceBetween = 3] = "SpaceBetween", e[e.SpaceAround = 4] = "SpaceAround", e[e.SpaceEvenly = 5] = "SpaceEvenly", e;
  }({}), yr = function(e) {
    return e[e.Error = 0] = "Error", e[e.Warn = 1] = "Warn", e[e.Info = 2] = "Info", e[e.Debug = 3] = "Debug", e[e.Verbose = 4] = "Verbose", e[e.Fatal = 5] = "Fatal", e;
  }({}), Ci = function(e) {
    return e[e.Undefined = 0] = "Undefined", e[e.Exactly = 1] = "Exactly", e[e.AtMost = 2] = "AtMost", e;
  }({}), xa = function(e) {
    return e[e.Default = 0] = "Default", e[e.Text = 1] = "Text", e;
  }({}), Li = function(e) {
    return e[e.Visible = 0] = "Visible", e[e.Hidden = 1] = "Hidden", e[e.Scroll = 2] = "Scroll", e;
  }({}), Mi = function(e) {
    return e[e.Static = 0] = "Static", e[e.Relative = 1] = "Relative", e[e.Absolute = 2] = "Absolute", e;
  }({}), wt = function(e) {
    return e[e.Undefined = 0] = "Undefined", e[e.Point = 1] = "Point", e[e.Percent = 2] = "Percent", e[e.Auto = 3] = "Auto", e;
  }({}), Ni = function(e) {
    return e[e.NoWrap = 0] = "NoWrap", e[e.Wrap = 1] = "Wrap", e[e.WrapReverse = 2] = "WrapReverse", e;
  }({}), Ac = { ALIGN_AUTO: Nt.Auto, ALIGN_FLEX_START: Nt.FlexStart, ALIGN_CENTER: Nt.Center, ALIGN_FLEX_END: Nt.FlexEnd, ALIGN_STRETCH: Nt.Stretch, ALIGN_BASELINE: Nt.Baseline, ALIGN_SPACE_BETWEEN: Nt.SpaceBetween, ALIGN_SPACE_AROUND: Nt.SpaceAround, ALIGN_SPACE_EVENLY: Nt.SpaceEvenly, BOX_SIZING_BORDER_BOX: va.BorderBox, BOX_SIZING_CONTENT_BOX: va.ContentBox, DIMENSION_WIDTH: ya.Width, DIMENSION_HEIGHT: ya.Height, DIRECTION_INHERIT: Nr.Inherit, DIRECTION_LTR: Nr.LTR, DIRECTION_RTL: Nr.RTL, DISPLAY_FLEX: Ii.Flex, DISPLAY_NONE: Ii.None, DISPLAY_CONTENTS: Ii.Contents, EDGE_LEFT: Wt.Left, EDGE_TOP: Wt.Top, EDGE_RIGHT: Wt.Right, EDGE_BOTTOM: Wt.Bottom, EDGE_START: Wt.Start, EDGE_END: Wt.End, EDGE_HORIZONTAL: Wt.Horizontal, EDGE_VERTICAL: Wt.Vertical, EDGE_ALL: Wt.All, ERRATA_NONE: br.None, ERRATA_STRETCH_FLEX_BASIS: br.StretchFlexBasis, ERRATA_ABSOLUTE_POSITION_WITHOUT_INSETS_EXCLUDES_PADDING: br.AbsolutePositionWithoutInsetsExcludesPadding, ERRATA_ABSOLUTE_PERCENT_AGAINST_INNER_SIZE: br.AbsolutePercentAgainstInnerSize, ERRATA_ALL: br.All, ERRATA_CLASSIC: br.Classic, EXPERIMENTAL_FEATURE_WEB_FLEX_BASIS: Pc.WebFlexBasis, FLEX_DIRECTION_COLUMN: qn.Column, FLEX_DIRECTION_COLUMN_REVERSE: qn.ColumnReverse, FLEX_DIRECTION_ROW: qn.Row, FLEX_DIRECTION_ROW_REVERSE: qn.RowReverse, GUTTER_COLUMN: Ri.Column, GUTTER_ROW: Ri.Row, GUTTER_ALL: Ri.All, JUSTIFY_FLEX_START: vr.FlexStart, JUSTIFY_CENTER: vr.Center, JUSTIFY_FLEX_END: vr.FlexEnd, JUSTIFY_SPACE_BETWEEN: vr.SpaceBetween, JUSTIFY_SPACE_AROUND: vr.SpaceAround, JUSTIFY_SPACE_EVENLY: vr.SpaceEvenly, LOG_LEVEL_ERROR: yr.Error, LOG_LEVEL_WARN: yr.Warn, LOG_LEVEL_INFO: yr.Info, LOG_LEVEL_DEBUG: yr.Debug, LOG_LEVEL_VERBOSE: yr.Verbose, LOG_LEVEL_FATAL: yr.Fatal, MEASURE_MODE_UNDEFINED: Ci.Undefined, MEASURE_MODE_EXACTLY: Ci.Exactly, MEASURE_MODE_AT_MOST: Ci.AtMost, NODE_TYPE_DEFAULT: xa.Default, NODE_TYPE_TEXT: xa.Text, OVERFLOW_VISIBLE: Li.Visible, OVERFLOW_HIDDEN: Li.Hidden, OVERFLOW_SCROLL: Li.Scroll, POSITION_TYPE_STATIC: Mi.Static, POSITION_TYPE_RELATIVE: Mi.Relative, POSITION_TYPE_ABSOLUTE: Mi.Absolute, UNIT_UNDEFINED: wt.Undefined, UNIT_POINT: wt.Point, UNIT_PERCENT: wt.Percent, UNIT_AUTO: wt.Auto, WRAP_NO_WRAP: Ni.NoWrap, WRAP_WRAP: Ni.Wrap, WRAP_WRAP_REVERSE: Ni.WrapReverse }, wa = Ac;
});
function Wi(e) {
  function t(i, o, s) {
    let a = i[o];
    i[o] = function() {
      for (var u2 = arguments.length, f = new Array(u2), l2 = 0; l2 < u2; l2++)
        f[l2] = arguments[l2];
      return s.call(this, a, ...f);
    };
  }
  for (let i of ["setPosition", "setMargin", "setFlexBasis", "setWidth", "setHeight", "setMinWidth", "setMinHeight", "setMaxWidth", "setMaxHeight", "setPadding", "setGap"]) {
    let o = { [wt.Point]: e.Node.prototype[i], [wt.Percent]: e.Node.prototype[`${i}Percent`], [wt.Auto]: e.Node.prototype[`${i}Auto`] };
    t(e.Node.prototype, i, function(s) {
      for (var a = arguments.length, u2 = new Array(a > 1 ? a - 1 : 0), f = 1; f < a; f++)
        u2[f - 1] = arguments[f];
      let l2 = u2.pop(), p, h2;
      if (l2 === "auto")
        p = wt.Auto, h2 = void 0;
      else if (typeof l2 == "object")
        p = l2.unit, h2 = l2.valueOf();
      else if (p = typeof l2 == "string" && l2.endsWith("%") ? wt.Percent : wt.Point, h2 = parseFloat(l2), l2 !== void 0 && !Number.isNaN(l2) && Number.isNaN(h2))
        throw new Error(`Invalid value ${l2} for ${i}`);
      if (!o[p])
        throw new Error(`Failed to execute "${i}": Unsupported unit '${l2}'`);
      return h2 !== void 0 ? o[p].call(this, ...u2, h2) : o[p].call(this, ...u2);
    });
  }
  function n(i) {
    return e.MeasureCallback.implement({ measure: function() {
      let { width: o, height: s } = i(...arguments);
      return { width: o ?? NaN, height: s ?? NaN };
    } });
  }
  t(e.Node.prototype, "setMeasureFunc", function(i, o) {
    return o ? i.call(this, n(o)) : this.unsetMeasureFunc();
  });
  function r(i) {
    return e.DirtiedCallback.implement({ dirtied: i });
  }
  return t(e.Node.prototype, "setDirtiedFunc", function(i, o) {
    i.call(this, r(o));
  }), t(e.Config.prototype, "free", function() {
    e.Config.destroy(this);
  }), t(e.Node, "create", (i, o) => o ? e.Node.createWithConfig(o) : e.Node.createDefault()), t(e.Node.prototype, "free", function() {
    e.Node.destroy(this);
  }), t(e.Node.prototype, "freeRecursive", function() {
    for (let i = 0, o = this.getChildCount(); i < o; ++i)
      this.getChild(0).freeRecursive();
    this.free();
  }), t(e.Node.prototype, "calculateLayout", function(i) {
    let o = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : NaN, s = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : NaN, a = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : Nr.LTR;
    return i.call(this, o, s, a);
  }), { Config: e.Config, Node: e.Node, ...wa };
}
var Sa = tr(() => {
  Un();
  Un();
});
var Ta = {};
Wn(Ta, { default: () => Ic });
function Ic(e) {
  e = e || {};
  var t;
  t || (t = typeof e < "u" ? e : {});
  var n, r;
  t.ready = new Promise(function(c2, d2) {
    n = c2, r = d2;
  });
  var i = Object.assign({}, t), o = "";
  typeof document < "u" && document.currentScript && (o = document.currentScript.src), _a2 && (o = _a2), o.indexOf("blob:") !== 0 ? o = o.substr(0, o.replace(/[?#].*/, "").lastIndexOf("/") + 1) : o = "";
  var s = t.print || console.log.bind(console), a = t.printErr || console.warn.bind(console);
  Object.assign(t, i), i = null;
  var u2;
  t.wasmBinary && (u2 = t.wasmBinary);
  var f = t.noExitRuntime || true;
  typeof WebAssembly != "object" && Z("no native wasm support detected");
  var l2, p = false;
  function h2(c2, d2, g2) {
    g2 = d2 + g2;
    for (var v2 = ""; !(d2 >= g2); ) {
      var x2 = c2[d2++];
      if (!x2)
        break;
      if (x2 & 128) {
        var E = c2[d2++] & 63;
        if ((x2 & 224) == 192)
          v2 += String.fromCharCode((x2 & 31) << 6 | E);
        else {
          var A = c2[d2++] & 63;
          x2 = (x2 & 240) == 224 ? (x2 & 15) << 12 | E << 6 | A : (x2 & 7) << 18 | E << 12 | A << 6 | c2[d2++] & 63, 65536 > x2 ? v2 += String.fromCharCode(x2) : (x2 -= 65536, v2 += String.fromCharCode(55296 | x2 >> 10, 56320 | x2 & 1023));
        }
      } else
        v2 += String.fromCharCode(x2);
    }
    return v2;
  }
  var m2, b, y, T, k, P2, w2, S2, O;
  function I() {
    var c2 = l2.buffer;
    m2 = c2, t.HEAP8 = b = new Int8Array(c2), t.HEAP16 = T = new Int16Array(c2), t.HEAP32 = P2 = new Int32Array(c2), t.HEAPU8 = y = new Uint8Array(c2), t.HEAPU16 = k = new Uint16Array(c2), t.HEAPU32 = w2 = new Uint32Array(c2), t.HEAPF32 = S2 = new Float32Array(c2), t.HEAPF64 = O = new Float64Array(c2);
  }
  var F, q = [], V = [], de = [];
  function Ae() {
    var c2 = t.preRun.shift();
    q.unshift(c2);
  }
  var me = 0, ue = null, Ie = null;
  function Z(c2) {
    throw t.onAbort && t.onAbort(c2), c2 = "Aborted(" + c2 + ")", a(c2), p = true, c2 = new WebAssembly.RuntimeError(c2 + ". Build with -sASSERTIONS for more info."), r(c2), c2;
  }
  function ne(c2) {
    return c2.startsWith("data:application/octet-stream;base64,");
  }
  var ke = "";
  if (!ne(ke)) {
    var ve = ke;
    ke = t.locateFile ? t.locateFile(ve, o) : o + ve;
  }
  function Re() {
    var c2 = ke;
    try {
      if (c2 == ke && u2)
        return new Uint8Array(u2);
      if (ne(c2))
        try {
          var d2 = ac(c2.slice(37)), g2 = new Uint8Array(d2.length);
          for (c2 = 0; c2 < d2.length; ++c2)
            g2[c2] = d2.charCodeAt(c2);
          var v2 = g2;
        } catch {
          throw Error("Converting base64 string to bytes failed.");
        }
      else
        v2 = void 0;
      var x2 = v2;
      if (x2)
        return x2;
      throw "both async and sync fetching of the wasm failed";
    } catch (E) {
      Z(E);
    }
  }
  function Ee() {
    return u2 || typeof fetch != "function" ? Promise.resolve().then(function() {
      return Re();
    }) : fetch(ke, { credentials: "same-origin" }).then(function(c2) {
      if (!c2.ok)
        throw "failed to load wasm binary file at '" + ke + "'";
      return c2.arrayBuffer();
    }).catch(function() {
      return Re();
    });
  }
  function Ye(c2) {
    for (; 0 < c2.length; )
      c2.shift()(t);
  }
  function Me(c2) {
    if (c2 === void 0)
      return "_unknown";
    c2 = c2.replace(/[^a-zA-Z0-9_]/g, "$");
    var d2 = c2.charCodeAt(0);
    return 48 <= d2 && 57 >= d2 ? "_" + c2 : c2;
  }
  function Oe(c2, d2) {
    return c2 = Me(c2), function() {
      return d2.apply(this, arguments);
    };
  }
  var le = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }], H = [];
  function J(c2) {
    var d2 = Error, g2 = Oe(c2, function(v2) {
      this.name = c2, this.message = v2, v2 = Error(v2).stack, v2 !== void 0 && (this.stack = this.toString() + `
` + v2.replace(/^Error(:[^\n]*)?\n/, ""));
    });
    return g2.prototype = Object.create(d2.prototype), g2.prototype.constructor = g2, g2.prototype.toString = function() {
      return this.message === void 0 ? this.name : this.name + ": " + this.message;
    }, g2;
  }
  var pe = void 0;
  function G(c2) {
    throw new pe(c2);
  }
  var Le = (c2) => (c2 || G("Cannot use deleted val. handle = " + c2), le[c2].value), De = (c2) => {
    switch (c2) {
      case void 0:
        return 1;
      case null:
        return 2;
      case true:
        return 3;
      case false:
        return 4;
      default:
        var d2 = H.length ? H.pop() : le.length;
        return le[d2] = { ga: 1, value: c2 }, d2;
    }
  }, Ue = void 0, $e = void 0;
  function ie(c2) {
    for (var d2 = ""; y[c2]; )
      d2 += $e[y[c2++]];
    return d2;
  }
  var _t = [];
  function $t() {
    for (; _t.length; ) {
      var c2 = _t.pop();
      c2.M.$ = false, c2.delete();
    }
  }
  var Tt = void 0, Ne = {};
  function fr(c2, d2) {
    for (d2 === void 0 && G("ptr should not be undefined"); c2.R; )
      d2 = c2.ba(d2), c2 = c2.R;
    return d2;
  }
  var kt = {};
  function Pr(c2) {
    c2 = Zs(c2);
    var d2 = ie(c2);
    return Ct(c2), d2;
  }
  function Qt(c2, d2) {
    var g2 = kt[c2];
    return g2 === void 0 && G(d2 + " has unknown type " + Pr(c2)), g2;
  }
  function cr() {
  }
  var dr = false;
  function Kt(c2) {
    --c2.count.value, c2.count.value === 0 && (c2.T ? c2.U.W(c2.T) : c2.P.N.W(c2.O));
  }
  function Et(c2, d2, g2) {
    return d2 === g2 ? c2 : g2.R === void 0 ? null : (c2 = Et(c2, d2, g2.R), c2 === null ? null : g2.na(c2));
  }
  var pt = {};
  function nt(c2, d2) {
    return d2 = fr(c2, d2), Ne[d2];
  }
  var Jt = void 0;
  function Xe(c2) {
    throw new Jt(c2);
  }
  function ht(c2, d2) {
    return d2.P && d2.O || Xe("makeClassHandle requires ptr and ptrType"), !!d2.U != !!d2.T && Xe("Both smartPtrType and smartPtr must be specified"), d2.count = { value: 1 }, mt(Object.create(c2, { M: { value: d2 } }));
  }
  function mt(c2) {
    return typeof FinalizationRegistry > "u" ? (mt = (d2) => d2, c2) : (dr = new FinalizationRegistry((d2) => {
      Kt(d2.M);
    }), mt = (d2) => {
      var g2 = d2.M;
      return g2.T && dr.register(d2, { M: g2 }, d2), d2;
    }, cr = (d2) => {
      dr.unregister(d2);
    }, mt(c2));
  }
  var Zt = {};
  function qt(c2) {
    for (; c2.length; ) {
      var d2 = c2.pop();
      c2.pop()(d2);
    }
  }
  function Ge(c2) {
    return this.fromWireType(P2[c2 >> 2]);
  }
  var it = {}, Ze = {};
  function gt(c2, d2, g2) {
    function v2(R2) {
      R2 = g2(R2), R2.length !== c2.length && Xe("Mismatched type converter count");
      for (var N = 0; N < c2.length; ++N)
        j(c2[N], R2[N]);
    }
    c2.forEach(function(R2) {
      Ze[R2] = d2;
    });
    var x2 = Array(d2.length), E = [], A = 0;
    d2.forEach((R2, N) => {
      kt.hasOwnProperty(R2) ? x2[N] = kt[R2] : (E.push(R2), it.hasOwnProperty(R2) || (it[R2] = []), it[R2].push(() => {
        x2[N] = kt[R2], ++A, A === E.length && v2(x2);
      }));
    }), E.length === 0 && v2(x2);
  }
  function Y(c2) {
    switch (c2) {
      case 1:
        return 0;
      case 2:
        return 1;
      case 4:
        return 2;
      case 8:
        return 3;
      default:
        throw new TypeError("Unknown type size: " + c2);
    }
  }
  function j(c2, d2, g2 = {}) {
    if (!("argPackAdvance" in d2))
      throw new TypeError("registerType registeredInstance requires argPackAdvance");
    var v2 = d2.name;
    if (c2 || G('type "' + v2 + '" must have a positive integer typeid pointer'), kt.hasOwnProperty(c2)) {
      if (g2.ua)
        return;
      G("Cannot register type '" + v2 + "' twice");
    }
    kt[c2] = d2, delete Ze[c2], it.hasOwnProperty(c2) && (d2 = it[c2], delete it[c2], d2.forEach((x2) => x2()));
  }
  function fe(c2) {
    G(c2.M.P.N.name + " instance already deleted");
  }
  function K2() {
  }
  function ye(c2, d2, g2) {
    if (c2[d2].S === void 0) {
      var v2 = c2[d2];
      c2[d2] = function() {
        return c2[d2].S.hasOwnProperty(arguments.length) || G("Function '" + g2 + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + c2[d2].S + ")!"), c2[d2].S[arguments.length].apply(this, arguments);
      }, c2[d2].S = [], c2[d2].S[v2.Z] = v2;
    }
  }
  function ae(c2, d2) {
    t.hasOwnProperty(c2) ? (G("Cannot register public name '" + c2 + "' twice"), ye(t, c2, c2), t.hasOwnProperty(void 0) && G("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"), t[c2].S[void 0] = d2) : t[c2] = d2;
  }
  function xe(c2, d2, g2, v2, x2, E, A, R2) {
    this.name = c2, this.constructor = d2, this.X = g2, this.W = v2, this.R = x2, this.pa = E, this.ba = A, this.na = R2, this.ja = [];
  }
  function ee(c2, d2, g2) {
    for (; d2 !== g2; )
      d2.ba || G("Expected null or instance of " + g2.name + ", got an instance of " + d2.name), c2 = d2.ba(c2), d2 = d2.R;
    return c2;
  }
  function te(c2, d2) {
    return d2 === null ? (this.ea && G("null is not a valid " + this.name), 0) : (d2.M || G('Cannot pass "' + et2(d2) + '" as a ' + this.name), d2.M.O || G("Cannot pass deleted object as a pointer of type " + this.name), ee(d2.M.O, d2.M.P.N, this.N));
  }
  function ot(c2, d2) {
    if (d2 === null) {
      if (this.ea && G("null is not a valid " + this.name), this.da) {
        var g2 = this.fa();
        return c2 !== null && c2.push(this.W, g2), g2;
      }
      return 0;
    }
    if (d2.M || G('Cannot pass "' + et2(d2) + '" as a ' + this.name), d2.M.O || G("Cannot pass deleted object as a pointer of type " + this.name), !this.ca && d2.M.P.ca && G("Cannot convert argument of type " + (d2.M.U ? d2.M.U.name : d2.M.P.name) + " to parameter type " + this.name), g2 = ee(d2.M.O, d2.M.P.N, this.N), this.da)
      switch (d2.M.T === void 0 && G("Passing raw pointer to smart pointer is illegal"), this.Ba) {
        case 0:
          d2.M.U === this ? g2 = d2.M.T : G("Cannot convert argument of type " + (d2.M.U ? d2.M.U.name : d2.M.P.name) + " to parameter type " + this.name);
          break;
        case 1:
          g2 = d2.M.T;
          break;
        case 2:
          if (d2.M.U === this)
            g2 = d2.M.T;
          else {
            var v2 = d2.clone();
            g2 = this.xa(g2, De(function() {
              v2.delete();
            })), c2 !== null && c2.push(this.W, g2);
          }
          break;
        default:
          G("Unsupporting sharing policy");
      }
    return g2;
  }
  function Q(c2, d2) {
    return d2 === null ? (this.ea && G("null is not a valid " + this.name), 0) : (d2.M || G('Cannot pass "' + et2(d2) + '" as a ' + this.name), d2.M.O || G("Cannot pass deleted object as a pointer of type " + this.name), d2.M.P.ca && G("Cannot convert argument of type " + d2.M.P.name + " to parameter type " + this.name), ee(d2.M.O, d2.M.P.N, this.N));
  }
  function We(c2, d2, g2, v2) {
    this.name = c2, this.N = d2, this.ea = g2, this.ca = v2, this.da = false, this.W = this.xa = this.fa = this.ka = this.Ba = this.wa = void 0, d2.R !== void 0 ? this.toWireType = ot : (this.toWireType = v2 ? te : Q, this.V = null);
  }
  function ze(c2, d2) {
    t.hasOwnProperty(c2) || Xe("Replacing nonexistant public symbol"), t[c2] = d2, t[c2].Z = void 0;
  }
  function Ar(c2, d2) {
    var g2 = [];
    return function() {
      if (g2.length = 0, Object.assign(g2, arguments), c2.includes("j")) {
        var v2 = t["dynCall_" + c2];
        v2 = g2 && g2.length ? v2.apply(null, [d2].concat(g2)) : v2.call(null, d2);
      } else
        v2 = F.get(d2).apply(null, g2);
      return v2;
    };
  }
  function Pe(c2, d2) {
    c2 = ie(c2);
    var g2 = c2.includes("j") ? Ar(c2, d2) : F.get(d2);
    return typeof g2 != "function" && G("unknown function pointer with signature " + c2 + ": " + d2), g2;
  }
  var er = void 0;
  function qe(c2, d2) {
    function g2(E) {
      x2[E] || kt[E] || (Ze[E] ? Ze[E].forEach(g2) : (v2.push(E), x2[E] = true));
    }
    var v2 = [], x2 = {};
    throw d2.forEach(g2), new er(c2 + ": " + v2.map(Pr).join([", "]));
  }
  function Rt(c2, d2, g2, v2, x2) {
    var E = d2.length;
    2 > E && G("argTypes array size mismatch! Must at least get return value and 'this' types!");
    var A = d2[1] !== null && g2 !== null, R2 = false;
    for (g2 = 1; g2 < d2.length; ++g2)
      if (d2[g2] !== null && d2[g2].V === void 0) {
        R2 = true;
        break;
      }
    var N = d2[0].name !== "void", L = E - 2, D = Array(L), z = [], re = [];
    return function() {
      if (arguments.length !== L && G("function " + c2 + " called with " + arguments.length + " arguments, expected " + L + " args!"), re.length = 0, z.length = A ? 2 : 1, z[0] = x2, A) {
        var Ce = d2[1].toWireType(re, this);
        z[1] = Ce;
      }
      for (var ce = 0; ce < L; ++ce)
        D[ce] = d2[ce + 2].toWireType(re, arguments[ce]), z.push(D[ce]);
      if (ce = v2.apply(null, z), R2)
        qt(re);
      else
        for (var rt = A ? 1 : 2; rt < d2.length; rt++) {
          var yt = rt === 1 ? Ce : D[rt - 2];
          d2[rt].V !== null && d2[rt].V(yt);
        }
      return Ce = N ? d2[0].fromWireType(ce) : void 0, Ce;
    };
  }
  function we(c2, d2) {
    for (var g2 = [], v2 = 0; v2 < c2; v2++)
      g2.push(w2[d2 + 4 * v2 >> 2]);
    return g2;
  }
  function Te(c2) {
    4 < c2 && --le[c2].ga === 0 && (le[c2] = void 0, H.push(c2));
  }
  function et2(c2) {
    if (c2 === null)
      return "null";
    var d2 = typeof c2;
    return d2 === "object" || d2 === "array" || d2 === "function" ? c2.toString() : "" + c2;
  }
  function tt(c2, d2) {
    switch (d2) {
      case 2:
        return function(g2) {
          return this.fromWireType(S2[g2 >> 2]);
        };
      case 3:
        return function(g2) {
          return this.fromWireType(O[g2 >> 3]);
        };
      default:
        throw new TypeError("Unknown float type: " + c2);
    }
  }
  function bt(c2, d2, g2) {
    switch (d2) {
      case 0:
        return g2 ? function(v2) {
          return b[v2];
        } : function(v2) {
          return y[v2];
        };
      case 1:
        return g2 ? function(v2) {
          return T[v2 >> 1];
        } : function(v2) {
          return k[v2 >> 1];
        };
      case 2:
        return g2 ? function(v2) {
          return P2[v2 >> 2];
        } : function(v2) {
          return w2[v2 >> 2];
        };
      default:
        throw new TypeError("Unknown integer type: " + c2);
    }
  }
  function vt(c2, d2) {
    for (var g2 = "", v2 = 0; !(v2 >= d2 / 2); ++v2) {
      var x2 = T[c2 + 2 * v2 >> 1];
      if (x2 == 0)
        break;
      g2 += String.fromCharCode(x2);
    }
    return g2;
  }
  function je(c2, d2, g2) {
    if (g2 === void 0 && (g2 = 2147483647), 2 > g2)
      return 0;
    g2 -= 2;
    var v2 = d2;
    g2 = g2 < 2 * c2.length ? g2 / 2 : c2.length;
    for (var x2 = 0; x2 < g2; ++x2)
      T[d2 >> 1] = c2.charCodeAt(x2), d2 += 2;
    return T[d2 >> 1] = 0, d2 - v2;
  }
  function st(c2) {
    return 2 * c2.length;
  }
  function Ir(c2, d2) {
    for (var g2 = 0, v2 = ""; !(g2 >= d2 / 4); ) {
      var x2 = P2[c2 + 4 * g2 >> 2];
      if (x2 == 0)
        break;
      ++g2, 65536 <= x2 ? (x2 -= 65536, v2 += String.fromCharCode(55296 | x2 >> 10, 56320 | x2 & 1023)) : v2 += String.fromCharCode(x2);
    }
    return v2;
  }
  function pr(c2, d2, g2) {
    if (g2 === void 0 && (g2 = 2147483647), 4 > g2)
      return 0;
    var v2 = d2;
    g2 = v2 + g2 - 4;
    for (var x2 = 0; x2 < c2.length; ++x2) {
      var E = c2.charCodeAt(x2);
      if (55296 <= E && 57343 >= E) {
        var A = c2.charCodeAt(++x2);
        E = 65536 + ((E & 1023) << 10) | A & 1023;
      }
      if (P2[d2 >> 2] = E, d2 += 4, d2 + 4 > g2)
        break;
    }
    return P2[d2 >> 2] = 0, d2 - v2;
  }
  function In(c2) {
    for (var d2 = 0, g2 = 0; g2 < c2.length; ++g2) {
      var v2 = c2.charCodeAt(g2);
      55296 <= v2 && 57343 >= v2 && ++g2, d2 += 4;
    }
    return d2;
  }
  var Rn = {};
  function Rr(c2) {
    var d2 = Rn[c2];
    return d2 === void 0 ? ie(c2) : d2;
  }
  var Cn = [];
  function ic(c2) {
    var d2 = Cn.length;
    return Cn.push(c2), d2;
  }
  function oc(c2, d2) {
    for (var g2 = Array(c2), v2 = 0; v2 < c2; ++v2)
      g2[v2] = Qt(w2[d2 + 4 * v2 >> 2], "parameter " + v2);
    return g2;
  }
  var Ks = [], sc = [null, [], []];
  pe = t.BindingError = J("BindingError"), t.count_emval_handles = function() {
    for (var c2 = 0, d2 = 5; d2 < le.length; ++d2)
      le[d2] !== void 0 && ++c2;
    return c2;
  }, t.get_first_emval = function() {
    for (var c2 = 5; c2 < le.length; ++c2)
      if (le[c2] !== void 0)
        return le[c2];
    return null;
  }, Ue = t.PureVirtualError = J("PureVirtualError");
  for (var Js = Array(256), Ln = 0; 256 > Ln; ++Ln)
    Js[Ln] = String.fromCharCode(Ln);
  $e = Js, t.getInheritedInstanceCount = function() {
    return Object.keys(Ne).length;
  }, t.getLiveInheritedInstances = function() {
    var c2 = [], d2;
    for (d2 in Ne)
      Ne.hasOwnProperty(d2) && c2.push(Ne[d2]);
    return c2;
  }, t.flushPendingDeletes = $t, t.setDelayFunction = function(c2) {
    Tt = c2, _t.length && Tt && Tt($t);
  }, Jt = t.InternalError = J("InternalError"), K2.prototype.isAliasOf = function(c2) {
    if (!(this instanceof K2 && c2 instanceof K2))
      return false;
    var d2 = this.M.P.N, g2 = this.M.O, v2 = c2.M.P.N;
    for (c2 = c2.M.O; d2.R; )
      g2 = d2.ba(g2), d2 = d2.R;
    for (; v2.R; )
      c2 = v2.ba(c2), v2 = v2.R;
    return d2 === v2 && g2 === c2;
  }, K2.prototype.clone = function() {
    if (this.M.O || fe(this), this.M.aa)
      return this.M.count.value += 1, this;
    var c2 = mt, d2 = Object, g2 = d2.create, v2 = Object.getPrototypeOf(this), x2 = this.M;
    return c2 = c2(g2.call(d2, v2, { M: { value: { count: x2.count, $: x2.$, aa: x2.aa, O: x2.O, P: x2.P, T: x2.T, U: x2.U } } })), c2.M.count.value += 1, c2.M.$ = false, c2;
  }, K2.prototype.delete = function() {
    this.M.O || fe(this), this.M.$ && !this.M.aa && G("Object already scheduled for deletion"), cr(this), Kt(this.M), this.M.aa || (this.M.T = void 0, this.M.O = void 0);
  }, K2.prototype.isDeleted = function() {
    return !this.M.O;
  }, K2.prototype.deleteLater = function() {
    return this.M.O || fe(this), this.M.$ && !this.M.aa && G("Object already scheduled for deletion"), _t.push(this), _t.length === 1 && Tt && Tt($t), this.M.$ = true, this;
  }, We.prototype.qa = function(c2) {
    return this.ka && (c2 = this.ka(c2)), c2;
  }, We.prototype.ha = function(c2) {
    this.W && this.W(c2);
  }, We.prototype.argPackAdvance = 8, We.prototype.readValueFromPointer = Ge, We.prototype.deleteObject = function(c2) {
    c2 !== null && c2.delete();
  }, We.prototype.fromWireType = function(c2) {
    function d2() {
      return this.da ? ht(this.N.X, { P: this.wa, O: g2, U: this, T: c2 }) : ht(this.N.X, { P: this, O: c2 });
    }
    var g2 = this.qa(c2);
    if (!g2)
      return this.ha(c2), null;
    var v2 = nt(this.N, g2);
    if (v2 !== void 0)
      return v2.M.count.value === 0 ? (v2.M.O = g2, v2.M.T = c2, v2.clone()) : (v2 = v2.clone(), this.ha(c2), v2);
    if (v2 = this.N.pa(g2), v2 = pt[v2], !v2)
      return d2.call(this);
    v2 = this.ca ? v2.la : v2.pointerType;
    var x2 = Et(g2, this.N, v2.N);
    return x2 === null ? d2.call(this) : this.da ? ht(v2.N.X, { P: v2, O: x2, U: this, T: c2 }) : ht(v2.N.X, { P: v2, O: x2 });
  }, er = t.UnboundTypeError = J("UnboundTypeError");
  var ac = typeof atob == "function" ? atob : function(c2) {
    var d2 = "", g2 = 0;
    c2 = c2.replace(/[^A-Za-z0-9\+\/=]/g, "");
    do {
      var v2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(c2.charAt(g2++)), x2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(c2.charAt(g2++)), E = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(c2.charAt(g2++)), A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(c2.charAt(g2++));
      v2 = v2 << 2 | x2 >> 4, x2 = (x2 & 15) << 4 | E >> 2;
      var R2 = (E & 3) << 6 | A;
      d2 += String.fromCharCode(v2), E !== 64 && (d2 += String.fromCharCode(x2)), A !== 64 && (d2 += String.fromCharCode(R2));
    } while (g2 < c2.length);
    return d2;
  }, uc = { l: function(c2, d2, g2, v2) {
    Z("Assertion failed: " + (c2 ? h2(y, c2) : "") + ", at: " + [d2 ? d2 ? h2(y, d2) : "" : "unknown filename", g2, v2 ? v2 ? h2(y, v2) : "" : "unknown function"]);
  }, q: function(c2, d2, g2) {
    c2 = ie(c2), d2 = Qt(d2, "wrapper"), g2 = Le(g2);
    var v2 = [].slice, x2 = d2.N, E = x2.X, A = x2.R.X, R2 = x2.R.constructor;
    c2 = Oe(c2, function() {
      x2.R.ja.forEach(function(L) {
        if (this[L] === A[L])
          throw new Ue("Pure virtual function " + L + " must be implemented in JavaScript");
      }.bind(this)), Object.defineProperty(this, "__parent", { value: E }), this.__construct.apply(this, v2.call(arguments));
    }), E.__construct = function() {
      this === E && G("Pass correct 'this' to __construct");
      var L = R2.implement.apply(void 0, [this].concat(v2.call(arguments)));
      cr(L);
      var D = L.M;
      L.notifyOnDestruction(), D.aa = true, Object.defineProperties(this, { M: { value: D } }), mt(this), L = D.O, L = fr(x2, L), Ne.hasOwnProperty(L) ? G("Tried to register registered instance: " + L) : Ne[L] = this;
    }, E.__destruct = function() {
      this === E && G("Pass correct 'this' to __destruct"), cr(this);
      var L = this.M.O;
      L = fr(x2, L), Ne.hasOwnProperty(L) ? delete Ne[L] : G("Tried to unregister unregistered instance: " + L);
    }, c2.prototype = Object.create(E);
    for (var N in g2)
      c2.prototype[N] = g2[N];
    return De(c2);
  }, j: function(c2) {
    var d2 = Zt[c2];
    delete Zt[c2];
    var g2 = d2.fa, v2 = d2.W, x2 = d2.ia, E = x2.map((A) => A.ta).concat(x2.map((A) => A.za));
    gt([c2], E, (A) => {
      var R2 = {};
      return x2.forEach((N, L) => {
        var D = A[L], z = N.ra, re = N.sa, Ce = A[L + x2.length], ce = N.ya, rt = N.Aa;
        R2[N.oa] = { read: (yt) => D.fromWireType(z(re, yt)), write: (yt, Cr) => {
          var Lt = [];
          ce(rt, yt, Ce.toWireType(Lt, Cr)), qt(Lt);
        } };
      }), [{ name: d2.name, fromWireType: function(N) {
        var L = {}, D;
        for (D in R2)
          L[D] = R2[D].read(N);
        return v2(N), L;
      }, toWireType: function(N, L) {
        for (var D in R2)
          if (!(D in L))
            throw new TypeError('Missing field:  "' + D + '"');
        var z = g2();
        for (D in R2)
          R2[D].write(z, L[D]);
        return N !== null && N.push(v2, z), z;
      }, argPackAdvance: 8, readValueFromPointer: Ge, V: v2 }];
    });
  }, v: function() {
  }, B: function(c2, d2, g2, v2, x2) {
    var E = Y(g2);
    d2 = ie(d2), j(c2, { name: d2, fromWireType: function(A) {
      return !!A;
    }, toWireType: function(A, R2) {
      return R2 ? v2 : x2;
    }, argPackAdvance: 8, readValueFromPointer: function(A) {
      if (g2 === 1)
        var R2 = b;
      else if (g2 === 2)
        R2 = T;
      else if (g2 === 4)
        R2 = P2;
      else
        throw new TypeError("Unknown boolean type size: " + d2);
      return this.fromWireType(R2[A >> E]);
    }, V: null });
  }, f: function(c2, d2, g2, v2, x2, E, A, R2, N, L, D, z, re) {
    D = ie(D), E = Pe(x2, E), R2 && (R2 = Pe(A, R2)), L && (L = Pe(N, L)), re = Pe(z, re);
    var Ce = Me(D);
    ae(Ce, function() {
      qe("Cannot construct " + D + " due to unbound types", [v2]);
    }), gt([c2, d2, g2], v2 ? [v2] : [], function(ce) {
      if (ce = ce[0], v2)
        var rt = ce.N, yt = rt.X;
      else
        yt = K2.prototype;
      ce = Oe(Ce, function() {
        if (Object.getPrototypeOf(this) !== Cr)
          throw new pe("Use 'new' to construct " + D);
        if (Lt.Y === void 0)
          throw new pe(D + " has no accessible constructor");
        var ra = Lt.Y[arguments.length];
        if (ra === void 0)
          throw new pe("Tried to invoke ctor of " + D + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(Lt.Y).toString() + ") parameters instead!");
        return ra.apply(this, arguments);
      });
      var Cr = Object.create(yt, { constructor: { value: ce } });
      ce.prototype = Cr;
      var Lt = new xe(D, ce, Cr, re, rt, E, R2, L);
      rt = new We(D, Lt, true, false), yt = new We(D + "*", Lt, false, false);
      var ta = new We(D + " const*", Lt, false, true);
      return pt[c2] = { pointerType: yt, la: ta }, ze(Ce, ce), [rt, yt, ta];
    });
  }, d: function(c2, d2, g2, v2, x2, E, A) {
    var R2 = we(g2, v2);
    d2 = ie(d2), E = Pe(x2, E), gt([], [c2], function(N) {
      function L() {
        qe("Cannot call " + D + " due to unbound types", R2);
      }
      N = N[0];
      var D = N.name + "." + d2;
      d2.startsWith("@@") && (d2 = Symbol[d2.substring(2)]);
      var z = N.N.constructor;
      return z[d2] === void 0 ? (L.Z = g2 - 1, z[d2] = L) : (ye(z, d2, D), z[d2].S[g2 - 1] = L), gt([], R2, function(re) {
        return re = Rt(D, [re[0], null].concat(re.slice(1)), null, E, A), z[d2].S === void 0 ? (re.Z = g2 - 1, z[d2] = re) : z[d2].S[g2 - 1] = re, [];
      }), [];
    });
  }, p: function(c2, d2, g2, v2, x2, E) {
    0 < d2 || Z();
    var A = we(d2, g2);
    x2 = Pe(v2, x2), gt([], [c2], function(R2) {
      R2 = R2[0];
      var N = "constructor " + R2.name;
      if (R2.N.Y === void 0 && (R2.N.Y = []), R2.N.Y[d2 - 1] !== void 0)
        throw new pe("Cannot register multiple constructors with identical number of parameters (" + (d2 - 1) + ") for class '" + R2.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
      return R2.N.Y[d2 - 1] = () => {
        qe("Cannot construct " + R2.name + " due to unbound types", A);
      }, gt([], A, function(L) {
        return L.splice(1, 0, null), R2.N.Y[d2 - 1] = Rt(N, L, null, x2, E), [];
      }), [];
    });
  }, a: function(c2, d2, g2, v2, x2, E, A, R2) {
    var N = we(g2, v2);
    d2 = ie(d2), E = Pe(x2, E), gt([], [c2], function(L) {
      function D() {
        qe("Cannot call " + z + " due to unbound types", N);
      }
      L = L[0];
      var z = L.name + "." + d2;
      d2.startsWith("@@") && (d2 = Symbol[d2.substring(2)]), R2 && L.N.ja.push(d2);
      var re = L.N.X, Ce = re[d2];
      return Ce === void 0 || Ce.S === void 0 && Ce.className !== L.name && Ce.Z === g2 - 2 ? (D.Z = g2 - 2, D.className = L.name, re[d2] = D) : (ye(re, d2, z), re[d2].S[g2 - 2] = D), gt([], N, function(ce) {
        return ce = Rt(z, ce, L, E, A), re[d2].S === void 0 ? (ce.Z = g2 - 2, re[d2] = ce) : re[d2].S[g2 - 2] = ce, [];
      }), [];
    });
  }, A: function(c2, d2) {
    d2 = ie(d2), j(c2, { name: d2, fromWireType: function(g2) {
      var v2 = Le(g2);
      return Te(g2), v2;
    }, toWireType: function(g2, v2) {
      return De(v2);
    }, argPackAdvance: 8, readValueFromPointer: Ge, V: null });
  }, n: function(c2, d2, g2) {
    g2 = Y(g2), d2 = ie(d2), j(c2, { name: d2, fromWireType: function(v2) {
      return v2;
    }, toWireType: function(v2, x2) {
      return x2;
    }, argPackAdvance: 8, readValueFromPointer: tt(d2, g2), V: null });
  }, e: function(c2, d2, g2, v2, x2) {
    d2 = ie(d2), x2 === -1 && (x2 = 4294967295), x2 = Y(g2);
    var E = (R2) => R2;
    if (v2 === 0) {
      var A = 32 - 8 * g2;
      E = (R2) => R2 << A >>> A;
    }
    g2 = d2.includes("unsigned") ? function(R2, N) {
      return N >>> 0;
    } : function(R2, N) {
      return N;
    }, j(c2, { name: d2, fromWireType: E, toWireType: g2, argPackAdvance: 8, readValueFromPointer: bt(d2, x2, v2 !== 0), V: null });
  }, b: function(c2, d2, g2) {
    function v2(E) {
      E >>= 2;
      var A = w2;
      return new x2(m2, A[E + 1], A[E]);
    }
    var x2 = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][d2];
    g2 = ie(g2), j(c2, { name: g2, fromWireType: v2, argPackAdvance: 8, readValueFromPointer: v2 }, { ua: true });
  }, o: function(c2, d2) {
    d2 = ie(d2);
    var g2 = d2 === "std::string";
    j(c2, { name: d2, fromWireType: function(v2) {
      var x2 = w2[v2 >> 2], E = v2 + 4;
      if (g2)
        for (var A = E, R2 = 0; R2 <= x2; ++R2) {
          var N = E + R2;
          if (R2 == x2 || y[N] == 0) {
            if (A = A ? h2(y, A, N - A) : "", L === void 0)
              var L = A;
            else
              L += String.fromCharCode(0), L += A;
            A = N + 1;
          }
        }
      else {
        for (L = Array(x2), R2 = 0; R2 < x2; ++R2)
          L[R2] = String.fromCharCode(y[E + R2]);
        L = L.join("");
      }
      return Ct(v2), L;
    }, toWireType: function(v2, x2) {
      x2 instanceof ArrayBuffer && (x2 = new Uint8Array(x2));
      var E, A = typeof x2 == "string";
      if (A || x2 instanceof Uint8Array || x2 instanceof Uint8ClampedArray || x2 instanceof Int8Array || G("Cannot pass non-string to std::string"), g2 && A) {
        var R2 = 0;
        for (E = 0; E < x2.length; ++E) {
          var N = x2.charCodeAt(E);
          127 >= N ? R2++ : 2047 >= N ? R2 += 2 : 55296 <= N && 57343 >= N ? (R2 += 4, ++E) : R2 += 3;
        }
        E = R2;
      } else
        E = x2.length;
      if (R2 = _i(4 + E + 1), N = R2 + 4, w2[R2 >> 2] = E, g2 && A) {
        if (A = N, N = E + 1, E = y, 0 < N) {
          N = A + N - 1;
          for (var L = 0; L < x2.length; ++L) {
            var D = x2.charCodeAt(L);
            if (55296 <= D && 57343 >= D) {
              var z = x2.charCodeAt(++L);
              D = 65536 + ((D & 1023) << 10) | z & 1023;
            }
            if (127 >= D) {
              if (A >= N)
                break;
              E[A++] = D;
            } else {
              if (2047 >= D) {
                if (A + 1 >= N)
                  break;
                E[A++] = 192 | D >> 6;
              } else {
                if (65535 >= D) {
                  if (A + 2 >= N)
                    break;
                  E[A++] = 224 | D >> 12;
                } else {
                  if (A + 3 >= N)
                    break;
                  E[A++] = 240 | D >> 18, E[A++] = 128 | D >> 12 & 63;
                }
                E[A++] = 128 | D >> 6 & 63;
              }
              E[A++] = 128 | D & 63;
            }
          }
          E[A] = 0;
        }
      } else if (A)
        for (A = 0; A < E; ++A)
          L = x2.charCodeAt(A), 255 < L && (Ct(N), G("String has UTF-16 code units that do not fit in 8 bits")), y[N + A] = L;
      else
        for (A = 0; A < E; ++A)
          y[N + A] = x2[A];
      return v2 !== null && v2.push(Ct, R2), R2;
    }, argPackAdvance: 8, readValueFromPointer: Ge, V: function(v2) {
      Ct(v2);
    } });
  }, i: function(c2, d2, g2) {
    if (g2 = ie(g2), d2 === 2)
      var v2 = vt, x2 = je, E = st, A = () => k, R2 = 1;
    else
      d2 === 4 && (v2 = Ir, x2 = pr, E = In, A = () => w2, R2 = 2);
    j(c2, { name: g2, fromWireType: function(N) {
      for (var L = w2[N >> 2], D = A(), z, re = N + 4, Ce = 0; Ce <= L; ++Ce) {
        var ce = N + 4 + Ce * d2;
        (Ce == L || D[ce >> R2] == 0) && (re = v2(re, ce - re), z === void 0 ? z = re : (z += String.fromCharCode(0), z += re), re = ce + d2);
      }
      return Ct(N), z;
    }, toWireType: function(N, L) {
      typeof L != "string" && G("Cannot pass non-string to C++ string type " + g2);
      var D = E(L), z = _i(4 + D + d2);
      return w2[z >> 2] = D >> R2, x2(L, z + 4, D + d2), N !== null && N.push(Ct, z), z;
    }, argPackAdvance: 8, readValueFromPointer: Ge, V: function(N) {
      Ct(N);
    } });
  }, k: function(c2, d2, g2, v2, x2, E) {
    Zt[c2] = { name: ie(d2), fa: Pe(g2, v2), W: Pe(x2, E), ia: [] };
  }, h: function(c2, d2, g2, v2, x2, E, A, R2, N, L) {
    Zt[c2].ia.push({ oa: ie(d2), ta: g2, ra: Pe(v2, x2), sa: E, za: A, ya: Pe(R2, N), Aa: L });
  }, C: function(c2, d2) {
    d2 = ie(d2), j(c2, { va: true, name: d2, argPackAdvance: 0, fromWireType: function() {
    }, toWireType: function() {
    } });
  }, s: function(c2, d2, g2, v2, x2) {
    c2 = Cn[c2], d2 = Le(d2), g2 = Rr(g2);
    var E = [];
    return w2[v2 >> 2] = De(E), c2(d2, g2, E, x2);
  }, t: function(c2, d2, g2, v2) {
    c2 = Cn[c2], d2 = Le(d2), g2 = Rr(g2), c2(d2, g2, null, v2);
  }, g: Te, m: function(c2, d2) {
    var g2 = oc(c2, d2), v2 = g2[0];
    d2 = v2.name + "_$" + g2.slice(1).map(function(A) {
      return A.name;
    }).join("_") + "$";
    var x2 = Ks[d2];
    if (x2 !== void 0)
      return x2;
    var E = Array(c2 - 1);
    return x2 = ic((A, R2, N, L) => {
      for (var D = 0, z = 0; z < c2 - 1; ++z)
        E[z] = g2[z + 1].readValueFromPointer(L + D), D += g2[z + 1].argPackAdvance;
      for (A = A[R2].apply(A, E), z = 0; z < c2 - 1; ++z)
        g2[z + 1].ma && g2[z + 1].ma(E[z]);
      if (!v2.va)
        return v2.toWireType(N, A);
    }), Ks[d2] = x2;
  }, D: function(c2) {
    4 < c2 && (le[c2].ga += 1);
  }, r: function(c2) {
    var d2 = Le(c2);
    qt(d2), Te(c2);
  }, c: function() {
    Z("");
  }, x: function(c2, d2, g2) {
    y.copyWithin(c2, d2, d2 + g2);
  }, w: function(c2) {
    var d2 = y.length;
    if (c2 >>>= 0, 2147483648 < c2)
      return false;
    for (var g2 = 1; 4 >= g2; g2 *= 2) {
      var v2 = d2 * (1 + 0.2 / g2);
      v2 = Math.min(v2, c2 + 100663296);
      var x2 = Math;
      v2 = Math.max(c2, v2), x2 = x2.min.call(x2, 2147483648, v2 + (65536 - v2 % 65536) % 65536);
      e: {
        try {
          l2.grow(x2 - m2.byteLength + 65535 >>> 16), I();
          var E = 1;
          break e;
        } catch {
        }
        E = void 0;
      }
      if (E)
        return true;
    }
    return false;
  }, z: function() {
    return 52;
  }, u: function() {
    return 70;
  }, y: function(c2, d2, g2, v2) {
    for (var x2 = 0, E = 0; E < g2; E++) {
      var A = w2[d2 >> 2], R2 = w2[d2 + 4 >> 2];
      d2 += 8;
      for (var N = 0; N < R2; N++) {
        var L = y[A + N], D = sc[c2];
        L === 0 || L === 10 ? ((c2 === 1 ? s : a)(h2(D, 0)), D.length = 0) : D.push(L);
      }
      x2 += R2;
    }
    return w2[v2 >> 2] = x2, 0;
  } };
  (function() {
    function c2(x2) {
      t.asm = x2.exports, l2 = t.asm.E, I(), F = t.asm.J, V.unshift(t.asm.F), me--, t.monitorRunDependencies && t.monitorRunDependencies(me), me == 0 && (ue !== null && (clearInterval(ue), ue = null), Ie && (x2 = Ie, Ie = null, x2()));
    }
    function d2(x2) {
      c2(x2.instance);
    }
    function g2(x2) {
      return Ee().then(function(E) {
        return E instanceof WebAssembly.Instance ? E : WebAssembly.instantiate(E, v2);
      }).then(function(E) {
        return E;
      }).then(x2, function(E) {
        a("failed to asynchronously prepare wasm: " + E), Z(E);
      });
    }
    var v2 = { a: uc };
    if (me++, t.monitorRunDependencies && t.monitorRunDependencies(me), t.instantiateWasm)
      try {
        return t.instantiateWasm(v2, c2);
      } catch (x2) {
        a("Module.instantiateWasm callback failed with error: " + x2), r(x2);
      }
    return function() {
      return u2 || typeof WebAssembly.instantiateStreaming != "function" || ne(ke) || typeof fetch != "function" ? g2(d2) : fetch(ke, { credentials: "same-origin" }).then(function(x2) {
        return WebAssembly.instantiateStreaming(x2, v2).then(d2, function(E) {
          return a("wasm streaming compile failed: " + E), a("falling back to ArrayBuffer instantiation"), g2(d2);
        });
      });
    }().catch(r), {};
  })(), t.___wasm_call_ctors = function() {
    return (t.___wasm_call_ctors = t.asm.F).apply(null, arguments);
  };
  var Zs = t.___getTypeName = function() {
    return (Zs = t.___getTypeName = t.asm.G).apply(null, arguments);
  };
  t.__embind_initialize_bindings = function() {
    return (t.__embind_initialize_bindings = t.asm.H).apply(null, arguments);
  };
  var _i = t._malloc = function() {
    return (_i = t._malloc = t.asm.I).apply(null, arguments);
  }, Ct = t._free = function() {
    return (Ct = t._free = t.asm.K).apply(null, arguments);
  };
  t.dynCall_jiji = function() {
    return (t.dynCall_jiji = t.asm.L).apply(null, arguments);
  };
  var Mn;
  Ie = function c2() {
    Mn || ea(), Mn || (Ie = c2);
  };
  function ea() {
    function c2() {
      if (!Mn && (Mn = true, t.calledRun = true, !p)) {
        if (Ye(V), n(t), t.onRuntimeInitialized && t.onRuntimeInitialized(), t.postRun)
          for (typeof t.postRun == "function" && (t.postRun = [t.postRun]); t.postRun.length; ) {
            var d2 = t.postRun.shift();
            de.unshift(d2);
          }
        Ye(de);
      }
    }
    if (!(0 < me)) {
      if (t.preRun)
        for (typeof t.preRun == "function" && (t.preRun = [t.preRun]); t.preRun.length; )
          Ae();
      Ye(q), 0 < me || (t.setStatus ? (t.setStatus("Running..."), setTimeout(function() {
        setTimeout(function() {
          t.setStatus("");
        }, 1), c2();
      }, 1)) : c2());
    }
  }
  if (t.preInit)
    for (typeof t.preInit == "function" && (t.preInit = [t.preInit]); 0 < t.preInit.length; )
      t.preInit.pop()();
  return ea(), e.ready;
}
var _a2;
var ka = tr(() => {
  _a2 = "";
});
async function Ea(e) {
  let { default: t } = await Promise.resolve().then(() => (ka(), Ta));
  return Wi(await t(e));
}
var Oa = tr(() => {
  Sa();
  Un();
});
var Di = {};
Wn(Di, { getYoga: () => Nc, init: () => Mc });
async function Lc(e, t) {
  let n;
  if (typeof e == "string" || typeof Request == "function" && e instanceof Request || typeof URL == "function" && e instanceof URL ? n = await fetch(e) : n = await e, typeof Response == "function" && n instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming == "function")
      try {
        return await WebAssembly.instantiateStreaming(n, t);
      } catch (o) {
        n.headers.get("Content-Type") !== "application/wasm" && console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", o);
      }
    let i = await n.arrayBuffer();
    return await WebAssembly.instantiate(i, t);
  }
  let r = await WebAssembly.instantiate("buffer" in n ? n.buffer.slice(n.byteOffset, n.byteOffset + n.byteLength) : n, t);
  return r instanceof WebAssembly.Instance ? { instance: r, module: n } : r;
}
function Mc(e) {
  Rc({ instantiateWasm(t, n) {
    return Lc(e, t).then(({ instance: r }) => {
      n(r);
    }).catch(Fi), {};
  } }).then(Pa).catch(Fi);
}
function Nc() {
  return Cc;
}
var Rc;
var Pa;
var Fi;
var Cc;
var Bi = tr(() => {
  Oa();
  Rc = Ea, Cc = new Promise((e, t) => {
    Pa = e, Fi = t;
  });
});
var lo = U((uo) => {
  "use strict";
  Object.defineProperty(uo, "__esModule", { value: true });
  Object.defineProperty(uo, "default", { enumerable: true, get: () => Vd });
  function Vd(e) {
    if (e = `${e}`, e === "0")
      return "0";
    if (/^[+-]?(\d+|\d*\.\d+)(e[+-]?\d+)?(%|\w+)?$/.test(e))
      return e.replace(/^[+-]?/, (t) => t === "-" ? "" : "-");
    if (e.includes("var(") || e.includes("calc("))
      return `calc(${e} * -1)`;
  }
});
var wu = U((fo) => {
  "use strict";
  Object.defineProperty(fo, "__esModule", { value: true });
  Object.defineProperty(fo, "default", { enumerable: true, get: () => Hd });
  var Hd = ["preflight", "container", "accessibility", "pointerEvents", "visibility", "position", "inset", "isolation", "zIndex", "order", "gridColumn", "gridColumnStart", "gridColumnEnd", "gridRow", "gridRowStart", "gridRowEnd", "float", "clear", "margin", "boxSizing", "display", "aspectRatio", "height", "maxHeight", "minHeight", "width", "minWidth", "maxWidth", "flex", "flexShrink", "flexGrow", "flexBasis", "tableLayout", "borderCollapse", "borderSpacing", "transformOrigin", "translate", "rotate", "skew", "scale", "transform", "animation", "cursor", "touchAction", "userSelect", "resize", "scrollSnapType", "scrollSnapAlign", "scrollSnapStop", "scrollMargin", "scrollPadding", "listStylePosition", "listStyleType", "appearance", "columns", "breakBefore", "breakInside", "breakAfter", "gridAutoColumns", "gridAutoFlow", "gridAutoRows", "gridTemplateColumns", "gridTemplateRows", "flexDirection", "flexWrap", "placeContent", "placeItems", "alignContent", "alignItems", "justifyContent", "justifyItems", "gap", "space", "divideWidth", "divideStyle", "divideColor", "divideOpacity", "placeSelf", "alignSelf", "justifySelf", "overflow", "overscrollBehavior", "scrollBehavior", "textOverflow", "whitespace", "wordBreak", "borderRadius", "borderWidth", "borderStyle", "borderColor", "borderOpacity", "backgroundColor", "backgroundOpacity", "backgroundImage", "gradientColorStops", "boxDecorationBreak", "backgroundSize", "backgroundAttachment", "backgroundClip", "backgroundPosition", "backgroundRepeat", "backgroundOrigin", "fill", "stroke", "strokeWidth", "objectFit", "objectPosition", "padding", "textAlign", "textIndent", "verticalAlign", "fontFamily", "fontSize", "fontWeight", "textTransform", "fontStyle", "fontVariantNumeric", "lineHeight", "letterSpacing", "textColor", "textOpacity", "textDecoration", "textDecorationColor", "textDecorationStyle", "textDecorationThickness", "textUnderlineOffset", "fontSmoothing", "placeholderColor", "placeholderOpacity", "caretColor", "accentColor", "opacity", "backgroundBlendMode", "mixBlendMode", "boxShadow", "boxShadowColor", "outlineStyle", "outlineWidth", "outlineOffset", "outlineColor", "ringWidth", "ringColor", "ringOpacity", "ringOffsetWidth", "ringOffsetColor", "blur", "brightness", "contrast", "dropShadow", "grayscale", "hueRotate", "invert", "saturate", "sepia", "filter", "backdropBlur", "backdropBrightness", "backdropContrast", "backdropGrayscale", "backdropHueRotate", "backdropInvert", "backdropOpacity", "backdropSaturate", "backdropSepia", "backdropFilter", "transitionProperty", "transitionDelay", "transitionDuration", "transitionTimingFunction", "willChange", "content"];
});
var Su = U((co) => {
  "use strict";
  Object.defineProperty(co, "__esModule", { value: true });
  Object.defineProperty(co, "default", { enumerable: true, get: () => Yd });
  function Yd(e, t) {
    return e === void 0 ? t : Array.isArray(e) ? e : [...new Set(t.filter((r) => e !== false && e[r] !== false).concat(Object.keys(e).filter((r) => e[r] !== false)))];
  }
});
var po = U((jx, _u) => {
  _u.exports = { content: [], presets: [], darkMode: "media", theme: { screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" }, colors: ({ colors: e }) => ({ inherit: e.inherit, current: e.current, transparent: e.transparent, black: e.black, white: e.white, slate: e.slate, gray: e.gray, zinc: e.zinc, neutral: e.neutral, stone: e.stone, red: e.red, orange: e.orange, amber: e.amber, yellow: e.yellow, lime: e.lime, green: e.green, emerald: e.emerald, teal: e.teal, cyan: e.cyan, sky: e.sky, blue: e.blue, indigo: e.indigo, violet: e.violet, purple: e.purple, fuchsia: e.fuchsia, pink: e.pink, rose: e.rose }), columns: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem" }, spacing: { px: "1px", 0: "0px", 0.5: "0.125rem", 1: "0.25rem", 1.5: "0.375rem", 2: "0.5rem", 2.5: "0.625rem", 3: "0.75rem", 3.5: "0.875rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem", 11: "2.75rem", 12: "3rem", 14: "3.5rem", 16: "4rem", 20: "5rem", 24: "6rem", 28: "7rem", 32: "8rem", 36: "9rem", 40: "10rem", 44: "11rem", 48: "12rem", 52: "13rem", 56: "14rem", 60: "15rem", 64: "16rem", 72: "18rem", 80: "20rem", 96: "24rem" }, animation: { none: "none", spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite", pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", bounce: "bounce 1s infinite" }, aspectRatio: { auto: "auto", square: "1 / 1", video: "16 / 9" }, backdropBlur: ({ theme: e }) => e("blur"), backdropBrightness: ({ theme: e }) => e("brightness"), backdropContrast: ({ theme: e }) => e("contrast"), backdropGrayscale: ({ theme: e }) => e("grayscale"), backdropHueRotate: ({ theme: e }) => e("hueRotate"), backdropInvert: ({ theme: e }) => e("invert"), backdropOpacity: ({ theme: e }) => e("opacity"), backdropSaturate: ({ theme: e }) => e("saturate"), backdropSepia: ({ theme: e }) => e("sepia"), backgroundColor: ({ theme: e }) => e("colors"), backgroundImage: { none: "none", "gradient-to-t": "linear-gradient(to top, var(--tw-gradient-stops))", "gradient-to-tr": "linear-gradient(to top right, var(--tw-gradient-stops))", "gradient-to-r": "linear-gradient(to right, var(--tw-gradient-stops))", "gradient-to-br": "linear-gradient(to bottom right, var(--tw-gradient-stops))", "gradient-to-b": "linear-gradient(to bottom, var(--tw-gradient-stops))", "gradient-to-bl": "linear-gradient(to bottom left, var(--tw-gradient-stops))", "gradient-to-l": "linear-gradient(to left, var(--tw-gradient-stops))", "gradient-to-tl": "linear-gradient(to top left, var(--tw-gradient-stops))" }, backgroundOpacity: ({ theme: e }) => e("opacity"), backgroundPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, backgroundSize: { auto: "auto", cover: "cover", contain: "contain" }, blur: { 0: "0", none: "0", sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" }, brightness: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5", 200: "2" }, borderColor: ({ theme: e }) => ({ ...e("colors"), DEFAULT: e("colors.gray.200", "currentColor") }), borderOpacity: ({ theme: e }) => e("opacity"), borderRadius: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" }, borderSpacing: ({ theme: e }) => ({ ...e("spacing") }), borderWidth: { DEFAULT: "1px", 0: "0px", 2: "2px", 4: "4px", 8: "8px" }, boxShadow: { sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)", none: "none" }, boxShadowColor: ({ theme: e }) => e("colors"), caretColor: ({ theme: e }) => e("colors"), accentColor: ({ theme: e }) => ({ ...e("colors"), auto: "auto" }), contrast: { 0: "0", 50: ".5", 75: ".75", 100: "1", 125: "1.25", 150: "1.5", 200: "2" }, container: {}, content: { none: "none" }, cursor: { auto: "auto", default: "default", pointer: "pointer", wait: "wait", text: "text", move: "move", help: "help", "not-allowed": "not-allowed", none: "none", "context-menu": "context-menu", progress: "progress", cell: "cell", crosshair: "crosshair", "vertical-text": "vertical-text", alias: "alias", copy: "copy", "no-drop": "no-drop", grab: "grab", grabbing: "grabbing", "all-scroll": "all-scroll", "col-resize": "col-resize", "row-resize": "row-resize", "n-resize": "n-resize", "e-resize": "e-resize", "s-resize": "s-resize", "w-resize": "w-resize", "ne-resize": "ne-resize", "nw-resize": "nw-resize", "se-resize": "se-resize", "sw-resize": "sw-resize", "ew-resize": "ew-resize", "ns-resize": "ns-resize", "nesw-resize": "nesw-resize", "nwse-resize": "nwse-resize", "zoom-in": "zoom-in", "zoom-out": "zoom-out" }, divideColor: ({ theme: e }) => e("borderColor"), divideOpacity: ({ theme: e }) => e("borderOpacity"), divideWidth: ({ theme: e }) => e("borderWidth"), dropShadow: { sm: "0 1px 1px rgb(0 0 0 / 0.05)", DEFAULT: ["0 1px 2px rgb(0 0 0 / 0.1)", "0 1px 1px rgb(0 0 0 / 0.06)"], md: ["0 4px 3px rgb(0 0 0 / 0.07)", "0 2px 2px rgb(0 0 0 / 0.06)"], lg: ["0 10px 8px rgb(0 0 0 / 0.04)", "0 4px 3px rgb(0 0 0 / 0.1)"], xl: ["0 20px 13px rgb(0 0 0 / 0.03)", "0 8px 5px rgb(0 0 0 / 0.08)"], "2xl": "0 25px 25px rgb(0 0 0 / 0.15)", none: "0 0 #0000" }, fill: ({ theme: e }) => e("colors"), grayscale: { 0: "0", DEFAULT: "100%" }, hueRotate: { 0: "0deg", 15: "15deg", 30: "30deg", 60: "60deg", 90: "90deg", 180: "180deg" }, invert: { 0: "0", DEFAULT: "100%" }, flex: { 1: "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }, flexBasis: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%" }), flexGrow: { 0: "0", DEFAULT: "1" }, flexShrink: { 0: "0", DEFAULT: "1" }, fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", '"Noto Sans"', "sans-serif", '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'], serif: ["ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', '"Courier New"', "monospace"] }, fontSize: { xs: ["0.75rem", { lineHeight: "1rem" }], sm: ["0.875rem", { lineHeight: "1.25rem" }], base: ["1rem", { lineHeight: "1.5rem" }], lg: ["1.125rem", { lineHeight: "1.75rem" }], xl: ["1.25rem", { lineHeight: "1.75rem" }], "2xl": ["1.5rem", { lineHeight: "2rem" }], "3xl": ["1.875rem", { lineHeight: "2.25rem" }], "4xl": ["2.25rem", { lineHeight: "2.5rem" }], "5xl": ["3rem", { lineHeight: "1" }], "6xl": ["3.75rem", { lineHeight: "1" }], "7xl": ["4.5rem", { lineHeight: "1" }], "8xl": ["6rem", { lineHeight: "1" }], "9xl": ["8rem", { lineHeight: "1" }] }, fontWeight: { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" }, gap: ({ theme: e }) => e("spacing"), gradientColorStops: ({ theme: e }) => e("colors"), gridAutoColumns: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridAutoRows: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridColumn: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-7": "span 7 / span 7", "span-8": "span 8 / span 8", "span-9": "span 9 / span 9", "span-10": "span 10 / span 10", "span-11": "span 11 / span 11", "span-12": "span 12 / span 12", "span-full": "1 / -1" }, gridColumnEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridColumnStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridRow: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-full": "1 / -1" }, gridRowStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridRowEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridTemplateColumns: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))", 7: "repeat(7, minmax(0, 1fr))", 8: "repeat(8, minmax(0, 1fr))", 9: "repeat(9, minmax(0, 1fr))", 10: "repeat(10, minmax(0, 1fr))", 11: "repeat(11, minmax(0, 1fr))", 12: "repeat(12, minmax(0, 1fr))" }, gridTemplateRows: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))" }, height: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), inset: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), keyframes: { spin: { to: { transform: "rotate(360deg)" } }, ping: { "75%, 100%": { transform: "scale(2)", opacity: "0" } }, pulse: { "50%": { opacity: ".5" } }, bounce: { "0%, 100%": { transform: "translateY(-25%)", animationTimingFunction: "cubic-bezier(0.8,0,1,1)" }, "50%": { transform: "none", animationTimingFunction: "cubic-bezier(0,0,0.2,1)" } } }, letterSpacing: { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }, lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2", 3: ".75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem" }, listStyleType: { none: "none", disc: "disc", decimal: "decimal" }, margin: ({ theme: e }) => ({ auto: "auto", ...e("spacing") }), maxHeight: ({ theme: e }) => ({ ...e("spacing"), full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), maxWidth: ({ theme: e, breakpoints: t }) => ({ none: "none", 0: "0rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch", ...t(e("screens")) }), minHeight: { 0: "0px", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }, minWidth: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" }, objectPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, opacity: { 0: "0", 5: "0.05", 10: "0.1", 20: "0.2", 25: "0.25", 30: "0.3", 40: "0.4", 50: "0.5", 60: "0.6", 70: "0.7", 75: "0.75", 80: "0.8", 90: "0.9", 95: "0.95", 100: "1" }, order: { first: "-9999", last: "9999", none: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12" }, padding: ({ theme: e }) => e("spacing"), placeholderColor: ({ theme: e }) => e("colors"), placeholderOpacity: ({ theme: e }) => e("opacity"), outlineColor: ({ theme: e }) => e("colors"), outlineOffset: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, outlineWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringColor: ({ theme: e }) => ({ DEFAULT: e("colors.blue.500", "#3b82f6"), ...e("colors") }), ringOffsetColor: ({ theme: e }) => e("colors"), ringOffsetWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringOpacity: ({ theme: e }) => ({ DEFAULT: "0.5", ...e("opacity") }), ringWidth: { DEFAULT: "3px", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, rotate: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg", 45: "45deg", 90: "90deg", 180: "180deg" }, saturate: { 0: "0", 50: ".5", 100: "1", 150: "1.5", 200: "2" }, scale: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5" }, scrollMargin: ({ theme: e }) => ({ ...e("spacing") }), scrollPadding: ({ theme: e }) => e("spacing"), sepia: { 0: "0", DEFAULT: "100%" }, skew: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg" }, space: ({ theme: e }) => ({ ...e("spacing") }), stroke: ({ theme: e }) => e("colors"), strokeWidth: { 0: "0", 1: "1", 2: "2" }, textColor: ({ theme: e }) => e("colors"), textDecorationColor: ({ theme: e }) => e("colors"), textDecorationThickness: { auto: "auto", "from-font": "from-font", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textUnderlineOffset: { auto: "auto", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textIndent: ({ theme: e }) => ({ ...e("spacing") }), textOpacity: ({ theme: e }) => e("opacity"), transformOrigin: { center: "center", top: "top", "top-right": "top right", right: "right", "bottom-right": "bottom right", bottom: "bottom", "bottom-left": "bottom left", left: "left", "top-left": "top left" }, transitionDelay: { 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionDuration: { DEFAULT: "150ms", 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionProperty: { none: "none", all: "all", DEFAULT: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter", colors: "color, background-color, border-color, text-decoration-color, fill, stroke", opacity: "opacity", shadow: "box-shadow", transform: "transform" }, transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)", linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" }, translate: ({ theme: e }) => ({ ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), width: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%", screen: "100vw", min: "min-content", max: "max-content", fit: "fit-content" }), willChange: { auto: "auto", scroll: "scroll-position", contents: "contents", transform: "transform" }, zIndex: { auto: "auto", 0: "0", 10: "10", 20: "20", 30: "30", 40: "40", 50: "50" } }, variantOrder: ["first", "last", "odd", "even", "visited", "checked", "empty", "read-only", "group-hover", "group-focus", "focus-within", "hover", "focus", "focus-visible", "active", "disabled"], plugins: [] };
});
var ni = {};
Wn(ni, { default: () => Xd });
var Xd;
var ii = tr(() => {
  Xd = { info(e, t) {
    console.info(...Array.isArray(e) ? [e] : [t, e]);
  }, warn(e, t) {
    console.warn(...Array.isArray(e) ? [e] : [t, e]);
  }, risk(e, t) {
    console.error(...Array.isArray(e) ? [e] : [t, e]);
  } };
});
var Tu = U((ho) => {
  "use strict";
  Object.defineProperty(ho, "__esModule", { value: true });
  Object.defineProperty(ho, "default", { enumerable: true, get: () => Jd });
  var Qd = Kd((ii(), Fn(ni)));
  function Kd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Yr({ version: e, from: t, to: n }) {
    Qd.default.warn(`${t}-color-renamed`, [`As of Tailwind CSS ${e}, \`${t}\` has been renamed to \`${n}\`.`, "Update your configuration file to silence this warning."]);
  }
  var Jd = { inherit: "inherit", current: "currentColor", transparent: "transparent", black: "#000", white: "#fff", slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" }, gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151", 800: "#1f2937", 900: "#111827" }, zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b" }, neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717" }, stone: { 50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1", 400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c", 800: "#292524", 900: "#1c1917" }, red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" }, orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" }, amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" }, yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" }, lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314" }, green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" }, emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" }, teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a" }, cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63" }, sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e" }, blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" }, indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" }, violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95" }, purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" }, fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75" }, pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" }, rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337" }, get lightBlue() {
    return Yr({ version: "v2.2", from: "lightBlue", to: "sky" }), this.sky;
  }, get warmGray() {
    return Yr({ version: "v3.0", from: "warmGray", to: "stone" }), this.stone;
  }, get trueGray() {
    return Yr({ version: "v3.0", from: "trueGray", to: "neutral" }), this.neutral;
  }, get coolGray() {
    return Yr({ version: "v3.0", from: "coolGray", to: "gray" }), this.gray;
  }, get blueGray() {
    return Yr({ version: "v3.0", from: "blueGray", to: "slate" }), this.slate;
  } };
});
var ku = U((mo) => {
  "use strict";
  Object.defineProperty(mo, "__esModule", { value: true });
  Object.defineProperty(mo, "defaults", { enumerable: true, get: () => Zd });
  function Zd(e, ...t) {
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
var Eu = U((go) => {
  "use strict";
  Object.defineProperty(go, "__esModule", { value: true });
  Object.defineProperty(go, "toPath", { enumerable: true, get: () => ep });
  function ep(e) {
    if (Array.isArray(e))
      return e;
    let t = e.split("[").length - 1, n = e.split("]").length - 1;
    if (t !== n)
      throw new Error(`Path is invalid. Has unbalanced brackets: ${e}`);
    return e.split(/\.(?![^\[]*\])|[\[\]]/g).filter(Boolean);
  }
});
var Pu = U((bo) => {
  "use strict";
  Object.defineProperty(bo, "__esModule", { value: true });
  Object.defineProperty(bo, "normalizeConfig", { enumerable: true, get: () => rp });
  var Xr = tp((ii(), Fn(ni)));
  function Ou(e) {
    if (typeof WeakMap != "function")
      return null;
    var t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new WeakMap();
    return (Ou = function(r) {
      return r ? n : t;
    })(e);
  }
  function tp(e, t) {
    if (!t && e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var n = Ou(t);
    if (n && n.has(e))
      return n.get(e);
    var r = {}, i = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var o in e)
      if (o !== "default" && Object.prototype.hasOwnProperty.call(e, o)) {
        var s = i ? Object.getOwnPropertyDescriptor(e, o) : null;
        s && (s.get || s.set) ? Object.defineProperty(r, o, s) : r[o] = e[o];
      }
    return r.default = e, n && n.set(e, r), r;
  }
  function rp(e) {
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
    })() || Xr.default.warn("purge-deprecation", ["The `purge`/`content` options have changed in Tailwind CSS v3.0.", "Update your configuration file to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#configure-content-sources"]), e.safelist = (() => {
      var r;
      let { content: i, purge: o, safelist: s } = e;
      return Array.isArray(s) ? s : Array.isArray(i == null ? void 0 : i.safelist) ? i.safelist : Array.isArray(o == null ? void 0 : o.safelist) ? o.safelist : Array.isArray(o == null || (r = o.options) === null || r === void 0 ? void 0 : r.safelist) ? o.options.safelist : [];
    })(), typeof e.prefix == "function")
      Xr.default.warn("prefix-function", ["As of Tailwind CSS v3.0, `prefix` cannot be a function.", "Update `prefix` in your configuration to be a string to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#prefix-cannot-be-a-function"]), e.prefix = "";
    else {
      var n;
      e.prefix = (n = e.prefix) !== null && n !== void 0 ? n : "";
    }
    e.content = { files: (() => {
      let { content: r, purge: i } = e;
      return Array.isArray(i) ? i : Array.isArray(i == null ? void 0 : i.content) ? i.content : Array.isArray(r) ? r : Array.isArray(r == null ? void 0 : r.content) ? r.content : Array.isArray(r == null ? void 0 : r.files) ? r.files : [];
    })(), extract: (() => {
      let r = (() => {
        var s, a, u2, f, l2, p, h2, m2, b, y;
        return !((s = e.purge) === null || s === void 0) && s.extract ? e.purge.extract : !((a = e.content) === null || a === void 0) && a.extract ? e.content.extract : !((u2 = e.purge) === null || u2 === void 0 || (f = u2.extract) === null || f === void 0) && f.DEFAULT ? e.purge.extract.DEFAULT : !((l2 = e.content) === null || l2 === void 0 || (p = l2.extract) === null || p === void 0) && p.DEFAULT ? e.content.extract.DEFAULT : !((h2 = e.purge) === null || h2 === void 0 || (m2 = h2.options) === null || m2 === void 0) && m2.extractors ? e.purge.options.extractors : !((b = e.content) === null || b === void 0 || (y = b.options) === null || y === void 0) && y.extractors ? e.content.options.extractors : {};
      })(), i = {}, o = (() => {
        var s, a, u2, f;
        if (!((s = e.purge) === null || s === void 0 || (a = s.options) === null || a === void 0) && a.defaultExtractor)
          return e.purge.options.defaultExtractor;
        if (!((u2 = e.content) === null || u2 === void 0 || (f = u2.options) === null || f === void 0) && f.defaultExtractor)
          return e.content.options.defaultExtractor;
      })();
      if (o !== void 0 && (i.DEFAULT = o), typeof r == "function")
        i.DEFAULT = r;
      else if (Array.isArray(r))
        for (let { extensions: s, extractor: a } of r ?? [])
          for (let u2 of s)
            i[u2] = a;
      else
        typeof r == "object" && r !== null && Object.assign(i, r);
      return i;
    })(), transform: (() => {
      let r = (() => {
        var o, s, a, u2, f, l2;
        return !((o = e.purge) === null || o === void 0) && o.transform ? e.purge.transform : !((s = e.content) === null || s === void 0) && s.transform ? e.content.transform : !((a = e.purge) === null || a === void 0 || (u2 = a.transform) === null || u2 === void 0) && u2.DEFAULT ? e.purge.transform.DEFAULT : !((f = e.content) === null || f === void 0 || (l2 = f.transform) === null || l2 === void 0) && l2.DEFAULT ? e.content.transform.DEFAULT : {};
      })(), i = {};
      return typeof r == "function" && (i.DEFAULT = r), typeof r == "object" && r !== null && Object.assign(i, r), i;
    })() };
    for (let r of e.content.files)
      if (typeof r == "string" && /{([^,]*?)}/g.test(r)) {
        Xr.default.warn("invalid-glob-braces", [`The glob pattern ${(0, Xr.dim)(r)} in your Tailwind CSS configuration is invalid.`, `Update it to ${(0, Xr.dim)(r.replace(/{([^,]*?)}/g, "$1"))} to silence this warning.`]);
        break;
      }
    return e;
  }
});
var Au = U((vo) => {
  "use strict";
  Object.defineProperty(vo, "__esModule", { value: true });
  Object.defineProperty(vo, "default", { enumerable: true, get: () => np });
  function np(e) {
    if (Object.prototype.toString.call(e) !== "[object Object]")
      return false;
    let t = Object.getPrototypeOf(e);
    return t === null || t === Object.prototype;
  }
});
var Iu = U((xo) => {
  "use strict";
  Object.defineProperty(xo, "__esModule", { value: true });
  Object.defineProperty(xo, "cloneDeep", { enumerable: true, get: () => yo });
  function yo(e) {
    return Array.isArray(e) ? e.map((t) => yo(t)) : typeof e == "object" && e !== null ? Object.fromEntries(Object.entries(e).map(([t, n]) => [t, yo(n)])) : e;
  }
});
var wo = U((oi, Ru) => {
  "use strict";
  oi.__esModule = true;
  oi.default = sp;
  function ip(e) {
    for (var t = e.toLowerCase(), n = "", r = false, i = 0; i < 6 && t[i] !== void 0; i++) {
      var o = t.charCodeAt(i), s = o >= 97 && o <= 102 || o >= 48 && o <= 57;
      if (r = o === 32, !s)
        break;
      n += t[i];
    }
    if (n.length !== 0) {
      var a = parseInt(n, 16), u2 = a >= 55296 && a <= 57343;
      return u2 || a === 0 || a > 1114111 ? ["\uFFFD", n.length + (r ? 1 : 0)] : [String.fromCodePoint(a), n.length + (r ? 1 : 0)];
    }
  }
  var op = /\\/;
  function sp(e) {
    var t = op.test(e);
    if (!t)
      return e;
    for (var n = "", r = 0; r < e.length; r++) {
      if (e[r] === "\\") {
        var i = ip(e.slice(r + 1, r + 7));
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
  Ru.exports = oi.default;
});
var Lu = U((si, Cu) => {
  "use strict";
  si.__esModule = true;
  si.default = ap;
  function ap(e) {
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
  Cu.exports = si.default;
});
var Nu = U((ai, Mu) => {
  "use strict";
  ai.__esModule = true;
  ai.default = up;
  function up(e) {
    for (var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)
      n[r - 1] = arguments[r];
    for (; n.length > 0; ) {
      var i = n.shift();
      e[i] || (e[i] = {}), e = e[i];
    }
  }
  Mu.exports = ai.default;
});
var Fu = U((ui, Wu) => {
  "use strict";
  ui.__esModule = true;
  ui.default = lp;
  function lp(e) {
    for (var t = "", n = e.indexOf("/*"), r = 0; n >= 0; ) {
      t = t + e.slice(r, n);
      var i = e.indexOf("*/", n + 2);
      if (i < 0)
        return t;
      r = i + 2, n = e.indexOf("/*", r);
    }
    return t = t + e.slice(r), t;
  }
  Wu.exports = ui.default;
});
var Qr = U((Pt) => {
  "use strict";
  Pt.__esModule = true;
  Pt.stripComments = Pt.ensureObject = Pt.getProp = Pt.unesc = void 0;
  var fp = li(wo());
  Pt.unesc = fp.default;
  var cp = li(Lu());
  Pt.getProp = cp.default;
  var dp = li(Nu());
  Pt.ensureObject = dp.default;
  var pp = li(Fu());
  Pt.stripComments = pp.default;
  function li(e) {
    return e && e.__esModule ? e : { default: e };
  }
});
var Ft = U((Kr, $u) => {
  "use strict";
  Kr.__esModule = true;
  Kr.default = void 0;
  var Du = Qr();
  function Bu(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function hp(e, t, n) {
    return t && Bu(e.prototype, t), n && Bu(e, n), e;
  }
  var mp = function e(t, n) {
    if (typeof t != "object" || t === null)
      return t;
    var r = new t.constructor();
    for (var i in t)
      if (t.hasOwnProperty(i)) {
        var o = t[i], s = typeof o;
        i === "parent" && s === "object" ? n && (r[i] = n) : o instanceof Array ? r[i] = o.map(function(a) {
          return e(a, r);
        }) : r[i] = e(o, r);
      }
    return r;
  }, gp = function() {
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
      var i = mp(this);
      for (var o in r)
        i[o] = r[o];
      return i;
    }, t.appendToPropertyAndEscape = function(r, i, o) {
      this.raws || (this.raws = {});
      var s = this[r], a = this.raws[r];
      this[r] = s + i, a || o !== i ? this.raws[r] = (a || s) + o : delete this.raws[r];
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
    }, hp(e, [{ key: "rawSpaceBefore", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.before;
      return r === void 0 && (r = this.spaces && this.spaces.before), r || "";
    }, set: function(r) {
      (0, Du.ensureObject)(this, "raws", "spaces"), this.raws.spaces.before = r;
    } }, { key: "rawSpaceAfter", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.after;
      return r === void 0 && (r = this.spaces.after), r || "";
    }, set: function(r) {
      (0, Du.ensureObject)(this, "raws", "spaces"), this.raws.spaces.after = r;
    } }]), e;
  }();
  Kr.default = gp;
  $u.exports = Kr.default;
});
var Be = U((ge) => {
  "use strict";
  ge.__esModule = true;
  ge.UNIVERSAL = ge.ATTRIBUTE = ge.CLASS = ge.COMBINATOR = ge.COMMENT = ge.ID = ge.NESTING = ge.PSEUDO = ge.ROOT = ge.SELECTOR = ge.STRING = ge.TAG = void 0;
  var bp = "tag";
  ge.TAG = bp;
  var vp = "string";
  ge.STRING = vp;
  var yp = "selector";
  ge.SELECTOR = yp;
  var xp = "root";
  ge.ROOT = xp;
  var wp = "pseudo";
  ge.PSEUDO = wp;
  var Sp = "nesting";
  ge.NESTING = Sp;
  var _p = "id";
  ge.ID = _p;
  var Tp = "comment";
  ge.COMMENT = Tp;
  var kp = "combinator";
  ge.COMBINATOR = kp;
  var Ep = "class";
  ge.CLASS = Ep;
  var Op = "attribute";
  ge.ATTRIBUTE = Op;
  var Pp = "universal";
  ge.UNIVERSAL = Pp;
});
var fi = U((Jr, zu) => {
  "use strict";
  Jr.__esModule = true;
  Jr.default = void 0;
  var Ap = Rp(Ft()), Dt = Ip(Be());
  function Gu() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return Gu = function() {
      return e;
    }, e;
  }
  function Ip(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = Gu();
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
  function Rp(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Cp(e, t) {
    var n;
    if (typeof Symbol > "u" || e[Symbol.iterator] == null) {
      if (Array.isArray(e) || (n = Lp(e)) || t && e && typeof e.length == "number") {
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
  function Lp(e, t) {
    if (e) {
      if (typeof e == "string")
        return qu(e, t);
      var n = Object.prototype.toString.call(e).slice(8, -1);
      if (n === "Object" && e.constructor && (n = e.constructor.name), n === "Map" || n === "Set")
        return Array.from(e);
      if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
        return qu(e, t);
    }
  }
  function qu(e, t) {
    (t == null || t > e.length) && (t = e.length);
    for (var n = 0, r = new Array(t); n < t; n++)
      r[n] = e[n];
    return r;
  }
  function Uu(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Mp(e, t, n) {
    return t && Uu(e.prototype, t), n && Uu(e, n), e;
  }
  function Np(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, So(e, t);
  }
  function So(e, t) {
    return So = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, So(e, t);
  }
  var Wp = function(e) {
    Np(t, e);
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
      for (var s in this.indexes)
        o = this.indexes[s], o >= i && (this.indexes[s] = o - 1);
      return this;
    }, n.removeAll = function() {
      for (var i = Cp(this.nodes), o; !(o = i()).done; ) {
        var s = o.value;
        s.parent = void 0;
      }
      return this.nodes = [], this;
    }, n.empty = function() {
      return this.removeAll();
    }, n.insertAfter = function(i, o) {
      o.parent = this;
      var s = this.index(i);
      this.nodes.splice(s + 1, 0, o), o.parent = this;
      var a;
      for (var u2 in this.indexes)
        a = this.indexes[u2], s <= a && (this.indexes[u2] = a + 1);
      return this;
    }, n.insertBefore = function(i, o) {
      o.parent = this;
      var s = this.index(i);
      this.nodes.splice(s, 0, o), o.parent = this;
      var a;
      for (var u2 in this.indexes)
        a = this.indexes[u2], a <= s && (this.indexes[u2] = a + 1);
      return this;
    }, n._findChildAtPosition = function(i, o) {
      var s = void 0;
      return this.each(function(a) {
        if (a.atPosition) {
          var u2 = a.atPosition(i, o);
          if (u2)
            return s = u2, false;
        } else if (a.isAtPosition(i, o))
          return s = a, false;
      }), s;
    }, n.atPosition = function(i, o) {
      if (this.isAtPosition(i, o))
        return this._findChildAtPosition(i, o) || this;
    }, n._inferEndPosition = function() {
      this.last && this.last.source && this.last.source.end && (this.source = this.source || {}, this.source.end = this.source.end || {}, Object.assign(this.source.end, this.last.source.end));
    }, n.each = function(i) {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach++;
      var o = this.lastEach;
      if (this.indexes[o] = 0, !!this.length) {
        for (var s, a; this.indexes[o] < this.length && (s = this.indexes[o], a = i(this.at(s), s), a !== false); )
          this.indexes[o] += 1;
        if (delete this.indexes[o], a === false)
          return false;
      }
    }, n.walk = function(i) {
      return this.each(function(o, s) {
        var a = i(o, s);
        if (a !== false && o.length && (a = o.walk(i)), a === false)
          return false;
      });
    }, n.walkAttributes = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.ATTRIBUTE)
          return i.call(o, s);
      });
    }, n.walkClasses = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.CLASS)
          return i.call(o, s);
      });
    }, n.walkCombinators = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.COMBINATOR)
          return i.call(o, s);
      });
    }, n.walkComments = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.COMMENT)
          return i.call(o, s);
      });
    }, n.walkIds = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.ID)
          return i.call(o, s);
      });
    }, n.walkNesting = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.NESTING)
          return i.call(o, s);
      });
    }, n.walkPseudos = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.PSEUDO)
          return i.call(o, s);
      });
    }, n.walkTags = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.TAG)
          return i.call(o, s);
      });
    }, n.walkUniversals = function(i) {
      var o = this;
      return this.walk(function(s) {
        if (s.type === Dt.UNIVERSAL)
          return i.call(o, s);
      });
    }, n.split = function(i) {
      var o = this, s = [];
      return this.reduce(function(a, u2, f) {
        var l2 = i.call(o, u2);
        return s.push(u2), l2 ? (a.push(s), s = []) : f === o.length - 1 && a.push(s), a;
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
    }, Mp(t, [{ key: "first", get: function() {
      return this.at(0);
    } }, { key: "last", get: function() {
      return this.at(this.length - 1);
    } }, { key: "length", get: function() {
      return this.nodes.length;
    } }]), t;
  }(Ap.default);
  Jr.default = Wp;
  zu.exports = Jr.default;
});
var To = U((Zr, Vu) => {
  "use strict";
  Zr.__esModule = true;
  Zr.default = void 0;
  var Fp = Bp(fi()), Dp = Be();
  function Bp(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function ju(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function $p(e, t, n) {
    return t && ju(e.prototype, t), n && ju(e, n), e;
  }
  function qp(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, _o(e, t);
  }
  function _o(e, t) {
    return _o = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, _o(e, t);
  }
  var Up = function(e) {
    qp(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = Dp.ROOT, i;
    }
    var n = t.prototype;
    return n.toString = function() {
      var i = this.reduce(function(o, s) {
        return o.push(String(s)), o;
      }, []).join(",");
      return this.trailingComma ? i + "," : i;
    }, n.error = function(i, o) {
      return this._error ? this._error(i, o) : new Error(i);
    }, $p(t, [{ key: "errorGenerator", set: function(i) {
      this._error = i;
    } }]), t;
  }(Fp.default);
  Zr.default = Up;
  Vu.exports = Zr.default;
});
var Eo = U((en, Hu) => {
  "use strict";
  en.__esModule = true;
  en.default = void 0;
  var Gp = jp(fi()), zp = Be();
  function jp(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Vp(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, ko(e, t);
  }
  function ko(e, t) {
    return ko = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, ko(e, t);
  }
  var Hp = function(e) {
    Vp(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = zp.SELECTOR, r;
    }
    return t;
  }(Gp.default);
  en.default = Hp;
  Hu.exports = en.default;
});
var ci = U((e1, Yu) => {
  "use strict";
  var Yp = {}, Xp = Yp.hasOwnProperty, Qp = function(t, n) {
    if (!t)
      return n;
    var r = {};
    for (var i in n)
      r[i] = Xp.call(t, i) ? t[i] : n[i];
    return r;
  }, Kp = /[ -,\.\/:-@\[-\^`\{-~]/, Jp = /[ -,\.\/:-@\[\]\^`\{-~]/, Zp = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g, Oo = function e(t, n) {
    n = Qp(n, e.options), n.quotes != "single" && n.quotes != "double" && (n.quotes = "single");
    for (var r = n.quotes == "double" ? '"' : "'", i = n.isIdentifier, o = t.charAt(0), s = "", a = 0, u2 = t.length; a < u2; ) {
      var f = t.charAt(a++), l2 = f.charCodeAt(), p = void 0;
      if (l2 < 32 || l2 > 126) {
        if (l2 >= 55296 && l2 <= 56319 && a < u2) {
          var h2 = t.charCodeAt(a++);
          (h2 & 64512) == 56320 ? l2 = ((l2 & 1023) << 10) + (h2 & 1023) + 65536 : a--;
        }
        p = "\\" + l2.toString(16).toUpperCase() + " ";
      } else
        n.escapeEverything ? Kp.test(f) ? p = "\\" + f : p = "\\" + l2.toString(16).toUpperCase() + " " : /[\t\n\f\r\x0B]/.test(f) ? p = "\\" + l2.toString(16).toUpperCase() + " " : f == "\\" || !i && (f == '"' && r == f || f == "'" && r == f) || i && Jp.test(f) ? p = "\\" + f : p = f;
      s += p;
    }
    return i && (/^-[-\d]/.test(s) ? s = "\\-" + s.slice(1) : /\d/.test(o) && (s = "\\3" + o + " " + s.slice(1))), s = s.replace(Zp, function(m2, b, y) {
      return b && b.length % 2 ? m2 : (b || "") + y;
    }), !i && n.wrap ? r + s + r : s;
  };
  Oo.options = { escapeEverything: false, isIdentifier: false, quotes: "single", wrap: false };
  Oo.version = "3.0.0";
  Yu.exports = Oo;
});
var Ao = U((tn, Ku) => {
  "use strict";
  tn.__esModule = true;
  tn.default = void 0;
  var eh = Qu(ci()), th = Qr(), rh = Qu(Ft()), nh = Be();
  function Qu(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Xu(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function ih(e, t, n) {
    return t && Xu(e.prototype, t), n && Xu(e, n), e;
  }
  function oh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Po(e, t);
  }
  function Po(e, t) {
    return Po = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Po(e, t);
  }
  var sh = function(e) {
    oh(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = nh.CLASS, i._constructed = true, i;
    }
    var n = t.prototype;
    return n.valueToString = function() {
      return "." + e.prototype.valueToString.call(this);
    }, ih(t, [{ key: "value", get: function() {
      return this._value;
    }, set: function(i) {
      if (this._constructed) {
        var o = (0, eh.default)(i, { isIdentifier: true });
        o !== i ? ((0, th.ensureObject)(this, "raws"), this.raws.value = o) : this.raws && delete this.raws.value;
      }
      this._value = i;
    } }]), t;
  }(rh.default);
  tn.default = sh;
  Ku.exports = tn.default;
});
var Ro = U((rn, Ju) => {
  "use strict";
  rn.__esModule = true;
  rn.default = void 0;
  var ah = lh(Ft()), uh = Be();
  function lh(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function fh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Io(e, t);
  }
  function Io(e, t) {
    return Io = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Io(e, t);
  }
  var ch = function(e) {
    fh(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = uh.COMMENT, r;
    }
    return t;
  }(ah.default);
  rn.default = ch;
  Ju.exports = rn.default;
});
var Lo = U((nn, Zu) => {
  "use strict";
  nn.__esModule = true;
  nn.default = void 0;
  var dh = hh(Ft()), ph = Be();
  function hh(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function mh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Co(e, t);
  }
  function Co(e, t) {
    return Co = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Co(e, t);
  }
  var gh = function(e) {
    mh(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = ph.ID, i;
    }
    var n = t.prototype;
    return n.valueToString = function() {
      return "#" + e.prototype.valueToString.call(this);
    }, t;
  }(dh.default);
  nn.default = gh;
  Zu.exports = nn.default;
});
var di = U((on, rl) => {
  "use strict";
  on.__esModule = true;
  on.default = void 0;
  var bh = tl(ci()), vh = Qr(), yh = tl(Ft());
  function tl(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function el(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function xh(e, t, n) {
    return t && el(e.prototype, t), n && el(e, n), e;
  }
  function wh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Mo(e, t);
  }
  function Mo(e, t) {
    return Mo = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Mo(e, t);
  }
  var Sh = function(e) {
    wh(t, e);
    function t() {
      return e.apply(this, arguments) || this;
    }
    var n = t.prototype;
    return n.qualifiedName = function(i) {
      return this.namespace ? this.namespaceString + "|" + i : i;
    }, n.valueToString = function() {
      return this.qualifiedName(e.prototype.valueToString.call(this));
    }, xh(t, [{ key: "namespace", get: function() {
      return this._namespace;
    }, set: function(i) {
      if (i === true || i === "*" || i === "&") {
        this._namespace = i, this.raws && delete this.raws.namespace;
        return;
      }
      var o = (0, bh.default)(i, { isIdentifier: true });
      this._namespace = i, o !== i ? ((0, vh.ensureObject)(this, "raws"), this.raws.namespace = o) : this.raws && delete this.raws.namespace;
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
  }(yh.default);
  on.default = Sh;
  rl.exports = on.default;
});
var Wo = U((sn, nl) => {
  "use strict";
  sn.__esModule = true;
  sn.default = void 0;
  var _h = kh(di()), Th = Be();
  function kh(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Eh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, No(e, t);
  }
  function No(e, t) {
    return No = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, No(e, t);
  }
  var Oh = function(e) {
    Eh(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Th.TAG, r;
    }
    return t;
  }(_h.default);
  sn.default = Oh;
  nl.exports = sn.default;
});
var Do = U((an, il) => {
  "use strict";
  an.__esModule = true;
  an.default = void 0;
  var Ph = Ih(Ft()), Ah = Be();
  function Ih(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Rh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Fo(e, t);
  }
  function Fo(e, t) {
    return Fo = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Fo(e, t);
  }
  var Ch = function(e) {
    Rh(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Ah.STRING, r;
    }
    return t;
  }(Ph.default);
  an.default = Ch;
  il.exports = an.default;
});
var $o = U((un, ol) => {
  "use strict";
  un.__esModule = true;
  un.default = void 0;
  var Lh = Nh(fi()), Mh = Be();
  function Nh(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Wh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Bo(e, t);
  }
  function Bo(e, t) {
    return Bo = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Bo(e, t);
  }
  var Fh = function(e) {
    Wh(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = Mh.PSEUDO, i;
    }
    var n = t.prototype;
    return n.toString = function() {
      var i = this.length ? "(" + this.map(String).join(",") + ")" : "";
      return [this.rawSpaceBefore, this.stringifyProperty("value"), i, this.rawSpaceAfter].join("");
    }, t;
  }(Lh.default);
  un.default = Fh;
  ol.exports = un.default;
});
var al = U((t1, sl) => {
  sl.exports = function(t, n) {
    return function(...r) {
      return console.warn(n), t(...r);
    };
  };
});
var Vo = U((cn) => {
  "use strict";
  cn.__esModule = true;
  cn.unescapeValue = jo;
  cn.default = void 0;
  var ln = zo(ci()), Dh = zo(wo()), Bh = zo(di()), $h = Be(), qo;
  function zo(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function ul(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function qh(e, t, n) {
    return t && ul(e.prototype, t), n && ul(e, n), e;
  }
  function Uh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Go(e, t);
  }
  function Go(e, t) {
    return Go = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Go(e, t);
  }
  var fn = al(), Gh = /^('|")([^]*)\1$/, zh = fn(function() {
  }, "Assigning an attribute a value containing characters that might need to be escaped is deprecated. Call attribute.setValue() instead."), jh = fn(function() {
  }, "Assigning attr.quoted is deprecated and has no effect. Assign to attr.quoteMark instead."), Vh = fn(function() {
  }, "Constructing an Attribute selector with a value without specifying quoteMark is deprecated. Note: The value should be unescaped now.");
  function jo(e) {
    var t = false, n = null, r = e, i = r.match(Gh);
    return i && (n = i[1], r = i[2]), r = (0, Dh.default)(r), r !== e && (t = true), { deprecatedUsage: t, unescaped: r, quoteMark: n };
  }
  function Hh(e) {
    if (e.quoteMark !== void 0 || e.value === void 0)
      return e;
    Vh();
    var t = jo(e.value), n = t.quoteMark, r = t.unescaped;
    return e.raws || (e.raws = {}), e.raws.value === void 0 && (e.raws.value = e.value), e.value = r, e.quoteMark = n, e;
  }
  var pi = function(e) {
    Uh(t, e);
    function t(r) {
      var i;
      return r === void 0 && (r = {}), i = e.call(this, Hh(r)) || this, i.type = $h.ATTRIBUTE, i.raws = i.raws || {}, Object.defineProperty(i.raws, "unquoted", { get: fn(function() {
        return i.value;
      }, "attr.raws.unquoted is deprecated. Call attr.value instead."), set: fn(function() {
        return i.value;
      }, "Setting attr.raws.unquoted is deprecated and has no effect. attr.value is unescaped by default now.") }), i._constructed = true, i;
    }
    var n = t.prototype;
    return n.getQuotedValue = function(i) {
      i === void 0 && (i = {});
      var o = this._determineQuoteMark(i), s = Uo[o], a = (0, ln.default)(this._value, s);
      return a;
    }, n._determineQuoteMark = function(i) {
      return i.smart ? this.smartQuoteMark(i) : this.preferredQuoteMark(i);
    }, n.setValue = function(i, o) {
      o === void 0 && (o = {}), this._value = i, this._quoteMark = this._determineQuoteMark(o), this._syncRawValue();
    }, n.smartQuoteMark = function(i) {
      var o = this.value, s = o.replace(/[^']/g, "").length, a = o.replace(/[^"]/g, "").length;
      if (s + a === 0) {
        var u2 = (0, ln.default)(o, { isIdentifier: true });
        if (u2 === o)
          return t.NO_QUOTE;
        var f = this.preferredQuoteMark(i);
        if (f === t.NO_QUOTE) {
          var l2 = this.quoteMark || i.quoteMark || t.DOUBLE_QUOTE, p = Uo[l2], h2 = (0, ln.default)(o, p);
          if (h2.length < u2.length)
            return l2;
        }
        return f;
      } else
        return a === s ? this.preferredQuoteMark(i) : a < s ? t.DOUBLE_QUOTE : t.SINGLE_QUOTE;
    }, n.preferredQuoteMark = function(i) {
      var o = i.preferCurrentQuoteMark ? this.quoteMark : i.quoteMark;
      return o === void 0 && (o = i.preferCurrentQuoteMark ? i.quoteMark : this.quoteMark), o === void 0 && (o = t.DOUBLE_QUOTE), o;
    }, n._syncRawValue = function() {
      var i = (0, ln.default)(this._value, Uo[this.quoteMark]);
      i === this._value ? this.raws && delete this.raws.value : this.raws.value = i;
    }, n._handleEscapes = function(i, o) {
      if (this._constructed) {
        var s = (0, ln.default)(o, { isIdentifier: true });
        s !== o ? this.raws[i] = s : delete this.raws[i];
      }
    }, n._spacesFor = function(i) {
      var o = { before: "", after: "" }, s = this.spaces[i] || {}, a = this.raws.spaces && this.raws.spaces[i] || {};
      return Object.assign(o, s, a);
    }, n._stringFor = function(i, o, s) {
      o === void 0 && (o = i), s === void 0 && (s = ll);
      var a = this._spacesFor(o);
      return s(this.stringifyProperty(i), a);
    }, n.offsetOf = function(i) {
      var o = 1, s = this._spacesFor("attribute");
      if (o += s.before.length, i === "namespace" || i === "ns")
        return this.namespace ? o : -1;
      if (i === "attributeNS" || (o += this.namespaceString.length, this.namespace && (o += 1), i === "attribute"))
        return o;
      o += this.stringifyProperty("attribute").length, o += s.after.length;
      var a = this._spacesFor("operator");
      o += a.before.length;
      var u2 = this.stringifyProperty("operator");
      if (i === "operator")
        return u2 ? o : -1;
      o += u2.length, o += a.after.length;
      var f = this._spacesFor("value");
      o += f.before.length;
      var l2 = this.stringifyProperty("value");
      if (i === "value")
        return l2 ? o : -1;
      o += l2.length, o += f.after.length;
      var p = this._spacesFor("insensitive");
      return o += p.before.length, i === "insensitive" && this.insensitive ? o : -1;
    }, n.toString = function() {
      var i = this, o = [this.rawSpaceBefore, "["];
      return o.push(this._stringFor("qualifiedAttribute", "attribute")), this.operator && (this.value || this.value === "") && (o.push(this._stringFor("operator")), o.push(this._stringFor("value")), o.push(this._stringFor("insensitiveFlag", "insensitive", function(s, a) {
        return s.length > 0 && !i.quoted && a.before.length === 0 && !(i.spaces.value && i.spaces.value.after) && (a.before = " "), ll(s, a);
      }))), o.push("]"), o.push(this.rawSpaceAfter), o.join("");
    }, qh(t, [{ key: "quoted", get: function() {
      var i = this.quoteMark;
      return i === "'" || i === '"';
    }, set: function(i) {
      jh();
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
        var o = jo(i), s = o.deprecatedUsage, a = o.unescaped, u2 = o.quoteMark;
        if (s && zh(), a === this._value && u2 === this._quoteMark)
          return;
        this._value = a, this._quoteMark = u2, this._syncRawValue();
      } else
        this._value = i;
    } }, { key: "attribute", get: function() {
      return this._attribute;
    }, set: function(i) {
      this._handleEscapes("attribute", i), this._attribute = i;
    } }]), t;
  }(Bh.default);
  cn.default = pi;
  pi.NO_QUOTE = null;
  pi.SINGLE_QUOTE = "'";
  pi.DOUBLE_QUOTE = '"';
  var Uo = (qo = { "'": { quotes: "single", wrap: true }, '"': { quotes: "double", wrap: true } }, qo[null] = { isIdentifier: true }, qo);
  function ll(e, t) {
    return "" + t.before + e + t.after;
  }
});
var Yo = U((dn, fl2) => {
  "use strict";
  dn.__esModule = true;
  dn.default = void 0;
  var Yh = Qh(di()), Xh = Be();
  function Qh(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Kh(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Ho(e, t);
  }
  function Ho(e, t) {
    return Ho = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Ho(e, t);
  }
  var Jh = function(e) {
    Kh(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Xh.UNIVERSAL, r.value = "*", r;
    }
    return t;
  }(Yh.default);
  dn.default = Jh;
  fl2.exports = dn.default;
});
var Qo = U((pn, cl) => {
  "use strict";
  pn.__esModule = true;
  pn.default = void 0;
  var Zh = tm(Ft()), em = Be();
  function tm(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function rm(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Xo(e, t);
  }
  function Xo(e, t) {
    return Xo = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Xo(e, t);
  }
  var nm = function(e) {
    rm(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = em.COMBINATOR, r;
    }
    return t;
  }(Zh.default);
  pn.default = nm;
  cl.exports = pn.default;
});
var Jo = U((hn, dl) => {
  "use strict";
  hn.__esModule = true;
  hn.default = void 0;
  var im = sm(Ft()), om = Be();
  function sm(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function am(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Ko(e, t);
  }
  function Ko(e, t) {
    return Ko = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Ko(e, t);
  }
  var um = function(e) {
    am(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = om.NESTING, r.value = "&", r;
    }
    return t;
  }(im.default);
  hn.default = um;
  dl.exports = hn.default;
});
var hl = U((hi, pl) => {
  "use strict";
  hi.__esModule = true;
  hi.default = lm;
  function lm(e) {
    return e.sort(function(t, n) {
      return t - n;
    });
  }
  pl.exports = hi.default;
});
var Zo = U(($) => {
  "use strict";
  $.__esModule = true;
  $.combinator = $.word = $.comment = $.str = $.tab = $.newline = $.feed = $.cr = $.backslash = $.bang = $.slash = $.doubleQuote = $.singleQuote = $.space = $.greaterThan = $.pipe = $.equals = $.plus = $.caret = $.tilde = $.dollar = $.closeSquare = $.openSquare = $.closeParenthesis = $.openParenthesis = $.semicolon = $.colon = $.comma = $.at = $.asterisk = $.ampersand = void 0;
  var fm = 38;
  $.ampersand = fm;
  var cm = 42;
  $.asterisk = cm;
  var dm = 64;
  $.at = dm;
  var pm = 44;
  $.comma = pm;
  var hm = 58;
  $.colon = hm;
  var mm = 59;
  $.semicolon = mm;
  var gm = 40;
  $.openParenthesis = gm;
  var bm = 41;
  $.closeParenthesis = bm;
  var vm = 91;
  $.openSquare = vm;
  var ym = 93;
  $.closeSquare = ym;
  var xm = 36;
  $.dollar = xm;
  var wm = 126;
  $.tilde = wm;
  var Sm = 94;
  $.caret = Sm;
  var _m = 43;
  $.plus = _m;
  var Tm = 61;
  $.equals = Tm;
  var km = 124;
  $.pipe = km;
  var Em = 62;
  $.greaterThan = Em;
  var Om = 32;
  $.space = Om;
  var ml = 39;
  $.singleQuote = ml;
  var Pm = 34;
  $.doubleQuote = Pm;
  var Am = 47;
  $.slash = Am;
  var Im = 33;
  $.bang = Im;
  var Rm = 92;
  $.backslash = Rm;
  var Cm = 13;
  $.cr = Cm;
  var Lm = 12;
  $.feed = Lm;
  var Mm = 10;
  $.newline = Mm;
  var Nm = 9;
  $.tab = Nm;
  var Wm = ml;
  $.str = Wm;
  var Fm = -1;
  $.comment = Fm;
  var Dm = -2;
  $.word = Dm;
  var Bm = -3;
  $.combinator = Bm;
});
var vl = U((mn) => {
  "use strict";
  mn.__esModule = true;
  mn.default = Vm;
  mn.FIELDS = void 0;
  var W = $m(Zo()), Sr, he;
  function bl() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return bl = function() {
      return e;
    }, e;
  }
  function $m(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = bl();
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
  var qm = (Sr = {}, Sr[W.tab] = true, Sr[W.newline] = true, Sr[W.cr] = true, Sr[W.feed] = true, Sr), Um = (he = {}, he[W.space] = true, he[W.tab] = true, he[W.newline] = true, he[W.cr] = true, he[W.feed] = true, he[W.ampersand] = true, he[W.asterisk] = true, he[W.bang] = true, he[W.comma] = true, he[W.colon] = true, he[W.semicolon] = true, he[W.openParenthesis] = true, he[W.closeParenthesis] = true, he[W.openSquare] = true, he[W.closeSquare] = true, he[W.singleQuote] = true, he[W.doubleQuote] = true, he[W.plus] = true, he[W.pipe] = true, he[W.tilde] = true, he[W.greaterThan] = true, he[W.equals] = true, he[W.dollar] = true, he[W.caret] = true, he[W.slash] = true, he), es = {}, gl = "0123456789abcdefABCDEF";
  for (mi = 0; mi < gl.length; mi++)
    es[gl.charCodeAt(mi)] = true;
  var mi;
  function Gm(e, t) {
    var n = t, r;
    do {
      if (r = e.charCodeAt(n), Um[r])
        return n - 1;
      r === W.backslash ? n = zm(e, n) + 1 : n++;
    } while (n < e.length);
    return n - 1;
  }
  function zm(e, t) {
    var n = t, r = e.charCodeAt(n + 1);
    if (!qm[r])
      if (es[r]) {
        var i = 0;
        do
          n++, i++, r = e.charCodeAt(n + 1);
        while (es[r] && i < 6);
        i < 6 && r === W.space && n++;
      } else
        n++;
    return n;
  }
  var jm = { TYPE: 0, START_LINE: 1, START_COL: 2, END_LINE: 3, END_COL: 4, START_POS: 5, END_POS: 6 };
  mn.FIELDS = jm;
  function Vm(e) {
    var t = [], n = e.css.valueOf(), r = n, i = r.length, o = -1, s = 1, a = 0, u2 = 0, f, l2, p, h2, m2, b, y, T, k, P2, w2, S2, O;
    function I(F, q) {
      if (e.safe)
        n += q, k = n.length - 1;
      else
        throw e.error("Unclosed " + F, s, a - o, a);
    }
    for (; a < i; ) {
      switch (f = n.charCodeAt(a), f === W.newline && (o = a, s += 1), f) {
        case W.space:
        case W.tab:
        case W.newline:
        case W.cr:
        case W.feed:
          k = a;
          do
            k += 1, f = n.charCodeAt(k), f === W.newline && (o = k, s += 1);
          while (f === W.space || f === W.newline || f === W.tab || f === W.cr || f === W.feed);
          O = W.space, h2 = s, p = k - o - 1, u2 = k;
          break;
        case W.plus:
        case W.greaterThan:
        case W.tilde:
        case W.pipe:
          k = a;
          do
            k += 1, f = n.charCodeAt(k);
          while (f === W.plus || f === W.greaterThan || f === W.tilde || f === W.pipe);
          O = W.combinator, h2 = s, p = a - o, u2 = k;
          break;
        case W.asterisk:
        case W.ampersand:
        case W.bang:
        case W.comma:
        case W.equals:
        case W.dollar:
        case W.caret:
        case W.openSquare:
        case W.closeSquare:
        case W.colon:
        case W.semicolon:
        case W.openParenthesis:
        case W.closeParenthesis:
          k = a, O = f, h2 = s, p = a - o, u2 = k + 1;
          break;
        case W.singleQuote:
        case W.doubleQuote:
          S2 = f === W.singleQuote ? "'" : '"', k = a;
          do
            for (m2 = false, k = n.indexOf(S2, k + 1), k === -1 && I("quote", S2), b = k; n.charCodeAt(b - 1) === W.backslash; )
              b -= 1, m2 = !m2;
          while (m2);
          O = W.str, h2 = s, p = a - o, u2 = k + 1;
          break;
        default:
          f === W.slash && n.charCodeAt(a + 1) === W.asterisk ? (k = n.indexOf("*/", a + 2) + 1, k === 0 && I("comment", "*/"), l2 = n.slice(a, k + 1), T = l2.split(`
`), y = T.length - 1, y > 0 ? (P2 = s + y, w2 = k - T[y].length) : (P2 = s, w2 = o), O = W.comment, s = P2, h2 = P2, p = k - w2) : f === W.slash ? (k = a, O = f, h2 = s, p = a - o, u2 = k + 1) : (k = Gm(n, a), O = W.word, h2 = s, p = k - o), u2 = k + 1;
          break;
      }
      t.push([O, s, a - o, h2, p, a, u2]), w2 && (o = w2, w2 = null), a = u2;
    }
    return t;
  }
});
var El = U((gn, kl) => {
  "use strict";
  gn.__esModule = true;
  gn.default = void 0;
  var Hm = ut(To()), ts = ut(Eo()), Ym = ut(Ao()), yl = ut(Ro()), Xm = ut(Lo()), Qm = ut(Wo()), rs = ut(Do()), Km = ut($o()), xl = gi(Vo()), Jm = ut(Yo()), ns = ut(Qo()), Zm = ut(Jo()), e0 = ut(hl()), C = gi(vl()), B = gi(Zo()), t0 = gi(Be()), Se = Qr(), ir, is;
  function Tl() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return Tl = function() {
      return e;
    }, e;
  }
  function gi(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = Tl();
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
  function ut(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function wl(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function r0(e, t, n) {
    return t && wl(e.prototype, t), n && wl(e, n), e;
  }
  var as = (ir = {}, ir[B.space] = true, ir[B.cr] = true, ir[B.feed] = true, ir[B.newline] = true, ir[B.tab] = true, ir), n0 = Object.assign({}, as, (is = {}, is[B.comment] = true, is));
  function Sl(e) {
    return { line: e[C.FIELDS.START_LINE], column: e[C.FIELDS.START_COL] };
  }
  function _l(e) {
    return { line: e[C.FIELDS.END_LINE], column: e[C.FIELDS.END_COL] };
  }
  function or(e, t, n, r) {
    return { start: { line: e, column: t }, end: { line: n, column: r } };
  }
  function _r(e) {
    return or(e[C.FIELDS.START_LINE], e[C.FIELDS.START_COL], e[C.FIELDS.END_LINE], e[C.FIELDS.END_COL]);
  }
  function os(e, t) {
    if (e)
      return or(e[C.FIELDS.START_LINE], e[C.FIELDS.START_COL], t[C.FIELDS.END_LINE], t[C.FIELDS.END_COL]);
  }
  function Tr(e, t) {
    var n = e[t];
    if (typeof n == "string")
      return n.indexOf("\\") !== -1 && ((0, Se.ensureObject)(e, "raws"), e[t] = (0, Se.unesc)(n), e.raws[t] === void 0 && (e.raws[t] = n)), e;
  }
  function ss(e, t) {
    for (var n = -1, r = []; (n = e.indexOf(t, n + 1)) !== -1; )
      r.push(n);
    return r;
  }
  function i0() {
    var e = Array.prototype.concat.apply([], arguments);
    return e.filter(function(t, n) {
      return n === e.indexOf(t);
    });
  }
  var o0 = function() {
    function e(n, r) {
      r === void 0 && (r = {}), this.rule = n, this.options = Object.assign({ lossy: false, safe: false }, r), this.position = 0, this.css = typeof this.rule == "string" ? this.rule : this.rule.selector, this.tokens = (0, C.default)({ css: this.css, error: this._errorGenerator(), safe: this.options.safe });
      var i = os(this.tokens[0], this.tokens[this.tokens.length - 1]);
      this.root = new Hm.default({ source: i }), this.root.errorGenerator = this._errorGenerator();
      var o = new ts.default({ source: { start: { line: 1, column: 1 } } });
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
      for (this.position++; this.position < this.tokens.length && this.currToken[C.FIELDS.TYPE] !== B.closeSquare; )
        r.push(this.currToken), this.position++;
      if (this.currToken[C.FIELDS.TYPE] !== B.closeSquare)
        return this.expected("closing square bracket", this.currToken[C.FIELDS.START_POS]);
      var o = r.length, s = { source: or(i[1], i[2], this.currToken[3], this.currToken[4]), sourceIndex: i[C.FIELDS.START_POS] };
      if (o === 1 && !~[B.word].indexOf(r[0][C.FIELDS.TYPE]))
        return this.expected("attribute", r[0][C.FIELDS.START_POS]);
      for (var a = 0, u2 = "", f = "", l2 = null, p = false; a < o; ) {
        var h2 = r[a], m2 = this.content(h2), b = r[a + 1];
        switch (h2[C.FIELDS.TYPE]) {
          case B.space:
            if (p = true, this.options.lossy)
              break;
            if (l2) {
              (0, Se.ensureObject)(s, "spaces", l2);
              var y = s.spaces[l2].after || "";
              s.spaces[l2].after = y + m2;
              var T = (0, Se.getProp)(s, "raws", "spaces", l2, "after") || null;
              T && (s.raws.spaces[l2].after = T + m2);
            } else
              u2 = u2 + m2, f = f + m2;
            break;
          case B.asterisk:
            if (b[C.FIELDS.TYPE] === B.equals)
              s.operator = m2, l2 = "operator";
            else if ((!s.namespace || l2 === "namespace" && !p) && b) {
              u2 && ((0, Se.ensureObject)(s, "spaces", "attribute"), s.spaces.attribute.before = u2, u2 = ""), f && ((0, Se.ensureObject)(s, "raws", "spaces", "attribute"), s.raws.spaces.attribute.before = u2, f = ""), s.namespace = (s.namespace || "") + m2;
              var k = (0, Se.getProp)(s, "raws", "namespace") || null;
              k && (s.raws.namespace += m2), l2 = "namespace";
            }
            p = false;
            break;
          case B.dollar:
            if (l2 === "value") {
              var P2 = (0, Se.getProp)(s, "raws", "value");
              s.value += "$", P2 && (s.raws.value = P2 + "$");
              break;
            }
          case B.caret:
            b[C.FIELDS.TYPE] === B.equals && (s.operator = m2, l2 = "operator"), p = false;
            break;
          case B.combinator:
            if (m2 === "~" && b[C.FIELDS.TYPE] === B.equals && (s.operator = m2, l2 = "operator"), m2 !== "|") {
              p = false;
              break;
            }
            b[C.FIELDS.TYPE] === B.equals ? (s.operator = m2, l2 = "operator") : !s.namespace && !s.attribute && (s.namespace = true), p = false;
            break;
          case B.word:
            if (b && this.content(b) === "|" && r[a + 2] && r[a + 2][C.FIELDS.TYPE] !== B.equals && !s.operator && !s.namespace)
              s.namespace = m2, l2 = "namespace";
            else if (!s.attribute || l2 === "attribute" && !p) {
              u2 && ((0, Se.ensureObject)(s, "spaces", "attribute"), s.spaces.attribute.before = u2, u2 = ""), f && ((0, Se.ensureObject)(s, "raws", "spaces", "attribute"), s.raws.spaces.attribute.before = f, f = ""), s.attribute = (s.attribute || "") + m2;
              var w2 = (0, Se.getProp)(s, "raws", "attribute") || null;
              w2 && (s.raws.attribute += m2), l2 = "attribute";
            } else if (!s.value && s.value !== "" || l2 === "value" && !p) {
              var S2 = (0, Se.unesc)(m2), O = (0, Se.getProp)(s, "raws", "value") || "", I = s.value || "";
              s.value = I + S2, s.quoteMark = null, (S2 !== m2 || O) && ((0, Se.ensureObject)(s, "raws"), s.raws.value = (O || I) + m2), l2 = "value";
            } else {
              var F = m2 === "i" || m2 === "I";
              (s.value || s.value === "") && (s.quoteMark || p) ? (s.insensitive = F, (!F || m2 === "I") && ((0, Se.ensureObject)(s, "raws"), s.raws.insensitiveFlag = m2), l2 = "insensitive", u2 && ((0, Se.ensureObject)(s, "spaces", "insensitive"), s.spaces.insensitive.before = u2, u2 = ""), f && ((0, Se.ensureObject)(s, "raws", "spaces", "insensitive"), s.raws.spaces.insensitive.before = f, f = "")) : (s.value || s.value === "") && (l2 = "value", s.value += m2, s.raws.value && (s.raws.value += m2));
            }
            p = false;
            break;
          case B.str:
            if (!s.attribute || !s.operator)
              return this.error("Expected an attribute followed by an operator preceding the string.", { index: h2[C.FIELDS.START_POS] });
            var q = (0, xl.unescapeValue)(m2), V = q.unescaped, de = q.quoteMark;
            s.value = V, s.quoteMark = de, l2 = "value", (0, Se.ensureObject)(s, "raws"), s.raws.value = m2, p = false;
            break;
          case B.equals:
            if (!s.attribute)
              return this.expected("attribute", h2[C.FIELDS.START_POS], m2);
            if (s.value)
              return this.error('Unexpected "=" found; an operator was already defined.', { index: h2[C.FIELDS.START_POS] });
            s.operator = s.operator ? s.operator + m2 : m2, l2 = "operator", p = false;
            break;
          case B.comment:
            if (l2)
              if (p || b && b[C.FIELDS.TYPE] === B.space || l2 === "insensitive") {
                var Ae = (0, Se.getProp)(s, "spaces", l2, "after") || "", me = (0, Se.getProp)(s, "raws", "spaces", l2, "after") || Ae;
                (0, Se.ensureObject)(s, "raws", "spaces", l2), s.raws.spaces[l2].after = me + m2;
              } else {
                var ue = s[l2] || "", Ie = (0, Se.getProp)(s, "raws", l2) || ue;
                (0, Se.ensureObject)(s, "raws"), s.raws[l2] = Ie + m2;
              }
            else
              f = f + m2;
            break;
          default:
            return this.error('Unexpected "' + m2 + '" found.', { index: h2[C.FIELDS.START_POS] });
        }
        a++;
      }
      Tr(s, "attribute"), Tr(s, "namespace"), this.newNode(new xl.default(s)), this.position++;
    }, t.parseWhitespaceEquivalentTokens = function(r) {
      r < 0 && (r = this.tokens.length);
      var i = this.position, o = [], s = "", a = void 0;
      do
        if (as[this.currToken[C.FIELDS.TYPE]])
          this.options.lossy || (s += this.content());
        else if (this.currToken[C.FIELDS.TYPE] === B.comment) {
          var u2 = {};
          s && (u2.before = s, s = ""), a = new yl.default({ value: this.content(), source: _r(this.currToken), sourceIndex: this.currToken[C.FIELDS.START_POS], spaces: u2 }), o.push(a);
        }
      while (++this.position < r);
      if (s) {
        if (a)
          a.spaces.after = s;
        else if (!this.options.lossy) {
          var f = this.tokens[i], l2 = this.tokens[this.position - 1];
          o.push(new rs.default({ value: "", source: or(f[C.FIELDS.START_LINE], f[C.FIELDS.START_COL], l2[C.FIELDS.END_LINE], l2[C.FIELDS.END_COL]), sourceIndex: f[C.FIELDS.START_POS], spaces: { before: s, after: "" } }));
        }
      }
      return o;
    }, t.convertWhitespaceNodesToSpace = function(r, i) {
      var o = this;
      i === void 0 && (i = false);
      var s = "", a = "";
      r.forEach(function(f) {
        var l2 = o.lossySpace(f.spaces.before, i), p = o.lossySpace(f.rawSpaceBefore, i);
        s += l2 + o.lossySpace(f.spaces.after, i && l2.length === 0), a += l2 + f.value + o.lossySpace(f.rawSpaceAfter, i && p.length === 0);
      }), a === s && (a = void 0);
      var u2 = { space: s, rawSpace: a };
      return u2;
    }, t.isNamedCombinator = function(r) {
      return r === void 0 && (r = this.position), this.tokens[r + 0] && this.tokens[r + 0][C.FIELDS.TYPE] === B.slash && this.tokens[r + 1] && this.tokens[r + 1][C.FIELDS.TYPE] === B.word && this.tokens[r + 2] && this.tokens[r + 2][C.FIELDS.TYPE] === B.slash;
    }, t.namedCombinator = function() {
      if (this.isNamedCombinator()) {
        var r = this.content(this.tokens[this.position + 1]), i = (0, Se.unesc)(r).toLowerCase(), o = {};
        i !== r && (o.value = "/" + r + "/");
        var s = new ns.default({ value: "/" + i + "/", source: or(this.currToken[C.FIELDS.START_LINE], this.currToken[C.FIELDS.START_COL], this.tokens[this.position + 2][C.FIELDS.END_LINE], this.tokens[this.position + 2][C.FIELDS.END_COL]), sourceIndex: this.currToken[C.FIELDS.START_POS], raws: o });
        return this.position = this.position + 3, s;
      } else
        this.unexpected();
    }, t.combinator = function() {
      var r = this;
      if (this.content() === "|")
        return this.namespace();
      var i = this.locateNextMeaningfulToken(this.position);
      if (i < 0 || this.tokens[i][C.FIELDS.TYPE] === B.comma) {
        var o = this.parseWhitespaceEquivalentTokens(i);
        if (o.length > 0) {
          var s = this.current.last;
          if (s) {
            var a = this.convertWhitespaceNodesToSpace(o), u2 = a.space, f = a.rawSpace;
            f !== void 0 && (s.rawSpaceAfter += f), s.spaces.after += u2;
          } else
            o.forEach(function(O) {
              return r.newNode(O);
            });
        }
        return;
      }
      var l2 = this.currToken, p = void 0;
      i > this.position && (p = this.parseWhitespaceEquivalentTokens(i));
      var h2;
      if (this.isNamedCombinator() ? h2 = this.namedCombinator() : this.currToken[C.FIELDS.TYPE] === B.combinator ? (h2 = new ns.default({ value: this.content(), source: _r(this.currToken), sourceIndex: this.currToken[C.FIELDS.START_POS] }), this.position++) : as[this.currToken[C.FIELDS.TYPE]] || p || this.unexpected(), h2) {
        if (p) {
          var m2 = this.convertWhitespaceNodesToSpace(p), b = m2.space, y = m2.rawSpace;
          h2.spaces.before = b, h2.rawSpaceBefore = y;
        }
      } else {
        var T = this.convertWhitespaceNodesToSpace(p, true), k = T.space, P2 = T.rawSpace;
        P2 || (P2 = k);
        var w2 = {}, S2 = { spaces: {} };
        k.endsWith(" ") && P2.endsWith(" ") ? (w2.before = k.slice(0, k.length - 1), S2.spaces.before = P2.slice(0, P2.length - 1)) : k.startsWith(" ") && P2.startsWith(" ") ? (w2.after = k.slice(1), S2.spaces.after = P2.slice(1)) : S2.value = P2, h2 = new ns.default({ value: " ", source: os(l2, this.tokens[this.position - 1]), sourceIndex: l2[C.FIELDS.START_POS], spaces: w2, raws: S2 });
      }
      return this.currToken && this.currToken[C.FIELDS.TYPE] === B.space && (h2.spaces.after = this.optionalSpace(this.content()), this.position++), this.newNode(h2);
    }, t.comma = function() {
      if (this.position === this.tokens.length - 1) {
        this.root.trailingComma = true, this.position++;
        return;
      }
      this.current._inferEndPosition();
      var r = new ts.default({ source: { start: Sl(this.tokens[this.position + 1]) } });
      this.current.parent.append(r), this.current = r, this.position++;
    }, t.comment = function() {
      var r = this.currToken;
      this.newNode(new yl.default({ value: this.content(), source: _r(r), sourceIndex: r[C.FIELDS.START_POS] })), this.position++;
    }, t.error = function(r, i) {
      throw this.root.error(r, i);
    }, t.missingBackslash = function() {
      return this.error("Expected a backslash preceding the semicolon.", { index: this.currToken[C.FIELDS.START_POS] });
    }, t.missingParenthesis = function() {
      return this.expected("opening parenthesis", this.currToken[C.FIELDS.START_POS]);
    }, t.missingSquareBracket = function() {
      return this.expected("opening square bracket", this.currToken[C.FIELDS.START_POS]);
    }, t.unexpected = function() {
      return this.error("Unexpected '" + this.content() + "'. Escaping special characters with \\ may help.", this.currToken[C.FIELDS.START_POS]);
    }, t.namespace = function() {
      var r = this.prevToken && this.content(this.prevToken) || true;
      if (this.nextToken[C.FIELDS.TYPE] === B.word)
        return this.position++, this.word(r);
      if (this.nextToken[C.FIELDS.TYPE] === B.asterisk)
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
      this.newNode(new Zm.default({ value: this.content(), source: _r(i), sourceIndex: i[C.FIELDS.START_POS] })), this.position++;
    }, t.parentheses = function() {
      var r = this.current.last, i = 1;
      if (this.position++, r && r.type === t0.PSEUDO) {
        var o = new ts.default({ source: { start: Sl(this.tokens[this.position - 1]) } }), s = this.current;
        for (r.append(o), this.current = o; this.position < this.tokens.length && i; )
          this.currToken[C.FIELDS.TYPE] === B.openParenthesis && i++, this.currToken[C.FIELDS.TYPE] === B.closeParenthesis && i--, i ? this.parse() : (this.current.source.end = _l(this.currToken), this.current.parent.source.end = _l(this.currToken), this.position++);
        this.current = s;
      } else {
        for (var a = this.currToken, u2 = "(", f; this.position < this.tokens.length && i; )
          this.currToken[C.FIELDS.TYPE] === B.openParenthesis && i++, this.currToken[C.FIELDS.TYPE] === B.closeParenthesis && i--, f = this.currToken, u2 += this.parseParenthesisToken(this.currToken), this.position++;
        r ? r.appendToPropertyAndEscape("value", u2, u2) : this.newNode(new rs.default({ value: u2, source: or(a[C.FIELDS.START_LINE], a[C.FIELDS.START_COL], f[C.FIELDS.END_LINE], f[C.FIELDS.END_COL]), sourceIndex: a[C.FIELDS.START_POS] }));
      }
      if (i)
        return this.expected("closing parenthesis", this.currToken[C.FIELDS.START_POS]);
    }, t.pseudo = function() {
      for (var r = this, i = "", o = this.currToken; this.currToken && this.currToken[C.FIELDS.TYPE] === B.colon; )
        i += this.content(), this.position++;
      if (!this.currToken)
        return this.expected(["pseudo-class", "pseudo-element"], this.position - 1);
      if (this.currToken[C.FIELDS.TYPE] === B.word)
        this.splitWord(false, function(s, a) {
          i += s, r.newNode(new Km.default({ value: i, source: os(o, r.currToken), sourceIndex: o[C.FIELDS.START_POS] })), a > 1 && r.nextToken && r.nextToken[C.FIELDS.TYPE] === B.openParenthesis && r.error("Misplaced parenthesis.", { index: r.nextToken[C.FIELDS.START_POS] });
        });
      else
        return this.expected(["pseudo-class", "pseudo-element"], this.currToken[C.FIELDS.START_POS]);
    }, t.space = function() {
      var r = this.content();
      this.position === 0 || this.prevToken[C.FIELDS.TYPE] === B.comma || this.prevToken[C.FIELDS.TYPE] === B.openParenthesis || this.current.nodes.every(function(i) {
        return i.type === "comment";
      }) ? (this.spaces = this.optionalSpace(r), this.position++) : this.position === this.tokens.length - 1 || this.nextToken[C.FIELDS.TYPE] === B.comma || this.nextToken[C.FIELDS.TYPE] === B.closeParenthesis ? (this.current.last.spaces.after = this.optionalSpace(r), this.position++) : this.combinator();
    }, t.string = function() {
      var r = this.currToken;
      this.newNode(new rs.default({ value: this.content(), source: _r(r), sourceIndex: r[C.FIELDS.START_POS] })), this.position++;
    }, t.universal = function(r) {
      var i = this.nextToken;
      if (i && this.content(i) === "|")
        return this.position++, this.namespace();
      var o = this.currToken;
      this.newNode(new Jm.default({ value: this.content(), source: _r(o), sourceIndex: o[C.FIELDS.START_POS] }), r), this.position++;
    }, t.splitWord = function(r, i) {
      for (var o = this, s = this.nextToken, a = this.content(); s && ~[B.dollar, B.caret, B.equals, B.word].indexOf(s[C.FIELDS.TYPE]); ) {
        this.position++;
        var u2 = this.content();
        if (a += u2, u2.lastIndexOf("\\") === u2.length - 1) {
          var f = this.nextToken;
          f && f[C.FIELDS.TYPE] === B.space && (a += this.requiredSpace(this.content(f)), this.position++);
        }
        s = this.nextToken;
      }
      var l2 = ss(a, ".").filter(function(b) {
        var y = a[b - 1] === "\\", T = /^\d+\.\d+%$/.test(a);
        return !y && !T;
      }), p = ss(a, "#").filter(function(b) {
        return a[b - 1] !== "\\";
      }), h2 = ss(a, "#{");
      h2.length && (p = p.filter(function(b) {
        return !~h2.indexOf(b);
      }));
      var m2 = (0, e0.default)(i0([0].concat(l2, p)));
      m2.forEach(function(b, y) {
        var T = m2[y + 1] || a.length, k = a.slice(b, T);
        if (y === 0 && i)
          return i.call(o, k, m2.length);
        var P2, w2 = o.currToken, S2 = w2[C.FIELDS.START_POS] + m2[y], O = or(w2[1], w2[2] + b, w2[3], w2[2] + (T - 1));
        if (~l2.indexOf(b)) {
          var I = { value: k.slice(1), source: O, sourceIndex: S2 };
          P2 = new Ym.default(Tr(I, "value"));
        } else if (~p.indexOf(b)) {
          var F = { value: k.slice(1), source: O, sourceIndex: S2 };
          P2 = new Xm.default(Tr(F, "value"));
        } else {
          var q = { value: k, source: O, sourceIndex: S2 };
          Tr(q, "value"), P2 = new Qm.default(q);
        }
        o.newNode(P2, r), r = null;
      }), this.position++;
    }, t.word = function(r) {
      var i = this.nextToken;
      return i && this.content(i) === "|" ? (this.position++, this.namespace()) : this.splitWord(r);
    }, t.loop = function() {
      for (; this.position < this.tokens.length; )
        this.parse(true);
      return this.current._inferEndPosition(), this.root;
    }, t.parse = function(r) {
      switch (this.currToken[C.FIELDS.TYPE]) {
        case B.space:
          this.space();
          break;
        case B.comment:
          this.comment();
          break;
        case B.openParenthesis:
          this.parentheses();
          break;
        case B.closeParenthesis:
          r && this.missingParenthesis();
          break;
        case B.openSquare:
          this.attribute();
          break;
        case B.dollar:
        case B.caret:
        case B.equals:
        case B.word:
          this.word();
          break;
        case B.colon:
          this.pseudo();
          break;
        case B.comma:
          this.comma();
          break;
        case B.asterisk:
          this.universal();
          break;
        case B.ampersand:
          this.nesting();
          break;
        case B.slash:
        case B.combinator:
          this.combinator();
          break;
        case B.str:
          this.string();
          break;
        case B.closeSquare:
          this.missingSquareBracket();
        case B.semicolon:
          this.missingBackslash();
        default:
          this.unexpected();
      }
    }, t.expected = function(r, i, o) {
      if (Array.isArray(r)) {
        var s = r.pop();
        r = r.join(", ") + " or " + s;
      }
      var a = /^[aeiou]/.test(r[0]) ? "an" : "a";
      return o ? this.error("Expected " + a + " " + r + ', found "' + o + '" instead.', { index: i }) : this.error("Expected " + a + " " + r + ".", { index: i });
    }, t.requiredSpace = function(r) {
      return this.options.lossy ? " " : r;
    }, t.optionalSpace = function(r) {
      return this.options.lossy ? "" : r;
    }, t.lossySpace = function(r, i) {
      return this.options.lossy ? i ? " " : "" : r;
    }, t.parseParenthesisToken = function(r) {
      var i = this.content(r);
      return r[C.FIELDS.TYPE] === B.space ? this.requiredSpace(i) : i;
    }, t.newNode = function(r, i) {
      return i && (/^ +$/.test(i) && (this.options.lossy || (this.spaces = (this.spaces || "") + i), i = true), r.namespace = i, Tr(r, "namespace")), this.spaces && (r.spaces.before = this.spaces, this.spaces = ""), this.current.append(r);
    }, t.content = function(r) {
      return r === void 0 && (r = this.currToken), this.css.slice(r[C.FIELDS.START_POS], r[C.FIELDS.END_POS]);
    }, t.locateNextMeaningfulToken = function(r) {
      r === void 0 && (r = this.position + 1);
      for (var i = r; i < this.tokens.length; )
        if (n0[this.tokens[i][C.FIELDS.TYPE]]) {
          i++;
          continue;
        } else
          return i;
      return -1;
    }, r0(e, [{ key: "currToken", get: function() {
      return this.tokens[this.position];
    } }, { key: "nextToken", get: function() {
      return this.tokens[this.position + 1];
    } }, { key: "prevToken", get: function() {
      return this.tokens[this.position - 1];
    } }]), e;
  }();
  gn.default = o0;
  kl.exports = gn.default;
});
var Pl = U((bn, Ol) => {
  "use strict";
  bn.__esModule = true;
  bn.default = void 0;
  var s0 = a0(El());
  function a0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var u0 = function() {
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
      var o = new s0.default(r, this._parseOptions(i));
      return o.root;
    }, t._parseOptions = function(r) {
      return { lossy: this._isLossy(r) };
    }, t._run = function(r, i) {
      var o = this;
      return i === void 0 && (i = {}), new Promise(function(s, a) {
        try {
          var u2 = o._root(r, i);
          Promise.resolve(o.func(u2)).then(function(f) {
            var l2 = void 0;
            return o._shouldUpdateSelector(r, i) && (l2 = u2.toString(), r.selector = l2), { transform: f, root: u2, string: l2 };
          }).then(s, a);
        } catch (f) {
          a(f);
          return;
        }
      });
    }, t._runSync = function(r, i) {
      i === void 0 && (i = {});
      var o = this._root(r, i), s = this.func(o);
      if (s && typeof s.then == "function")
        throw new Error("Selector processor returned a promise to a synchronous call.");
      var a = void 0;
      return i.updateSelector && typeof r != "string" && (a = o.toString(), r.selector = a), { transform: s, root: o, string: a };
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
  bn.default = u0;
  Ol.exports = bn.default;
});
var Al = U((be) => {
  "use strict";
  be.__esModule = true;
  be.universal = be.tag = be.string = be.selector = be.root = be.pseudo = be.nesting = be.id = be.comment = be.combinator = be.className = be.attribute = void 0;
  var l0 = lt(Vo()), f0 = lt(Ao()), c0 = lt(Qo()), d0 = lt(Ro()), p0 = lt(Lo()), h0 = lt(Jo()), m0 = lt($o()), g0 = lt(To()), b0 = lt(Eo()), v0 = lt(Do()), y0 = lt(Wo()), x0 = lt(Yo());
  function lt(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var w0 = function(t) {
    return new l0.default(t);
  };
  be.attribute = w0;
  var S0 = function(t) {
    return new f0.default(t);
  };
  be.className = S0;
  var _0 = function(t) {
    return new c0.default(t);
  };
  be.combinator = _0;
  var T0 = function(t) {
    return new d0.default(t);
  };
  be.comment = T0;
  var k0 = function(t) {
    return new p0.default(t);
  };
  be.id = k0;
  var E0 = function(t) {
    return new h0.default(t);
  };
  be.nesting = E0;
  var O0 = function(t) {
    return new m0.default(t);
  };
  be.pseudo = O0;
  var P0 = function(t) {
    return new g0.default(t);
  };
  be.root = P0;
  var A0 = function(t) {
    return new b0.default(t);
  };
  be.selector = A0;
  var I0 = function(t) {
    return new v0.default(t);
  };
  be.string = I0;
  var R0 = function(t) {
    return new y0.default(t);
  };
  be.tag = R0;
  var C0 = function(t) {
    return new x0.default(t);
  };
  be.universal = C0;
});
var Ll = U((oe) => {
  "use strict";
  oe.__esModule = true;
  oe.isNode = us;
  oe.isPseudoElement = Cl;
  oe.isPseudoClass = G0;
  oe.isContainer = z0;
  oe.isNamespace = j0;
  oe.isUniversal = oe.isTag = oe.isString = oe.isSelector = oe.isRoot = oe.isPseudo = oe.isNesting = oe.isIdentifier = oe.isComment = oe.isCombinator = oe.isClassName = oe.isAttribute = void 0;
  var _e = Be(), Qe, L0 = (Qe = {}, Qe[_e.ATTRIBUTE] = true, Qe[_e.CLASS] = true, Qe[_e.COMBINATOR] = true, Qe[_e.COMMENT] = true, Qe[_e.ID] = true, Qe[_e.NESTING] = true, Qe[_e.PSEUDO] = true, Qe[_e.ROOT] = true, Qe[_e.SELECTOR] = true, Qe[_e.STRING] = true, Qe[_e.TAG] = true, Qe[_e.UNIVERSAL] = true, Qe);
  function us(e) {
    return typeof e == "object" && L0[e.type];
  }
  function ft(e, t) {
    return us(t) && t.type === e;
  }
  var Il = ft.bind(null, _e.ATTRIBUTE);
  oe.isAttribute = Il;
  var M0 = ft.bind(null, _e.CLASS);
  oe.isClassName = M0;
  var N0 = ft.bind(null, _e.COMBINATOR);
  oe.isCombinator = N0;
  var W0 = ft.bind(null, _e.COMMENT);
  oe.isComment = W0;
  var F0 = ft.bind(null, _e.ID);
  oe.isIdentifier = F0;
  var D0 = ft.bind(null, _e.NESTING);
  oe.isNesting = D0;
  var ls = ft.bind(null, _e.PSEUDO);
  oe.isPseudo = ls;
  var B0 = ft.bind(null, _e.ROOT);
  oe.isRoot = B0;
  var $0 = ft.bind(null, _e.SELECTOR);
  oe.isSelector = $0;
  var q0 = ft.bind(null, _e.STRING);
  oe.isString = q0;
  var Rl = ft.bind(null, _e.TAG);
  oe.isTag = Rl;
  var U0 = ft.bind(null, _e.UNIVERSAL);
  oe.isUniversal = U0;
  function Cl(e) {
    return ls(e) && e.value && (e.value.startsWith("::") || e.value.toLowerCase() === ":before" || e.value.toLowerCase() === ":after" || e.value.toLowerCase() === ":first-letter" || e.value.toLowerCase() === ":first-line");
  }
  function G0(e) {
    return ls(e) && !Cl(e);
  }
  function z0(e) {
    return !!(us(e) && e.walk);
  }
  function j0(e) {
    return Il(e) || Rl(e);
  }
});
var Ml = U((St) => {
  "use strict";
  St.__esModule = true;
  var fs = Be();
  Object.keys(fs).forEach(function(e) {
    e === "default" || e === "__esModule" || e in St && St[e] === fs[e] || (St[e] = fs[e]);
  });
  var cs = Al();
  Object.keys(cs).forEach(function(e) {
    e === "default" || e === "__esModule" || e in St && St[e] === cs[e] || (St[e] = cs[e]);
  });
  var ds = Ll();
  Object.keys(ds).forEach(function(e) {
    e === "default" || e === "__esModule" || e in St && St[e] === ds[e] || (St[e] = ds[e]);
  });
});
var Fl = U((vn, Wl) => {
  "use strict";
  vn.__esModule = true;
  vn.default = void 0;
  var V0 = X0(Pl()), H0 = Y0(Ml());
  function Nl() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return Nl = function() {
      return e;
    }, e;
  }
  function Y0(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = Nl();
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
  function X0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var ps = function(t) {
    return new V0.default(t);
  };
  Object.assign(ps, H0);
  delete ps.__esModule;
  var Q0 = ps;
  vn.default = Q0;
  Wl.exports = vn.default;
});
var Dl = U((hs) => {
  "use strict";
  Object.defineProperty(hs, "__esModule", { value: true });
  Object.defineProperty(hs, "default", { enumerable: true, get: () => K0 });
  function K0(e) {
    return e.replace(/\\,/g, "\\2c ");
  }
});
var $l = U((l1, Bl) => {
  "use strict";
  Bl.exports = { aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255], aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220], bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205], blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42], burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0], chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237], cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11], darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169], darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139], darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209], darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255], dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255], firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34], fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255], gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128], green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128], honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92], indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140], lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0], lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128], lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211], lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250], lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222], lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50], linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0], mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211], mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238], mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133], midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225], moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128], oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35], orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214], palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238], palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185], peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221], powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153], red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225], saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96], seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45], silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205], slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250], springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140], teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71], turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179], white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0], yellowgreen: [154, 205, 50] };
});
var gs = U((ms) => {
  "use strict";
  Object.defineProperty(ms, "__esModule", { value: true });
  function J0(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  J0(ms, { parseColor: () => ig, formatColor: () => og });
  var ql = Z0($l());
  function Z0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var eg = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i, tg = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i, Vt = /(?:\d+|\d*\.\d+)%?/, bi = /(?:\s*,\s*|\s+)/, Ul = /\s*[,/]\s*/, Ht = /var\(--(?:[^ )]*?)\)/, rg = new RegExp(`^(rgb)a?\\(\\s*(${Vt.source}|${Ht.source})(?:${bi.source}(${Vt.source}|${Ht.source}))?(?:${bi.source}(${Vt.source}|${Ht.source}))?(?:${Ul.source}(${Vt.source}|${Ht.source}))?\\s*\\)$`), ng = new RegExp(`^(hsl)a?\\(\\s*((?:${Vt.source})(?:deg|rad|grad|turn)?|${Ht.source})(?:${bi.source}(${Vt.source}|${Ht.source}))?(?:${bi.source}(${Vt.source}|${Ht.source}))?(?:${Ul.source}(${Vt.source}|${Ht.source}))?\\s*\\)$`);
  function ig(e, { loose: t = false } = {}) {
    var n, r;
    if (typeof e != "string")
      return null;
    if (e = e.trim(), e === "transparent")
      return { mode: "rgb", color: ["0", "0", "0"], alpha: "0" };
    if (e in ql.default)
      return { mode: "rgb", color: ql.default[e].map((u2) => u2.toString()) };
    let i = e.replace(tg, (u2, f, l2, p, h2) => ["#", f, f, l2, l2, p, p, h2 ? h2 + h2 : ""].join("")).match(eg);
    if (i !== null)
      return { mode: "rgb", color: [parseInt(i[1], 16), parseInt(i[2], 16), parseInt(i[3], 16)].map((u2) => u2.toString()), alpha: i[4] ? (parseInt(i[4], 16) / 255).toString() : void 0 };
    var o;
    let s = (o = e.match(rg)) !== null && o !== void 0 ? o : e.match(ng);
    if (s === null)
      return null;
    let a = [s[2], s[3], s[4]].filter(Boolean).map((u2) => u2.toString());
    return !t && a.length !== 3 || a.length < 3 && !a.some((u2) => /^var\(.*?\)$/.test(u2)) ? null : { mode: s[1], color: a, alpha: (n = s[5]) === null || n === void 0 || (r = n.toString) === null || r === void 0 ? void 0 : r.call(n) };
  }
  function og({ mode: e, color: t, alpha: n }) {
    let r = n !== void 0;
    return `${e}(${t.join(" ")}${r ? ` / ${n}` : ""})`;
  }
});
var vs = U((bs) => {
  "use strict";
  Object.defineProperty(bs, "__esModule", { value: true });
  function sg(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  sg(bs, { withAlphaValue: () => ag, default: () => ug });
  var vi = gs();
  function ag(e, t, n) {
    if (typeof e == "function")
      return e({ opacityValue: t });
    let r = (0, vi.parseColor)(e, { loose: true });
    return r === null ? n : (0, vi.formatColor)({ ...r, alpha: t });
  }
  function ug({ color: e, property: t, variable: n }) {
    let r = [].concat(t);
    if (typeof e == "function")
      return { [n]: "1", ...Object.fromEntries(r.map((o) => [o, e({ opacityVariable: n, opacityValue: `var(${n})` })])) };
    let i = (0, vi.parseColor)(e);
    return i === null ? Object.fromEntries(r.map((o) => [o, e])) : i.alpha !== void 0 ? Object.fromEntries(r.map((o) => [o, e])) : { [n]: "1", ...Object.fromEntries(r.map((o) => [o, (0, vi.formatColor)({ ...i, alpha: `var(${n})` })])) };
  }
});
var Hl = U((ys) => {
  "use strict";
  Object.defineProperty(ys, "__esModule", { value: true });
  function lg(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  lg(ys, { pattern: () => cg, withoutCapturing: () => zl, any: () => jl, optional: () => dg, zeroOrMore: () => pg, nestedBrackets: () => Vl, escape: () => sr });
  var Gl = /[\\^$.*+?()[\]{}|]/g, fg = RegExp(Gl.source);
  function yn(e) {
    return e = Array.isArray(e) ? e : [e], e = e.map((t) => t instanceof RegExp ? t.source : t), e.join("");
  }
  function cg(e) {
    return new RegExp(yn(e), "g");
  }
  function zl(e) {
    return new RegExp(`(?:${yn(e)})`, "g");
  }
  function jl(e) {
    return `(?:${e.map(yn).join("|")})`;
  }
  function dg(e) {
    return `(?:${yn(e)})?`;
  }
  function pg(e) {
    return `(?:${yn(e)})*`;
  }
  function Vl(e, t, n = 1) {
    return zl([sr(e), /[^\s]*/, n === 1 ? `[^${sr(e)}${sr(t)}s]*` : jl([`[^${sr(e)}${sr(t)}s]*`, Vl(e, t, n - 1)]), /[^\s]*/, sr(t)]);
  }
  function sr(e) {
    return e && fg.test(e) ? e.replace(Gl, "\\$&") : e || "";
  }
});
var Xl = U((xs) => {
  "use strict";
  Object.defineProperty(xs, "__esModule", { value: true });
  Object.defineProperty(xs, "splitAtTopLevelOnly", { enumerable: true, get: () => gg });
  var hg = mg(Hl());
  function Yl(e) {
    if (typeof WeakMap != "function")
      return null;
    var t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new WeakMap();
    return (Yl = function(r) {
      return r ? n : t;
    })(e);
  }
  function mg(e, t) {
    if (!t && e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var n = Yl(t);
    if (n && n.has(e))
      return n.get(e);
    var r = {}, i = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var o in e)
      if (o !== "default" && Object.prototype.hasOwnProperty.call(e, o)) {
        var s = i ? Object.getOwnPropertyDescriptor(e, o) : null;
        s && (s.get || s.set) ? Object.defineProperty(r, o, s) : r[o] = e[o];
      }
    return r.default = e, n && n.set(e, r), r;
  }
  function* gg(e, t) {
    let n = new RegExp(`[(){}\\[\\]${hg.escape(t)}]`, "g"), r = 0, i = 0, o = false, s = 0, a = 0, u2 = t.length;
    for (let f of e.matchAll(n)) {
      let l2 = f[0] === t[s], p = s === u2 - 1, h2 = l2 && p;
      f[0] === "(" && r++, f[0] === ")" && r--, f[0] === "[" && r++, f[0] === "]" && r--, f[0] === "{" && r++, f[0] === "}" && r--, l2 && r === 0 && (a === 0 && (a = f.index), s++), h2 && r === 0 && (o = true, yield e.substring(i, a), i = a + u2), s === u2 && (s = 0, a = 0);
    }
    o ? yield e.substring(i) : yield e;
  }
});
var Kl = U((ws) => {
  "use strict";
  Object.defineProperty(ws, "__esModule", { value: true });
  function bg(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  bg(ws, { parseBoxShadowValue: () => wg, formatBoxShadowValue: () => Sg });
  var vg = Xl(), yg = /* @__PURE__ */ new Set(["inset", "inherit", "initial", "revert", "unset"]), xg = /\ +(?![^(]*\))/g, Ql = /^-?(\d+|\.\d+)(.*?)$/g;
  function wg(e) {
    return Array.from((0, vg.splitAtTopLevelOnly)(e, ",")).map((n) => {
      let r = n.trim(), i = { raw: r }, o = r.split(xg), s = /* @__PURE__ */ new Set();
      for (let a of o)
        Ql.lastIndex = 0, !s.has("KEYWORD") && yg.has(a) ? (i.keyword = a, s.add("KEYWORD")) : Ql.test(a) ? s.has("X") ? s.has("Y") ? s.has("BLUR") ? s.has("SPREAD") || (i.spread = a, s.add("SPREAD")) : (i.blur = a, s.add("BLUR")) : (i.y = a, s.add("Y")) : (i.x = a, s.add("X")) : i.color ? (i.unknown || (i.unknown = []), i.unknown.push(a)) : i.color = a;
      return i.valid = i.x !== void 0 && i.y !== void 0, i;
    });
  }
  function Sg(e) {
    return e.map((t) => t.valid ? [t.keyword, t.x, t.y, t.blur, t.spread, t.color].filter(Boolean).join(" ") : t.raw).join(", ");
  }
});
var of = U((_s) => {
  "use strict";
  Object.defineProperty(_s, "__esModule", { value: true });
  function _g(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  _g(_s, { normalize: () => Yt, url: () => ef, number: () => Eg, percentage: () => tf, length: () => rf, lineWidth: () => Ag, shadow: () => Ig, color: () => Rg, image: () => Cg, gradient: () => nf, position: () => Ng, familyName: () => Wg, genericName: () => Dg, absoluteSize: () => $g, relativeSize: () => Ug });
  var Tg = gs(), kg = Kl(), Ss = ["min", "max", "clamp", "calc"], Zl = /,(?![^(]*\))/g, yi = /_(?![^(]*\))/g;
  function Yt(e, t = true) {
    return e.includes("url(") ? e.split(/(url\(.*?\))/g).filter(Boolean).map((n) => /^url\(.*?\)$/.test(n) ? n : Yt(n, false)).join("") : (e = e.replace(/([^\\])_+/g, (n, r) => r + " ".repeat(n.length - 1)).replace(/^_/g, " ").replace(/\\_/g, "_"), t && (e = e.trim()), e = e.replace(/(calc|min|max|clamp)\(.+\)/g, (n) => n.replace(/(-?\d*\.?\d(?!\b-.+[,)](?![^+\-/*])\D)(?:%|[a-z]+)?|\))([+\-/*])/g, "$1 $2 ")), e);
  }
  function ef(e) {
    return e.startsWith("url(");
  }
  function Eg(e) {
    return !isNaN(Number(e)) || Ss.some((t) => new RegExp(`^${t}\\(.+?`).test(e));
  }
  function tf(e) {
    return e.split(yi).every((t) => /%$/g.test(t) || Ss.some((n) => new RegExp(`^${n}\\(.+?%`).test(t)));
  }
  var Og = ["cm", "mm", "Q", "in", "pc", "pt", "px", "em", "ex", "ch", "rem", "lh", "vw", "vh", "vmin", "vmax"], Jl = `(?:${Og.join("|")})`;
  function rf(e) {
    return e.split(yi).every((t) => t === "0" || new RegExp(`${Jl}$`).test(t) || Ss.some((n) => new RegExp(`^${n}\\(.+?${Jl}`).test(t)));
  }
  var Pg = /* @__PURE__ */ new Set(["thin", "medium", "thick"]);
  function Ag(e) {
    return Pg.has(e);
  }
  function Ig(e) {
    let t = (0, kg.parseBoxShadowValue)(Yt(e));
    for (let n of t)
      if (!n.valid)
        return false;
    return true;
  }
  function Rg(e) {
    let t = 0;
    return e.split(yi).every((r) => (r = Yt(r), r.startsWith("var(") ? true : (0, Tg.parseColor)(r, { loose: true }) !== null ? (t++, true) : false)) ? t > 0 : false;
  }
  function Cg(e) {
    let t = 0;
    return e.split(Zl).every((r) => (r = Yt(r), r.startsWith("var(") ? true : ef(r) || nf(r) || ["element(", "image(", "cross-fade(", "image-set("].some((i) => r.startsWith(i)) ? (t++, true) : false)) ? t > 0 : false;
  }
  var Lg = /* @__PURE__ */ new Set(["linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "conic-gradient"]);
  function nf(e) {
    e = Yt(e);
    for (let t of Lg)
      if (e.startsWith(`${t}(`))
        return true;
    return false;
  }
  var Mg = /* @__PURE__ */ new Set(["center", "top", "right", "bottom", "left"]);
  function Ng(e) {
    let t = 0;
    return e.split(yi).every((r) => (r = Yt(r), r.startsWith("var(") ? true : Mg.has(r) || rf(r) || tf(r) ? (t++, true) : false)) ? t > 0 : false;
  }
  function Wg(e) {
    let t = 0;
    return e.split(Zl).every((r) => (r = Yt(r), r.startsWith("var(") ? true : r.includes(" ") && !/(['"])([^"']+)\1/g.test(r) || /^\d/g.test(r) ? false : (t++, true))) ? t > 0 : false;
  }
  var Fg = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
  function Dg(e) {
    return Fg.has(e);
  }
  var Bg = /* @__PURE__ */ new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "x-large", "xxx-large"]);
  function $g(e) {
    return Bg.has(e);
  }
  var qg = /* @__PURE__ */ new Set(["larger", "smaller"]);
  function Ug(e) {
    return qg.has(e);
  }
});
var pf = U((Es) => {
  "use strict";
  Object.defineProperty(Es, "__esModule", { value: true });
  function Gg(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  Gg(Es, { updateAllClasses: () => Vg, asValue: () => wn, parseColorFormat: () => Ts, asColor: () => ff, asLookupValue: () => cf, coerceValue: () => Qg });
  var zg = ks(Fl()), jg = ks(Dl()), sf = vs(), Ke = of(), af = ks(lo());
  function ks(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Vg(e, t) {
    return (0, zg.default)((i) => {
      i.walkClasses((o) => {
        let s = t(o.value);
        o.value = s, o.raws && o.raws.value && (o.raws.value = (0, jg.default)(o.raws.value));
      });
    }).processSync(e);
  }
  function lf(e, t) {
    if (!xn(e))
      return;
    let n = e.slice(1, -1);
    if (t(n))
      return (0, Ke.normalize)(n);
  }
  function Hg(e, t = {}, n) {
    let r = t[e];
    if (r !== void 0)
      return (0, af.default)(r);
    if (xn(e)) {
      let i = lf(e, n);
      return i === void 0 ? void 0 : (0, af.default)(i);
    }
  }
  function wn(e, t = {}, { validate: n = () => true } = {}) {
    var r;
    let i = (r = t.values) === null || r === void 0 ? void 0 : r[e];
    return i !== void 0 ? i : t.supportsNegativeValues && e.startsWith("-") ? Hg(e.slice(1), t.values, n) : lf(e, n);
  }
  function xn(e) {
    return e.startsWith("[") && e.endsWith("]");
  }
  function Yg(e) {
    let t = e.lastIndexOf("/");
    return t === -1 || t === e.length - 1 ? [e] : [e.slice(0, t), e.slice(t + 1)];
  }
  function Ts(e) {
    if (typeof e == "string" && e.includes("<alpha-value>")) {
      let t = e;
      return ({ opacityValue: n = 1 }) => t.replace("<alpha-value>", n);
    }
    return e;
  }
  function ff(e, t = {}, { tailwindConfig: n = {} } = {}) {
    var r;
    if (((r = t.values) === null || r === void 0 ? void 0 : r[e]) !== void 0) {
      var i;
      return Ts((i = t.values) === null || i === void 0 ? void 0 : i[e]);
    }
    let [o, s] = Yg(e);
    if (s !== void 0) {
      var a, u2, f, l2;
      let p = (l2 = (a = t.values) === null || a === void 0 ? void 0 : a[o]) !== null && l2 !== void 0 ? l2 : xn(o) ? o.slice(1, -1) : void 0;
      return p === void 0 ? void 0 : (p = Ts(p), xn(s) ? (0, sf.withAlphaValue)(p, s.slice(1, -1)) : ((u2 = n.theme) === null || u2 === void 0 || (f = u2.opacity) === null || f === void 0 ? void 0 : f[s]) === void 0 ? void 0 : (0, sf.withAlphaValue)(p, n.theme.opacity[s]));
    }
    return wn(e, t, { validate: Ke.color });
  }
  function cf(e, t = {}) {
    var n;
    return (n = t.values) === null || n === void 0 ? void 0 : n[e];
  }
  function ct(e) {
    return (t, n) => wn(t, n, { validate: e });
  }
  var df = { any: wn, color: ff, url: ct(Ke.url), image: ct(Ke.image), length: ct(Ke.length), percentage: ct(Ke.percentage), position: ct(Ke.position), lookup: cf, "generic-name": ct(Ke.genericName), "family-name": ct(Ke.familyName), number: ct(Ke.number), "line-width": ct(Ke.lineWidth), "absolute-size": ct(Ke.absoluteSize), "relative-size": ct(Ke.relativeSize), shadow: ct(Ke.shadow) }, uf = Object.keys(df);
  function Xg(e, t) {
    let n = e.indexOf(t);
    return n === -1 ? [void 0, e] : [e.slice(0, n), e.slice(n + 1)];
  }
  function Qg(e, t, n, r) {
    if (xn(t)) {
      let i = t.slice(1, -1), [o, s] = Xg(i, ":");
      if (!/^[\w-_]+$/g.test(o))
        s = i;
      else if (o !== void 0 && !uf.includes(o))
        return [];
      if (s.length > 0 && uf.includes(o))
        return [wn(`[${s}]`, n), o];
    }
    for (let i of [].concat(e)) {
      let o = df[i](t, n, { tailwindConfig: r });
      if (o !== void 0)
        return [o, i];
    }
    return [];
  }
});
var hf = U((Os) => {
  "use strict";
  Object.defineProperty(Os, "__esModule", { value: true });
  Object.defineProperty(Os, "default", { enumerable: true, get: () => Kg });
  function Kg(e) {
    return typeof e == "function" ? e({}) : e;
  }
});
var yf = U((As) => {
  "use strict";
  Object.defineProperty(As, "__esModule", { value: true });
  Object.defineProperty(As, "default", { enumerable: true, get: () => bb });
  var Jg = ar(lo()), Zg = ar(wu()), eb = ar(Su()), tb = ar(po()), rb = ar(Tu()), bf = ku(), mf = Eu(), nb = Pu(), ib = ar(Au()), ob = Iu(), sb = pf(), ab = vs(), ub = ar(hf());
  function ar(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function kr(e) {
    return typeof e == "function";
  }
  function Sn(e) {
    return typeof e == "object" && e !== null;
  }
  function _n(e, ...t) {
    let n = t.pop();
    for (let r of t)
      for (let i in r) {
        let o = n(e[i], r[i]);
        o === void 0 ? Sn(e[i]) && Sn(r[i]) ? e[i] = _n(e[i], r[i], n) : e[i] = r[i] : e[i] = o;
      }
    return e;
  }
  var Ps = { colors: rb.default, negative(e) {
    return Object.keys(e).filter((t) => e[t] !== "0").reduce((t, n) => {
      let r = (0, Jg.default)(e[n]);
      return r !== void 0 && (t[`-${n}`] = r), t;
    }, {});
  }, breakpoints(e) {
    return Object.keys(e).filter((t) => typeof e[t] == "string").reduce((t, n) => ({ ...t, [`screen-${n}`]: e[n] }), {});
  } };
  function lb(e, ...t) {
    return kr(e) ? e(...t) : e;
  }
  function fb(e) {
    return e.reduce((t, { extend: n }) => _n(t, n, (r, i) => r === void 0 ? [i] : Array.isArray(r) ? [i, ...r] : [i, r]), {});
  }
  function cb(e) {
    return { ...e.reduce((t, n) => (0, bf.defaults)(t, n), {}), extend: fb(e) };
  }
  function gf(e, t) {
    if (Array.isArray(e) && Sn(e[0]))
      return e.concat(t);
    if (Array.isArray(t) && Sn(t[0]) && Sn(e))
      return [e, ...t];
    if (Array.isArray(t))
      return t;
  }
  function db({ extend: e, ...t }) {
    return _n(t, e, (n, r) => !kr(n) && !r.some(kr) ? _n({}, n, ...r, gf) : (i, o) => _n({}, ...[n, ...r].map((s) => lb(s, i, o)), gf));
  }
  function* pb(e) {
    let t = (0, mf.toPath)(e);
    if (t.length === 0 || (yield t, Array.isArray(e)))
      return;
    let n = /^(.*?)\s*\/\s*([^/]+)$/, r = e.match(n);
    if (r !== null) {
      let [, i, o] = r, s = (0, mf.toPath)(i);
      s.alpha = o, yield s;
    }
  }
  function hb(e) {
    let t = (n, r) => {
      for (let i of pb(n)) {
        let o = 0, s = e;
        for (; s != null && o < i.length; )
          s = s[i[o++]], s = kr(s) && (i.alpha === void 0 || o <= i.length - 1) ? s(t, Ps) : s;
        if (s !== void 0) {
          if (i.alpha !== void 0) {
            let a = (0, sb.parseColorFormat)(s);
            return (0, ab.withAlphaValue)(a, i.alpha, (0, ub.default)(a));
          }
          return (0, ib.default)(s) ? (0, ob.cloneDeep)(s) : s;
        }
      }
      return r;
    };
    return Object.assign(t, { theme: t, ...Ps }), Object.keys(e).reduce((n, r) => (n[r] = kr(e[r]) ? e[r](t, Ps) : e[r], n), {});
  }
  function vf(e) {
    let t = [];
    return e.forEach((n) => {
      t = [...t, n];
      var r;
      let i = (r = n == null ? void 0 : n.plugins) !== null && r !== void 0 ? r : [];
      i.length !== 0 && i.forEach((o) => {
        o.__isOptionsFunction && (o = o());
        var s;
        t = [...t, ...vf([(s = o == null ? void 0 : o.config) !== null && s !== void 0 ? s : {}])];
      });
    }), t;
  }
  function mb(e) {
    return [...e].reduceRight((n, r) => kr(r) ? r({ corePlugins: n }) : (0, eb.default)(r, n), Zg.default);
  }
  function gb(e) {
    return [...e].reduceRight((n, r) => [...n, ...r], []);
  }
  function bb(e) {
    let t = [...vf(e), { prefix: "", important: false, separator: ":", variantOrder: tb.default.variantOrder }];
    var n, r;
    return (0, nb.normalizeConfig)((0, bf.defaults)({ theme: hb(db(cb(t.map((i) => (n = i == null ? void 0 : i.theme) !== null && n !== void 0 ? n : {})))), corePlugins: mb(t.map((i) => i.corePlugins)), plugins: gb(e.map((i) => (r = i == null ? void 0 : i.plugins) !== null && r !== void 0 ? r : [])) }, ...t));
  }
});
var xf = {};
Wn(xf, { default: () => vb });
var vb;
var wf = tr(() => {
  vb = { yellow: (e) => e };
});
var kf = U((Is) => {
  "use strict";
  Object.defineProperty(Is, "__esModule", { value: true });
  function yb(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  yb(Is, { flagEnabled: () => Sb, issueFlagNotices: () => _b2, default: () => Tb });
  var xb = Tf((wf(), Fn(xf))), wb = Tf((ii(), Fn(ni)));
  function Tf(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var Sf = { optimizeUniversalDefaults: false }, Tn = { future: ["hoverOnlyWhenSupported", "respectDefaultRingColorOpacity"], experimental: ["optimizeUniversalDefaults", "matchVariant"] };
  function Sb(e, t) {
    if (Tn.future.includes(t)) {
      var n, r, i;
      return e.future === "all" || ((i = (r = e == null || (n = e.future) === null || n === void 0 ? void 0 : n[t]) !== null && r !== void 0 ? r : Sf[t]) !== null && i !== void 0 ? i : false);
    }
    if (Tn.experimental.includes(t)) {
      var o, s, a;
      return e.experimental === "all" || ((a = (s = e == null || (o = e.experimental) === null || o === void 0 ? void 0 : o[t]) !== null && s !== void 0 ? s : Sf[t]) !== null && a !== void 0 ? a : false);
    }
    return false;
  }
  function _f(e) {
    if (e.experimental === "all")
      return Tn.experimental;
    var t;
    return Object.keys((t = e == null ? void 0 : e.experimental) !== null && t !== void 0 ? t : {}).filter((n) => Tn.experimental.includes(n) && e.experimental[n]);
  }
  function _b2(e) {
    if (process.env.JEST_WORKER_ID === void 0 && _f(e).length > 0) {
      let t = _f(e).map((n) => xb.default.yellow(n)).join(", ");
      wb.default.warn("experimental-flags-enabled", [`You have enabled experimental features: ${t}`, "Experimental features in Tailwind CSS are not covered by semver, may introduce breaking changes, and can change at any time."]);
    }
  }
  var Tb = Tn;
});
var Of = U((Rs) => {
  "use strict";
  Object.defineProperty(Rs, "__esModule", { value: true });
  Object.defineProperty(Rs, "default", { enumerable: true, get: () => Ef });
  var kb = Ob(po()), Eb = kf();
  function Ob(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ef(e) {
    var t;
    let n = ((t = e == null ? void 0 : e.presets) !== null && t !== void 0 ? t : [kb.default]).slice().reverse().flatMap((o) => Ef(typeof o == "function" ? o() : o)), r = { respectDefaultRingColorOpacity: { theme: { ringColor: { DEFAULT: "#3b82f67f" } } } }, i = Object.keys(r).filter((o) => (0, Eb.flagEnabled)(e, o)).map((o) => r[o]);
    return [e, ...i, ...n];
  }
});
var Af = U((Cs) => {
  "use strict";
  Object.defineProperty(Cs, "__esModule", { value: true });
  Object.defineProperty(Cs, "default", { enumerable: true, get: () => Ib });
  var Pb = Pf(yf()), Ab = Pf(Of());
  function Pf(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ib(...e) {
    let [, ...t] = (0, Ab.default)(e[0]);
    return (0, Pb.default)([...e, ...t]);
  }
});
var Rf = U((S1, If) => {
  var Ls = Af();
  If.exports = (Ls.__esModule ? Ls : { default: Ls }).default;
});
var Lr = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var mc = Lr((e, t) => {
  t.exports = ["em", "ex", "ch", "rem", "vh", "vw", "vmin", "vmax", "px", "mm", "cm", "in", "pt", "pc", "mozmm"];
});
var gc = Lr((e, t) => {
  t.exports = ["deg", "grad", "rad", "turn"];
});
var bc = Lr((e, t) => {
  t.exports = ["dpi", "dpcm", "dppx"];
});
var vc = Lr((e, t) => {
  t.exports = ["Hz", "kHz"];
});
var yc = Lr((e, t) => {
  t.exports = ["s", "ms"];
});
var xc = mc();
var ia = gc();
var oa = bc();
var sa = vc();
var aa = yc();
function ki(e) {
  if (/\.\D?$/.test(e))
    throw new Error("The dot should be followed by a number");
  if (/^[+-]{2}/.test(e))
    throw new Error("Only one leading +/- is allowed");
  if (wc(e) > 1)
    throw new Error("Only one dot is allowed");
  if (/%$/.test(e)) {
    this.type = "percentage", this.value = Ti(e), this.unit = "%";
    return;
  }
  var t = _c(e);
  if (!t) {
    this.type = "number", this.value = Ti(e);
    return;
  }
  this.type = kc(t), this.value = Ti(e.substr(0, e.length - t.length)), this.unit = t;
}
ki.prototype.valueOf = function() {
  return this.value;
};
ki.prototype.toString = function() {
  return this.value + (this.unit || "");
};
function xt(e) {
  return new ki(e);
}
function wc(e) {
  var t = e.match(/\./g);
  return t ? t.length : 0;
}
function Ti(e) {
  var t = parseFloat(e);
  if (isNaN(t))
    throw new Error("Invalid number: " + e);
  return t;
}
var Sc = [].concat(ia, sa, xc, oa, aa);
function _c(e) {
  var t = e.match(/\D+$/), n = t && t[0];
  if (n && Sc.indexOf(n) === -1)
    throw new Error("Invalid unit: " + n);
  return n;
}
var Tc = Object.assign(Dn(ia, "angle"), Dn(sa, "frequency"), Dn(oa, "resolution"), Dn(aa, "time"));
function Dn(e, t) {
  return Object.fromEntries(e.map((n) => [n, t]));
}
function kc(e) {
  return Tc[e] || "length";
}
function mr(e) {
  let t = typeof e;
  return !(t === "number" || t === "bigint" || t === "string" || t === "boolean");
}
function ua(e) {
  return /^class\s/.test(e.toString());
}
function Pi(e) {
  return e && e.$$typeof === Symbol.for("react.forward_ref");
}
function la(e) {
  return typeof e == "function" || Pi(e);
}
function fa(e) {
  return "dangerouslySetInnerHTML" in e;
}
function ca(e) {
  let t = typeof e > "u" ? [] : [].concat(e).flat(1 / 0), n = [];
  for (let r = 0; r < t.length; r++) {
    let i = t[r];
    typeof i > "u" || typeof i == "boolean" || i === null || (typeof i == "number" && (i = String(i)), typeof i == "string" && n.length && typeof n[n.length - 1] == "string" ? n[n.length - 1] += i : n.push(i));
  }
  return n;
}
function X(e, t, n, r, i = false) {
  if (typeof e == "number")
    return e;
  try {
    if (e = e.trim(), /[ /\(,]/.test(e))
      return;
    if (e === String(+e))
      return +e;
    let o = new xt(e);
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
    else {
      if (o.type === "angle")
        return Ai(e);
      if (o.type === "percentage" && i)
        return o.value / 100 * n;
    }
  } catch {
  }
}
function Ai(e) {
  let t = new xt(e);
  switch (t.unit) {
    case "deg":
      return t.value;
    case "rad":
      return t.value * 180 / Math.PI;
    case "turn":
      return t.value * 360;
    case "grad":
      return 0.9 * t.value;
  }
}
function Mr(e, t) {
  return [e[0] * t[0] + e[2] * t[1], e[1] * t[0] + e[3] * t[1], e[0] * t[2] + e[2] * t[3], e[1] * t[2] + e[3] * t[3], e[0] * t[4] + e[2] * t[5] + e[4], e[1] * t[4] + e[3] * t[5] + e[5]];
}
function He(e, t, n, r) {
  let i = t[e];
  if (typeof i > "u") {
    if (r && typeof e < "u")
      throw new Error(`Invalid value for CSS property "${r}". Allowed values: ${Object.keys(t).map((o) => `"${o}"`).join(" | ")}. Received: "${e}".`);
    i = n;
  }
  return i;
}
var Ei;
var Oi;
var da = [32, 160, 4961, 65792, 65793, 4153, 4241, 10].map((e) => String.fromCodePoint(e));
var hr = /* @__PURE__ */ new Map();
var Oc = 500;
function Ve(e, t, n) {
  let r = `${t}:${n || ""}:${e}`;
  if (hr.has(r))
    return hr.get(r);
  if (!Ei || !Oi) {
    if (!(typeof Intl < "u" && "Segmenter" in Intl))
      throw new Error("Intl.Segmenter does not exist, please use import a polyfill.");
    Ei = new Intl.Segmenter(n, { granularity: "word" }), Oi = new Intl.Segmenter(n, { granularity: "grapheme" });
  }
  let i;
  if (t === "grapheme")
    i = [...Oi.segment(e)].map((o) => o.segment);
  else {
    let o = [...Ei.segment(e)].map((u2) => u2.segment), s = [], a = 0;
    for (; a < o.length; ) {
      let u2 = o[a];
      if (u2 == "\xA0") {
        let f = a === 0 ? "" : s.pop(), l2 = a === o.length - 1 ? "" : o[a + 1];
        s.push(f + "\xA0" + l2), a += 2;
      } else
        s.push(u2), a++;
    }
    i = s;
  }
  if (hr.size >= Oc) {
    let o = hr.keys().next().value;
    hr.delete(o);
  }
  return hr.set(r, i), i;
}
function M(e, t, n) {
  let r = "";
  for (let [i, o] of Object.entries(t))
    typeof o < "u" && (r += ` ${i}="${o}"`);
  return n ? `<${e}${r}>${n}</${e}>` : `<${e}${r}/>`;
}
function pa(e = 20) {
  let t = /* @__PURE__ */ new Map();
  function n(o) {
    let s = t.get(o);
    if (s !== void 0)
      return t.delete(o), t.set(o, s), s;
  }
  function r(o, s) {
    if (t.has(o))
      t.delete(o);
    else if (t.size >= e) {
      let a = t.keys().next().value;
      t.delete(a);
    }
    t.set(o, s);
  }
  function i() {
    t.clear();
  }
  return { set: r, get: n, clear: i };
}
function gr(e) {
  return e ? e.split(/[, ]/).filter(Boolean).map(Number) : null;
}
function Bn(e) {
  return typeof e == "string";
}
function ha(e) {
  return typeof e == "number";
}
function ma(e) {
  return typeof e > "u";
}
function Mt(e, t) {
  if (typeof e == "number")
    return e;
  if (e.endsWith("%")) {
    let n = parseFloat(e.slice(0, -1));
    if (isNaN(n)) {
      console.warn(`Invalid value "${e}"${typeof t == "string" ? ` for "${t}"` : ""}. Expected a percentage value (e.g., "50%").`);
      return;
    }
    return `${n}%`;
  }
  console.warn(`Invalid value "${e}"${typeof t == "string" ? ` for "${t}"` : ""}. Expected a number or a percentage value (e.g., "50%").`);
}
function Ut(e, t) {
  if (typeof e == "number")
    return e;
  if (e === "auto")
    return "auto";
  if (e.endsWith("%")) {
    let n = parseFloat(e.slice(0, -1));
    if (isNaN(n)) {
      console.warn(`Invalid value "${e}"${typeof t == "string" ? ` for "${t}"` : ""}. Expected a percentage value (e.g., "50%").`);
      return;
    }
    return `${n}%`;
  }
  console.warn(`Invalid value "${e}"${typeof t == "string" ? ` for "${t}"` : ""}. Expected a number, "auto", or a percentage value (e.g., "50%").`);
}
function ga(e, t) {
  if (t === "break-all")
    return { words: Ve(e, "grapheme"), requiredBreaks: [] };
  if (t === "keep-all")
    return { words: Ve(e, "word"), requiredBreaks: [] };
  let n = new $557adaaeb0c7885f$exports(e), r = 0, i = n.nextBreak(), o = [], s = [false];
  for (; i; ) {
    let a = e.slice(r, i.position);
    o.push(a), i.required ? s.push(true) : s.push(false), r = i.position, i = n.nextBreak();
  }
  return { words: o, requiredBreaks: s };
}
var ba = (e) => e.replaceAll(/([A-Z])/g, (t, n) => `-${n.toLowerCase()}`);
function $n(e, t = ",") {
  let n = [], r = 0, i = 0;
  t = new RegExp(t);
  for (let o = 0; o < e.length; o++)
    e[o] === "(" ? i++ : e[o] === ")" && i--, i === 0 && t.test(e[o]) && (n.push(e.slice(r, o).trim()), r = o + 1);
  return n.push(e.slice(r).trim()), n;
}
function Wc(e) {
  return Promise.resolve().then(() => (Bi(), Di)).then((t) => t.init(e));
}
function Gt() {
  return Promise.resolve().then(() => (Bi(), Di)).then((e) => e.getYoga());
}
var Fc = "image/avif";
var Dc = "image/webp";
var Gn = "image/apng";
var zn = "image/png";
var jn = "image/jpeg";
var Vn = "image/gif";
var $i = "image/svg+xml";
function Ra(e) {
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
function Ca(e) {
  let t = new Uint8Array(e.slice(6, 10));
  return [t[0] | t[1] << 8, t[2] | t[3] << 8];
}
function La(e) {
  let t = new DataView(e);
  return [t.getUint16(18, false), t.getUint16(22, false)];
}
var Ot = pa(500);
var Wr = /* @__PURE__ */ new Map();
var Bc = [zn, Gn, jn, Vn, $i];
var $c = /<svg[^>]*>/i;
var qc = /viewBox=['"]([^'"]+)['"]/;
var Uc = /width=['"](\d*\.?\d+)['"]/;
var Gc = /height=['"](\d*\.?\d+)['"]/;
function zc(e) {
  let t = new Uint8Array(e), n = 32768, r = "";
  for (let i = 0; i < t.length; i += n) {
    let o = t.subarray(i, Math.min(i + n, t.length));
    r += String.fromCharCode(...o);
  }
  return btoa(r);
}
function jc(e) {
  let t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    r[i] = t.charCodeAt(i);
  return r.buffer;
}
function Aa(e, t) {
  let n = t.match($c);
  if (!n)
    throw new Error(`Failed to parse SVG from ${e}`);
  let r = n[0], i = qc.exec(r), o = Uc.exec(r), s = Gc.exec(r), a = i ? gr(i[1]) : null;
  if (!a && (!o || !s))
    throw new Error(`Failed to parse SVG from ${e}: missing "viewBox"`);
  let u2 = a ? [a[2], a[3]] : [+o[1], +s[1]], f = u2[0] / u2[1];
  return o && s ? [+o[1], +s[1]] : o ? [+o[1], +o[1] / f] : s ? [+s[1] * f, +s[1]] : [u2[0], u2[1]];
}
function Ia(e) {
  let t, n = Vc(new Uint8Array(e));
  switch (n) {
    case zn:
    case Gn:
      t = La(e);
      break;
    case Vn:
      t = Ca(e);
      break;
    case jn:
      t = Ra(e);
      break;
  }
  if (!Bc.includes(n))
    throw new Error(`Unsupported image type: ${n || "unknown"}`);
  return [`data:${n};base64,${zc(e)}`, t];
}
async function xr(e) {
  if (!e)
    throw new Error("Image source is not provided.");
  if (typeof e == "object") {
    let [i, o] = Ia(e);
    return [i, ...o];
  }
  if ((e.startsWith('"') && e.endsWith('"') || e.startsWith("'") && e.endsWith("'")) && (e = e.slice(1, -1)), typeof window > "u" && !e.startsWith("http") && !e.startsWith("data:"))
    throw new Error(`Image source must be an absolute URL: ${e}`);
  if (e.startsWith("data:")) {
    let i;
    try {
      i = /data:(?<imageType>[a-z/+]+)(;[^;=]+=[^;=]+)*?(;(?<encodingType>[^;,]+))?,(?<dataString>.*)/g.exec(e).groups;
    } catch {
      return console.warn("Image data URI resolved without size:" + e), [e];
    }
    let { imageType: o, encodingType: s, dataString: a } = i;
    if (o === $i) {
      let u2 = s === "base64" ? atob(a) : decodeURIComponent(a.replace(/ /g, "%20")), f = s === "base64" ? e : `data:image/svg+xml;base64,${btoa(u2)}`, l2 = Aa(e, u2);
      return Ot.set(e, [f, ...l2]), [f, ...l2];
    } else if (s === "base64") {
      let u2, f = jc(a);
      switch (o) {
        case zn:
        case Gn:
          u2 = La(f);
          break;
        case Vn:
          u2 = Ca(f);
          break;
        case jn:
          u2 = Ra(f);
          break;
      }
      return Ot.set(e, [e, ...u2]), [e, ...u2];
    } else
      return console.warn("Image data URI resolved without size:" + e), Ot.set(e, [e]), [e];
  }
  if (!globalThis.fetch)
    throw new Error("`fetch` is required to be polyfilled to load images.");
  if (Wr.has(e))
    return Wr.get(e);
  let t = Ot.get(e);
  if (t)
    return t;
  let n = e, r = fetch(n).then((i) => {
    let o = i.headers.get("content-type");
    return o === "image/svg+xml" || o === "application/svg+xml" ? i.text() : i.arrayBuffer();
  }).then((i) => {
    if (typeof i == "string")
      try {
        let a = `data:image/svg+xml;base64,${btoa(i)}`, u2 = Aa(n, i);
        return [a, ...u2];
      } catch (a) {
        throw new Error(`Failed to parse SVG image: ${a.message}`);
      }
    let [o, s] = Ia(i);
    return [o, ...s];
  }).then((i) => (Ot.set(n, i), i)).catch((i) => (console.error(`Can't load image ${n}: ` + i.message), Ot.set(n, []), []));
  return Wr.set(n, r), r;
}
function Vc(e) {
  return [255, 216, 255].every((t, n) => e[n] === t) ? jn : [137, 80, 78, 71, 13, 10, 26, 10].every((t, n) => e[n] === t) ? Hc(e) ? Gn : zn : [71, 73, 70, 56].every((t, n) => e[n] === t) ? Vn : [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80].every((t, n) => !t || e[n] === t) ? Dc : [60, 63, 120, 109, 108].every((t, n) => e[n] === t) ? $i : [0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102].every((t, n) => !t || e[n] === t) ? Fc : null;
}
function Hc(e) {
  let t = new DataView(e.buffer), n, r, i = 8, o = false;
  for (; !o && n !== "IEND" && i < e.length; ) {
    r = t.getUint32(i);
    let s = e.subarray(i + 4, i + 8);
    n = String.fromCharCode(...s), o = n === "acTL", i += 12 + r;
  }
  return o;
}
var qi = { accentHeight: "accent-height", alignmentBaseline: "alignment-baseline", arabicForm: "arabic-form", baselineShift: "baseline-shift", capHeight: "cap-height", clipPath: "clip-path", clipRule: "clip-rule", colorInterpolation: "color-interpolation", colorInterpolationFilters: "color-interpolation-filters", colorProfile: "color-profile", colorRendering: "color-rendering", dominantBaseline: "dominant-baseline", enableBackground: "enable-background", fillOpacity: "fill-opacity", fillRule: "fill-rule", floodColor: "flood-color", floodOpacity: "flood-opacity", fontFamily: "font-family", fontSize: "font-size", fontSizeAdjust: "font-size-adjust", fontStretch: "font-stretch", fontStyle: "font-style", fontVariant: "font-variant", fontWeight: "font-weight", glyphName: "glyph-name", glyphOrientationHorizontal: "glyph-orientation-horizontal", glyphOrientationVertical: "glyph-orientation-vertical", horizAdvX: "horiz-adv-x", horizOriginX: "horiz-origin-x", href: "href", imageRendering: "image-rendering", letterSpacing: "letter-spacing", lightingColor: "lighting-color", markerEnd: "marker-end", markerMid: "marker-mid", markerStart: "marker-start", overlinePosition: "overline-position", overlineThickness: "overline-thickness", paintOrder: "paint-order", panose1: "panose-1", pointerEvents: "pointer-events", renderingIntent: "rendering-intent", shapeRendering: "shape-rendering", stopColor: "stop-color", stopOpacity: "stop-opacity", strikethroughPosition: "strikethrough-position", strikethroughThickness: "strikethrough-thickness", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width", textAnchor: "text-anchor", textDecoration: "text-decoration", textRendering: "text-rendering", underlinePosition: "underline-position", underlineThickness: "underline-thickness", unicodeBidi: "unicode-bidi", unicodeRange: "unicode-range", unitsPerEm: "units-per-em", vAlphabetic: "v-alphabetic", vHanging: "v-hanging", vIdeographic: "v-ideographic", vMathematical: "v-mathematical", vectorEffect: "vector-effect", vertAdvY: "vert-adv-y", vertOriginX: "vert-origin-x", vertOriginY: "vert-origin-y", wordSpacing: "word-spacing", writingMode: "writing-mode", xHeight: "x-height", xlinkActuate: "xlink:actuate", xlinkArcrole: "xlink:arcrole", xlinkHref: "xlink:href", xlinkRole: "xlink:role", xlinkShow: "xlink:show", xlinkTitle: "xlink:title", xlinkType: "xlink:type", xmlBase: "xml:base", xmlLang: "xml:lang", xmlSpace: "xml:space", xmlnsXlink: "xmlns:xlink" };
var Yc = /[\r\n%#()<>?[\\\]^`{|}"']/g;
function Ui(e, t) {
  if (!e)
    return "";
  if (Array.isArray(e))
    return e.map((f) => Ui(f, t)).join("");
  if (typeof e != "object")
    return String(e);
  let n = e.type;
  if (n === "text")
    throw new Error("<text> nodes are not currently supported, please convert them to <path>");
  let { children: r, style: i, ...o } = e.props || {}, s = (i == null ? void 0 : i.color) || t, a = `${Object.entries(o).map(([f, l2]) => (typeof l2 == "string" && l2.toLowerCase() === "currentcolor" && (l2 = s), (f === "href" || f === "xlinkHref") && n === "image" ? ` ${qi[f] || f}="${Ot.get(l2)[0]}"` : ` ${qi[f] || f}="${l2}"`)).join("")}`, u2 = i ? ` style="${Object.entries(i).map(([f, l2]) => `${ba(f)}:${l2}`).join(";")}"` : "";
  return `<${n}${a}${u2}>${Ui(r, s)}</${n}>`;
}
async function Ma(e) {
  let t = /* @__PURE__ */ new Set(), n = (r) => {
    if (r && mr(r)) {
      if (Array.isArray(r)) {
        r.forEach((i) => n(i));
        return;
      } else if (typeof r == "object")
        if (r.type === "image") {
          let i = r.props.href || r.props.xlinkHref;
          i && (t.has(i) || t.add(i));
        } else
          r.type === "img" && (t.has(r.props.src) || t.add(r.props.src));
      Array.isArray(r.props.children) ? r.props.children.map((i) => n(i)) : n(r.props.children);
    }
  };
  return n(e), Promise.all(Array.from(t).map((r) => xr(r)));
}
async function Na(e, t) {
  let { viewBox: n, viewbox: r, width: i, height: o, className: s, style: a, children: u2, ...f } = e.props || {};
  n ||= r, f.xmlns = "http://www.w3.org/2000/svg";
  let l2 = (a == null ? void 0 : a.color) || t, p = gr(n), h2 = p ? p[3] / p[2] : null;
  return i = i || h2 && o ? o / h2 : null, o = o || h2 && i ? i * h2 : null, f.width = i, f.height = o, n && (f.viewBox = n), `data:image/svg+xml;utf8,${`<svg ${Object.entries(f).map(([m2, b]) => (typeof b == "string" && b.toLowerCase() === "currentcolor" && (b = l2), ` ${qi[m2] || m2}="${b}"`)).join("")}>${Ui(u2, l2)}</svg>`.replace(Yc, encodeURIComponent)}`;
}
var at = "flex";
var Wa = { p: { display: at, marginTop: "1em", marginBottom: "1em" }, div: { display: at }, blockquote: { display: at, marginTop: "1em", marginBottom: "1em", marginLeft: 40, marginRight: 40 }, center: { display: at, textAlign: "center" }, hr: { display: at, marginTop: "0.5em", marginBottom: "0.5em", marginLeft: "auto", marginRight: "auto", borderWidth: 1, borderStyle: "solid" }, h1: { display: at, fontSize: "2em", marginTop: "0.67em", marginBottom: "0.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h2: { display: at, fontSize: "1.5em", marginTop: "0.83em", marginBottom: "0.83em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h3: { display: at, fontSize: "1.17em", marginTop: "1em", marginBottom: "1em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h4: { display: at, marginTop: "1.33em", marginBottom: "1.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h5: { display: at, fontSize: "0.83em", marginTop: "1.67em", marginBottom: "1.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h6: { display: at, fontSize: "0.67em", marginTop: "2.33em", marginBottom: "2.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, u: { textDecoration: "underline" }, strong: { fontWeight: "bold" }, b: { fontWeight: "bold" }, i: { fontStyle: "italic" }, em: { fontStyle: "italic" }, code: { fontFamily: "monospace" }, kbd: { fontFamily: "monospace" }, pre: { display: at, fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", marginBottom: "1em" }, mark: { backgroundColor: "yellow", color: "black" }, big: { fontSize: "larger" }, small: { fontSize: "smaller" }, s: { textDecoration: "line-through" } };
var Xc = /* @__PURE__ */ new Set(["color", "font", "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textIndent", "textTransform", "textShadowOffset", "textShadowColor", "textShadowRadius", "WebkitTextStrokeWidth", "WebkitTextStrokeColor", "textDecorationLine", "textDecorationStyle", "textDecorationColor", "textDecorationSkipInk", "whiteSpace", "transform", "wordBreak", "tabSize", "opacity", "filter", "_viewportWidth", "_viewportHeight", "_inheritedClipPathId", "_inheritedMaskId", "_inheritedBackgroundClipTextPath", "_inheritedBackgroundClipTextHasBackground"]);
function Gi(e) {
  let t = {};
  for (let n in e)
    (Xc.has(n) || n.startsWith("--")) && (t[n] = e[n]);
  return t;
}
function Kc(e, t) {
  try {
    let n = new xt(e);
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
function zi(e, t, n) {
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
      let r = Kc(e, t);
      return r.absolute ? { [n ? "xAbsolute" : "yAbsolute"]: r.absolute } : r.relative ? { [n ? "xRelative" : "yRelative"]: r.relative } : {};
    }
  }
}
function ji(e, t) {
  if (typeof e == "number")
    return { xAbsolute: e };
  let n;
  try {
    n = (0, import_postcss_value_parser.default)(e).nodes.filter((r) => r.type === "word").map((r) => r.value);
  } catch {
    return {};
  }
  return n.length === 1 ? zi(n[0], t, true) : n.length === 2 ? ((n[0] === "top" || n[0] === "bottom" || n[1] === "left" || n[1] === "right") && n.reverse(), { ...zi(n[0], t, true), ...zi(n[1], t, false) }) : {};
}
function Fr(e, t) {
  let n = (0, import_css_to_react_native2.getPropertyName)(`mask-${t}`);
  return e[n] || e[`WebkitM${n.substring(1)}`];
}
function Fa(e) {
  let t = e.maskImage || e.WebkitMaskImage, n = { position: Fr(e, "position") || "0% 0%", size: Fr(e, "size") || "100% 100%", repeat: Fr(e, "repeat") || "repeat", origin: Fr(e, "origin") || "border-box", clip: Fr(e, "origin") || "border-box" };
  return $n(t).filter((i) => i && i !== "none").reverse().map((i) => ({ image: i, ...n }));
}
function Ba(e) {
  let t = {}, n = {};
  for (let r in e)
    r.startsWith("--") ? t[r] = String(e[r]) : n[r] = e[r];
  return { variables: t, remainingStyle: n };
}
function $a(e, t) {
  return { ...e, ...t };
}
function Br(e, t, n = /* @__PURE__ */ new Set()) {
  if (typeof e != "string" || !e.includes("var("))
    return e;
  try {
    let r = (0, import_postcss_value_parser2.default)(e), i = false;
    if (r.walk((o) => {
      if (o.type === "function" && o.value === "var") {
        i = true;
        let s = Zc(o);
        if (!s)
          return;
        let { varName: a, fallback: u2 } = s;
        if (n.has(a)) {
          console.warn(`Circular reference detected for CSS variable: ${a}`), u2 !== void 0 ? Dr(o, u2) : Dr(o, "initial");
          return;
        }
        let f = t[a];
        if (f !== void 0) {
          let l2 = new Set(n);
          l2.add(a);
          let p = Br(f, t, l2);
          Dr(o, String(p));
        } else if (u2 !== void 0) {
          let l2 = Br(u2, t, n);
          Dr(o, String(l2));
        } else
          Dr(o, "initial");
      }
    }), i)
      return r.toString();
  } catch {
    console.warn(`Failed to parse CSS value for variable resolution: ${e}`);
  }
  return e;
}
function Zc(e) {
  if (!e.nodes || e.nodes.length === 0)
    return null;
  let t, n = -1;
  for (let i = 0; i < e.nodes.length; i++) {
    let o = e.nodes[i];
    if (o.type === "word" && !t)
      t = o;
    else if (o.type === "div" && o.value === ",") {
      n = i;
      break;
    }
  }
  if (!t || t.type !== "word")
    return null;
  let r = t.value.trim();
  if (n !== -1 && n < e.nodes.length - 1) {
    let i = e.nodes.slice(n + 1), o = import_postcss_value_parser2.default.stringify(i).trim();
    return { varName: r, fallback: o };
  }
  return { varName: r };
}
function Dr(e, t) {
  e.type = "word", e.value = t, delete e.nodes;
}
var id = /* @__PURE__ */ new Set(["flex", "flexGrow", "flexShrink", "flexBasis", "fontWeight", "lineHeight", "opacity", "scale", "scaleX", "scaleY"]);
var od = /* @__PURE__ */ new Set(["lineHeight"]);
function sd(e, t, n, r) {
  return e === "textDecoration" && !n.includes(t.textDecorationColor) && (t.textDecorationColor = r), t;
}
function rr(e, t) {
  let n = Number(t);
  return isNaN(n) ? t : id.has(e) ? od.has(e) ? n : String(t) : n + "px";
}
function ad(e, t, n) {
  if (e === "zIndex")
    return console.warn("`z-index` is currently not supported."), { [e]: t };
  if (e === "lineHeight")
    return { lineHeight: rr(e, t) };
  if (e === "fontFamily")
    return { fontFamily: t.split(",").map((r) => r.trim().replace(/(^['"])|(['"]$)/g, "").toLocaleLowerCase()) };
  if (e === "borderRadius") {
    if (typeof t != "string" || !t.includes("/"))
      return;
    let [r, i] = t.split("/"), o = (0, import_css_to_react_native.getStylesForProperty)(e, r, true), s = (0, import_css_to_react_native.getStylesForProperty)(e, i, true);
    for (let a in o)
      s[a] = rr(e, o[a]) + " " + rr(e, s[a]);
    return s;
  }
  if (/^border(Top|Right|Bottom|Left)?$/.test(e)) {
    let r = (0, import_css_to_react_native.getStylesForProperty)("border", t, true);
    r.borderWidth === 1 && !String(t).includes("1px") && (r.borderWidth = 3), r.borderColor === "black" && !String(t).includes("black") && (r.borderColor = n);
    let i = { Width: rr(e + "Width", r.borderWidth), Style: He(r.borderStyle, { solid: "solid", dashed: "dashed" }, "solid", e + "Style"), Color: r.borderColor }, o = {};
    for (let s of e === "border" ? ["Top", "Right", "Bottom", "Left"] : [e.slice(6)])
      for (let a in i)
        o["border" + s + a] = i[a];
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
    let r = {}, i = t.replace(/(-?[\d.]+%)/g, (s, a) => {
      let u2 = ~~(Math.random() * 1e9);
      return r[u2] = a, u2 + "px";
    }), o = (0, import_css_to_react_native.getStylesForProperty)("transform", i, true);
    for (let s of o.transform)
      for (let a in s)
        r[s[a]] && (s[a] = r[s[a]]);
    return o;
  }
  if (e === "background")
    return t = t.toString().trim(), /^(linear-gradient|radial-gradient|url|repeating-linear-gradient|repeating-radial-gradient)\(/.test(t) ? (0, import_css_to_react_native.getStylesForProperty)("backgroundImage", t, true) : (0, import_css_to_react_native.getStylesForProperty)("background", t, true);
  if (e === "textShadow") {
    t = t.toString().trim();
    let r = {}, i = $n(t);
    for (let o of i) {
      let s = (0, import_css_to_react_native.getStylesForProperty)("textShadow", o, true);
      for (let a in s)
        r[a] ? r[a].push(s[a]) : r[a] = [s[a]];
    }
    return r;
  }
  if (e === "WebkitTextStroke") {
    t = t.toString().trim();
    let r = t.split(" ");
    if (r.length !== 2)
      throw new Error("Invalid `WebkitTextStroke` value.");
    return { WebkitTextStrokeWidth: rr(e, r[0]), WebkitTextStrokeColor: rr(e, r[1]) };
  }
  if (e === "textDecorationSkipInk") {
    let r = t.toString().trim().toLowerCase();
    if (!["auto", "none", "all"].includes(r))
      throw new Error("Invalid `textDecorationSkipInk` value.");
    return { textDecorationSkipInk: r };
  }
}
function qa(e) {
  return e === "transform" ? " Only absolute lengths such as `10px` are supported." : "";
}
var Ua = /rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\.\d]+)\)/;
function za(e) {
  if (typeof e == "string" && Ua.test(e.trim()))
    return e.trim().replace(Ua, (t, n, r, i, o) => `rgba(${n}, ${r}, ${i}, ${o})`);
  if (typeof e == "object" && e !== null) {
    for (let t in e)
      e[t] = za(e[t]);
    return e;
  }
  return e;
}
function Hn(e, t) {
  let n = {}, r = {};
  for (let u2 in t)
    u2.startsWith("--") && (r[u2] = String(t[u2]));
  let i = {}, o = e;
  if (e) {
    let { variables: u2, remainingStyle: f } = Ba(e);
    i = u2, o = f;
  }
  let s = $a(r, i);
  for (let u2 in s)
    n[u2] = s[u2];
  if (o) {
    let u2 = o.color ? Br(o.color, s) : void 0, f = ld(u2, t.color);
    n.color = f;
    for (let l2 in o) {
      if (l2.startsWith("_")) {
        n[l2] = o[l2];
        continue;
      }
      if (l2 === "color")
        continue;
      let p = (0, import_css_to_react_native.getPropertyName)(l2), h2 = Br(o[l2], s), m2 = cd(h2, f);
      try {
        let b = ad(p, m2, f) || sd(p, (0, import_css_to_react_native.getStylesForProperty)(p, rr(p, m2), true), m2, f);
        Object.assign(n, b);
      } catch (b) {
        throw new Error(b.message + (b.message.includes(m2) ? `
  ` + qa(p) : `
  in CSS rule \`${p}: ${m2}\`.${qa(p)}`));
      }
    }
  }
  if (n.backgroundImage) {
    let { backgrounds: u2 } = (0, import_css_background_parser.parseElementStyle)(n);
    n.backgroundImage = u2;
  }
  (n.maskImage || n.WebkitMaskImage) && (n.maskImage = Fa(n));
  let a = ud(n.fontSize, t.fontSize);
  typeof n.fontSize < "u" && (n.fontSize = a), n.transformOrigin && (n.transformOrigin = ji(n.transformOrigin, a));
  for (let u2 in n) {
    let f = n[u2];
    if (u2 === "lineHeight")
      typeof f == "string" && f !== "normal" && (f = n[u2] = X(f, a, a, t, true) / a);
    else {
      if (typeof f == "string") {
        let l2 = X(f, a, a, t);
        typeof l2 < "u" && (n[u2] = l2), f = n[u2];
      }
      if (typeof f == "string" || typeof f == "object") {
        let l2 = za(f);
        l2 && (n[u2] = l2), f = n[u2];
      }
    }
    if (u2 === "opacity" && typeof f == "number" && (n.opacity = f * t.opacity), u2 === "transform") {
      let l2 = f;
      for (let p of l2) {
        let h2 = Object.keys(p)[0], m2 = p[h2], b = typeof m2 == "string" ? X(m2, a, a, t) ?? m2 : m2;
        p[h2] = b;
      }
    }
    if (u2 === "textShadowRadius") {
      let l2 = f;
      n.textShadowRadius = l2.map((p) => X(p, a, 0, t, false));
    }
    if (u2 === "textShadowOffset") {
      let l2 = f;
      n.textShadowOffset = l2.map(({ height: p, width: h2 }) => ({ height: X(p, a, 0, t, false), width: X(h2, a, 0, t, false) }));
    }
  }
  return n;
}
function ud(e, t) {
  if (typeof e == "number")
    return e;
  try {
    let n = new xt(e);
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
function Ga(e) {
  if (e.startsWith("hsl")) {
    let t = index_esm_default(e), [n, r, i] = t.values;
    return `hsl(${[n, `${r}%`, `${i}%`].concat(t.alpha === 1 ? [] : [t.alpha]).join(",")})`;
  }
  return e;
}
function ld(e, t) {
  return e && e.toLowerCase() !== "currentcolor" ? Ga(e) : Ga(t);
}
function fd2(e, t) {
  return e.replace(/currentcolor/gi, t);
}
function cd(e, t) {
  return Bn(e) && (e = fd2(e, t)), e;
}
async function Vi(e, t, n, r, i) {
  let o = await Gt(), s = Object.assign({}, n, Hn(Wa[t], n), Hn(r, n));
  if (t === "img") {
    let [a, u2, f] = await xr(i.src);
    if (u2 === void 0 && f === void 0) {
      if (i.width === void 0 || i.height === void 0)
        throw new Error("Image size cannot be determined. Please provide the width and height of the image.");
      u2 = parseInt(i.width), f = parseInt(i.height);
    }
    let l2 = f / u2, p = (s.borderLeftWidth || 0) + (s.borderRightWidth || 0) + (s.paddingLeft || 0) + (s.paddingRight || 0), h2 = (s.borderTopWidth || 0) + (s.borderBottomWidth || 0) + (s.paddingTop || 0) + (s.paddingBottom || 0), m2 = s.width || i.width, b = s.height || i.height, y = typeof m2 == "number" && typeof b == "number";
    y && (m2 -= p, b -= h2), m2 === void 0 && b === void 0 ? (m2 = "100%", e.setAspectRatio(1 / l2)) : m2 === void 0 ? typeof b == "number" ? m2 = b / l2 : e.setAspectRatio(1 / l2) : b === void 0 && (typeof m2 == "number" ? b = m2 * l2 : e.setAspectRatio(1 / l2)), s.width = y ? m2 + p : m2, s.height = y ? b + h2 : b, s.__src = a, s.__naturalWidth = u2, s.__naturalHeight = f;
  }
  if (t === "svg") {
    let a = i.viewBox || i.viewbox, u2 = gr(a), f = u2 ? u2[3] / u2[2] : null, { width: l2, height: p } = i;
    typeof l2 > "u" && p ? f == null ? l2 = 0 : typeof p == "string" && p.endsWith("%") ? l2 = parseInt(p) / f + "%" : (p = X(p, n.fontSize, 1, n), l2 = p / f) : typeof p > "u" && l2 ? f == null ? l2 = 0 : typeof l2 == "string" && l2.endsWith("%") ? p = parseInt(l2) * f + "%" : (l2 = X(l2, n.fontSize, 1, n), p = l2 * f) : (typeof l2 < "u" && (l2 = X(l2, n.fontSize, 1, n) || l2), typeof p < "u" && (p = X(p, n.fontSize, 1, n) || p), l2 ||= u2 == null ? void 0 : u2[2], p ||= u2 == null ? void 0 : u2[3]), !s.width && l2 && (s.width = l2), !s.height && p && (s.height = p);
  }
  return e.setDisplay(He(s.display, { flex: o.DISPLAY_FLEX, block: o.DISPLAY_FLEX, contents: o.DISPLAY_CONTENTS, none: o.DISPLAY_NONE, "-webkit-box": o.DISPLAY_FLEX }, o.DISPLAY_FLEX, "display")), e.setAlignContent(He(s.alignContent, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, "space-between": o.ALIGN_SPACE_BETWEEN, "space-around": o.ALIGN_SPACE_AROUND, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_AUTO, "alignContent")), e.setAlignItems(He(s.alignItems, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_STRETCH, "alignItems")), e.setAlignSelf(He(s.alignSelf, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_AUTO, "alignSelf")), e.setJustifyContent(He(s.justifyContent, { center: o.JUSTIFY_CENTER, "flex-start": o.JUSTIFY_FLEX_START, "flex-end": o.JUSTIFY_FLEX_END, "space-between": o.JUSTIFY_SPACE_BETWEEN, "space-around": o.JUSTIFY_SPACE_AROUND }, o.JUSTIFY_FLEX_START, "justifyContent")), e.setFlexDirection(He(s.flexDirection, { row: o.FLEX_DIRECTION_ROW, column: o.FLEX_DIRECTION_COLUMN, "row-reverse": o.FLEX_DIRECTION_ROW_REVERSE, "column-reverse": o.FLEX_DIRECTION_COLUMN_REVERSE }, o.FLEX_DIRECTION_ROW, "flexDirection")), e.setFlexWrap(He(s.flexWrap, { wrap: o.WRAP_WRAP, nowrap: o.WRAP_NO_WRAP, "wrap-reverse": o.WRAP_WRAP_REVERSE }, o.WRAP_NO_WRAP, "flexWrap")), typeof s.gap < "u" && e.setGap(o.GUTTER_ALL, s.gap), typeof s.rowGap < "u" && e.setGap(o.GUTTER_ROW, s.rowGap), typeof s.columnGap < "u" && e.setGap(o.GUTTER_COLUMN, s.columnGap), typeof s.flexBasis < "u" && e.setFlexBasis(Ut(s.flexBasis, "flexBasis")), e.setFlexGrow(typeof s.flexGrow > "u" ? 0 : s.flexGrow), e.setFlexShrink(typeof s.flexShrink > "u" ? 0 : s.flexShrink), typeof s.maxHeight < "u" && e.setMaxHeight(Mt(s.maxHeight, "maxHeight")), typeof s.maxWidth < "u" && e.setMaxWidth(Mt(s.maxWidth, "maxWidth")), typeof s.minHeight < "u" && e.setMinHeight(Mt(s.minHeight, "minHeight")), typeof s.minWidth < "u" && e.setMinWidth(Mt(s.minWidth, "minWidth")), e.setOverflow(He(s.overflow, { visible: o.OVERFLOW_VISIBLE, hidden: o.OVERFLOW_HIDDEN }, o.OVERFLOW_VISIBLE, "overflow")), e.setMargin(o.EDGE_TOP, Ut(s.marginTop || 0)), e.setMargin(o.EDGE_BOTTOM, Ut(s.marginBottom || 0)), e.setMargin(o.EDGE_LEFT, Ut(s.marginLeft || 0)), e.setMargin(o.EDGE_RIGHT, Ut(s.marginRight || 0)), e.setBorder(o.EDGE_TOP, s.borderTopWidth || 0), e.setBorder(o.EDGE_BOTTOM, s.borderBottomWidth || 0), e.setBorder(o.EDGE_LEFT, s.borderLeftWidth || 0), e.setBorder(o.EDGE_RIGHT, s.borderRightWidth || 0), e.setPadding(o.EDGE_TOP, s.paddingTop || 0), e.setPadding(o.EDGE_BOTTOM, s.paddingBottom || 0), e.setPadding(o.EDGE_LEFT, s.paddingLeft || 0), e.setPadding(o.EDGE_RIGHT, s.paddingRight || 0), e.setBoxSizing(He(s.boxSizing, { "border-box": o.BOX_SIZING_BORDER_BOX, "content-box": o.BOX_SIZING_CONTENT_BOX }, o.BOX_SIZING_BORDER_BOX, "boxSizing")), e.setPositionType(He(s.position, { absolute: o.POSITION_TYPE_ABSOLUTE, relative: o.POSITION_TYPE_RELATIVE, static: o.POSITION_TYPE_STATIC }, o.POSITION_TYPE_RELATIVE, "position")), typeof s.top < "u" && e.setPosition(o.EDGE_TOP, Mt(s.top, "top")), typeof s.bottom < "u" && e.setPosition(o.EDGE_BOTTOM, Mt(s.bottom, "bottom")), typeof s.left < "u" && e.setPosition(o.EDGE_LEFT, Mt(s.left, "left")), typeof s.right < "u" && e.setPosition(o.EDGE_RIGHT, Mt(s.right, "right")), typeof s.height < "u" ? e.setHeight(Ut(s.height, "height")) : e.setHeightAuto(), typeof s.width < "u" ? e.setWidth(Ut(s.width, "width")) : e.setWidthAuto(), [s, Gi(s)];
}
var ja = [1, 0, 0, 1, 0, 0];
function dd(e, t, n) {
  let r = [...ja];
  for (let i of e) {
    let o = Object.keys(i)[0], s = i[o];
    if (typeof s == "string")
      if (o === "translateX")
        s = parseFloat(s) / 100 * t, i[o] = s;
      else if (o === "translateY")
        s = parseFloat(s) / 100 * n, i[o] = s;
      else
        throw new Error(`Invalid transform: "${o}: ${s}".`);
    let a = s, u2 = [...ja];
    switch (o) {
      case "translateX":
        u2[4] = a;
        break;
      case "translateY":
        u2[5] = a;
        break;
      case "scale":
        u2[0] = a, u2[3] = a;
        break;
      case "scaleX":
        u2[0] = a;
        break;
      case "scaleY":
        u2[3] = a;
        break;
      case "rotate": {
        let f = a * Math.PI / 180, l2 = Math.cos(f), p = Math.sin(f);
        u2[0] = l2, u2[1] = p, u2[2] = -p, u2[3] = l2;
        break;
      }
      case "skewX":
        u2[2] = Math.tan(a * Math.PI / 180);
        break;
      case "skewY":
        u2[1] = Math.tan(a * Math.PI / 180);
        break;
    }
    r = Mr(u2, r);
  }
  e.splice(0, e.length), e.push(...r), e.__resolved = true;
}
function $r({ left: e, top: t, width: n, height: r }, i, o, s) {
  let a;
  i.__resolved || dd(i, n, r);
  let u2 = i;
  if (o)
    a = u2;
  else {
    let f = (s == null ? void 0 : s.xAbsolute) ?? ((s == null ? void 0 : s.xRelative) ?? 50) * n / 100, l2 = (s == null ? void 0 : s.yAbsolute) ?? ((s == null ? void 0 : s.yRelative) ?? 50) * r / 100, p = e + f, h2 = t + l2;
    a = Mr([1, 0, 0, 1, p, h2], Mr(u2, [1, 0, 0, 1, -p, -h2])), u2.__parent && (a = Mr(u2.__parent, a)), u2.splice(0, 6, ...a);
  }
  return `matrix(${a.map((f) => f.toFixed(2)).join(",")})`;
}
function Ha({ left: e, top: t, width: n, height: r, isInheritingTransform: i }, o) {
  let s = "", a = 1;
  return o.transform && (s = $r({ left: e, top: t, width: n, height: r }, o.transform, i, o.transformOrigin)), o.opacity !== void 0 && (a = +o.opacity), { matrix: s, opacity: a };
}
function Hi({ id: e, content: t, filter: n, left: r, top: i, width: o, height: s, matrix: a, opacity: u2, image: f, clipPathId: l2, debug: p, shape: h2, decorationShape: m2 }, b) {
  let y = "";
  if (p && (y = M("rect", { x: r, y: i - s, width: o, height: s, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: a || void 0, "clip-path": l2 ? `url(#${l2})` : void 0 })), f) {
    let k = { href: f, x: r, y: i, width: o, height: s, transform: a || void 0, "clip-path": l2 ? `url(#${l2})` : void 0, style: b.filter ? `filter:${b.filter}` : void 0 };
    return [(n ? `${n}<g filter="url(#satori_s-${e})">` : "") + M("image", { ...k, opacity: u2 !== 1 ? u2 : void 0 }) + (m2 || "") + (n ? "</g>" : "") + y, ""];
  }
  let T = { x: r, y: i, width: o, height: s, "font-weight": b.fontWeight, "font-style": b.fontStyle, "font-size": b.fontSize, "font-family": b.fontFamily, "letter-spacing": b.letterSpacing || void 0, transform: a || void 0, "clip-path": l2 ? `url(#${l2})` : void 0, style: b.filter ? `filter:${b.filter}` : void 0, "stroke-width": b.WebkitTextStrokeWidth ? `${b.WebkitTextStrokeWidth}px` : void 0, stroke: b.WebkitTextStrokeWidth ? b.WebkitTextStrokeColor : void 0, "stroke-linejoin": b.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": b.WebkitTextStrokeWidth ? "stroke" : void 0 };
  return [(n ? `${n}<g filter="url(#satori_s-${e})">` : "") + M("text", { ...T, fill: b.color, opacity: u2 !== 1 ? u2 : void 0 }, (0, import_escape_html.default)(t)) + (m2 || "") + (n ? "</g>" : "") + y, h2 ? M("text", T, (0, import_escape_html.default)(t)) : ""];
}
function pd(e, t, n) {
  return e.replace(/([MA])([0-9.-]+),([0-9.-]+)/g, function(r, i, o, s) {
    return i + (parseFloat(o) + t) + "," + (parseFloat(s) + n);
  });
}
var Yn = 1.1;
function Ya({ id: e, width: t, height: n }, r, i = false) {
  if (!r.shadowColor || !r.shadowOffset || typeof r.shadowRadius > "u")
    return "";
  let o = r.shadowColor.length, s = "", a = "", u2 = 0, f = t, l2 = 0, p = n;
  for (let h2 = 0; h2 < o; h2++) {
    let m2 = r.shadowRadius[h2] * r.shadowRadius[h2] / 4;
    if (u2 = Math.min(r.shadowOffset[h2].width - m2, u2), f = Math.max(r.shadowOffset[h2].width + m2 + t, f), l2 = Math.min(r.shadowOffset[h2].height - m2, l2), p = Math.max(r.shadowOffset[h2].height + m2 + n, p), i) {
      let b = `satori_s-${e}-result-${h2}`;
      s += M("feGaussianBlur", { in: "SourceAlpha", stdDeviation: r.shadowRadius[h2] / 2, result: `${b}-blur` }) + M("feOffset", { in: `${b}-blur`, dx: r.shadowOffset[h2].width, dy: r.shadowOffset[h2].height, result: `${b}-offset` }) + M("feFlood", { "flood-color": r.shadowColor[h2], "flood-opacity": 1, result: `${b}-color` }) + M("feComposite", { in: `${b}-color`, in2: `${b}-offset`, operator: "in", result: o > 1 ? b : void 0 });
    } else
      s += M("feDropShadow", { dx: r.shadowOffset[h2].width, dy: r.shadowOffset[h2].height, stdDeviation: r.shadowRadius[h2] / 2, "flood-color": r.shadowColor[h2], "flood-opacity": 1, ...o > 1 ? { in: "SourceGraphic", result: `satori_s-${e}-result-${h2}` } : {} });
    o > 1 && (a = M("feMergeNode", { in: `satori_s-${e}-result-${h2}` }) + a);
  }
  return M("filter", { id: `satori_s-${e}`, x: (u2 / t * 100 * Yn).toFixed(2) + "%", y: (l2 / n * 100 * Yn).toFixed(2) + "%", width: ((f - u2) / t * 100 * Yn).toFixed(2) + "%", height: ((p - l2) / n * 100 * Yn).toFixed(2) + "%" }, s + (a ? M("feMerge", {}, a) : ""));
}
function Xa({ width: e, height: t, shape: n, opacity: r, id: i }, o) {
  if (!o.boxShadow)
    return null;
  let s = "", a = "";
  for (let u2 = o.boxShadow.length - 1; u2 >= 0; u2--) {
    let f = "", l2 = o.boxShadow[u2];
    l2.spreadRadius && l2.inset && (l2.spreadRadius = -l2.spreadRadius);
    let p = l2.blurRadius * l2.blurRadius / 4 + (l2.spreadRadius || 0), h2 = Math.min(-p - (l2.inset ? l2.offsetX : 0), 0), m2 = Math.max(p + e - (l2.inset ? l2.offsetX : 0), e), b = Math.min(-p - (l2.inset ? l2.offsetY : 0), 0), y = Math.max(p + t - (l2.inset ? l2.offsetY : 0), t), T = `satori_s-${i}-${u2}`, k = `satori_ms-${i}-${u2}`, P2 = l2.spreadRadius ? n.replace('stroke-width="0"', `stroke-width="${l2.spreadRadius * 2}"`) : n;
    f += M("mask", { id: k, maskUnits: "userSpaceOnUse" }, M("rect", { x: 0, y: 0, width: o._viewportWidth || "100%", height: o._viewportHeight || "100%", fill: l2.inset ? "#000" : "#fff" }) + P2.replace('fill="#fff"', l2.inset ? 'fill="#fff"' : 'fill="#000"').replace('stroke="#fff"', ""));
    let w2 = P2.replace(/d="([^"]+)"/, (S2, O) => 'd="' + pd(O, l2.offsetX, l2.offsetY) + '"').replace(/x="([^"]+)"/, (S2, O) => 'x="' + (parseFloat(O) + l2.offsetX) + '"').replace(/y="([^"]+)"/, (S2, O) => 'y="' + (parseFloat(O) + l2.offsetY) + '"');
    l2.spreadRadius && l2.spreadRadius < 0 && (f += M("mask", { id: k + "-neg", maskUnits: "userSpaceOnUse" }, w2.replace('stroke="#fff"', 'stroke="#000"').replace(/stroke-width="[^"]+"/, `stroke-width="${-l2.spreadRadius * 2}"`))), l2.spreadRadius && l2.spreadRadius < 0 && (w2 = M("g", { mask: `url(#${k}-neg)` }, w2)), f += M("defs", {}, M("filter", { id: T, x: `${h2 / e * 100}%`, y: `${b / t * 100}%`, width: `${(m2 - h2) / e * 100}%`, height: `${(y - b) / t * 100}%` }, M("feGaussianBlur", { stdDeviation: l2.blurRadius / 2, result: "b" }) + M("feFlood", { "flood-color": l2.color, in: "SourceGraphic", result: "f" }) + M("feComposite", { in: "f", in2: "b", operator: l2.inset ? "out" : "in" }))) + M("g", { mask: `url(#${k})`, filter: `url(#${T})`, opacity: r }, w2), l2.inset ? a += f : s += f;
  }
  return [s, a];
}
function hd(e, t, n, r, i, o) {
  let s = i / 2, a = Math.max(s, i * 1.25), u2 = [];
  for (let p of n) {
    if (p.y2 < o + s || p.y1 > r + s)
      continue;
    let h2 = Math.max(e, p.x1 - a), m2 = Math.min(t, p.x2 + a);
    if (h2 >= m2)
      continue;
    if (u2.length === 0) {
      u2.push([h2, m2]);
      continue;
    }
    let b = u2[u2.length - 1];
    h2 <= b[1] ? b[1] = Math.max(b[1], m2) : u2.push([h2, m2]);
  }
  if (!u2.length)
    return [[e, t]];
  let f = [], l2 = e;
  for (let [p, h2] of u2)
    if (p > l2 && f.push([l2, p]), l2 = Math.max(l2, h2), l2 >= t)
      break;
  return l2 < t && f.push([l2, t]), f;
}
function Yi({ width: e, left: t, top: n, ascender: r, clipPathId: i, matrix: o, glyphBoxes: s }, a) {
  let { textDecorationColor: u2, textDecorationStyle: f, textDecorationLine: l2, textDecorationSkipInk: p, fontSize: h2, color: m2 } = a;
  if (!l2 || l2 === "none")
    return "";
  let b = Math.max(1, h2 * 0.1), y = l2 === "line-through" ? n + r * 0.7 : l2 === "underline" ? n + r * 1.1 : n, T = f === "dashed" ? `${b * 1.2} ${b * 2}` : f === "dotted" ? `0 ${b * 2}` : void 0, k = l2 === "underline" && (p || "auto") !== "none" && (s == null ? void 0 : s.length), P2 = n + r, w2 = k ? hd(t, t + e, s, y, b, P2) : [[t, t + e]], S2 = f === "double" ? w2.map(([O, I]) => M("line", { x1: O, y1: y + b + 1, x2: I, y2: y + b + 1, stroke: u2 || m2, "stroke-width": b, "stroke-dasharray": T, "stroke-linecap": f === "dotted" ? "round" : "square", transform: o })).join("") : "";
  return (i ? `<g clip-path="url(#${i})">` : "") + w2.map(([O, I]) => M("line", { x1: O, y1: y, x2: I, y2: y, stroke: u2 || m2, "stroke-width": b, "stroke-dasharray": T, "stroke-linecap": f === "dotted" ? "round" : "square", transform: o })).join("") + S2 + (i ? "</g>" : "");
}
function Xi(e) {
  return e = e.replace("U+", "0x"), String.fromCodePoint(Number(e));
}
var nr = Xi("U+0020");
var Qi = Xi("U+0009");
var wr = Xi("U+2026");
function Qa(e, t, n) {
  let { fontSize: r, letterSpacing: i } = n, o = /* @__PURE__ */ new Map();
  function s(f) {
    let l2 = o.get(f);
    return l2 === void 0 && (l2 = e.measure(f, { fontSize: r, letterSpacing: i }), o.set(f, l2)), l2;
  }
  function a(f) {
    let l2 = 0;
    for (let p of f)
      t(p) ? l2 += r : l2 += s(p);
    return l2;
  }
  function u2(f) {
    return a(Ve(f, "grapheme"));
  }
  return { measureGrapheme: s, measureGraphemeArray: a, measureText: u2 };
}
function Ka(e, t, n) {
  let { textTransform: r, whiteSpace: i, wordBreak: o } = t;
  e = md(e, r, n);
  let { content: s, shouldCollapseTabsAndSpaces: a, allowSoftWrap: u2 } = vd(e, i), { words: f, requiredBreaks: l2, allowBreakWord: p } = bd(s, o), [h2, m2] = gd(t, u2);
  return { words: f, requiredBreaks: l2, allowSoftWrap: u2, allowBreakWord: p, processedContent: s, shouldCollapseTabsAndSpaces: a, lineLimit: h2, blockEllipsis: m2 };
}
function md(e, t, n) {
  return t === "uppercase" ? e = e.toLocaleUpperCase(n) : t === "lowercase" ? e = e.toLocaleLowerCase(n) : t === "capitalize" && (e = Ve(e, "word", n).map((r) => Ve(r, "grapheme", n).map((i, o) => o === 0 ? i.toLocaleUpperCase(n) : i).join("")).join("")), e;
}
function gd(e, t) {
  let { textOverflow: n, lineClamp: r, WebkitLineClamp: i, WebkitBoxOrient: o, overflow: s, display: a } = e;
  if (a === "block" && r) {
    let [u2, f = wr] = yd(r);
    if (u2)
      return [u2, f];
  }
  return n === "ellipsis" && a === "-webkit-box" && o === "vertical" && ha(i) && i > 0 ? [i, wr] : n === "ellipsis" && s === "hidden" && !t ? [1, wr] : [1 / 0];
}
function bd(e, t) {
  let n = ["break-all", "break-word"].includes(t), { words: r, requiredBreaks: i } = ga(e, t);
  return { words: r, requiredBreaks: i, allowBreakWord: n };
}
function vd(e, t) {
  let n = ["pre", "pre-wrap", "pre-line"].includes(t), r = ["normal", "nowrap", "pre-line"].includes(t), i = !["pre", "nowrap"].includes(t);
  return n || (e = e.replace(/\n/g, nr)), r && (e = e.replace(/([ ]|\t)+/g, nr).replace(/^[ ]|[ ]$/g, "")), { content: e, shouldCollapseTabsAndSpaces: r, allowSoftWrap: i };
}
function yd(e) {
  if (typeof e == "number")
    return [e];
  let t = /^(\d+)\s*"(.*)"$/, n = /^(\d+)\s*'(.*)'$/, r = t.exec(e), i = n.exec(e);
  if (r) {
    let o = +r[1], s = r[2];
    return [o, s];
  } else if (i) {
    let o = +i[1], s = i[2];
    return [o, s];
  }
  return [];
}
var xd = /* @__PURE__ */ new Set([Qi]);
function wd(e) {
  return xd.has(e);
}
function Ki(e) {
  if (e === "transparent")
    return true;
  let t = index_esm_default(e);
  return t ? t.alpha === 0 : false;
}
function Ja(e) {
  if (!e)
    return false;
  let t = index_esm_default(e);
  if (!t)
    return false;
  let [n, r, i, o] = t.values;
  return n === 255 && r === 255 && i === 255 && (o === void 0 || o === 1);
}
async function* Ji(e, t) {
  let n = await Gt(), { parentStyle: r, inheritedStyle: i, parent: o, font: s, id: a, isInheritingTransform: u2, debug: f, embedFont: l2, graphemeImages: p, locale: h2, canLoadAdditionalAssets: m2 } = t, { textAlign: b, textIndent: y = 0, lineHeight: T, textWrap: k, fontSize: P2, filter: w2, tabSize: S2 = 8, letterSpacing: O, _inheritedBackgroundClipTextPath: I, _inheritedBackgroundClipTextHasBackground: F, flexShrink: q } = r, { words: V, requiredBreaks: de, allowSoftWrap: Ae, allowBreakWord: me, processedContent: ue, shouldCollapseTabsAndSpaces: Ie, lineLimit: Z, blockEllipsis: ne } = Ka(e, r, h2), ke = Sd(n, b);
  o.insertChild(ke, o.getChildCount()), ma(q) && o.setFlexShrink(1);
  let ve = s.getEngine(P2, T, r, h2), Re = m2 ? Ve(ue, "grapheme").filter((Y) => !wd(Y) && !ve.has(Y)) : [];
  yield Re.map((Y) => ({ word: Y, locale: h2 })), Re.length && (ve = s.getEngine(P2, T, r, h2));
  function Ee(Y) {
    return !!(p && p[Y]);
  }
  let { measureGrapheme: Ye, measureGraphemeArray: Me, measureText: Oe } = Qa(ve, Ee, { fontSize: P2, letterSpacing: O }), le = Bn(S2) ? X(S2, P2, 1, r) : Ye(nr) * S2, H = (Y, j) => {
    if (Y.length === 0)
      return { originWidth: 0, endingSpacesWidth: 0, text: Y };
    let { index: fe, tabCount: K2 } = _d(Y), ye = 0;
    if (K2 > 0) {
      let xe = Y.slice(0, fe), ee = Y.slice(fe + K2), te = Oe(xe), ot = te + j;
      ye = (le === 0 ? te : (Math.floor(ot / le) + K2) * le) + Oe(ee);
    } else
      ye = Oe(Y);
    let ae = Y.trimEnd() === Y ? ye : Oe(Y.trimEnd());
    return { originWidth: ye, endingSpacesWidth: ye - ae, text: Y };
  }, J = [], pe = [], G = [], Le = [], De = [];
  function Ue(Y) {
    let j = 0, fe = 0, K2 = -1, ye = 0, ae = 0, xe = 0, ee = 0;
    J = [], G = [0], Le = [], De = [];
    let te = 0, ot = 0;
    for (; te < V.length && j < Z; ) {
      let Q = V[te], We = de[te], ze = 0, { originWidth: Ar, endingSpacesWidth: Pe, text: er } = H(Q, ae);
      Q = er, ze = Ar;
      let qe = Pe;
      We && xe === 0 && (xe = ve.height(Q));
      let Rt = b === "justify", we = te && ae + ze > Y + qe && Ae;
      if (me && ze > Y && (!ae || we || We)) {
        let tt = Ve(Q, "grapheme");
        V.splice(te, 1, ...tt), ae > 0 && (J.push(ae - ot), pe.push(ee), j++, ye += xe, ae = 0, xe = 0, ee = 0, G.push(1), K2 = -1), ot = qe;
        continue;
      }
      if (We || we)
        Ie && Q === nr && (ze = 0), J.push(ae - ot), pe.push(ee), j++, ye += xe, ae = ze, xe = ze ? Math.round(ve.height(Q)) : 0, ee = ze ? Math.round(ve.baseline(Q)) : 0, G.push(1), K2 = -1, We || (fe = Math.max(fe, Y));
      else {
        ae += ze;
        let tt = Math.round(ve.height(Q));
        tt > xe && (xe = tt, ee = Math.round(ve.baseline(Q))), Rt && G[G.length - 1]++;
      }
      Rt && K2++, fe = Math.max(fe, ae);
      let et2 = ae - ze;
      if (ze === 0)
        De.push({ y: ye, x: et2, width: 0, line: j, lineIndex: K2, isImage: false });
      else {
        let tt = Ve(Q, "word");
        for (let bt = 0; bt < tt.length; bt++) {
          let vt = tt[bt], je = 0, st = false;
          Ee(vt) ? (je = P2, st = true) : !l2 && vt.length > 1 ? je = Oe(vt) : je = Ye(vt), Le.push(vt), De.push({ y: ye, x: et2, width: je, line: j, lineIndex: K2, isImage: st }), et2 += je;
        }
      }
      te++, ot = qe;
    }
    return ae && (j < Z && (ye += xe), j++, J.push(ae), pe.push(ee)), { width: fe, height: ye };
  }
  let $e = { width: 0, height: 0 };
  ke.setMeasureFunc((Y) => {
    let { width: j, height: fe } = Ue(Y);
    if (k === "balance") {
      let ye = j / 2, ae = j, xe = j;
      for (; ye + 1 < ae; ) {
        xe = (ye + ae) / 2;
        let { height: te } = Ue(xe);
        te > fe ? ye = xe : ae = xe;
      }
      Ue(ae);
      let ee = Math.ceil(ae);
      return $e = { width: ee, height: fe }, { width: ee, height: fe };
    }
    if (k === "pretty" && J[J.length - 1] < j / 3) {
      let xe = j * 0.9, ee = Ue(xe);
      if (ee.height <= fe * 1.3)
        return $e = { width: j, height: ee.height }, { width: j, height: ee.height };
    }
    let K2 = Math.ceil(j);
    return $e = { width: K2, height: fe }, { width: K2, height: fe };
  });
  let [ie, _t] = yield, $t = "", Tt = "", Ne = i._inheritedClipPathId, fr = i._inheritedMaskId, { left: kt, top: Pr, width: Qt, height: cr } = ke.getComputedLayout(), dr = typeof y == "string" ? X(y, P2, Qt, r, true) || 0 : y, Kt = o.getComputedWidth() - o.getComputedPadding(n.EDGE_LEFT) - o.getComputedPadding(n.EDGE_RIGHT) - o.getComputedBorder(n.EDGE_LEFT) - o.getComputedBorder(n.EDGE_RIGHT), Et = ie + kt, pt = _t + Pr, { matrix: nt, opacity: Jt } = Ha({ left: kt, top: Pr, width: Qt, height: cr, isInheritingTransform: u2 }, r), Xe = "";
  if (r.textShadowOffset) {
    let { textShadowColor: Y, textShadowOffset: j, textShadowRadius: fe } = r;
    Xe = Ya({ width: $e.width, height: $e.height, id: a }, { shadowColor: Y, shadowOffset: j, shadowRadius: fe }, Ki(r.color) || F && Ja(r.color)), Xe = M("defs", {}, Xe);
  }
  let ht = "", mt = "", Zt = "", qt = -1, Ge = {}, it = {}, Ze = null, gt = 0;
  for (let Y = 0; Y < Le.length; Y++) {
    let j = De[Y], fe = De[Y + 1];
    if (!j)
      continue;
    let K2 = Le[Y], ye = null, ae = false, xe = p ? p[K2] : null, ee = j.y, te = j.x, ot = j.width, Q = j.line, We = r.textDecorationLine === "underline" && (r.textDecorationSkipInk || "auto") !== "none";
    if (Q === qt)
      continue;
    let ze = false;
    if (Q === 0 && dr !== 0 && (te += dr), J.length > 1) {
      let we = Qt - J[Q];
      if (b === "right" || b === "end")
        te += we;
      else if (b === "center")
        te += we / 2;
      else if (b === "justify" && Q < J.length - 1) {
        let Te = G[Q], et2 = Te > 1 ? we / (Te - 1) : 0;
        te += et2 * j.lineIndex, ze = true;
      }
      l2 && (te = Math.round(te));
    }
    let Ar = pe[Q], Pe = ve.baseline(K2), er = ve.height(K2), qe = Ar - Pe, Rt = (we) => !We || r.textDecorationLine !== "underline" ? void 0 : { underlineY: pt + we + qe + Pe + Pe * 0.1, strokeWidth: Math.max(1, P2 * 0.1) };
    if (Ge[Q] || (Ge[Q] = { left: te, top: pt + ee + qe, ascender: Pe, width: ze ? Qt : J[Q] }), Z !== 1 / 0) {
      let vt = function(je, st) {
        let Ir = Ve(st, "grapheme", h2), pr = "", In = 0;
        for (let Rn of Ir) {
          let Rr = je + Me([pr + Rn]);
          if (pr && Rr + Te > Kt)
            break;
          pr += Rn, In = Rr;
        }
        return { subset: pr, resolvedWidth: In };
      }, we = ne, Te = Ye(ne);
      Te > Kt && (we = wr, Te = Ye(we));
      let et2 = Ye(nr), tt = Q < J.length - 1;
      if (Q + 1 === Z && (tt || J[Q] > Kt)) {
        if (te + ot + Te + et2 > Kt) {
          let { subset: je, resolvedWidth: st } = vt(te, K2);
          K2 = je + we, qt = Q, Ge[Q].width = Math.max(0, st - Ge[Q].left), ae = true;
        } else if (fe && fe.line !== Q)
          if (b === "center") {
            let { subset: je, resolvedWidth: st } = vt(te, K2);
            K2 = je + we, qt = Q, Ge[Q].width = Math.max(0, st - Ge[Q].left), ae = true;
          } else {
            let je = Le[Y + 1], { subset: st, resolvedWidth: Ir } = vt(ot + te, je);
            K2 = K2 + st + we, qt = Q, Ge[Q].width = Math.max(0, Ir - Ge[Q].left), ae = true;
          }
      }
    }
    if (xe)
      ee += 0;
    else if (l2) {
      if (!K2.includes(Qi) && !da.includes(K2) && Le[Y + 1] && fe && !fe.isImage && ee === fe.y && !ae) {
        Ze === null && (gt = te), Ze = Ze === null ? K2 : Ze + K2;
        continue;
      }
      let we = Ze === null ? K2 : Ze + K2, Te = Ze === null ? te : gt, et2 = j.width + te - Te, tt = Rt(ee), bt = ve.getSVG(we.replace(/(\t)+/g, ""), { fontSize: P2, left: Et + Te, top: pt + ee + Pe + qe, letterSpacing: O }, tt);
      ye = bt.path, We && bt.boxes && bt.boxes.length && (it[Q] || (it[Q] = [])).push(...bt.boxes), Ze = null, f && (Zt += M("rect", { x: Et + Te, y: pt + ee + qe, width: et2, height: er, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: nt || void 0, "clip-path": Ne ? `url(#${Ne})` : void 0 }) + M("line", { x1: Et + te, x2: Et + te + j.width, y1: pt + ee + qe + Pe, y2: pt + ee + qe + Pe, stroke: "#14c000", "stroke-width": 1, transform: nt || void 0, "clip-path": Ne ? `url(#${Ne})` : void 0 }));
    } else if (ee += Pe + qe, We && !xe) {
      let we = Rt(ee), Te = ve.getSVG(K2.replace(/(\t)+/g, ""), { fontSize: P2, left: Et + te, top: pt + ee, letterSpacing: O }, we);
      Te.boxes && Te.boxes.length && (it[Q] || (it[Q] = [])).push(...Te.boxes);
    }
    if (ye !== null)
      mt += ye + " ";
    else {
      let [we, Te] = Hi({ content: K2, filter: Xe, id: a, left: Et + te, top: pt + ee, width: ot, height: er, matrix: nt, opacity: Jt, image: xe, clipPathId: Ne, debug: f, shape: !!I }, r);
      $t += we, Tt += Te;
    }
    if (ae)
      break;
  }
  if (r.textDecorationLine && (ht = Object.entries(Ge).map(([Y, j]) => {
    if (!j)
      return "";
    let fe = it[Y] || [];
    return Yi({ left: Et + j.left, top: j.top, width: j.width, ascender: j.ascender, clipPathId: Ne, matrix: nt, glyphBoxes: fe }, r);
  }).join("")), mt) {
    let Y = (!Ki(r.color) || Xe) && Jt !== 0 ? `<g ${fr ? `mask="url(#${fr})"` : ""} ${Ne ? `clip-path="url(#${Ne})"` : ""}>` + M("path", { fill: Xe && (Ki(r.color) || F && Ja(r.color)) ? "black" : r.color, d: mt, transform: nt || void 0, opacity: Jt !== 1 ? Jt : void 0, style: w2 ? `filter:${w2}` : void 0, "stroke-width": i.WebkitTextStrokeWidth ? `${i.WebkitTextStrokeWidth}px` : void 0, stroke: i.WebkitTextStrokeWidth ? i.WebkitTextStrokeColor : void 0, "stroke-linejoin": i.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": i.WebkitTextStrokeWidth ? "stroke" : void 0 }) + "</g>" : "";
    I && (Tt = M("path", { d: mt, transform: nt || void 0 })), $t += (Xe ? Xe + M("g", { filter: `url(#satori_s-${a})` }, Y + ht) : Y + ht) + Zt;
  } else
    ht && ($t += Xe ? M("g", { filter: `url(#satori_s-${a})` }, ht) : ht);
  return Tt && (r._inheritedBackgroundClipTextPath.value += Tt), $t;
}
function Sd(e, t) {
  let n = e.Node.create();
  return n.setAlignItems(e.ALIGN_BASELINE), n.setJustifyContent(He(t, { left: e.JUSTIFY_FLEX_START, right: e.JUSTIFY_FLEX_END, center: e.JUSTIFY_CENTER, justify: e.JUSTIFY_SPACE_BETWEEN, start: e.JUSTIFY_FLEX_START, end: e.JUSTIFY_FLEX_END }, e.JUSTIFY_FLEX_START, "textAlign")), n;
}
function _d(e) {
  let t = /(\t)+/.exec(e);
  return t ? { index: t.index, tabCount: t[0].length } : { index: null, tabCount: 0 };
}
function Xn(e, t, n, r, i) {
  let o = [], s = t.at(-1), a = s && s.offset && s.offset.unit === "%" && r ? +s.offset.value : 100;
  for (let p of t) {
    let { color: h2 } = p;
    if (!o.length && (o.push({ offset: 0, color: h2 }), !p.offset || p.offset.value === "0"))
      continue;
    let m2 = typeof p.offset > "u" ? void 0 : p.offset.unit === "%" ? +p.offset.value / a : Number(X(`${p.offset.value}${p.offset.unit}`, n.fontSize, e, n, true)) / e;
    o.push({ offset: m2, color: h2 });
  }
  o.length || o.push({ offset: 0, color: "transparent" });
  let u2 = o[o.length - 1];
  u2.offset !== 1 && (typeof u2.offset > "u" ? u2.offset = 1 : r ? o[o.length - 1] = { offset: 1, color: u2.color } : o.push({ offset: 1, color: u2.color }));
  let f = 0, l2 = 1;
  for (let p = 0; p < o.length; p++)
    if (typeof o[p].offset > "u") {
      for (l2 < p && (l2 = p); typeof o[l2].offset > "u"; )
        l2++;
      o[p].offset = (o[l2].offset - o[f].offset) / (l2 - f) * (p - f) + o[f].offset;
    } else
      f = p;
  return i === "mask" ? o.map((p) => {
    let h2 = index_esm_default(p.color);
    return h2 ? h2.alpha === 0 ? { ...p, color: "rgba(0, 0, 0, 1)" } : { ...p, color: `rgba(255, 255, 255, ${h2.alpha})` } : p;
  }) : o;
}
function eu({ id: e, width: t, height: n, repeatX: r, repeatY: i }, o, s, a, u2, f) {
  let l2 = P(o), [p, h2] = s, m2 = o.startsWith("repeating"), b, y, T;
  if (l2.orientation.type === "directional")
    b = Od(l2.orientation.value), y = Math.sqrt(Math.pow((b.x2 - b.x1) * p, 2) + Math.pow((b.y2 - b.y1) * h2, 2));
  else if (l2.orientation.type === "angular") {
    let { length: O, ...I } = Pd(Ai(`${l2.orientation.value.value}${l2.orientation.value.unit}`) / 180 * Math.PI, p, h2);
    y = O, b = I;
  }
  T = m2 ? Ad(l2.stops, y, b, u2) : b;
  let k = Xn(m2 ? Ed(l2.stops, y) : y, l2.stops, u2, m2, f), P2 = `satori_bi${e}`, w2 = `satori_pattern_${e}`, S2 = M("pattern", { id: w2, x: a[0] / t, y: a[1] / n, width: r ? p / t : "1", height: i ? h2 / n : "1", patternUnits: "objectBoundingBox" }, M("linearGradient", { id: P2, ...T, spreadMethod: m2 ? "repeat" : "pad" }, k.map((O) => M("stop", { offset: (O.offset ?? 0) * 100 + "%", "stop-color": O.color })).join("")) + M("rect", { x: 0, y: 0, width: p, height: h2, fill: `url(#${P2})` }));
  return [w2, S2];
}
function Ed(e, t) {
  let n = e[e.length - 1], { offset: r } = n;
  return r ? r.unit === "%" ? Number(r.value) / 100 * t : Number(r.value) : t;
}
function Od(e) {
  let t = 0, n = 0, r = 0, i = 0;
  return e.includes("top") ? n = 1 : e.includes("bottom") && (i = 1), e.includes("left") ? t = 1 : e.includes("right") && (r = 1), !t && !r && !n && !i && (n = 1), { x1: t, y1: n, x2: r, y2: i };
}
function Pd(e, t, n) {
  let r = Math.pow(n / t, 2);
  e = (e % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let i, o, s, a, u2, f, l2, p, h2 = (m2) => {
    if (m2 === 0) {
      i = 0, o = n, s = 0, a = 0, u2 = n;
      return;
    } else if (m2 === Math.PI / 2) {
      i = 0, o = 0, s = t, a = 0, u2 = t;
      return;
    }
    if (m2 > 0 && m2 < Math.PI / 2) {
      i = (r * t / 2 / Math.tan(m2) - n / 2) / (Math.tan(m2) + r / Math.tan(m2)), o = Math.tan(m2) * i + n, s = Math.abs(t / 2 - i) + t / 2, a = n / 2 - Math.abs(o - n / 2), u2 = Math.sqrt(Math.pow(s - i, 2) + Math.pow(a - o, 2)), l2 = (t / 2 / Math.tan(m2) - n / 2) / (Math.tan(m2) + 1 / Math.tan(m2)), p = Math.tan(m2) * l2 + n, u2 = 2 * Math.sqrt(Math.pow(t / 2 - l2, 2) + Math.pow(n / 2 - p, 2));
      return;
    } else if (m2 > Math.PI / 2 && m2 < Math.PI) {
      i = (n / 2 + r * t / 2 / Math.tan(m2)) / (Math.tan(m2) + r / Math.tan(m2)), o = Math.tan(m2) * i, s = Math.abs(t / 2 - i) + t / 2, a = n / 2 + Math.abs(o - n / 2), l2 = (t / 2 / Math.tan(m2) + n / 2) / (Math.tan(m2) + 1 / Math.tan(m2)), p = Math.tan(m2) * l2, u2 = 2 * Math.sqrt(Math.pow(t / 2 - l2, 2) + Math.pow(n / 2 - p, 2));
      return;
    } else
      m2 >= Math.PI && (h2(m2 - Math.PI), f = i, i = s, s = f, f = o, o = a, a = f);
  };
  return h2(e), { x1: i / t, y1: o / n, x2: s / t, y2: a / n, length: u2 };
}
function Ad(e, t, n, r) {
  let { x1: i, x2: o, y1: s, y2: a } = n, u2 = e[0].offset ? e[0].offset.unit === "%" ? Number(e[0].offset.value) / 100 : X(`${e[0].offset.value}${e[0].offset.unit}`, r.fontSize, t, r, true) / t : 0, f = e.at(-1).offset ? e.at(-1).offset.unit === "%" ? Number(e.at(-1).offset.value) / 100 : X(`${e.at(-1).offset.value}${e.at(-1).offset.unit}`, r.fontSize, t, r, true) / t : 1, l2 = (o - i) * u2 + i, p = (a - s) * u2 + s, h2 = (o - i) * f + i, m2 = (a - s) * f + s;
  return { x1: l2, y1: p, x2: h2, y2: m2 };
}
function ru({ id: e, width: t, height: n, repeatX: r, repeatY: i }, o, s, a, u2, f) {
  var ue;
  let { shape: l2, stops: p, position: h2, size: m2, repeating: b } = K(o), [y, T] = s, k = y / 2, P2 = T / 2, w2 = Cd(h2.x, h2.y, y, T, u2.fontSize, u2);
  k = w2.x, P2 = w2.y;
  let S2 = Rd(t, p, b, u2), O = Xn(S2, p, u2, b, f), I = `satori_radial_${e}`, F = `satori_pattern_${e}`, q = `satori_mask_${e}`, V = Md(l2, m2, u2.fontSize, { x: k, y: P2 }, [y, T], u2, b), de = Ld(l2, u2.fontSize, p, [y, T], u2, b, V), Ae = M("pattern", { id: F, x: a[0] / t, y: a[1] / n, width: r ? y / t : "1", height: i ? T / n : "1", patternUnits: "objectBoundingBox" }, M("radialGradient", { id: I, ...de }, O.map((Ie) => M("stop", { offset: Ie.offset || 0, "stop-color": Ie.color })).join("")) + M("mask", { id: q }, M("rect", { x: 0, y: 0, width: y, height: T, fill: "#fff" })) + M("rect", { x: 0, y: 0, width: y, height: T, fill: ((ue = O.at(-1)) == null ? void 0 : ue.color) || "transparent" }) + M(l2, { cx: k, cy: P2, width: y, height: T, ...V, fill: `url(#${I})`, mask: `url(#${q})` }));
  return [F, Ae];
}
function Rd(e, t, n, r) {
  if (!n)
    return e;
  let i = t.at(-1);
  return !i || !i.offset || i.offset.unit === "%" ? e : X(`${i.offset.value}${i.offset.unit}`, +r.fontSize, e, r, true);
}
function Cd(e, t, n, r, i, o) {
  let s = { x: n / 2, y: r / 2 };
  return e.type === "keyword" ? Object.assign(s, tu(e.value, n, r, "x")) : s.x = X(`${e.value.value}${e.value.unit}`, i, n, o, true) ?? n / 2, t.type === "keyword" ? Object.assign(s, tu(t.value, n, r, "y")) : s.y = X(`${t.value.value}${t.value.unit}`, i, r, o, true) ?? r / 2, s;
}
function tu(e, t, n, r) {
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
function Ld(e, t, n, [r, i], o, s, a) {
  let { r: u2, rx: f, ratio: l2 = 1 } = a;
  if (!s)
    return { spreadMethod: "pad" };
  let p = n.at(-1), h2 = e === "circle" ? u2 * 2 : f * 2;
  return { spreadMethod: "repeat", cx: "50%", cy: "50%", r: p.offset.unit === "%" ? `${Number(p.offset.value) * Math.min(i / r, 1) / l2}%` : Number(X(`${p.offset.value}${p.offset.unit}`, t, r, o, true) / h2) };
}
function Md(e, t, n, r, i, o, s) {
  let [a, u2] = i, { x: f, y: l2 } = r, p = {}, h2 = 0, m2 = 0;
  if (Nd(t)) {
    if (t.some((b) => b.value.value.startsWith("-")))
      throw new Error("disallow setting negative values to the size of the shape. Check https://w3c.github.io/csswg-drafts/css-images/#valdef-rg-size-length-0");
    return e === "circle" ? Object.assign(p, { r: Number(X(`${t[0].value.value}${t[0].value.unit}`, n, a, o, true)) }) : Object.assign(p, { rx: Number(X(`${t[0].value.value}${t[0].value.unit}`, n, a, o, true)), ry: Number(X(`${t[1].value.value}${t[1].value.unit}`, n, u2, o, true)) }), Qn(p, a, u2, f, l2, s, e), p;
  }
  switch (t[0].value) {
    case "farthest-corner":
      h2 = Math.max(Math.abs(a - f), Math.abs(f)), m2 = Math.max(Math.abs(u2 - l2), Math.abs(l2));
      break;
    case "closest-corner":
      h2 = Math.min(Math.abs(a - f), Math.abs(f)), m2 = Math.min(Math.abs(u2 - l2), Math.abs(l2));
      break;
    case "farthest-side":
      return e === "circle" ? p.r = Math.max(Math.abs(a - f), Math.abs(f), Math.abs(u2 - l2), Math.abs(l2)) : (p.rx = Math.max(Math.abs(a - f), Math.abs(f)), p.ry = Math.max(Math.abs(u2 - l2), Math.abs(l2))), Qn(p, a, u2, f, l2, s, e), p;
    case "closest-side":
      return e === "circle" ? p.r = Math.min(Math.abs(a - f), Math.abs(f), Math.abs(u2 - l2), Math.abs(l2)) : (p.rx = Math.min(Math.abs(a - f), Math.abs(f)), p.ry = Math.min(Math.abs(u2 - l2), Math.abs(l2))), Qn(p, a, u2, f, l2, s, e), p;
  }
  return e === "circle" ? p.r = Math.sqrt(h2 * h2 + m2 * m2) : Object.assign(p, nu(h2, m2)), Qn(p, a, u2, f, l2, s, e), p;
}
function Qn(e, t, n, r, i, o, s) {
  if (o)
    if (s === "ellipse") {
      let a = Math.max(Math.abs(t - r), Math.abs(r)), u2 = Math.max(Math.abs(n - i), Math.abs(i)), { rx: f, ry: l2 } = nu(a, u2);
      e.ratio = Math.max(f / e.rx, l2 / e.ry), e.ratio > 1 && (e.rx *= e.ratio, e.ry *= e.ratio);
    } else {
      let a = Math.max(Math.abs(t - r), Math.abs(r)), u2 = Math.max(Math.abs(n - i), Math.abs(i)), f = Math.sqrt(a * a + u2 * u2);
      e.ratio = f / e.r, e.ratio > 1 && (e.r = f);
    }
}
function nu(e, t) {
  let n = t !== 0 ? e / t : 1;
  if (e === 0)
    return { rx: 0, ry: 0 };
  {
    let r = Math.sqrt(e * e + t * t * n * n) / n;
    return { ry: r, rx: r * n };
  }
}
function Nd(e) {
  return !e.some((t) => t.type === "keyword");
}
function eo(e, t) {
  return typeof e == "string" && e.endsWith("%") ? t * parseFloat(e) / 100 : +e;
}
function Wd(e, t, n, r, i) {
  if (!r || !i)
    return [t, n];
  if (e === "cover") {
    let o = t / r, s = n / i, a = Math.max(o, s);
    return [r * a, i * a];
  }
  if (e === "contain") {
    let o = t / r, s = n / i, a = Math.min(o, s);
    return [r * a, i * a];
  }
  if (e === "auto" || e.includes("auto")) {
    let o = e.split(" "), s = o[0] || "auto", a = o[1] || o[0] || "auto", u2 = r, f = i;
    if (s === "auto" && a !== "auto") {
      let l2 = eo(a, n);
      f = l2, u2 = r / i * l2;
    } else if (a === "auto" && s !== "auto") {
      let l2 = eo(s, t);
      u2 = l2, f = i / r * l2;
    }
    return [u2, f];
  }
  return [t, n];
}
function Zi(e, { x: t, y: n, defaultX: r, defaultY: i }) {
  return (e ? e.split(" ").map((o) => {
    try {
      let s = new xt(o);
      return s.type === "length" || s.type === "number" ? s.value : s.value + s.unit;
    } catch {
      return null;
    }
  }).filter((o) => o !== null) : [r, i]).map((o, s) => eo(o, [t, n][s]));
}
async function qr({ id: e, width: t, height: n, left: r, top: i }, { image: o, size: s, position: a, repeat: u2 }, f, l2) {
  u2 = u2 || "repeat", l2 = l2 || "background";
  let p = u2 === "repeat-x" || u2 === "repeat", h2 = u2 === "repeat-y" || u2 === "repeat", m2 = s && (s === "cover" || s === "contain" || s === "auto" || s.includes("auto")), b = o.startsWith("linear-gradient(") || o.startsWith("repeating-linear-gradient(") || o.startsWith("radial-gradient(") || o.startsWith("repeating-radial-gradient("), y = m2 && b ? [t, n] : m2 ? [0, 0] : Zi(s, { x: t, y: n, defaultX: t, defaultY: n }), T = Zi(a, { x: t, y: n, defaultX: 0, defaultY: 0 });
  if (o.startsWith("linear-gradient(") || o.startsWith("repeating-linear-gradient("))
    return eu({ id: e, width: t, height: n, repeatX: p, repeatY: h2 }, o, y, T, f, l2);
  if (o.startsWith("radial-gradient(") || o.startsWith("repeating-radial-gradient("))
    return ru({ id: e, width: t, height: n, repeatX: p, repeatY: h2 }, o, y, T, f, l2);
  if (o.startsWith("url(")) {
    let [k, P2, w2] = await xr(o.slice(4, -1)), S2, O;
    if (m2) {
      let [I, F] = Wd(s, t, n, P2, w2);
      S2 = I, O = F;
    } else {
      let I = Zi(s, { x: t, y: n, defaultX: 0, defaultY: 0 });
      S2 = l2 === "mask" ? P2 || I[0] : I[0] || P2, O = l2 === "mask" ? w2 || I[1] : I[1] || w2;
    }
    return [`satori_bi${e}`, M("pattern", { id: `satori_bi${e}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: T[0] + r, y: T[1] + i, width: p ? S2 : "100%", height: h2 ? O : "100%" }, M("image", { x: 0, y: 0, width: S2, height: O, preserveAspectRatio: "none", href: k }))];
  }
  if (index_esm_default(o)) {
    let k = index_esm_default(o), [P2, w2, S2, O] = k.values, F = `rgba(${P2},${w2},${S2},${O !== void 0 ? O : 1})`;
    return [`satori_bi${e}`, M("pattern", { id: `satori_bi${e}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: r, y: i, width: t, height: n }, M("rect", { x: 0, y: 0, width: t, height: n, fill: F }))];
  }
  throw new Error(`Invalid background image: "${o}"`);
}
function Fd([e, t]) {
  return Math.round(e * 1e3) === 0 && Math.round(t * 1e3) === 0 ? 0 : Math.round(e * t / Math.sqrt(e * e + t * t) * 1e3) / 1e3;
}
function Kn(e, t, n) {
  return n < e + t && (n / 2 < e && n / 2 < t ? e = t = n / 2 : n / 2 < e ? e = n - t : n / 2 < t && (t = n - e)), [e, t];
}
function Jn(e) {
  e[0] = e[1] = Math.min(e[0], e[1]);
}
function Zn(e, t, n, r, i) {
  if (typeof e == "string") {
    let o = e.split(" ").map((a) => a.trim()), s = !o[1] && !o[0].endsWith("%");
    return o[1] = o[1] || o[0], [s, [Math.min(X(o[0], r, t, i, true), t), Math.min(X(o[1], r, n, i, true), n)]];
  }
  return typeof e == "number" ? [true, [Math.min(e, t), Math.min(e, n)]] : [true, void 0];
}
var ei = (e) => e && e[0] !== 0 && e[1] !== 0;
function ou({ id: e, borderRadiusPath: t, borderType: n, left: r, top: i, width: o, height: s }, a) {
  let u2 = `satori_brc-${e}`;
  return [M("clipPath", { id: u2 }, M(n, { x: r, y: i, width: o, height: s, d: t || void 0 })), u2];
}
function jt({ left: e, top: t, width: n, height: r }, i, o) {
  let { borderTopLeftRadius: s, borderTopRightRadius: a, borderBottomLeftRadius: u2, borderBottomRightRadius: f, fontSize: l2 } = i, p, h2, m2, b;
  if ([p, s] = Zn(s, n, r, l2, i), [h2, a] = Zn(a, n, r, l2, i), [m2, u2] = Zn(u2, n, r, l2, i), [b, f] = Zn(f, n, r, l2, i), !o && !ei(s) && !ei(a) && !ei(u2) && !ei(f))
    return "";
  s ||= [0, 0], a ||= [0, 0], u2 ||= [0, 0], f ||= [0, 0], [s[0], a[0]] = Kn(s[0], a[0], n), [u2[0], f[0]] = Kn(u2[0], f[0], n), [s[1], u2[1]] = Kn(s[1], u2[1], r), [a[1], f[1]] = Kn(a[1], f[1], r), p && Jn(s), h2 && Jn(a), m2 && Jn(u2), b && Jn(f);
  let y = [];
  y[0] = [a, a], y[1] = [f, [-f[0], f[1]]], y[2] = [u2, [-u2[0], -u2[1]]], y[3] = [s, [s[0], -s[1]]];
  let T = `h${n - s[0] - a[0]} a${y[0][0]} 0 0 1 ${y[0][1]}`, k = `v${r - a[1] - f[1]} a${y[1][0]} 0 0 1 ${y[1][1]}`, P2 = `h${f[0] + u2[0] - n} a${y[2][0]} 0 0 1 ${y[2][1]}`, w2 = `v${u2[1] + s[1] - r} a${y[3][0]} 0 0 1 ${y[3][1]}`;
  if (o) {
    let O = function(me) {
      let ue = Fd([s, a, f, u2][me]);
      return me === 0 ? [[e + s[0] - ue, t + s[1] - ue], [e + s[0], t]] : me === 1 ? [[e + n - a[0] + ue, t + a[1] - ue], [e + n, t + a[1]]] : me === 2 ? [[e + n - f[0] + ue, t + r - f[1] + ue], [e + n - f[0], t + r]] : [[e + u2[0] - ue, t + r - u2[1] + ue], [e, t + r - u2[1]]];
    }, S2 = o.indexOf(false);
    if (!o.includes(true))
      throw new Error("Invalid `partialSides`.");
    if (S2 === -1)
      S2 = 0;
    else
      for (; !o[S2]; )
        S2 = (S2 + 1) % 4;
    let I = "", F = O(S2), q = `M${F[0]} A${y[(S2 + 3) % 4][0]} 0 0 1 ${F[1]}`, V = 0;
    for (; V < 4 && o[(S2 + V) % 4]; V++)
      I += q + " ", q = [T, k, P2, w2][(S2 + V) % 4];
    let de = (S2 + V) % 4;
    I += q.split(" ")[0];
    let Ae = O(de);
    return I += ` A${y[(de + 3) % 4][0]} 0 0 1 ${Ae[0]}`, I;
  }
  return `M${e + s[0]},${t} ${T} ${k} ${P2} ${w2}`;
}
function su(e, t, n) {
  return n[e + "Width"] === n[t + "Width"] && n[e + "Style"] === n[t + "Style"] && n[e + "Color"] === n[t + "Color"];
}
function au({ id: e, currentClipPathId: t, borderPath: n, borderType: r, left: i, top: o, width: s, height: a }, u2) {
  if (!(u2.borderTopWidth || u2.borderRightWidth || u2.borderBottomWidth || u2.borderLeftWidth))
    return null;
  let l2 = `satori_bc-${e}`;
  return [M("clipPath", { id: l2, "clip-path": t ? `url(#${t})` : void 0 }, M(r, { x: i, y: o, width: s, height: a, d: n || void 0 })), l2];
}
function Ur({ left: e, top: t, width: n, height: r, props: i, asContentMask: o, maskBorderOnly: s }, a) {
  let u2 = ["borderTop", "borderRight", "borderBottom", "borderLeft"];
  if (!o && !u2.some((m2) => a[m2 + "Width"]))
    return "";
  let f = "", l2 = 0;
  for (; l2 > 0 && su(u2[l2], u2[(l2 + 3) % 4], a); )
    l2 = (l2 + 3) % 4;
  let p = [false, false, false, false], h2 = [];
  for (let m2 = 0; m2 < 4; m2++) {
    let b = (l2 + m2) % 4, y = (l2 + m2 + 1) % 4, T = u2[b], k = u2[y];
    if (p[b] = true, h2 = [a[T + "Width"], a[T + "Style"], a[T + "Color"], T], !su(T, k, a)) {
      let P2 = (h2[0] || 0) + (o && !s && a[T.replace("border", "padding")] || 0);
      P2 && (f += M("path", { width: n, height: r, ...i, fill: "none", stroke: o ? "#000" : h2[2], "stroke-width": P2 * 2, "stroke-dasharray": !o && h2[1] === "dashed" ? P2 * 2 + " " + P2 : void 0, d: jt({ left: e, top: t, width: n, height: r }, a, p) })), p = [false, false, false, false];
    }
  }
  if (p.some(Boolean)) {
    let m2 = (h2[0] || 0) + (o && !s && a[h2[3].replace("border", "padding")] || 0);
    m2 && (f += M("path", { width: n, height: r, ...i, fill: "none", stroke: o ? "#000" : h2[2], "stroke-width": m2 * 2, "stroke-dasharray": !o && h2[1] === "dashed" ? m2 * 2 + " " + m2 : void 0, d: jt({ left: e, top: t, width: n, height: r }, a, p) }));
  }
  return f;
}
function to({ id: e, left: t, top: n, width: r, height: i, matrix: o, borderOnly: s }, a) {
  let u2 = (a.borderLeftWidth || 0) + (s ? 0 : a.paddingLeft || 0), f = (a.borderTopWidth || 0) + (s ? 0 : a.paddingTop || 0), l2 = (a.borderRightWidth || 0) + (s ? 0 : a.paddingRight || 0), p = (a.borderBottomWidth || 0) + (s ? 0 : a.paddingBottom || 0), h2 = { x: t + u2, y: n + f, width: r - u2 - l2, height: i - f - p };
  return M("mask", { id: e }, M("rect", { ...h2, fill: "#fff", transform: a.overflow === "hidden" && a.transform && o ? o : void 0, mask: a._inheritedMaskId ? `url(#${a._inheritedMaskId})` : void 0 }) + Ur({ left: t, top: n, width: r, height: i, props: { transform: o || void 0 }, asContentMask: true, maskBorderOnly: s }, a));
}
var Gr = { circle: /circle\((.+)\)/, ellipse: /ellipse\((.+)\)/, path: /path\((.+)\)/, polygon: /polygon\((.+)\)/, inset: /inset\((.+)\)/ };
function cu({ width: e, height: t }, n, r) {
  function i(f) {
    let l2 = f.match(Gr.circle);
    if (!l2)
      return null;
    let [, p] = l2, [h2, m2 = ""] = p.split("at").map((T) => T.trim()), { x: b, y } = fu(m2, e, t);
    return { type: "circle", r: X(h2, r.fontSize, Math.sqrt(Math.pow(e, 2) + Math.pow(t, 2)) / Math.sqrt(2), r, true), cx: X(b, r.fontSize, e, r, true), cy: X(y, r.fontSize, t, r, true) };
  }
  function o(f) {
    let l2 = f.match(Gr.ellipse);
    if (!l2)
      return null;
    let [, p] = l2, [h2, m2 = ""] = p.split("at").map((P2) => P2.trim()), [b, y] = h2.split(" "), { x: T, y: k } = fu(m2, e, t);
    return { type: "ellipse", rx: X(b || "50%", r.fontSize, e, r, true), ry: X(y || "50%", r.fontSize, t, r, true), cx: X(T, r.fontSize, e, r, true), cy: X(k, r.fontSize, t, r, true) };
  }
  function s(f) {
    let l2 = f.match(Gr.path);
    if (!l2)
      return null;
    let [p, h2] = lu(l2[1]);
    return { type: "path", d: h2, "fill-rule": p };
  }
  function a(f) {
    let l2 = f.match(Gr.polygon);
    if (!l2)
      return null;
    let [p, h2] = lu(l2[1]);
    return { type: "polygon", "fill-rule": p, points: h2.split(",").map((m2) => m2.split(" ").map((b, y) => X(b, r.fontSize, y === 0 ? e : t, r, true)).join(" ")).join(",") };
  }
  function u2(f) {
    let l2 = f.match(Gr.inset);
    if (!l2)
      return null;
    let [p, h2] = (l2[1].includes("round") ? l2[1] : `${l2[1].trim()} round 0`).split("round"), m2 = (0, import_css_to_react_native3.getStylesForProperty)("borderRadius", h2, true), b = Object.values(m2).map((S2) => String(S2)).map((S2, O) => X(S2, r.fontSize, O === 0 || O === 2 ? t : e, r, true) || 0), y = Object.values((0, import_css_to_react_native3.getStylesForProperty)("margin", p, true)).map((S2) => String(S2)).map((S2, O) => X(S2, r.fontSize, O === 0 || O === 2 ? t : e, r, true) || 0), T = y[3], k = y[0], P2 = e - (y[1] + y[3]), w2 = t - (y[0] + y[2]);
    return b.some((S2) => S2 > 0) ? { type: "path", d: jt({ left: T, top: k, width: P2, height: w2 }, { ...n, ...m2 }) } : { type: "rect", x: T, y: k, width: P2, height: w2 };
  }
  return { parseCircle: i, parseEllipse: o, parsePath: s, parsePolygon: a, parseInset: u2 };
}
function lu(e) {
  let [, t = "nonzero", n] = e.replace(/('|")/g, "").match(/^(nonzero|evenodd)?,?(.+)/) || [];
  return [t, n];
}
function fu(e, t, n) {
  let r = e.split(" "), i = { x: r[0] || "50%", y: r[1] || "50%" };
  return r.forEach((o) => {
    o === "top" ? i.y = 0 : o === "bottom" ? i.y = n : o === "left" ? i.x = 0 : o === "right" ? i.x = t : o === "center" && (i.x = t / 2, i.y = n / 2);
  }), i;
}
function ti(e) {
  return `satori_cp-${e}`;
}
function du(e) {
  return `url(#${ti(e)})`;
}
function pu(e, t, n) {
  if (t.clipPath === "none")
    return "";
  let r = cu(e, t, n), i = t.clipPath, o = { type: "" };
  for (let s of Object.keys(r))
    if (o = r[s](i), o)
      break;
  if (o) {
    let { type: s, ...a } = o;
    return M("clipPath", { id: ti(e.id), "clip-path": e.currentClipPath, transform: `translate(${e.left}, ${e.top})` }, M(s, a));
  }
  return "";
}
function ro({ left: e, top: t, width: n, height: r, path: i, matrix: o, id: s, currentClipPath: a, src: u2 }, f, l2) {
  let p = "", h2 = f.clipPath && f.clipPath !== "none" ? pu({ left: e, top: t, width: n, height: r, path: i, id: s, matrix: o, currentClipPath: a, src: u2 }, f, l2) : "";
  if (f.overflow !== "hidden" && !u2)
    p = "";
  else {
    let b = h2 ? `satori_ocp-${s}` : ti(s);
    p = M("clipPath", { id: b, "clip-path": a }, M(i ? "path" : "rect", { x: e, y: t, width: n, height: r, d: i || void 0, transform: f.overflow === "hidden" && f.transform && o ? o : void 0 }));
  }
  let m2 = to({ id: `satori_om-${s}`, left: e, top: t, width: n, height: r, matrix: o, borderOnly: !u2 }, f);
  return h2 + p + m2;
}
var Dd = (e) => `satori_mi-${e}`;
async function no(e, t, n) {
  if (!t.maskImage)
    return ["", ""];
  let { left: r, top: i, width: o, height: s, id: a } = e, u2 = t.maskImage, f = u2.length;
  if (!f)
    return ["", ""];
  let l2 = Dd(a), p = "";
  for (let h2 = 0; h2 < f; h2++) {
    let m2 = u2[h2], [b, y] = await qr({ id: `${l2}-${h2}`, left: r, top: i, width: o, height: s }, m2, n, "mask");
    p += y + M("rect", { x: r, y: i, width: o, height: s, fill: `url(#${b})` });
  }
  return p = M("mask", { id: l2 }, p), [l2, p];
}
function Bd(e, t, n) {
  let r = e.toLowerCase().trim().split(/\s+/), i = (u2, f) => ({ left: "0%", center: "50%", right: "100%", top: "0%", bottom: "100%" })[u2] || u2, o, s;
  if (r.length === 1) {
    let u2 = r[0];
    u2 === "left" || u2 === "center" || u2 === "right" ? (o = i(u2, "x"), s = "50%") : u2 === "top" || u2 === "bottom" ? (o = "50%", s = i(u2, "y")) : (o = u2, s = "50%");
  } else {
    let u2 = r[0], f = r[1];
    u2 === "top" || u2 === "bottom" ? (s = i(u2, "y"), f === "left" || f === "right" || f === "center" ? o = i(f, "x") : (o = "50%", s = u2 === "top" || u2 === "bottom" ? i(u2, "y") : f)) : (o = i(u2, "x"), s = i(f, "y"));
  }
  let a = (u2, f) => {
    try {
      if (u2.endsWith("%"))
        return f * parseFloat(u2) / 100;
      let l2 = new xt(u2);
      return l2.type === "length" || l2.type === "number" ? l2.value : 0;
    } catch {
      return 0;
    }
  };
  return [a(o, t), a(s, n)];
}
async function zr({ id: e, left: t, top: n, width: r, height: i, isInheritingTransform: o, src: s, debug: a }, u2, f) {
  if (u2.display === "none")
    return "";
  let l2 = !!s, p = "rect", h2 = "", m2 = "", b = [], y = 1, T = "";
  u2.backgroundColor && b.push(u2.backgroundColor), u2.opacity !== void 0 && (y = +u2.opacity), u2.transform && (h2 = $r({ left: t, top: n, width: r, height: i }, u2.transform, o, u2.transformOrigin));
  let k = "";
  if (u2.backgroundImage) {
    let Z = [];
    for (let ne = 0; ne < u2.backgroundImage.length; ne++) {
      let ke = u2.backgroundImage[ne], ve = await qr({ id: e + "_" + ne, width: r, height: i, left: t, top: n }, ke, f);
      ve && Z.unshift(ve);
    }
    for (let ne of Z)
      b.push(`url(#${ne[0]})`), m2 += ne[1], ne[2] && (k += ne[2]);
  }
  let [P2, w2] = await no({ id: e, left: t, top: n, width: r, height: i }, u2, f);
  m2 += w2;
  let S2 = P2 ? `url(#${P2})` : u2._inheritedMaskId ? `url(#${u2._inheritedMaskId})` : void 0, O = jt({ left: t, top: n, width: r, height: i }, u2);
  O && (p = "path");
  let I = u2._inheritedClipPathId;
  a && (T = M("rect", { x: t, y: n, width: r, height: i, fill: "transparent", stroke: "#ff5757", "stroke-width": 1, transform: h2 || void 0, "clip-path": I ? `url(#${I})` : void 0 }));
  let { backgroundClip: F, filter: q } = u2, V = F === "text" ? `url(#satori_bct-${e})` : I ? `url(#${I})` : u2.clipPath ? du(e) : void 0, de = ro({ left: t, top: n, width: r, height: i, path: O, id: e, matrix: h2, currentClipPath: V, src: s }, u2, f), Ae = b.map((Z) => M(p, { x: t, y: n, width: r, height: i, fill: Z, d: O || void 0, transform: h2 || void 0, "clip-path": u2.transform ? void 0 : V, style: q ? `filter:${q}` : void 0, mask: u2.transform ? void 0 : S2 })).join(""), me = au({ id: e, left: t, top: n, width: r, height: i, currentClipPathId: I, borderPath: O, borderType: p }, u2), ue;
  if (l2) {
    let Z = (u2.borderLeftWidth || 0) + (u2.paddingLeft || 0), ne = (u2.borderTopWidth || 0) + (u2.paddingTop || 0), ke = (u2.borderRightWidth || 0) + (u2.paddingRight || 0), ve = (u2.borderBottomWidth || 0) + (u2.paddingBottom || 0), Re = r - Z - ke, Ee = i - ne - ve, Ye = (u2.objectPosition || "center").toString(), [Me, Oe] = Bd(Ye, Re, Ee), le = u2.__naturalWidth || Re, H = u2.__naturalHeight || Ee, J, pe = Re, G = Ee, Le = t + Z, De = n + ne;
    if (u2.objectFit === "contain") {
      let Ue = Re / le, $e = Ee / H, ie = Math.min(Ue, $e);
      pe = le * ie, G = H * ie, Le = t + Z + Me - pe * Me / Re, De = n + ne + Oe - G * Oe / Ee, J = "none";
    } else if (u2.objectFit === "cover") {
      let Ue = Re / le, $e = Ee / H, ie = Math.max(Ue, $e);
      pe = le * ie, G = H * ie, Le = t + Z + Me - pe * Me / Re, De = n + ne + Oe - G * Oe / Ee, J = "none";
    } else if (u2.objectFit === "fill")
      J = "none";
    else if (u2.objectFit === "scale-down")
      if (le && H) {
        let Ue = Re / le, $e = Ee / H, ie = Math.min(Ue, $e);
        if (ie >= 1)
          pe = le, G = H, J = "none", Le = t + Z + Me - pe * Me / Re, De = n + ne + Oe - G * Oe / Ee;
        else {
          let _t = ie;
          pe = le * _t, G = H * _t, Le = t + Z + Me - pe * Me / Re, De = n + ne + Oe - G * Oe / Ee, J = "none";
        }
      } else {
        let Ue = Re / le, $e = Ee / H, ie = Math.min(Ue, $e);
        pe = le * ie, G = H * ie, Le = t + Z + Me - pe * Me / Re, De = n + ne + Oe - G * Oe / Ee, J = "none";
      }
    else
      J = "none";
    u2.transform && (ue = ou({ id: e, borderRadiusPath: O, borderType: p, left: t, top: n, width: r, height: i }, u2)), Ae += M("image", { x: Le, y: De, width: pe, height: G, href: s, preserveAspectRatio: J, transform: h2 || void 0, style: q ? `filter:${q}` : void 0, "clip-path": u2.transform ? ue ? `url(#${ue[1]})` : void 0 : `url(#satori_cp-${e})`, mask: u2.transform ? void 0 : P2 ? `url(#${P2})` : `url(#satori_om-${e})` });
  }
  if (me) {
    m2 += me[0];
    let Z = me[1];
    Ae += Ur({ left: t, top: n, width: r, height: i, props: { transform: h2 || void 0, "clip-path": `url(#${Z})` } }, u2);
  }
  let Ie = Xa({ width: r, height: i, id: e, opacity: y, shape: M(p, { x: t, y: n, width: r, height: i, fill: "#fff", stroke: "#fff", "stroke-width": 0, d: O || void 0, transform: h2 || void 0, "clip-path": V, mask: S2 }) }, u2);
  return (m2 ? M("defs", {}, m2) : "") + (Ie ? Ie[0] : "") + (ue ? ue[0] : "") + de + (y !== 1 ? `<g opacity="${y}">` : "") + (u2.transform && (V || S2) ? `<g${V ? ` clip-path="${V}"` : ""}${S2 ? ` mask="${S2}"` : ""}>` : "") + (k || Ae) + (u2.transform && (V || S2) ? "</g>" : "") + (y !== 1 ? "</g>" : "") + (Ie ? Ie[1] : "") + T;
}
var mu = String.raw;
var hu = mu`\p{Emoji}(?:\p{EMod}|[\u{E0020}-\u{E007E}]+\u{E007F}|\uFE0F?\u20E3?)`;
var gu = () => new RegExp(mu`\p{RI}{2}|(?![#*\d](?!\uFE0F?\u20E3))${hu}(?:\u200D${hu})*`, "gu");
var $d = new RegExp(gu(), "u");
var io = { emoji: $d, symbol: /\p{Symbol}/u, math: /\p{Math}/u };
var oo = { "ja-JP": /\p{scx=Hira}|\p{scx=Kana}|\p{scx=Han}|[\u3000]|[\uFF00-\uFFEF]/u, "ko-KR": /\p{scx=Hangul}/u, "zh-CN": /\p{scx=Han}/u, "zh-TW": /\p{scx=Han}/u, "zh-HK": /\p{scx=Han}/u, "th-TH": /\p{scx=Thai}/u, "bn-IN": /\p{scx=Bengali}/u, "ar-AR": /\p{scx=Arabic}/u, "ta-IN": /\p{scx=Tamil}/u, "ml-IN": /\p{scx=Malayalam}/u, "he-IL": /\p{scx=Hebrew}/u, "te-IN": /\p{scx=Telugu}/u, devanagari: /\p{scx=Devanagari}/u, kannada: /\p{scx=Kannada}/u };
var ri = Object.keys({ ...oo, ...io });
function bu(e) {
  return ri.includes(e);
}
function vu(e, t) {
  for (let r of Object.keys(io))
    if (io[r].test(e))
      return [r];
  let n = Object.keys(oo).filter((r) => oo[r].test(e));
  if (n.length === 0)
    return ["unknown"];
  if (t) {
    let r = n.findIndex((i) => i === t);
    r !== -1 && (n.splice(r, 1), n.unshift(t));
  }
  return n;
}
function yu(e) {
  if (e)
    return ri.find((t) => t.toLowerCase().startsWith(e.toLowerCase()));
}
async function* jr(e, t) {
  var le;
  let n = await Gt(), { id: r, inheritedStyle: i, parent: o, font: s, debug: a, locale: u2, embedFont: f = true, graphemeImages: l2, canLoadAdditionalAssets: p, getTwStyles: h2 } = t;
  if (e === null || typeof e > "u")
    return yield, yield, "";
  if (!mr(e) || la(e.type)) {
    let H;
    if (!mr(e))
      H = Ji(String(e), t), yield (await H.next()).value;
    else {
      if (ua(e.type))
        throw new Error("Class component is not supported.");
      let pe;
      Pi(e.type) ? pe = e.type.render : pe = e.type, H = jr(await pe(e.props), t), yield (await H.next()).value;
    }
    await H.next();
    let J = yield;
    return (await H.next(J)).value;
  }
  let { type: m2, props: b } = e, y = m2;
  if (b && fa(b))
    throw new Error("dangerouslySetInnerHTML property is not supported. See documentation for more information https://github.com/vercel/satori#jsx.");
  let { style: T, children: k, tw: P2, lang: w2 = u2 } = b || {}, S2 = yu(w2);
  if (P2) {
    let H = h2(P2, T);
    T = Object.assign(H, T);
  }
  let O = n.Node.create();
  o.insertChild(O, o.getChildCount());
  let [I, F] = await Vi(O, y, i, T, b), q = I.transform === i.transform;
  if (q || (I.transform.__parent = i.transform), (I.overflow === "hidden" || I.clipPath && I.clipPath !== "none") && (F._inheritedClipPathId = `satori_cp-${r}`, F._inheritedMaskId = `satori_om-${r}`), I.maskImage && (F._inheritedMaskId = `satori_mi-${r}`), I.backgroundClip === "text") {
    let H = { value: "" };
    F._inheritedBackgroundClipTextPath = H, I._inheritedBackgroundClipTextPath = H, I.backgroundImage && (F._inheritedBackgroundClipTextHasBackground = "true", I._inheritedBackgroundClipTextHasBackground = "true");
  }
  let V = ca(k), de = [], Ae = 0, me = [];
  for (let H of V) {
    let J = jr(H, { id: r + "-" + Ae++, parentStyle: I, inheritedStyle: F, isInheritingTransform: true, parent: O, font: s, embedFont: f, debug: a, graphemeImages: l2, canLoadAdditionalAssets: p, locale: S2, getTwStyles: h2, onNodeDetected: t.onNodeDetected });
    p ? me.push(...(await J.next()).value || []) : await J.next(), de.push(J);
  }
  yield me;
  for (let H of de)
    await H.next();
  let [ue, Ie] = yield, { left: Z, top: ne, width: ke, height: ve } = O.getComputedLayout();
  Z += ue, ne += Ie;
  let Re = "", Ee = "", Ye = "", { children: Me, ...Oe } = b;
  if ((le = t.onNodeDetected) == null || le.call(t, { left: Z, top: ne, width: ke, height: ve, type: y, props: Oe, key: e.key, textContent: mr(Me) ? void 0 : Me }), y === "img") {
    let H = I.__src;
    Ee = await zr({ id: r, left: Z, top: ne, width: ke, height: ve, src: H, isInheritingTransform: q, debug: a }, I, F);
  } else if (y === "svg") {
    let H = I.color, J = await Na(e, H);
    Ee = await zr({ id: r, left: Z, top: ne, width: ke, height: ve, src: J, isInheritingTransform: q, debug: a }, I, F);
  } else {
    let H = T == null ? void 0 : T.display;
    if (y === "div" && k && typeof k != "string" && H !== "flex" && H !== "none" && H !== "contents")
      throw new Error('Expected <div> to have explicit "display: flex", "display: contents", or "display: none" if it has more than one child node.');
    Ee = await zr({ id: r, left: Z, top: ne, width: ke, height: ve, isInheritingTransform: q, debug: a }, I, F);
  }
  for (let H of de)
    Re += (await H.next([Z, ne])).value;
  return I._inheritedBackgroundClipTextPath && (Ye += M("clipPath", { id: `satori_bct-${r}`, "clip-path": I._inheritedClipPathId ? `url(#${I._inheritedClipPathId})` : void 0 }, I._inheritedBackgroundClipTextPath.value)), Ye + Ee + Re;
}
var xu = "unknown";
function qd(e) {
  let t = [], n = [0, 0], r = [0, 0], i = (o, s) => {
    let a = o[0];
    for (let u2 = 1; u2 <= s; u2++) {
      let f = u2 / s, l2 = Ud(o, f);
      t.push({ from: a, to: l2 }), a = l2;
    }
    r = o[o.length - 1];
  };
  for (let o of e) {
    if (o.type === "M") {
      n = r = [o.x, o.y];
      continue;
    }
    if (o.type === "L") {
      let s = [o.x, o.y];
      t.push({ from: r, to: s }), r = s;
      continue;
    }
    if (o.type === "Q") {
      i([r, [o.x1, o.y1], [o.x, o.y]], 12);
      continue;
    }
    if (o.type === "C") {
      i([r, [o.x1, o.y1], [o.x2, o.y2], [o.x, o.y]], 16);
      continue;
    }
    o.type === "Z" && (t.push({ from: r, to: n }), r = n);
  }
  return t;
}
function Ud(e, t) {
  let n = e;
  for (; n.length > 1; ) {
    let r = [];
    for (let i = 0; i < n.length - 1; i++)
      r.push([n[i][0] + (n[i + 1][0] - n[i][0]) * t, n[i][1] + (n[i + 1][1] - n[i][1]) * t]);
    n = r;
  }
  return n[0];
}
function Gd(e, t) {
  if (!t)
    return [];
  let n = t.strokeWidth, r = t.underlineY - n * 0.25, i = t.underlineY + n * 2.5, o = qd(e);
  if (!o.length)
    return [];
  let s = i - r, a = Math.max(12, Math.ceil(s / 0.25)), u2 = s / a, f = r + u2 / 2, l2 = /* @__PURE__ */ new Set();
  for (let w2 = 0; w2 < a; w2++) {
    let S2 = f + u2 * w2, O = [];
    for (let I of o) {
      let [F, q] = I.from, [V, de] = I.to;
      if (q === de)
        continue;
      let Ae = Math.min(q, de), me = Math.max(q, de);
      if (S2 < Ae || S2 >= me)
        continue;
      let ue = (S2 - q) / (de - q), Ie = F + (V - F) * ue;
      O.push(Ie);
    }
    if (O.length) {
      O.sort((I, F) => I - F);
      for (let I = 0; I < O.length - 1; I += 2) {
        let F = Math.min(O[I], O[I + 1]), q = Math.max(O[I], O[I + 1]), V = Math.floor(F), de = Math.ceil(q);
        for (let Ae = V; Ae < de; Ae++)
          l2.add(Ae);
      }
    }
  }
  if (!l2.size)
    return [];
  let p = Array.from(l2.values()).sort((w2, S2) => w2 - S2), h2 = [], m2 = p[0], b = p[0];
  for (let w2 = 1; w2 < p.length; w2++) {
    let S2 = p[w2];
    S2 > b + 1 && (h2.push([m2, b + 1]), m2 = S2), b = S2;
  }
  h2.push([m2, b + 1]);
  let y = [], T = n * 0.6, k = h2[0][0], P2 = h2[h2.length - 1][1];
  for (let [w2, S2] of h2) {
    let O = Math.min(w2, k) - T, I = Math.max(S2, P2) + T;
    y.push({ x1: O, x2: I, y1: r, y2: i });
  }
  return y;
}
function zd(e, t, [n, r], [i, o]) {
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
var so = /* @__PURE__ */ new WeakMap();
var Hr = class {
  constructor(t) {
    this.fonts = /* @__PURE__ */ new Map();
    this.addFonts(t);
  }
  get({ name: t, weight: n, style: r }) {
    if (!this.fonts.has(t))
      return null;
    n === "normal" && (n = 400), n === "bold" && (n = 700), typeof n == "string" && (n = Number.parseInt(n, 10));
    let i = [...this.fonts.get(t)], o = i[0];
    for (let s = 1; s < i.length; s++) {
      let [, a, u2] = o, [, f, l2] = i[s];
      zd(n, r, [a, u2], [f, l2]) > 0 && (o = i[s]);
    }
    return o[0];
  }
  addFonts(t) {
    for (let n of t) {
      let { name: r, data: i, lang: o } = n;
      if (o && !bu(o))
        throw new Error(`Invalid value for props \`lang\`: "${o}". The value must be one of the following: ${ri.join(", ")}.`);
      let s = o ?? xu, a;
      if (so.has(i))
        a = so.get(i);
      else {
        a = opentype_module_default.parse("buffer" in i ? i.buffer.slice(i.byteOffset, i.byteOffset + i.byteLength) : i, { lowMemory: true });
        let f = a.charToGlyphIndex;
        a.charToGlyphIndex = (l2) => {
          let p = f.call(a, l2);
          return p === 0 && a._trackBrokenChars && a._trackBrokenChars.push(l2), p;
        }, so.set(i, a);
      }
      this.defaultFont || (this.defaultFont = a);
      let u2 = `${r.toLowerCase()}_${s}`;
      this.fonts.has(u2) || this.fonts.set(u2, []), this.fonts.get(u2).push([a, n.weight, n.style]);
    }
  }
  getEngine(t = 16, n = "normal", { fontFamily: r = "sans-serif", fontWeight: i = 400, fontStyle: o = "normal" }, s) {
    if (!this.fonts.size)
      throw new Error("No fonts are loaded. At least one font is required to calculate the layout.");
    r = (Array.isArray(r) ? r : [r]).map((w2) => w2.toLowerCase());
    let a = [];
    r.forEach((w2) => {
      let S2 = this.get({ name: w2, weight: i, style: o });
      if (S2) {
        a.push(S2);
        return;
      }
      let O = this.get({ name: w2 + "_unknown", weight: i, style: o });
      if (O) {
        a.push(O);
        return;
      }
    });
    let u2 = Array.from(this.fonts.keys()), f = [], l2 = [], p = [];
    for (let w2 of u2)
      if (!r.includes(w2))
        if (s) {
          let S2 = jd(w2);
          S2 ? S2 === s ? f.push(this.get({ name: w2, weight: i, style: o })) : l2.push(this.get({ name: w2, weight: i, style: o })) : p.push(this.get({ name: w2, weight: i, style: o }));
        } else
          p.push(this.get({ name: w2, weight: i, style: o }));
    let h2 = /* @__PURE__ */ new Map(), m2 = (w2, S2 = true) => {
      let O = [...a, ...p, ...f, ...S2 ? l2 : []];
      if (typeof w2 > "u")
        return S2 ? O[O.length - 1] : void 0;
      let I = w2.charCodeAt(0);
      if (h2.has(I))
        return h2.get(I);
      let F = O.find((q, V) => !!q.charToGlyphIndex(w2) || S2 && V === O.length - 1);
      return F && h2.set(I, F), F;
    }, b = (w2, S2 = false) => {
      var I, F;
      return ((S2 ? (F = (I = w2.tables) == null ? void 0 : I.os2) == null ? void 0 : F.sTypoAscender : 0) || w2.ascender) / w2.unitsPerEm * t;
    }, y = (w2, S2 = false) => {
      var I, F;
      return ((S2 ? (F = (I = w2.tables) == null ? void 0 : I.os2) == null ? void 0 : F.sTypoDescender : 0) || w2.descender) / w2.unitsPerEm * t;
    }, T = (w2, S2 = false) => {
      var O, I;
      if (typeof n == "string" && n === "normal") {
        let F = (S2 ? (I = (O = w2.tables) == null ? void 0 : O.os2) == null ? void 0 : I.sTypoLineGap : 0) || 0;
        return b(w2, S2) - y(w2, S2) + F / w2.unitsPerEm * t;
      } else if (typeof n == "number")
        return t * n;
    }, k = (w2) => m2(w2, false);
    return { has: (w2) => {
      if (w2 === `
`)
        return true;
      let S2 = k(w2);
      return S2 ? (S2._trackBrokenChars = [], S2.stringToGlyphs(w2), S2._trackBrokenChars.length ? (S2._trackBrokenChars = void 0, false) : true) : false;
    }, baseline: (w2, S2 = typeof w2 > "u" ? a[0] : m2(w2)) => {
      let O = b(S2), I = y(S2), F = O - I;
      return O + (T(S2) - F) / 2;
    }, height: (w2, S2 = typeof w2 > "u" ? a[0] : m2(w2)) => T(S2), measure: (w2, S2) => this.measure(m2, w2, S2), getSVG: (w2, S2, O) => this.getSVG(m2, w2, S2, O) };
  }
  patchFontFallbackResolver(t, n) {
    let r = [];
    t._trackBrokenChars = r;
    let i = t.stringToGlyphs;
    return t.stringToGlyphs = (o, ...s) => {
      let a = i.call(t, o, ...s);
      for (let u2 = 0; u2 < a.length; u2++)
        if (a[u2].unicode === void 0) {
          let f = r.shift(), l2 = n(f);
          if (l2 !== t) {
            let p = l2.charToGlyph(f), h2 = t.unitsPerEm / l2.unitsPerEm, m2 = new opentype_module_default.Path();
            m2.unitsPerEm = t.unitsPerEm, m2.commands = p.path.commands.map((y) => {
              let T = { ...y };
              for (let k in T)
                typeof T[k] == "number" && (T[k] *= h2);
              return T;
            });
            let b = new opentype_module_default.Glyph({ ...p, advanceWidth: p.advanceWidth * h2, xMin: p.xMin * h2, xMax: p.xMax * h2, yMin: p.yMin * h2, yMax: p.yMax * h2, path: m2 });
            a[u2] = b;
          }
        }
      return a;
    }, () => {
      t.stringToGlyphs = i, t._trackBrokenChars = void 0;
    };
  }
  measure(t, n, { fontSize: r, letterSpacing: i = 0 }) {
    let o = t(n), s = this.patchFontFallbackResolver(o, t);
    try {
      return o.getAdvanceWidth(n, r, { letterSpacing: i / r });
    } finally {
      s();
    }
  }
  getSVG(t, n, { fontSize: r, top: i, left: o, letterSpacing: s = 0 }, a) {
    let u2 = t(n), f = this.patchFontFallbackResolver(u2, t);
    try {
      if (r === 0)
        return { path: "", boxes: [] };
      let l2 = new opentype_module_default.Path(), p = [], h2 = { letterSpacing: s / r }, m2 = /* @__PURE__ */ new WeakMap();
      return u2.forEachGlyph(n.replace(/\n/g, ""), o, i, r, h2, function(b, y, T, k) {
        let P2;
        if (!m2.has(b))
          P2 = b.getPath(y, T, k, h2), m2.set(b, [y, T, P2]);
        else {
          let [S2, O, I] = m2.get(b);
          P2 = new opentype_module_default.Path(), P2.commands = I.commands.map((F) => {
            let q = { ...F };
            for (let V in q)
              typeof q[V] == "number" && ((V === "x" || V === "x1" || V === "x2") && (q[V] += y - S2), (V === "y" || V === "y1" || V === "y2") && (q[V] += T - O));
            return q;
          });
        }
        let w2 = a ? Gd(P2.commands, a) : [];
        w2.length && p.push(...w2), l2.extend(P2);
      }), { path: l2.toPathData(1), boxes: p };
    } finally {
      f();
    }
  }
};
function jd(e) {
  let t = e.split("_"), n = t[t.length - 1];
  return n === xu ? void 0 : n;
}
function ao({ width: e, height: t, content: n }) {
  return M("svg", { width: e, height: t, viewBox: `0 0 ${e} ${t}`, xmlns: "http://www.w3.org/2000/svg" }, n);
}
var ec2 = hc(Rf());
var Rb = ["ios", "android", "windows", "macos", "web"];
function Lf(e) {
  return Rb.includes(e);
}
var Cb = ["portrait", "landscape"];
function Mf(e) {
  return Cb.includes(e);
}
var Cf;
(function(e) {
  e.fontSize = "fontSize", e.lineHeight = "lineHeight";
})(Cf || (Cf = {}));
var se;
(function(e) {
  e.rem = "rem", e.em = "em", e.px = "px", e.percent = "%", e.vw = "vw", e.vh = "vh", e.none = "<no-css-unit>";
})(se || (se = {}));
function Ms(e) {
  return typeof e == "string";
}
function Ns(e) {
  return typeof e == "object";
}
var Ws;
function _(e) {
  return { kind: "complete", style: e };
}
function Fe(e, t = {}) {
  let { fractions: n } = t;
  if (n && e.includes("/")) {
    let [o = "", s = ""] = e.split("/", 2), a = Fe(o), u2 = Fe(s);
    return !a || !u2 ? null : [a[0] / u2[0], u2[1]];
  }
  let r = parseFloat(e);
  if (Number.isNaN(r))
    return null;
  let i = e.match(/(([a-z]{2,}|%))$/);
  if (!i)
    return [r, se.none];
  switch (i == null ? void 0 : i[1]) {
    case "rem":
      return [r, se.rem];
    case "px":
      return [r, se.px];
    case "em":
      return [r, se.em];
    case "%":
      return [r, se.percent];
    case "vw":
      return [r, se.vw];
    case "vh":
      return [r, se.vh];
    default:
      return null;
  }
}
function Bt(e, t, n = {}) {
  let r = At(t, n);
  return r === null ? null : _({ [e]: r });
}
function xi(e, t, n) {
  let r = At(t);
  return r !== null && (n[e] = r), n;
}
function Wf(e, t) {
  let n = At(t);
  return n === null ? null : { [e]: n };
}
function At(e, t = {}) {
  if (e === void 0)
    return null;
  let n = Fe(String(e), t);
  return n ? Xt(...n, t) : null;
}
function Xt(e, t, n = {}) {
  let { isNegative: r, device: i } = n;
  switch (t) {
    case se.rem:
      return e * 16 * (r ? -1 : 1);
    case se.px:
      return e * (r ? -1 : 1);
    case se.percent:
      return `${r ? "-" : ""}${e}%`;
    case se.none:
      return e * (r ? -1 : 1);
    case se.vw:
      return i != null && i.windowDimensions ? i.windowDimensions.width * (e / 100) : (Je("`vw` CSS unit requires configuration with `useDeviceContext()`"), null);
    case se.vh:
      return i != null && i.windowDimensions ? i.windowDimensions.height * (e / 100) : (Je("`vh` CSS unit requires configuration with `useDeviceContext()`"), null);
    default:
      return null;
  }
}
function Fs(e) {
  let t = Fe(e);
  if (!t)
    return null;
  let [n, r] = t;
  switch (r) {
    case se.rem:
      return n * 16;
    case se.px:
      return n;
    default:
      return null;
  }
}
var Lb = { t: "Top", tr: "TopRight", tl: "TopLeft", b: "Bottom", br: "BottomRight", bl: "BottomLeft", l: "Left", r: "Right", x: "Horizontal", y: "Vertical" };
function Ds(e) {
  return Lb[e ?? ""] || "All";
}
function Bs(e) {
  let t = "All";
  return [e.replace(/^-(t|b|r|l|tr|tl|br|bl)(-|$)/, (r, i) => (t = Ds(i), "")), t];
}
function ur(e, t = {}) {
  if (e.includes("/")) {
    let n = Nf(e, { ...t, fractions: true });
    if (n)
      return n;
  }
  return e[0] === "[" && (e = e.slice(1, -1)), Nf(e, t);
}
function dt(e, t, n = {}) {
  let r = ur(t, n);
  return r === null ? null : _({ [e]: r });
}
function Nf(e, t = {}) {
  if (e === "px")
    return 1;
  let n = Fe(e, t);
  if (!n)
    return null;
  let [r, i] = n;
  return t.fractions && (i = se.percent, r *= 100), i === se.none && (r = r / 4, i = se.rem), Xt(r, i, t);
}
function Mb(...e) {
  console.warn(...e);
}
function Nb(...e) {
}
var Je = typeof process > "u" || ((Ws = process == null ? void 0 : process.env) === null || Ws === void 0 ? void 0 : Ws.JEST_WORKER_ID) === void 0 ? Mb : Nb;
var Wb = [["aspect-square", _({ aspectRatio: 1 })], ["aspect-video", _({ aspectRatio: 16 / 9 })], ["items-center", _({ alignItems: "center" })], ["items-start", _({ alignItems: "flex-start" })], ["items-end", _({ alignItems: "flex-end" })], ["items-baseline", _({ alignItems: "baseline" })], ["items-stretch", _({ alignItems: "stretch" })], ["justify-start", _({ justifyContent: "flex-start" })], ["justify-end", _({ justifyContent: "flex-end" })], ["justify-center", _({ justifyContent: "center" })], ["justify-between", _({ justifyContent: "space-between" })], ["justify-around", _({ justifyContent: "space-around" })], ["justify-evenly", _({ justifyContent: "space-evenly" })], ["content-start", _({ alignContent: "flex-start" })], ["content-end", _({ alignContent: "flex-end" })], ["content-between", _({ alignContent: "space-between" })], ["content-around", _({ alignContent: "space-around" })], ["content-stretch", _({ alignContent: "stretch" })], ["content-center", _({ alignContent: "center" })], ["self-auto", _({ alignSelf: "auto" })], ["self-start", _({ alignSelf: "flex-start" })], ["self-end", _({ alignSelf: "flex-end" })], ["self-center", _({ alignSelf: "center" })], ["self-stretch", _({ alignSelf: "stretch" })], ["self-baseline", _({ alignSelf: "baseline" })], ["direction-inherit", _({ direction: "inherit" })], ["direction-ltr", _({ direction: "ltr" })], ["direction-rtl", _({ direction: "rtl" })], ["hidden", _({ display: "none" })], ["flex", _({ display: "flex" })], ["flex-row", _({ flexDirection: "row" })], ["flex-row-reverse", _({ flexDirection: "row-reverse" })], ["flex-col", _({ flexDirection: "column" })], ["flex-col-reverse", _({ flexDirection: "column-reverse" })], ["flex-wrap", _({ flexWrap: "wrap" })], ["flex-wrap-reverse", _({ flexWrap: "wrap-reverse" })], ["flex-nowrap", _({ flexWrap: "nowrap" })], ["flex-auto", _({ flexGrow: 1, flexShrink: 1, flexBasis: "auto" })], ["flex-initial", _({ flexGrow: 0, flexShrink: 1, flexBasis: "auto" })], ["flex-none", _({ flexGrow: 0, flexShrink: 0, flexBasis: "auto" })], ["overflow-hidden", _({ overflow: "hidden" })], ["overflow-visible", _({ overflow: "visible" })], ["overflow-scroll", _({ overflow: "scroll" })], ["absolute", _({ position: "absolute" })], ["relative", _({ position: "relative" })], ["italic", _({ fontStyle: "italic" })], ["not-italic", _({ fontStyle: "normal" })], ["oldstyle-nums", kn("oldstyle-nums")], ["small-caps", kn("small-caps")], ["lining-nums", kn("lining-nums")], ["tabular-nums", kn("tabular-nums")], ["proportional-nums", kn("proportional-nums")], ["font-thin", _({ fontWeight: "100" })], ["font-100", _({ fontWeight: "100" })], ["font-extralight", _({ fontWeight: "200" })], ["font-200", _({ fontWeight: "200" })], ["font-light", _({ fontWeight: "300" })], ["font-300", _({ fontWeight: "300" })], ["font-normal", _({ fontWeight: "normal" })], ["font-400", _({ fontWeight: "400" })], ["font-medium", _({ fontWeight: "500" })], ["font-500", _({ fontWeight: "500" })], ["font-semibold", _({ fontWeight: "600" })], ["font-600", _({ fontWeight: "600" })], ["font-bold", _({ fontWeight: "bold" })], ["font-700", _({ fontWeight: "700" })], ["font-extrabold", _({ fontWeight: "800" })], ["font-800", _({ fontWeight: "800" })], ["font-black", _({ fontWeight: "900" })], ["font-900", _({ fontWeight: "900" })], ["include-font-padding", _({ includeFontPadding: true })], ["remove-font-padding", _({ includeFontPadding: false })], ["max-w-none", _({ maxWidth: "99999%" })], ["text-left", _({ textAlign: "left" })], ["text-center", _({ textAlign: "center" })], ["text-right", _({ textAlign: "right" })], ["text-justify", _({ textAlign: "justify" })], ["text-auto", _({ textAlign: "auto" })], ["underline", _({ textDecorationLine: "underline" })], ["line-through", _({ textDecorationLine: "line-through" })], ["no-underline", _({ textDecorationLine: "none" })], ["uppercase", _({ textTransform: "uppercase" })], ["lowercase", _({ textTransform: "lowercase" })], ["capitalize", _({ textTransform: "capitalize" })], ["normal-case", _({ textTransform: "none" })], ["w-auto", _({ width: "auto" })], ["h-auto", _({ height: "auto" })], ["shadow-sm", _({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.025, elevation: 1 })], ["shadow", _({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.075, elevation: 2 })], ["shadow-md", _({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 3, shadowOpacity: 0.125, elevation: 3 })], ["shadow-lg", _({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 })], ["shadow-xl", _({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.19, shadowRadius: 20, elevation: 12 })], ["shadow-2xl", _({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 30, elevation: 16 })], ["shadow-none", _({ shadowOffset: { width: 0, height: 0 }, shadowColor: "#000", shadowRadius: 0, shadowOpacity: 0, elevation: 0 })]];
var $s = Wb;
function kn(e) {
  return { kind: "dependent", complete(t) {
    (!t.fontVariant || !Array.isArray(t.fontVariant)) && (t.fontVariant = []), t.fontVariant.push(e);
  } };
}
var En = class {
  constructor(t) {
    this.ir = new Map($s), this.styles = /* @__PURE__ */ new Map(), this.prefixes = /* @__PURE__ */ new Map(), this.ir = new Map([...$s, ...t ?? []]);
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
function qs(e, t, n = {}) {
  let r = t == null ? void 0 : t[e];
  if (!r)
    return dt("fontSize", e, n);
  if (typeof r == "string")
    return Bt("fontSize", r);
  let i = {}, [o, s] = r, a = Wf("fontSize", o);
  if (a && (i = a), typeof s == "string")
    return _(xi("lineHeight", Ff(s, i), i));
  let { lineHeight: u2, letterSpacing: f } = s;
  return u2 && xi("lineHeight", Ff(u2, i), i), f && xi("letterSpacing", f, i), _(i);
}
function Ff(e, t) {
  let n = Fe(e);
  if (n) {
    let [r, i] = n;
    if ((i === se.none || i === se.em) && typeof t.fontSize == "number")
      return t.fontSize * r;
  }
  return e;
}
function Us(e, t) {
  var n;
  let r = (n = t == null ? void 0 : t[e]) !== null && n !== void 0 ? n : e.startsWith("[") ? e.slice(1, -1) : e, i = Fe(r);
  if (!i)
    return null;
  let [o, s] = i;
  if (s === se.none)
    return { kind: "dependent", complete(u2) {
      if (typeof u2.fontSize != "number")
        return "relative line-height utilities require that font-size be set";
      u2.lineHeight = u2.fontSize * o;
    } };
  let a = Xt(o, s);
  return a !== null ? _({ lineHeight: a }) : null;
}
function Gs(e, t, n, r, i) {
  let o = "";
  if (r[0] === "[")
    o = r.slice(1, -1);
  else {
    let f = i == null ? void 0 : i[r];
    if (f)
      o = f;
    else {
      let l2 = ur(r);
      return l2 && typeof l2 == "number" ? Df(l2, se.px, t, e) : null;
    }
  }
  if (o === "auto")
    return Bf(t, e, "auto");
  let s = Fe(o);
  if (!s)
    return null;
  let [a, u2] = s;
  return n && (a = -a), Df(a, u2, t, e);
}
function Df(e, t, n, r) {
  let i = Xt(e, t);
  return i === null ? null : Bf(n, r, i);
}
function Bf(e, t, n) {
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
function zs(e) {
  if (!e)
    return {};
  let t = Object.entries(e).reduce((i, [o, s]) => {
    let a = [0, 1 / 0, 0], u2 = typeof s == "string" ? { min: s } : s, f = u2.min ? Fs(u2.min) : 0;
    f === null ? Je(`invalid screen config value: ${o}->min: ${u2.min}`) : a[0] = f;
    let l2 = u2.max ? Fs(u2.max) : 1 / 0;
    return l2 === null ? Je(`invalid screen config value: ${o}->max: ${u2.max}`) : a[1] = l2, i[o] = a, i;
  }, {}), n = Object.values(t);
  n.sort((i, o) => {
    let [s, a] = i, [u2, f] = o;
    return a === 1 / 0 || f === 1 / 0 ? s - u2 : a - f;
  });
  let r = 0;
  return n.forEach((i) => i[2] = r++), t;
}
function js(e, t) {
  let n = t == null ? void 0 : t[e];
  if (!n)
    return null;
  if (typeof n == "string")
    return _({ fontFamily: n });
  let r = n[0];
  return r ? _({ fontFamily: r }) : null;
}
function lr(e, t, n) {
  if (!n)
    return null;
  let r;
  t.includes("/") && ([t = "", r] = t.split("/", 2));
  let i = "";
  if (t.startsWith("[#") || t.startsWith("[rgb") ? i = t.slice(1, -1) : i = Uf(t, n), !i)
    return null;
  if (r) {
    let o = Number(r);
    if (!Number.isNaN(o))
      return i = $f(i, o / 100), _({ [wi[e].color]: i });
  }
  return { kind: "dependent", complete(o) {
    let s = wi[e].opacity, a = o[s];
    typeof a == "number" && (i = $f(i, a)), o[wi[e].color] = i;
  } };
}
function On(e, t) {
  let n = parseInt(t, 10);
  if (Number.isNaN(n))
    return null;
  let r = n / 100;
  return { kind: "complete", style: { [wi[e].opacity]: r } };
}
function $f(e, t) {
  return e.startsWith("#") ? e = Fb(e) : e.startsWith("rgb(") && (e = e.replace(/^rgb\(/, "rgba(").replace(/\)$/, ", 1)")), e.replace(/, ?\d*\.?(\d+)\)$/, `, ${t})`);
}
function qf(e) {
  for (let t in e)
    t.startsWith("__opacity_") && delete e[t];
}
var wi = { bg: { opacity: "__opacity_bg", color: "backgroundColor" }, text: { opacity: "__opacity_text", color: "color" }, border: { opacity: "__opacity_border", color: "borderColor" }, borderTop: { opacity: "__opacity_border", color: "borderTopColor" }, borderBottom: { opacity: "__opacity_border", color: "borderBottomColor" }, borderLeft: { opacity: "__opacity_border", color: "borderLeftColor" }, borderRight: { opacity: "__opacity_border", color: "borderRightColor" }, shadow: { opacity: "__opacity_shadow", color: "shadowColor" }, tint: { opacity: "__opacity_tint", color: "tintColor" } };
function Fb(e) {
  let t = e;
  e = e.replace(Db, (s, a, u2, f) => a + a + u2 + u2 + f + f);
  let n = Bb.exec(e);
  if (!n)
    return Je(`invalid config hex color value: ${t}`), "rgba(0, 0, 0, 1)";
  let r = parseInt(n[1], 16), i = parseInt(n[2], 16), o = parseInt(n[3], 16);
  return `rgba(${r}, ${i}, ${o}, 1)`;
}
function Uf(e, t) {
  let n = t[e];
  if (Ms(n))
    return n;
  if (Ns(n) && Ms(n.DEFAULT))
    return n.DEFAULT;
  let [r = "", ...i] = e.split("-");
  for (; r !== e; ) {
    let o = t[r];
    if (Ns(o))
      return Uf(i.join("-"), o);
    if (i.length === 0)
      return "";
    r = `${r}-${i.shift()}`;
  }
  return "";
}
var Db = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
var Bb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
function zf(e, t) {
  let [n, r] = Bs(e);
  if (n.match(/^(-?(\d)+)?$/))
    return $b(n, r, t == null ? void 0 : t.borderWidth);
  if (n = n.replace(/^-/, ""), ["dashed", "solid", "dotted"].includes(n))
    return _({ borderStyle: n });
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
  let s = lr(o, n, t == null ? void 0 : t.borderColor);
  if (s)
    return s;
  let a = `border${r === "All" ? "" : r}Width`;
  n = n.replace(/^-/, "");
  let u2 = n.slice(1, -1), f = dt(a, u2);
  return typeof (f == null ? void 0 : f.style[a]) != "number" ? null : f;
}
function $b(e, t, n) {
  if (!n)
    return null;
  e = e.replace(/^-/, "");
  let i = n[e === "" ? "DEFAULT" : e];
  if (i === void 0)
    return null;
  let o = `border${t === "All" ? "" : t}Width`;
  return Bt(o, i);
}
function jf(e, t) {
  if (!t)
    return null;
  let [n, r] = Bs(e);
  n = n.replace(/^-/, ""), n === "" && (n = "DEFAULT");
  let i = `border${r === "All" ? "" : r}Radius`, o = t[n];
  if (o)
    return Gf(Bt(i, o));
  let s = dt(i, n);
  return typeof (s == null ? void 0 : s.style[i]) != "number" ? null : Gf(s);
}
function Gf(e) {
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
function Er(e, t, n, r) {
  let i = null;
  e === "inset" && (t = t.replace(/^(x|y)-/, (a, u2) => (i = u2 === "x" ? "x" : "y", "")));
  let o = r == null ? void 0 : r[t];
  if (o) {
    let a = At(o, { isNegative: n });
    if (a !== null)
      return Vf(e, i, a);
  }
  let s = ur(t, { isNegative: n });
  return s !== null ? Vf(e, i, s) : null;
}
function Vf(e, t, n) {
  if (e !== "inset")
    return _({ [e]: n });
  switch (t) {
    case null:
      return _({ top: n, left: n, right: n, bottom: n });
    case "y":
      return _({ top: n, bottom: n });
    case "x":
      return _({ left: n, right: n });
  }
}
function Pn(e, t, n) {
  var r;
  t = t.replace(/^-/, "");
  let i = t === "" ? "DEFAULT" : t, o = Number((r = n == null ? void 0 : n[i]) !== null && r !== void 0 ? r : t);
  return Number.isNaN(o) ? null : _({ [`flex${e}`]: o });
}
function Hf(e, t) {
  var n, r;
  if (e = (t == null ? void 0 : t[e]) || e, ["min-content", "revert", "unset"].includes(e))
    return null;
  if (e.match(/^\d+(\.\d+)?$/))
    return _({ flexGrow: Number(e), flexBasis: "0%" });
  let i = e.match(/^(\d+)\s+(\d+)$/);
  if (i)
    return _({ flexGrow: Number(i[1]), flexShrink: Number(i[2]) });
  if (i = e.match(/^(\d+)\s+([^ ]+)$/), i) {
    let o = At((n = i[2]) !== null && n !== void 0 ? n : "");
    return o ? _({ flexGrow: Number(i[1]), flexBasis: o }) : null;
  }
  if (i = e.match(/^(\d+)\s+(\d+)\s+(.+)$/), i) {
    let o = At((r = i[3]) !== null && r !== void 0 ? r : "");
    return o ? _({ flexGrow: Number(i[1]), flexShrink: Number(i[2]), flexBasis: o }) : null;
  }
  return null;
}
function Vs(e, t, n = {}, r) {
  let i = r == null ? void 0 : r[t];
  return i !== void 0 ? Bt(e, i, n) : dt(e, t, n);
}
function An(e, t, n = {}, r) {
  let i = At(r == null ? void 0 : r[t], n);
  return i ? _({ [e]: i }) : (t === "screen" && (t = e.includes("Width") ? "100vw" : "100vh"), dt(e, t, n));
}
function Yf(e, t, n) {
  let r = n == null ? void 0 : n[e];
  if (r) {
    let i = Fe(r, { isNegative: t });
    if (!i)
      return null;
    let [o, s] = i;
    if (s === se.em)
      return qb(o);
    if (s === se.percent)
      return Je("percentage-based letter-spacing configuration currently unsupported, switch to `em`s, or open an issue if you'd like to see support added."), null;
    let a = Xt(o, s, { isNegative: t });
    return a !== null ? _({ letterSpacing: a }) : null;
  }
  return dt("letterSpacing", e, { isNegative: t });
}
function qb(e) {
  return { kind: "dependent", complete(t) {
    let n = t.fontSize;
    if (typeof n != "number" || Number.isNaN(n))
      return "tracking-X relative letter spacing classes require font-size to be set";
    t.letterSpacing = Math.round((e * n + Number.EPSILON) * 100) / 100;
  } };
}
function Xf(e, t) {
  let n = t == null ? void 0 : t[e];
  if (n) {
    let i = Fe(String(n));
    if (i)
      return _({ opacity: i[0] });
  }
  let r = Fe(e);
  return r ? _({ opacity: r[0] / 100 }) : null;
}
function Qf(e) {
  let t = parseInt(e, 10);
  return Number.isNaN(t) ? null : { kind: "complete", style: { shadowOpacity: t / 100 } };
}
function Kf(e) {
  if (e.includes("/")) {
    let [n = "", r = ""] = e.split("/", 2), i = Hs(n), o = Hs(r);
    return i === null || o === null ? null : { kind: "complete", style: { shadowOffset: { width: i, height: o } } };
  }
  let t = Hs(e);
  return t === null ? null : { kind: "complete", style: { shadowOffset: { width: t, height: t } } };
}
function Hs(e) {
  let t = ur(e);
  return typeof t == "number" ? t : null;
}
var Or = class {
  constructor(t, n = {}, r, i, o) {
    var s, a, u2, f, l2, p;
    this.config = n, this.cache = r, this.position = 0, this.isNull = false, this.isNegative = false, this.context = {}, this.context.device = i;
    let h2 = t.trim().split(":"), m2 = [];
    h2.length === 1 ? this.string = t : (this.string = (s = h2.pop()) !== null && s !== void 0 ? s : "", m2 = h2), this.char = this.string[0];
    let b = zs((a = this.config.theme) === null || a === void 0 ? void 0 : a.screens);
    for (let y of m2)
      if (b[y]) {
        let T = (u2 = b[y]) === null || u2 === void 0 ? void 0 : u2[2];
        T !== void 0 && (this.order = ((f = this.order) !== null && f !== void 0 ? f : 0) + T);
        let k = (l2 = i.windowDimensions) === null || l2 === void 0 ? void 0 : l2.width;
        if (k) {
          let [P2, w2] = (p = b[y]) !== null && p !== void 0 ? p : [0, 0];
          (k <= P2 || k > w2) && (this.isNull = true);
        } else
          this.isNull = true;
      } else
        Lf(y) ? this.isNull = y !== o : Mf(y) ? i.windowDimensions ? (i.windowDimensions.width > i.windowDimensions.height ? "landscape" : "portrait") !== y ? this.isNull = true : this.incrementOrder() : this.isNull = true : y === "retina" ? i.pixelDensity === 2 ? this.incrementOrder() : this.isNull = true : y === "dark" ? i.colorScheme !== "dark" ? this.isNull = true : this.incrementOrder() : this.handlePossibleArbitraryBreakpointPrefix(y) || (this.isNull = true);
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
    let s = this.config.theme, a = null;
    switch (this.char) {
      case "m":
      case "p": {
        let u2 = this.peekSlice(1, 3).match(/^(t|b|r|l|x|y)?-/);
        if (u2) {
          let f = this.char === "m" ? "margin" : "padding";
          this.advance(((n = (t = u2[0]) === null || t === void 0 ? void 0 : t.length) !== null && n !== void 0 ? n : 0) + 1);
          let l2 = Ds(u2[1]), p = Gs(f, l2, this.isNegative, this.rest, (r = this.config.theme) === null || r === void 0 ? void 0 : r[f]);
          if (p)
            return p;
        }
      }
    }
    if (this.consumePeeked("h-") && (a = Vs("height", this.rest, this.context, s == null ? void 0 : s.height), a) || this.consumePeeked("w-") && (a = Vs("width", this.rest, this.context, s == null ? void 0 : s.width), a) || this.consumePeeked("min-w-") && (a = An("minWidth", this.rest, this.context, s == null ? void 0 : s.minWidth), a) || this.consumePeeked("min-h-") && (a = An("minHeight", this.rest, this.context, s == null ? void 0 : s.minHeight), a) || this.consumePeeked("max-w-") && (a = An("maxWidth", this.rest, this.context, s == null ? void 0 : s.maxWidth), a) || this.consumePeeked("max-h-") && (a = An("maxHeight", this.rest, this.context, s == null ? void 0 : s.maxHeight), a) || this.consumePeeked("leading-") && (a = Us(this.rest, s == null ? void 0 : s.lineHeight), a) || this.consumePeeked("text-") && (a = qs(this.rest, s == null ? void 0 : s.fontSize, this.context), a || (a = lr("text", this.rest, s == null ? void 0 : s.textColor), a) || this.consumePeeked("opacity-") && (a = On("text", this.rest), a)) || this.consumePeeked("font-") && (a = js(this.rest, s == null ? void 0 : s.fontFamily), a) || this.consumePeeked("aspect-") && (this.consumePeeked("ratio-") && Je("`aspect-ratio-{ratio}` is deprecated, use `aspect-{ratio}` instead"), a = Bt("aspectRatio", this.rest, { fractions: true }), a) || this.consumePeeked("tint-") && (a = lr("tint", this.rest, s == null ? void 0 : s.colors), a) || this.consumePeeked("bg-") && (a = lr("bg", this.rest, s == null ? void 0 : s.backgroundColor), a || this.consumePeeked("opacity-") && (a = On("bg", this.rest), a)) || this.consumePeeked("border") && (a = zf(this.rest, s), a || this.consumePeeked("-opacity-") && (a = On("border", this.rest), a)) || this.consumePeeked("rounded") && (a = jf(this.rest, s == null ? void 0 : s.borderRadius), a) || this.consumePeeked("bottom-") && (a = Er("bottom", this.rest, this.isNegative, s == null ? void 0 : s.inset), a) || this.consumePeeked("top-") && (a = Er("top", this.rest, this.isNegative, s == null ? void 0 : s.inset), a) || this.consumePeeked("left-") && (a = Er("left", this.rest, this.isNegative, s == null ? void 0 : s.inset), a) || this.consumePeeked("right-") && (a = Er("right", this.rest, this.isNegative, s == null ? void 0 : s.inset), a) || this.consumePeeked("inset-") && (a = Er("inset", this.rest, this.isNegative, s == null ? void 0 : s.inset), a) || this.consumePeeked("flex-") && (this.consumePeeked("grow") ? a = Pn("Grow", this.rest, s == null ? void 0 : s.flexGrow) : this.consumePeeked("shrink") ? a = Pn("Shrink", this.rest, s == null ? void 0 : s.flexShrink) : a = Hf(this.rest, s == null ? void 0 : s.flex), a) || this.consumePeeked("grow") && (a = Pn("Grow", this.rest, s == null ? void 0 : s.flexGrow), a) || this.consumePeeked("shrink") && (a = Pn("Shrink", this.rest, s == null ? void 0 : s.flexShrink), a) || this.consumePeeked("shadow-color-opacity-") && (a = On("shadow", this.rest), a) || this.consumePeeked("shadow-opacity-") && (a = Qf(this.rest), a) || this.consumePeeked("shadow-offset-") && (a = Kf(this.rest), a) || this.consumePeeked("shadow-radius-") && (a = dt("shadowRadius", this.rest), a) || this.consumePeeked("shadow-") && (a = lr("shadow", this.rest, s == null ? void 0 : s.colors), a))
      return a;
    if (this.consumePeeked("elevation-")) {
      let u2 = parseInt(this.rest, 10);
      if (!Number.isNaN(u2))
        return _({ elevation: u2 });
    }
    if (this.consumePeeked("opacity-") && (a = Xf(this.rest, s == null ? void 0 : s.opacity), a) || this.consumePeeked("tracking-") && (a = Yf(this.rest, this.isNegative, s == null ? void 0 : s.letterSpacing), a))
      return a;
    if (this.consumePeeked("z-")) {
      let u2 = Number((o = (i = s == null ? void 0 : s.zIndex) === null || i === void 0 ? void 0 : i[this.rest]) !== null && o !== void 0 ? o : this.rest);
      if (!Number.isNaN(u2))
        return _({ zIndex: u2 });
    }
    return Je(`\`${this.rest}\` unknown or invalid utility`), null;
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
    let i = this.context.device.windowDimensions, [, o = "", s = "", a = ""] = r, u2 = s === "w" ? i.width : i.height, f = Fe(a, this.context);
    if (f === null)
      return this.isNull = true, true;
    let [l2, p] = f;
    return p !== "px" && (this.isNull = true), (o === "min" ? u2 >= l2 : u2 <= l2) ? this.incrementOrder() : this.isNull = true, true;
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
function Jf(e) {
  let t = [], n = null;
  return e.forEach((r) => {
    if (typeof r == "string")
      t = [...t, ...Ys(r)];
    else if (Array.isArray(r))
      t = [...t, ...r.flatMap(Ys)];
    else if (typeof r == "object" && r !== null)
      for (let [i, o] of Object.entries(r))
        typeof o == "boolean" ? t = [...t, ...o ? Ys(i) : []] : n ? n[i] = o : n = { [i]: o };
  }), [t.filter(Boolean).filter(Ub), n];
}
function Ys(e) {
  return e.trim().split(/\s+/);
}
function Ub(e, t, n) {
  return n.indexOf(e) === t;
}
function Zf(e) {
  var t;
  return (t = e == null ? void 0 : e.reduce((n, r) => ({ ...n, ...Gb(r.handler) }), {})) !== null && t !== void 0 ? t : {};
}
function Gb(e) {
  let t = {};
  return e({ addUtilities: (n) => {
    t = n;
  }, ...zb }), t;
}
function It(e) {
  throw new Error(`tailwindcss plugin function argument object prop "${e}" not implemented`);
}
var zb = { addComponents: It, addBase: It, addVariant: It, e: It, prefix: It, theme: It, variants: It, config: It, corePlugins: It, matchUtilities: It, postcss: null };
function tc(e, t) {
  let n = (0, ec2.default)(jb(e)), r = {}, i = Zf(n.plugins), o = {}, s = Object.entries(i).map(([b, y]) => typeof y == "string" ? (o[b] = y, [b, { kind: "null" }]) : [b, _(y)]).filter(([, b]) => b.kind !== "null");
  function a() {
    return [r.windowDimensions ? `w${r.windowDimensions.width}` : false, r.windowDimensions ? `h${r.windowDimensions.height}` : false, r.fontScale ? `fs${r.fontScale}` : false, r.colorScheme === "dark" ? "dark" : false, r.pixelDensity === 2 ? "retina" : false].filter(Boolean).join("--") || "default";
  }
  let u2 = a(), f = {};
  function l2() {
    let b = f[u2];
    if (b)
      return b;
    let y = new En(s);
    return f[u2] = y, y;
  }
  function p(...b) {
    let y = l2(), T = {}, k = [], P2 = [], [w2, S2] = Jf(b), O = w2.join(" "), I = y.getStyle(O);
    if (I)
      return { ...I, ...S2 || {} };
    for (let F of w2) {
      let q = y.getIr(F);
      if (!q && F in o) {
        let de = p(o[F]);
        y.setIr(F, _(de)), T = { ...T, ...de };
        continue;
      }
      switch (q = new Or(F, n, y, r, t).parse(), q.kind) {
        case "complete":
          T = { ...T, ...q.style }, y.setIr(F, q);
          break;
        case "dependent":
          k.push(q);
          break;
        case "ordered":
          P2.push(q);
          break;
        case "null":
          y.setIr(F, q);
          break;
      }
    }
    if (P2.length > 0) {
      P2.sort((F, q) => F.order - q.order);
      for (let F of P2)
        switch (F.styleIr.kind) {
          case "complete":
            T = { ...T, ...F.styleIr.style };
            break;
          case "dependent":
            k.push(F.styleIr);
            break;
        }
    }
    if (k.length > 0) {
      for (let F of k) {
        let q = F.complete(T);
        q && Je(q);
      }
      qf(T);
    }
    return O !== "" && y.setStyle(O, T), S2 && (T = { ...T, ...S2 }), T;
  }
  function h2(b) {
    let y = p(b.split(/\s+/g).map((T) => T.replace(/^(bg|text|border)-/, "")).map((T) => `bg-${T}`).join(" "));
    return typeof y.backgroundColor == "string" ? y.backgroundColor : void 0;
  }
  let m2 = (b, ...y) => {
    let T = "";
    return b.forEach((k, P2) => {
      var w2;
      T += k + ((w2 = y[P2]) !== null && w2 !== void 0 ? w2 : "");
    }), p(T);
  };
  return m2.style = p, m2.color = h2, m2.prefixMatch = (...b) => {
    let y = b.sort().join(":"), T = l2(), k = T.getPrefixMatch(y);
    if (k !== void 0)
      return k;
    let S2 = new Or(`${y}:flex`, n, T, r, t).parse().kind !== "null";
    return T.setPrefixMatch(y, S2), S2;
  }, m2.setWindowDimensions = (b) => {
    r.windowDimensions = b, u2 = a();
  }, m2.setFontScale = (b) => {
    r.fontScale = b, u2 = a();
  }, m2.setPixelDensity = (b) => {
    r.pixelDensity = b, u2 = a();
  }, m2.setColorScheme = (b) => {
    r.colorScheme = b, u2 = a();
  }, m2;
}
function jb(e) {
  return { ...e, content: ["_no_warnings_please"] };
}
var Hb = { handler: ({ addUtilities: e }) => {
  e({ "shadow-sm": { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }, shadow: { boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" }, "shadow-md": { boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }, "shadow-lg": { boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }, "shadow-xl": { boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }, "shadow-2xl": { boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)" }, "shadow-inner": { boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" }, "shadow-none": { boxShadow: "0 0 #0000" } });
} };
function Yb(e) {
  return tc({ ...e, plugins: [...(e == null ? void 0 : e.plugins) ?? [], Hb] }, "web");
}
var Si;
function Xs({ width: e, height: t, config: n }) {
  return Si || (Si = Yb(n)), Si.setWindowDimensions({ width: +e, height: +t }), Si;
}
var Qs = /* @__PURE__ */ new WeakMap();
async function nc(e, t) {
  let n = await Gt();
  if (!n || !n.Node)
    throw new Error("Satori is not initialized: expect `yoga` to be loaded, got " + n);
  t.fonts = t.fonts || [];
  let r;
  Qs.has(t.fonts) ? r = Qs.get(t.fonts) : Qs.set(t.fonts, r = new Hr(t.fonts));
  let i = "width" in t ? t.width : void 0, o = "height" in t ? t.height : void 0, s = Xb(n, t.pointScaleFactor);
  i && s.setWidth(i), o && s.setHeight(o), s.setFlexDirection(n.FLEX_DIRECTION_ROW), s.setFlexWrap(n.WRAP_WRAP), s.setAlignContent(n.ALIGN_AUTO), s.setAlignItems(n.ALIGN_FLEX_START), s.setJustifyContent(n.JUSTIFY_FLEX_START), s.setOverflow(n.OVERFLOW_HIDDEN);
  let a = { ...t.graphemeImages }, u2 = /* @__PURE__ */ new Set();
  Ot.clear(), Wr.clear(), await Ma(e);
  let f = jr(e, { id: "id", parentStyle: {}, inheritedStyle: { fontSize: 16, fontWeight: "normal", fontFamily: "serif", fontStyle: "normal", lineHeight: "normal", color: "black", opacity: 1, whiteSpace: "normal", _viewportWidth: i, _viewportHeight: o }, parent: s, font: r, embedFont: t.embedFont, debug: t.debug, graphemeImages: a, canLoadAdditionalAssets: !!t.loadAdditionalAsset, onNodeDetected: t.onNodeDetected, getTwStyles: (b, y) => {
    let k = { ...Xs({ width: i, height: o, config: t.tailwindConfig })([b]) };
    return typeof k.lineHeight == "number" && (k.lineHeight = k.lineHeight / (+k.fontSize || y.fontSize || 16)), k.shadowColor && k.boxShadow && (k.boxShadow = k.boxShadow.replace(/rgba?\([^)]+\)/, k.shadowColor)), k;
  } }), l2 = (await f.next()).value;
  if (t.loadAdditionalAsset && l2.length) {
    let b = Qb(l2), y = [], T = {};
    await Promise.all(Object.entries(b).flatMap(([k, P2]) => P2.map((w2) => {
      let S2 = `${k}_${w2}`;
      return u2.has(S2) ? null : (u2.add(S2), t.loadAdditionalAsset(k, w2).then((O) => {
        typeof O == "string" ? T[w2] = O : O && (Array.isArray(O) ? y.push(...O) : y.push(O));
      }));
    }))), r.addFonts(y), Object.assign(a, T);
  }
  await f.next(), s.calculateLayout(i, o, n.DIRECTION_LTR);
  let p = (await f.next([0, 0])).value, h2 = s.getComputedWidth(), m2 = s.getComputedHeight();
  return s.freeRecursive(), ao({ width: h2, height: m2, content: p });
}
function Xb(e, t) {
  if (t) {
    let n = e.Config.create();
    return n.setPointScaleFactor(t), e.Node.createWithConfig(n);
  } else
    return e.Node.create();
}
function Qb(e) {
  let t = {}, n = {};
  for (let { word: r, locale: i } of e) {
    let o = vu(r, i).join("|");
    n[o] = n[o] || "", n[o] += r;
  }
  return Object.keys(n).forEach((r) => {
    t[r] = t[r] || [], r === "emoji" ? t[r].push(...rc(Ve(n[r], "grapheme"))) : (t[r][0] = t[r][0] || "", t[r][0] += rc(Ve(n[r], "grapheme", r === "unknown" ? void 0 : r)).join(""));
  }), t;
}
function rc(e) {
  return Array.from(new Set(e));
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
function isLikeNone(x2) {
  return x2 === void 0 || x2 === null;
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
  /**
  * @returns {number}
  */
  get x() {
    const ret = wasm.__wbg_get_bbox_x(this.ptr);
    return ret;
  }
  /**
  * @param {number} arg0
  */
  set x(arg0) {
    wasm.__wbg_set_bbox_x(this.ptr, arg0);
  }
  /**
  * @returns {number}
  */
  get y() {
    const ret = wasm.__wbg_get_bbox_y(this.ptr);
    return ret;
  }
  /**
  * @param {number} arg0
  */
  set y(arg0) {
    wasm.__wbg_set_bbox_y(this.ptr, arg0);
  }
  /**
  * @returns {number}
  */
  get width() {
    const ret = wasm.__wbg_get_bbox_width(this.ptr);
    return ret;
  }
  /**
  * @param {number} arg0
  */
  set width(arg0) {
    wasm.__wbg_set_bbox_width(this.ptr, arg0);
  }
  /**
  * @returns {number}
  */
  get height() {
    const ret = wasm.__wbg_get_bbox_height(this.ptr);
    return ret;
  }
  /**
  * @param {number} arg0
  */
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
  /**
  * Get the PNG width
  * @returns {number}
  */
  get width() {
    const ret = wasm.renderedimage_width(this.ptr);
    return ret >>> 0;
  }
  /**
  * Get the PNG height
  * @returns {number}
  */
  get height() {
    const ret = wasm.renderedimage_height(this.ptr);
    return ret >>> 0;
  }
  /**
  * Write the image data to Uint8Array
  * @returns {Uint8Array}
  */
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
  /**
  * Get the RGBA pixels of the image
  * @returns {Uint8Array}
  */
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
  /**
  * @param {Uint8Array | string} svg
  * @param {string | undefined} options
  */
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
  /**
  * Get the SVG width
  * @returns {number}
  */
  get width() {
    const ret = wasm.resvg_width(this.ptr);
    return ret;
  }
  /**
  * Get the SVG height
  * @returns {number}
  */
  get height() {
    const ret = wasm.resvg_height(this.ptr);
    return ret;
  }
  /**
  * Renders an SVG in Wasm
  * @returns {RenderedImage}
  */
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
  /**
  * Output usvg-simplified SVG string
  * @returns {string}
  */
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
  /**
  * Calculate a maximum bounding box of all visible elements in this SVG.
  *
  * Note: path bounding box are approx values.
  * @returns {BBox | undefined}
  */
  innerBBox() {
    const ret = wasm.resvg_innerBBox(this.ptr);
    return ret === 0 ? void 0 : BBox.__wrap(ret);
  }
  /**
  * Calculate a maximum bounding box of all visible elements in this SVG.
  * This will first apply transform.
  * Similar to `SVGGraphicsElement.getBBox()` DOM API.
  * @returns {BBox | undefined}
  */
  getBBox() {
    const ret = wasm.resvg_getBBox(this.ptr);
    return ret === 0 ? void 0 : BBox.__wrap(ret);
  }
  /**
  * Use a given `BBox` to crop the svg. Currently this method simply changes
  * the viewbox/size of the svg and do not move the elements for simplicity
  * @param {BBox} bbox
  */
  cropByBBox(bbox) {
    _assertClass(bbox, BBox);
    wasm.resvg_cropByBBox(this.ptr, bbox.ptr);
  }
  /**
  * @returns {Array<any>}
  */
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
  /**
  * @param {string} href
  * @param {Uint8Array} buffer
  */
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
  /**
   * @param {Uint8Array | string} svg
   * @param {ResvgRenderOptions | undefined} options
   */
  constructor(svg, options) {
    if (!initialized)
      throw new Error("Wasm has not been initialized. Call `initWasm()` function.");
    super(svg, JSON.stringify(options));
  }
};

// src/index.edge.ts
import yoga_wasm from "./yoga.wasm?module";
import resvg_wasm from "./resvg.wasm?module";

// src/emoji/index.ts
var U200D = String.fromCharCode(8205);
var UFE0Fg = /\uFE0F/g;
function getIconCode(char) {
  return toCodePoint(char.indexOf(U200D) < 0 ? char.replace(UFE0Fg, "") : char);
}
function toCodePoint(unicodeSurrogates) {
  var r = [], c2 = 0, p = 0, i = 0;
  while (i < unicodeSurrogates.length) {
    c2 = unicodeSurrogates.charCodeAt(i++);
    if (p) {
      r.push((65536 + (p - 55296 << 10) + (c2 - 56320)).toString(16));
      p = 0;
    } else if (55296 <= c2 && c2 <= 56319) {
      p = c2;
    } else {
      r.push(c2.toString(16));
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
        // Make sure it returns TTF.
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
  const API = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(
    text
  )}`;
  const css = await (await fetch(API, {
    headers: {
      // Make sure it returns TTF.
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
      const fontData = await Promise.all(
        fonts.map((font) => loadGoogleFont(font, textByFont[font]))
      );
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
async function render(satori, resvg, sharp, opts, defaultFonts, element) {
  const options = Object.assign(
    {
      width: 1200,
      height: 630,
      debug: false
    },
    opts
  );
  const svg = await satori(element, {
    width: options.width,
    height: options.height,
    debug: options.debug,
    fonts: options.fonts || defaultFonts,
    loadAdditionalAsset: loadDynamicAsset({
      emoji: options.emoji
    })
  });
  let pngBuffer;
  if (sharp) {
    pngBuffer = await sharp(new TextEncoder().encode(svg)).resize(options.width).png().toBuffer();
  } else {
    const resvgJS = new resvg.Resvg(svg, {
      fitTo: {
        mode: "width",
        value: options.width
      }
    });
    const pngData = resvgJS.render();
    pngBuffer = pngData.asPng();
    pngData.free();
    resvgJS.free();
  }
  return pngBuffer;
}

// src/index.edge.ts
var initializedResvg = initWasm(resvg_wasm);
var initializeSatori = Wc(yoga_wasm);
var fallbackFont = fetch(
  new URL("./Geist-Regular.ttf", import.meta.url)
).then((res) => res.arrayBuffer());
var ImageResponse = class extends Response {
  constructor(element, options = {}) {
    const result = new ReadableStream({
      async start(controller) {
        const [fontData] = await Promise.all([
          fallbackFont,
          initializeSatori,
          initializedResvg
        ]);
        const fonts = [
          {
            name: "geist",
            data: fontData,
            weight: 400,
            style: "normal"
          }
        ];
        const result2 = await render(
          nc,
          resvg_wasm_exports,
          void 0,
          options,
          fonts,
          element
        );
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
export {
  ImageResponse
};
/*! Copyright Twitter Inc. and other contributors. Licensed under MIT */
/*! Bundled license information:

css-background-parser/index.js:
  (*!
   * https://github.com/gilmoreorless/css-background-parser
   * Copyright © 2015 Gilmore Davidson under the MIT license: http://gilmoreorless.mit-license.org/
   *)

escape-html/index.js:
  (*!
   * escape-html
   * Copyright(c) 2012-2013 TJ Holowaychuk
   * Copyright(c) 2015 Andreas Lubbe
   * Copyright(c) 2015 Tiancheng "Timothy" Gu
   * MIT Licensed
   *)

parse-css-color/dist/index.esm.js:
  (**
   * parse-css-color
   * @version v0.2.1
   * @link http://github.com/noeldelgado/parse-css-color/
   * @license MIT
   *)
*/
//# sourceMappingURL=index.edge.js.map