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
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
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
    function map(xs2, f) {
      if (xs2.map) {
        return xs2.map(f);
      }
      var res = [];
      for (var i = 0; i < xs2.length; i++) {
        res.push(f(xs2[i], i));
      }
      return res;
    }
    function reduce(xs2, f, acc) {
      if (xs2.reduce) {
        return xs2.reduce(f, acc);
      }
      for (var i = 0; i < xs2.length; i++) {
        acc = f(acc, xs2[i], i);
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
var $557adaaeb0c7885f$var$data = import_base64_js.default.toByteArray("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");
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

// node_modules/.pnpm/satori@0.29.0/node_modules/satori/dist/index.js
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
  const cn2 = import_color_name.default[str.toLowerCase()];
  if (cn2)
    return getRGB([null, cn2[0], cn2[1], cn2[2], 1]);
  return null;
};
var index_esm_default = parseCSSColor;

// node_modules/.pnpm/satori@0.29.0/node_modules/satori/dist/index.js
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

// node_modules/.pnpm/satori@0.29.0/node_modules/satori/dist/index.js
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
var hMap = function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l2 = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i]) {
      ++l2[cd[i] - 1];
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
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v2 = le[cd[i] - 1]++ << r_1;
        for (var m2 = v2 | (1 << r_1) - 1; v2 <= m2; ++v2) {
          co[rev[v2] >>> rvb] = sv;
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
var err = function(ind, msg, nt2) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(e, err);
  }
  if (!nt2) {
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
  var cbuf = function(l3) {
    var bl = buf.length;
    if (l3 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l3));
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
        var s = shft(pos) + 4, l2 = dat[s - 4] | dat[s - 3] << 8, t = s + l2;
        if (t > sl2) {
          if (noSt) {
            err(0);
          }
          break;
        }
        if (noBuf) {
          cbuf(bt2 + l2);
        }
        buf.set(dat.subarray(s, t), bt2);
        st.b = bt2 += l2, st.p = pos = t * 8, st.f = final;
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
      cbuf(bt2 + 131072);
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
    var pt2 = this.points[i];
    currentContour.push(pt2);
    if (pt2.lastPointOfContour) {
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
    var pt2 = points[i];
    var newPt = {
      x: transform.xScale * pt2.x + transform.scale01 * pt2.y + transform.dx,
      y: transform.scale10 * pt2.x + transform.yScale * pt2.y + transform.dy,
      onCurve: pt2.onCurve,
      lastPointOfContour: pt2.lastPointOfContour
    };
    newPoints.push(newPt);
  }
  return newPoints;
}
function getContours(points) {
  var contours = [];
  var currentContour = [];
  for (var i = 0; i < points.length; i += 1) {
    var pt2 = points[i];
    currentContour.push(pt2);
    if (pt2.lastPointOfContour) {
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
  var ci = stack.pop();
  var sp = state.z2[state.contours[ci]];
  var p = sp;
  if (exports.DEBUG) {
    console.log(state.step, "SHC[" + a + "]", ci);
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
    var w3 = prog[++ip] << 8 | prog[++ip];
    if (w3 & 32768) {
      w3 = -((w3 ^ 65535) + 1);
    }
    stack.push(w3);
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
  var ds2 = state.deltaShift;
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
      console.log(state.step, "DELTAPFIX", pi, "by", mag * ds2);
    }
    var p = z0[pi];
    fv.setRelative(p, p, mag * ds2, pv);
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
  var ds2 = state.deltaShift;
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
    var delta = mag * ds2;
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
    var w3 = prog[++ip] << 8 | prog[++ip];
    if (w3 & 32768) {
      w3 = -((w3 ^ 65535) + 1);
    }
    stack.push(w3);
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
  var d2;
  var sign;
  var cv;
  d2 = od = pv.distance(p, rp, true, true);
  sign = d2 >= 0 ? 1 : -1;
  d2 = Math.abs(d2);
  if (indirect) {
    cv = state.cvt[cvte];
    if (ro && Math.abs(d2 - cv) < state.cvCutIn) {
      d2 = cv;
    }
  }
  if (keepD && d2 < md) {
    d2 = md;
  }
  if (ro) {
    d2 = state.round(d2);
  }
  fv.setRelative(p, rp, sign * d2, pv);
  fv.touch(p);
  if (exports.DEBUG) {
    console.log(
      state.step,
      (indirect ? "MIRP[" : "MDRP[") + (setRp0 ? "M" : "m") + (keepD ? ">" : "_") + (ro ? "R" : "_") + (dt2 === 0 ? "Gr" : dt2 === 1 ? "Bl" : dt2 === 2 ? "Wh" : "") + "]",
      indirect ? cvte + "(" + state.cvt[cvte] + "," + cv + ")" : "",
      pi,
      "(d =",
      od,
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

// node_modules/.pnpm/satori@0.29.0/node_modules/satori/dist/index.js
var uu = Object.create;
var Mr = Object.defineProperty;
var lu = Object.getOwnPropertyDescriptor;
var cu = Object.getOwnPropertyNames;
var Bu = Object.getPrototypeOf;
var Eu = Object.prototype.hasOwnProperty;
var tt = (A, e) => () => (A && (e = A(A = 0)), e);
var _ = (A, e) => () => (e || A((e = { exports: {} }).exports, e), e.exports);
var Lr = (A, e) => {
  for (var t in e)
    Mr(A, t, { get: e[t], enumerable: true });
};
var ns = (A, e, t, r) => {
  if (e && typeof e == "object" || typeof e == "function")
    for (let n of cu(e))
      !Eu.call(A, n) && n !== t && Mr(A, n, { get: () => e[n], enumerable: !(r = lu(e, n)) || r.enumerable });
  return A;
};
var fu = (A, e, t) => (t = A != null ? uu(Bu(A)) : {}, ns(e || !A || !A.__esModule ? Mr(t, "default", { value: A, enumerable: true }) : t, A));
var Gr = (A) => ns(Mr({}, "__esModule", { value: true }), A);
var He;
var ds;
var hs;
var Ft;
var Nn;
var Oe;
var Qt;
var Ru;
var Tr;
var Fn;
var Ct;
var dt;
var Mn;
var ps;
var Ln;
var Gn;
var pe;
var Un;
var vu;
var ms;
var Pr = tt(() => {
  He = function(A) {
    return A[A.Auto = 0] = "Auto", A[A.FlexStart = 1] = "FlexStart", A[A.Center = 2] = "Center", A[A.FlexEnd = 3] = "FlexEnd", A[A.Stretch = 4] = "Stretch", A[A.Baseline = 5] = "Baseline", A[A.SpaceBetween = 6] = "SpaceBetween", A[A.SpaceAround = 7] = "SpaceAround", A[A.SpaceEvenly = 8] = "SpaceEvenly", A;
  }({}), ds = function(A) {
    return A[A.BorderBox = 0] = "BorderBox", A[A.ContentBox = 1] = "ContentBox", A;
  }({}), hs = function(A) {
    return A[A.Width = 0] = "Width", A[A.Height = 1] = "Height", A;
  }({}), Ft = function(A) {
    return A[A.Inherit = 0] = "Inherit", A[A.LTR = 1] = "LTR", A[A.RTL = 2] = "RTL", A;
  }({}), Nn = function(A) {
    return A[A.Flex = 0] = "Flex", A[A.None = 1] = "None", A[A.Contents = 2] = "Contents", A;
  }({}), Oe = function(A) {
    return A[A.Left = 0] = "Left", A[A.Top = 1] = "Top", A[A.Right = 2] = "Right", A[A.Bottom = 3] = "Bottom", A[A.Start = 4] = "Start", A[A.End = 5] = "End", A[A.Horizontal = 6] = "Horizontal", A[A.Vertical = 7] = "Vertical", A[A.All = 8] = "All", A;
  }({}), Qt = function(A) {
    return A[A.None = 0] = "None", A[A.StretchFlexBasis = 1] = "StretchFlexBasis", A[A.AbsolutePositionWithoutInsetsExcludesPadding = 2] = "AbsolutePositionWithoutInsetsExcludesPadding", A[A.AbsolutePercentAgainstInnerSize = 4] = "AbsolutePercentAgainstInnerSize", A[A.All = 2147483647] = "All", A[A.Classic = 2147483646] = "Classic", A;
  }({}), Ru = function(A) {
    return A[A.WebFlexBasis = 0] = "WebFlexBasis", A;
  }({}), Tr = function(A) {
    return A[A.Column = 0] = "Column", A[A.ColumnReverse = 1] = "ColumnReverse", A[A.Row = 2] = "Row", A[A.RowReverse = 3] = "RowReverse", A;
  }({}), Fn = function(A) {
    return A[A.Column = 0] = "Column", A[A.Row = 1] = "Row", A[A.All = 2] = "All", A;
  }({}), Ct = function(A) {
    return A[A.FlexStart = 0] = "FlexStart", A[A.Center = 1] = "Center", A[A.FlexEnd = 2] = "FlexEnd", A[A.SpaceBetween = 3] = "SpaceBetween", A[A.SpaceAround = 4] = "SpaceAround", A[A.SpaceEvenly = 5] = "SpaceEvenly", A;
  }({}), dt = function(A) {
    return A[A.Error = 0] = "Error", A[A.Warn = 1] = "Warn", A[A.Info = 2] = "Info", A[A.Debug = 3] = "Debug", A[A.Verbose = 4] = "Verbose", A[A.Fatal = 5] = "Fatal", A;
  }({}), Mn = function(A) {
    return A[A.Undefined = 0] = "Undefined", A[A.Exactly = 1] = "Exactly", A[A.AtMost = 2] = "AtMost", A;
  }({}), ps = function(A) {
    return A[A.Default = 0] = "Default", A[A.Text = 1] = "Text", A;
  }({}), Ln = function(A) {
    return A[A.Visible = 0] = "Visible", A[A.Hidden = 1] = "Hidden", A[A.Scroll = 2] = "Scroll", A;
  }({}), Gn = function(A) {
    return A[A.Static = 0] = "Static", A[A.Relative = 1] = "Relative", A[A.Absolute = 2] = "Absolute", A;
  }({}), pe = function(A) {
    return A[A.Undefined = 0] = "Undefined", A[A.Point = 1] = "Point", A[A.Percent = 2] = "Percent", A[A.Auto = 3] = "Auto", A;
  }({}), Un = function(A) {
    return A[A.NoWrap = 0] = "NoWrap", A[A.Wrap = 1] = "Wrap", A[A.WrapReverse = 2] = "WrapReverse", A;
  }({}), vu = { ALIGN_AUTO: He.Auto, ALIGN_FLEX_START: He.FlexStart, ALIGN_CENTER: He.Center, ALIGN_FLEX_END: He.FlexEnd, ALIGN_STRETCH: He.Stretch, ALIGN_BASELINE: He.Baseline, ALIGN_SPACE_BETWEEN: He.SpaceBetween, ALIGN_SPACE_AROUND: He.SpaceAround, ALIGN_SPACE_EVENLY: He.SpaceEvenly, BOX_SIZING_BORDER_BOX: ds.BorderBox, BOX_SIZING_CONTENT_BOX: ds.ContentBox, DIMENSION_WIDTH: hs.Width, DIMENSION_HEIGHT: hs.Height, DIRECTION_INHERIT: Ft.Inherit, DIRECTION_LTR: Ft.LTR, DIRECTION_RTL: Ft.RTL, DISPLAY_FLEX: Nn.Flex, DISPLAY_NONE: Nn.None, DISPLAY_CONTENTS: Nn.Contents, EDGE_LEFT: Oe.Left, EDGE_TOP: Oe.Top, EDGE_RIGHT: Oe.Right, EDGE_BOTTOM: Oe.Bottom, EDGE_START: Oe.Start, EDGE_END: Oe.End, EDGE_HORIZONTAL: Oe.Horizontal, EDGE_VERTICAL: Oe.Vertical, EDGE_ALL: Oe.All, ERRATA_NONE: Qt.None, ERRATA_STRETCH_FLEX_BASIS: Qt.StretchFlexBasis, ERRATA_ABSOLUTE_POSITION_WITHOUT_INSETS_EXCLUDES_PADDING: Qt.AbsolutePositionWithoutInsetsExcludesPadding, ERRATA_ABSOLUTE_PERCENT_AGAINST_INNER_SIZE: Qt.AbsolutePercentAgainstInnerSize, ERRATA_ALL: Qt.All, ERRATA_CLASSIC: Qt.Classic, EXPERIMENTAL_FEATURE_WEB_FLEX_BASIS: Ru.WebFlexBasis, FLEX_DIRECTION_COLUMN: Tr.Column, FLEX_DIRECTION_COLUMN_REVERSE: Tr.ColumnReverse, FLEX_DIRECTION_ROW: Tr.Row, FLEX_DIRECTION_ROW_REVERSE: Tr.RowReverse, GUTTER_COLUMN: Fn.Column, GUTTER_ROW: Fn.Row, GUTTER_ALL: Fn.All, JUSTIFY_FLEX_START: Ct.FlexStart, JUSTIFY_CENTER: Ct.Center, JUSTIFY_FLEX_END: Ct.FlexEnd, JUSTIFY_SPACE_BETWEEN: Ct.SpaceBetween, JUSTIFY_SPACE_AROUND: Ct.SpaceAround, JUSTIFY_SPACE_EVENLY: Ct.SpaceEvenly, LOG_LEVEL_ERROR: dt.Error, LOG_LEVEL_WARN: dt.Warn, LOG_LEVEL_INFO: dt.Info, LOG_LEVEL_DEBUG: dt.Debug, LOG_LEVEL_VERBOSE: dt.Verbose, LOG_LEVEL_FATAL: dt.Fatal, MEASURE_MODE_UNDEFINED: Mn.Undefined, MEASURE_MODE_EXACTLY: Mn.Exactly, MEASURE_MODE_AT_MOST: Mn.AtMost, NODE_TYPE_DEFAULT: ps.Default, NODE_TYPE_TEXT: ps.Text, OVERFLOW_VISIBLE: Ln.Visible, OVERFLOW_HIDDEN: Ln.Hidden, OVERFLOW_SCROLL: Ln.Scroll, POSITION_TYPE_STATIC: Gn.Static, POSITION_TYPE_RELATIVE: Gn.Relative, POSITION_TYPE_ABSOLUTE: Gn.Absolute, UNIT_UNDEFINED: pe.Undefined, UNIT_POINT: pe.Point, UNIT_PERCENT: pe.Percent, UNIT_AUTO: pe.Auto, WRAP_NO_WRAP: Un.NoWrap, WRAP_WRAP: Un.Wrap, WRAP_WRAP_REVERSE: Un.WrapReverse }, ms = vu;
});
function Hn(A) {
  function e(n, i, o) {
    let s = n[i];
    n[i] = function() {
      for (var a = arguments.length, I = new Array(a), g2 = 0; g2 < a; g2++)
        I[g2] = arguments[g2];
      return o.call(this, s, ...I);
    };
  }
  for (let n of ["setPosition", "setMargin", "setFlexBasis", "setWidth", "setHeight", "setMinWidth", "setMinHeight", "setMaxWidth", "setMaxHeight", "setPadding", "setGap"]) {
    let i = { [pe.Point]: A.Node.prototype[n], [pe.Percent]: A.Node.prototype[`${n}Percent`], [pe.Auto]: A.Node.prototype[`${n}Auto`] };
    e(A.Node.prototype, n, function(o) {
      for (var s = arguments.length, a = new Array(s > 1 ? s - 1 : 0), I = 1; I < s; I++)
        a[I - 1] = arguments[I];
      let g2 = a.pop(), c2, B;
      if (g2 === "auto")
        c2 = pe.Auto, B = void 0;
      else if (typeof g2 == "object")
        c2 = g2.unit, B = g2.valueOf();
      else if (c2 = typeof g2 == "string" && g2.endsWith("%") ? pe.Percent : pe.Point, B = parseFloat(g2), g2 !== void 0 && !Number.isNaN(g2) && Number.isNaN(B))
        throw new Error(`Invalid value ${g2} for ${n}`);
      if (!i[c2])
        throw new Error(`Failed to execute "${n}": Unsupported unit '${g2}'`);
      return B !== void 0 ? i[c2].call(this, ...a, B) : i[c2].call(this, ...a);
    });
  }
  function t(n) {
    return A.MeasureCallback.implement({ measure: function() {
      let { width: i, height: o } = n(...arguments);
      return { width: i ?? NaN, height: o ?? NaN };
    } });
  }
  e(A.Node.prototype, "setMeasureFunc", function(n, i) {
    return i ? n.call(this, t(i)) : this.unsetMeasureFunc();
  });
  function r(n) {
    return A.DirtiedCallback.implement({ dirtied: n });
  }
  return e(A.Node.prototype, "setDirtiedFunc", function(n, i) {
    n.call(this, r(i));
  }), e(A.Config.prototype, "free", function() {
    A.Config.destroy(this);
  }), e(A.Node, "create", (n, i) => i ? A.Node.createWithConfig(i) : A.Node.createDefault()), e(A.Node.prototype, "free", function() {
    A.Node.destroy(this);
  }), e(A.Node.prototype, "freeRecursive", function() {
    for (let n = 0, i = this.getChildCount(); n < i; ++n)
      this.getChild(0).freeRecursive();
    this.free();
  }), e(A.Node.prototype, "calculateLayout", function(n) {
    let i = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : NaN, o = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : NaN, s = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : Ft.LTR;
    return n.call(this, i, o, s);
  }), { Config: A.Config, Node: A.Node, ...ms };
}
var ys = tt(() => {
  Pr();
  Pr();
});
var ws = {};
Lr(ws, { default: () => Fu });
var Nu;
var Fu;
var Ds = tt(() => {
  Nu = (() => {
    var A = import.meta.url;
    return function(e) {
      e = e || {};
      var t;
      t || (t = typeof e < "u" ? e : {});
      var r, n;
      t.ready = new Promise(function(u2, l2) {
        r = u2, n = l2;
      });
      var i = Object.assign({}, t), o = "";
      typeof document < "u" && document.currentScript && (o = document.currentScript.src), A && (o = A), o.indexOf("blob:") !== 0 ? o = o.substr(0, o.replace(/[?#].*/, "").lastIndexOf("/") + 1) : o = "";
      var s = t.print || console.log.bind(console), a = t.printErr || console.warn.bind(console);
      Object.assign(t, i), i = null;
      var I;
      t.wasmBinary && (I = t.wasmBinary);
      var g2 = t.noExitRuntime || true;
      typeof WebAssembly != "object" && $("no native wasm support detected");
      var c2, B = false;
      function E(u2, l2, f) {
        f = l2 + f;
        for (var C = ""; !(l2 >= f); ) {
          var h2 = u2[l2++];
          if (!h2)
            break;
          if (h2 & 128) {
            var S2 = u2[l2++] & 63;
            if ((h2 & 224) == 192)
              C += String.fromCharCode((h2 & 31) << 6 | S2);
            else {
              var k = u2[l2++] & 63;
              h2 = (h2 & 240) == 224 ? (h2 & 15) << 12 | S2 << 6 | k : (h2 & 7) << 18 | S2 << 12 | k << 6 | u2[l2++] & 63, 65536 > h2 ? C += String.fromCharCode(h2) : (h2 -= 65536, C += String.fromCharCode(55296 | h2 >> 10, 56320 | h2 & 1023));
            }
          } else
            C += String.fromCharCode(h2);
        }
        return C;
      }
      var Q, d2, m2, D, x2, y, p, b, R2;
      function U() {
        var u2 = c2.buffer;
        Q = u2, t.HEAP8 = d2 = new Int8Array(u2), t.HEAP16 = D = new Int16Array(u2), t.HEAP32 = y = new Int32Array(u2), t.HEAPU8 = m2 = new Uint8Array(u2), t.HEAPU16 = x2 = new Uint16Array(u2), t.HEAPU32 = p = new Uint32Array(u2), t.HEAPF32 = b = new Float32Array(u2), t.HEAPF64 = R2 = new Float64Array(u2);
      }
      var P2, q = [], lA = [], DA = [];
      function RA() {
        var u2 = t.preRun.shift();
        q.unshift(u2);
      }
      var eA = 0, NA = null, nA = null;
      function $(u2) {
        throw t.onAbort && t.onAbort(u2), u2 = "Aborted(" + u2 + ")", a(u2), B = true, u2 = new WebAssembly.RuntimeError(u2 + ". Build with -sASSERTIONS for more info."), n(u2), u2;
      }
      function HA(u2) {
        return u2.startsWith("data:application/octet-stream;base64,");
      }
      var tA;
      if (tA = "data:application/octet-stream;base64,AGFzbQEAAAABugM3YAF/AGACf38AYAF/AX9gA39/fwBgAn98AGACf38Bf2ADf39/AX9gBH9/f30BfWADf398AGAAAGAEf39/fwBgAX8BfGACf38BfGAFf39/f38Bf2AAAX9gA39/fwF9YAZ/f31/fX8AYAV/f39/fwBgAn9/AX1gBX9/f319AX1gAX8BfWADf35/AX5gB39/f39/f38AYAZ/f39/f38AYAR/f39/AX9gBn9/f319fQF9YAR/f31/AGADf399AX1gBn98f39/fwF/YAR/fHx/AGACf30AYAh/f39/f39/fwBgDX9/f39/f39/f39/f38AYAp/f39/f39/f39/AGAFf39/f38BfGAEfHx/fwF9YA1/fX1/f399fX9/f39/AX9gB39/f319f38AYAJ+fwF/YAN/fX0BfWABfAF8YAN/fHwAYAR/f319AGAHf39/fX19fQF9YA1/fX99f31/fX19fX1/AX9gC39/f39/f399fX19AX9gCH9/f39/f319AGAEf39+fgBgB39/f39/f38Bf2ACfH8BfGAFf398fH8AYAN/f38BfGAEf39/fABgA39/fQBgBn9/fX99fwF/ArUBHgFhAWEAHwFhAWIAAwFhAWMACQFhAWQAFgFhAWUAEQFhAWYAIAFhAWcAAAFhAWgAIQFhAWkAAwFhAWoAAAFhAWsAFwFhAWwACgFhAW0ABQFhAW4AAwFhAW8AAQFhAXAAFwFhAXEABgFhAXIAAAFhAXMAIgFhAXQACgFhAXUADQFhAXYAFgFhAXcAAgFhAXgAAwFhAXkAGAFhAXoAAgFhAUEAAQFhAUIAEQFhAUMAAQFhAUQAAAOiAqACAgMSBwcACRkDAAoRBgYKEwAPDxMBBiMTCgcHGgMUASQFJRQHAwMKCgMmAQYYDxobFAAKBw8KBwMDAgkCAAAFGwACBwIHBgIDAQMIDAABKAkHBQURACkZASoAAAIrLAIALQcHBy4HLwkFCgMCMA0xAgMJAgACAQYKAQIBBQEACQIFAQEABQAODQ0GFQIBHBUGAgkCEAAAAAUyDzMMBQYINAUCAwUODg41AgMCAgIDBgICNgIBDAwMAQsLCwsLCx0CAAIAAAABABABBQICAQMCEgMMCwEBAQEBAQsLAQICAwICAgICAgIDAgIICAEICAgEBAQEBAQEBAQABAQABAQEBAAE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GiABQQA2AvADIAFCADcC6AMgAigC7AMiAyACKALoAyIERwRAIAMgBGsiBEEASA0FIAEgBBAeIgM2AuwDIAEgAzYC6AMgASADIARqNgLwAyACKALoAyIEIAIoAuwDIghHBEADQCADIAQoAgA2AgAgA0EEaiEDIARBBGoiBCAIRw0ACwsgASADNgLsAwsgASACKQL0AzcC9AMgASACKAKEBDYChAQgASACKQL8AzcC/AMgAUEANgLkAwsgBSABNgIAIAEgADYC5AMLIAZBAWohBiAFQQRqIgUgB0cNAAsLDwsQAgALUAACQAJAAkACQAJAIAIOBAQAAQIDCyAAIAEgAUEwahBDDwsgACABIAFBMGogAxBEDwsgACABIAFBMGoQQg8LECQACyAAIAEgAUEwaiADEEULcAIBfwF9IwBBEGsiBCQAIARBCGogACABQQJ0QdwlaigCACACEDZDAADAfyEFAkACQAJAIAQtAAxBAWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwt5AgF/AX0jAEEQayIDJAAgA0EIaiAAIAFBAnRB7CVqKAIAIAIQU0MAAMB/IQQCQAJAAkAgAy0ADEEBaw4CAAECCyADKgIIIQQMAQsgAyoCCEMAAAAAlEMK1yM8lCEECyADQRBqJAAgBEMAAAAAl0MAAAAAIAQgBFsbC1QAAkACQAJAAkACQCACDgQEAAECAwsgACABIAFBwgBqEEMPCyAAIAEgAUHCAGogAxBEDwsgACABIAFBwgBqEEIPCxAkAAsgACABIAFBwgBqIAMQRQsvACAAIAJFQQF0IgIgASADEGAgACACIAEQS5IgACACIAEgAxB/IAAgAiABEFKSkgvOAQIDfwJ9IwBBEGsiAyQAQQEhBCADQQhqIABB/ABqIgUgACABQQF0akH2AGoiAS8BABAfAkACQCADKgIIIgcgAioCACIGXARAIAcgB1sEQCACLQAEIQIMAgsgBiAGXCEECyACLQAEIQIgBEUNACADLQAMIAJB/wFxRg0BCyAFIAEgBiACEDkDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCyADQRBqJAALzgECA38CfSMAQRBrIgMk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AWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwscACAAIAFBCCACpyACQiCIpyADpyADQiCIpxAVCwUAEFgACzkAIABFBEBBAA8LAn8gAUGAf3FBgL8DRiABQf8ATXJFBEBB/DtBGTYCAEF/DAELIAAgAToAAEEBCwvEAgACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCABQQlrDhIACgsMCgsCAwQFDAsMDAoLBwgJCyACIAIoAgAiAUEEajYCACAAIAEoAgA2AgAPCwALIAIgAigCACIBQQRqNgIAIAAgATIBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATMBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATAAADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATEAADcDAA8LAAsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKwMAOQMADwsgACACIAMRAQALDwsgAiACKAIAIgFBBGo2AgAgACABNAIANwMADwsgAiACKAIAIgFBBGo2AgAgACABNQIANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKQMANwMAC84BAgN/An0jAEEQayIDJABBASEEIANBCGogAEH8AGoiBSAAIAFBAXRqQegAaiIBLwEAEB8CQAJAIAMqAggiByACKgIAIgZcBEAgByAHWwRAIAItAAQhAgwCCyAGIAZcIQQLIAItAAQhAiAERQ0AIAMtAAwgAkH/AXFGDQELIAUgASAGIAIQOQNAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLIANBEGokAAtdAQR/IAAoAgAhAgNAIAIsAAAiAxBXBEBBfyEEIAAgAkEBaiICNgIAIAFBzJmz5gBNBH9BfyADQTBrIgMgAUEKbCIEaiADIARB/////wdzShsFIAQLIQEMAQsLIAELrhQCEn8BfiMAQdAAayIIJAAgCCABNgJMIAhBN2ohFyAIQThqIRQCQAJAAkACQANAIAEhDSAHIA5B/////wdzSg0BIAcgDmohDgJAAkACQCANIgctAAAiCQRAA0ACQAJAIAlB/wFxIgFFBEAgByEBDAELIAFBJUcNASAH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IQEgAEIANwIEIAAgATYCACABIAA2AgQgAkEQaiQAIAALGwEBfyAABEAgACgCACIBBEAgARAjCyAAECMLC0kBAn9BBBAeIQFBIBAeIgBBADYCHCAAQoCAgICAgIDAPzcCFCAAQgA3AgwgAEEAOgAIIABBAzYCBCAAQQA2AgAgASAANgIAIAELIAAgAkEFR0EAIAIbRQRAQbgwIAMgBBBJDwsgAyAEEHALIgEBfiABIAKtIAOtQiCGhCAEIAARFQAiBUIgiKckASAFpwuoAQEFfyAAKAJUIgMoAgAhBSADKAIEIgQgACgCFCAAKAIcIgdrIgYgBCAGSRsiBgRAIAUgByAGECsaIAMgAygCACAGaiIFNgIAIAMgAygCBCAGayIENgIECyAEIAIgAiAESxsiBARAIAUgASAEECsaIAMgAygCACAEaiIFNgIAIAMgAygCBCAEazYCBAsgBUEAOgAAIAAgACgCLCIBNgIcIAAgATYCFCACCwQAQgALBABBAAuKBQIGfgJ/IAEgASgCAEEHakF4cSIBQRBqNgIAIAAhCSABKQMAIQMgASkDCCEGIwBBIGsiCCQAAkAgBkL///////////8AgyIEQoCAgICAgMCAPH0gBEKAgICAgIDA/8MAfVQEQCAGQgSGIANCPIiEIQQgA0L//////////w+DIgNCgYCAgICAgIAIWgRAIARCgYCAgICAgIDAAHwhAgwCCyAEQoCAgICAgICAQH0hAiADQoCAgICAgICACFINASACIARCAYN8IQIMAQsgA1AgBEKAgICAgIDA//8AVCAEQoCAgICAgMD//wBRG0UEQCAGQgSGIANCPIiEQv////////8Dg0KAgICAgICA/P8AhCECDAELQoCAgICAgID4/wAhAiAEQv///////7//wwBWDQBCACECIARCMIinIgBBkfcASQ0AIAMhAiAGQv///////z+DQoCAgICAgMAAhCIFIQcCQCAAQYH3AGsiAUHAAHEEQCACIAFBQGqthiEHQgAhAgwBCyABRQ0AIAcgAa0iBIYgAkHAACABa62IhCEHIAIgBIYhAgsgCCACNwMQIAggBzcDGAJAQYH4ACAAayIAQcAAcQRAIAUgAEFAaq2IIQNCACEFDAELIABFDQAgBUHAACAAa62GIAMgAK0iAoiEIQMgBSACiCEFCyAIIAM3AwAgCCAF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ASAAKAIAIQAgASACQQFxBH8gASgCACAAaigCAAUgAAsRCwALYQECfyMAQRBrIgIkACABIAAoAgQiA0EBdWohASAAKAIAIQAgAiABIANBAXEEfyABKAIAIABqKAIABSAACxEBAEEQEB4iACACKQMINwMIIAAgAikDADcDACACQRBqJAAgAAtjAQJ/IwBBEGsiAyQAIAEgACgCBCIEQQF1aiEBIAAoAgAhACADIAEgAiAEQQFxBH8gASgCACAAaigCAAUgAAsRAwBBEBAeIgAgAykDCDcDCCAAIAMpAwA3AwAgA0EQaiQAIAALNwEBfyABIAAoAgQiA0EBdWohASAAKAIAIQAgASACIANBAXEEfyABKAIAIABqKAIABSAACxEEAAs5AQF/IAEgACgCBCIEQQF1aiEBIAAoAgAhACABIAIgAyAEQQFxBH8gASgCACAAaigCAAUgAAsRCAALCQAgASAAEQIACwUAQcM7Cw8AIAEgACgCAGogAjYCAAsNACABIAAoAgBqKAIACxgBAX9BEBAeIgBCADcDCCAAQQA2AgAgAAsYAQF/QRAQHiIAQgA3AwAgAEIANwMIIAALDABBMBAeQQBBMBAqCzcBAX8gASAAKAIEIgNBAXVqIQEgACgCACEAIAEgAiADQQFxBH8gASgCACAAaigCAAUgAAsRHgALBQBBvjsLIQAgACABKAIAIAEgASwAC0EASBtBuzsgAigCABAQNgIACyoBAX9BDBAeIgFBADoABCABIAAoAgA2AgggAEEANgIAIAFB2Cc2AgAgAQsFAEG7OwsFAEG4OwshACAAIAEoAgAgASABLAALQQBIG0GkOyACKAIAEBA2AgAL2AEBBH8jAEEgayIDJAAgASgCACIEQfD///8HSQRAAkACQCAEQQtPBEAgBEEPckEBaiIFEB4hBiADIAVBgICAgHhyNgIQIAMgBjYCCCADIAQ2AgwgBCAGaiEFDAELIAMgBDoAEyADQQhqIgYgBGohBSAERQ0BCyAGIAFBBGogBBArGgsgBUEAOgAAIAMgAjYCACADQRhqIANBCGogAyAAEQMAIAMoAhgQHSADKAIYIgAQBiADKAIAEAYgAywAE0EASARAIAMoAggQIwsgA0EgaiQAIAAPCxACAAsqAQF/QQwQHiIBQQA6AAQgASAAKAIANgIIIABBADYCACABQeAmNgIAIAELBQBBpDsLaQECfyMAQRBrIgYkACABIAAoAgQiB0EBdWohASAAKAIAIQAgBiABIAIgAyAEIAUgB0EBcQR/IAEoAgAgAGooAgAFIAALERAAQRAQHiIAIAYpAwg3AwggACAGKQMANwMAIAZBEGokACAACwUAQaA7Cx0AIAAoAgAiACAALQAAQfcBcUEIQQAgARtyOgAAC6oBAgJ/AX0jAEEQayICJAAgACgCACEAIAFB/wFxIgNBBkkEQAJ/AkACQAJAIANBBGsOAgABAgsgAEHUA2ogAC0AiANBA3FBAkYNAhogAEHMA2oMAgsgAEHMA2ogAC0AiANBA3FBAkYNARogAEHUA2oMAQsgACABQf8BcUECdGpBzANqCyoCACEEIAJBEGokACAEuw8LIAJB7hA2AgAgAEEFQdglIAIQLBAkAAuqAQICfwF9IwBBEGsiAiQAIAAoAgAhACABQf8BcSIDQQZJBEACfwJAAkACQCADQQRrDgIAAQILIABBxANqIAAtAIgDQQNxQQJGDQIaIABBvANqDAILIABBvANqIAAtAIgDQQNxQQJGDQEaIABBxANqDAELIAAgAUH/AXFBAnRqQbwDagsqAgAhBCACQRBqJAAgBLsPCyACQe4QNgIAIABBBUHYJSACECwQJAALqgECAn8BfSMAQRBrIgIkACAAKAIAIQAgAUH/AXEiA0EGSQRAAn8CQAJAAkAgA0EEaw4CAAECCyAAQbQDaiAALQCIA0EDcUECRg0CGiAAQawDagwCCyAAQawDaiAALQCIA0EDcUECRg0BGiAAQbQDagwBCyAAIAFB/wFxQQJ0akGsA2oLKgIAIQQgAkEQaiQAIAS7DwsgAkHuEDYCACAAQQVB2CUgAhAsECQAC08AIAAgASgCACIBKgKcA7s5AwAgACABKgKkA7s5AwggACABKgKgA7s5AxAgACABKgKoA7s5AxggACABKgKMA7s5AyAgACABKgKQA7s5AygLDAAgACgCACoCkAO7CwwAIAAoAgAqAowDuwsMACAAKAIAKgKoA7sLDAAgACgCACoCoAO7CwwAIAAoAgAqAqQDuwsMACAAKAIAKgKcA7sL6AMCBH0FfyMAQUBqIgokACAAKAIAIQAgCkEIakEAQTgQKhpB8DpB8DooAgBBAWo2AgAgABB4IAAtABRBA3EiCCADQQEgA0H/AXEbIAgbIQkgAEEUaiEIIAG2IQQgACoC+AMhBQJ9AkACQAJAIAAtAPwDQQFrDgIBAAILIAUgBJRDCtcjPJQhBQsgBUMAAAAAYEUNACAAIAlB/wFxQQAgBCAEEDEgCEECQQEgBBAiIAhBAkEBIAQQIZKSDAELIAggCUH/AXFBACAEIAQQLSIFIAVbBEBBAiELIAggCUH/AXFBACAEIAQQLQwBCyAEIARcIQsgBAshByACtiEFIAAqAoAEIQYgACAHAn0CQAJAAkAgAC0AhARBAWsOAgEAAgsgBiAFlEMK1yM8lCEGCyAGQwAAAABgRQ0AIAAgCUH/AXFBASAFIAQQMSAIQQBBASAEECIgCEEAQQEgBBAhkpIMAQsgCCAJQf8BcSIJQQEgBSAEEC0iBiAGWwRAQQIhDCAIIAlBASAFIAQQLQwBCyAFIAVcIQwgBQsgA0H/AXEgCyAMIAQgBUEBQQAgCkEIakEAQfA6KAIAED0EQCAAIAAtAIgDQQNxIAQgBRB2IABEAAAAAAAAAABEAAAAAAAAAAAQcwsgCkFAayQACw0AIAAoAgAtAABBAXELFQAgACgCACIAIAAtAABB/gFxOgAACxAAIAAoAgAtAABBBHFBAnYLegECfyMAQRBrIgEkACAAKAIAIgAoAggEQANAIAAtAAAiAkEEcUUEQCAAIAJBBHI6AAAgACgCECICBEAgACACEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQELCyABQRBqJAAPCyABQYAINgIAIABBBUHYJSABECwQJAALLgEBfyAAKAIIIQEgAEEANgIIIAEEQCABIAEoAgAoAgQRAAALIAAoAgBBADYCEAsXACAAKAIEKAIIIgAgACgCACgCCBEAAAsuAQF/IAAoAgghAiAAIAE2AgggAgRAIAIgAigCACgCBBEAAAsgACgCAEEFNgIQCz4BAX8gACgCBCEBIABBADYCBCABBEAgASABKAIAKAIEEQAACyAAKAIAIgBBADYCCCAAIAAtAABB7wFxOgAAC0kBAX8jAEEQayIGJAAgBiABKAIEKAIEIgEgAiADIAQgBSABKAIAKAIIERAAIAAgBisDALY4AgAgACAGKwMItjgCBCAGQRBqJAALcwECfyMAQRBrIgIkACAAKAIEIQMgACABNgIEIAMEQCADIAMoAgAoAgQRAAALIAAoAgAiACgC6AMgACgC7ANHBEAgAkH5IzYCACAAQQVB2CUgAhAsECQACyAAQQQ2AgggACAALQAAQRByOgAAIAJBEGokAAs8AQF/AkAgACgCACIAKALsAyAAKALoAyIAa0ECdSABTQ0AIAAgAUECdGooAgAiAEUNACAAKAIEIQILIAILGQAgACgCACgC5AMiAEUEQEEADwsgACgCBAsXACAAKAIAIgAoAuwDIAAoAugDa0ECdQuOAwEDfyMAQdACayICJAACQCAAKAIAIgAoAuwDIAAoAugDRg0AIAEoAgAiAygC5AMhASAAIAMQb0UNACAAIAFGBEAgAkEIakEAQcQCECoaIAJBADoAGCACQgA3AxAgAkGAgID+BzYCDCACQRxqQQBBxAEQKhogAkHgAWohBCACQSBqIQEDQCABQoCAgPyLgIDAv383AhAgAUKBgICAEDcCCCABQoCAgPyLgIDAv383AgAgAUEYaiIBIARHDQALIAJCgICA/IuAgMC/fzcD8AEgAkKBgICAEDcD6AEgAkKAgID8i4CAwL9/NwPgASACQoCAgP6HgIDg/wA3AoQCIAJCgICA/oeAgOD/ADcC/AEgAiACLQD4AUH4AXE6APgBIAJBjAJqQQBBwAAQKhogA0GYAWogAkEIakHEAhArGiADQQA2AuQDCwNAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLIAJB0AJqJAAL4AcBCH8jAEHQAGsiByQAIAAoAgAhAAJAAkAgASgCACIIKALkA0UEQCAAKAIIDQEgCC0AF0EQdEGAgDBxQYCAIEYEQCAAIAAoAuADQQFqNgLgAwsgACgC6AMiASACQQJ0aiEGAkAgACgC7AMiBCAAQfADaiIDKAIAIgVJBEAgBCAGRgRAIAYgCDYCACAAIAZBBGo2AuwDDAILIAQgBCICQQRrIgFLBEADQCACIAEoAgA2AgAgAkEEaiECIAFBBGoiASAESQ0ACwsgACACNgLsAyAGQQRqIgEgBEcEQCAEIAQgAWsiAUF8cWsgBiABEDMaCyAGIAg2AgAMAQsgBCABa0ECdUEBaiIEQYCAgIAETw0DAkAgB0EgakH/////AyAFIAFrIgFBAXUiBSAEIAQgBUkbIAFB/P///wdPGyACIAMQSiIDKAIIIgIgAygCDEcNACADKAIEIgEgAygCACIESwRAIAMgASABIARrQQJ1QQFqQX5tQQJ0IgRqIAEgAiABayIBEDMgAWoiAjYCCCADIAMoAgQgBGo2AgQMAQsgB0E4akEBIAIgBGtBAXUgAiAERhsiASABQQJ2IAMoAhAQSiIFKAIIIQQCfyADKAIIIgIgAygCBCIBRgRAIAQhAiABDAELIAQgAiABa2ohAgNAIAQgASgCADYCACABQQRqIQEgBEEEaiIEIAJHDQALIAMoAgghASADKAIECyEEIAMoAgAhCSADIAUoAgA2AgAgBSAJNgIAIAMgBSgCBDYCBCAFIAQ2AgQgAyACNgIIIAUgATYCCCADKAIMIQogAyAFKAIMNgIMIAUgCjYCDCABIARHBEAgBSABIAQgAWtBA2pBfHFqNgIICyAJRQ0AIAkQIyADKAIIIQILIAIgCDYCACADIAMoAghBBGo2AgggAyADKAIEIAYgACgC6AMiAWsiAmsgASACEDM2AgQgAygCCCAGIAAoAuwDIAZrIgQQMyEGIAAoAugDIQEgACADKAIENgLoAyADIAE2AgQgACgC7AMhAiAAIAQgBmo2AuwDIAMgAjYCCCAAKALwAyEEIAAgAygCDDYC8AMgAyABNgIAIAMgBDYCDCABIAJHBEAgAyACIAEgAmtBA2pBfHFqNgIICyABRQ0AIAEQIwsgCCAANgLkAwNAIAAtAAAiAUEEcUUEQCAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQELCyAHQdAAaiQADwsgB0HEIzYCECAAQQVB2CUgB0EQahAsECQACyAHQckkNgIAIABBBUHYJSAHECwQJAALEAIACxAAIAAoAgAtAABBAnFBAXYLWQIBfwF9IwBBEGsiAiQAIAJBCGogACgCACIAQfwAaiAAIAFB/wFxQQF0ai8BaBAfQwAAwH8hAwJAAkAgAi0ADA4EAQAAAQALIAIqAgghAwsgAkEQaiQAIAMLTgEBfyMAQRBrIgMkACADQQhqIAEoAgAiAUH8AGogASACQf8BcUEBdGovAUQQHyADLQAMIQEgACADKgIIuzkDCCAAIAE2AgAgA0EQaiQAC14CAX8BfCMAQRBrIgIkACACQQhqIAAoAgAiAEH8AGogACABQf8BcUEBdGovAVYQH0QAAAAAAAD4fyEDAkACQCACLQAMDgQBAAABAAsgAioCCLshAwsgAkEQaiQAIAMLJAEBfUMAAMB/IAAoAgAiAEH8AGogAC8BehAgIgEgASABXBu7C0QBAX8jAEEQayICJAAgAkEIaiABKAIAIgFB/ABqIAEvAXgQHyACLQAMIQEgACACKgIIuzkDCCAAIAE2AgAgAkEQaiQAC0QBAX8jAEEQayICJAAgAkEIaiABKAIAIgFB/ABqIAEvAXYQHyACLQAMIQEgACACKgIIuzkDCCAAIAE2AgAgAkEQaiQAC0QBAX8jAEEQayICJAAgAkEIaiABKAIAIgFB/ABqIAEvAXQQHyACLQAMIQEgACACKgIIuzkDCCAAIAE2AgAgAkEQaiQAC0QBAX8jAEEQayICJAAgAkEIaiABKAIAIgFB/ABqIAEvAXIQHyACLQAMIQEgACACKgIIuzkDCCAAIAE2AgAgAkEQaiQAC0QBAX8jAEEQayICJAAgAkEIaiABKAIAIgFB/ABqIAEvAXAQHyACLQAMIQEgACACKgIIuzkDCCAAIAE2AgAgAkEQaiQAC0QBAX8jAEEQayICJAAgAkEIaiABKAIAIgFB/ABqIAEvAW4QHyACLQAMIQEgACACKgIIuzkDCCAAIAE2AgAgAkEQaiQAC0gCAX8BfQJ9IAAoAgAiAEH8AGoiASAALwEcECAiAiACXARAQwAAgD9DAAAAACAAKAL0Ay0ACEEBcRsMAQsgASAALwEcECALuws2AgF/AX0gACgCACIAQfwAaiIBIAAvARoQICICIAJcBEBEAAAAAAAAAAAPCyABIAAvARoQILsLRAEBfyMAQRBrIgIkACACQQhqIAEoAgAiAUH8AGogAS8BHhAfIAItAAwhASAAIAIqAgi7OQMIIAAgATYCACACQRBqJAALEAAgACgCAC0AF0ECdkEDcQsNACAAKAIALQAXQQNxC04BAX8jAEEQayIDJAAgA0EIaiABKAIAIgFB/ABqIAEgAkH/AXFBAXRqLwEgEB8gAy0ADCEBIAAgAyoCCLs5AwggACABNgIAIANBEGokAAsQACAAKAIALQAUQQR2QQdxCw0AIAAoAgAvABVBDnYLDQAgACgCAC0AFEEDcQsQACAAKAIALQAUQQJ2QQNxCw0AIAAoAgAvABZBD3ELEAAgACgCAC8AFUEEdkEPcQsNACAAKAIALwAVQQ9xC04BAX8jAEEQayIDJAAgA0EIaiABKAIAIgFB/ABqIAEgAkH/AXFBAXRqLwEyEB8gAy0ADCEBIAAgAyoCCLs5AwggACABNgIAIANBEGokAAsQACAAKAIALwAVQQx2QQNxCxAAIAAoAgAtABdBBHZBAXELgQECA38BfSMAQRBrIgMkACAAKAIAIQQCfSACtiIGIAZcBEBBACEAQwAAwH8MAQtBAEECIAZDAACAf1sgBkMAAID/W3IiBRshAEMAAMB/IAYgBRsLIQYgAyAAOgAMIAMgBjgCCCADIAMpAwg3AwAgBCABQf8BcSADEIgBIANBEGokAAt5AgF9An8jAEEQayIEJAAgACgCACEFIAQCfyACtiIDIANcBEBDAADAfyEDQQAMAQtDAADAfyADIANDAACAf1sgA0MAAID/W3IiABshAyAARQs6AAwgBCADOAIIIAQgBCkDCDcDACAFIAFB/wFxIAQQiAEgBEEQaiQAC3EBAX8CQCAAKAIAIgAtAAAiAkECcUEBdiABRg0AIAAgAkH9AXFBAkEAIAEbcjoAAANAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLC4EBAgN/AX0jAEEQayIDJAAgACgCACEEAn0gArYiBiAGXARAQQAhAEMAAMB/DAELQQBBAiAGQwAAgH9bIAZDAACA/1tyIgUbIQBDAADAfyAGIAUbCyEGIAMgADoADCADIAY4AgggAyADKQMINwMAIAQgAUH/AXEgAxCOASADQRBqJAALeQIBfQJ/IwBBEGsiBCQAIAAoAgAhBSAEAn8gArYiAyADXARAQwAAwH8hA0EADAELQwAAwH8gAyADQwAAgH9bIANDAACA/1tyIgAbIQMgAEULOgAMIAQgAzgCCCAEIAQpAwg3AwAgBSABQf8BcSAEEI4BIARBEGokAAv5AQICfQR/IwBBEGsiBSQAIAAoAgAhAAJ/IAK2IgMgA1wEQEMAAMB/IQNBAAwBC0MAAMB/IAMgA0MAAIB/WyADQwAAgP9bciIGGyEDIAZFCyEGQQEhByAFQQhqIABB/ABqIgggACABQf8BcUEBdGpB1gBqIgEvAQAQHwJAAkAgAyAFKgIIIgRcBH8gBCAEWw0BIAMgA1wFIAcLRQ0AIAUtAAwgBkYNAQsgCCABIAMgBhA5A0AgAC0AACIBQQRxDQEgACABQQRyOgAAIAAoAhAiAQRAIAAgAREAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsgBUEQaiQAC7UBAgN/An0CQCAAKAIAIgBB/ABqIgMgAEH6AGoiAi8BABAgIgYgAbYiBVsNACAFIAVbIgRFIAYgBlxxDQACQCAEIAVDAAAAAFsgBYtDAACAf1tyRXFFBEAgAiACLwEAQfj/A3E7AQAMAQsgAyACIAVBAxBMCwNAIAAtAAAiAkEEcQ0BIAAgAkEEcjoAACAAKAIQIgIEQCAAIAIRAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLC3wCA38BfSMAQRBrIgIkACAAKAIAIQMCfSABtiIFIAVcBEBBACEAQwAAwH8MAQtBAEECIAVDAACAf1sgBUMAAID/W3IiBBshAEMAAMB/IAUgBBsLIQUgAiAAOgAMIAIgBTgCCCACIAIpAwg3AwAgA0EBIAIQVSACQRBqJAALdAIBfQJ/IwBBEGsiAyQAIAAoAgAhBCADAn8gAbYiAiACXARAQwAAwH8hAkEADAELQwAAwH8gAiACQwAAgH9bIAJDAACA/1tyIgAbIQIgAEULOgAMIAMgAjgCCCADIAMpAwg3AwAgBEEBIAMQVSADQRBqJAALfAIDfwF9IwBBEGsiAiQAIAAoAgAhAwJ9IAG2IgUgBVwEQEEAIQBDAADAfwwBC0EAQQIgBUMAAIB/WyAFQwAAgP9bciIEGyEAQwAAwH8gBSAEGwshBSACIAA6AAwgAiAFOAIIIAIgAikDCDcDACADQQAgAhBVIAJBEGokAAt0AgF9An8jAEEQayIDJAAgACgCACEEIAMCfyABtiICIAJcBEBDAADAfyECQQAMAQtDAADAfyACIAJDAACAf1sgAkMAAID/W3IiABshAiAARQs6AAwgAyACOAIIIAMgAykDCDcDACAEQQAgAxBVIANBEGokAAt8AgN/AX0jAEEQayICJAAgACgCACEDAn0gAbYiBSAFXARAQQAhAEMAAMB/DAELQQBBAiAFQwAAgH9bIAVDAACA/1tyIgQbIQBDAADAfyAFIAQbCyEFIAIgADoADCACIAU4AgggAiACKQMINwMAIANBASACEFYgAkEQaiQAC3QCAX0CfyMAQRBrIgMkACAAKAIAIQQgAwJ/IAG2IgIgAlwEQEMAAMB/IQJBAAwBC0MAAMB/IAIgAkMAAIB/WyACQwAAgP9bciIAGyECIABFCzoADCADIAI4AgggAyADKQMINwMAIARBASADEFYgA0EQaiQAC3wCA38BfSMAQRBrIgIkACAAKAIAIQMCfSABtiIFIAVcBEBBACEAQwAAwH8MAQtBAEECIAVDAACAf1sgBUMAAID/W3IiBBshAEMAAMB/IAUgBBsLIQUgAiAAOgAMIAIgBTgCCCACIAIpAwg3AwAgA0EAIAIQViACQRBqJAALdAIBfQJ/IwBBEGsiAyQAIAAoAgAhBCADAn8gAbYiAiACXARAQwAAwH8hAkEADAELQwAAwH8gAiACQwAAgH9bIAJDAACA/1tyIgAbIQIgAEULOgAMIAMgAjgCCCADIAMpAwg3AwAgBEEAIAMQViADQRBqJAALPwEBfyMAQRBrIgEkACAAKAIAIQAgAUEDOgAMIAFBgICA/gc2AgggASABKQMINwMAIABBASABEEYgAUEQaiQAC3wCA38BfSMAQRBrIgIkACAAKAIAIQMCfSABtiIFIAVcBEBBACEAQwAAwH8MAQtBAEECIAVDAACAf1sgBUMAAID/W3IiBBshAEMAAMB/IAUgBBsLIQUgAiAAOgAMIAIgBTgCCCACIAIpAwg3AwAgA0EBIAIQRiACQRBqJAALdAIBfQJ/IwBBEGsiAyQAIAAoAgAhBCADAn8gAbYiAiACXARAQwAAwH8hAkEADAELQwAAwH8gAiACQwAAgH9bIAJDAACA/1tyIgAbIQIgAEULOgAMIAMgAjgCCCADIAMpAwg3AwAgBEEBIAMQRiADQRBqJAALPwEBfyMAQRBrIgEkACAAKAIAIQAgAUEDOgAMIAFBgICA/gc2AgggASABKQMINwMAIABBACABEEYgAUEQaiQAC3wCA38BfSMAQRBrIgIkACAAKAIAIQMCfSABtiIFIAVcBEBBACEAQwAAwH8MAQtBAEECIAVDAACAf1sgBUMAAID/W3IiBBshAEMAAMB/IAUgBBsLIQUgAiAAOgAMIAIgBTgCCCACIAIpAwg3AwAgA0EAIAIQRiACQRBqJAALdAIBfQJ/IwBBEGsiAyQAIAAoAgAhBCADAn8gAbYiAiACXARAQwAAwH8hAkEADAELQwAAwH8gAiACQwAAgH9bIAJDAACA/1tyIgAbIQIgAEULOgAMIAMgAjgCCCADIAMpAwg3AwAgBEEAIAMQRiADQRBqJAALoAECA38CfQJAIAAoAgAiAEH8AGoiAyAAQRxqIgIvAQAQICIGIAG2IgVbDQAgBSAFWyIERSAGIAZccQ0AAkAgBEUEQCACIAIvAQBB+P8DcTsBAAwBCyADIAIgBUEDEEwLA0AgAC0AACICQQRxDQEgACACQQRyOgAAIAAoAhAiAgRAIAAgAhEAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsLoAECA38CfQJAIAAoAgAiAEH8AGoiAyAAQRpqIgIvAQAQICIGIAG2IgVbDQAgBSAFWyIERSAGIAZccQ0AAkAgBEUEQCACIAIvAQBB+P8DcTsBAAwBCyADIAIgBUEDEEwLA0AgAC0AACICQQRxDQEgACACQQRyOgAAIAAoAhAiAgRAIAAgAhEAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsLPQEBfyMAQRBrIgEkACAAKAIAIQAgAUEDOgAMIAFBgICA/gc2AgggASABKQMINwMAIAAgARBrIAFBEGokAAt6AgN/AX0jAEEQayICJAAgACgCACEDAn0gAbYiBSAFXARAQQAhAEMAAMB/DAELQQBBAiAFQwAAgH9bIAVDAACA/1tyIgQbIQBDAADAfyAFIAQbCyEFIAIgADoADCACIAU4AgggAiACKQMINwMAIAMgAhBrIAJBEGokAAtyAgF9An8jAEEQayIDJAAgACgCACEEIAMCfyABtiICIAJcBEBDAADAfyECQQAMAQtDAADAfyACIAJDAACAf1sgAkMAAID/W3IiABshAiAARQs6AAwgAyACOAIIIAMgAykDCDcDACAEIAMQayADQRBqJAALoAECA38CfQJAIAAoAgAiAEH8AGoiAyAAQRhqIgIvAQAQICIGIAG2IgVbDQAgBSAFWyIERSAGIAZccQ0AAkAgBEUEQCACIAIvAQBB+P8DcTsBAAwBCyADIAIgBUEDEEwLA0AgAC0AACICQQRxDQEgACACQQRyOgAAIAAoAhAiAgRAIAAgAhEAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsLkAEBAX8CQCAAKAIAIgBBF2otAAAiAkECdkEDcSABQf8BcUYNACAAIAAvABUgAkEQdHIiAjsAFSAAIAJB///PB3EgAUEDcUESdHJBEHY6ABcDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCwuNAQEBfwJAIAAoAgAiAEEXai0AACICQQNxIAFB/wFxRg0AIAAgAC8AFSACQRB0ciICOwAVIAAgAkH///MHcSABQQNxQRB0ckEQdjoAFwNAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLC0MBAX8jAEEQayICJAAgACgCACEAIAJBAzoADCACQYCAgP4HNgIIIAIgAikDCDcDACAAIAFB/wFxIAIQZSACQRBqJAALgAECA38BfSMAQRBrIgMkACAAKAIAIQQCfSACtiIGIAZcBEBBACEAQwAAwH8MAQtBAEECIAZDAACAf1sgBkMAAID/W3IiBRshAEMAAMB/IAYgBRsLIQYgAyAAOgAMIAMgBjgCCCADIAMpAwg3AwAgBCABQf8BcSADEGUgA0EQaiQAC3gCAX0CfyMAQRBrIgQkACAAKAIAIQUgBAJ/IAK2IgMgA1wEQEMAAMB/IQNBAAwBC0MAAMB/IAMgA0MAAIB/WyADQwAAgP9bciIAGyEDIABFCzoADCAEIAM4AgggBCAEKQMINwMAIAUgAUH/AXEgBBBlIARBEGokAAt3AQF/AkAgACgCACIALQAUIgJBBHZBB3EgAUH/AXFGDQAgACACQY8BcSABQQR0QfAAcXI6ABQDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCwuJAQEBfwJAIAFB/wFxIAAoAgAiAC8AFSICQQ52Rg0AIABBF2ogAiAALQAXQRB0ciICQRB2OgAAIAAgAkH//wBxIAFBDnRyOwAVA0AgAC0AACIBQQRxDQEgACABQQRyOgAAIAAoAhAiAQRAIAAgAREAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsLcAEBfwJAIAAoAgAiAC0AFCICQQNxIAFB/wFxRg0AIAAgAkH8AXEgAUEDcXI6ABQDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCwt2AQF/AkAgACgCACIALQAUIgJBAnZBA3EgAUH/AXFGDQAgACACQfMBcSABQQJ0QQxxcjoAFANAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLC48BAQF/AkAgACgCACIALwAVIgJBCHZBD3EgAUH/AXFGDQAgAEEXaiACIAAtABdBEHRyIgJBEHY6AAAgACACQf/hA3EgAUEPcUEIdHI7ABUDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCwuPAQEBfwJAIAFB/wFxIAAoAgAiAC8AFSAAQRdqLQAAQRB0ciICQfABcUEEdkYNACAAIAJBEHY6ABcgACACQY/+A3EgAUEEdEHwAXFyOwAVA0AgAC0AACIBQQRxDQEgACABQQRyOgAAIAAoAhAiAQRAIAAgAREAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsLhwEBAX8CQCAAKAIAIgAvABUgAEEXai0AAEEQdHIiAkEPcSABQf8BcUYNACAAIAJBEHY6ABcgACACQfD/A3EgAUEPcXI7ABUDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCwtDAQF/IwBBEGsiAiQAIAAoAgAhACACQQM6AAwgAkGAgID+BzYCCCACIAIpAwg3AwAgACABQf8BcSACEGcgAkEQaiQAC4ABAgN/AX0jAEEQayIDJAAgACgCACEEAn0gArYiBiAGXARAQQAhAEMAAMB/DAELQQBBAiAGQwAAgH9bIAZDAACA/1tyIgUbIQBDAADAfyAGIAUbCyEGIAMgADoADCADIAY4AgggAyADKQMINwMAIAQgAUH/AXEgAxBnIANBEGokAAt4AgF9An8jAEEQayIEJAAgACgCACEFIAQCfyACtiIDIANcBEBDAADAfyEDQQAMAQtDAADAfyADIANDAACAf1sgA0MAAID/W3IiABshAyAARQs6AAwgBCADOAIIIAQgBCkDCDcDACAFIAFB/wFxIAQQZyAEQRBqJAALjwEBAX8CQCAAKAIAIgAvABUiAkEMdkEDcSABQf8BcUYNACAAQRdqIAIgAC0AF0EQdHIiAkEQdjoAACAAIAJB/58DcSABQQNxQQx0cjsAFQNAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLC5ABAQF/AkAgACgCACIAQRdqLQAAIgJBBHZBAXEgAUH/AXFGDQAgACAALwAVIAJBEHRyIgI7ABUgACACQf//vwdxIAFBAXFBFHRyQRB2OgAXA0AgAC0AACIBQQRxDQEgACABQQRyOgAAIAAoAhAiAQRAIAAgAREAAAsgAEGAgID+BzYCnAEgACgC5AMiAA0ACwsL9g0CCH8CfSMAQRBrIgIkAAJAAkAgASgCACIFLQAUIAAoAgAiAS0AFHNB/wBxDQAgBS8AFSAFLQAXQRB0ciABLwAVIAEtABdBEHRyc0H//z9xDQAgBUH8AGohByABQfwAaiEIAkAgAS8AGCIAQQdxRQRAIAUtABhBB3FFDQELIAggABAgIgogByAFLwAYECAiC1sNACAKIApbIAsgC1tyDQELAkAgAS8AGiIAQQdxRQRAIAUtABpBB3FFDQELIAggABAgIgogByAFLwAaECAiC1sNACAKIApbIAsgC1tyDQELAkAgAS8AHCIAQQdxRQRAIAUtABxBB3FFDQELIAggABAgIgogByAFLwAcECAiC1sNACAKIApbIAsgC1tyDQELAkAgAS8AHiIAQQdxRQRAIAUtAB5BB3FFDQELIAJBCGogCCAAEB8gAiAHIAUvAB4QH0EBIQAgAioCCCIKIAIqAgAiC1wEfyAKIApbDQIgCyALXAUgAAtFDQEgAi0ADCACLQAERw0BCyAFQSBqIQAgAUEgaiEGA0ACQCAGIANBAXRqLwAAIgRBB3FFBEAgAC0AAEEHcUUNAQsgAkEIaiAIIAQQHyACIAcgAC8AABAfQQEhBCACKgIIIgogAioCACILXAR/IAogClsNAyALIAtcBSAEC0UNAiACLQAMIAItAARHDQILIABBAmohACADQQFqIgNBCUcNAAsgBUEyaiEAIAFBMmohBkEAIQMDQAJAIAYgA0EBdGovAAAiBEEHcUUEQCAALQAAQQdxRQ0BCyACQQhqIAggBBAfIAIgByAALwAAEB9BASEEIAIqAggiCiACKgIAIgtcBH8gCiAKWw0DIAsgC1wFIAQLRQ0CIAItAAwgAi0ABEcNAgsgAEECaiEAIANBAWoiA0EJRw0ACyAFQcQAaiEAIAFBxABqIQZBACEDA0ACQCAGIANBAXRqLwAAIgRBB3FFBEAgAC0AAEEHcUUNAQsgAkEIaiAIIAQQHyACIAcgAC8AABAfQQEhBCACKgIIIgogAioCACILXAR/IAogClsNAyALIAtcBSAEC0UNAiACLQAMIAItAARHDQILIABBAmohACADQQFqIgNBCUcNAAsgBUHWAGohACABQdYAaiEGQQAhAwNAAkAgBiADQQF0ai8AACIEQQdxRQRAIAAtAABBB3FFDQELIAJBCGogCCAEEB8gAiAHIAAvAAAQH0EBIQQgAioCCCIKIAIqAgAiC1wEfyAKIApbDQMgCyALXAUgBAtFDQIgAi0ADCACLQAERw0CCyAAQQJqIQAgA0EBaiIDQQlHDQALIAVB6ABqIQAgAUHoAGohBkEAIQMDQAJAIAYgA0EBdGovAAAiBEEHcUUEQCAALQAAQQdxRQ0BCyACQQhqIAggBBAfIAIgByAALwAAEB9BASEEIAIqAggiCiACKgIAIgtcBH8gCiAKWw0DIAsgC1wFIAQLRQ0CIAItAAwgAi0ABEcNAgsgAEECaiEAIANBAWoiA0EDRw0ACyAFQe4AaiEAIAFB7gBqIQlBACEEQQAhAwNAAkAgCSADQQF0ai8AACIGQQdxRQRAIAAtAABBB3FFDQELIAJBCGogCCAGEB8gAiAHIAAvAAAQH0EBIQMgAioCCCIKIAIqAgAiC1wEfyAKIApbDQMgCyALXAUgAwtFDQIgAi0ADCACLQAERw0CCyAAQQJqIQBBASEDIAQhBkEBIQQgBkUNAAsgBUHyAGohACABQfIAaiEJQQAhBEEAIQMDQAJAIAkgA0EBdGovAAAiBkEHcUUEQCAALQAAQQdxRQ0BCyACQQhqIAggBhAfIAIgByAALwAAEB9BASEDIAIqAggiCiACKgIAIgtcBH8gCiAKWw0DIAsgC1wFIAMLRQ0CIAItAAwgAi0ABEcNAgsgAEECaiEAQQEhAyAEIQZBASEEIAZFDQALIAVB9gBqIQAgAUH2AGohCUEAIQRBACEDA0ACQCAJIANBAXRqLwAAIgZBB3FFBEAgAC0AAEEHcUUNAQsgAkEIaiAIIAYQHyACIAcgAC8AABAfQQEhAyACKgIIIgogAioCACILXAR/IAogClsNAyALIAtcBSADC0UNAiACLQAMIAItAARHDQILIABBAmohAEEBIQMgBCEGQQEhBCAGRQ0ACyABLwB6IgBBB3FFBEAgBS0AekEHcUUNAgsgCCAAECAiCiAHIAUvAHoQICILWw0BIAogClsNACALIAtcDQELIAFBFGogBUEUakHoABArGiABQfwAaiAFQfwAahCgAQNAIAEtAAAiAEEEcQ0BIAEgAEEEcjoAACABKAIQIgAEQCABIAARAAALIAFBgICA/gc2ApwBIAEoAuQDIgENAAsLIAJBEGokAAvGAwEEfyMAQaAEayICJAAgACgCBCEBIABBADYCBCABBEAgASABKAIAKAIEEQAACyAAKAIIIQEgAEEANgIIIAEEQCABIAEoAgAoAgQRAAALAkAgACgCACIAKALoAyAAKALsA0YEQCAAKALkAw0BIAAgAkEYaiAAKAL0AxBcIgEpAgA3AgAgACABKAIQNgIQIAAgASkCCDcCCCAAQRRqIAFBFGpB6AAQKxogACABKQKMATcCjAEgACABKQKEATcChAEgACABKQJ8NwJ8IAEoApQBIQQgAUEANgKUASAAKAKUASEDIAAgBDYClAEgAwRAIAMQWwsgAEGYAWogAUGYAWpB0AIQKxogACgC6AMiAwRAIAAgAzYC7AMgAxAjCyAAIAEoAugDNgLoAyAAIAEoAuwDNgLsAyAAIAEoAvADNgLwAyABQQA2AvADIAFCADcC6AMgACABKQL8AzcC/AMgACABKQL0AzcC9AMgACABKAKEBDYChAQgASgClAEhACABQQA2ApQBIAAEQCAAEFsLIAJBoARqJAAPCyACQfAcNgIQIABBBUHYJSACQRBqECwQJAALIAJB5hE2AgAgAEEFQdglIAIQLBAkAAsLAEEMEB4gABCiAQsLAEEMEB5BABCiAQsNACAAKAIALQAIQQFxCwoAIAAoAgAoAhQLGQAgAUH/AXEEQBACAAsgACgCACgCEEEBcQsYACAAKAIAIgAgAC0ACEH+AXEgAXI6AAgLJgAgASAAKAIAIgAoAhRHBEAgACABNgIUIAAgACgCDEEBajYCDAsLkgEBAn8jAEEQayICJAAgACgCACEAIAFDAAAAAGAEQCABIAAqAhhcBEAgACABOAIYIAAgACgCDEEBajYCDAsgAkEQaiQADwsgAkGIFDYCACMAQRBrIgMkACADIAI2AgwCQCAARQRAQbgwQdglIAIQSRoMAQsgAEEAQQVB2CUgAiAAKAIEEQ0AGgsgA0EQaiQAECQACz8AIAFB/wFxRQRAIAIgACgCACIAKAIQIgFBAXFHBEAgACABQX5xIAJyNgIQIAAgACgCDEEBajYCDAsPCxACAAsL4CYjAEGACAuBHk9ubHkgbGVhZiBub2RlcyB3aXRoIGN1c3RvbSBtZWFzdXJlIGZ1bmN0aW9ucyBzaG91bGQgbWFudWFsbHkgbWFyayB0aGVtc2VsdmVzIGFzIGRpcnR5AGlzRGlydHkAbWFya0RpcnR5AGRlc3Ryb3kAc2V0RGlzcGxheQBnZXREaXNwbGF5AHNldEZsZXgALSsgICAwWDB4AC0wWCswWCAwWC0weCsweCAweABzZXRGbGV4R3JvdwBnZXRGbGV4R3JvdwBzZXRPdmVyZmxvdwBnZXRPdmVyZmxvdwBoYXNOZXdMYXlvdXQAY2FsY3VsYXRlTGF5b3V0AGdldENvbXB1dGVkTGF5b3V0AHVuc2lnbmVkIHNob3J0AGdldENoaWxkQ291bnQAdW5zaWduZWQgaW50AHNldEp1c3RpZnlDb250ZW50AGdldEp1c3RpZnlDb250ZW50AGF2YWlsYWJsZUhlaWdodCBpcyBpbmRlZmluaXRlIHNvIGhlaWdodFNpemluZ01vZGUgbXVzdCBiZSBTaXppbmdNb2RlOjpNYXhDb250ZW50AGF2YWlsYWJsZVdpZHRoIGlzIGluZGVmaW5pdGUgc28gd2lkdGhTaXppbmdNb2RlIG11c3QgYmUgU2l6aW5nTW9kZTo6TWF4Q29udGVudABzZXRBbGlnbkNvbnRlbnQAZ2V0QWxpZ25Db250ZW50AGdldFBhcmVudABpbXBsZW1lbnQAc2V0TWF4SGVpZ2h0UGVyY2VudABzZXRIZWlnaHRQZXJjZW50AHNldE1pbkhlaWdodFBlcmNlbnQAc2V0RmxleEJhc2lzUGVyY2VudABzZXRHYXBQZXJjZW50AHNldFBvc2l0aW9uUGVyY2VudABzZXRNYXJnaW5QZXJjZW50AHNldE1heFdpZHRoUGVyY2VudABzZXRXaWR0aFBlcmNlbnQAc2V0TWluV2lkdGhQZXJjZW50AHNldFBhZGRpbmdQZXJjZW50AGhhbmRsZS50eXBlKCkgPT0gU3R5bGVWYWx1ZUhhbmRsZTo6VHlwZTo6UG9pbnQgfHwgaGFuZGxlLnR5cGUoKSA9PSBTdHlsZVZhbHVlSGFuZGxlOjpUeXBlOjpQZXJjZW50AGNyZWF0ZURlZmF1bHQAdW5pdAByaWdodABoZWlnaHQAc2V0TWF4SGVpZ2h0AGdldE1heEhlaWdodABzZXRIZWlnaHQAZ2V0SGVpZ2h0AHNldE1pbkhlaWdodABnZXRNaW5IZWlnaHQAZ2V0Q29tcHV0ZWRIZWlnaHQAZ2V0Q29tcHV0ZWRSaWdodABsZWZ0AGdldENvbXB1dGVkTGVmdAByZXNldABfX2Rlc3RydWN0AGZsb2F0AHVpbnQ2NF90AHVzZVdlYkRlZmF1bHRzAHNldFVzZVdlYkRlZmF1bHRzAHNldEFsaWduSXRlbXMAZ2V0QWxpZ25JdGVtcwBzZXRGbGV4QmFzaXMAZ2V0RmxleEJhc2lzAENhbm5vdCBnZXQgbGF5b3V0IHByb3BlcnRpZXMgb2YgbXVsdGktZWRnZSBzaG9ydGhhbmRzAHNldFBvaW50U2NhbGVGYWN0b3IATWVhc3VyZUNhbGxiYWNrV3JhcHBlcgBEaXJ0aWVkQ2FsbGJhY2tXcmFwcGVyAENhbm5vdCByZXNldCBhIG5vZGUgc3RpbGwgYXR0YWNoZWQgdG8gYSBvd25lcgBzZXRCb3JkZXIAZ2V0Qm9yZGVyAGdldENvbXB1dGVkQm9yZGVyAGdldE51bWJlcgBoYW5kbGUudHlwZSgpID09IFN0eWxlVmFsdWVIYW5kbGU6OlR5cGU6Ok51bWJlcgB1bnNpZ25lZCBjaGFyAHRvcABnZXRDb21wdXRlZFRvcABzZXRGbGV4V3JhcABnZXRGbGV4V3JhcABzZXRHYXAAZ2V0R2FwACVwAHNldEhlaWdodEF1dG8Ac2V0RmxleEJhc2lzQXV0bwBzZXRQb3NpdGlvbkF1dG8Ac2V0TWFyZ2luQXV0bwBzZXRXaWR0aEF1dG8AU2NhbGUgZmFjdG9yIHNob3VsZCBub3QgYmUgbGVzcyB0aGFuIHplcm8Ac2V0QXNwZWN0UmF0aW8AZ2V0QXNwZWN0UmF0aW8Ac2V0UG9zaXRpb24AZ2V0UG9zaXRpb24Abm90aWZ5T25EZXN0cnVjdGlvbgBzZXRGbGV4RGlyZWN0aW9uAGdldEZsZXhEaXJlY3Rpb24Ac2V0RGlyZWN0aW9uAGdldERpcmVjdGlvbgBzZXRNYXJnaW4AZ2V0TWFyZ2luAGdldENvbXB1dGVkTWFyZ2luAG1hcmtMYXlvdXRTZWVuAG5hbgBib3R0b20AZ2V0Q29tcHV0ZWRCb3R0b20AYm9vbABlbXNjcmlwdGVuOjp2YWwAc2V0RmxleFNocmluawBnZXRGbGV4U2hyaW5rAHNldEFsd2F5c0Zvcm1zQ29udGFpbmluZ0Jsb2NrAE1lYXN1cmVDYWxsYmFjawBEaXJ0aWVkQ2FsbGJhY2sAZ2V0TGVuZ3RoAHdpZHRoAHNldE1heFdpZHRoAGdldE1heFdpZHRoAHNldFdpZHRoAGdldFdpZHRoAHNldE1pbldpZHRoAGdldE1pbldpZHRoAGdldENvbXB1dGVkV2lkdGgAcHVzaAAvaG9tZS9ydW5uZXIvd29yay95b2dhL3lvZ2EvamF2YXNjcmlwdC8uLi95b2dhL3N0eWxlL1NtYWxsVmFsdWVCdWZmZXIuaAAvaG9tZS9ydW5uZXIvd29yay95b2dhL3lvZ2EvamF2YXNjcmlwdC8uLi95b2dhL3N0eWxlL1N0eWxlVmFsdWVQb29sLmgAdW5zaWduZWQgbG9uZwBzZXRCb3hTaXppbmcAZ2V0Qm94U2l6aW5nAHN0ZDo6d3N0cmluZwBzdGQ6OnN0cmluZwBzdGQ6OnUxNnN0cmluZwBzdGQ6OnUzMnN0cmluZwBzZXRQYWRkaW5nAGdldFBhZGRpbmcAZ2V0Q29tcHV0ZWRQYWRkaW5nAFRyaWVkIHRvIGNvbnN0cnVjdCBZR05vZGUgd2l0aCBudWxsIGNvbmZpZwBBdHRlbXB0aW5nIHRvIGNvbnN0cnVjdCBOb2RlIHdpdGggbnVsbCBjb25maWcAY3JlYXRlV2l0aENvbmZpZwBpbmYAc2V0QWxpZ25TZWxmAGdldEFsaWduU2VsZgBTaXplAHZhbHVlAFZhbHVlAGNyZWF0ZQBtZWFzdXJlAHNldFBvc2l0aW9uVHlwZQBnZXRQb3NpdGlvblR5cGUAaXNSZWZlcmVuY2VCYXNlbGluZQBzZXRJc1JlZmVyZW5jZUJhc2VsaW5lAGNvcHlTdHlsZQBkb3VibGUATm9kZQBleHRlbmQAaW5zZXJ0Q2hpbGQAZ2V0Q2hpbGQAcmVtb3ZlQ2hpbGQAdm9pZABzZXRFeHBlcmltZW50YWxGZWF0dXJlRW5hYmxlZABpc0V4cGVyaW1lbnRhbEZlYXR1cmVFbmFibGVkAGRpcnRpZWQAQ2Fubm90IHJlc2V0IGEgbm9kZSB3aGljaCBzdGlsbCBoYXMgY2hpbGRyZW4gYXR0YWNoZWQAdW5zZXRNZWFzdXJlRnVuYwB1bnNldERpcnRpZWRGdW5jAHNldEVycmF0YQBnZXRFcnJhdGEATWVhc3VyZSBmdW5jdGlvbiByZXR1cm5lZCBhbiBpbnZhbGlkIGRpbWVuc2lvbiB0byBZb2dhOiBbd2lkdGg9JWYsIGhlaWdodD0lZl0ARXhwZWN0IGN1c3RvbSBiYXNlbGluZSBmdW5jdGlvbiB0byBub3QgcmV0dXJuIE5hTgBOQU4ASU5GAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGZsb2F0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgY2hhcj4Ac3RkOjpiYXNpY19zdHJpbmc8dW5zaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2lnbmVkIGNoYXI+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGxvbmc+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGxvbmc+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGRvdWJsZT4AQ2hpbGQgYWxyZWFkeSBoYXMgYSBvd25lciwgaXQgbXVzdCBiZSByZW1vdmVkIGZpcnN0LgBDYW5ub3Qgc2V0IG1lYXN1cmUgZnVuY3Rpb246IE5vZGVzIHdpdGggbWVhc3VyZSBmdW5jdGlvbnMgY2Fubm90IGhhdmUgY2hpbGRyZW4uAENhbm5vdCBhZGQgY2hpbGQ6IE5vZGVzIHdpdGggbWVhc3VyZSBmdW5jdGlvbnMgY2Fubm90IGhhdmUgY2hpbGRyZW4uAChudWxsKQBpbmRleCA8IDQwOTYgJiYgIlNtYWxsVmFsdWVCdWZmZXIgY2FuIG9ubHkgaG9sZCB1cCB0byA0MDk2IGNodW5rcyIAJXMKAAEAAAADAAAAAAAAAAIAAAADAAAAAQAAAAIAAAAAAAAAAQAAAAEAQYwmCwdpaQB2AHZpAEGgJgs3ox0AAKEdAADhHQAA2x0AAOEdAADbHQAAaWlpZmlmaQDUHQAApB0AAHZpaQClHQAA6B0AAGlpaQBB4CYLCcQAAADFAAAAxgBB9CYLDsQAAADHAAAAyAAAANQdAEGQJws+ox0AAOEdAADbHQAA4R0AANsdAADoHQAA4x0AAOgdAABpaWlpAAAAANQdAAC5HQAA1B0AALsdAAC8HQAA6B0AQdgnCwnJAAAAygAAAMsAQewnCxbJAAAAzAAAAMgAAAC/HQAA1B0AAL8dAEGQKAuiA9QdAAC/HQAA2x0AANUdAAB2aWlpaQAAANQdAAC/HQAA4R0AAHZpaWYAAAAA1B0AAL8dAADbHQAAdmlpaQAAAADUHQAAvx0AANUdAADVHQAAwB0AANsdAADbHQAAwB0AANUdAADAHQAAaQBkaWkAdmlpZAAAxB0AAMQdAAC/HQAA1B0AAMQdAADUHQAAxB0AAMMdAADUHQAAxB0AANsdAADUHQAAxB0AANsdAADiHQAAdmlpaWQAAADUHQAAxB0AAOIdAADbHQAAxR0AAMIdAADFHQAA2x0AAMIdAADFHQAA4h0AAMUdAADiHQAAxR0AANsdAABkaWlpAAAAAOEdAADEHQAA2x0AAGZpaWkAAAAA1B0AAMQdAADEHQAA3B0AANQdAADEHQAAxB0AANwdAADFHQAAxB0AAMQdAADEHQAAxB0AANwdAADUHQAAxB0AANUdAADVHQAAxB0AANQdAADEHQAAoR0AANQdAADEHQAAuR0AANUdAADFHQAAAAAAANQdAADEHQAA4h0AAOIdAADbHQAAdmlpZGRpAADBHQAAxR0AQcArC0EZAAoAGRkZAAAAAAUAAAAAAAAJAAAAAAsAAAAAAAAAABkAEQoZGRkDCgcAAQAJCxgAAAkGCwAACwAGGQAAABkZGQBBkSwLIQ4AAAAAAAAAABkACg0ZGRkADQAAAgAJDgAAAAkADgAADgBByywLAQwAQdcsCxUTAAAAABMAAAAACQwAAAAAAAwAAAwAQYUtCwEQAEGRLQsVDwAAAAQPAAAAAAkQAAAAAAAQAAAQAEG/LQsBEgBByy0LHhEAAAAAEQAAAAAJEgAAAAAAEgAAEgAAGgAAABoaGgBBgi4LDhoAAAAaGhoAAAAAAAAJAEGzLgsBFABBvy4LFRcAAAAAFwAAAAAJFAAAAAAAFAAAFABB7S4LARYAQfkuCycVAAAAABUAAAAACRYAAAAAABYAABYAADAxMjM0NTY3ODlBQkNERUYAQcQvCwHSAEHsLwsI//////////8AQbAwCwkQIgEAAAAAAAUAQcQwCwHNAEHcMAsKzgAAAM8AAAD8HQBB9DALAQIAQYQxCwj//////////wBByDELAQUAQdQxCwHQAEHsMQsOzgAAANEAAAAIHgAAAAQAQYQyCwEBAEGUMgsF/////woAQdgyCwHT", !HA(tA)) {
        var bA = tA;
        tA = t.locateFile ? t.locateFile(bA, o) : o + bA;
      }
      function mA() {
        var u2 = tA;
        try {
          if (u2 == tA && I)
            return new Uint8Array(I);
          if (HA(u2))
            try {
              var l2 = gu(u2.slice(37)), f = new Uint8Array(l2.length);
              for (u2 = 0; u2 < l2.length; ++u2)
                f[u2] = l2.charCodeAt(u2);
              var C = f;
            } catch {
              throw Error("Converting base64 string to bytes failed.");
            }
          else
            C = void 0;
          var h2 = C;
          if (h2)
            return h2;
          throw "both async and sync fetching of the wasm failed";
        } catch (S2) {
          $(S2);
        }
      }
      function te() {
        return I || typeof fetch != "function" ? Promise.resolve().then(function() {
          return mA();
        }) : fetch(tA, { credentials: "same-origin" }).then(function(u2) {
          if (!u2.ok)
            throw "failed to load wasm binary file at '" + tA + "'";
          return u2.arrayBuffer();
        }).catch(function() {
          return mA();
        });
      }
      function FA(u2) {
        for (; 0 < u2.length; )
          u2.shift()(t);
      }
      function kA(u2) {
        if (u2 === void 0)
          return "_unknown";
        u2 = u2.replace(/[^a-zA-Z0-9_]/g, "$");
        var l2 = u2.charCodeAt(0);
        return 48 <= l2 && 57 >= l2 ? "_" + u2 : u2;
      }
      function xA(u2, l2) {
        return u2 = kA(u2), function() {
          return l2.apply(this, arguments);
        };
      }
      var J = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }], rA = [];
      function fA(u2) {
        var l2 = Error, f = xA(u2, function(C) {
          this.name = u2, this.message = C, C = Error(C).stack, C !== void 0 && (this.stack = this.toString() + `
` + C.replace(/^Error(:[^\n]*)?\n/, ""));
        });
        return f.prototype = Object.create(l2.prototype), f.prototype.constructor = f, f.prototype.toString = function() {
          return this.message === void 0 ? this.name : this.name + ": " + this.message;
        }, f;
      }
      var QA = void 0;
      function K2(u2) {
        throw new QA(u2);
      }
      var MA = (u2) => (u2 || K2("Cannot use deleted val. handle = " + u2), J[u2].value), GA = (u2) => {
        switch (u2) {
          case void 0:
            return 1;
          case null:
            return 2;
          case true:
            return 3;
          case false:
            return 4;
          default:
            var l2 = rA.length ? rA.pop() : J.length;
            return J[l2] = { ga: 1, value: u2 }, l2;
        }
      }, OA = void 0, TA = void 0;
      function SA(u2) {
        for (var l2 = ""; m2[u2]; )
          l2 += TA[m2[u2++]];
        return l2;
      }
      var ye = [];
      function Je() {
        for (; ye.length; ) {
          var u2 = ye.pop();
          u2.M.$ = false, u2.delete();
        }
      }
      var qA = void 0, re = {};
      function ut(u2, l2) {
        for (l2 === void 0 && K2("ptr should not be undefined"); u2.R; )
          l2 = u2.ba(l2), u2 = u2.R;
        return l2;
      }
      var we = {};
      function $e(u2) {
        u2 = As(u2);
        var l2 = SA(u2);
        return Le(u2), l2;
      }
      function br(u2, l2) {
        var f = we[u2];
        return f === void 0 && K2(l2 + " has unknown type " + $e(u2)), f;
      }
      function At() {
      }
      var Ke = false;
      function De(u2) {
        --u2.count.value, u2.count.value === 0 && (u2.T ? u2.U.W(u2.T) : u2.P.N.W(u2.O));
      }
      function Be(u2, l2, f) {
        return l2 === f ? u2 : f.R === void 0 ? null : (u2 = Be(u2, l2, f.R), u2 === null ? null : f.na(u2));
      }
      var jA = {};
      function lt(u2, l2) {
        return l2 = ut(u2, l2), re[l2];
      }
      var ne = void 0;
      function Ee(u2) {
        throw new ne(u2);
      }
      function Ne(u2, l2) {
        return l2.P && l2.O || Ee("makeClassHandle requires ptr and ptrType"), !!l2.U != !!l2.T && Ee("Both smartPtrType and smartPtr must be specified"), l2.count = { value: 1 }, Fe(Object.create(u2, { M: { value: l2 } }));
      }
      function Fe(u2) {
        return typeof FinalizationRegistry > "u" ? (Fe = (l2) => l2, u2) : (Ke = new FinalizationRegistry((l2) => {
          De(l2.M);
        }), Fe = (l2) => {
          var f = l2.M;
          return f.T && Ke.register(l2, { M: f }, l2), l2;
        }, At = (l2) => {
          Ke.unregister(l2);
        }, Fe(u2));
      }
      var Me = {};
      function $A(u2) {
        for (; u2.length; ) {
          var l2 = u2.pop();
          u2.pop()(l2);
        }
      }
      function fe(u2) {
        return this.fromWireType(y[u2 >> 2]);
      }
      var _A = {}, et2 = {};
      function Y(u2, l2, f) {
        function C(v2) {
          v2 = f(v2), v2.length !== u2.length && Ee("Mismatched type converter count");
          for (var L = 0; L < u2.length; ++L)
            Z(u2[L], v2[L]);
        }
        u2.forEach(function(v2) {
          et2[v2] = l2;
        });
        var h2 = Array(l2.length), S2 = [], k = 0;
        l2.forEach((v2, L) => {
          we.hasOwnProperty(v2) ? h2[L] = we[v2] : (S2.push(v2), _A.hasOwnProperty(v2) || (_A[v2] = []), _A[v2].push(() => {
            h2[L] = we[v2], ++k, k === S2.length && C(h2);
          }));
        }), S2.length === 0 && C(h2);
      }
      function z(u2) {
        switch (u2) {
          case 1:
            return 0;
          case 2:
            return 1;
          case 4:
            return 2;
          case 8:
            return 3;
          default:
            throw new TypeError("Unknown type size: " + u2);
        }
      }
      function Z(u2, l2, f = {}) {
        if (!("argPackAdvance" in l2))
          throw new TypeError("registerType registeredInstance requires argPackAdvance");
        var C = l2.name;
        if (u2 || K2('type "' + C + '" must have a positive integer typeid pointer'), we.hasOwnProperty(u2)) {
          if (f.ua)
            return;
          K2("Cannot register type '" + C + "' twice");
        }
        we[u2] = l2, delete et2[u2], _A.hasOwnProperty(u2) && (l2 = _A[u2], delete _A[u2], l2.forEach((h2) => h2()));
      }
      function j(u2) {
        K2(u2.M.P.N.name + " instance already deleted");
      }
      function gA() {
      }
      function iA(u2, l2, f) {
        if (u2[l2].S === void 0) {
          var C = u2[l2];
          u2[l2] = function() {
            return u2[l2].S.hasOwnProperty(arguments.length) || K2("Function '" + f + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + u2[l2].S + ")!"), u2[l2].S[arguments.length].apply(this, arguments);
          }, u2[l2].S = [], u2[l2].S[C.Z] = C;
        }
      }
      function CA(u2, l2) {
        t.hasOwnProperty(u2) ? (K2("Cannot register public name '" + u2 + "' twice"), iA(t, u2, u2), t.hasOwnProperty(void 0) && K2("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"), t[u2].S[void 0] = l2) : t[u2] = l2;
      }
      function IA(u2, l2, f, C, h2, S2, k, v2) {
        this.name = u2, this.constructor = l2, this.X = f, this.W = C, this.R = h2, this.pa = S2, this.ba = k, this.na = v2, this.ja = [];
      }
      function AA(u2, l2, f) {
        for (; l2 !== f; )
          l2.ba || K2("Expected null or instance of " + f.name + ", got an instance of " + l2.name), u2 = l2.ba(u2), l2 = l2.R;
        return u2;
      }
      function ie(u2, l2) {
        return l2 === null ? (this.ea && K2("null is not a valid " + this.name), 0) : (l2.M || K2('Cannot pass "' + JA(l2) + '" as a ' + this.name), l2.M.O || K2("Cannot pass deleted object as a pointer of type " + this.name), AA(l2.M.O, l2.M.P.N, this.N));
      }
      function V(u2, l2) {
        if (l2 === null) {
          if (this.ea && K2("null is not a valid " + this.name), this.da) {
            var f = this.fa();
            return u2 !== null && u2.push(this.W, f), f;
          }
          return 0;
        }
        if (l2.M || K2('Cannot pass "' + JA(l2) + '" as a ' + this.name), l2.M.O || K2("Cannot pass deleted object as a pointer of type " + this.name), !this.ca && l2.M.P.ca && K2("Cannot convert argument of type " + (l2.M.U ? l2.M.U.name : l2.M.P.name) + " to parameter type " + this.name), f = AA(l2.M.O, l2.M.P.N, this.N), this.da)
          switch (l2.M.T === void 0 && K2("Passing raw pointer to smart pointer is illegal"), this.Ba) {
            case 0:
              l2.M.U === this ? f = l2.M.T : K2("Cannot convert argument of type " + (l2.M.U ? l2.M.U.name : l2.M.P.name) + " to parameter type " + this.name);
              break;
            case 1:
              f = l2.M.T;
              break;
            case 2:
              if (l2.M.U === this)
                f = l2.M.T;
              else {
                var C = l2.clone();
                f = this.xa(f, GA(function() {
                  C.delete();
                })), u2 !== null && u2.push(this.W, f);
              }
              break;
            default:
              K2("Unsupporting sharing policy");
          }
        return f;
      }
      function Se(u2, l2) {
        return l2 === null ? (this.ea && K2("null is not a valid " + this.name), 0) : (l2.M || K2('Cannot pass "' + JA(l2) + '" as a ' + this.name), l2.M.O || K2("Cannot pass deleted object as a pointer of type " + this.name), l2.M.P.ca && K2("Cannot convert argument of type " + l2.M.P.name + " to parameter type " + this.name), AA(l2.M.O, l2.M.P.N, this.N));
      }
      function yA(u2, l2, f, C) {
        this.name = u2, this.N = l2, this.ea = f, this.ca = C, this.da = false, this.W = this.xa = this.fa = this.ka = this.Ba = this.wa = void 0, l2.R !== void 0 ? this.toWireType = V : (this.toWireType = C ? ie : Se, this.V = null);
      }
      function kt(u2, l2) {
        t.hasOwnProperty(u2) || Ee("Replacing nonexistant public symbol"), t[u2] = l2, t[u2].Z = void 0;
      }
      function oe(u2, l2) {
        var f = [];
        return function() {
          if (f.length = 0, Object.assign(f, arguments), u2.includes("j")) {
            var C = t["dynCall_" + u2];
            C = f && f.length ? C.apply(null, [l2].concat(f)) : C.call(null, l2);
          } else
            C = P2.get(l2).apply(null, f);
          return C;
        };
      }
      function PA(u2, l2) {
        u2 = SA(u2);
        var f = u2.includes("j") ? oe(u2, l2) : P2.get(l2);
        return typeof f != "function" && K2("unknown function pointer with signature " + u2 + ": " + l2), f;
      }
      var XA = void 0;
      function be(u2, l2) {
        function f(S2) {
          h2[S2] || we[S2] || (et2[S2] ? et2[S2].forEach(f) : (C.push(S2), h2[S2] = true));
        }
        var C = [], h2 = {};
        throw l2.forEach(f), new XA(u2 + ": " + C.map($e).join([", "]));
      }
      function dA(u2, l2, f, C, h2) {
        var S2 = l2.length;
        2 > S2 && K2("argTypes array size mismatch! Must at least get return value and 'this' types!");
        var k = l2[1] !== null && f !== null, v2 = false;
        for (f = 1; f < l2.length; ++f)
          if (l2[f] !== null && l2[f].V === void 0) {
            v2 = true;
            break;
          }
        var L = l2[0].name !== "void", F = S2 - 2, H = Array(F), W = [], oA = [];
        return function() {
          if (arguments.length !== F && K2("function " + u2 + " called with " + arguments.length + " arguments, expected " + F + " args!"), oA.length = 0, W.length = k ? 2 : 1, W[0] = h2, k) {
            var vA = l2[1].toWireType(oA, this);
            W[1] = vA;
          }
          for (var uA = 0; uA < F; ++uA)
            H[uA] = l2[uA + 2].toWireType(oA, arguments[uA]), W.push(H[uA]);
          if (uA = C.apply(null, W), v2)
            $A(oA);
          else
            for (var ee = k ? 1 : 2; ee < l2.length; ee++) {
              var de = ee === 1 ? vA : H[ee - 2];
              l2[ee].V !== null && l2[ee].V(de);
            }
          return vA = L ? l2[0].fromWireType(uA) : void 0, vA;
        };
      }
      function wA(u2, l2) {
        for (var f = [], C = 0; C < u2; C++)
          f.push(p[l2 + 4 * C >> 2]);
        return f;
      }
      function Ae(u2) {
        4 < u2 && --J[u2].ga === 0 && (J[u2] = void 0, rA.push(u2));
      }
      function JA(u2) {
        if (u2 === null)
          return "null";
        var l2 = typeof u2;
        return l2 === "object" || l2 === "array" || l2 === "function" ? u2.toString() : "" + u2;
      }
      function Qe(u2, l2) {
        switch (l2) {
          case 2:
            return function(f) {
              return this.fromWireType(b[f >> 2]);
            };
          case 3:
            return function(f) {
              return this.fromWireType(R2[f >> 3]);
            };
          default:
            throw new TypeError("Unknown float type: " + u2);
        }
      }
      function Ce(u2, l2, f) {
        switch (l2) {
          case 0:
            return f ? function(C) {
              return d2[C];
            } : function(C) {
              return m2[C];
            };
          case 1:
            return f ? function(C) {
              return D[C >> 1];
            } : function(C) {
              return x2[C >> 1];
            };
          case 2:
            return f ? function(C) {
              return y[C >> 2];
            } : function(C) {
              return p[C >> 2];
            };
          default:
            throw new TypeError("Unknown integer type: " + u2);
        }
      }
      function KA(u2, l2) {
        for (var f = "", C = 0; !(C >= l2 / 2); ++C) {
          var h2 = D[u2 + 2 * C >> 1];
          if (h2 == 0)
            break;
          f += String.fromCharCode(h2);
        }
        return f;
      }
      function se(u2, l2, f) {
        if (f === void 0 && (f = 2147483647), 2 > f)
          return 0;
        f -= 2;
        var C = l2;
        f = f < 2 * u2.length ? f / 2 : u2.length;
        for (var h2 = 0; h2 < f; ++h2)
          D[l2 >> 1] = u2.charCodeAt(h2), l2 += 2;
        return D[l2 >> 1] = 0, l2 - C;
      }
      function xt(u2) {
        return 2 * u2.length;
      }
      function ct(u2, l2) {
        for (var f = 0, C = ""; !(f >= l2 / 4); ) {
          var h2 = y[u2 + 4 * f >> 2];
          if (h2 == 0)
            break;
          ++f, 65536 <= h2 ? (h2 -= 65536, C += String.fromCharCode(55296 | h2 >> 10, 56320 | h2 & 1023)) : C += String.fromCharCode(h2);
        }
        return C;
      }
      function kr(u2, l2, f) {
        if (f === void 0 && (f = 2147483647), 4 > f)
          return 0;
        var C = l2;
        f = C + f - 4;
        for (var h2 = 0; h2 < u2.length; ++h2) {
          var S2 = u2.charCodeAt(h2);
          if (55296 <= S2 && 57343 >= S2) {
            var k = u2.charCodeAt(++h2);
            S2 = 65536 + ((S2 & 1023) << 10) | k & 1023;
          }
          if (y[l2 >> 2] = S2, l2 += 4, l2 + 4 > f)
            break;
        }
        return y[l2 >> 2] = 0, l2 - C;
      }
      function xr(u2) {
        for (var l2 = 0, f = 0; f < u2.length; ++f) {
          var C = u2.charCodeAt(f);
          55296 <= C && 57343 >= C && ++f, l2 += 4;
        }
        return l2;
      }
      var Rr = {};
      function Zo(u2) {
        var l2 = Rr[u2];
        return l2 === void 0 ? SA(u2) : l2;
      }
      var vr = [];
      function ou(u2) {
        var l2 = vr.length;
        return vr.push(u2), l2;
      }
      function su(u2, l2) {
        for (var f = Array(u2), C = 0; C < u2; ++C)
          f[C] = br(p[l2 + 4 * C >> 2], "parameter " + C);
        return f;
      }
      var jo = [], au = [null, [], []];
      QA = t.BindingError = fA("BindingError"), t.count_emval_handles = function() {
        for (var u2 = 0, l2 = 5; l2 < J.length; ++l2)
          J[l2] !== void 0 && ++u2;
        return u2;
      }, t.get_first_emval = function() {
        for (var u2 = 5; u2 < J.length; ++u2)
          if (J[u2] !== void 0)
            return J[u2];
        return null;
      }, OA = t.PureVirtualError = fA("PureVirtualError");
      for (var $o = Array(256), Nr = 0; 256 > Nr; ++Nr)
        $o[Nr] = String.fromCharCode(Nr);
      TA = $o, t.getInheritedInstanceCount = function() {
        return Object.keys(re).length;
      }, t.getLiveInheritedInstances = function() {
        var u2 = [], l2;
        for (l2 in re)
          re.hasOwnProperty(l2) && u2.push(re[l2]);
        return u2;
      }, t.flushPendingDeletes = Je, t.setDelayFunction = function(u2) {
        qA = u2, ye.length && qA && qA(Je);
      }, ne = t.InternalError = fA("InternalError"), gA.prototype.isAliasOf = function(u2) {
        if (!(this instanceof gA && u2 instanceof gA))
          return false;
        var l2 = this.M.P.N, f = this.M.O, C = u2.M.P.N;
        for (u2 = u2.M.O; l2.R; )
          f = l2.ba(f), l2 = l2.R;
        for (; C.R; )
          u2 = C.ba(u2), C = C.R;
        return l2 === C && f === u2;
      }, gA.prototype.clone = function() {
        if (this.M.O || j(this), this.M.aa)
          return this.M.count.value += 1, this;
        var u2 = Fe, l2 = Object, f = l2.create, C = Object.getPrototypeOf(this), h2 = this.M;
        return u2 = u2(f.call(l2, C, { M: { value: { count: h2.count, $: h2.$, aa: h2.aa, O: h2.O, P: h2.P, T: h2.T, U: h2.U } } })), u2.M.count.value += 1, u2.M.$ = false, u2;
      }, gA.prototype.delete = function() {
        this.M.O || j(this), this.M.$ && !this.M.aa && K2("Object already scheduled for deletion"), At(this), De(this.M), this.M.aa || (this.M.T = void 0, this.M.O = void 0);
      }, gA.prototype.isDeleted = function() {
        return !this.M.O;
      }, gA.prototype.deleteLater = function() {
        return this.M.O || j(this), this.M.$ && !this.M.aa && K2("Object already scheduled for deletion"), ye.push(this), ye.length === 1 && qA && qA(Je), this.M.$ = true, this;
      }, yA.prototype.qa = function(u2) {
        return this.ka && (u2 = this.ka(u2)), u2;
      }, yA.prototype.ha = function(u2) {
        this.W && this.W(u2);
      }, yA.prototype.argPackAdvance = 8, yA.prototype.readValueFromPointer = fe, yA.prototype.deleteObject = function(u2) {
        u2 !== null && u2.delete();
      }, yA.prototype.fromWireType = function(u2) {
        function l2() {
          return this.da ? Ne(this.N.X, { P: this.wa, O: f, U: this, T: u2 }) : Ne(this.N.X, { P: this, O: u2 });
        }
        var f = this.qa(u2);
        if (!f)
          return this.ha(u2), null;
        var C = lt(this.N, f);
        if (C !== void 0)
          return C.M.count.value === 0 ? (C.M.O = f, C.M.T = u2, C.clone()) : (C = C.clone(), this.ha(u2), C);
        if (C = this.N.pa(f), C = jA[C], !C)
          return l2.call(this);
        C = this.ca ? C.la : C.pointerType;
        var h2 = Be(f, this.N, C.N);
        return h2 === null ? l2.call(this) : this.da ? Ne(C.N.X, { P: C, O: h2, U: this, T: u2 }) : Ne(C.N.X, { P: C, O: h2 });
      }, XA = t.UnboundTypeError = fA("UnboundTypeError");
      var gu = typeof atob == "function" ? atob : function(u2) {
        var l2 = "", f = 0;
        u2 = u2.replace(/[^A-Za-z0-9\+\/=]/g, "");
        do {
          var C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(u2.charAt(f++)), h2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(u2.charAt(f++)), S2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(u2.charAt(f++)), k = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(u2.charAt(f++));
          C = C << 2 | h2 >> 4, h2 = (h2 & 15) << 4 | S2 >> 2;
          var v2 = (S2 & 3) << 6 | k;
          l2 += String.fromCharCode(C), S2 !== 64 && (l2 += String.fromCharCode(h2)), k !== 64 && (l2 += String.fromCharCode(v2));
        } while (f < u2.length);
        return l2;
      }, Iu = { l: function(u2, l2, f, C) {
        $("Assertion failed: " + (u2 ? E(m2, u2) : "") + ", at: " + [l2 ? l2 ? E(m2, l2) : "" : "unknown filename", f, C ? C ? E(m2, C) : "" : "unknown function"]);
      }, q: function(u2, l2, f) {
        u2 = SA(u2), l2 = br(l2, "wrapper"), f = MA(f);
        var C = [].slice, h2 = l2.N, S2 = h2.X, k = h2.R.X, v2 = h2.R.constructor;
        u2 = xA(u2, function() {
          h2.R.ja.forEach(function(F) {
            if (this[F] === k[F])
              throw new OA("Pure virtual function " + F + " must be implemented in JavaScript");
          }.bind(this)), Object.defineProperty(this, "__parent", { value: S2 }), this.__construct.apply(this, C.call(arguments));
        }), S2.__construct = function() {
          this === S2 && K2("Pass correct 'this' to __construct");
          var F = v2.implement.apply(void 0, [this].concat(C.call(arguments)));
          At(F);
          var H = F.M;
          F.notifyOnDestruction(), H.aa = true, Object.defineProperties(this, { M: { value: H } }), Fe(this), F = H.O, F = ut(h2, F), re.hasOwnProperty(F) ? K2("Tried to register registered instance: " + F) : re[F] = this;
        }, S2.__destruct = function() {
          this === S2 && K2("Pass correct 'this' to __destruct"), At(this);
          var F = this.M.O;
          F = ut(h2, F), re.hasOwnProperty(F) ? delete re[F] : K2("Tried to unregister unregistered instance: " + F);
        }, u2.prototype = Object.create(S2);
        for (var L in f)
          u2.prototype[L] = f[L];
        return GA(u2);
      }, j: function(u2) {
        var l2 = Me[u2];
        delete Me[u2];
        var f = l2.fa, C = l2.W, h2 = l2.ia, S2 = h2.map((k) => k.ta).concat(h2.map((k) => k.za));
        Y([u2], S2, (k) => {
          var v2 = {};
          return h2.forEach((L, F) => {
            var H = k[F], W = L.ra, oA = L.sa, vA = k[F + h2.length], uA = L.ya, ee = L.Aa;
            v2[L.oa] = { read: (de) => H.fromWireType(W(oA, de)), write: (de, Rt) => {
              var Ge = [];
              uA(ee, de, vA.toWireType(Ge, Rt)), $A(Ge);
            } };
          }), [{ name: l2.name, fromWireType: function(L) {
            var F = {}, H;
            for (H in v2)
              F[H] = v2[H].read(L);
            return C(L), F;
          }, toWireType: function(L, F) {
            for (var H in v2)
              if (!(H in F))
                throw new TypeError('Missing field:  "' + H + '"');
            var W = f();
            for (H in v2)
              v2[H].write(W, F[H]);
            return L !== null && L.push(C, W), W;
          }, argPackAdvance: 8, readValueFromPointer: fe, V: C }];
        });
      }, v: function() {
      }, B: function(u2, l2, f, C, h2) {
        var S2 = z(f);
        l2 = SA(l2), Z(u2, { name: l2, fromWireType: function(k) {
          return !!k;
        }, toWireType: function(k, v2) {
          return v2 ? C : h2;
        }, argPackAdvance: 8, readValueFromPointer: function(k) {
          if (f === 1)
            var v2 = d2;
          else if (f === 2)
            v2 = D;
          else if (f === 4)
            v2 = y;
          else
            throw new TypeError("Unknown boolean type size: " + l2);
          return this.fromWireType(v2[k >> S2]);
        }, V: null });
      }, f: function(u2, l2, f, C, h2, S2, k, v2, L, F, H, W, oA) {
        H = SA(H), S2 = PA(h2, S2), v2 && (v2 = PA(k, v2)), F && (F = PA(L, F)), oA = PA(W, oA);
        var vA = kA(H);
        CA(vA, function() {
          be("Cannot construct " + H + " due to unbound types", [C]);
        }), Y([u2, l2, f], C ? [C] : [], function(uA) {
          if (uA = uA[0], C)
            var ee = uA.N, de = ee.X;
          else
            de = gA.prototype;
          uA = xA(vA, function() {
            if (Object.getPrototypeOf(this) !== Rt)
              throw new QA("Use 'new' to construct " + H);
            if (Ge.Y === void 0)
              throw new QA(H + " has no accessible constructor");
            var rs = Ge.Y[arguments.length];
            if (rs === void 0)
              throw new QA("Tried to invoke ctor of " + H + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(Ge.Y).toString() + ") parameters instead!");
            return rs.apply(this, arguments);
          });
          var Rt = Object.create(de, { constructor: { value: uA } });
          uA.prototype = Rt;
          var Ge = new IA(H, uA, Rt, oA, ee, S2, v2, F);
          ee = new yA(H, Ge, true, false), de = new yA(H + "*", Ge, false, false);
          var ts = new yA(H + " const*", Ge, false, true);
          return jA[u2] = { pointerType: de, la: ts }, kt(vA, uA), [ee, de, ts];
        });
      }, d: function(u2, l2, f, C, h2, S2, k) {
        var v2 = wA(f, C);
        l2 = SA(l2), S2 = PA(h2, S2), Y([], [u2], function(L) {
          function F() {
            be("Cannot call " + H + " due to unbound types", v2);
          }
          L = L[0];
          var H = L.name + "." + l2;
          l2.startsWith("@@") && (l2 = Symbol[l2.substring(2)]);
          var W = L.N.constructor;
          return W[l2] === void 0 ? (F.Z = f - 1, W[l2] = F) : (iA(W, l2, H), W[l2].S[f - 1] = F), Y([], v2, function(oA) {
            return oA = dA(H, [oA[0], null].concat(oA.slice(1)), null, S2, k), W[l2].S === void 0 ? (oA.Z = f - 1, W[l2] = oA) : W[l2].S[f - 1] = oA, [];
          }), [];
        });
      }, p: function(u2, l2, f, C, h2, S2) {
        0 < l2 || $();
        var k = wA(l2, f);
        h2 = PA(C, h2), Y([], [u2], function(v2) {
          v2 = v2[0];
          var L = "constructor " + v2.name;
          if (v2.N.Y === void 0 && (v2.N.Y = []), v2.N.Y[l2 - 1] !== void 0)
            throw new QA("Cannot register multiple constructors with identical number of parameters (" + (l2 - 1) + ") for class '" + v2.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          return v2.N.Y[l2 - 1] = () => {
            be("Cannot construct " + v2.name + " due to unbound types", k);
          }, Y([], k, function(F) {
            return F.splice(1, 0, null), v2.N.Y[l2 - 1] = dA(L, F, null, h2, S2), [];
          }), [];
        });
      }, a: function(u2, l2, f, C, h2, S2, k, v2) {
        var L = wA(f, C);
        l2 = SA(l2), S2 = PA(h2, S2), Y([], [u2], function(F) {
          function H() {
            be("Cannot call " + W + " due to unbound types", L);
          }
          F = F[0];
          var W = F.name + "." + l2;
          l2.startsWith("@@") && (l2 = Symbol[l2.substring(2)]), v2 && F.N.ja.push(l2);
          var oA = F.N.X, vA = oA[l2];
          return vA === void 0 || vA.S === void 0 && vA.className !== F.name && vA.Z === f - 2 ? (H.Z = f - 2, H.className = F.name, oA[l2] = H) : (iA(oA, l2, W), oA[l2].S[f - 2] = H), Y([], L, function(uA) {
            return uA = dA(W, uA, F, S2, k), oA[l2].S === void 0 ? (uA.Z = f - 2, oA[l2] = uA) : oA[l2].S[f - 2] = uA, [];
          }), [];
        });
      }, A: function(u2, l2) {
        l2 = SA(l2), Z(u2, { name: l2, fromWireType: function(f) {
          var C = MA(f);
          return Ae(f), C;
        }, toWireType: function(f, C) {
          return GA(C);
        }, argPackAdvance: 8, readValueFromPointer: fe, V: null });
      }, n: function(u2, l2, f) {
        f = z(f), l2 = SA(l2), Z(u2, { name: l2, fromWireType: function(C) {
          return C;
        }, toWireType: function(C, h2) {
          return h2;
        }, argPackAdvance: 8, readValueFromPointer: Qe(l2, f), V: null });
      }, e: function(u2, l2, f, C, h2) {
        l2 = SA(l2), h2 === -1 && (h2 = 4294967295), h2 = z(f);
        var S2 = (v2) => v2;
        if (C === 0) {
          var k = 32 - 8 * f;
          S2 = (v2) => v2 << k >>> k;
        }
        f = l2.includes("unsigned") ? function(v2, L) {
          return L >>> 0;
        } : function(v2, L) {
          return L;
        }, Z(u2, { name: l2, fromWireType: S2, toWireType: f, argPackAdvance: 8, readValueFromPointer: Ce(l2, h2, C !== 0), V: null });
      }, b: function(u2, l2, f) {
        function C(S2) {
          S2 >>= 2;
          var k = p;
          return new h2(Q, k[S2 + 1], k[S2]);
        }
        var h2 = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][l2];
        f = SA(f), Z(u2, { name: f, fromWireType: C, argPackAdvance: 8, readValueFromPointer: C }, { ua: true });
      }, o: function(u2, l2) {
        l2 = SA(l2);
        var f = l2 === "std::string";
        Z(u2, { name: l2, fromWireType: function(C) {
          var h2 = p[C >> 2], S2 = C + 4;
          if (f)
            for (var k = S2, v2 = 0; v2 <= h2; ++v2) {
              var L = S2 + v2;
              if (v2 == h2 || m2[L] == 0) {
                if (k = k ? E(m2, k, L - k) : "", F === void 0)
                  var F = k;
                else
                  F += String.fromCharCode(0), F += k;
                k = L + 1;
              }
            }
          else {
            for (F = Array(h2), v2 = 0; v2 < h2; ++v2)
              F[v2] = String.fromCharCode(m2[S2 + v2]);
            F = F.join("");
          }
          return Le(C), F;
        }, toWireType: function(C, h2) {
          h2 instanceof ArrayBuffer && (h2 = new Uint8Array(h2));
          var S2, k = typeof h2 == "string";
          if (k || h2 instanceof Uint8Array || h2 instanceof Uint8ClampedArray || h2 instanceof Int8Array || K2("Cannot pass non-string to std::string"), f && k) {
            var v2 = 0;
            for (S2 = 0; S2 < h2.length; ++S2) {
              var L = h2.charCodeAt(S2);
              127 >= L ? v2++ : 2047 >= L ? v2 += 2 : 55296 <= L && 57343 >= L ? (v2 += 4, ++S2) : v2 += 3;
            }
            S2 = v2;
          } else
            S2 = h2.length;
          if (v2 = Dn(4 + S2 + 1), L = v2 + 4, p[v2 >> 2] = S2, f && k) {
            if (k = L, L = S2 + 1, S2 = m2, 0 < L) {
              L = k + L - 1;
              for (var F = 0; F < h2.length; ++F) {
                var H = h2.charCodeAt(F);
                if (55296 <= H && 57343 >= H) {
                  var W = h2.charCodeAt(++F);
                  H = 65536 + ((H & 1023) << 10) | W & 1023;
                }
                if (127 >= H) {
                  if (k >= L)
                    break;
                  S2[k++] = H;
                } else {
                  if (2047 >= H) {
                    if (k + 1 >= L)
                      break;
                    S2[k++] = 192 | H >> 6;
                  } else {
                    if (65535 >= H) {
                      if (k + 2 >= L)
                        break;
                      S2[k++] = 224 | H >> 12;
                    } else {
                      if (k + 3 >= L)
                        break;
                      S2[k++] = 240 | H >> 18, S2[k++] = 128 | H >> 12 & 63;
                    }
                    S2[k++] = 128 | H >> 6 & 63;
                  }
                  S2[k++] = 128 | H & 63;
                }
              }
              S2[k] = 0;
            }
          } else if (k)
            for (k = 0; k < S2; ++k)
              F = h2.charCodeAt(k), 255 < F && (Le(L), K2("String has UTF-16 code units that do not fit in 8 bits")), m2[L + k] = F;
          else
            for (k = 0; k < S2; ++k)
              m2[L + k] = h2[k];
          return C !== null && C.push(Le, v2), v2;
        }, argPackAdvance: 8, readValueFromPointer: fe, V: function(C) {
          Le(C);
        } });
      }, i: function(u2, l2, f) {
        if (f = SA(f), l2 === 2)
          var C = KA, h2 = se, S2 = xt, k = () => x2, v2 = 1;
        else
          l2 === 4 && (C = ct, h2 = kr, S2 = xr, k = () => p, v2 = 2);
        Z(u2, { name: f, fromWireType: function(L) {
          for (var F = p[L >> 2], H = k(), W, oA = L + 4, vA = 0; vA <= F; ++vA) {
            var uA = L + 4 + vA * l2;
            (vA == F || H[uA >> v2] == 0) && (oA = C(oA, uA - oA), W === void 0 ? W = oA : (W += String.fromCharCode(0), W += oA), oA = uA + l2);
          }
          return Le(L), W;
        }, toWireType: function(L, F) {
          typeof F != "string" && K2("Cannot pass non-string to C++ string type " + f);
          var H = S2(F), W = Dn(4 + H + l2);
          return p[W >> 2] = H >> v2, h2(F, W + 4, H + l2), L !== null && L.push(Le, W), W;
        }, argPackAdvance: 8, readValueFromPointer: fe, V: function(L) {
          Le(L);
        } });
      }, k: function(u2, l2, f, C, h2, S2) {
        Me[u2] = { name: SA(l2), fa: PA(f, C), W: PA(h2, S2), ia: [] };
      }, h: function(u2, l2, f, C, h2, S2, k, v2, L, F) {
        Me[u2].ia.push({ oa: SA(l2), ta: f, ra: PA(C, h2), sa: S2, za: k, ya: PA(v2, L), Aa: F });
      }, C: function(u2, l2) {
        l2 = SA(l2), Z(u2, { va: true, name: l2, argPackAdvance: 0, fromWireType: function() {
        }, toWireType: function() {
        } });
      }, s: function(u2, l2, f, C, h2) {
        u2 = vr[u2], l2 = MA(l2), f = Zo(f);
        var S2 = [];
        return p[C >> 2] = GA(S2), u2(l2, f, S2, h2);
      }, t: function(u2, l2, f, C) {
        u2 = vr[u2], l2 = MA(l2), f = Zo(f), u2(l2, f, null, C);
      }, g: Ae, m: function(u2, l2) {
        var f = su(u2, l2), C = f[0];
        l2 = C.name + "_$" + f.slice(1).map(function(k) {
          return k.name;
        }).join("_") + "$";
        var h2 = jo[l2];
        if (h2 !== void 0)
          return h2;
        var S2 = Array(u2 - 1);
        return h2 = ou((k, v2, L, F) => {
          for (var H = 0, W = 0; W < u2 - 1; ++W)
            S2[W] = f[W + 1].readValueFromPointer(F + H), H += f[W + 1].argPackAdvance;
          for (k = k[v2].apply(k, S2), W = 0; W < u2 - 1; ++W)
            f[W + 1].ma && f[W + 1].ma(S2[W]);
          if (!C.va)
            return C.toWireType(L, k);
        }), jo[l2] = h2;
      }, D: function(u2) {
        4 < u2 && (J[u2].ga += 1);
      }, r: function(u2) {
        var l2 = MA(u2);
        $A(l2), Ae(u2);
      }, c: function() {
        $("");
      }, x: function(u2, l2, f) {
        m2.copyWithin(u2, l2, l2 + f);
      }, w: function(u2) {
        var l2 = m2.length;
        if (u2 >>>= 0, 2147483648 < u2)
          return false;
        for (var f = 1; 4 >= f; f *= 2) {
          var C = l2 * (1 + 0.2 / f);
          C = Math.min(C, u2 + 100663296);
          var h2 = Math;
          C = Math.max(u2, C), h2 = h2.min.call(h2, 2147483648, C + (65536 - C % 65536) % 65536);
          A: {
            try {
              c2.grow(h2 - Q.byteLength + 65535 >>> 16), U();
              var S2 = 1;
              break A;
            } catch {
            }
            S2 = void 0;
          }
          if (S2)
            return true;
        }
        return false;
      }, z: function() {
        return 52;
      }, u: function() {
        return 70;
      }, y: function(u2, l2, f, C) {
        for (var h2 = 0, S2 = 0; S2 < f; S2++) {
          var k = p[l2 >> 2], v2 = p[l2 + 4 >> 2];
          l2 += 8;
          for (var L = 0; L < v2; L++) {
            var F = m2[k + L], H = au[u2];
            F === 0 || F === 10 ? ((u2 === 1 ? s : a)(E(H, 0)), H.length = 0) : H.push(F);
          }
          h2 += v2;
        }
        return p[C >> 2] = h2, 0;
      } };
      (function() {
        function u2(h2) {
          t.asm = h2.exports, c2 = t.asm.E, U(), P2 = t.asm.J, lA.unshift(t.asm.F), eA--, t.monitorRunDependencies && t.monitorRunDependencies(eA), eA == 0 && (NA !== null && (clearInterval(NA), NA = null), nA && (h2 = nA, nA = null, h2()));
        }
        function l2(h2) {
          u2(h2.instance);
        }
        function f(h2) {
          return te().then(function(S2) {
            return WebAssembly.instantiate(S2, C);
          }).then(function(S2) {
            return S2;
          }).then(h2, function(S2) {
            a("failed to asynchronously prepare wasm: " + S2), $(S2);
          });
        }
        var C = { a: Iu };
        if (eA++, t.monitorRunDependencies && t.monitorRunDependencies(eA), t.instantiateWasm)
          try {
            return t.instantiateWasm(C, u2);
          } catch (h2) {
            a("Module.instantiateWasm callback failed with error: " + h2), n(h2);
          }
        return function() {
          return I || typeof WebAssembly.instantiateStreaming != "function" || HA(tA) || typeof fetch != "function" ? f(l2) : fetch(tA, { credentials: "same-origin" }).then(function(h2) {
            return WebAssembly.instantiateStreaming(h2, C).then(l2, function(S2) {
              return a("wasm streaming compile failed: " + S2), a("falling back to ArrayBuffer instantiation"), f(l2);
            });
          });
        }().catch(n), {};
      })(), t.___wasm_call_ctors = function() {
        return (t.___wasm_call_ctors = t.asm.F).apply(null, arguments);
      };
      var As = t.___getTypeName = function() {
        return (As = t.___getTypeName = t.asm.G).apply(null, arguments);
      };
      t.__embind_initialize_bindings = function() {
        return (t.__embind_initialize_bindings = t.asm.H).apply(null, arguments);
      };
      var Dn = t._malloc = function() {
        return (Dn = t._malloc = t.asm.I).apply(null, arguments);
      }, Le = t._free = function() {
        return (Le = t._free = t.asm.K).apply(null, arguments);
      };
      t.dynCall_jiji = function() {
        return (t.dynCall_jiji = t.asm.L).apply(null, arguments);
      };
      var Fr;
      nA = function u2() {
        Fr || es(), Fr || (nA = u2);
      };
      function es() {
        function u2() {
          if (!Fr && (Fr = true, t.calledRun = true, !B)) {
            if (FA(lA), r(t), t.onRuntimeInitialized && t.onRuntimeInitialized(), t.postRun)
              for (typeof t.postRun == "function" && (t.postRun = [t.postRun]); t.postRun.length; ) {
                var l2 = t.postRun.shift();
                DA.unshift(l2);
              }
            FA(DA);
          }
        }
        if (!(0 < eA)) {
          if (t.preRun)
            for (typeof t.preRun == "function" && (t.preRun = [t.preRun]); t.preRun.length; )
              RA();
          FA(q), 0 < eA || (t.setStatus ? (t.setStatus("Running..."), setTimeout(function() {
            setTimeout(function() {
              t.setStatus("");
            }, 1), u2();
          }, 1)) : u2());
        }
      }
      if (t.preInit)
        for (typeof t.preInit == "function" && (t.preInit = [t.preInit]); 0 < t.preInit.length; )
          t.preInit.pop()();
      return es(), e.ready;
    };
  })(), Fu = Nu;
});
async function Ss(A) {
  let { default: e } = await Promise.resolve().then(() => (Ds(), ws));
  return Hn(await e(A));
}
var bs = tt(() => {
  ys();
  Pr();
});
var On = {};
Lr(On, { getYoga: () => Lu });
function Lu() {
  return Mu;
}
var Mu;
var Tn = tt(() => {
  bs();
  Mu = Ss();
});
var gi = _((ai) => {
  "use strict";
  Object.defineProperty(ai, "__esModule", { value: true });
  Object.defineProperty(ai, "default", { enumerable: true, get: () => Vl });
  function Vl(A) {
    if (A = `${A}`, A === "0")
      return "0";
    if (/^[+-]?(\d+|\d*\.\d+)(e[+-]?\d+)?(%|\w+)?$/.test(A))
      return A.replace(/^[+-]?/, (e) => e === "-" ? "" : "-");
    if (A.includes("var(") || A.includes("calc("))
      return `calc(${A} * -1)`;
  }
});
var wa = _((Ii) => {
  "use strict";
  Object.defineProperty(Ii, "__esModule", { value: true });
  Object.defineProperty(Ii, "default", { enumerable: true, get: () => zl });
  var zl = ["preflight", "container", "accessibility", "pointerEvents", "visibility", "position", "inset", "isolation", "zIndex", "order", "gridColumn", "gridColumnStart", "gridColumnEnd", "gridRow", "gridRowStart", "gridRowEnd", "float", "clear", "margin", "boxSizing", "display", "aspectRatio", "height", "maxHeight", "minHeight", "width", "minWidth", "maxWidth", "flex", "flexShrink", "flexGrow", "flexBasis", "tableLayout", "borderCollapse", "borderSpacing", "transformOrigin", "translate", "rotate", "skew", "scale", "transform", "animation", "cursor", "touchAction", "userSelect", "resize", "scrollSnapType", "scrollSnapAlign", "scrollSnapStop", "scrollMargin", "scrollPadding", "listStylePosition", "listStyleType", "appearance", "columns", "breakBefore", "breakInside", "breakAfter", "gridAutoColumns", "gridAutoFlow", "gridAutoRows", "gridTemplateColumns", "gridTemplateRows", "flexDirection", "flexWrap", "placeContent", "placeItems", "alignContent", "alignItems", "justifyContent", "justifyItems", "gap", "space", "divideWidth", "divideStyle", "divideColor", "divideOpacity", "placeSelf", "alignSelf", "justifySelf", "overflow", "overscrollBehavior", "scrollBehavior", "textOverflow", "whitespace", "wordBreak", "borderRadius", "borderWidth", "borderStyle", "borderColor", "borderOpacity", "backgroundColor", "backgroundOpacity", "backgroundImage", "gradientColorStops", "boxDecorationBreak", "backgroundSize", "backgroundAttachment", "backgroundClip", "backgroundPosition", "backgroundRepeat", "backgroundOrigin", "fill", "stroke", "strokeWidth", "objectFit", "objectPosition", "padding", "textAlign", "textIndent", "verticalAlign", "fontFamily", "fontSize", "fontWeight", "textTransform", "fontStyle", "fontVariantNumeric", "lineHeight", "letterSpacing", "textColor", "textOpacity", "textDecoration", "textDecorationColor", "textDecorationStyle", "textDecorationThickness", "textUnderlineOffset", "fontSmoothing", "placeholderColor", "placeholderOpacity", "caretColor", "accentColor", "opacity", "backgroundBlendMode", "mixBlendMode", "boxShadow", "boxShadowColor", "outlineStyle", "outlineWidth", "outlineOffset", "outlineColor", "ringWidth", "ringColor", "ringOpacity", "ringOffsetWidth", "ringOffsetColor", "blur", "brightness", "contrast", "dropShadow", "grayscale", "hueRotate", "invert", "saturate", "sepia", "filter", "backdropBlur", "backdropBrightness", "backdropContrast", "backdropGrayscale", "backdropHueRotate", "backdropInvert", "backdropOpacity", "backdropSaturate", "backdropSepia", "backdropFilter", "transitionProperty", "transitionDelay", "transitionDuration", "transitionTimingFunction", "willChange", "content"];
});
var Da = _((ui) => {
  "use strict";
  Object.defineProperty(ui, "__esModule", { value: true });
  Object.defineProperty(ui, "default", { enumerable: true, get: () => Zl });
  function Zl(A, e) {
    return A === void 0 ? e : Array.isArray(A) ? A : [...new Set(e.filter((r) => A !== false && A[r] !== false).concat(Object.keys(A).filter((r) => A[r] !== false)))];
  }
});
var li = _(($p, Sa) => {
  Sa.exports = { content: [], presets: [], darkMode: "media", theme: { screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" }, colors: ({ colors: A }) => ({ inherit: A.inherit, current: A.current, transparent: A.transparent, black: A.black, white: A.white, slate: A.slate, gray: A.gray, zinc: A.zinc, neutral: A.neutral, stone: A.stone, red: A.red, orange: A.orange, amber: A.amber, yellow: A.yellow, lime: A.lime, green: A.green, emerald: A.emerald, teal: A.teal, cyan: A.cyan, sky: A.sky, blue: A.blue, indigo: A.indigo, violet: A.violet, purple: A.purple, fuchsia: A.fuchsia, pink: A.pink, rose: A.rose }), columns: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem" }, spacing: { px: "1px", 0: "0px", 0.5: "0.125rem", 1: "0.25rem", 1.5: "0.375rem", 2: "0.5rem", 2.5: "0.625rem", 3: "0.75rem", 3.5: "0.875rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem", 11: "2.75rem", 12: "3rem", 14: "3.5rem", 16: "4rem", 20: "5rem", 24: "6rem", 28: "7rem", 32: "8rem", 36: "9rem", 40: "10rem", 44: "11rem", 48: "12rem", 52: "13rem", 56: "14rem", 60: "15rem", 64: "16rem", 72: "18rem", 80: "20rem", 96: "24rem" }, animation: { none: "none", spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite", pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", bounce: "bounce 1s infinite" }, aspectRatio: { auto: "auto", square: "1 / 1", video: "16 / 9" }, backdropBlur: ({ theme: A }) => A("blur"), backdropBrightness: ({ theme: A }) => A("brightness"), backdropContrast: ({ theme: A }) => A("contrast"), backdropGrayscale: ({ theme: A }) => A("grayscale"), backdropHueRotate: ({ theme: A }) => A("hueRotate"), backdropInvert: ({ theme: A }) => A("invert"), backdropOpacity: ({ theme: A }) => A("opacity"), backdropSaturate: ({ theme: A }) => A("saturate"), backdropSepia: ({ theme: A }) => A("sepia"), backgroundColor: ({ theme: A }) => A("colors"), backgroundImage: { none: "none", "gradient-to-t": "linear-gradient(to top, var(--tw-gradient-stops))", "gradient-to-tr": "linear-gradient(to top right, var(--tw-gradient-stops))", "gradient-to-r": "linear-gradient(to right, var(--tw-gradient-stops))", "gradient-to-br": "linear-gradient(to bottom right, var(--tw-gradient-stops))", "gradient-to-b": "linear-gradient(to bottom, var(--tw-gradient-stops))", "gradient-to-bl": "linear-gradient(to bottom left, var(--tw-gradient-stops))", "gradient-to-l": "linear-gradient(to left, var(--tw-gradient-stops))", "gradient-to-tl": "linear-gradient(to top left, var(--tw-gradient-stops))" }, backgroundOpacity: ({ theme: A }) => A("opacity"), backgroundPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, backgroundSize: { auto: "auto", cover: "cover", contain: "contain" }, blur: { 0: "0", none: "0", sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" }, brightness: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5", 200: "2" }, borderColor: ({ theme: A }) => ({ ...A("colors"), DEFAULT: A("colors.gray.200", "currentColor") }), borderOpacity: ({ theme: A }) => A("opacity"), borderRadius: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" }, borderSpacing: ({ theme: A }) => ({ ...A("spacing") }), borderWidth: { DEFAULT: "1px", 0: "0px", 2: "2px", 4: "4px", 8: "8px" }, boxShadow: { sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)", none: "none" }, boxShadowColor: ({ theme: A }) => A("colors"), caretColor: ({ theme: A }) => A("colors"), accentColor: ({ theme: A }) => ({ ...A("colors"), auto: "auto" }), contrast: { 0: "0", 50: ".5", 75: ".75", 100: "1", 125: "1.25", 150: "1.5", 200: "2" }, container: {}, content: { none: "none" }, cursor: { auto: "auto", default: "default", pointer: "pointer", wait: "wait", text: "text", move: "move", help: "help", "not-allowed": "not-allowed", none: "none", "context-menu": "context-menu", progress: "progress", cell: "cell", crosshair: "crosshair", "vertical-text": "vertical-text", alias: "alias", copy: "copy", "no-drop": "no-drop", grab: "grab", grabbing: "grabbing", "all-scroll": "all-scroll", "col-resize": "col-resize", "row-resize": "row-resize", "n-resize": "n-resize", "e-resize": "e-resize", "s-resize": "s-resize", "w-resize": "w-resize", "ne-resize": "ne-resize", "nw-resize": "nw-resize", "se-resize": "se-resize", "sw-resize": "sw-resize", "ew-resize": "ew-resize", "ns-resize": "ns-resize", "nesw-resize": "nesw-resize", "nwse-resize": "nwse-resize", "zoom-in": "zoom-in", "zoom-out": "zoom-out" }, divideColor: ({ theme: A }) => A("borderColor"), divideOpacity: ({ theme: A }) => A("borderOpacity"), divideWidth: ({ theme: A }) => A("borderWidth"), dropShadow: { sm: "0 1px 1px rgb(0 0 0 / 0.05)", DEFAULT: ["0 1px 2px rgb(0 0 0 / 0.1)", "0 1px 1px rgb(0 0 0 / 0.06)"], md: ["0 4px 3px rgb(0 0 0 / 0.07)", "0 2px 2px rgb(0 0 0 / 0.06)"], lg: ["0 10px 8px rgb(0 0 0 / 0.04)", "0 4px 3px rgb(0 0 0 / 0.1)"], xl: ["0 20px 13px rgb(0 0 0 / 0.03)", "0 8px 5px rgb(0 0 0 / 0.08)"], "2xl": "0 25px 25px rgb(0 0 0 / 0.15)", none: "0 0 #0000" }, fill: ({ theme: A }) => A("colors"), grayscale: { 0: "0", DEFAULT: "100%" }, hueRotate: { 0: "0deg", 15: "15deg", 30: "30deg", 60: "60deg", 90: "90deg", 180: "180deg" }, invert: { 0: "0", DEFAULT: "100%" }, flex: { 1: "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }, flexBasis: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%" }), flexGrow: { 0: "0", DEFAULT: "1" }, flexShrink: { 0: "0", DEFAULT: "1" }, fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", '"Noto Sans"', "sans-serif", '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'], serif: ["ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', '"Courier New"', "monospace"] }, fontSize: { xs: ["0.75rem", { lineHeight: "1rem" }], sm: ["0.875rem", { lineHeight: "1.25rem" }], base: ["1rem", { lineHeight: "1.5rem" }], lg: ["1.125rem", { lineHeight: "1.75rem" }], xl: ["1.25rem", { lineHeight: "1.75rem" }], "2xl": ["1.5rem", { lineHeight: "2rem" }], "3xl": ["1.875rem", { lineHeight: "2.25rem" }], "4xl": ["2.25rem", { lineHeight: "2.5rem" }], "5xl": ["3rem", { lineHeight: "1" }], "6xl": ["3.75rem", { lineHeight: "1" }], "7xl": ["4.5rem", { lineHeight: "1" }], "8xl": ["6rem", { lineHeight: "1" }], "9xl": ["8rem", { lineHeight: "1" }] }, fontWeight: { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" }, gap: ({ theme: A }) => A("spacing"), gradientColorStops: ({ theme: A }) => A("colors"), gridAutoColumns: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridAutoRows: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridColumn: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-7": "span 7 / span 7", "span-8": "span 8 / span 8", "span-9": "span 9 / span 9", "span-10": "span 10 / span 10", "span-11": "span 11 / span 11", "span-12": "span 12 / span 12", "span-full": "1 / -1" }, gridColumnEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridColumnStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridRow: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-full": "1 / -1" }, gridRowStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridRowEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridTemplateColumns: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))", 7: "repeat(7, minmax(0, 1fr))", 8: "repeat(8, minmax(0, 1fr))", 9: "repeat(9, minmax(0, 1fr))", 10: "repeat(10, minmax(0, 1fr))", 11: "repeat(11, minmax(0, 1fr))", 12: "repeat(12, minmax(0, 1fr))" }, gridTemplateRows: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))" }, height: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), inset: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), keyframes: { spin: { to: { transform: "rotate(360deg)" } }, ping: { "75%, 100%": { transform: "scale(2)", opacity: "0" } }, pulse: { "50%": { opacity: ".5" } }, bounce: { "0%, 100%": { transform: "translateY(-25%)", animationTimingFunction: "cubic-bezier(0.8,0,1,1)" }, "50%": { transform: "none", animationTimingFunction: "cubic-bezier(0,0,0.2,1)" } } }, letterSpacing: { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }, lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2", 3: ".75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem" }, listStyleType: { none: "none", disc: "disc", decimal: "decimal" }, margin: ({ theme: A }) => ({ auto: "auto", ...A("spacing") }), maxHeight: ({ theme: A }) => ({ ...A("spacing"), full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), maxWidth: ({ theme: A, breakpoints: e }) => ({ none: "none", 0: "0rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch", ...e(A("screens")) }), minHeight: { 0: "0px", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }, minWidth: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" }, objectPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, opacity: { 0: "0", 5: "0.05", 10: "0.1", 20: "0.2", 25: "0.25", 30: "0.3", 40: "0.4", 50: "0.5", 60: "0.6", 70: "0.7", 75: "0.75", 80: "0.8", 90: "0.9", 95: "0.95", 100: "1" }, order: { first: "-9999", last: "9999", none: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12" }, padding: ({ theme: A }) => A("spacing"), placeholderColor: ({ theme: A }) => A("colors"), placeholderOpacity: ({ theme: A }) => A("opacity"), outlineColor: ({ theme: A }) => A("colors"), outlineOffset: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, outlineWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringColor: ({ theme: A }) => ({ DEFAULT: A("colors.blue.500", "#3b82f6"), ...A("colors") }), ringOffsetColor: ({ theme: A }) => A("colors"), ringOffsetWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringOpacity: ({ theme: A }) => ({ DEFAULT: "0.5", ...A("opacity") }), ringWidth: { DEFAULT: "3px", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, rotate: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg", 45: "45deg", 90: "90deg", 180: "180deg" }, saturate: { 0: "0", 50: ".5", 100: "1", 150: "1.5", 200: "2" }, scale: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5" }, scrollMargin: ({ theme: A }) => ({ ...A("spacing") }), scrollPadding: ({ theme: A }) => A("spacing"), sepia: { 0: "0", DEFAULT: "100%" }, skew: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg" }, space: ({ theme: A }) => ({ ...A("spacing") }), stroke: ({ theme: A }) => A("colors"), strokeWidth: { 0: "0", 1: "1", 2: "2" }, textColor: ({ theme: A }) => A("colors"), textDecorationColor: ({ theme: A }) => A("colors"), textDecorationThickness: { auto: "auto", "from-font": "from-font", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textUnderlineOffset: { auto: "auto", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textIndent: ({ theme: A }) => ({ ...A("spacing") }), textOpacity: ({ theme: A }) => A("opacity"), transformOrigin: { center: "center", top: "top", "top-right": "top right", right: "right", "bottom-right": "bottom right", bottom: "bottom", "bottom-left": "bottom left", left: "left", "top-left": "top left" }, transitionDelay: { 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionDuration: { DEFAULT: "150ms", 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionProperty: { none: "none", all: "all", DEFAULT: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter", colors: "color, background-color, border-color, text-decoration-color, fill, stroke", opacity: "opacity", shadow: "box-shadow", transform: "transform" }, transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)", linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" }, translate: ({ theme: A }) => ({ ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), width: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%", screen: "100vw", min: "min-content", max: "max-content", fit: "fit-content" }), willChange: { auto: "auto", scroll: "scroll-position", contents: "contents", transform: "transform" }, zIndex: { auto: "auto", 0: "0", 10: "10", 20: "20", 30: "30", 40: "40", 50: "50" } }, variantOrder: ["first", "last", "odd", "even", "visited", "checked", "empty", "read-only", "group-hover", "group-focus", "focus-within", "hover", "focus", "focus-visible", "active", "disabled"], plugins: [] };
});
var nn = {};
Lr(nn, { default: () => jl });
var jl;
var on = tt(() => {
  jl = { info(A, e) {
    console.info(...Array.isArray(A) ? [A] : [e, A]);
  }, warn(A, e) {
    console.warn(...Array.isArray(A) ? [A] : [e, A]);
  }, risk(A, e) {
    console.error(...Array.isArray(A) ? [A] : [e, A]);
  } };
});
var ba = _((ci) => {
  "use strict";
  Object.defineProperty(ci, "__esModule", { value: true });
  Object.defineProperty(ci, "default", { enumerable: true, get: () => ec2 });
  var $l = Ac((on(), Gr(nn)));
  function Ac(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Yt({ version: A, from: e, to: t }) {
    $l.default.warn(`${e}-color-renamed`, [`As of Tailwind CSS ${A}, \`${e}\` has been renamed to \`${t}\`.`, "Update your configuration file to silence this warning."]);
  }
  var ec2 = { inherit: "inherit", current: "currentColor", transparent: "transparent", black: "#000", white: "#fff", slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" }, gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151", 800: "#1f2937", 900: "#111827" }, zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b" }, neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717" }, stone: { 50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1", 400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c", 800: "#292524", 900: "#1c1917" }, red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" }, orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" }, amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" }, yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" }, lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314" }, green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" }, emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" }, teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a" }, cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63" }, sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e" }, blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" }, indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" }, violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95" }, purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" }, fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75" }, pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" }, rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337" }, get lightBlue() {
    return Yt({ version: "v2.2", from: "lightBlue", to: "sky" }), this.sky;
  }, get warmGray() {
    return Yt({ version: "v3.0", from: "warmGray", to: "stone" }), this.stone;
  }, get trueGray() {
    return Yt({ version: "v3.0", from: "trueGray", to: "neutral" }), this.neutral;
  }, get coolGray() {
    return Yt({ version: "v3.0", from: "coolGray", to: "gray" }), this.gray;
  }, get blueGray() {
    return Yt({ version: "v3.0", from: "blueGray", to: "slate" }), this.slate;
  } };
});
var ka = _((Bi) => {
  "use strict";
  Object.defineProperty(Bi, "__esModule", { value: true });
  Object.defineProperty(Bi, "defaults", { enumerable: true, get: () => tc });
  function tc(A, ...e) {
    for (let n of e) {
      for (let i in n) {
        var t;
        !(A == null || (t = A.hasOwnProperty) === null || t === void 0) && t.call(A, i) || (A[i] = n[i]);
      }
      for (let i of Object.getOwnPropertySymbols(n)) {
        var r;
        !(A == null || (r = A.hasOwnProperty) === null || r === void 0) && r.call(A, i) || (A[i] = n[i]);
      }
    }
    return A;
  }
});
var xa = _((Ei) => {
  "use strict";
  Object.defineProperty(Ei, "__esModule", { value: true });
  Object.defineProperty(Ei, "toPath", { enumerable: true, get: () => rc });
  function rc(A) {
    if (Array.isArray(A))
      return A;
    let e = A.split("[").length - 1, t = A.split("]").length - 1;
    if (e !== t)
      throw new Error(`Path is invalid. Has unbalanced brackets: ${A}`);
    return A.split(/\.(?![^\[]*\])|[\[\]]/g).filter(Boolean);
  }
});
var va = _((fi) => {
  "use strict";
  Object.defineProperty(fi, "__esModule", { value: true });
  Object.defineProperty(fi, "normalizeConfig", { enumerable: true, get: () => ic });
  var qt = nc((on(), Gr(nn)));
  function Ra(A) {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap(), t = /* @__PURE__ */ new WeakMap();
    return (Ra = function(r) {
      return r ? t : e;
    })(A);
  }
  function nc(A, e) {
    if (!e && A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var t = Ra(e);
    if (t && t.has(A))
      return t.get(A);
    var r = {}, n = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var i in A)
      if (i !== "default" && Object.prototype.hasOwnProperty.call(A, i)) {
        var o = n ? Object.getOwnPropertyDescriptor(A, i) : null;
        o && (o.get || o.set) ? Object.defineProperty(r, i, o) : r[i] = A[i];
      }
    return r.default = A, t && t.set(A, r), r;
  }
  function ic(A) {
    if ((() => {
      if (A.purge || !A.content || !Array.isArray(A.content) && !(typeof A.content == "object" && A.content !== null))
        return false;
      if (Array.isArray(A.content))
        return A.content.every((r) => typeof r == "string" ? true : !(typeof (r == null ? void 0 : r.raw) != "string" || r != null && r.extension && typeof (r == null ? void 0 : r.extension) != "string"));
      if (typeof A.content == "object" && A.content !== null) {
        if (Object.keys(A.content).some((r) => !["files", "extract", "transform"].includes(r)))
          return false;
        if (Array.isArray(A.content.files)) {
          if (!A.content.files.every((r) => typeof r == "string" ? true : !(typeof (r == null ? void 0 : r.raw) != "string" || r != null && r.extension && typeof (r == null ? void 0 : r.extension) != "string")))
            return false;
          if (typeof A.content.extract == "object") {
            for (let r of Object.values(A.content.extract))
              if (typeof r != "function")
                return false;
          } else if (!(A.content.extract === void 0 || typeof A.content.extract == "function"))
            return false;
          if (typeof A.content.transform == "object") {
            for (let r of Object.values(A.content.transform))
              if (typeof r != "function")
                return false;
          } else if (!(A.content.transform === void 0 || typeof A.content.transform == "function"))
            return false;
        }
        return true;
      }
      return false;
    })() || qt.default.warn("purge-deprecation", ["The `purge`/`content` options have changed in Tailwind CSS v3.0.", "Update your configuration file to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#configure-content-sources"]), A.safelist = (() => {
      var r;
      let { content: n, purge: i, safelist: o } = A;
      return Array.isArray(o) ? o : Array.isArray(n == null ? void 0 : n.safelist) ? n.safelist : Array.isArray(i == null ? void 0 : i.safelist) ? i.safelist : Array.isArray(i == null || (r = i.options) === null || r === void 0 ? void 0 : r.safelist) ? i.options.safelist : [];
    })(), typeof A.prefix == "function")
      qt.default.warn("prefix-function", ["As of Tailwind CSS v3.0, `prefix` cannot be a function.", "Update `prefix` in your configuration to be a string to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#prefix-cannot-be-a-function"]), A.prefix = "";
    else {
      var t;
      A.prefix = (t = A.prefix) !== null && t !== void 0 ? t : "";
    }
    A.content = { files: (() => {
      let { content: r, purge: n } = A;
      return Array.isArray(n) ? n : Array.isArray(n == null ? void 0 : n.content) ? n.content : Array.isArray(r) ? r : Array.isArray(r == null ? void 0 : r.content) ? r.content : Array.isArray(r == null ? void 0 : r.files) ? r.files : [];
    })(), extract: (() => {
      let r = (() => {
        var o, s, a, I, g2, c2, B, E, Q, d2;
        return !((o = A.purge) === null || o === void 0) && o.extract ? A.purge.extract : !((s = A.content) === null || s === void 0) && s.extract ? A.content.extract : !((a = A.purge) === null || a === void 0 || (I = a.extract) === null || I === void 0) && I.DEFAULT ? A.purge.extract.DEFAULT : !((g2 = A.content) === null || g2 === void 0 || (c2 = g2.extract) === null || c2 === void 0) && c2.DEFAULT ? A.content.extract.DEFAULT : !((B = A.purge) === null || B === void 0 || (E = B.options) === null || E === void 0) && E.extractors ? A.purge.options.extractors : !((Q = A.content) === null || Q === void 0 || (d2 = Q.options) === null || d2 === void 0) && d2.extractors ? A.content.options.extractors : {};
      })(), n = {}, i = (() => {
        var o, s, a, I;
        if (!((o = A.purge) === null || o === void 0 || (s = o.options) === null || s === void 0) && s.defaultExtractor)
          return A.purge.options.defaultExtractor;
        if (!((a = A.content) === null || a === void 0 || (I = a.options) === null || I === void 0) && I.defaultExtractor)
          return A.content.options.defaultExtractor;
      })();
      if (i !== void 0 && (n.DEFAULT = i), typeof r == "function")
        n.DEFAULT = r;
      else if (Array.isArray(r))
        for (let { extensions: o, extractor: s } of r ?? [])
          for (let a of o)
            n[a] = s;
      else
        typeof r == "object" && r !== null && Object.assign(n, r);
      return n;
    })(), transform: (() => {
      let r = (() => {
        var i, o, s, a, I, g2;
        return !((i = A.purge) === null || i === void 0) && i.transform ? A.purge.transform : !((o = A.content) === null || o === void 0) && o.transform ? A.content.transform : !((s = A.purge) === null || s === void 0 || (a = s.transform) === null || a === void 0) && a.DEFAULT ? A.purge.transform.DEFAULT : !((I = A.content) === null || I === void 0 || (g2 = I.transform) === null || g2 === void 0) && g2.DEFAULT ? A.content.transform.DEFAULT : {};
      })(), n = {};
      return typeof r == "function" && (n.DEFAULT = r), typeof r == "object" && r !== null && Object.assign(n, r), n;
    })() };
    for (let r of A.content.files)
      if (typeof r == "string" && /{([^,]*?)}/g.test(r)) {
        qt.default.warn("invalid-glob-braces", [`The glob pattern ${(0, qt.dim)(r)} in your Tailwind CSS configuration is invalid.`, `Update it to ${(0, qt.dim)(r.replace(/{([^,]*?)}/g, "$1"))} to silence this warning.`]);
        break;
      }
    return A;
  }
});
var Na = _((Qi) => {
  "use strict";
  Object.defineProperty(Qi, "__esModule", { value: true });
  Object.defineProperty(Qi, "default", { enumerable: true, get: () => oc });
  function oc(A) {
    if (Object.prototype.toString.call(A) !== "[object Object]")
      return false;
    let e = Object.getPrototypeOf(A);
    return e === null || e === Object.prototype;
  }
});
var Fa = _((di) => {
  "use strict";
  Object.defineProperty(di, "__esModule", { value: true });
  Object.defineProperty(di, "cloneDeep", { enumerable: true, get: () => Ci });
  function Ci(A) {
    return Array.isArray(A) ? A.map((e) => Ci(e)) : typeof A == "object" && A !== null ? Object.fromEntries(Object.entries(A).map(([e, t]) => [e, Ci(t)])) : A;
  }
});
var hi = _((sn, Ma) => {
  "use strict";
  sn.__esModule = true;
  sn.default = gc;
  function sc(A) {
    for (var e = A.toLowerCase(), t = "", r = false, n = 0; n < 6 && e[n] !== void 0; n++) {
      var i = e.charCodeAt(n), o = i >= 97 && i <= 102 || i >= 48 && i <= 57;
      if (r = i === 32, !o)
        break;
      t += e[n];
    }
    if (t.length !== 0) {
      var s = parseInt(t, 16), a = s >= 55296 && s <= 57343;
      return a || s === 0 || s > 1114111 ? ["\uFFFD", t.length + (r ? 1 : 0)] : [String.fromCodePoint(s), t.length + (r ? 1 : 0)];
    }
  }
  var ac = /\\/;
  function gc(A) {
    var e = ac.test(A);
    if (!e)
      return A;
    for (var t = "", r = 0; r < A.length; r++) {
      if (A[r] === "\\") {
        var n = sc(A.slice(r + 1, r + 7));
        if (n !== void 0) {
          t += n[0], r += n[1];
          continue;
        }
        if (A[r + 1] === "\\") {
          t += "\\", r++;
          continue;
        }
        A.length === r + 1 && (t += A[r]);
        continue;
      }
      t += A[r];
    }
    return t;
  }
  Ma.exports = sn.default;
});
var Ga = _((an, La) => {
  "use strict";
  an.__esModule = true;
  an.default = Ic;
  function Ic(A) {
    for (var e = arguments.length, t = new Array(e > 1 ? e - 1 : 0), r = 1; r < e; r++)
      t[r - 1] = arguments[r];
    for (; t.length > 0; ) {
      var n = t.shift();
      if (!A[n])
        return;
      A = A[n];
    }
    return A;
  }
  La.exports = an.default;
});
var Ha = _((gn, Ua) => {
  "use strict";
  gn.__esModule = true;
  gn.default = uc;
  function uc(A) {
    for (var e = arguments.length, t = new Array(e > 1 ? e - 1 : 0), r = 1; r < e; r++)
      t[r - 1] = arguments[r];
    for (; t.length > 0; ) {
      var n = t.shift();
      A[n] || (A[n] = {}), A = A[n];
    }
  }
  Ua.exports = gn.default;
});
var Ta = _((In, Oa) => {
  "use strict";
  In.__esModule = true;
  In.default = lc;
  function lc(A) {
    for (var e = "", t = A.indexOf("/*"), r = 0; t >= 0; ) {
      e = e + A.slice(r, t);
      var n = A.indexOf("*/", t + 2);
      if (n < 0)
        return e;
      r = n + 2, t = A.indexOf("/*", r);
    }
    return e = e + A.slice(r), e;
  }
  Oa.exports = In.default;
});
var Xt = _((xe) => {
  "use strict";
  xe.__esModule = true;
  xe.stripComments = xe.ensureObject = xe.getProp = xe.unesc = void 0;
  var cc = un(hi());
  xe.unesc = cc.default;
  var Bc = un(Ga());
  xe.getProp = Bc.default;
  var Ec = un(Ha());
  xe.ensureObject = Ec.default;
  var fc = un(Ta());
  xe.stripComments = fc.default;
  function un(A) {
    return A && A.__esModule ? A : { default: A };
  }
});
var Te = _((Vt, Ja) => {
  "use strict";
  Vt.__esModule = true;
  Vt.default = void 0;
  var Pa = Xt();
  function _a2(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function Qc(A, e, t) {
    return e && _a2(A.prototype, e), t && _a2(A, t), A;
  }
  var Cc = function A(e, t) {
    if (typeof e != "object" || e === null)
      return e;
    var r = new e.constructor();
    for (var n in e)
      if (e.hasOwnProperty(n)) {
        var i = e[n], o = typeof i;
        n === "parent" && o === "object" ? t && (r[n] = t) : i instanceof Array ? r[n] = i.map(function(s) {
          return A(s, r);
        }) : r[n] = A(i, r);
      }
    return r;
  }, dc = function() {
    function A(t) {
      t === void 0 && (t = {}), Object.assign(this, t), this.spaces = this.spaces || {}, this.spaces.before = this.spaces.before || "", this.spaces.after = this.spaces.after || "";
    }
    var e = A.prototype;
    return e.remove = function() {
      return this.parent && this.parent.removeChild(this), this.parent = void 0, this;
    }, e.replaceWith = function() {
      if (this.parent) {
        for (var r in arguments)
          this.parent.insertBefore(this, arguments[r]);
        this.remove();
      }
      return this;
    }, e.next = function() {
      return this.parent.at(this.parent.index(this) + 1);
    }, e.prev = function() {
      return this.parent.at(this.parent.index(this) - 1);
    }, e.clone = function(r) {
      r === void 0 && (r = {});
      var n = Cc(this);
      for (var i in r)
        n[i] = r[i];
      return n;
    }, e.appendToPropertyAndEscape = function(r, n, i) {
      this.raws || (this.raws = {});
      var o = this[r], s = this.raws[r];
      this[r] = o + n, s || i !== n ? this.raws[r] = (s || o) + i : delete this.raws[r];
    }, e.setPropertyAndEscape = function(r, n, i) {
      this.raws || (this.raws = {}), this[r] = n, this.raws[r] = i;
    }, e.setPropertyWithoutEscape = function(r, n) {
      this[r] = n, this.raws && delete this.raws[r];
    }, e.isAtPosition = function(r, n) {
      if (this.source && this.source.start && this.source.end)
        return !(this.source.start.line > r || this.source.end.line < r || this.source.start.line === r && this.source.start.column > n || this.source.end.line === r && this.source.end.column < n);
    }, e.stringifyProperty = function(r) {
      return this.raws && this.raws[r] || this[r];
    }, e.valueToString = function() {
      return String(this.stringifyProperty("value"));
    }, e.toString = function() {
      return [this.rawSpaceBefore, this.valueToString(), this.rawSpaceAfter].join("");
    }, Qc(A, [{ key: "rawSpaceBefore", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.before;
      return r === void 0 && (r = this.spaces && this.spaces.before), r || "";
    }, set: function(r) {
      (0, Pa.ensureObject)(this, "raws", "spaces"), this.raws.spaces.before = r;
    } }, { key: "rawSpaceAfter", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.after;
      return r === void 0 && (r = this.spaces.after), r || "";
    }, set: function(r) {
      (0, Pa.ensureObject)(this, "raws", "spaces"), this.raws.spaces.after = r;
    } }]), A;
  }();
  Vt.default = dc;
  Ja.exports = Vt.default;
});
var UA = _((BA) => {
  "use strict";
  BA.__esModule = true;
  BA.UNIVERSAL = BA.ATTRIBUTE = BA.CLASS = BA.COMBINATOR = BA.COMMENT = BA.ID = BA.NESTING = BA.PSEUDO = BA.ROOT = BA.SELECTOR = BA.STRING = BA.TAG = void 0;
  var hc = "tag";
  BA.TAG = hc;
  var pc = "string";
  BA.STRING = pc;
  var mc = "selector";
  BA.SELECTOR = mc;
  var yc = "root";
  BA.ROOT = yc;
  var wc = "pseudo";
  BA.PSEUDO = wc;
  var Dc = "nesting";
  BA.NESTING = Dc;
  var Sc = "id";
  BA.ID = Sc;
  var bc = "comment";
  BA.COMMENT = bc;
  var kc = "combinator";
  BA.COMBINATOR = kc;
  var xc = "class";
  BA.CLASS = xc;
  var Rc = "attribute";
  BA.ATTRIBUTE = Rc;
  var vc = "universal";
  BA.UNIVERSAL = vc;
});
var ln = _((zt, qa) => {
  "use strict";
  zt.__esModule = true;
  zt.default = void 0;
  var Nc = Mc(Te()), Pe = Fc(UA());
  function Ya() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return Ya = function() {
      return A;
    }, A;
  }
  function Fc(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = Ya();
    if (e && e.has(A))
      return e.get(A);
    var t = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var n in A)
      if (Object.prototype.hasOwnProperty.call(A, n)) {
        var i = r ? Object.getOwnPropertyDescriptor(A, n) : null;
        i && (i.get || i.set) ? Object.defineProperty(t, n, i) : t[n] = A[n];
      }
    return t.default = A, e && e.set(A, t), t;
  }
  function Mc(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Lc(A, e) {
    var t;
    if (typeof Symbol > "u" || A[Symbol.iterator] == null) {
      if (Array.isArray(A) || (t = Gc(A)) || e && A && typeof A.length == "number") {
        t && (A = t);
        var r = 0;
        return function() {
          return r >= A.length ? { done: true } : { done: false, value: A[r++] };
        };
      }
      throw new TypeError(`Invalid attempt to iterate non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
    }
    return t = A[Symbol.iterator](), t.next.bind(t);
  }
  function Gc(A, e) {
    if (A) {
      if (typeof A == "string")
        return Ka(A, e);
      var t = Object.prototype.toString.call(A).slice(8, -1);
      if (t === "Object" && A.constructor && (t = A.constructor.name), t === "Map" || t === "Set")
        return Array.from(A);
      if (t === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))
        return Ka(A, e);
    }
  }
  function Ka(A, e) {
    (e == null || e > A.length) && (e = A.length);
    for (var t = 0, r = new Array(e); t < e; t++)
      r[t] = A[t];
    return r;
  }
  function Wa(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function Uc(A, e, t) {
    return e && Wa(A.prototype, e), t && Wa(A, t), A;
  }
  function Hc(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, pi(A, e);
  }
  function pi(A, e) {
    return pi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, pi(A, e);
  }
  var Oc = function(A) {
    Hc(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.nodes || (n.nodes = []), n;
    }
    var t = e.prototype;
    return t.append = function(n) {
      return n.parent = this, this.nodes.push(n), this;
    }, t.prepend = function(n) {
      return n.parent = this, this.nodes.unshift(n), this;
    }, t.at = function(n) {
      return this.nodes[n];
    }, t.index = function(n) {
      return typeof n == "number" ? n : this.nodes.indexOf(n);
    }, t.removeChild = function(n) {
      n = this.index(n), this.at(n).parent = void 0, this.nodes.splice(n, 1);
      var i;
      for (var o in this.indexes)
        i = this.indexes[o], i >= n && (this.indexes[o] = i - 1);
      return this;
    }, t.removeAll = function() {
      for (var n = Lc(this.nodes), i; !(i = n()).done; ) {
        var o = i.value;
        o.parent = void 0;
      }
      return this.nodes = [], this;
    }, t.empty = function() {
      return this.removeAll();
    }, t.insertAfter = function(n, i) {
      i.parent = this;
      var o = this.index(n);
      this.nodes.splice(o + 1, 0, i), i.parent = this;
      var s;
      for (var a in this.indexes)
        s = this.indexes[a], o <= s && (this.indexes[a] = s + 1);
      return this;
    }, t.insertBefore = function(n, i) {
      i.parent = this;
      var o = this.index(n);
      this.nodes.splice(o, 0, i), i.parent = this;
      var s;
      for (var a in this.indexes)
        s = this.indexes[a], s <= o && (this.indexes[a] = s + 1);
      return this;
    }, t._findChildAtPosition = function(n, i) {
      var o = void 0;
      return this.each(function(s) {
        if (s.atPosition) {
          var a = s.atPosition(n, i);
          if (a)
            return o = a, false;
        } else if (s.isAtPosition(n, i))
          return o = s, false;
      }), o;
    }, t.atPosition = function(n, i) {
      if (this.isAtPosition(n, i))
        return this._findChildAtPosition(n, i) || this;
    }, t._inferEndPosition = function() {
      this.last && this.last.source && this.last.source.end && (this.source = this.source || {}, this.source.end = this.source.end || {}, Object.assign(this.source.end, this.last.source.end));
    }, t.each = function(n) {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach++;
      var i = this.lastEach;
      if (this.indexes[i] = 0, !!this.length) {
        for (var o, s; this.indexes[i] < this.length && (o = this.indexes[i], s = n(this.at(o), o), s !== false); )
          this.indexes[i] += 1;
        if (delete this.indexes[i], s === false)
          return false;
      }
    }, t.walk = function(n) {
      return this.each(function(i, o) {
        var s = n(i, o);
        if (s !== false && i.length && (s = i.walk(n)), s === false)
          return false;
      });
    }, t.walkAttributes = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.ATTRIBUTE)
          return n.call(i, o);
      });
    }, t.walkClasses = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.CLASS)
          return n.call(i, o);
      });
    }, t.walkCombinators = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.COMBINATOR)
          return n.call(i, o);
      });
    }, t.walkComments = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.COMMENT)
          return n.call(i, o);
      });
    }, t.walkIds = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.ID)
          return n.call(i, o);
      });
    }, t.walkNesting = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.NESTING)
          return n.call(i, o);
      });
    }, t.walkPseudos = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.PSEUDO)
          return n.call(i, o);
      });
    }, t.walkTags = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.TAG)
          return n.call(i, o);
      });
    }, t.walkUniversals = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === Pe.UNIVERSAL)
          return n.call(i, o);
      });
    }, t.split = function(n) {
      var i = this, o = [];
      return this.reduce(function(s, a, I) {
        var g2 = n.call(i, a);
        return o.push(a), g2 ? (s.push(o), o = []) : I === i.length - 1 && s.push(o), s;
      }, []);
    }, t.map = function(n) {
      return this.nodes.map(n);
    }, t.reduce = function(n, i) {
      return this.nodes.reduce(n, i);
    }, t.every = function(n) {
      return this.nodes.every(n);
    }, t.some = function(n) {
      return this.nodes.some(n);
    }, t.filter = function(n) {
      return this.nodes.filter(n);
    }, t.sort = function(n) {
      return this.nodes.sort(n);
    }, t.toString = function() {
      return this.map(String).join("");
    }, Uc(e, [{ key: "first", get: function() {
      return this.at(0);
    } }, { key: "last", get: function() {
      return this.at(this.length - 1);
    } }, { key: "length", get: function() {
      return this.nodes.length;
    } }]), e;
  }(Nc.default);
  zt.default = Oc;
  qa.exports = zt.default;
});
var yi = _((Zt, Va) => {
  "use strict";
  Zt.__esModule = true;
  Zt.default = void 0;
  var Tc = _c(ln()), Pc = UA();
  function _c(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Xa(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function Jc(A, e, t) {
    return e && Xa(A.prototype, e), t && Xa(A, t), A;
  }
  function Kc(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, mi(A, e);
  }
  function mi(A, e) {
    return mi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, mi(A, e);
  }
  var Wc = function(A) {
    Kc(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = Pc.ROOT, n;
    }
    var t = e.prototype;
    return t.toString = function() {
      var n = this.reduce(function(i, o) {
        return i.push(String(o)), i;
      }, []).join(",");
      return this.trailingComma ? n + "," : n;
    }, t.error = function(n, i) {
      return this._error ? this._error(n, i) : new Error(n);
    }, Jc(e, [{ key: "errorGenerator", set: function(n) {
      this._error = n;
    } }]), e;
  }(Tc.default);
  Zt.default = Wc;
  Va.exports = Zt.default;
});
var Di = _((jt, za) => {
  "use strict";
  jt.__esModule = true;
  jt.default = void 0;
  var Yc = Xc(ln()), qc = UA();
  function Xc(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Vc(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, wi(A, e);
  }
  function wi(A, e) {
    return wi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, wi(A, e);
  }
  var zc = function(A) {
    Vc(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = qc.SELECTOR, r;
    }
    return e;
  }(Yc.default);
  jt.default = zc;
  za.exports = jt.default;
});
var cn = _((a0, Za) => {
  "use strict";
  var Zc = {}, jc = Zc.hasOwnProperty, $c = function(e, t) {
    if (!e)
      return t;
    var r = {};
    for (var n in t)
      r[n] = jc.call(e, n) ? e[n] : t[n];
    return r;
  }, AB = /[ -,\.\/:-@\[-\^`\{-~]/, eB = /[ -,\.\/:-@\[\]\^`\{-~]/, tB = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g, Si = function A(e, t) {
    t = $c(t, A.options), t.quotes != "single" && t.quotes != "double" && (t.quotes = "single");
    for (var r = t.quotes == "double" ? '"' : "'", n = t.isIdentifier, i = e.charAt(0), o = "", s = 0, a = e.length; s < a; ) {
      var I = e.charAt(s++), g2 = I.charCodeAt(), c2 = void 0;
      if (g2 < 32 || g2 > 126) {
        if (g2 >= 55296 && g2 <= 56319 && s < a) {
          var B = e.charCodeAt(s++);
          (B & 64512) == 56320 ? g2 = ((g2 & 1023) << 10) + (B & 1023) + 65536 : s--;
        }
        c2 = "\\" + g2.toString(16).toUpperCase() + " ";
      } else
        t.escapeEverything ? AB.test(I) ? c2 = "\\" + I : c2 = "\\" + g2.toString(16).toUpperCase() + " " : /[\t\n\f\r\x0B]/.test(I) ? c2 = "\\" + g2.toString(16).toUpperCase() + " " : I == "\\" || !n && (I == '"' && r == I || I == "'" && r == I) || n && eB.test(I) ? c2 = "\\" + I : c2 = I;
      o += c2;
    }
    return n && (/^-[-\d]/.test(o) ? o = "\\-" + o.slice(1) : /\d/.test(i) && (o = "\\3" + i + " " + o.slice(1))), o = o.replace(tB, function(E, Q, d2) {
      return Q && Q.length % 2 ? E : (Q || "") + d2;
    }), !n && t.wrap ? r + o + r : o;
  };
  Si.options = { escapeEverything: false, isIdentifier: false, quotes: "single", wrap: false };
  Si.version = "3.0.0";
  Za.exports = Si;
});
var ki = _(($t, Ag) => {
  "use strict";
  $t.__esModule = true;
  $t.default = void 0;
  var rB = $a(cn()), nB = Xt(), iB = $a(Te()), oB = UA();
  function $a(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function ja(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function sB(A, e, t) {
    return e && ja(A.prototype, e), t && ja(A, t), A;
  }
  function aB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, bi(A, e);
  }
  function bi(A, e) {
    return bi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, bi(A, e);
  }
  var gB = function(A) {
    aB(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = oB.CLASS, n._constructed = true, n;
    }
    var t = e.prototype;
    return t.valueToString = function() {
      return "." + A.prototype.valueToString.call(this);
    }, sB(e, [{ key: "value", get: function() {
      return this._value;
    }, set: function(n) {
      if (this._constructed) {
        var i = (0, rB.default)(n, { isIdentifier: true });
        i !== n ? ((0, nB.ensureObject)(this, "raws"), this.raws.value = i) : this.raws && delete this.raws.value;
      }
      this._value = n;
    } }]), e;
  }(iB.default);
  $t.default = gB;
  Ag.exports = $t.default;
});
var Ri = _((Ar, eg) => {
  "use strict";
  Ar.__esModule = true;
  Ar.default = void 0;
  var IB = lB(Te()), uB = UA();
  function lB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function cB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, xi(A, e);
  }
  function xi(A, e) {
    return xi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, xi(A, e);
  }
  var BB = function(A) {
    cB(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = uB.COMMENT, r;
    }
    return e;
  }(IB.default);
  Ar.default = BB;
  eg.exports = Ar.default;
});
var Ni = _((er, tg) => {
  "use strict";
  er.__esModule = true;
  er.default = void 0;
  var EB = QB(Te()), fB = UA();
  function QB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function CB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, vi(A, e);
  }
  function vi(A, e) {
    return vi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, vi(A, e);
  }
  var dB = function(A) {
    CB(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = fB.ID, n;
    }
    var t = e.prototype;
    return t.valueToString = function() {
      return "#" + A.prototype.valueToString.call(this);
    }, e;
  }(EB.default);
  er.default = dB;
  tg.exports = er.default;
});
var Bn = _((tr, ig) => {
  "use strict";
  tr.__esModule = true;
  tr.default = void 0;
  var hB = ng(cn()), pB = Xt(), mB = ng(Te());
  function ng(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function rg(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function yB(A, e, t) {
    return e && rg(A.prototype, e), t && rg(A, t), A;
  }
  function wB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Fi(A, e);
  }
  function Fi(A, e) {
    return Fi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Fi(A, e);
  }
  var DB = function(A) {
    wB(e, A);
    function e() {
      return A.apply(this, arguments) || this;
    }
    var t = e.prototype;
    return t.qualifiedName = function(n) {
      return this.namespace ? this.namespaceString + "|" + n : n;
    }, t.valueToString = function() {
      return this.qualifiedName(A.prototype.valueToString.call(this));
    }, yB(e, [{ key: "namespace", get: function() {
      return this._namespace;
    }, set: function(n) {
      if (n === true || n === "*" || n === "&") {
        this._namespace = n, this.raws && delete this.raws.namespace;
        return;
      }
      var i = (0, hB.default)(n, { isIdentifier: true });
      this._namespace = n, i !== n ? ((0, pB.ensureObject)(this, "raws"), this.raws.namespace = i) : this.raws && delete this.raws.namespace;
    } }, { key: "ns", get: function() {
      return this._namespace;
    }, set: function(n) {
      this.namespace = n;
    } }, { key: "namespaceString", get: function() {
      if (this.namespace) {
        var n = this.stringifyProperty("namespace");
        return n === true ? "" : n;
      } else
        return "";
    } }]), e;
  }(mB.default);
  tr.default = DB;
  ig.exports = tr.default;
});
var Li = _((rr, og) => {
  "use strict";
  rr.__esModule = true;
  rr.default = void 0;
  var SB = kB(Bn()), bB = UA();
  function kB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function xB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Mi(A, e);
  }
  function Mi(A, e) {
    return Mi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Mi(A, e);
  }
  var RB = function(A) {
    xB(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = bB.TAG, r;
    }
    return e;
  }(SB.default);
  rr.default = RB;
  og.exports = rr.default;
});
var Ui = _((nr, sg) => {
  "use strict";
  nr.__esModule = true;
  nr.default = void 0;
  var vB = FB(Te()), NB = UA();
  function FB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function MB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Gi(A, e);
  }
  function Gi(A, e) {
    return Gi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Gi(A, e);
  }
  var LB = function(A) {
    MB(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = NB.STRING, r;
    }
    return e;
  }(vB.default);
  nr.default = LB;
  sg.exports = nr.default;
});
var Oi = _((ir, ag) => {
  "use strict";
  ir.__esModule = true;
  ir.default = void 0;
  var GB = HB(ln()), UB = UA();
  function HB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function OB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Hi(A, e);
  }
  function Hi(A, e) {
    return Hi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Hi(A, e);
  }
  var TB = function(A) {
    OB(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = UB.PSEUDO, n;
    }
    var t = e.prototype;
    return t.toString = function() {
      var n = this.length ? "(" + this.map(String).join(",") + ")" : "";
      return [this.rawSpaceBefore, this.stringifyProperty("value"), n, this.rawSpaceAfter].join("");
    }, e;
  }(GB.default);
  ir.default = TB;
  ag.exports = ir.default;
});
var Ig = _((g0, gg) => {
  gg.exports = function(e, t) {
    return function(...r) {
      return console.warn(t), e(...r);
    };
  };
});
var Wi = _((ar) => {
  "use strict";
  ar.__esModule = true;
  ar.unescapeValue = Ki;
  ar.default = void 0;
  var or = Ji(cn()), PB = Ji(hi()), _B = Ji(Bn()), JB = UA(), Ti;
  function Ji(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function ug(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function KB(A, e, t) {
    return e && ug(A.prototype, e), t && ug(A, t), A;
  }
  function WB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, _i(A, e);
  }
  function _i(A, e) {
    return _i = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, _i(A, e);
  }
  var sr = Ig(), YB = /^('|")([^]*)\1$/, qB = sr(function() {
  }, "Assigning an attribute a value containing characters that might need to be escaped is deprecated. Call attribute.setValue() instead."), XB = sr(function() {
  }, "Assigning attr.quoted is deprecated and has no effect. Assign to attr.quoteMark instead."), VB = sr(function() {
  }, "Constructing an Attribute selector with a value without specifying quoteMark is deprecated. Note: The value should be unescaped now.");
  function Ki(A) {
    var e = false, t = null, r = A, n = r.match(YB);
    return n && (t = n[1], r = n[2]), r = (0, PB.default)(r), r !== A && (e = true), { deprecatedUsage: e, unescaped: r, quoteMark: t };
  }
  function zB(A) {
    if (A.quoteMark !== void 0 || A.value === void 0)
      return A;
    VB();
    var e = Ki(A.value), t = e.quoteMark, r = e.unescaped;
    return A.raws || (A.raws = {}), A.raws.value === void 0 && (A.raws.value = A.value), A.value = r, A.quoteMark = t, A;
  }
  var En = function(A) {
    WB(e, A);
    function e(r) {
      var n;
      return r === void 0 && (r = {}), n = A.call(this, zB(r)) || this, n.type = JB.ATTRIBUTE, n.raws = n.raws || {}, Object.defineProperty(n.raws, "unquoted", { get: sr(function() {
        return n.value;
      }, "attr.raws.unquoted is deprecated. Call attr.value instead."), set: sr(function() {
        return n.value;
      }, "Setting attr.raws.unquoted is deprecated and has no effect. attr.value is unescaped by default now.") }), n._constructed = true, n;
    }
    var t = e.prototype;
    return t.getQuotedValue = function(n) {
      n === void 0 && (n = {});
      var i = this._determineQuoteMark(n), o = Pi[i], s = (0, or.default)(this._value, o);
      return s;
    }, t._determineQuoteMark = function(n) {
      return n.smart ? this.smartQuoteMark(n) : this.preferredQuoteMark(n);
    }, t.setValue = function(n, i) {
      i === void 0 && (i = {}), this._value = n, this._quoteMark = this._determineQuoteMark(i), this._syncRawValue();
    }, t.smartQuoteMark = function(n) {
      var i = this.value, o = i.replace(/[^']/g, "").length, s = i.replace(/[^"]/g, "").length;
      if (o + s === 0) {
        var a = (0, or.default)(i, { isIdentifier: true });
        if (a === i)
          return e.NO_QUOTE;
        var I = this.preferredQuoteMark(n);
        if (I === e.NO_QUOTE) {
          var g2 = this.quoteMark || n.quoteMark || e.DOUBLE_QUOTE, c2 = Pi[g2], B = (0, or.default)(i, c2);
          if (B.length < a.length)
            return g2;
        }
        return I;
      } else
        return s === o ? this.preferredQuoteMark(n) : s < o ? e.DOUBLE_QUOTE : e.SINGLE_QUOTE;
    }, t.preferredQuoteMark = function(n) {
      var i = n.preferCurrentQuoteMark ? this.quoteMark : n.quoteMark;
      return i === void 0 && (i = n.preferCurrentQuoteMark ? n.quoteMark : this.quoteMark), i === void 0 && (i = e.DOUBLE_QUOTE), i;
    }, t._syncRawValue = function() {
      var n = (0, or.default)(this._value, Pi[this.quoteMark]);
      n === this._value ? this.raws && delete this.raws.value : this.raws.value = n;
    }, t._handleEscapes = function(n, i) {
      if (this._constructed) {
        var o = (0, or.default)(i, { isIdentifier: true });
        o !== i ? this.raws[n] = o : delete this.raws[n];
      }
    }, t._spacesFor = function(n) {
      var i = { before: "", after: "" }, o = this.spaces[n] || {}, s = this.raws.spaces && this.raws.spaces[n] || {};
      return Object.assign(i, o, s);
    }, t._stringFor = function(n, i, o) {
      i === void 0 && (i = n), o === void 0 && (o = lg);
      var s = this._spacesFor(i);
      return o(this.stringifyProperty(n), s);
    }, t.offsetOf = function(n) {
      var i = 1, o = this._spacesFor("attribute");
      if (i += o.before.length, n === "namespace" || n === "ns")
        return this.namespace ? i : -1;
      if (n === "attributeNS" || (i += this.namespaceString.length, this.namespace && (i += 1), n === "attribute"))
        return i;
      i += this.stringifyProperty("attribute").length, i += o.after.length;
      var s = this._spacesFor("operator");
      i += s.before.length;
      var a = this.stringifyProperty("operator");
      if (n === "operator")
        return a ? i : -1;
      i += a.length, i += s.after.length;
      var I = this._spacesFor("value");
      i += I.before.length;
      var g2 = this.stringifyProperty("value");
      if (n === "value")
        return g2 ? i : -1;
      i += g2.length, i += I.after.length;
      var c2 = this._spacesFor("insensitive");
      return i += c2.before.length, n === "insensitive" && this.insensitive ? i : -1;
    }, t.toString = function() {
      var n = this, i = [this.rawSpaceBefore, "["];
      return i.push(this._stringFor("qualifiedAttribute", "attribute")), this.operator && (this.value || this.value === "") && (i.push(this._stringFor("operator")), i.push(this._stringFor("value")), i.push(this._stringFor("insensitiveFlag", "insensitive", function(o, s) {
        return o.length > 0 && !n.quoted && s.before.length === 0 && !(n.spaces.value && n.spaces.value.after) && (s.before = " "), lg(o, s);
      }))), i.push("]"), i.push(this.rawSpaceAfter), i.join("");
    }, KB(e, [{ key: "quoted", get: function() {
      var n = this.quoteMark;
      return n === "'" || n === '"';
    }, set: function(n) {
      XB();
    } }, { key: "quoteMark", get: function() {
      return this._quoteMark;
    }, set: function(n) {
      if (!this._constructed) {
        this._quoteMark = n;
        return;
      }
      this._quoteMark !== n && (this._quoteMark = n, this._syncRawValue());
    } }, { key: "qualifiedAttribute", get: function() {
      return this.qualifiedName(this.raws.attribute || this.attribute);
    } }, { key: "insensitiveFlag", get: function() {
      return this.insensitive ? "i" : "";
    } }, { key: "value", get: function() {
      return this._value;
    }, set: function(n) {
      if (this._constructed) {
        var i = Ki(n), o = i.deprecatedUsage, s = i.unescaped, a = i.quoteMark;
        if (o && qB(), s === this._value && a === this._quoteMark)
          return;
        this._value = s, this._quoteMark = a, this._syncRawValue();
      } else
        this._value = n;
    } }, { key: "attribute", get: function() {
      return this._attribute;
    }, set: function(n) {
      this._handleEscapes("attribute", n), this._attribute = n;
    } }]), e;
  }(_B.default);
  ar.default = En;
  En.NO_QUOTE = null;
  En.SINGLE_QUOTE = "'";
  En.DOUBLE_QUOTE = '"';
  var Pi = (Ti = { "'": { quotes: "single", wrap: true }, '"': { quotes: "double", wrap: true } }, Ti[null] = { isIdentifier: true }, Ti);
  function lg(A, e) {
    return "" + e.before + A + e.after;
  }
});
var qi = _((gr, cg) => {
  "use strict";
  gr.__esModule = true;
  gr.default = void 0;
  var ZB = $B(Bn()), jB = UA();
  function $B(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function AE(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Yi(A, e);
  }
  function Yi(A, e) {
    return Yi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Yi(A, e);
  }
  var eE = function(A) {
    AE(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = jB.UNIVERSAL, r.value = "*", r;
    }
    return e;
  }(ZB.default);
  gr.default = eE;
  cg.exports = gr.default;
});
var Vi = _((Ir, Bg) => {
  "use strict";
  Ir.__esModule = true;
  Ir.default = void 0;
  var tE = nE(Te()), rE = UA();
  function nE(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function iE(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Xi(A, e);
  }
  function Xi(A, e) {
    return Xi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Xi(A, e);
  }
  var oE = function(A) {
    iE(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = rE.COMBINATOR, r;
    }
    return e;
  }(tE.default);
  Ir.default = oE;
  Bg.exports = Ir.default;
});
var Zi = _((ur, Eg) => {
  "use strict";
  ur.__esModule = true;
  ur.default = void 0;
  var sE = gE(Te()), aE = UA();
  function gE(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function IE(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, zi(A, e);
  }
  function zi(A, e) {
    return zi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, zi(A, e);
  }
  var uE = function(A) {
    IE(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = aE.NESTING, r.value = "&", r;
    }
    return e;
  }(sE.default);
  ur.default = uE;
  Eg.exports = ur.default;
});
var Qg = _((fn, fg) => {
  "use strict";
  fn.__esModule = true;
  fn.default = lE;
  function lE(A) {
    return A.sort(function(e, t) {
      return e - t;
    });
  }
  fg.exports = fn.default;
});
var ji = _((T) => {
  "use strict";
  T.__esModule = true;
  T.combinator = T.word = T.comment = T.str = T.tab = T.newline = T.feed = T.cr = T.backslash = T.bang = T.slash = T.doubleQuote = T.singleQuote = T.space = T.greaterThan = T.pipe = T.equals = T.plus = T.caret = T.tilde = T.dollar = T.closeSquare = T.openSquare = T.closeParenthesis = T.openParenthesis = T.semicolon = T.colon = T.comma = T.at = T.asterisk = T.ampersand = void 0;
  var cE = 38;
  T.ampersand = cE;
  var BE = 42;
  T.asterisk = BE;
  var EE = 64;
  T.at = EE;
  var fE = 44;
  T.comma = fE;
  var QE = 58;
  T.colon = QE;
  var CE = 59;
  T.semicolon = CE;
  var dE = 40;
  T.openParenthesis = dE;
  var hE = 41;
  T.closeParenthesis = hE;
  var pE = 91;
  T.openSquare = pE;
  var mE = 93;
  T.closeSquare = mE;
  var yE = 36;
  T.dollar = yE;
  var wE = 126;
  T.tilde = wE;
  var DE = 94;
  T.caret = DE;
  var SE = 43;
  T.plus = SE;
  var bE = 61;
  T.equals = bE;
  var kE = 124;
  T.pipe = kE;
  var xE = 62;
  T.greaterThan = xE;
  var RE = 32;
  T.space = RE;
  var Cg = 39;
  T.singleQuote = Cg;
  var vE = 34;
  T.doubleQuote = vE;
  var NE = 47;
  T.slash = NE;
  var FE = 33;
  T.bang = FE;
  var ME = 92;
  T.backslash = ME;
  var LE = 13;
  T.cr = LE;
  var GE = 12;
  T.feed = GE;
  var UE = 10;
  T.newline = UE;
  var HE = 9;
  T.tab = HE;
  var OE = Cg;
  T.str = OE;
  var TE = -1;
  T.comment = TE;
  var PE = -2;
  T.word = PE;
  var _E = -3;
  T.combinator = _E;
});
var pg = _((lr) => {
  "use strict";
  lr.__esModule = true;
  lr.default = VE;
  lr.FIELDS = void 0;
  var G = JE(ji()), mt, cA;
  function hg() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return hg = function() {
      return A;
    }, A;
  }
  function JE(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = hg();
    if (e && e.has(A))
      return e.get(A);
    var t = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var n in A)
      if (Object.prototype.hasOwnProperty.call(A, n)) {
        var i = r ? Object.getOwnPropertyDescriptor(A, n) : null;
        i && (i.get || i.set) ? Object.defineProperty(t, n, i) : t[n] = A[n];
      }
    return t.default = A, e && e.set(A, t), t;
  }
  var KE = (mt = {}, mt[G.tab] = true, mt[G.newline] = true, mt[G.cr] = true, mt[G.feed] = true, mt), WE = (cA = {}, cA[G.space] = true, cA[G.tab] = true, cA[G.newline] = true, cA[G.cr] = true, cA[G.feed] = true, cA[G.ampersand] = true, cA[G.asterisk] = true, cA[G.bang] = true, cA[G.comma] = true, cA[G.colon] = true, cA[G.semicolon] = true, cA[G.openParenthesis] = true, cA[G.closeParenthesis] = true, cA[G.openSquare] = true, cA[G.closeSquare] = true, cA[G.singleQuote] = true, cA[G.doubleQuote] = true, cA[G.plus] = true, cA[G.pipe] = true, cA[G.tilde] = true, cA[G.greaterThan] = true, cA[G.equals] = true, cA[G.dollar] = true, cA[G.caret] = true, cA[G.slash] = true, cA), $i = {}, dg = "0123456789abcdefABCDEF";
  for (Qn = 0; Qn < dg.length; Qn++)
    $i[dg.charCodeAt(Qn)] = true;
  var Qn;
  function YE(A, e) {
    var t = e, r;
    do {
      if (r = A.charCodeAt(t), WE[r])
        return t - 1;
      r === G.backslash ? t = qE(A, t) + 1 : t++;
    } while (t < A.length);
    return t - 1;
  }
  function qE(A, e) {
    var t = e, r = A.charCodeAt(t + 1);
    if (!KE[r])
      if ($i[r]) {
        var n = 0;
        do
          t++, n++, r = A.charCodeAt(t + 1);
        while ($i[r] && n < 6);
        n < 6 && r === G.space && t++;
      } else
        t++;
    return t;
  }
  var XE = { TYPE: 0, START_LINE: 1, START_COL: 2, END_LINE: 3, END_COL: 4, START_POS: 5, END_POS: 6 };
  lr.FIELDS = XE;
  function VE(A) {
    var e = [], t = A.css.valueOf(), r = t, n = r.length, i = -1, o = 1, s = 0, a = 0, I, g2, c2, B, E, Q, d2, m2, D, x2, y, p, b;
    function R2(U, P2) {
      if (A.safe)
        t += P2, D = t.length - 1;
      else
        throw A.error("Unclosed " + U, o, s - i, s);
    }
    for (; s < n; ) {
      switch (I = t.charCodeAt(s), I === G.newline && (i = s, o += 1), I) {
        case G.space:
        case G.tab:
        case G.newline:
        case G.cr:
        case G.feed:
          D = s;
          do
            D += 1, I = t.charCodeAt(D), I === G.newline && (i = D, o += 1);
          while (I === G.space || I === G.newline || I === G.tab || I === G.cr || I === G.feed);
          b = G.space, B = o, c2 = D - i - 1, a = D;
          break;
        case G.plus:
        case G.greaterThan:
        case G.tilde:
        case G.pipe:
          D = s;
          do
            D += 1, I = t.charCodeAt(D);
          while (I === G.plus || I === G.greaterThan || I === G.tilde || I === G.pipe);
          b = G.combinator, B = o, c2 = s - i, a = D;
          break;
        case G.asterisk:
        case G.ampersand:
        case G.bang:
        case G.comma:
        case G.equals:
        case G.dollar:
        case G.caret:
        case G.openSquare:
        case G.closeSquare:
        case G.colon:
        case G.semicolon:
        case G.openParenthesis:
        case G.closeParenthesis:
          D = s, b = I, B = o, c2 = s - i, a = D + 1;
          break;
        case G.singleQuote:
        case G.doubleQuote:
          p = I === G.singleQuote ? "'" : '"', D = s;
          do
            for (E = false, D = t.indexOf(p, D + 1), D === -1 && R2("quote", p), Q = D; t.charCodeAt(Q - 1) === G.backslash; )
              Q -= 1, E = !E;
          while (E);
          b = G.str, B = o, c2 = s - i, a = D + 1;
          break;
        default:
          I === G.slash && t.charCodeAt(s + 1) === G.asterisk ? (D = t.indexOf("*/", s + 2) + 1, D === 0 && R2("comment", "*/"), g2 = t.slice(s, D + 1), m2 = g2.split(`
`), d2 = m2.length - 1, d2 > 0 ? (x2 = o + d2, y = D - m2[d2].length) : (x2 = o, y = i), b = G.comment, o = x2, B = x2, c2 = D - y) : I === G.slash ? (D = s, b = I, B = o, c2 = s - i, a = D + 1) : (D = YE(t, s), b = G.word, B = o, c2 = D - i), a = D + 1;
          break;
      }
      e.push([b, o, s - i, B, c2, s, a]), y && (i = y, y = null), s = a;
    }
    return e;
  }
});
var xg = _((cr, kg) => {
  "use strict";
  cr.__esModule = true;
  cr.default = void 0;
  var zE = ge(yi()), Ao = ge(Di()), ZE = ge(ki()), mg = ge(Ri()), jE = ge(Ni()), $E = ge(Li()), eo = ge(Ui()), Af = ge(Oi()), yg = Cn(Wi()), ef = ge(qi()), to = ge(Vi()), tf = ge(Zi()), rf = ge(Qg()), N = Cn(pg()), O = Cn(ji()), nf = Cn(UA()), hA = Xt(), it, ro;
  function bg() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return bg = function() {
      return A;
    }, A;
  }
  function Cn(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = bg();
    if (e && e.has(A))
      return e.get(A);
    var t = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var n in A)
      if (Object.prototype.hasOwnProperty.call(A, n)) {
        var i = r ? Object.getOwnPropertyDescriptor(A, n) : null;
        i && (i.get || i.set) ? Object.defineProperty(t, n, i) : t[n] = A[n];
      }
    return t.default = A, e && e.set(A, t), t;
  }
  function ge(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function wg(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function of(A, e, t) {
    return e && wg(A.prototype, e), t && wg(A, t), A;
  }
  var oo = (it = {}, it[O.space] = true, it[O.cr] = true, it[O.feed] = true, it[O.newline] = true, it[O.tab] = true, it), sf = Object.assign({}, oo, (ro = {}, ro[O.comment] = true, ro));
  function Dg(A) {
    return { line: A[N.FIELDS.START_LINE], column: A[N.FIELDS.START_COL] };
  }
  function Sg(A) {
    return { line: A[N.FIELDS.END_LINE], column: A[N.FIELDS.END_COL] };
  }
  function ot(A, e, t, r) {
    return { start: { line: A, column: e }, end: { line: t, column: r } };
  }
  function yt(A) {
    return ot(A[N.FIELDS.START_LINE], A[N.FIELDS.START_COL], A[N.FIELDS.END_LINE], A[N.FIELDS.END_COL]);
  }
  function no(A, e) {
    if (A)
      return ot(A[N.FIELDS.START_LINE], A[N.FIELDS.START_COL], e[N.FIELDS.END_LINE], e[N.FIELDS.END_COL]);
  }
  function wt(A, e) {
    var t = A[e];
    if (typeof t == "string")
      return t.indexOf("\\") !== -1 && ((0, hA.ensureObject)(A, "raws"), A[e] = (0, hA.unesc)(t), A.raws[e] === void 0 && (A.raws[e] = t)), A;
  }
  function io(A, e) {
    for (var t = -1, r = []; (t = A.indexOf(e, t + 1)) !== -1; )
      r.push(t);
    return r;
  }
  function af() {
    var A = Array.prototype.concat.apply([], arguments);
    return A.filter(function(e, t) {
      return t === A.indexOf(e);
    });
  }
  var gf = function() {
    function A(t, r) {
      r === void 0 && (r = {}), this.rule = t, this.options = Object.assign({ lossy: false, safe: false }, r), this.position = 0, this.css = typeof this.rule == "string" ? this.rule : this.rule.selector, this.tokens = (0, N.default)({ css: this.css, error: this._errorGenerator(), safe: this.options.safe });
      var n = no(this.tokens[0], this.tokens[this.tokens.length - 1]);
      this.root = new zE.default({ source: n }), this.root.errorGenerator = this._errorGenerator();
      var i = new Ao.default({ source: { start: { line: 1, column: 1 } } });
      this.root.append(i), this.current = i, this.loop();
    }
    var e = A.prototype;
    return e._errorGenerator = function() {
      var r = this;
      return function(n, i) {
        return typeof r.rule == "string" ? new Error(n) : r.rule.error(n, i);
      };
    }, e.attribute = function() {
      var r = [], n = this.currToken;
      for (this.position++; this.position < this.tokens.length && this.currToken[N.FIELDS.TYPE] !== O.closeSquare; )
        r.push(this.currToken), this.position++;
      if (this.currToken[N.FIELDS.TYPE] !== O.closeSquare)
        return this.expected("closing square bracket", this.currToken[N.FIELDS.START_POS]);
      var i = r.length, o = { source: ot(n[1], n[2], this.currToken[3], this.currToken[4]), sourceIndex: n[N.FIELDS.START_POS] };
      if (i === 1 && !~[O.word].indexOf(r[0][N.FIELDS.TYPE]))
        return this.expected("attribute", r[0][N.FIELDS.START_POS]);
      for (var s = 0, a = "", I = "", g2 = null, c2 = false; s < i; ) {
        var B = r[s], E = this.content(B), Q = r[s + 1];
        switch (B[N.FIELDS.TYPE]) {
          case O.space:
            if (c2 = true, this.options.lossy)
              break;
            if (g2) {
              (0, hA.ensureObject)(o, "spaces", g2);
              var d2 = o.spaces[g2].after || "";
              o.spaces[g2].after = d2 + E;
              var m2 = (0, hA.getProp)(o, "raws", "spaces", g2, "after") || null;
              m2 && (o.raws.spaces[g2].after = m2 + E);
            } else
              a = a + E, I = I + E;
            break;
          case O.asterisk:
            if (Q[N.FIELDS.TYPE] === O.equals)
              o.operator = E, g2 = "operator";
            else if ((!o.namespace || g2 === "namespace" && !c2) && Q) {
              a && ((0, hA.ensureObject)(o, "spaces", "attribute"), o.spaces.attribute.before = a, a = ""), I && ((0, hA.ensureObject)(o, "raws", "spaces", "attribute"), o.raws.spaces.attribute.before = a, I = ""), o.namespace = (o.namespace || "") + E;
              var D = (0, hA.getProp)(o, "raws", "namespace") || null;
              D && (o.raws.namespace += E), g2 = "namespace";
            }
            c2 = false;
            break;
          case O.dollar:
            if (g2 === "value") {
              var x2 = (0, hA.getProp)(o, "raws", "value");
              o.value += "$", x2 && (o.raws.value = x2 + "$");
              break;
            }
          case O.caret:
            Q[N.FIELDS.TYPE] === O.equals && (o.operator = E, g2 = "operator"), c2 = false;
            break;
          case O.combinator:
            if (E === "~" && Q[N.FIELDS.TYPE] === O.equals && (o.operator = E, g2 = "operator"), E !== "|") {
              c2 = false;
              break;
            }
            Q[N.FIELDS.TYPE] === O.equals ? (o.operator = E, g2 = "operator") : !o.namespace && !o.attribute && (o.namespace = true), c2 = false;
            break;
          case O.word:
            if (Q && this.content(Q) === "|" && r[s + 2] && r[s + 2][N.FIELDS.TYPE] !== O.equals && !o.operator && !o.namespace)
              o.namespace = E, g2 = "namespace";
            else if (!o.attribute || g2 === "attribute" && !c2) {
              a && ((0, hA.ensureObject)(o, "spaces", "attribute"), o.spaces.attribute.before = a, a = ""), I && ((0, hA.ensureObject)(o, "raws", "spaces", "attribute"), o.raws.spaces.attribute.before = I, I = ""), o.attribute = (o.attribute || "") + E;
              var y = (0, hA.getProp)(o, "raws", "attribute") || null;
              y && (o.raws.attribute += E), g2 = "attribute";
            } else if (!o.value && o.value !== "" || g2 === "value" && !c2) {
              var p = (0, hA.unesc)(E), b = (0, hA.getProp)(o, "raws", "value") || "", R2 = o.value || "";
              o.value = R2 + p, o.quoteMark = null, (p !== E || b) && ((0, hA.ensureObject)(o, "raws"), o.raws.value = (b || R2) + E), g2 = "value";
            } else {
              var U = E === "i" || E === "I";
              (o.value || o.value === "") && (o.quoteMark || c2) ? (o.insensitive = U, (!U || E === "I") && ((0, hA.ensureObject)(o, "raws"), o.raws.insensitiveFlag = E), g2 = "insensitive", a && ((0, hA.ensureObject)(o, "spaces", "insensitive"), o.spaces.insensitive.before = a, a = ""), I && ((0, hA.ensureObject)(o, "raws", "spaces", "insensitive"), o.raws.spaces.insensitive.before = I, I = "")) : (o.value || o.value === "") && (g2 = "value", o.value += E, o.raws.value && (o.raws.value += E));
            }
            c2 = false;
            break;
          case O.str:
            if (!o.attribute || !o.operator)
              return this.error("Expected an attribute followed by an operator preceding the string.", { index: B[N.FIELDS.START_POS] });
            var P2 = (0, yg.unescapeValue)(E), q = P2.unescaped, lA = P2.quoteMark;
            o.value = q, o.quoteMark = lA, g2 = "value", (0, hA.ensureObject)(o, "raws"), o.raws.value = E, c2 = false;
            break;
          case O.equals:
            if (!o.attribute)
              return this.expected("attribute", B[N.FIELDS.START_POS], E);
            if (o.value)
              return this.error('Unexpected "=" found; an operator was already defined.', { index: B[N.FIELDS.START_POS] });
            o.operator = o.operator ? o.operator + E : E, g2 = "operator", c2 = false;
            break;
          case O.comment:
            if (g2)
              if (c2 || Q && Q[N.FIELDS.TYPE] === O.space || g2 === "insensitive") {
                var DA = (0, hA.getProp)(o, "spaces", g2, "after") || "", RA = (0, hA.getProp)(o, "raws", "spaces", g2, "after") || DA;
                (0, hA.ensureObject)(o, "raws", "spaces", g2), o.raws.spaces[g2].after = RA + E;
              } else {
                var eA = o[g2] || "", NA = (0, hA.getProp)(o, "raws", g2) || eA;
                (0, hA.ensureObject)(o, "raws"), o.raws[g2] = NA + E;
              }
            else
              I = I + E;
            break;
          default:
            return this.error('Unexpected "' + E + '" found.', { index: B[N.FIELDS.START_POS] });
        }
        s++;
      }
      wt(o, "attribute"), wt(o, "namespace"), this.newNode(new yg.default(o)), this.position++;
    }, e.parseWhitespaceEquivalentTokens = function(r) {
      r < 0 && (r = this.tokens.length);
      var n = this.position, i = [], o = "", s = void 0;
      do
        if (oo[this.currToken[N.FIELDS.TYPE]])
          this.options.lossy || (o += this.content());
        else if (this.currToken[N.FIELDS.TYPE] === O.comment) {
          var a = {};
          o && (a.before = o, o = ""), s = new mg.default({ value: this.content(), source: yt(this.currToken), sourceIndex: this.currToken[N.FIELDS.START_POS], spaces: a }), i.push(s);
        }
      while (++this.position < r);
      if (o) {
        if (s)
          s.spaces.after = o;
        else if (!this.options.lossy) {
          var I = this.tokens[n], g2 = this.tokens[this.position - 1];
          i.push(new eo.default({ value: "", source: ot(I[N.FIELDS.START_LINE], I[N.FIELDS.START_COL], g2[N.FIELDS.END_LINE], g2[N.FIELDS.END_COL]), sourceIndex: I[N.FIELDS.START_POS], spaces: { before: o, after: "" } }));
        }
      }
      return i;
    }, e.convertWhitespaceNodesToSpace = function(r, n) {
      var i = this;
      n === void 0 && (n = false);
      var o = "", s = "";
      r.forEach(function(I) {
        var g2 = i.lossySpace(I.spaces.before, n), c2 = i.lossySpace(I.rawSpaceBefore, n);
        o += g2 + i.lossySpace(I.spaces.after, n && g2.length === 0), s += g2 + I.value + i.lossySpace(I.rawSpaceAfter, n && c2.length === 0);
      }), s === o && (s = void 0);
      var a = { space: o, rawSpace: s };
      return a;
    }, e.isNamedCombinator = function(r) {
      return r === void 0 && (r = this.position), this.tokens[r + 0] && this.tokens[r + 0][N.FIELDS.TYPE] === O.slash && this.tokens[r + 1] && this.tokens[r + 1][N.FIELDS.TYPE] === O.word && this.tokens[r + 2] && this.tokens[r + 2][N.FIELDS.TYPE] === O.slash;
    }, e.namedCombinator = function() {
      if (this.isNamedCombinator()) {
        var r = this.content(this.tokens[this.position + 1]), n = (0, hA.unesc)(r).toLowerCase(), i = {};
        n !== r && (i.value = "/" + r + "/");
        var o = new to.default({ value: "/" + n + "/", source: ot(this.currToken[N.FIELDS.START_LINE], this.currToken[N.FIELDS.START_COL], this.tokens[this.position + 2][N.FIELDS.END_LINE], this.tokens[this.position + 2][N.FIELDS.END_COL]), sourceIndex: this.currToken[N.FIELDS.START_POS], raws: i });
        return this.position = this.position + 3, o;
      } else
        this.unexpected();
    }, e.combinator = function() {
      var r = this;
      if (this.content() === "|")
        return this.namespace();
      var n = this.locateNextMeaningfulToken(this.position);
      if (n < 0 || this.tokens[n][N.FIELDS.TYPE] === O.comma) {
        var i = this.parseWhitespaceEquivalentTokens(n);
        if (i.length > 0) {
          var o = this.current.last;
          if (o) {
            var s = this.convertWhitespaceNodesToSpace(i), a = s.space, I = s.rawSpace;
            I !== void 0 && (o.rawSpaceAfter += I), o.spaces.after += a;
          } else
            i.forEach(function(b) {
              return r.newNode(b);
            });
        }
        return;
      }
      var g2 = this.currToken, c2 = void 0;
      n > this.position && (c2 = this.parseWhitespaceEquivalentTokens(n));
      var B;
      if (this.isNamedCombinator() ? B = this.namedCombinator() : this.currToken[N.FIELDS.TYPE] === O.combinator ? (B = new to.default({ value: this.content(), source: yt(this.currToken), sourceIndex: this.currToken[N.FIELDS.START_POS] }), this.position++) : oo[this.currToken[N.FIELDS.TYPE]] || c2 || this.unexpected(), B) {
        if (c2) {
          var E = this.convertWhitespaceNodesToSpace(c2), Q = E.space, d2 = E.rawSpace;
          B.spaces.before = Q, B.rawSpaceBefore = d2;
        }
      } else {
        var m2 = this.convertWhitespaceNodesToSpace(c2, true), D = m2.space, x2 = m2.rawSpace;
        x2 || (x2 = D);
        var y = {}, p = { spaces: {} };
        D.endsWith(" ") && x2.endsWith(" ") ? (y.before = D.slice(0, D.length - 1), p.spaces.before = x2.slice(0, x2.length - 1)) : D.startsWith(" ") && x2.startsWith(" ") ? (y.after = D.slice(1), p.spaces.after = x2.slice(1)) : p.value = x2, B = new to.default({ value: " ", source: no(g2, this.tokens[this.position - 1]), sourceIndex: g2[N.FIELDS.START_POS], spaces: y, raws: p });
      }
      return this.currToken && this.currToken[N.FIELDS.TYPE] === O.space && (B.spaces.after = this.optionalSpace(this.content()), this.position++), this.newNode(B);
    }, e.comma = function() {
      if (this.position === this.tokens.length - 1) {
        this.root.trailingComma = true, this.position++;
        return;
      }
      this.current._inferEndPosition();
      var r = new Ao.default({ source: { start: Dg(this.tokens[this.position + 1]) } });
      this.current.parent.append(r), this.current = r, this.position++;
    }, e.comment = function() {
      var r = this.currToken;
      this.newNode(new mg.default({ value: this.content(), source: yt(r), sourceIndex: r[N.FIELDS.START_POS] })), this.position++;
    }, e.error = function(r, n) {
      throw this.root.error(r, n);
    }, e.missingBackslash = function() {
      return this.error("Expected a backslash preceding the semicolon.", { index: this.currToken[N.FIELDS.START_POS] });
    }, e.missingParenthesis = function() {
      return this.expected("opening parenthesis", this.currToken[N.FIELDS.START_POS]);
    }, e.missingSquareBracket = function() {
      return this.expected("opening square bracket", this.currToken[N.FIELDS.START_POS]);
    }, e.unexpected = function() {
      return this.error("Unexpected '" + this.content() + "'. Escaping special characters with \\ may help.", this.currToken[N.FIELDS.START_POS]);
    }, e.namespace = function() {
      var r = this.prevToken && this.content(this.prevToken) || true;
      if (this.nextToken[N.FIELDS.TYPE] === O.word)
        return this.position++, this.word(r);
      if (this.nextToken[N.FIELDS.TYPE] === O.asterisk)
        return this.position++, this.universal(r);
    }, e.nesting = function() {
      if (this.nextToken) {
        var r = this.content(this.nextToken);
        if (r === "|") {
          this.position++;
          return;
        }
      }
      var n = this.currToken;
      this.newNode(new tf.default({ value: this.content(), source: yt(n), sourceIndex: n[N.FIELDS.START_POS] })), this.position++;
    }, e.parentheses = function() {
      var r = this.current.last, n = 1;
      if (this.position++, r && r.type === nf.PSEUDO) {
        var i = new Ao.default({ source: { start: Dg(this.tokens[this.position - 1]) } }), o = this.current;
        for (r.append(i), this.current = i; this.position < this.tokens.length && n; )
          this.currToken[N.FIELDS.TYPE] === O.openParenthesis && n++, this.currToken[N.FIELDS.TYPE] === O.closeParenthesis && n--, n ? this.parse() : (this.current.source.end = Sg(this.currToken), this.current.parent.source.end = Sg(this.currToken), this.position++);
        this.current = o;
      } else {
        for (var s = this.currToken, a = "(", I; this.position < this.tokens.length && n; )
          this.currToken[N.FIELDS.TYPE] === O.openParenthesis && n++, this.currToken[N.FIELDS.TYPE] === O.closeParenthesis && n--, I = this.currToken, a += this.parseParenthesisToken(this.currToken), this.position++;
        r ? r.appendToPropertyAndEscape("value", a, a) : this.newNode(new eo.default({ value: a, source: ot(s[N.FIELDS.START_LINE], s[N.FIELDS.START_COL], I[N.FIELDS.END_LINE], I[N.FIELDS.END_COL]), sourceIndex: s[N.FIELDS.START_POS] }));
      }
      if (n)
        return this.expected("closing parenthesis", this.currToken[N.FIELDS.START_POS]);
    }, e.pseudo = function() {
      for (var r = this, n = "", i = this.currToken; this.currToken && this.currToken[N.FIELDS.TYPE] === O.colon; )
        n += this.content(), this.position++;
      if (!this.currToken)
        return this.expected(["pseudo-class", "pseudo-element"], this.position - 1);
      if (this.currToken[N.FIELDS.TYPE] === O.word)
        this.splitWord(false, function(o, s) {
          n += o, r.newNode(new Af.default({ value: n, source: no(i, r.currToken), sourceIndex: i[N.FIELDS.START_POS] })), s > 1 && r.nextToken && r.nextToken[N.FIELDS.TYPE] === O.openParenthesis && r.error("Misplaced parenthesis.", { index: r.nextToken[N.FIELDS.START_POS] });
        });
      else
        return this.expected(["pseudo-class", "pseudo-element"], this.currToken[N.FIELDS.START_POS]);
    }, e.space = function() {
      var r = this.content();
      this.position === 0 || this.prevToken[N.FIELDS.TYPE] === O.comma || this.prevToken[N.FIELDS.TYPE] === O.openParenthesis || this.current.nodes.every(function(n) {
        return n.type === "comment";
      }) ? (this.spaces = this.optionalSpace(r), this.position++) : this.position === this.tokens.length - 1 || this.nextToken[N.FIELDS.TYPE] === O.comma || this.nextToken[N.FIELDS.TYPE] === O.closeParenthesis ? (this.current.last.spaces.after = this.optionalSpace(r), this.position++) : this.combinator();
    }, e.string = function() {
      var r = this.currToken;
      this.newNode(new eo.default({ value: this.content(), source: yt(r), sourceIndex: r[N.FIELDS.START_POS] })), this.position++;
    }, e.universal = function(r) {
      var n = this.nextToken;
      if (n && this.content(n) === "|")
        return this.position++, this.namespace();
      var i = this.currToken;
      this.newNode(new ef.default({ value: this.content(), source: yt(i), sourceIndex: i[N.FIELDS.START_POS] }), r), this.position++;
    }, e.splitWord = function(r, n) {
      for (var i = this, o = this.nextToken, s = this.content(); o && ~[O.dollar, O.caret, O.equals, O.word].indexOf(o[N.FIELDS.TYPE]); ) {
        this.position++;
        var a = this.content();
        if (s += a, a.lastIndexOf("\\") === a.length - 1) {
          var I = this.nextToken;
          I && I[N.FIELDS.TYPE] === O.space && (s += this.requiredSpace(this.content(I)), this.position++);
        }
        o = this.nextToken;
      }
      var g2 = io(s, ".").filter(function(Q) {
        var d2 = s[Q - 1] === "\\", m2 = /^\d+\.\d+%$/.test(s);
        return !d2 && !m2;
      }), c2 = io(s, "#").filter(function(Q) {
        return s[Q - 1] !== "\\";
      }), B = io(s, "#{");
      B.length && (c2 = c2.filter(function(Q) {
        return !~B.indexOf(Q);
      }));
      var E = (0, rf.default)(af([0].concat(g2, c2)));
      E.forEach(function(Q, d2) {
        var m2 = E[d2 + 1] || s.length, D = s.slice(Q, m2);
        if (d2 === 0 && n)
          return n.call(i, D, E.length);
        var x2, y = i.currToken, p = y[N.FIELDS.START_POS] + E[d2], b = ot(y[1], y[2] + Q, y[3], y[2] + (m2 - 1));
        if (~g2.indexOf(Q)) {
          var R2 = { value: D.slice(1), source: b, sourceIndex: p };
          x2 = new ZE.default(wt(R2, "value"));
        } else if (~c2.indexOf(Q)) {
          var U = { value: D.slice(1), source: b, sourceIndex: p };
          x2 = new jE.default(wt(U, "value"));
        } else {
          var P2 = { value: D, source: b, sourceIndex: p };
          wt(P2, "value"), x2 = new $E.default(P2);
        }
        i.newNode(x2, r), r = null;
      }), this.position++;
    }, e.word = function(r) {
      var n = this.nextToken;
      return n && this.content(n) === "|" ? (this.position++, this.namespace()) : this.splitWord(r);
    }, e.loop = function() {
      for (; this.position < this.tokens.length; )
        this.parse(true);
      return this.current._inferEndPosition(), this.root;
    }, e.parse = function(r) {
      switch (this.currToken[N.FIELDS.TYPE]) {
        case O.space:
          this.space();
          break;
        case O.comment:
          this.comment();
          break;
        case O.openParenthesis:
          this.parentheses();
          break;
        case O.closeParenthesis:
          r && this.missingParenthesis();
          break;
        case O.openSquare:
          this.attribute();
          break;
        case O.dollar:
        case O.caret:
        case O.equals:
        case O.word:
          this.word();
          break;
        case O.colon:
          this.pseudo();
          break;
        case O.comma:
          this.comma();
          break;
        case O.asterisk:
          this.universal();
          break;
        case O.ampersand:
          this.nesting();
          break;
        case O.slash:
        case O.combinator:
          this.combinator();
          break;
        case O.str:
          this.string();
          break;
        case O.closeSquare:
          this.missingSquareBracket();
        case O.semicolon:
          this.missingBackslash();
        default:
          this.unexpected();
      }
    }, e.expected = function(r, n, i) {
      if (Array.isArray(r)) {
        var o = r.pop();
        r = r.join(", ") + " or " + o;
      }
      var s = /^[aeiou]/.test(r[0]) ? "an" : "a";
      return i ? this.error("Expected " + s + " " + r + ', found "' + i + '" instead.', { index: n }) : this.error("Expected " + s + " " + r + ".", { index: n });
    }, e.requiredSpace = function(r) {
      return this.options.lossy ? " " : r;
    }, e.optionalSpace = function(r) {
      return this.options.lossy ? "" : r;
    }, e.lossySpace = function(r, n) {
      return this.options.lossy ? n ? " " : "" : r;
    }, e.parseParenthesisToken = function(r) {
      var n = this.content(r);
      return r[N.FIELDS.TYPE] === O.space ? this.requiredSpace(n) : n;
    }, e.newNode = function(r, n) {
      return n && (/^ +$/.test(n) && (this.options.lossy || (this.spaces = (this.spaces || "") + n), n = true), r.namespace = n, wt(r, "namespace")), this.spaces && (r.spaces.before = this.spaces, this.spaces = ""), this.current.append(r);
    }, e.content = function(r) {
      return r === void 0 && (r = this.currToken), this.css.slice(r[N.FIELDS.START_POS], r[N.FIELDS.END_POS]);
    }, e.locateNextMeaningfulToken = function(r) {
      r === void 0 && (r = this.position + 1);
      for (var n = r; n < this.tokens.length; )
        if (sf[this.tokens[n][N.FIELDS.TYPE]]) {
          n++;
          continue;
        } else
          return n;
      return -1;
    }, of(A, [{ key: "currToken", get: function() {
      return this.tokens[this.position];
    } }, { key: "nextToken", get: function() {
      return this.tokens[this.position + 1];
    } }, { key: "prevToken", get: function() {
      return this.tokens[this.position - 1];
    } }]), A;
  }();
  cr.default = gf;
  kg.exports = cr.default;
});
var vg = _((Br, Rg) => {
  "use strict";
  Br.__esModule = true;
  Br.default = void 0;
  var If = uf(xg());
  function uf(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var lf = function() {
    function A(t, r) {
      this.func = t || function() {
      }, this.funcRes = null, this.options = r;
    }
    var e = A.prototype;
    return e._shouldUpdateSelector = function(r, n) {
      n === void 0 && (n = {});
      var i = Object.assign({}, this.options, n);
      return i.updateSelector === false ? false : typeof r != "string";
    }, e._isLossy = function(r) {
      r === void 0 && (r = {});
      var n = Object.assign({}, this.options, r);
      return n.lossless === false;
    }, e._root = function(r, n) {
      n === void 0 && (n = {});
      var i = new If.default(r, this._parseOptions(n));
      return i.root;
    }, e._parseOptions = function(r) {
      return { lossy: this._isLossy(r) };
    }, e._run = function(r, n) {
      var i = this;
      return n === void 0 && (n = {}), new Promise(function(o, s) {
        try {
          var a = i._root(r, n);
          Promise.resolve(i.func(a)).then(function(I) {
            var g2 = void 0;
            return i._shouldUpdateSelector(r, n) && (g2 = a.toString(), r.selector = g2), { transform: I, root: a, string: g2 };
          }).then(o, s);
        } catch (I) {
          s(I);
          return;
        }
      });
    }, e._runSync = function(r, n) {
      n === void 0 && (n = {});
      var i = this._root(r, n), o = this.func(i);
      if (o && typeof o.then == "function")
        throw new Error("Selector processor returned a promise to a synchronous call.");
      var s = void 0;
      return n.updateSelector && typeof r != "string" && (s = i.toString(), r.selector = s), { transform: o, root: i, string: s };
    }, e.ast = function(r, n) {
      return this._run(r, n).then(function(i) {
        return i.root;
      });
    }, e.astSync = function(r, n) {
      return this._runSync(r, n).root;
    }, e.transform = function(r, n) {
      return this._run(r, n).then(function(i) {
        return i.transform;
      });
    }, e.transformSync = function(r, n) {
      return this._runSync(r, n).transform;
    }, e.process = function(r, n) {
      return this._run(r, n).then(function(i) {
        return i.string || i.root.toString();
      });
    }, e.processSync = function(r, n) {
      var i = this._runSync(r, n);
      return i.string || i.root.toString();
    }, A;
  }();
  Br.default = lf;
  Rg.exports = Br.default;
});
var Ng = _((EA) => {
  "use strict";
  EA.__esModule = true;
  EA.universal = EA.tag = EA.string = EA.selector = EA.root = EA.pseudo = EA.nesting = EA.id = EA.comment = EA.combinator = EA.className = EA.attribute = void 0;
  var cf = Ie(Wi()), Bf = Ie(ki()), Ef = Ie(Vi()), ff = Ie(Ri()), Qf = Ie(Ni()), Cf = Ie(Zi()), df = Ie(Oi()), hf = Ie(yi()), pf = Ie(Di()), mf = Ie(Ui()), yf = Ie(Li()), wf = Ie(qi());
  function Ie(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var Df = function(e) {
    return new cf.default(e);
  };
  EA.attribute = Df;
  var Sf = function(e) {
    return new Bf.default(e);
  };
  EA.className = Sf;
  var bf = function(e) {
    return new Ef.default(e);
  };
  EA.combinator = bf;
  var kf = function(e) {
    return new ff.default(e);
  };
  EA.comment = kf;
  var xf = function(e) {
    return new Qf.default(e);
  };
  EA.id = xf;
  var Rf = function(e) {
    return new Cf.default(e);
  };
  EA.nesting = Rf;
  var vf = function(e) {
    return new df.default(e);
  };
  EA.pseudo = vf;
  var Nf = function(e) {
    return new hf.default(e);
  };
  EA.root = Nf;
  var Ff = function(e) {
    return new pf.default(e);
  };
  EA.selector = Ff;
  var Mf = function(e) {
    return new mf.default(e);
  };
  EA.string = Mf;
  var Lf = function(e) {
    return new yf.default(e);
  };
  EA.tag = Lf;
  var Gf = function(e) {
    return new wf.default(e);
  };
  EA.universal = Gf;
});
var Gg = _((sA) => {
  "use strict";
  sA.__esModule = true;
  sA.isNode = so;
  sA.isPseudoElement = Lg;
  sA.isPseudoClass = qf;
  sA.isContainer = Xf;
  sA.isNamespace = Vf;
  sA.isUniversal = sA.isTag = sA.isString = sA.isSelector = sA.isRoot = sA.isPseudo = sA.isNesting = sA.isIdentifier = sA.isComment = sA.isCombinator = sA.isClassName = sA.isAttribute = void 0;
  var pA = UA(), VA, Uf = (VA = {}, VA[pA.ATTRIBUTE] = true, VA[pA.CLASS] = true, VA[pA.COMBINATOR] = true, VA[pA.COMMENT] = true, VA[pA.ID] = true, VA[pA.NESTING] = true, VA[pA.PSEUDO] = true, VA[pA.ROOT] = true, VA[pA.SELECTOR] = true, VA[pA.STRING] = true, VA[pA.TAG] = true, VA[pA.UNIVERSAL] = true, VA);
  function so(A) {
    return typeof A == "object" && Uf[A.type];
  }
  function ue(A, e) {
    return so(e) && e.type === A;
  }
  var Fg = ue.bind(null, pA.ATTRIBUTE);
  sA.isAttribute = Fg;
  var Hf = ue.bind(null, pA.CLASS);
  sA.isClassName = Hf;
  var Of = ue.bind(null, pA.COMBINATOR);
  sA.isCombinator = Of;
  var Tf = ue.bind(null, pA.COMMENT);
  sA.isComment = Tf;
  var Pf = ue.bind(null, pA.ID);
  sA.isIdentifier = Pf;
  var _f = ue.bind(null, pA.NESTING);
  sA.isNesting = _f;
  var ao = ue.bind(null, pA.PSEUDO);
  sA.isPseudo = ao;
  var Jf = ue.bind(null, pA.ROOT);
  sA.isRoot = Jf;
  var Kf = ue.bind(null, pA.SELECTOR);
  sA.isSelector = Kf;
  var Wf = ue.bind(null, pA.STRING);
  sA.isString = Wf;
  var Mg = ue.bind(null, pA.TAG);
  sA.isTag = Mg;
  var Yf = ue.bind(null, pA.UNIVERSAL);
  sA.isUniversal = Yf;
  function Lg(A) {
    return ao(A) && A.value && (A.value.startsWith("::") || A.value.toLowerCase() === ":before" || A.value.toLowerCase() === ":after" || A.value.toLowerCase() === ":first-letter" || A.value.toLowerCase() === ":first-line");
  }
  function qf(A) {
    return ao(A) && !Lg(A);
  }
  function Xf(A) {
    return !!(so(A) && A.walk);
  }
  function Vf(A) {
    return Fg(A) || Mg(A);
  }
});
var Ug = _((me) => {
  "use strict";
  me.__esModule = true;
  var go = UA();
  Object.keys(go).forEach(function(A) {
    A === "default" || A === "__esModule" || A in me && me[A] === go[A] || (me[A] = go[A]);
  });
  var Io = Ng();
  Object.keys(Io).forEach(function(A) {
    A === "default" || A === "__esModule" || A in me && me[A] === Io[A] || (me[A] = Io[A]);
  });
  var uo = Gg();
  Object.keys(uo).forEach(function(A) {
    A === "default" || A === "__esModule" || A in me && me[A] === uo[A] || (me[A] = uo[A]);
  });
});
var Tg = _((Er, Og) => {
  "use strict";
  Er.__esModule = true;
  Er.default = void 0;
  var zf = $f(vg()), Zf = jf(Ug());
  function Hg() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return Hg = function() {
      return A;
    }, A;
  }
  function jf(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = Hg();
    if (e && e.has(A))
      return e.get(A);
    var t = {}, r = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var n in A)
      if (Object.prototype.hasOwnProperty.call(A, n)) {
        var i = r ? Object.getOwnPropertyDescriptor(A, n) : null;
        i && (i.get || i.set) ? Object.defineProperty(t, n, i) : t[n] = A[n];
      }
    return t.default = A, e && e.set(A, t), t;
  }
  function $f(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var lo = function(e) {
    return new zf.default(e);
  };
  Object.assign(lo, Zf);
  delete lo.__esModule;
  var AQ = lo;
  Er.default = AQ;
  Og.exports = Er.default;
});
var Pg = _((co) => {
  "use strict";
  Object.defineProperty(co, "__esModule", { value: true });
  Object.defineProperty(co, "default", { enumerable: true, get: () => eQ });
  function eQ(A) {
    return A.replace(/\\,/g, "\\2c ");
  }
});
var Jg = _((Q0, _g) => {
  "use strict";
  _g.exports = { aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255], aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220], bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205], blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42], burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0], chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237], cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11], darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169], darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139], darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209], darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255], dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255], firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34], fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255], gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128], green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128], honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92], indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140], lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0], lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128], lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211], lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250], lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222], lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50], linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0], mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211], mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238], mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133], midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225], moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128], oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35], orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214], palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238], palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185], peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221], powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153], red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225], saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96], seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45], silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205], slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250], springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140], teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71], turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179], white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0], yellowgreen: [154, 205, 50] };
});
var Eo = _((Bo) => {
  "use strict";
  Object.defineProperty(Bo, "__esModule", { value: true });
  function tQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  tQ(Bo, { parseColor: () => aQ, formatColor: () => gQ });
  var Kg = rQ(Jg());
  function rQ(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var nQ = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i, iQ = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i, Ve = /(?:\d+|\d*\.\d+)%?/, dn = /(?:\s*,\s*|\s+)/, Wg = /\s*[,/]\s*/, ze = /var\(--(?:[^ )]*?)\)/, oQ = new RegExp(`^(rgb)a?\\(\\s*(${Ve.source}|${ze.source})(?:${dn.source}(${Ve.source}|${ze.source}))?(?:${dn.source}(${Ve.source}|${ze.source}))?(?:${Wg.source}(${Ve.source}|${ze.source}))?\\s*\\)$`), sQ = new RegExp(`^(hsl)a?\\(\\s*((?:${Ve.source})(?:deg|rad|grad|turn)?|${ze.source})(?:${dn.source}(${Ve.source}|${ze.source}))?(?:${dn.source}(${Ve.source}|${ze.source}))?(?:${Wg.source}(${Ve.source}|${ze.source}))?\\s*\\)$`);
  function aQ(A, { loose: e = false } = {}) {
    var t, r;
    if (typeof A != "string")
      return null;
    if (A = A.trim(), A === "transparent")
      return { mode: "rgb", color: ["0", "0", "0"], alpha: "0" };
    if (A in Kg.default)
      return { mode: "rgb", color: Kg.default[A].map((a) => a.toString()) };
    let n = A.replace(iQ, (a, I, g2, c2, B) => ["#", I, I, g2, g2, c2, c2, B ? B + B : ""].join("")).match(nQ);
    if (n !== null)
      return { mode: "rgb", color: [parseInt(n[1], 16), parseInt(n[2], 16), parseInt(n[3], 16)].map((a) => a.toString()), alpha: n[4] ? (parseInt(n[4], 16) / 255).toString() : void 0 };
    var i;
    let o = (i = A.match(oQ)) !== null && i !== void 0 ? i : A.match(sQ);
    if (o === null)
      return null;
    let s = [o[2], o[3], o[4]].filter(Boolean).map((a) => a.toString());
    return !e && s.length !== 3 || s.length < 3 && !s.some((a) => /^var\(.*?\)$/.test(a)) ? null : { mode: o[1], color: s, alpha: (t = o[5]) === null || t === void 0 || (r = t.toString) === null || r === void 0 ? void 0 : r.call(t) };
  }
  function gQ({ mode: A, color: e, alpha: t }) {
    let r = t !== void 0;
    return `${A}(${e.join(" ")}${r ? ` / ${t}` : ""})`;
  }
});
var Qo = _((fo) => {
  "use strict";
  Object.defineProperty(fo, "__esModule", { value: true });
  function IQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  IQ(fo, { withAlphaValue: () => uQ, default: () => lQ });
  var hn = Eo();
  function uQ(A, e, t) {
    if (typeof A == "function")
      return A({ opacityValue: e });
    let r = (0, hn.parseColor)(A, { loose: true });
    return r === null ? t : (0, hn.formatColor)({ ...r, alpha: e });
  }
  function lQ({ color: A, property: e, variable: t }) {
    let r = [].concat(e);
    if (typeof A == "function")
      return { [t]: "1", ...Object.fromEntries(r.map((i) => [i, A({ opacityVariable: t, opacityValue: `var(${t})` })])) };
    let n = (0, hn.parseColor)(A);
    return n === null ? Object.fromEntries(r.map((i) => [i, A])) : n.alpha !== void 0 ? Object.fromEntries(r.map((i) => [i, A])) : { [t]: "1", ...Object.fromEntries(r.map((i) => [i, (0, hn.formatColor)({ ...n, alpha: `var(${t})` })])) };
  }
});
var zg = _((Co) => {
  "use strict";
  Object.defineProperty(Co, "__esModule", { value: true });
  function cQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  cQ(Co, { pattern: () => EQ2, withoutCapturing: () => qg, any: () => Xg, optional: () => fQ, zeroOrMore: () => QQ, nestedBrackets: () => Vg, escape: () => st });
  var Yg = /[\\^$.*+?()[\]{}|]/g, BQ = RegExp(Yg.source);
  function fr(A) {
    return A = Array.isArray(A) ? A : [A], A = A.map((e) => e instanceof RegExp ? e.source : e), A.join("");
  }
  function EQ2(A) {
    return new RegExp(fr(A), "g");
  }
  function qg(A) {
    return new RegExp(`(?:${fr(A)})`, "g");
  }
  function Xg(A) {
    return `(?:${A.map(fr).join("|")})`;
  }
  function fQ(A) {
    return `(?:${fr(A)})?`;
  }
  function QQ(A) {
    return `(?:${fr(A)})*`;
  }
  function Vg(A, e, t = 1) {
    return qg([st(A), /[^\s]*/, t === 1 ? `[^${st(A)}${st(e)}s]*` : Xg([`[^${st(A)}${st(e)}s]*`, Vg(A, e, t - 1)]), /[^\s]*/, st(e)]);
  }
  function st(A) {
    return A && BQ.test(A) ? A.replace(Yg, "\\$&") : A || "";
  }
});
var jg = _((ho) => {
  "use strict";
  Object.defineProperty(ho, "__esModule", { value: true });
  Object.defineProperty(ho, "splitAtTopLevelOnly", { enumerable: true, get: () => hQ });
  var CQ = dQ(zg());
  function Zg(A) {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap(), t = /* @__PURE__ */ new WeakMap();
    return (Zg = function(r) {
      return r ? t : e;
    })(A);
  }
  function dQ(A, e) {
    if (!e && A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var t = Zg(e);
    if (t && t.has(A))
      return t.get(A);
    var r = {}, n = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var i in A)
      if (i !== "default" && Object.prototype.hasOwnProperty.call(A, i)) {
        var o = n ? Object.getOwnPropertyDescriptor(A, i) : null;
        o && (o.get || o.set) ? Object.defineProperty(r, i, o) : r[i] = A[i];
      }
    return r.default = A, t && t.set(A, r), r;
  }
  function* hQ(A, e) {
    let t = new RegExp(`[(){}\\[\\]${CQ.escape(e)}]`, "g"), r = 0, n = 0, i = false, o = 0, s = 0, a = e.length;
    for (let I of A.matchAll(t)) {
      let g2 = I[0] === e[o], c2 = o === a - 1, B = g2 && c2;
      I[0] === "(" && r++, I[0] === ")" && r--, I[0] === "[" && r++, I[0] === "]" && r--, I[0] === "{" && r++, I[0] === "}" && r--, g2 && r === 0 && (s === 0 && (s = I.index), o++), B && r === 0 && (i = true, yield A.substring(n, s), n = s + a), o === a && (o = 0, s = 0);
    }
    i ? yield A.substring(n) : yield A;
  }
});
var AI = _((po) => {
  "use strict";
  Object.defineProperty(po, "__esModule", { value: true });
  function pQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  pQ(po, { parseBoxShadowValue: () => DQ, formatBoxShadowValue: () => SQ });
  var mQ = jg(), yQ = /* @__PURE__ */ new Set(["inset", "inherit", "initial", "revert", "unset"]), wQ = /\ +(?![^(]*\))/g, $g = /^-?(\d+|\.\d+)(.*?)$/g;
  function DQ(A) {
    return Array.from((0, mQ.splitAtTopLevelOnly)(A, ",")).map((t) => {
      let r = t.trim(), n = { raw: r }, i = r.split(wQ), o = /* @__PURE__ */ new Set();
      for (let s of i)
        $g.lastIndex = 0, !o.has("KEYWORD") && yQ.has(s) ? (n.keyword = s, o.add("KEYWORD")) : $g.test(s) ? o.has("X") ? o.has("Y") ? o.has("BLUR") ? o.has("SPREAD") || (n.spread = s, o.add("SPREAD")) : (n.blur = s, o.add("BLUR")) : (n.y = s, o.add("Y")) : (n.x = s, o.add("X")) : n.color ? (n.unknown || (n.unknown = []), n.unknown.push(s)) : n.color = s;
      return n.valid = n.x !== void 0 && n.y !== void 0, n;
    });
  }
  function SQ(A) {
    return A.map((e) => e.valid ? [e.keyword, e.x, e.y, e.blur, e.spread, e.color].filter(Boolean).join(" ") : e.raw).join(", ");
  }
});
var sI = _((yo) => {
  "use strict";
  Object.defineProperty(yo, "__esModule", { value: true });
  function bQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  bQ(yo, { normalize: () => Ze, url: () => rI, number: () => RQ, percentage: () => nI, length: () => iI, lineWidth: () => FQ, shadow: () => MQ, color: () => LQ, image: () => GQ, gradient: () => oI, position: () => OQ, familyName: () => TQ, genericName: () => _Q, absoluteSize: () => KQ, relativeSize: () => YQ });
  var kQ = Eo(), xQ = AI(), mo = ["min", "max", "clamp", "calc"], tI = /,(?![^(]*\))/g, pn = /_(?![^(]*\))/g;
  function Ze(A, e = true) {
    return A.includes("url(") ? A.split(/(url\(.*?\))/g).filter(Boolean).map((t) => /^url\(.*?\)$/.test(t) ? t : Ze(t, false)).join("") : (A = A.replace(/([^\\])_+/g, (t, r) => r + " ".repeat(t.length - 1)).replace(/^_/g, " ").replace(/\\_/g, "_"), e && (A = A.trim()), A = A.replace(/(calc|min|max|clamp)\(.+\)/g, (t) => t.replace(/(-?\d*\.?\d(?!\b-.+[,)](?![^+\-/*])\D)(?:%|[a-z]+)?|\))([+\-/*])/g, "$1 $2 ")), A);
  }
  function rI(A) {
    return A.startsWith("url(");
  }
  function RQ(A) {
    return !isNaN(Number(A)) || mo.some((e) => new RegExp(`^${e}\\(.+?`).test(A));
  }
  function nI(A) {
    return A.split(pn).every((e) => /%$/g.test(e) || mo.some((t) => new RegExp(`^${t}\\(.+?%`).test(e)));
  }
  var vQ = ["cm", "mm", "Q", "in", "pc", "pt", "px", "em", "ex", "ch", "rem", "lh", "vw", "vh", "vmin", "vmax"], eI = `(?:${vQ.join("|")})`;
  function iI(A) {
    return A.split(pn).every((e) => e === "0" || new RegExp(`${eI}$`).test(e) || mo.some((t) => new RegExp(`^${t}\\(.+?${eI}`).test(e)));
  }
  var NQ = /* @__PURE__ */ new Set(["thin", "medium", "thick"]);
  function FQ(A) {
    return NQ.has(A);
  }
  function MQ(A) {
    let e = (0, xQ.parseBoxShadowValue)(Ze(A));
    for (let t of e)
      if (!t.valid)
        return false;
    return true;
  }
  function LQ(A) {
    let e = 0;
    return A.split(pn).every((r) => (r = Ze(r), r.startsWith("var(") ? true : (0, kQ.parseColor)(r, { loose: true }) !== null ? (e++, true) : false)) ? e > 0 : false;
  }
  function GQ(A) {
    let e = 0;
    return A.split(tI).every((r) => (r = Ze(r), r.startsWith("var(") ? true : rI(r) || oI(r) || ["element(", "image(", "cross-fade(", "image-set("].some((n) => r.startsWith(n)) ? (e++, true) : false)) ? e > 0 : false;
  }
  var UQ = /* @__PURE__ */ new Set(["linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "conic-gradient"]);
  function oI(A) {
    A = Ze(A);
    for (let e of UQ)
      if (A.startsWith(`${e}(`))
        return true;
    return false;
  }
  var HQ = /* @__PURE__ */ new Set(["center", "top", "right", "bottom", "left"]);
  function OQ(A) {
    let e = 0;
    return A.split(pn).every((r) => (r = Ze(r), r.startsWith("var(") ? true : HQ.has(r) || iI(r) || nI(r) ? (e++, true) : false)) ? e > 0 : false;
  }
  function TQ(A) {
    let e = 0;
    return A.split(tI).every((r) => (r = Ze(r), r.startsWith("var(") ? true : r.includes(" ") && !/(['"])([^"']+)\1/g.test(r) || /^\d/g.test(r) ? false : (e++, true))) ? e > 0 : false;
  }
  var PQ = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
  function _Q(A) {
    return PQ.has(A);
  }
  var JQ = /* @__PURE__ */ new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "x-large", "xxx-large"]);
  function KQ(A) {
    return JQ.has(A);
  }
  var WQ = /* @__PURE__ */ new Set(["larger", "smaller"]);
  function YQ(A) {
    return WQ.has(A);
  }
});
var EI = _((So) => {
  "use strict";
  Object.defineProperty(So, "__esModule", { value: true });
  function qQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  qQ(So, { updateAllClasses: () => zQ, asValue: () => Cr, parseColorFormat: () => wo, asColor: () => lI, asLookupValue: () => cI, coerceValue: () => AC });
  var XQ = Do(Tg()), VQ = Do(Pg()), aI = Qo(), zA = sI(), gI = Do(gi());
  function Do(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function zQ(A, e) {
    return (0, XQ.default)((n) => {
      n.walkClasses((i) => {
        let o = e(i.value);
        i.value = o, i.raws && i.raws.value && (i.raws.value = (0, VQ.default)(i.raws.value));
      });
    }).processSync(A);
  }
  function uI(A, e) {
    if (!Qr(A))
      return;
    let t = A.slice(1, -1);
    if (e(t))
      return (0, zA.normalize)(t);
  }
  function ZQ(A, e = {}, t) {
    let r = e[A];
    if (r !== void 0)
      return (0, gI.default)(r);
    if (Qr(A)) {
      let n = uI(A, t);
      return n === void 0 ? void 0 : (0, gI.default)(n);
    }
  }
  function Cr(A, e = {}, { validate: t = () => true } = {}) {
    var r;
    let n = (r = e.values) === null || r === void 0 ? void 0 : r[A];
    return n !== void 0 ? n : e.supportsNegativeValues && A.startsWith("-") ? ZQ(A.slice(1), e.values, t) : uI(A, t);
  }
  function Qr(A) {
    return A.startsWith("[") && A.endsWith("]");
  }
  function jQ(A) {
    let e = A.lastIndexOf("/");
    return e === -1 || e === A.length - 1 ? [A] : [A.slice(0, e), A.slice(e + 1)];
  }
  function wo(A) {
    if (typeof A == "string" && A.includes("<alpha-value>")) {
      let e = A;
      return ({ opacityValue: t = 1 }) => e.replace("<alpha-value>", t);
    }
    return A;
  }
  function lI(A, e = {}, { tailwindConfig: t = {} } = {}) {
    var r;
    if (((r = e.values) === null || r === void 0 ? void 0 : r[A]) !== void 0) {
      var n;
      return wo((n = e.values) === null || n === void 0 ? void 0 : n[A]);
    }
    let [i, o] = jQ(A);
    if (o !== void 0) {
      var s, a, I, g2;
      let c2 = (g2 = (s = e.values) === null || s === void 0 ? void 0 : s[i]) !== null && g2 !== void 0 ? g2 : Qr(i) ? i.slice(1, -1) : void 0;
      return c2 === void 0 ? void 0 : (c2 = wo(c2), Qr(o) ? (0, aI.withAlphaValue)(c2, o.slice(1, -1)) : ((a = t.theme) === null || a === void 0 || (I = a.opacity) === null || I === void 0 ? void 0 : I[o]) === void 0 ? void 0 : (0, aI.withAlphaValue)(c2, t.theme.opacity[o]));
    }
    return Cr(A, e, { validate: zA.color });
  }
  function cI(A, e = {}) {
    var t;
    return (t = e.values) === null || t === void 0 ? void 0 : t[A];
  }
  function le(A) {
    return (e, t) => Cr(e, t, { validate: A });
  }
  var BI = { any: Cr, color: lI, url: le(zA.url), image: le(zA.image), length: le(zA.length), percentage: le(zA.percentage), position: le(zA.position), lookup: cI, "generic-name": le(zA.genericName), "family-name": le(zA.familyName), number: le(zA.number), "line-width": le(zA.lineWidth), "absolute-size": le(zA.absoluteSize), "relative-size": le(zA.relativeSize), shadow: le(zA.shadow) }, II = Object.keys(BI);
  function $Q(A, e) {
    let t = A.indexOf(e);
    return t === -1 ? [void 0, A] : [A.slice(0, t), A.slice(t + 1)];
  }
  function AC(A, e, t, r) {
    if (Qr(e)) {
      let n = e.slice(1, -1), [i, o] = $Q(n, ":");
      if (!/^[\w-_]+$/g.test(i))
        o = n;
      else if (i !== void 0 && !II.includes(i))
        return [];
      if (o.length > 0 && II.includes(i))
        return [Cr(`[${o}]`, t), i];
    }
    for (let n of [].concat(A)) {
      let i = BI[n](e, t, { tailwindConfig: r });
      if (i !== void 0)
        return [i, n];
    }
    return [];
  }
});
var fI = _((bo) => {
  "use strict";
  Object.defineProperty(bo, "__esModule", { value: true });
  Object.defineProperty(bo, "default", { enumerable: true, get: () => eC });
  function eC(A) {
    return typeof A == "function" ? A({}) : A;
  }
});
var pI = _((xo) => {
  "use strict";
  Object.defineProperty(xo, "__esModule", { value: true });
  Object.defineProperty(xo, "default", { enumerable: true, get: () => pC });
  var tC = at(gi()), rC = at(wa()), nC = at(Da()), iC = at(li()), oC = at(ba()), dI = ka(), QI = xa(), sC = va(), aC = at(Na()), gC = Fa(), IC = EI(), uC = Qo(), lC = at(fI());
  function at(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Dt(A) {
    return typeof A == "function";
  }
  function dr(A) {
    return typeof A == "object" && A !== null;
  }
  function hr(A, ...e) {
    let t = e.pop();
    for (let r of e)
      for (let n in r) {
        let i = t(A[n], r[n]);
        i === void 0 ? dr(A[n]) && dr(r[n]) ? A[n] = hr(A[n], r[n], t) : A[n] = r[n] : A[n] = i;
      }
    return A;
  }
  var ko = { colors: oC.default, negative(A) {
    return Object.keys(A).filter((e) => A[e] !== "0").reduce((e, t) => {
      let r = (0, tC.default)(A[t]);
      return r !== void 0 && (e[`-${t}`] = r), e;
    }, {});
  }, breakpoints(A) {
    return Object.keys(A).filter((e) => typeof A[e] == "string").reduce((e, t) => ({ ...e, [`screen-${t}`]: A[t] }), {});
  } };
  function cC(A, ...e) {
    return Dt(A) ? A(...e) : A;
  }
  function BC(A) {
    return A.reduce((e, { extend: t }) => hr(e, t, (r, n) => r === void 0 ? [n] : Array.isArray(r) ? [n, ...r] : [n, r]), {});
  }
  function EC(A) {
    return { ...A.reduce((e, t) => (0, dI.defaults)(e, t), {}), extend: BC(A) };
  }
  function CI(A, e) {
    if (Array.isArray(A) && dr(A[0]))
      return A.concat(e);
    if (Array.isArray(e) && dr(e[0]) && dr(A))
      return [A, ...e];
    if (Array.isArray(e))
      return e;
  }
  function fC({ extend: A, ...e }) {
    return hr(e, A, (t, r) => !Dt(t) && !r.some(Dt) ? hr({}, t, ...r, CI) : (n, i) => hr({}, ...[t, ...r].map((o) => cC(o, n, i)), CI));
  }
  function* QC(A) {
    let e = (0, QI.toPath)(A);
    if (e.length === 0 || (yield e, Array.isArray(A)))
      return;
    let t = /^(.*?)\s*\/\s*([^/]+)$/, r = A.match(t);
    if (r !== null) {
      let [, n, i] = r, o = (0, QI.toPath)(n);
      o.alpha = i, yield o;
    }
  }
  function CC(A) {
    let e = (t, r) => {
      for (let n of QC(t)) {
        let i = 0, o = A;
        for (; o != null && i < n.length; )
          o = o[n[i++]], o = Dt(o) && (n.alpha === void 0 || i <= n.length - 1) ? o(e, ko) : o;
        if (o !== void 0) {
          if (n.alpha !== void 0) {
            let s = (0, IC.parseColorFormat)(o);
            return (0, uC.withAlphaValue)(s, n.alpha, (0, lC.default)(s));
          }
          return (0, aC.default)(o) ? (0, gC.cloneDeep)(o) : o;
        }
      }
      return r;
    };
    return Object.assign(e, { theme: e, ...ko }), Object.keys(A).reduce((t, r) => (t[r] = Dt(A[r]) ? A[r](e, ko) : A[r], t), {});
  }
  function hI(A) {
    let e = [];
    return A.forEach((t) => {
      e = [...e, t];
      var r;
      let n = (r = t == null ? void 0 : t.plugins) !== null && r !== void 0 ? r : [];
      n.length !== 0 && n.forEach((i) => {
        i.__isOptionsFunction && (i = i());
        var o;
        e = [...e, ...hI([(o = i == null ? void 0 : i.config) !== null && o !== void 0 ? o : {}])];
      });
    }), e;
  }
  function dC(A) {
    return [...A].reduceRight((t, r) => Dt(r) ? r({ corePlugins: t }) : (0, nC.default)(r, t), rC.default);
  }
  function hC(A) {
    return [...A].reduceRight((t, r) => [...t, ...r], []);
  }
  function pC(A) {
    let e = [...hI(A), { prefix: "", important: false, separator: ":", variantOrder: iC.default.variantOrder }];
    var t, r;
    return (0, sC.normalizeConfig)((0, dI.defaults)({ theme: CC(fC(EC(e.map((n) => (t = n == null ? void 0 : n.theme) !== null && t !== void 0 ? t : {})))), corePlugins: dC(e.map((n) => n.corePlugins)), plugins: hC(A.map((n) => (r = n == null ? void 0 : n.plugins) !== null && r !== void 0 ? r : [])) }, ...e));
  }
});
var mI = {};
Lr(mI, { default: () => mC });
var mC;
var yI = tt(() => {
  mC = { yellow: (A) => A };
});
var bI = _((Ro) => {
  "use strict";
  Object.defineProperty(Ro, "__esModule", { value: true });
  function yC(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  yC(Ro, { flagEnabled: () => SC, issueFlagNotices: () => bC, default: () => kC });
  var wC = SI((yI(), Gr(mI))), DC = SI((on(), Gr(nn)));
  function SI(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var wI = { optimizeUniversalDefaults: false }, pr = { future: ["hoverOnlyWhenSupported", "respectDefaultRingColorOpacity"], experimental: ["optimizeUniversalDefaults", "matchVariant"] };
  function SC(A, e) {
    if (pr.future.includes(e)) {
      var t, r, n;
      return A.future === "all" || ((n = (r = A == null || (t = A.future) === null || t === void 0 ? void 0 : t[e]) !== null && r !== void 0 ? r : wI[e]) !== null && n !== void 0 ? n : false);
    }
    if (pr.experimental.includes(e)) {
      var i, o, s;
      return A.experimental === "all" || ((s = (o = A == null || (i = A.experimental) === null || i === void 0 ? void 0 : i[e]) !== null && o !== void 0 ? o : wI[e]) !== null && s !== void 0 ? s : false);
    }
    return false;
  }
  function DI(A) {
    if (A.experimental === "all")
      return pr.experimental;
    var e;
    return Object.keys((e = A == null ? void 0 : A.experimental) !== null && e !== void 0 ? e : {}).filter((t) => pr.experimental.includes(t) && A.experimental[t]);
  }
  function bC(A) {
    if (process.env.JEST_WORKER_ID === void 0 && DI(A).length > 0) {
      let e = DI(A).map((t) => wC.default.yellow(t)).join(", ");
      DC.default.warn("experimental-flags-enabled", [`You have enabled experimental features: ${e}`, "Experimental features in Tailwind CSS are not covered by semver, may introduce breaking changes, and can change at any time."]);
    }
  }
  var kC = pr;
});
var xI = _((vo) => {
  "use strict";
  Object.defineProperty(vo, "__esModule", { value: true });
  Object.defineProperty(vo, "default", { enumerable: true, get: () => kI });
  var xC = vC(li()), RC = bI();
  function vC(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function kI(A) {
    var e;
    let t = ((e = A == null ? void 0 : A.presets) !== null && e !== void 0 ? e : [xC.default]).slice().reverse().flatMap((i) => kI(typeof i == "function" ? i() : i)), r = { respectDefaultRingColorOpacity: { theme: { ringColor: { DEFAULT: "#3b82f67f" } } } }, n = Object.keys(r).filter((i) => (0, RC.flagEnabled)(A, i)).map((i) => r[i]);
    return [A, ...n, ...t];
  }
});
var vI = _((No) => {
  "use strict";
  Object.defineProperty(No, "__esModule", { value: true });
  Object.defineProperty(No, "default", { enumerable: true, get: () => MC });
  var NC = RI(pI()), FC = RI(xI());
  function RI(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function MC(...A) {
    let [, ...e] = (0, FC.default)(A[0]);
    return (0, NC.default)([...A, ...e]);
  }
});
var FI = _((R0, NI) => {
  var Fo = vI();
  NI.exports = (Fo.__esModule ? Fo : { default: Fo }).default;
});
var vt = (A, e) => () => (e || A((e = { exports: {} }).exports, e), e.exports);
var Qu = vt((A, e) => {
  e.exports = ["em", "ex", "ch", "rem", "vh", "vw", "vmin", "vmax", "px", "mm", "cm", "in", "pt", "pc", "mozmm"];
});
var Cu = vt((A, e) => {
  e.exports = ["deg", "grad", "rad", "turn"];
});
var du = vt((A, e) => {
  e.exports = ["dpi", "dpcm", "dppx"];
});
var hu = vt((A, e) => {
  e.exports = ["Hz", "kHz"];
});
var pu = vt((A, e) => {
  e.exports = ["s", "ms"];
});
var mu = Qu();
var is = Cu();
var os = du();
var ss = hu();
var as = pu();
function bn(A) {
  if (/\.\D?$/.test(A))
    throw new Error("The dot should be followed by a number");
  if (/^[+-]{2}/.test(A))
    throw new Error("Only one leading +/- is allowed");
  if (yu(A) > 1)
    throw new Error("Only one dot is allowed");
  if (/%$/.test(A)) {
    this.type = "percentage", this.value = Sn(A), this.unit = "%";
    return;
  }
  var e = Du(A);
  if (!e) {
    this.type = "number", this.value = Sn(A);
    return;
  }
  this.type = bu(e), this.value = Sn(A.substr(0, A.length - e.length)), this.unit = e;
}
bn.prototype.valueOf = function() {
  return this.value;
};
bn.prototype.toString = function() {
  return this.value + (this.unit || "");
};
function he(A) {
  return new bn(A);
}
function yu(A) {
  var e = A.match(/\./g);
  return e ? e.length : 0;
}
function Sn(A) {
  var e = parseFloat(A);
  if (isNaN(e))
    throw new Error("Invalid number: " + A);
  return e;
}
var wu = [].concat(is, ss, mu, os, as);
function Du(A) {
  var e = A.match(/\D+$/), t = e && e[0];
  if (t && wu.indexOf(t) === -1)
    throw new Error("Invalid unit: " + t);
  return t;
}
var Su = Object.assign(Ur(is, "angle"), Ur(ss, "frequency"), Ur(os, "resolution"), Ur(as, "time"));
function Ur(A, e) {
  return Object.fromEntries(A.map((t) => [t, e]));
}
function bu(A) {
  return Su[A] || "length";
}
function Et(A) {
  let e = typeof A;
  return !(e === "number" || e === "bigint" || e === "string" || e === "boolean");
}
function gs(A) {
  return /^class\s/.test(A.toString());
}
function Rn(A) {
  return A && A.$$typeof === Symbol.for("react.forward_ref");
}
function Is(A) {
  return typeof A == "function" || Rn(A);
}
function us(A) {
  return "dangerouslySetInnerHTML" in A;
}
function ls(A) {
  let e = typeof A > "u" ? [] : [].concat(A).flat(1 / 0), t = [];
  for (let r = 0; r < e.length; r++) {
    let n = e[r];
    typeof n > "u" || typeof n == "boolean" || n === null || (typeof n == "number" && (n = String(n)), typeof n == "string" && t.length && typeof t[t.length - 1] == "string" ? t[t.length - 1] += n : t.push(n));
  }
  return t;
}
function X(A, e, t, r, n = false) {
  if (typeof A == "number")
    return A;
  try {
    if (A = A.trim(), /[ /\(,]/.test(A))
      return;
    if (A === String(+A))
      return +A;
    let i = new he(A);
    if (i.type === "length")
      switch (i.unit) {
        case "em":
          return i.value * e;
        case "rem":
          return i.value * 16;
        case "vw":
          return ~~(i.value * r._viewportWidth / 100);
        case "vh":
          return ~~(i.value * r._viewportHeight / 100);
        default:
          return i.value;
      }
    else {
      if (i.type === "angle")
        return vn(A);
      if (i.type === "percentage" && n)
        return i.value / 100 * t;
    }
  } catch {
  }
}
function vn(A) {
  let e = new he(A);
  switch (e.unit) {
    case "deg":
      return e.value;
    case "rad":
      return e.value * 180 / Math.PI;
    case "turn":
      return e.value * 360;
    case "grad":
      return 0.9 * e.value;
  }
}
function Nt(A, e) {
  return [A[0] * e[0] + A[2] * e[1], A[1] * e[0] + A[3] * e[1], A[0] * e[2] + A[2] * e[3], A[1] * e[2] + A[3] * e[3], A[0] * e[4] + A[2] * e[5] + A[4], A[1] * e[4] + A[3] * e[5] + A[5]];
}
function YA(A, e, t, r) {
  let n = e[A];
  if (typeof n > "u") {
    if (r && typeof A < "u")
      throw new Error(`Invalid value for CSS property "${r}". Allowed values: ${Object.keys(e).map((i) => `"${i}"`).join(" | ")}. Received: "${A}".`);
    n = t;
  }
  return n;
}
var kn;
var xn;
var cs = [32, 160, 4961, 65792, 65793, 4153, 4241, 10].map((A) => String.fromCodePoint(A));
var Bt = /* @__PURE__ */ new Map();
var xu = 500;
function WA(A, e, t) {
  let r = `${e}:${t || ""}:${A}`;
  if (Bt.has(r))
    return Bt.get(r);
  if (!kn || !xn) {
    if (!(typeof Intl < "u" && "Segmenter" in Intl))
      throw new Error("Intl.Segmenter does not exist, please use import a polyfill.");
    kn = new Intl.Segmenter(t, { granularity: "word" }), xn = new Intl.Segmenter(t, { granularity: "grapheme" });
  }
  let n;
  if (e === "grapheme")
    n = [...xn.segment(A)].map((i) => i.segment);
  else {
    let i = [...kn.segment(A)].map((a) => a.segment), o = [], s = 0;
    for (; s < i.length; ) {
      let a = i[s];
      if (a == "\xA0") {
        let I = s === 0 ? "" : o.pop(), g2 = s === i.length - 1 ? "" : i[s + 1];
        o.push(I + "\xA0" + g2), s += 2;
      } else
        o.push(a), s++;
    }
    n = o;
  }
  if (Bt.size >= xu) {
    let i = Bt.keys().next().value;
    Bt.delete(i);
  }
  return Bt.set(r, n), n;
}
function M(A, e, t) {
  let r = "";
  for (let [n, i] of Object.entries(e))
    typeof i < "u" && (r += ` ${n}="${i}"`);
  return t ? `<${A}${r}>${t}</${A}>` : `<${A}${r}/>`;
}
function Bs(A = 20) {
  let e = /* @__PURE__ */ new Map();
  function t(i) {
    let o = e.get(i);
    if (o !== void 0)
      return e.delete(i), e.set(i, o), o;
  }
  function r(i, o) {
    if (e.has(i))
      e.delete(i);
    else if (e.size >= A) {
      let s = e.keys().next().value;
      e.delete(s);
    }
    e.set(i, o);
  }
  function n() {
    e.clear();
  }
  return { set: r, get: t, clear: n };
}
function ft(A) {
  return A ? A.split(/[, ]/).filter(Boolean).map(Number) : null;
}
function Hr(A) {
  return typeof A == "string";
}
function Es(A) {
  return typeof A == "number";
}
function fs(A) {
  return typeof A > "u";
}
function Ue(A, e) {
  if (typeof A == "number")
    return A;
  if (A.endsWith("%")) {
    let t = parseFloat(A.slice(0, -1));
    if (isNaN(t)) {
      console.warn(`Invalid value "${A}"${typeof e == "string" ? ` for "${e}"` : ""}. Expected a percentage value (e.g., "50%").`);
      return;
    }
    return `${t}%`;
  }
  console.warn(`Invalid value "${A}"${typeof e == "string" ? ` for "${e}"` : ""}. Expected a number or a percentage value (e.g., "50%").`);
}
function We(A, e) {
  if (typeof A == "number")
    return A;
  if (A === "auto")
    return "auto";
  if (A.endsWith("%")) {
    let t = parseFloat(A.slice(0, -1));
    if (isNaN(t)) {
      console.warn(`Invalid value "${A}"${typeof e == "string" ? ` for "${e}"` : ""}. Expected a percentage value (e.g., "50%").`);
      return;
    }
    return `${t}%`;
  }
  console.warn(`Invalid value "${A}"${typeof e == "string" ? ` for "${e}"` : ""}. Expected a number, "auto", or a percentage value (e.g., "50%").`);
}
function Qs(A, e) {
  if (e === "break-all")
    return { words: WA(A, "grapheme"), requiredBreaks: [] };
  if (e === "keep-all")
    return { words: WA(A, "word"), requiredBreaks: [] };
  let t = new $557adaaeb0c7885f$exports(A), r = 0, n = t.nextBreak(), i = [], o = [false];
  for (; n; ) {
    let s = A.slice(r, n.position);
    i.push(s), n.required ? o.push(true) : o.push(false), r = n.position, n = t.nextBreak();
  }
  return { words: i, requiredBreaks: o };
}
var Cs = (A) => A.replaceAll(/([A-Z])/g, (e, t) => `-${t.toLowerCase()}`);
function Or(A, e = ",") {
  let t = [], r = 0, n = 0;
  e = new RegExp(e);
  for (let i = 0; i < A.length; i++)
    A[i] === "(" ? n++ : A[i] === ")" && n--, n === 0 && e.test(A[i]) && (t.push(A.slice(r, i).trim()), r = i + 1);
  return t.push(A.slice(r).trim()), t;
}
function Ye() {
  return Promise.resolve().then(() => (Tn(), On)).then((A) => A.getYoga());
}
Promise.resolve().then(() => Tn());
var ks = Symbol.for("react.fragment");
var Uu = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
function xs(A) {
  let e = A.split(".").map((i) => Number.parseInt(i, 10));
  if (e.length !== 4 || e.some((i) => !Number.isInteger(i) || i < 0 || i > 255))
    return true;
  let [t, r, n] = e;
  return t === 0 || t === 10 || t === 100 && r >= 64 && r <= 127 || t === 127 || t === 169 && r === 254 || t === 172 && r >= 16 && r <= 31 || t === 192 && r === 0 && n === 0 || t === 192 && r === 168 || t === 198 && (r === 18 || r === 19) || t >= 224;
}
function Hu(A) {
  let e = A.match(/^(?:::ffff:|64:ff9b::|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (e)
    return e[1];
  let t = A.match(/^(?:::ffff:|64:ff9b::|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (t) {
    let r = Number.parseInt(t[1], 16), n = Number.parseInt(t[2], 16);
    return `${r >> 8 & 255}.${r & 255}.${n >> 8 & 255}.${n & 255}`;
  }
  return null;
}
function Ou(A) {
  let e = Hu(A);
  return e ? xs(e) : !!(A === "::" || A === "::1" || A.startsWith("fc") || A.startsWith("fd") || /^fe[89ab]/.test(A) || /^fe[c-f]/.test(A) || A.startsWith("ff") || /^2001:0?db8(?::|$)/.test(A));
}
function Tu(A) {
  let e;
  try {
    e = new URL(A);
  } catch {
    return true;
  }
  if (e.protocol !== "http:" && e.protocol !== "https:")
    return true;
  let t = e.hostname.toLowerCase();
  return t.startsWith("[") && t.endsWith("]") && (t = t.slice(1, -1)), t === "localhost" || t.endsWith(".localhost") || t.endsWith(".local") ? true : Uu.test(t) ? xs(t) : t.includes(":") ? Ou(t) : false;
}
function Rs(A) {
  if (Tu(A))
    throw new Error(`Image source resolves to a blocked address (SSRF protection): ${A}`);
}
var Pu = "image/avif";
var _r = "image/webp";
var Jr = "image/apng";
var Kr = "image/png";
var Wr = "image/jpeg";
var Yr = "image/gif";
var Pn = "image/svg+xml";
function Fs(A) {
  let e = new DataView(A), t = 4, r = e.byteLength;
  for (; t < r; ) {
    let n = e.getUint16(t, false);
    if (n > r)
      throw new TypeError("Invalid JPEG");
    let i = e.getUint8(n + 1 + t);
    if (i === 192 || i === 193 || i === 194)
      return [e.getUint16(n + 7 + t, false), e.getUint16(n + 5 + t, false)];
    t += n + 2;
  }
  throw new TypeError("Invalid JPEG");
}
function Ms(A) {
  let e = new DataView(A), t = new Uint8Array(A);
  if (e.byteLength < 20 || e.getUint32(0) !== 1380533830 || e.getUint32(8) !== 1464156752)
    throw new TypeError("Invalid WebP");
  let r = e.getUint32(4, true) + 8;
  if (r < 20 || r > e.byteLength)
    throw new TypeError("Invalid WebP");
  let n = 12;
  for (; n + 8 <= r; ) {
    let i = e.getUint32(n), o = e.getUint32(n + 4, true), s = n + 8, a = s + o;
    if (a > r)
      throw new TypeError("Invalid WebP");
    if (i === 1448097824) {
      if (o < 10 || t[s + 3] !== 157 || t[s + 4] !== 1 || t[s + 5] !== 42)
        throw new TypeError("Invalid WebP");
      let I = e.getUint16(s + 6, true) & 16383, g2 = e.getUint16(s + 8, true) & 16383;
      if (!I || !g2)
        throw new TypeError("Invalid WebP");
      return [I, g2];
    }
    if (i === 1448097868) {
      if (o < 5 || t[s] !== 47)
        throw new TypeError("Invalid WebP");
      let I = e.getUint32(s + 1, true);
      return [(I & 16383) + 1, (I >>> 14 & 16383) + 1];
    }
    if (i === 1448097880) {
      if (o < 10)
        throw new TypeError("Invalid WebP");
      return [t[s + 4] + (t[s + 5] << 8) + (t[s + 6] << 16) + 1, t[s + 7] + (t[s + 8] << 8) + (t[s + 9] << 16) + 1];
    }
    n = a + o % 2;
  }
  throw new TypeError("Invalid WebP");
}
function Ls(A) {
  let e = new Uint8Array(A.slice(6, 10));
  return [e[0] | e[1] << 8, e[2] | e[3] << 8];
}
function Gs(A) {
  let e = new DataView(A);
  return [e.getUint16(18, false), e.getUint16(22, false)];
}
var ke = Bs(500);
var Mt = /* @__PURE__ */ new Map();
var _u = [Kr, Jr, Wr, Yr, Pn, _r];
var Ju = /<svg[^>]*>/i;
var Ku = /viewBox=['"]([^'"]+)['"]/;
var Wu = /width=['"](\d*\.?\d+)['"]/;
var Yu = /height=['"](\d*\.?\d+)['"]/;
function qu(A) {
  let e = new Uint8Array(A), t = 32768, r = "";
  for (let n = 0; n < e.length; n += t) {
    let i = e.subarray(n, Math.min(n + t, e.length));
    r += String.fromCharCode(...i);
  }
  return btoa(r);
}
function Xu(A) {
  let e = atob(A), t = e.length, r = new Uint8Array(t);
  for (let n = 0; n < t; n++)
    r[n] = e.charCodeAt(n);
  return r.buffer;
}
function vs(A, e) {
  let t = e.match(Ju);
  if (!t)
    throw new Error(`Failed to parse SVG from ${A}`);
  let r = t[0], n = Ku.exec(r), i = Wu.exec(r), o = Yu.exec(r), s = n ? ft(n[1]) : null;
  if (!s && (!i || !o))
    throw new Error(`Failed to parse SVG from ${A}: missing "viewBox"`);
  let a = s ? [s[2], s[3]] : [+i[1], +o[1]], I = a[0] / a[1];
  return i && o ? [+i[1], +o[1]] : i ? [+i[1], +i[1] / I] : o ? [+o[1] * I, +o[1]] : [a[0], a[1]];
}
function Ns(A) {
  let e, t = Vu(new Uint8Array(A));
  switch (t) {
    case Kr:
    case Jr:
      e = Gs(A);
      break;
    case Yr:
      e = Ls(A);
      break;
    case Wr:
      e = Fs(A);
      break;
    case _r:
      e = Ms(A);
      break;
  }
  if (!_u.includes(t))
    throw new Error(`Unsupported image type: ${t || "unknown"}`);
  return [`data:${t};base64,${qu(A)}`, e];
}
async function ht(A) {
  if (!A)
    throw new Error("Image source is not provided.");
  if (typeof A == "object") {
    let [n, i] = Ns(A);
    return [n, ...i];
  }
  if ((A.startsWith('"') && A.endsWith('"') || A.startsWith("'") && A.endsWith("'")) && (A = A.slice(1, -1)), typeof window > "u" && !A.startsWith("http") && !A.startsWith("data:"))
    throw new Error(`Image source must be an absolute URL: ${A}`);
  if (A.startsWith("data:")) {
    let n;
    try {
      n = /data:(?<imageType>[a-z/+]+)(;[^;=]+=[^;=]+)*?(;(?<encodingType>[^;,]+))?,(?<dataString>.*)/g.exec(A).groups;
    } catch {
      return console.warn("Image data URI resolved without size:" + A), [A];
    }
    let { imageType: i, encodingType: o, dataString: s } = n;
    if (i === Pn) {
      let a = o === "base64" ? atob(s) : decodeURIComponent(s.replace(/ /g, "%20")), I = o === "base64" ? A : `data:image/svg+xml;base64,${btoa(a)}`, g2 = vs(A, a);
      return ke.set(A, [I, ...g2]), [I, ...g2];
    } else if (o === "base64") {
      let a, I = Xu(s);
      switch (i) {
        case Kr:
        case Jr:
          a = Gs(I);
          break;
        case Yr:
          a = Ls(I);
          break;
        case Wr:
          a = Fs(I);
          break;
        case _r:
          a = Ms(I);
          break;
      }
      return ke.set(A, [A, ...a]), [A, ...a];
    } else
      return console.warn("Image data URI resolved without size:" + A), ke.set(A, [A]), [A];
  }
  if (!globalThis.fetch)
    throw new Error("`fetch` is required to be polyfilled to load images.");
  if (Mt.has(A))
    return Mt.get(A);
  let e = ke.get(A);
  if (e)
    return e;
  let t = A;
  typeof window > "u" && Rs(t);
  let r = fetch(t).then((n) => {
    let i = n.headers.get("content-type");
    return i === "image/svg+xml" || i === "application/svg+xml" ? n.text() : n.arrayBuffer();
  }).then((n) => {
    if (typeof n == "string")
      try {
        let s = `data:image/svg+xml;base64,${btoa(n)}`, a = vs(t, n);
        return [s, ...a];
      } catch (s) {
        throw new Error(`Failed to parse SVG image: ${s.message}`);
      }
    let [i, o] = Ns(n);
    return [i, ...o];
  }).then((n) => (ke.set(t, n), n)).catch((n) => (console.error(`Can't load image ${t}: ` + n.message), ke.set(t, []), []));
  return Mt.set(t, r), r;
}
function Vu(A) {
  return [255, 216, 255].every((e, t) => A[t] === e) ? Wr : [137, 80, 78, 71, 13, 10, 26, 10].every((e, t) => A[t] === e) ? zu(A) ? Jr : Kr : [71, 73, 70, 56].every((e, t) => A[t] === e) ? Yr : [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80].every((e, t) => !e || A[t] === e) ? _r : [60, 63, 120, 109, 108].every((e, t) => A[t] === e) ? Pn : [0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102].every((e, t) => !e || A[t] === e) ? Pu : null;
}
function zu(A) {
  let e = new DataView(A.buffer), t, r, n = 8, i = false;
  for (; !i && t !== "IEND" && n < A.length; ) {
    r = e.getUint32(n);
    let o = A.subarray(n + 4, n + 8);
    t = String.fromCharCode(...o), i = t === "acTL", n += 12 + r;
  }
  return i;
}
var _n = { accentHeight: "accent-height", alignmentBaseline: "alignment-baseline", arabicForm: "arabic-form", baselineShift: "baseline-shift", capHeight: "cap-height", clipPath: "clip-path", clipRule: "clip-rule", colorInterpolation: "color-interpolation", colorInterpolationFilters: "color-interpolation-filters", colorProfile: "color-profile", colorRendering: "color-rendering", dominantBaseline: "dominant-baseline", enableBackground: "enable-background", fillOpacity: "fill-opacity", fillRule: "fill-rule", floodColor: "flood-color", floodOpacity: "flood-opacity", fontFamily: "font-family", fontSize: "font-size", fontSizeAdjust: "font-size-adjust", fontStretch: "font-stretch", fontStyle: "font-style", fontVariant: "font-variant", fontWeight: "font-weight", glyphName: "glyph-name", glyphOrientationHorizontal: "glyph-orientation-horizontal", glyphOrientationVertical: "glyph-orientation-vertical", horizAdvX: "horiz-adv-x", horizOriginX: "horiz-origin-x", href: "href", imageRendering: "image-rendering", letterSpacing: "letter-spacing", lightingColor: "lighting-color", markerEnd: "marker-end", markerMid: "marker-mid", markerStart: "marker-start", overlinePosition: "overline-position", overlineThickness: "overline-thickness", paintOrder: "paint-order", panose1: "panose-1", pointerEvents: "pointer-events", renderingIntent: "rendering-intent", shapeRendering: "shape-rendering", stopColor: "stop-color", stopOpacity: "stop-opacity", strikethroughPosition: "strikethrough-position", strikethroughThickness: "strikethrough-thickness", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width", textAnchor: "text-anchor", textDecoration: "text-decoration", textRendering: "text-rendering", underlinePosition: "underline-position", underlineThickness: "underline-thickness", unicodeBidi: "unicode-bidi", unicodeRange: "unicode-range", unitsPerEm: "units-per-em", vAlphabetic: "v-alphabetic", vHanging: "v-hanging", vIdeographic: "v-ideographic", vMathematical: "v-mathematical", vectorEffect: "vector-effect", vertAdvY: "vert-adv-y", vertOriginX: "vert-origin-x", vertOriginY: "vert-origin-y", wordSpacing: "word-spacing", writingMode: "writing-mode", xHeight: "x-height", xlinkActuate: "xlink:actuate", xlinkArcrole: "xlink:arcrole", xlinkHref: "xlink:href", xlinkRole: "xlink:role", xlinkShow: "xlink:show", xlinkTitle: "xlink:title", xlinkType: "xlink:type", xmlBase: "xml:base", xmlLang: "xml:lang", xmlSpace: "xml:space", xmlnsXlink: "xmlns:xlink" };
var Zu = /[\r\n%#()<>?[\\\]^`{|}"']/g;
function qr(A, e) {
  if (!A)
    return "";
  if (Array.isArray(A))
    return A.map((I) => qr(I, e)).join("");
  if (typeof A != "object")
    return String(A);
  let t = A.type;
  if (t === "text")
    throw new Error("<text> nodes are not currently supported, please convert them to <path>");
  let { children: r, style: n, ...i } = A.props || {}, o = (n == null ? void 0 : n.color) || e, s = `${Object.entries(i).map(([I, g2]) => (typeof g2 == "string" && g2.toLowerCase() === "currentcolor" && (g2 = o), (I === "href" || I === "xlinkHref") && t === "image" ? ` ${_n[I] || I}="${ke.get(g2)[0]}"` : ` ${_n[I] || I}="${g2}"`)).join("")}`, a = n ? ` style="${Object.entries(n).map(([I, g2]) => `${Cs(I)}:${g2}`).join(";")}"` : "";
  return t === ks ? qr(r, o) : `<${t}${s}${a}>${qr(r, o)}</${t}>`;
}
async function Us(A) {
  let e = /* @__PURE__ */ new Set(), t = (r) => {
    if (r && Et(r)) {
      if (Array.isArray(r)) {
        r.forEach((n) => t(n));
        return;
      } else if (typeof r == "object")
        if (r.type === "image") {
          let n = r.props.href || r.props.xlinkHref;
          n && (e.has(n) || e.add(n));
        } else
          r.type === "img" && (e.has(r.props.src) || e.add(r.props.src));
      Array.isArray(r.props.children) ? r.props.children.map((n) => t(n)) : t(r.props.children);
    }
  };
  return t(A), Promise.all(Array.from(e).map((r) => ht(r)));
}
async function Hs(A, e) {
  let { viewBox: t, viewbox: r, width: n, height: i, className: o, style: s, children: a, ...I } = A.props || {};
  t ||= r, I.xmlns = "http://www.w3.org/2000/svg";
  let g2 = (s == null ? void 0 : s.color) || e, c2 = ft(t), B = c2 ? c2[3] / c2[2] : null;
  return n = n || B && i ? i / B : null, i = i || B && n ? n * B : null, I.width = n, I.height = i, t && (I.viewBox = t), `data:image/svg+xml;utf8,${`<svg ${Object.entries(I).map(([E, Q]) => (typeof Q == "string" && Q.toLowerCase() === "currentcolor" && (Q = g2), ` ${_n[E] || E}="${Q}"`)).join("")}>${qr(a, g2)}</svg>`.replace(Zu, encodeURIComponent)}`;
}
var ae = "flex";
var Os = { p: { display: ae, marginTop: "1em", marginBottom: "1em" }, div: { display: ae }, blockquote: { display: ae, marginTop: "1em", marginBottom: "1em", marginLeft: 40, marginRight: 40 }, center: { display: ae, textAlign: "center" }, hr: { display: ae, marginTop: "0.5em", marginBottom: "0.5em", marginLeft: "auto", marginRight: "auto", borderWidth: 1, borderStyle: "solid" }, h1: { display: ae, fontSize: "2em", marginTop: "0.67em", marginBottom: "0.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h2: { display: ae, fontSize: "1.5em", marginTop: "0.83em", marginBottom: "0.83em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h3: { display: ae, fontSize: "1.17em", marginTop: "1em", marginBottom: "1em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h4: { display: ae, marginTop: "1.33em", marginBottom: "1.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h5: { display: ae, fontSize: "0.83em", marginTop: "1.67em", marginBottom: "1.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h6: { display: ae, fontSize: "0.67em", marginTop: "2.33em", marginBottom: "2.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, u: { textDecoration: "underline" }, strong: { fontWeight: "bold" }, b: { fontWeight: "bold" }, i: { fontStyle: "italic" }, em: { fontStyle: "italic" }, code: { fontFamily: "monospace" }, kbd: { fontFamily: "monospace" }, pre: { display: ae, fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", marginBottom: "1em" }, mark: { backgroundColor: "yellow", color: "black" }, big: { fontSize: "larger" }, small: { fontSize: "smaller" }, s: { textDecoration: "line-through" } };
var ju = /* @__PURE__ */ new Set(["color", "font", "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textIndent", "textTransform", "textShadowOffset", "textShadowColor", "textShadowRadius", "WebkitTextStrokeWidth", "WebkitTextStrokeColor", "textDecorationLine", "textDecorationStyle", "textDecorationColor", "textDecorationSkipInk", "whiteSpace", "transform", "wordBreak", "tabSize", "opacity", "filter", "_viewportWidth", "_viewportHeight", "_inheritedClipPathId", "_inheritedMaskId", "_inheritedBackgroundClipTextPath", "_inheritedBackgroundClipTextHasBackground"]);
function Jn(A) {
  let e = {};
  for (let t in A)
    (ju.has(t) || t.startsWith("--")) && (e[t] = A[t]);
  return e;
}
function Al(A, e) {
  try {
    let t = new he(A);
    switch (t.unit) {
      case "px":
        return { absolute: t.value };
      case "em":
        return { absolute: t.value * e };
      case "rem":
        return { absolute: t.value * 16 };
      case "%":
        return { relative: t.value };
      default:
        return {};
    }
  } catch {
    return {};
  }
}
function Kn(A, e, t) {
  switch (A) {
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
      let r = Al(A, e);
      return r.absolute ? { [t ? "xAbsolute" : "yAbsolute"]: r.absolute } : r.relative ? { [t ? "xRelative" : "yRelative"]: r.relative } : {};
    }
  }
}
function Wn(A, e) {
  if (typeof A == "number")
    return { xAbsolute: A };
  let t;
  try {
    t = (0, import_postcss_value_parser.default)(A).nodes.filter((r) => r.type === "word").map((r) => r.value);
  } catch {
    return {};
  }
  return t.length === 1 ? Kn(t[0], e, true) : t.length === 2 ? ((t[0] === "top" || t[0] === "bottom" || t[1] === "left" || t[1] === "right") && t.reverse(), { ...Kn(t[0], e, true), ...Kn(t[1], e, false) }) : {};
}
function Lt(A, e) {
  let t = (0, import_css_to_react_native2.getPropertyName)(`mask-${e}`);
  return A[t] || A[`WebkitM${t.substring(1)}`];
}
function Ts(A) {
  let e = A.maskImage || A.WebkitMaskImage, t = { position: Lt(A, "position") || "0% 0%", size: Lt(A, "size") || "100% 100%", repeat: Lt(A, "repeat") || "repeat", origin: Lt(A, "origin") || "border-box", clip: Lt(A, "origin") || "border-box" };
  return Or(e).filter((n) => n && n !== "none").reverse().map((n) => ({ image: n, ...t }));
}
function _s(A) {
  let e = {}, t = {};
  for (let r in A)
    r.startsWith("--") ? e[r] = String(A[r]) : t[r] = A[r];
  return { variables: e, remainingStyle: t };
}
function Js(A, e) {
  return { ...A, ...e };
}
function Ut(A, e, t = /* @__PURE__ */ new Set()) {
  if (typeof A != "string" || !A.includes("var("))
    return A;
  try {
    let r = (0, import_postcss_value_parser2.default)(A), n = false;
    if (r.walk((i) => {
      if (i.type === "function" && i.value === "var") {
        n = true;
        let o = tl(i);
        if (!o)
          return;
        let { varName: s, fallback: a } = o;
        if (t.has(s)) {
          console.warn(`Circular reference detected for CSS variable: ${s}`), a !== void 0 ? Gt(i, a) : Gt(i, "initial");
          return;
        }
        let I = e[s];
        if (I !== void 0) {
          let g2 = new Set(t);
          g2.add(s);
          let c2 = Ut(I, e, g2);
          Gt(i, String(c2));
        } else if (a !== void 0) {
          let g2 = Ut(a, e, t);
          Gt(i, String(g2));
        } else
          Gt(i, "initial");
      }
    }), n)
      return r.toString();
  } catch {
    console.warn(`Failed to parse CSS value for variable resolution: ${A}`);
  }
  return A;
}
function tl(A) {
  if (!A.nodes || A.nodes.length === 0)
    return null;
  let e, t = -1;
  for (let n = 0; n < A.nodes.length; n++) {
    let i = A.nodes[n];
    if (i.type === "word" && !e)
      e = i;
    else if (i.type === "div" && i.value === ",") {
      t = n;
      break;
    }
  }
  if (!e || e.type !== "word")
    return null;
  let r = e.value.trim();
  if (t !== -1 && t < A.nodes.length - 1) {
    let n = A.nodes.slice(t + 1), i = import_postcss_value_parser2.default.stringify(n).trim();
    return { varName: r, fallback: i };
  }
  return { varName: r };
}
function Gt(A, e) {
  A.type = "word", A.value = e, delete A.nodes;
}
var sl = /* @__PURE__ */ new Set(["flex", "flexGrow", "flexShrink", "flexBasis", "fontWeight", "lineHeight", "opacity", "scale", "scaleX", "scaleY"]);
var al = /* @__PURE__ */ new Set(["lineHeight"]);
function gl(A, e, t, r) {
  return A === "textDecoration" && !t.includes(e.textDecorationColor) && (e.textDecorationColor = r), e;
}
function rt(A, e) {
  let t = Number(e);
  return isNaN(t) ? e : sl.has(A) ? al.has(A) ? t : String(e) : t + "px";
}
function Il(A, e, t) {
  if (A === "zIndex")
    return console.warn("`z-index` is currently not supported."), { [A]: e };
  if (A === "lineHeight")
    return { lineHeight: rt(A, e) };
  if (A === "fontFamily")
    return { fontFamily: e.split(",").map((r) => r.trim().replace(/(^['"])|(['"]$)/g, "").toLocaleLowerCase()) };
  if (A === "borderRadius") {
    if (typeof e != "string" || !e.includes("/"))
      return;
    let [r, n] = e.split("/"), i = (0, import_css_to_react_native.getStylesForProperty)(A, r, true), o = (0, import_css_to_react_native.getStylesForProperty)(A, n, true);
    for (let s in i)
      o[s] = rt(A, i[s]) + " " + rt(A, o[s]);
    return o;
  }
  if (/^border(Top|Right|Bottom|Left)?$/.test(A)) {
    let r = (0, import_css_to_react_native.getStylesForProperty)("border", e, true);
    r.borderWidth === 1 && !String(e).includes("1px") && (r.borderWidth = 3), r.borderColor === "black" && !String(e).includes("black") && (r.borderColor = t);
    let n = { Width: rt(A + "Width", r.borderWidth), Style: YA(r.borderStyle, { solid: "solid", dashed: "dashed" }, "solid", A + "Style"), Color: r.borderColor }, i = {};
    for (let o of A === "border" ? ["Top", "Right", "Bottom", "Left"] : [A.slice(6)])
      for (let s in n)
        i["border" + o + s] = n[s];
    return i;
  }
  if (A === "boxShadow") {
    if (!e)
      throw new Error('Invalid `boxShadow` value: "' + e + '".');
    return { [A]: typeof e == "string" ? (0, import_css_box_shadow.parse)(e) : e };
  }
  if (A === "transform") {
    if (typeof e != "string")
      throw new Error("Invalid `transform` value.");
    let r = {}, n = e.replace(/(-?[\d.]+%)/g, (o, s) => {
      let a = ~~(Math.random() * 1e9);
      return r[a] = s, a + "px";
    }), i = (0, import_css_to_react_native.getStylesForProperty)("transform", n, true);
    for (let o of i.transform)
      for (let s in o)
        r[o[s]] && (o[s] = r[o[s]]);
    return i;
  }
  if (A === "background")
    return e = e.toString().trim(), /^(linear-gradient|radial-gradient|url|repeating-linear-gradient|repeating-radial-gradient)\(/.test(e) ? (0, import_css_to_react_native.getStylesForProperty)("backgroundImage", e, true) : (0, import_css_to_react_native.getStylesForProperty)("background", e, true);
  if (A === "textShadow") {
    e = e.toString().trim();
    let r = {}, n = Or(e);
    for (let i of n) {
      let o = (0, import_css_to_react_native.getStylesForProperty)("textShadow", i, true);
      for (let s in o)
        r[s] ? r[s].push(o[s]) : r[s] = [o[s]];
    }
    return r;
  }
  if (A === "WebkitTextStroke") {
    e = e.toString().trim();
    let r = e.split(" ");
    if (r.length !== 2)
      throw new Error("Invalid `WebkitTextStroke` value.");
    return { WebkitTextStrokeWidth: rt(A, r[0]), WebkitTextStrokeColor: rt(A, r[1]) };
  }
  if (A === "textDecorationSkipInk") {
    let r = e.toString().trim().toLowerCase();
    if (!["auto", "none", "all"].includes(r))
      throw new Error("Invalid `textDecorationSkipInk` value.");
    return { textDecorationSkipInk: r };
  }
}
function Ks(A) {
  return A === "transform" ? " Only absolute lengths such as `10px` are supported." : "";
}
var Ws = /rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\.\d]+)\)/;
function qs(A) {
  if (typeof A == "string" && Ws.test(A.trim()))
    return A.trim().replace(Ws, (e, t, r, n, i) => `rgba(${t}, ${r}, ${n}, ${i})`);
  if (typeof A == "object" && A !== null) {
    for (let e in A)
      A[e] = qs(A[e]);
    return A;
  }
  return A;
}
function Xr(A, e) {
  let t = {}, r = {};
  for (let a in e)
    a.startsWith("--") && (r[a] = String(e[a]));
  let n = {}, i = A;
  if (A) {
    let { variables: a, remainingStyle: I } = _s(A);
    n = a, i = I;
  }
  let o = Js(r, n);
  for (let a in o)
    t[a] = o[a];
  if (i) {
    let a = i.color ? Ut(i.color, o) : void 0, I = ll(a, e.color);
    t.color = I;
    for (let g2 in i) {
      if (g2.startsWith("_")) {
        t[g2] = i[g2];
        continue;
      }
      if (g2 === "color")
        continue;
      let c2 = (0, import_css_to_react_native.getPropertyName)(g2), B = Ut(i[g2], o), E = Bl(B, I);
      try {
        let Q = Il(c2, E, I) || gl(c2, (0, import_css_to_react_native.getStylesForProperty)(c2, rt(c2, E), true), E, I);
        Object.assign(t, Q);
      } catch (Q) {
        throw new Error(Q.message + (Q.message.includes(E) ? `
  ` + Ks(c2) : `
  in CSS rule \`${c2}: ${E}\`.${Ks(c2)}`));
      }
    }
  }
  if (t.backgroundImage) {
    let { backgrounds: a } = (0, import_css_background_parser.parseElementStyle)(t);
    t.backgroundImage = a;
  }
  (t.maskImage || t.WebkitMaskImage) && (t.maskImage = Ts(t));
  let s = ul(t.fontSize, e.fontSize);
  typeof t.fontSize < "u" && (t.fontSize = s), t.transformOrigin && (t.transformOrigin = Wn(t.transformOrigin, s));
  for (let a in t) {
    let I = t[a];
    if (a === "lineHeight")
      typeof I == "string" && I !== "normal" && (I = t[a] = X(I, s, s, e, true) / s);
    else {
      if (typeof I == "string") {
        let g2 = X(I, s, s, e);
        typeof g2 < "u" && (t[a] = g2), I = t[a];
      }
      if (typeof I == "string" || typeof I == "object") {
        let g2 = qs(I);
        g2 && (t[a] = g2), I = t[a];
      }
    }
    if (a === "opacity" && typeof I == "number" && (t.opacity = I * e.opacity), a === "transform") {
      let g2 = I;
      for (let c2 of g2) {
        let B = Object.keys(c2)[0], E = c2[B], Q = typeof E == "string" ? X(E, s, s, e) ?? E : E;
        c2[B] = Q;
      }
    }
    if (a === "textShadowRadius") {
      let g2 = I;
      t.textShadowRadius = g2.map((c2) => X(c2, s, 0, e, false));
    }
    if (a === "textShadowOffset") {
      let g2 = I;
      t.textShadowOffset = g2.map(({ height: c2, width: B }) => ({ height: X(c2, s, 0, e, false), width: X(B, s, 0, e, false) }));
    }
  }
  return t;
}
function ul(A, e) {
  if (typeof A == "number")
    return A;
  try {
    let t = new he(A);
    switch (t.unit) {
      case "em":
        return t.value * e;
      case "rem":
        return t.value * 16;
    }
  } catch {
    return e;
  }
}
function Ys(A) {
  if (A.startsWith("hsl")) {
    let e = index_esm_default(A), [t, r, n] = e.values;
    return `hsl(${[t, `${r}%`, `${n}%`].concat(e.alpha === 1 ? [] : [e.alpha]).join(",")})`;
  }
  return A;
}
function ll(A, e) {
  return A && A.toLowerCase() !== "currentcolor" ? Ys(A) : Ys(e);
}
function cl(A, e) {
  return A.replace(/currentcolor/gi, e);
}
function Bl(A, e) {
  return Hr(A) && (A = cl(A, e)), A;
}
async function Yn(A, e, t, r, n) {
  let i = await Ye(), o = Object.assign({}, t, Xr(Os[e], t), Xr(r, t));
  if (e === "img") {
    let [s, a, I] = await ht(n.src);
    if (a === void 0 && I === void 0) {
      if (n.width === void 0 || n.height === void 0)
        throw new Error("Image size cannot be determined. Please provide the width and height of the image.");
      a = parseInt(n.width), I = parseInt(n.height);
    }
    let g2 = I / a, c2 = (o.borderLeftWidth || 0) + (o.borderRightWidth || 0) + (o.paddingLeft || 0) + (o.paddingRight || 0), B = (o.borderTopWidth || 0) + (o.borderBottomWidth || 0) + (o.paddingTop || 0) + (o.paddingBottom || 0), E = o.width || n.width, Q = o.height || n.height, d2 = typeof E == "number" && typeof Q == "number";
    d2 && (E -= c2, Q -= B), E === void 0 && Q === void 0 ? (E = "100%", A.setAspectRatio(1 / g2)) : E === void 0 ? typeof Q == "number" ? E = Q / g2 : A.setAspectRatio(1 / g2) : Q === void 0 && (typeof E == "number" ? Q = E * g2 : A.setAspectRatio(1 / g2)), o.width = d2 ? E + c2 : E, o.height = d2 ? Q + B : Q, o.__src = s, o.__naturalWidth = a, o.__naturalHeight = I;
  }
  if (e === "svg") {
    let s = n.viewBox || n.viewbox, a = ft(s), I = a ? a[3] / a[2] : null, { width: g2, height: c2 } = n;
    typeof g2 > "u" && c2 ? I == null ? g2 = 0 : typeof c2 == "string" && c2.endsWith("%") ? g2 = parseInt(c2) / I + "%" : (c2 = X(c2, t.fontSize, 1, t), g2 = c2 / I) : typeof c2 > "u" && g2 ? I == null ? g2 = 0 : typeof g2 == "string" && g2.endsWith("%") ? c2 = parseInt(g2) * I + "%" : (g2 = X(g2, t.fontSize, 1, t), c2 = g2 * I) : (typeof g2 < "u" && (g2 = X(g2, t.fontSize, 1, t) || g2), typeof c2 < "u" && (c2 = X(c2, t.fontSize, 1, t) || c2), g2 ||= a == null ? void 0 : a[2], c2 ||= a == null ? void 0 : a[3]), !o.width && g2 && (o.width = g2), !o.height && c2 && (o.height = c2);
  }
  return A.setDisplay(YA(o.display, { flex: i.DISPLAY_FLEX, block: i.DISPLAY_FLEX, contents: i.DISPLAY_CONTENTS, none: i.DISPLAY_NONE, "-webkit-box": i.DISPLAY_FLEX }, i.DISPLAY_FLEX, "display")), A.setAlignContent(YA(o.alignContent, { stretch: i.ALIGN_STRETCH, center: i.ALIGN_CENTER, "flex-start": i.ALIGN_FLEX_START, "flex-end": i.ALIGN_FLEX_END, "space-between": i.ALIGN_SPACE_BETWEEN, "space-around": i.ALIGN_SPACE_AROUND, baseline: i.ALIGN_BASELINE, normal: i.ALIGN_AUTO }, i.ALIGN_AUTO, "alignContent")), A.setAlignItems(YA(o.alignItems, { stretch: i.ALIGN_STRETCH, center: i.ALIGN_CENTER, "flex-start": i.ALIGN_FLEX_START, "flex-end": i.ALIGN_FLEX_END, baseline: i.ALIGN_BASELINE, normal: i.ALIGN_AUTO }, i.ALIGN_STRETCH, "alignItems")), A.setAlignSelf(YA(o.alignSelf, { stretch: i.ALIGN_STRETCH, center: i.ALIGN_CENTER, "flex-start": i.ALIGN_FLEX_START, "flex-end": i.ALIGN_FLEX_END, baseline: i.ALIGN_BASELINE, normal: i.ALIGN_AUTO }, i.ALIGN_AUTO, "alignSelf")), A.setJustifyContent(YA(o.justifyContent, { center: i.JUSTIFY_CENTER, "flex-start": i.JUSTIFY_FLEX_START, "flex-end": i.JUSTIFY_FLEX_END, "space-between": i.JUSTIFY_SPACE_BETWEEN, "space-around": i.JUSTIFY_SPACE_AROUND }, i.JUSTIFY_FLEX_START, "justifyContent")), A.setFlexDirection(YA(o.flexDirection, { row: i.FLEX_DIRECTION_ROW, column: i.FLEX_DIRECTION_COLUMN, "row-reverse": i.FLEX_DIRECTION_ROW_REVERSE, "column-reverse": i.FLEX_DIRECTION_COLUMN_REVERSE }, i.FLEX_DIRECTION_ROW, "flexDirection")), A.setFlexWrap(YA(o.flexWrap, { wrap: i.WRAP_WRAP, nowrap: i.WRAP_NO_WRAP, "wrap-reverse": i.WRAP_WRAP_REVERSE }, i.WRAP_NO_WRAP, "flexWrap")), typeof o.gap < "u" && A.setGap(i.GUTTER_ALL, o.gap), typeof o.rowGap < "u" && A.setGap(i.GUTTER_ROW, o.rowGap), typeof o.columnGap < "u" && A.setGap(i.GUTTER_COLUMN, o.columnGap), typeof o.flexBasis < "u" && A.setFlexBasis(We(o.flexBasis, "flexBasis")), A.setFlexGrow(typeof o.flexGrow > "u" ? 0 : o.flexGrow), A.setFlexShrink(typeof o.flexShrink > "u" ? 0 : o.flexShrink), typeof o.maxHeight < "u" && A.setMaxHeight(Ue(o.maxHeight, "maxHeight")), typeof o.maxWidth < "u" && A.setMaxWidth(Ue(o.maxWidth, "maxWidth")), typeof o.minHeight < "u" && A.setMinHeight(Ue(o.minHeight, "minHeight")), typeof o.minWidth < "u" && A.setMinWidth(Ue(o.minWidth, "minWidth")), A.setOverflow(YA(o.overflow, { visible: i.OVERFLOW_VISIBLE, hidden: i.OVERFLOW_HIDDEN }, i.OVERFLOW_VISIBLE, "overflow")), A.setMargin(i.EDGE_TOP, We(o.marginTop || 0)), A.setMargin(i.EDGE_BOTTOM, We(o.marginBottom || 0)), A.setMargin(i.EDGE_LEFT, We(o.marginLeft || 0)), A.setMargin(i.EDGE_RIGHT, We(o.marginRight || 0)), A.setBorder(i.EDGE_TOP, o.borderTopWidth || 0), A.setBorder(i.EDGE_BOTTOM, o.borderBottomWidth || 0), A.setBorder(i.EDGE_LEFT, o.borderLeftWidth || 0), A.setBorder(i.EDGE_RIGHT, o.borderRightWidth || 0), A.setPadding(i.EDGE_TOP, o.paddingTop || 0), A.setPadding(i.EDGE_BOTTOM, o.paddingBottom || 0), A.setPadding(i.EDGE_LEFT, o.paddingLeft || 0), A.setPadding(i.EDGE_RIGHT, o.paddingRight || 0), A.setBoxSizing(YA(o.boxSizing, { "border-box": i.BOX_SIZING_BORDER_BOX, "content-box": i.BOX_SIZING_CONTENT_BOX }, i.BOX_SIZING_BORDER_BOX, "boxSizing")), A.setPositionType(YA(o.position, { absolute: i.POSITION_TYPE_ABSOLUTE, relative: i.POSITION_TYPE_RELATIVE, static: i.POSITION_TYPE_STATIC }, i.POSITION_TYPE_RELATIVE, "position")), typeof o.top < "u" && A.setPosition(i.EDGE_TOP, Ue(o.top, "top")), typeof o.bottom < "u" && A.setPosition(i.EDGE_BOTTOM, Ue(o.bottom, "bottom")), typeof o.left < "u" && A.setPosition(i.EDGE_LEFT, Ue(o.left, "left")), typeof o.right < "u" && A.setPosition(i.EDGE_RIGHT, Ue(o.right, "right")), typeof o.height < "u" ? A.setHeight(We(o.height, "height")) : A.setHeightAuto(), typeof o.width < "u" ? A.setWidth(We(o.width, "width")) : A.setWidthAuto(), [o, Jn(o)];
}
var Xs = [1, 0, 0, 1, 0, 0];
function El(A, e, t) {
  let r = [...Xs];
  for (let n of A) {
    let i = Object.keys(n)[0], o = n[i];
    if (typeof o == "string")
      if (i === "translateX")
        o = parseFloat(o) / 100 * e, n[i] = o;
      else if (i === "translateY")
        o = parseFloat(o) / 100 * t, n[i] = o;
      else
        throw new Error(`Invalid transform: "${i}: ${o}".`);
    let s = o, a = [...Xs];
    switch (i) {
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
        let I = s * Math.PI / 180, g2 = Math.cos(I), c2 = Math.sin(I);
        a[0] = g2, a[1] = c2, a[2] = -c2, a[3] = g2;
        break;
      }
      case "skewX":
        a[2] = Math.tan(s * Math.PI / 180);
        break;
      case "skewY":
        a[1] = Math.tan(s * Math.PI / 180);
        break;
    }
    r = Nt(a, r);
  }
  A.splice(0, A.length), A.push(...r), A.__resolved = true;
}
function Ht({ left: A, top: e, width: t, height: r }, n, i, o) {
  let s;
  n.__resolved || El(n, t, r);
  let a = n;
  if (i)
    s = a;
  else {
    let I = (o == null ? void 0 : o.xAbsolute) ?? ((o == null ? void 0 : o.xRelative) ?? 50) * t / 100, g2 = (o == null ? void 0 : o.yAbsolute) ?? ((o == null ? void 0 : o.yRelative) ?? 50) * r / 100, c2 = A + I, B = e + g2;
    s = Nt([1, 0, 0, 1, c2, B], Nt(a, [1, 0, 0, 1, -c2, -B])), a.__parent && (s = Nt(a.__parent, s)), a.splice(0, 6, ...s);
  }
  return `matrix(${s.map((I) => I.toFixed(2)).join(",")})`;
}
function zs({ left: A, top: e, width: t, height: r, isInheritingTransform: n }, i) {
  let o = "", s = 1;
  return i.transform && (o = Ht({ left: A, top: e, width: t, height: r }, i.transform, n, i.transformOrigin)), i.opacity !== void 0 && (s = +i.opacity), { matrix: o, opacity: s };
}
function qn({ id: A, content: e, filter: t, left: r, top: n, width: i, height: o, matrix: s, opacity: a, image: I, clipPathId: g2, debug: c2, shape: B, decorationShape: E }, Q) {
  let d2 = "";
  if (c2 && (d2 = M("rect", { x: r, y: n - o, width: i, height: o, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: s || void 0, "clip-path": g2 ? `url(#${g2})` : void 0 })), I) {
    let D = { href: I, x: r, y: n, width: i, height: o, transform: s || void 0, "clip-path": g2 ? `url(#${g2})` : void 0, style: Q.filter ? `filter:${Q.filter}` : void 0 };
    return [(t ? `${t}<g filter="url(#satori_s-${A})">` : "") + M("image", { ...D, opacity: a !== 1 ? a : void 0 }) + (E || "") + (t ? "</g>" : "") + d2, ""];
  }
  let m2 = { x: r, y: n, width: i, height: o, "font-weight": Q.fontWeight, "font-style": Q.fontStyle, "font-size": Q.fontSize, "font-family": Q.fontFamily, "letter-spacing": Q.letterSpacing || void 0, transform: s || void 0, "clip-path": g2 ? `url(#${g2})` : void 0, style: Q.filter ? `filter:${Q.filter}` : void 0, "stroke-width": Q.WebkitTextStrokeWidth ? `${Q.WebkitTextStrokeWidth}px` : void 0, stroke: Q.WebkitTextStrokeWidth ? Q.WebkitTextStrokeColor : void 0, "stroke-linejoin": Q.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": Q.WebkitTextStrokeWidth ? "stroke" : void 0 };
  return [(t ? `${t}<g filter="url(#satori_s-${A})">` : "") + M("text", { ...m2, fill: Q.color, opacity: a !== 1 ? a : void 0 }, (0, import_escape_html.default)(e)) + (E || "") + (t ? "</g>" : "") + d2, B ? M("text", m2, (0, import_escape_html.default)(e)) : ""];
}
function fl2(A, e, t) {
  return A.replace(/([MA])([0-9.-]+),([0-9.-]+)/g, function(r, n, i, o) {
    return n + (parseFloat(i) + e) + "," + (parseFloat(o) + t);
  });
}
var Vr = 1.1;
function Zs({ id: A, width: e, height: t }, r, n = false) {
  if (!r.shadowColor || !r.shadowOffset || typeof r.shadowRadius > "u")
    return "";
  let i = r.shadowColor.length, o = "", s = "", a = 0, I = e, g2 = 0, c2 = t;
  for (let B = 0; B < i; B++) {
    let E = r.shadowRadius[B] * r.shadowRadius[B] / 4;
    if (a = Math.min(r.shadowOffset[B].width - E, a), I = Math.max(r.shadowOffset[B].width + E + e, I), g2 = Math.min(r.shadowOffset[B].height - E, g2), c2 = Math.max(r.shadowOffset[B].height + E + t, c2), n) {
      let Q = `satori_s-${A}-result-${B}`;
      o += M("feGaussianBlur", { in: "SourceAlpha", stdDeviation: r.shadowRadius[B] / 2, result: `${Q}-blur` }) + M("feOffset", { in: `${Q}-blur`, dx: r.shadowOffset[B].width, dy: r.shadowOffset[B].height, result: `${Q}-offset` }) + M("feFlood", { "flood-color": r.shadowColor[B], "flood-opacity": 1, result: `${Q}-color` }) + M("feComposite", { in: `${Q}-color`, in2: `${Q}-offset`, operator: "in", result: i > 1 ? Q : void 0 });
    } else
      o += M("feDropShadow", { dx: r.shadowOffset[B].width, dy: r.shadowOffset[B].height, stdDeviation: r.shadowRadius[B] / 2, "flood-color": r.shadowColor[B], "flood-opacity": 1, ...i > 1 ? { in: "SourceGraphic", result: `satori_s-${A}-result-${B}` } : {} });
    i > 1 && (s = M("feMergeNode", { in: `satori_s-${A}-result-${B}` }) + s);
  }
  return M("filter", { id: `satori_s-${A}`, x: (a / e * 100 * Vr).toFixed(2) + "%", y: (g2 / t * 100 * Vr).toFixed(2) + "%", width: ((I - a) / e * 100 * Vr).toFixed(2) + "%", height: ((c2 - g2) / t * 100 * Vr).toFixed(2) + "%" }, o + (s ? M("feMerge", {}, s) : ""));
}
function js({ width: A, height: e, shape: t, opacity: r, id: n }, i) {
  if (!i.boxShadow)
    return null;
  let o = "", s = "";
  for (let a = i.boxShadow.length - 1; a >= 0; a--) {
    let I = "", g2 = i.boxShadow[a];
    g2.spreadRadius && g2.inset && (g2.spreadRadius = -g2.spreadRadius);
    let c2 = g2.blurRadius * g2.blurRadius / 4 + (g2.spreadRadius || 0), B = Math.min(-c2 - (g2.inset ? g2.offsetX : 0), 0), E = Math.max(c2 + A - (g2.inset ? g2.offsetX : 0), A), Q = Math.min(-c2 - (g2.inset ? g2.offsetY : 0), 0), d2 = Math.max(c2 + e - (g2.inset ? g2.offsetY : 0), e), m2 = `satori_s-${n}-${a}`, D = `satori_ms-${n}-${a}`, x2 = g2.spreadRadius ? t.replace('stroke-width="0"', `stroke-width="${g2.spreadRadius * 2}"`) : t;
    I += M("mask", { id: D, maskUnits: "userSpaceOnUse" }, M("rect", { x: 0, y: 0, width: i._viewportWidth || "100%", height: i._viewportHeight || "100%", fill: g2.inset ? "#000" : "#fff" }) + x2.replace('fill="#fff"', g2.inset ? 'fill="#fff"' : 'fill="#000"').replace('stroke="#fff"', ""));
    let y = x2.replace(/d="([^"]+)"/, (p, b) => 'd="' + fl2(b, g2.offsetX, g2.offsetY) + '"').replace(/x="([^"]+)"/, (p, b) => 'x="' + (parseFloat(b) + g2.offsetX) + '"').replace(/y="([^"]+)"/, (p, b) => 'y="' + (parseFloat(b) + g2.offsetY) + '"');
    g2.spreadRadius && g2.spreadRadius < 0 && (I += M("mask", { id: D + "-neg", maskUnits: "userSpaceOnUse" }, y.replace('stroke="#fff"', 'stroke="#000"').replace(/stroke-width="[^"]+"/, `stroke-width="${-g2.spreadRadius * 2}"`))), g2.spreadRadius && g2.spreadRadius < 0 && (y = M("g", { mask: `url(#${D}-neg)` }, y)), I += M("defs", {}, M("filter", { id: m2, x: `${B / A * 100}%`, y: `${Q / e * 100}%`, width: `${(E - B) / A * 100}%`, height: `${(d2 - Q) / e * 100}%` }, M("feGaussianBlur", { stdDeviation: g2.blurRadius / 2, result: "b" }) + M("feFlood", { "flood-color": g2.color, in: "SourceGraphic", result: "f" }) + M("feComposite", { in: "f", in2: "b", operator: g2.inset ? "out" : "in" }))) + M("g", { mask: `url(#${D})`, filter: `url(#${m2})`, opacity: r }, y), g2.inset ? s += I : o += I;
  }
  return [o, s];
}
function Ql(A, e, t, r, n, i) {
  let o = n / 2, s = Math.max(o, n * 1.25), a = [];
  for (let c2 of t) {
    if (c2.y2 < i + o || c2.y1 > r + o)
      continue;
    let B = Math.max(A, c2.x1 - s), E = Math.min(e, c2.x2 + s);
    if (B >= E)
      continue;
    if (a.length === 0) {
      a.push([B, E]);
      continue;
    }
    let Q = a[a.length - 1];
    B <= Q[1] ? Q[1] = Math.max(Q[1], E) : a.push([B, E]);
  }
  if (!a.length)
    return [[A, e]];
  let I = [], g2 = A;
  for (let [c2, B] of a)
    if (c2 > g2 && I.push([g2, c2]), g2 = Math.max(g2, B), g2 >= e)
      break;
  return g2 < e && I.push([g2, e]), I;
}
function Xn({ width: A, left: e, top: t, ascender: r, clipPathId: n, matrix: i, glyphBoxes: o }, s) {
  let { textDecorationColor: a, textDecorationStyle: I, textDecorationLine: g2, textDecorationSkipInk: c2, fontSize: B, color: E } = s;
  if (!g2 || g2 === "none")
    return "";
  let Q = Math.max(1, B * 0.1), d2 = g2 === "line-through" ? t + r * 0.7 : g2 === "underline" ? t + r * 1.1 : t, m2 = I === "dashed" ? `${Q * 1.2} ${Q * 2}` : I === "dotted" ? `0 ${Q * 2}` : void 0, D = g2 === "underline" && (c2 || "auto") !== "none" && (o == null ? void 0 : o.length), x2 = t + r, y = D ? Ql(e, e + A, o, d2, Q, x2) : [[e, e + A]], p = I === "double" ? y.map(([b, R2]) => M("line", { x1: b, y1: d2 + Q + 1, x2: R2, y2: d2 + Q + 1, stroke: a || E, "stroke-width": Q, "stroke-dasharray": m2, "stroke-linecap": I === "dotted" ? "round" : "square", transform: i })).join("") : "";
  return (n ? `<g clip-path="url(#${n})">` : "") + y.map(([b, R2]) => M("line", { x1: b, y1: d2, x2: R2, y2: d2, stroke: a || E, "stroke-width": Q, "stroke-dasharray": m2, "stroke-linecap": I === "dotted" ? "round" : "square", transform: i })).join("") + p + (n ? "</g>" : "");
}
function Vn(A) {
  return A = A.replace("U+", "0x"), String.fromCodePoint(Number(A));
}
var nt = Vn("U+0020");
var zn = Vn("U+0009");
var pt = Vn("U+2026");
function $s(A, e, t) {
  let { fontSize: r, letterSpacing: n } = t, i = /* @__PURE__ */ new Map();
  function o(I) {
    let g2 = i.get(I);
    return g2 === void 0 && (g2 = A.measure(I, { fontSize: r, letterSpacing: n }), i.set(I, g2)), g2;
  }
  function s(I) {
    let g2 = 0;
    for (let c2 of I)
      e(c2) ? g2 += r : g2 += o(c2);
    return g2;
  }
  function a(I) {
    return s(WA(I, "grapheme"));
  }
  return { measureGrapheme: o, measureGraphemeArray: s, measureText: a };
}
function Aa(A, e, t) {
  let { textTransform: r, whiteSpace: n, wordBreak: i } = e;
  A = Cl(A, r, t);
  let { content: o, shouldCollapseTabsAndSpaces: s, allowSoftWrap: a } = pl(A, n), { words: I, requiredBreaks: g2, allowBreakWord: c2 } = hl(o, i), [B, E] = dl(e, a);
  return { words: I, requiredBreaks: g2, allowSoftWrap: a, allowBreakWord: c2, processedContent: o, shouldCollapseTabsAndSpaces: s, lineLimit: B, blockEllipsis: E };
}
function Cl(A, e, t) {
  return e === "uppercase" ? A = A.toLocaleUpperCase(t) : e === "lowercase" ? A = A.toLocaleLowerCase(t) : e === "capitalize" && (A = WA(A, "word", t).map((r) => WA(r, "grapheme", t).map((n, i) => i === 0 ? n.toLocaleUpperCase(t) : n).join("")).join("")), A;
}
function dl(A, e) {
  let { textOverflow: t, lineClamp: r, WebkitLineClamp: n, WebkitBoxOrient: i, overflow: o, display: s } = A;
  if (s === "block" && r) {
    let [a, I = pt] = ml(r);
    if (a)
      return [a, I];
  }
  return t === "ellipsis" && s === "-webkit-box" && i === "vertical" && Es(n) && n > 0 ? [n, pt] : t === "ellipsis" && o === "hidden" && !e ? [1, pt] : [1 / 0];
}
function hl(A, e) {
  let t = ["break-all", "break-word"].includes(e), { words: r, requiredBreaks: n } = Qs(A, e);
  return { words: r, requiredBreaks: n, allowBreakWord: t };
}
function pl(A, e) {
  let t = ["pre", "pre-wrap", "pre-line"].includes(e), r = ["normal", "nowrap", "pre-line"].includes(e), n = !["pre", "nowrap"].includes(e);
  return t || (A = A.replace(/\n/g, nt)), r && (A = A.replace(/([ ]|\t)+/g, nt).replace(/^[ ]|[ ]$/g, "")), { content: A, shouldCollapseTabsAndSpaces: r, allowSoftWrap: n };
}
function ml(A) {
  if (typeof A == "number")
    return [A];
  let e = /^(\d+)\s*"(.*)"$/, t = /^(\d+)\s*'(.*)'$/, r = e.exec(A), n = t.exec(A);
  if (r) {
    let i = +r[1], o = r[2];
    return [i, o];
  } else if (n) {
    let i = +n[1], o = n[2];
    return [i, o];
  }
  return [];
}
var yl = /* @__PURE__ */ new Set([zn]);
function wl(A) {
  return yl.has(A);
}
function Zn(A) {
  if (A === "transparent")
    return true;
  let e = index_esm_default(A);
  return e ? e.alpha === 0 : false;
}
function ea(A) {
  if (!A)
    return false;
  let e = index_esm_default(A);
  if (!e)
    return false;
  let [t, r, n, i] = e.values;
  return t === 255 && r === 255 && n === 255 && (i === void 0 || i === 1);
}
async function* jn(A, e) {
  let t = await Ye(), { parentStyle: r, inheritedStyle: n, parent: i, font: o, id: s, isInheritingTransform: a, debug: I, embedFont: g2, graphemeImages: c2, locale: B, canLoadAdditionalAssets: E } = e, { textAlign: Q, textIndent: d2 = 0, lineHeight: m2, textWrap: D, fontSize: x2, filter: y, tabSize: p = 8, letterSpacing: b, _inheritedBackgroundClipTextPath: R2, _inheritedBackgroundClipTextHasBackground: U, flexShrink: P2 } = r, { words: q, requiredBreaks: lA, allowSoftWrap: DA, allowBreakWord: RA, processedContent: eA, shouldCollapseTabsAndSpaces: NA, lineLimit: nA, blockEllipsis: $ } = Aa(A, r, B), HA = Dl(t, Q);
  i.insertChild(HA, i.getChildCount()), fs(P2) && i.setFlexShrink(1);
  let tA = o.getEngine(x2, m2, r, B), bA = E ? WA(eA, "grapheme").filter((Y) => !wl(Y) && !tA.has(Y)) : [];
  yield bA.map((Y) => ({ word: Y, locale: B })), bA.length && (tA = o.getEngine(x2, m2, r, B));
  function mA(Y) {
    return !!(c2 && Object.prototype.hasOwnProperty.call(c2, Y) && c2[Y]);
  }
  let { measureGrapheme: te, measureGraphemeArray: FA, measureText: kA } = $s(tA, mA, { fontSize: x2, letterSpacing: b }), xA = Hr(p) ? X(p, x2, 1, r) : te(nt) * p, J = (Y, z) => {
    if (Y.length === 0)
      return { originWidth: 0, endingSpacesWidth: 0, text: Y };
    let { index: Z, tabCount: j } = Sl(Y), gA = 0;
    if (j > 0) {
      let CA = Y.slice(0, Z), IA = Y.slice(Z + j), AA = kA(CA), ie = AA + z;
      gA = (xA === 0 ? AA : (Math.floor(ie / xA) + j) * xA) + kA(IA);
    } else
      gA = kA(Y);
    let iA = Y.trimEnd() === Y ? gA : kA(Y.trimEnd());
    return { originWidth: gA, endingSpacesWidth: gA - iA, text: Y };
  }, rA = [], fA = [], QA = [], K2 = [], MA = [];
  function GA(Y) {
    let z = 0, Z = 0, j = -1, gA = 0, iA = 0, CA = 0, IA = 0;
    rA = [], QA = [0], K2 = [], MA = [];
    let AA = 0, ie = 0;
    for (; AA < q.length && z < nA; ) {
      let V = q[AA], Se = lA[AA], yA = 0, { originWidth: kt, endingSpacesWidth: oe, text: PA } = J(V, iA);
      V = PA, yA = kt;
      let XA = oe;
      Se && CA === 0 && (CA = tA.height(V));
      let be = Q === "justify", dA = AA && iA + yA > Y + XA && DA;
      if (RA && yA > Y && (!iA || dA || Se)) {
        let JA = WA(V, "grapheme");
        q.splice(AA, 1, ...JA), iA > 0 && (rA.push(iA - ie), fA.push(IA), z++, gA += CA, iA = 0, CA = 0, IA = 0, QA.push(1), j = -1), ie = XA;
        continue;
      }
      if (Se || dA)
        NA && V === nt && (yA = 0), rA.push(iA - ie), fA.push(IA), z++, gA += CA, iA = yA, CA = yA ? Math.round(tA.height(V)) : 0, IA = yA ? Math.round(tA.baseline(V)) : 0, QA.push(1), j = -1, Se || (Z = Math.max(Z, Y));
      else {
        iA += yA;
        let JA = Math.round(tA.height(V));
        JA > CA && (CA = JA, IA = Math.round(tA.baseline(V))), be && QA[QA.length - 1]++;
      }
      be && j++, Z = Math.max(Z, iA);
      let Ae = iA - yA;
      if (yA === 0)
        MA.push({ y: gA, x: Ae, width: 0, line: z, lineIndex: j, isImage: false });
      else {
        let JA = WA(V, "word");
        for (let Qe = 0; Qe < JA.length; Qe++) {
          let Ce = JA[Qe], KA = 0, se = false;
          mA(Ce) ? (KA = x2, se = true) : !g2 && Ce.length > 1 ? KA = kA(Ce) : KA = te(Ce), K2.push(Ce), MA.push({ y: gA, x: Ae, width: KA, line: z, lineIndex: j, isImage: se }), Ae += KA;
        }
      }
      AA++, ie = XA;
    }
    return iA && (z < nA && (gA += CA), z++, rA.push(iA), fA.push(IA)), { width: Z, height: gA };
  }
  let OA = { width: 0, height: 0 };
  HA.setMeasureFunc((Y) => {
    let { width: z, height: Z } = GA(Y);
    if (D === "balance") {
      let gA = z / 2, iA = z, CA = z;
      for (; gA + 1 < iA; ) {
        CA = (gA + iA) / 2;
        let { height: AA } = GA(CA);
        AA > Z ? gA = CA : iA = CA;
      }
      GA(iA);
      let IA = Math.ceil(iA);
      return OA = { width: IA, height: Z }, { width: IA, height: Z };
    }
    if (D === "pretty" && rA[rA.length - 1] < z / 3) {
      let CA = z * 0.9, IA = GA(CA);
      if (IA.height <= Z * 1.3)
        return OA = { width: z, height: IA.height }, { width: z, height: IA.height };
    }
    let j = Math.ceil(z);
    return OA = { width: j, height: Z }, { width: j, height: Z };
  });
  let [TA, SA] = yield, ye = "", Je = "", qA = n._inheritedClipPathId, re = n._inheritedMaskId, { left: ut, top: we, width: $e, height: br } = HA.getComputedLayout(), At = typeof d2 == "string" ? X(d2, x2, $e, r, true) || 0 : d2, Ke = i.getComputedWidth() - i.getComputedPadding(t.EDGE_LEFT) - i.getComputedPadding(t.EDGE_RIGHT) - i.getComputedBorder(t.EDGE_LEFT) - i.getComputedBorder(t.EDGE_RIGHT), De = TA + ut, Be = SA + we, { matrix: jA, opacity: lt } = zs({ left: ut, top: we, width: $e, height: br, isInheritingTransform: a }, r), ne = "";
  if (r.textShadowOffset) {
    let { textShadowColor: Y, textShadowOffset: z, textShadowRadius: Z } = r;
    ne = Zs({ width: OA.width, height: OA.height, id: s }, { shadowColor: Y, shadowOffset: z, shadowRadius: Z }, Zn(r.color) || U && ea(r.color)), ne = M("defs", {}, ne);
  }
  let Ee = "", Ne = "", Fe = "", Me = -1, $A = {}, fe = {}, _A = null, et2 = 0;
  for (let Y = 0; Y < K2.length; Y++) {
    let z = MA[Y], Z = MA[Y + 1];
    if (!z)
      continue;
    let j = K2[Y], gA = null, iA = false, CA = c2 && Object.prototype.hasOwnProperty.call(c2, j) ? c2[j] : null, IA = z.y, AA = z.x, ie = z.width, V = z.line, Se = r.textDecorationLine === "underline" && (r.textDecorationSkipInk || "auto") !== "none";
    if (V === Me)
      continue;
    let yA = false;
    if (V === 0 && At !== 0 && (AA += At), rA.length > 1) {
      let dA = $e - rA[V];
      if (Q === "right" || Q === "end")
        AA += dA;
      else if (Q === "center")
        AA += dA / 2;
      else if (Q === "justify" && V < rA.length - 1) {
        let wA = QA[V], Ae = wA > 1 ? dA / (wA - 1) : 0;
        AA += Ae * z.lineIndex, yA = true;
      }
      g2 && (AA = Math.round(AA));
    }
    let kt = fA[V], oe = tA.baseline(j), PA = tA.height(j), XA = kt - oe, be = (dA) => !Se || r.textDecorationLine !== "underline" ? void 0 : { underlineY: Be + dA + XA + oe + oe * 0.1, strokeWidth: Math.max(1, x2 * 0.1) };
    if ($A[V] || ($A[V] = { left: AA, top: Be + IA + XA, ascender: oe, width: yA ? $e : rA[V] }), nA !== 1 / 0) {
      let Ce = function(KA, se) {
        let xt = WA(se, "grapheme", B), ct = "", kr = 0;
        for (let xr of xt) {
          let Rr = KA + FA([ct + xr]);
          if (ct && Rr + wA > Ke)
            break;
          ct += xr, kr = Rr;
        }
        return { subset: ct, resolvedWidth: kr };
      }, dA = $, wA = te($);
      wA > Ke && (dA = pt, wA = te(dA));
      let Ae = te(nt), JA = V < rA.length - 1;
      if (V + 1 === nA && (JA || rA[V] > Ke)) {
        if (AA + ie + wA + Ae > Ke) {
          let { subset: KA, resolvedWidth: se } = Ce(AA, j);
          j = KA + dA, Me = V, $A[V].width = Math.max(0, se - $A[V].left), iA = true;
        } else if (Z && Z.line !== V)
          if (Q === "center") {
            let { subset: KA, resolvedWidth: se } = Ce(AA, j);
            j = KA + dA, Me = V, $A[V].width = Math.max(0, se - $A[V].left), iA = true;
          } else {
            let KA = K2[Y + 1], { subset: se, resolvedWidth: xt } = Ce(ie + AA, KA);
            j = j + se + dA, Me = V, $A[V].width = Math.max(0, xt - $A[V].left), iA = true;
          }
      }
    }
    if (CA)
      IA += 0;
    else if (g2) {
      if (!j.includes(zn) && !cs.includes(j) && K2[Y + 1] && Z && !Z.isImage && IA === Z.y && !iA) {
        _A === null && (et2 = AA), _A = _A === null ? j : _A + j;
        continue;
      }
      let dA = _A === null ? j : _A + j, wA = _A === null ? AA : et2, Ae = z.width + AA - wA, JA = be(IA), Qe = tA.getSVG(dA.replace(/(\t)+/g, ""), { fontSize: x2, left: De + wA, top: Be + IA + oe + XA, letterSpacing: b }, JA);
      gA = Qe.path, Se && Qe.boxes && Qe.boxes.length && (fe[V] || (fe[V] = [])).push(...Qe.boxes), _A = null, I && (Fe += M("rect", { x: De + wA, y: Be + IA + XA, width: Ae, height: PA, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: jA || void 0, "clip-path": qA ? `url(#${qA})` : void 0 }) + M("line", { x1: De + AA, x2: De + AA + z.width, y1: Be + IA + XA + oe, y2: Be + IA + XA + oe, stroke: "#14c000", "stroke-width": 1, transform: jA || void 0, "clip-path": qA ? `url(#${qA})` : void 0 }));
    } else if (IA += oe + XA, Se && !CA) {
      let dA = be(IA), wA = tA.getSVG(j.replace(/(\t)+/g, ""), { fontSize: x2, left: De + AA, top: Be + IA, letterSpacing: b }, dA);
      wA.boxes && wA.boxes.length && (fe[V] || (fe[V] = [])).push(...wA.boxes);
    }
    if (gA !== null)
      Ne += gA + " ";
    else {
      let [dA, wA] = qn({ content: j, filter: ne, id: s, left: De + AA, top: Be + IA, width: ie, height: PA, matrix: jA, opacity: lt, image: CA, clipPathId: qA, debug: I, shape: !!R2 }, r);
      ye += dA, Je += wA;
    }
    if (iA)
      break;
  }
  if (r.textDecorationLine && (Ee = Object.entries($A).map(([Y, z]) => {
    if (!z)
      return "";
    let Z = fe[Y] || [];
    return Xn({ left: De + z.left, top: z.top, width: z.width, ascender: z.ascender, clipPathId: qA, matrix: jA, glyphBoxes: Z }, r);
  }).join("")), Ne) {
    let Y = (!Zn(r.color) || ne) && lt !== 0 ? `<g ${re ? `mask="url(#${re})"` : ""} ${qA ? `clip-path="url(#${qA})"` : ""}>` + M("path", { fill: ne && (Zn(r.color) || U && ea(r.color)) ? "black" : r.color, d: Ne, transform: jA || void 0, opacity: lt !== 1 ? lt : void 0, style: y ? `filter:${y}` : void 0, "stroke-width": n.WebkitTextStrokeWidth ? `${n.WebkitTextStrokeWidth}px` : void 0, stroke: n.WebkitTextStrokeWidth ? n.WebkitTextStrokeColor : void 0, "stroke-linejoin": n.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": n.WebkitTextStrokeWidth ? "stroke" : void 0 }) + "</g>" : "";
    R2 && (Je = M("path", { d: Ne, transform: jA || void 0 })), ye += (ne ? ne + M("g", { filter: `url(#satori_s-${s})` }, Y + Ee) : Y + Ee) + Fe;
  } else
    Ee && (ye += ne ? M("g", { filter: `url(#satori_s-${s})` }, Ee) : Ee);
  return Je && (r._inheritedBackgroundClipTextPath.value += Je), ye;
}
function Dl(A, e) {
  let t = A.Node.create();
  return t.setAlignItems(A.ALIGN_BASELINE), t.setJustifyContent(YA(e, { left: A.JUSTIFY_FLEX_START, right: A.JUSTIFY_FLEX_END, center: A.JUSTIFY_CENTER, justify: A.JUSTIFY_SPACE_BETWEEN, start: A.JUSTIFY_FLEX_START, end: A.JUSTIFY_FLEX_END }, A.JUSTIFY_FLEX_START, "textAlign")), t;
}
function Sl(A) {
  let e = /(\t)+/.exec(A);
  return e ? { index: e.index, tabCount: e[0].length } : { index: null, tabCount: 0 };
}
function zr(A, e, t, r, n) {
  let i = [], o = e.at(-1), s = o && o.offset && o.offset.unit === "%" && r ? +o.offset.value : 100;
  for (let c2 of e) {
    let { color: B } = c2;
    if (!i.length && (i.push({ offset: 0, color: B }), !c2.offset || c2.offset.value === "0"))
      continue;
    let E = typeof c2.offset > "u" ? void 0 : c2.offset.unit === "%" ? +c2.offset.value / s : Number(X(`${c2.offset.value}${c2.offset.unit}`, t.fontSize, A, t, true)) / A;
    i.push({ offset: E, color: B });
  }
  i.length || i.push({ offset: 0, color: "transparent" });
  let a = i[i.length - 1];
  a.offset !== 1 && (typeof a.offset > "u" ? a.offset = 1 : r ? i[i.length - 1] = { offset: 1, color: a.color } : i.push({ offset: 1, color: a.color }));
  let I = 0, g2 = 1;
  for (let c2 = 0; c2 < i.length; c2++)
    if (typeof i[c2].offset > "u") {
      for (g2 < c2 && (g2 = c2); typeof i[g2].offset > "u"; )
        g2++;
      i[c2].offset = (i[g2].offset - i[I].offset) / (g2 - I) * (c2 - I) + i[I].offset;
    } else
      I = c2;
  return n === "mask" ? i.map((c2) => {
    let B = index_esm_default(c2.color);
    return B ? B.alpha === 0 ? { ...c2, color: "rgba(0, 0, 0, 1)" } : { ...c2, color: `rgba(255, 255, 255, ${B.alpha})` } : c2;
  }) : i;
}
function ra({ id: A, width: e, height: t, repeatX: r, repeatY: n }, i, o, s, a, I) {
  let g2 = P(i), [c2, B] = o, E = i.startsWith("repeating"), Q, d2, m2;
  if (g2.orientation.type === "directional")
    Q = Rl(g2.orientation.value), d2 = Math.sqrt(Math.pow((Q.x2 - Q.x1) * c2, 2) + Math.pow((Q.y2 - Q.y1) * B, 2));
  else if (g2.orientation.type === "angular") {
    let { length: b, ...R2 } = vl(vn(`${g2.orientation.value.value}${g2.orientation.value.unit}`) / 180 * Math.PI, c2, B);
    d2 = b, Q = R2;
  }
  m2 = E ? Nl(g2.stops, d2, Q, a) : Q;
  let D = zr(E ? xl(g2.stops, d2) : d2, g2.stops, a, E, I), x2 = `satori_bi${A}`, y = `satori_pattern_${A}`, p = M("pattern", { id: y, x: s[0] / e, y: s[1] / t, width: r ? c2 / e : "1", height: n ? B / t : "1", patternUnits: "objectBoundingBox" }, M("linearGradient", { id: x2, ...m2, spreadMethod: E ? "repeat" : "pad" }, D.map((b) => M("stop", { offset: (b.offset ?? 0) * 100 + "%", "stop-color": b.color })).join("")) + M("rect", { x: 0, y: 0, width: c2, height: B, fill: `url(#${x2})` }));
  return [y, p];
}
function xl(A, e) {
  let t = A[A.length - 1], { offset: r } = t;
  return r ? r.unit === "%" ? Number(r.value) / 100 * e : Number(r.value) : e;
}
function Rl(A) {
  let e = 0, t = 0, r = 0, n = 0;
  return A.includes("top") ? t = 1 : A.includes("bottom") && (n = 1), A.includes("left") ? e = 1 : A.includes("right") && (r = 1), !e && !r && !t && !n && (t = 1), { x1: e, y1: t, x2: r, y2: n };
}
function vl(A, e, t) {
  let r = Math.pow(t / e, 2);
  A = (A % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let n, i, o, s, a, I, g2, c2, B = (E) => {
    if (E === 0) {
      n = 0, i = t, o = 0, s = 0, a = t;
      return;
    } else if (E === Math.PI / 2) {
      n = 0, i = 0, o = e, s = 0, a = e;
      return;
    }
    if (E > 0 && E < Math.PI / 2) {
      n = (r * e / 2 / Math.tan(E) - t / 2) / (Math.tan(E) + r / Math.tan(E)), i = Math.tan(E) * n + t, o = Math.abs(e / 2 - n) + e / 2, s = t / 2 - Math.abs(i - t / 2), a = Math.sqrt(Math.pow(o - n, 2) + Math.pow(s - i, 2)), g2 = (e / 2 / Math.tan(E) - t / 2) / (Math.tan(E) + 1 / Math.tan(E)), c2 = Math.tan(E) * g2 + t, a = 2 * Math.sqrt(Math.pow(e / 2 - g2, 2) + Math.pow(t / 2 - c2, 2));
      return;
    } else if (E > Math.PI / 2 && E < Math.PI) {
      n = (t / 2 + r * e / 2 / Math.tan(E)) / (Math.tan(E) + r / Math.tan(E)), i = Math.tan(E) * n, o = Math.abs(e / 2 - n) + e / 2, s = t / 2 + Math.abs(i - t / 2), g2 = (e / 2 / Math.tan(E) + t / 2) / (Math.tan(E) + 1 / Math.tan(E)), c2 = Math.tan(E) * g2, a = 2 * Math.sqrt(Math.pow(e / 2 - g2, 2) + Math.pow(t / 2 - c2, 2));
      return;
    } else
      E >= Math.PI && (B(E - Math.PI), I = n, n = o, o = I, I = i, i = s, s = I);
  };
  return B(A), { x1: n / e, y1: i / t, x2: o / e, y2: s / t, length: a };
}
function Nl(A, e, t, r) {
  let { x1: n, x2: i, y1: o, y2: s } = t, a = A[0].offset ? A[0].offset.unit === "%" ? Number(A[0].offset.value) / 100 : X(`${A[0].offset.value}${A[0].offset.unit}`, r.fontSize, e, r, true) / e : 0, I = A.at(-1).offset ? A.at(-1).offset.unit === "%" ? Number(A.at(-1).offset.value) / 100 : X(`${A.at(-1).offset.value}${A.at(-1).offset.unit}`, r.fontSize, e, r, true) / e : 1, g2 = (i - n) * a + n, c2 = (s - o) * a + o, B = (i - n) * I + n, E = (s - o) * I + o;
  return { x1: g2, y1: c2, x2: B, y2: E };
}
function ia({ id: A, width: e, height: t, repeatX: r, repeatY: n }, i, o, s, a, I) {
  var eA;
  let { shape: g2, stops: c2, position: B, size: E, repeating: Q } = K(i), [d2, m2] = o, D = d2 / 2, x2 = m2 / 2, y = Ll(B.x, B.y, d2, m2, a.fontSize, a);
  D = y.x, x2 = y.y;
  let p = Ml(e, c2, Q, a), b = zr(p, c2, a, Q, I), R2 = `satori_radial_${A}`, U = `satori_pattern_${A}`, P2 = `satori_mask_${A}`, q = Ul(g2, E, a.fontSize, { x: D, y: x2 }, [d2, m2], a, Q), lA = Gl(g2, a.fontSize, c2, [d2, m2], a, Q, q), DA = M("pattern", { id: U, x: s[0] / e, y: s[1] / t, width: r ? d2 / e : "1", height: n ? m2 / t : "1", patternUnits: "objectBoundingBox" }, M("radialGradient", { id: R2, ...lA }, b.map((NA) => M("stop", { offset: NA.offset || 0, "stop-color": NA.color })).join("")) + M("mask", { id: P2 }, M("rect", { x: 0, y: 0, width: d2, height: m2, fill: "#fff" })) + M("rect", { x: 0, y: 0, width: d2, height: m2, fill: ((eA = b.at(-1)) == null ? void 0 : eA.color) || "transparent" }) + M(g2, { cx: D, cy: x2, width: d2, height: m2, ...q, fill: `url(#${R2})`, mask: `url(#${P2})` }));
  return [U, DA];
}
function Ml(A, e, t, r) {
  if (!t)
    return A;
  let n = e.at(-1);
  return !n || !n.offset || n.offset.unit === "%" ? A : X(`${n.offset.value}${n.offset.unit}`, +r.fontSize, A, r, true);
}
function Ll(A, e, t, r, n, i) {
  let o = { x: t / 2, y: r / 2 };
  return A.type === "keyword" ? Object.assign(o, na(A.value, t, r, "x")) : o.x = X(`${A.value.value}${A.value.unit}`, n, t, i, true) ?? t / 2, e.type === "keyword" ? Object.assign(o, na(e.value, t, r, "y")) : o.y = X(`${e.value.value}${e.value.unit}`, n, r, i, true) ?? r / 2, o;
}
function na(A, e, t, r) {
  switch (A) {
    case "center":
      return { [r]: r === "x" ? e / 2 : t / 2 };
    case "left":
      return { x: 0 };
    case "top":
      return { y: 0 };
    case "right":
      return { x: e };
    case "bottom":
      return { y: t };
  }
}
function Gl(A, e, t, [r, n], i, o, s) {
  let { r: a, rx: I, ratio: g2 = 1 } = s;
  if (!o)
    return { spreadMethod: "pad" };
  let c2 = t.at(-1), B = A === "circle" ? a * 2 : I * 2;
  return { spreadMethod: "repeat", cx: "50%", cy: "50%", r: c2.offset.unit === "%" ? `${Number(c2.offset.value) * Math.min(n / r, 1) / g2}%` : Number(X(`${c2.offset.value}${c2.offset.unit}`, e, r, i, true) / B) };
}
function Ul(A, e, t, r, n, i, o) {
  let [s, a] = n, { x: I, y: g2 } = r, c2 = {}, B = 0, E = 0;
  if (Hl(e)) {
    if (e.some((Q) => Q.value.value.startsWith("-")))
      throw new Error("disallow setting negative values to the size of the shape. Check https://w3c.github.io/csswg-drafts/css-images/#valdef-rg-size-length-0");
    return A === "circle" ? Object.assign(c2, { r: Number(X(`${e[0].value.value}${e[0].value.unit}`, t, s, i, true)) }) : Object.assign(c2, { rx: Number(X(`${e[0].value.value}${e[0].value.unit}`, t, s, i, true)), ry: Number(X(`${e[1].value.value}${e[1].value.unit}`, t, a, i, true)) }), Zr(c2, s, a, I, g2, o, A), c2;
  }
  switch (e[0].value) {
    case "farthest-corner":
      B = Math.max(Math.abs(s - I), Math.abs(I)), E = Math.max(Math.abs(a - g2), Math.abs(g2));
      break;
    case "closest-corner":
      B = Math.min(Math.abs(s - I), Math.abs(I)), E = Math.min(Math.abs(a - g2), Math.abs(g2));
      break;
    case "farthest-side":
      return A === "circle" ? c2.r = Math.max(Math.abs(s - I), Math.abs(I), Math.abs(a - g2), Math.abs(g2)) : (c2.rx = Math.max(Math.abs(s - I), Math.abs(I)), c2.ry = Math.max(Math.abs(a - g2), Math.abs(g2))), Zr(c2, s, a, I, g2, o, A), c2;
    case "closest-side":
      return A === "circle" ? c2.r = Math.min(Math.abs(s - I), Math.abs(I), Math.abs(a - g2), Math.abs(g2)) : (c2.rx = Math.min(Math.abs(s - I), Math.abs(I)), c2.ry = Math.min(Math.abs(a - g2), Math.abs(g2))), Zr(c2, s, a, I, g2, o, A), c2;
  }
  return A === "circle" ? c2.r = Math.sqrt(B * B + E * E) : Object.assign(c2, oa(B, E)), Zr(c2, s, a, I, g2, o, A), c2;
}
function Zr(A, e, t, r, n, i, o) {
  if (i)
    if (o === "ellipse") {
      let s = Math.max(Math.abs(e - r), Math.abs(r)), a = Math.max(Math.abs(t - n), Math.abs(n)), { rx: I, ry: g2 } = oa(s, a);
      A.ratio = Math.max(I / A.rx, g2 / A.ry), A.ratio > 1 && (A.rx *= A.ratio, A.ry *= A.ratio);
    } else {
      let s = Math.max(Math.abs(e - r), Math.abs(r)), a = Math.max(Math.abs(t - n), Math.abs(n)), I = Math.sqrt(s * s + a * a);
      A.ratio = I / A.r, A.ratio > 1 && (A.r = I);
    }
}
function oa(A, e) {
  let t = e !== 0 ? A / e : 1;
  if (A === 0)
    return { rx: 0, ry: 0 };
  {
    let r = Math.sqrt(A * A + e * e * t * t) / t;
    return { ry: r, rx: r * t };
  }
}
function Hl(A) {
  return !A.some((e) => e.type === "keyword");
}
function Ai(A, e) {
  return typeof A == "string" && A.endsWith("%") ? e * parseFloat(A) / 100 : +A;
}
function Ol(A, e, t, r, n) {
  if (!r || !n)
    return [e, t];
  if (A === "cover") {
    let i = e / r, o = t / n, s = Math.max(i, o);
    return [r * s, n * s];
  }
  if (A === "contain") {
    let i = e / r, o = t / n, s = Math.min(i, o);
    return [r * s, n * s];
  }
  if (A === "auto" || A.includes("auto")) {
    let i = A.split(" "), o = i[0] || "auto", s = i[1] || i[0] || "auto", a = r, I = n;
    if (o === "auto" && s !== "auto") {
      let g2 = Ai(s, t);
      I = g2, a = r / n * g2;
    } else if (s === "auto" && o !== "auto") {
      let g2 = Ai(o, e);
      a = g2, I = n / r * g2;
    }
    return [a, I];
  }
  return [e, t];
}
function $n(A, { x: e, y: t, defaultX: r, defaultY: n }) {
  return (A ? A.split(" ").map((i) => {
    try {
      let o = new he(i);
      return o.type === "length" || o.type === "number" ? o.value : o.value + o.unit;
    } catch {
      return null;
    }
  }).filter((i) => i !== null) : [r, n]).map((i, o) => Ai(i, [e, t][o]));
}
async function Ot({ id: A, width: e, height: t, left: r, top: n }, { image: i, size: o, position: s, repeat: a }, I, g2) {
  a = a || "repeat", g2 = g2 || "background";
  let c2 = a === "repeat-x" || a === "repeat", B = a === "repeat-y" || a === "repeat", E = o && (o === "cover" || o === "contain" || o === "auto" || o.includes("auto")), Q = i.startsWith("linear-gradient(") || i.startsWith("repeating-linear-gradient(") || i.startsWith("radial-gradient(") || i.startsWith("repeating-radial-gradient("), d2 = E && Q ? [e, t] : E ? [0, 0] : $n(o, { x: e, y: t, defaultX: e, defaultY: t }), m2 = $n(s, { x: e, y: t, defaultX: 0, defaultY: 0 });
  if (i.startsWith("linear-gradient(") || i.startsWith("repeating-linear-gradient("))
    return ra({ id: A, width: e, height: t, repeatX: c2, repeatY: B }, i, d2, m2, I, g2);
  if (i.startsWith("radial-gradient(") || i.startsWith("repeating-radial-gradient("))
    return ia({ id: A, width: e, height: t, repeatX: c2, repeatY: B }, i, d2, m2, I, g2);
  if (i.startsWith("url(")) {
    let [D, x2, y] = await ht(i.slice(4, -1)), p, b;
    if (E) {
      let [R2, U] = Ol(o, e, t, x2, y);
      p = R2, b = U;
    } else {
      let R2 = $n(o, { x: e, y: t, defaultX: 0, defaultY: 0 });
      p = g2 === "mask" ? x2 || R2[0] : R2[0] || x2, b = g2 === "mask" ? y || R2[1] : R2[1] || y;
    }
    return [`satori_bi${A}`, M("pattern", { id: `satori_bi${A}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: m2[0] + r, y: m2[1] + n, width: c2 ? p : "100%", height: B ? b : "100%" }, M("image", { x: 0, y: 0, width: p, height: b, preserveAspectRatio: "none", href: D }))];
  }
  if (index_esm_default(i)) {
    let D = index_esm_default(i), [x2, y, p, b] = D.values, U = `rgba(${x2},${y},${p},${b !== void 0 ? b : 1})`;
    return [`satori_bi${A}`, M("pattern", { id: `satori_bi${A}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: r, y: n, width: e, height: t }, M("rect", { x: 0, y: 0, width: e, height: t, fill: U }))];
  }
  throw new Error(`Invalid background image: "${i}"`);
}
function Tl([A, e]) {
  return Math.round(A * 1e3) === 0 && Math.round(e * 1e3) === 0 ? 0 : Math.round(A * e / Math.sqrt(A * A + e * e) * 1e3) / 1e3;
}
function jr(A, e, t) {
  return t < A + e && (t / 2 < A && t / 2 < e ? A = e = t / 2 : t / 2 < A ? A = t - e : t / 2 < e && (e = t - A)), [A, e];
}
function $r(A) {
  A[0] = A[1] = Math.min(A[0], A[1]);
}
function An(A, e, t, r, n) {
  if (typeof A == "string") {
    let i = A.split(" ").map((s) => s.trim()), o = !i[1] && !i[0].endsWith("%");
    return i[1] = i[1] || i[0], [o, [Math.min(X(i[0], r, e, n, true), e), Math.min(X(i[1], r, t, n, true), t)]];
  }
  return typeof A == "number" ? [true, [Math.min(A, e), Math.min(A, t)]] : [true, void 0];
}
var en = (A) => A && A[0] !== 0 && A[1] !== 0;
function aa({ id: A, borderRadiusPath: e, borderType: t, left: r, top: n, width: i, height: o }, s) {
  let a = `satori_brc-${A}`;
  return [M("clipPath", { id: a }, M(t, { x: r, y: n, width: i, height: o, d: e || void 0 })), a];
}
function Xe({ left: A, top: e, width: t, height: r }, n, i) {
  let { borderTopLeftRadius: o, borderTopRightRadius: s, borderBottomLeftRadius: a, borderBottomRightRadius: I, fontSize: g2 } = n, c2, B, E, Q;
  if ([c2, o] = An(o, t, r, g2, n), [B, s] = An(s, t, r, g2, n), [E, a] = An(a, t, r, g2, n), [Q, I] = An(I, t, r, g2, n), !i && !en(o) && !en(s) && !en(a) && !en(I))
    return "";
  o ||= [0, 0], s ||= [0, 0], a ||= [0, 0], I ||= [0, 0], [o[0], s[0]] = jr(o[0], s[0], t), [a[0], I[0]] = jr(a[0], I[0], t), [o[1], a[1]] = jr(o[1], a[1], r), [s[1], I[1]] = jr(s[1], I[1], r), c2 && $r(o), B && $r(s), E && $r(a), Q && $r(I);
  let d2 = [];
  d2[0] = [s, s], d2[1] = [I, [-I[0], I[1]]], d2[2] = [a, [-a[0], -a[1]]], d2[3] = [o, [o[0], -o[1]]];
  let m2 = `h${t - o[0] - s[0]} a${d2[0][0]} 0 0 1 ${d2[0][1]}`, D = `v${r - s[1] - I[1]} a${d2[1][0]} 0 0 1 ${d2[1][1]}`, x2 = `h${I[0] + a[0] - t} a${d2[2][0]} 0 0 1 ${d2[2][1]}`, y = `v${a[1] + o[1] - r} a${d2[3][0]} 0 0 1 ${d2[3][1]}`;
  if (i) {
    let b = function(RA) {
      let eA = Tl([o, s, I, a][RA]);
      return RA === 0 ? [[A + o[0] - eA, e + o[1] - eA], [A + o[0], e]] : RA === 1 ? [[A + t - s[0] + eA, e + s[1] - eA], [A + t, e + s[1]]] : RA === 2 ? [[A + t - I[0] + eA, e + r - I[1] + eA], [A + t - I[0], e + r]] : [[A + a[0] - eA, e + r - a[1] + eA], [A, e + r - a[1]]];
    }, p = i.indexOf(false);
    if (!i.includes(true))
      throw new Error("Invalid `partialSides`.");
    if (p === -1)
      p = 0;
    else
      for (; !i[p]; )
        p = (p + 1) % 4;
    let R2 = "", U = b(p), P2 = `M${U[0]} A${d2[(p + 3) % 4][0]} 0 0 1 ${U[1]}`, q = 0;
    for (; q < 4 && i[(p + q) % 4]; q++)
      R2 += P2 + " ", P2 = [m2, D, x2, y][(p + q) % 4];
    let lA = (p + q) % 4;
    R2 += P2.split(" ")[0];
    let DA = b(lA);
    return R2 += ` A${d2[(lA + 3) % 4][0]} 0 0 1 ${DA[0]}`, R2;
  }
  return `M${A + o[0]},${e} ${m2} ${D} ${x2} ${y}`;
}
function ga(A, e, t) {
  return t[A + "Width"] === t[e + "Width"] && t[A + "Style"] === t[e + "Style"] && t[A + "Color"] === t[e + "Color"];
}
function Ia({ id: A, currentClipPathId: e, borderPath: t, borderType: r, left: n, top: i, width: o, height: s }, a) {
  if (!(a.borderTopWidth || a.borderRightWidth || a.borderBottomWidth || a.borderLeftWidth))
    return null;
  let g2 = `satori_bc-${A}`;
  return [M("clipPath", { id: g2, "clip-path": e ? `url(#${e})` : void 0 }, M(r, { x: n, y: i, width: o, height: s, d: t || void 0 })), g2];
}
function Tt({ left: A, top: e, width: t, height: r, props: n, asContentMask: i, maskBorderOnly: o }, s) {
  let a = ["borderTop", "borderRight", "borderBottom", "borderLeft"];
  if (!i && !a.some((E) => s[E + "Width"]))
    return "";
  let I = "", g2 = 0;
  for (; g2 > 0 && ga(a[g2], a[(g2 + 3) % 4], s); )
    g2 = (g2 + 3) % 4;
  let c2 = [false, false, false, false], B = [];
  for (let E = 0; E < 4; E++) {
    let Q = (g2 + E) % 4, d2 = (g2 + E + 1) % 4, m2 = a[Q], D = a[d2];
    if (c2[Q] = true, B = [s[m2 + "Width"], s[m2 + "Style"], s[m2 + "Color"], m2], !ga(m2, D, s)) {
      let x2 = (B[0] || 0) + (i && !o && s[m2.replace("border", "padding")] || 0);
      x2 && (I += M("path", { width: t, height: r, ...n, fill: "none", stroke: i ? "#000" : B[2], "stroke-width": x2 * 2, "stroke-dasharray": !i && B[1] === "dashed" ? x2 * 2 + " " + x2 : void 0, d: Xe({ left: A, top: e, width: t, height: r }, s, c2) })), c2 = [false, false, false, false];
    }
  }
  if (c2.some(Boolean)) {
    let E = (B[0] || 0) + (i && !o && s[B[3].replace("border", "padding")] || 0);
    E && (I += M("path", { width: t, height: r, ...n, fill: "none", stroke: i ? "#000" : B[2], "stroke-width": E * 2, "stroke-dasharray": !i && B[1] === "dashed" ? E * 2 + " " + E : void 0, d: Xe({ left: A, top: e, width: t, height: r }, s, c2) }));
  }
  return I;
}
function ei({ id: A, left: e, top: t, width: r, height: n, matrix: i, borderOnly: o }, s) {
  let a = (s.borderLeftWidth || 0) + (o ? 0 : s.paddingLeft || 0), I = (s.borderTopWidth || 0) + (o ? 0 : s.paddingTop || 0), g2 = (s.borderRightWidth || 0) + (o ? 0 : s.paddingRight || 0), c2 = (s.borderBottomWidth || 0) + (o ? 0 : s.paddingBottom || 0), B = { x: e + a, y: t + I, width: r - a - g2, height: n - I - c2 };
  return M("mask", { id: A }, M("rect", { ...B, fill: "#fff", transform: s.overflow === "hidden" && s.transform && i ? i : void 0, mask: s._inheritedMaskId ? `url(#${s._inheritedMaskId})` : void 0 }) + Tt({ left: e, top: t, width: r, height: n, props: { transform: i || void 0 }, asContentMask: true, maskBorderOnly: o }, s));
}
var Pt = { circle: /circle\((.+)\)/, ellipse: /ellipse\((.+)\)/, path: /path\((.+)\)/, polygon: /polygon\((.+)\)/, inset: /inset\((.+)\)/ };
function Ba({ width: A, height: e }, t, r) {
  function n(I) {
    let g2 = I.match(Pt.circle);
    if (!g2)
      return null;
    let [, c2] = g2, [B, E = ""] = c2.split("at").map((m2) => m2.trim()), { x: Q, y: d2 } = ca(E, A, e);
    return { type: "circle", r: X(B, r.fontSize, Math.sqrt(Math.pow(A, 2) + Math.pow(e, 2)) / Math.sqrt(2), r, true), cx: X(Q, r.fontSize, A, r, true), cy: X(d2, r.fontSize, e, r, true) };
  }
  function i(I) {
    let g2 = I.match(Pt.ellipse);
    if (!g2)
      return null;
    let [, c2] = g2, [B, E = ""] = c2.split("at").map((x2) => x2.trim()), [Q, d2] = B.split(" "), { x: m2, y: D } = ca(E, A, e);
    return { type: "ellipse", rx: X(Q || "50%", r.fontSize, A, r, true), ry: X(d2 || "50%", r.fontSize, e, r, true), cx: X(m2, r.fontSize, A, r, true), cy: X(D, r.fontSize, e, r, true) };
  }
  function o(I) {
    let g2 = I.match(Pt.path);
    if (!g2)
      return null;
    let [c2, B] = la(g2[1]);
    return { type: "path", d: B, "fill-rule": c2 };
  }
  function s(I) {
    let g2 = I.match(Pt.polygon);
    if (!g2)
      return null;
    let [c2, B] = la(g2[1]);
    return { type: "polygon", "fill-rule": c2, points: B.split(",").map((E) => E.split(" ").map((Q, d2) => X(Q, r.fontSize, d2 === 0 ? A : e, r, true)).join(" ")).join(",") };
  }
  function a(I) {
    let g2 = I.match(Pt.inset);
    if (!g2)
      return null;
    let [c2, B] = (g2[1].includes("round") ? g2[1] : `${g2[1].trim()} round 0`).split("round"), E = (0, import_css_to_react_native3.getStylesForProperty)("borderRadius", B, true), Q = Object.values(E).map((p) => String(p)).map((p, b) => X(p, r.fontSize, b === 0 || b === 2 ? e : A, r, true) || 0), d2 = Object.values((0, import_css_to_react_native3.getStylesForProperty)("margin", c2, true)).map((p) => String(p)).map((p, b) => X(p, r.fontSize, b === 0 || b === 2 ? e : A, r, true) || 0), m2 = d2[3], D = d2[0], x2 = A - (d2[1] + d2[3]), y = e - (d2[0] + d2[2]);
    return Q.some((p) => p > 0) ? { type: "path", d: Xe({ left: m2, top: D, width: x2, height: y }, { ...t, ...E }) } : { type: "rect", x: m2, y: D, width: x2, height: y };
  }
  return { parseCircle: n, parseEllipse: i, parsePath: o, parsePolygon: s, parseInset: a };
}
function la(A) {
  let [, e = "nonzero", t] = A.replace(/('|")/g, "").match(/^(nonzero|evenodd)?,?(.+)/) || [];
  return [e, t];
}
function ca(A, e, t) {
  let r = A.split(" "), n = { x: r[0] || "50%", y: r[1] || "50%" };
  return r.forEach((i) => {
    i === "top" ? n.y = 0 : i === "bottom" ? n.y = t : i === "left" ? n.x = 0 : i === "right" ? n.x = e : i === "center" && (n.x = e / 2, n.y = t / 2);
  }), n;
}
function tn(A) {
  return `satori_cp-${A}`;
}
function Ea(A) {
  return `url(#${tn(A)})`;
}
function fa(A, e, t) {
  if (e.clipPath === "none")
    return "";
  let r = Ba(A, e, t), n = e.clipPath, i = { type: "" };
  for (let o of Object.keys(r))
    if (i = r[o](n), i)
      break;
  if (i) {
    let { type: o, ...s } = i;
    return M("clipPath", { id: tn(A.id), "clip-path": A.currentClipPath, transform: `translate(${A.left}, ${A.top})` }, M(o, s));
  }
  return "";
}
function ti({ left: A, top: e, width: t, height: r, path: n, matrix: i, id: o, currentClipPath: s, src: a }, I, g2) {
  let c2 = "", B = I.clipPath && I.clipPath !== "none" ? fa({ left: A, top: e, width: t, height: r, path: n, id: o, matrix: i, currentClipPath: s, src: a }, I, g2) : "";
  if (I.overflow !== "hidden" && !a)
    c2 = "";
  else {
    let Q = B ? `satori_ocp-${o}` : tn(o);
    c2 = M("clipPath", { id: Q, "clip-path": s }, M(n ? "path" : "rect", { x: A, y: e, width: t, height: r, d: n || void 0, transform: I.overflow === "hidden" && I.transform && i ? i : void 0 }));
  }
  let E = ei({ id: `satori_om-${o}`, left: A, top: e, width: t, height: r, matrix: i, borderOnly: !a }, I);
  return B + c2 + E;
}
var Pl = (A) => `satori_mi-${A}`;
async function ri(A, e, t) {
  if (!e.maskImage)
    return ["", ""];
  let { left: r, top: n, width: i, height: o, id: s } = A, a = e.maskImage, I = a.length;
  if (!I)
    return ["", ""];
  let g2 = Pl(s), c2 = "";
  for (let B = 0; B < I; B++) {
    let E = a[B], [Q, d2] = await Ot({ id: `${g2}-${B}`, left: r, top: n, width: i, height: o }, E, t, "mask");
    c2 += d2 + M("rect", { x: r, y: n, width: i, height: o, fill: `url(#${Q})` });
  }
  return c2 = M("mask", { id: g2 }, c2), [g2, c2];
}
function _l(A, e, t) {
  let r = A.toLowerCase().trim().split(/\s+/), n = (a, I) => ({ left: "0%", center: "50%", right: "100%", top: "0%", bottom: "100%" })[a] || a, i, o;
  if (r.length === 1) {
    let a = r[0];
    a === "left" || a === "center" || a === "right" ? (i = n(a, "x"), o = "50%") : a === "top" || a === "bottom" ? (i = "50%", o = n(a, "y")) : (i = a, o = "50%");
  } else {
    let a = r[0], I = r[1];
    a === "top" || a === "bottom" ? (o = n(a, "y"), I === "left" || I === "right" || I === "center" ? i = n(I, "x") : (i = "50%", o = a === "top" || a === "bottom" ? n(a, "y") : I)) : (i = n(a, "x"), o = n(I, "y"));
  }
  let s = (a, I) => {
    try {
      if (a.endsWith("%"))
        return I * parseFloat(a) / 100;
      let g2 = new he(a);
      return g2.type === "length" || g2.type === "number" ? g2.value : 0;
    } catch {
      return 0;
    }
  };
  return [s(i, e), s(o, t)];
}
async function _t({ id: A, left: e, top: t, width: r, height: n, isInheritingTransform: i, src: o, debug: s }, a, I) {
  if (a.display === "none")
    return "";
  let g2 = !!o, c2 = "rect", B = "", E = "", Q = [], d2 = 1, m2 = "";
  a.backgroundColor && Q.push(a.backgroundColor), a.opacity !== void 0 && (d2 = +a.opacity), a.transform && (B = Ht({ left: e, top: t, width: r, height: n }, a.transform, i, a.transformOrigin));
  let D = "";
  if (a.backgroundImage) {
    let nA = [];
    for (let $ = 0; $ < a.backgroundImage.length; $++) {
      let HA = a.backgroundImage[$], tA = await Ot({ id: A + "_" + $, width: r, height: n, left: e, top: t }, HA, I);
      tA && nA.unshift(tA);
    }
    for (let $ of nA)
      Q.push(`url(#${$[0]})`), E += $[1], $[2] && (D += $[2]);
  }
  let [x2, y] = await ri({ id: A, left: e, top: t, width: r, height: n }, a, I);
  E += y;
  let p = x2 ? `url(#${x2})` : a._inheritedMaskId ? `url(#${a._inheritedMaskId})` : void 0, b = Xe({ left: e, top: t, width: r, height: n }, a);
  b && (c2 = "path");
  let R2 = a._inheritedClipPathId;
  s && (m2 = M("rect", { x: e, y: t, width: r, height: n, fill: "transparent", stroke: "#ff5757", "stroke-width": 1, transform: B || void 0, "clip-path": R2 ? `url(#${R2})` : void 0 }));
  let { backgroundClip: U, filter: P2 } = a, q = U === "text" ? `url(#satori_bct-${A})` : R2 ? `url(#${R2})` : a.clipPath ? Ea(A) : void 0, lA = ti({ left: e, top: t, width: r, height: n, path: b, id: A, matrix: B, currentClipPath: q, src: o }, a, I), DA = Q.map((nA) => M(c2, { x: e, y: t, width: r, height: n, fill: nA, d: b || void 0, transform: B || void 0, "clip-path": a.transform ? void 0 : q, style: P2 ? `filter:${P2}` : void 0, mask: a.transform ? void 0 : p })).join(""), RA = Ia({ id: A, left: e, top: t, width: r, height: n, currentClipPathId: R2, borderPath: b, borderType: c2 }, a), eA;
  if (g2) {
    let nA = (a.borderLeftWidth || 0) + (a.paddingLeft || 0), $ = (a.borderTopWidth || 0) + (a.paddingTop || 0), HA = (a.borderRightWidth || 0) + (a.paddingRight || 0), tA = (a.borderBottomWidth || 0) + (a.paddingBottom || 0), bA = r - nA - HA, mA = n - $ - tA, te = (a.objectPosition || "center").toString(), [FA, kA] = _l(te, bA, mA), xA = a.__naturalWidth || bA, J = a.__naturalHeight || mA, rA, fA = bA, QA = mA, K2 = e + nA, MA = t + $;
    if (a.objectFit === "contain") {
      let GA = bA / xA, OA = mA / J, TA = Math.min(GA, OA);
      fA = xA * TA, QA = J * TA, K2 = e + nA + FA - fA * FA / bA, MA = t + $ + kA - QA * kA / mA, rA = "none";
    } else if (a.objectFit === "cover") {
      let GA = bA / xA, OA = mA / J, TA = Math.max(GA, OA);
      fA = xA * TA, QA = J * TA, K2 = e + nA + FA - fA * FA / bA, MA = t + $ + kA - QA * kA / mA, rA = "none";
    } else if (a.objectFit === "fill")
      rA = "none";
    else if (a.objectFit === "scale-down")
      if (xA && J) {
        let GA = bA / xA, OA = mA / J, TA = Math.min(GA, OA);
        if (TA >= 1)
          fA = xA, QA = J, rA = "none", K2 = e + nA + FA - fA * FA / bA, MA = t + $ + kA - QA * kA / mA;
        else {
          let SA = TA;
          fA = xA * SA, QA = J * SA, K2 = e + nA + FA - fA * FA / bA, MA = t + $ + kA - QA * kA / mA, rA = "none";
        }
      } else {
        let GA = bA / xA, OA = mA / J, TA = Math.min(GA, OA);
        fA = xA * TA, QA = J * TA, K2 = e + nA + FA - fA * FA / bA, MA = t + $ + kA - QA * kA / mA, rA = "none";
      }
    else
      rA = "none";
    a.transform && (eA = aa({ id: A, borderRadiusPath: b, borderType: c2, left: e, top: t, width: r, height: n }, a)), DA += M("image", { x: K2, y: MA, width: fA, height: QA, href: o, preserveAspectRatio: rA, transform: B || void 0, style: P2 ? `filter:${P2}` : void 0, "clip-path": a.transform ? eA ? `url(#${eA[1]})` : void 0 : `url(#satori_cp-${A})`, mask: a.transform ? void 0 : x2 ? `url(#${x2})` : `url(#satori_om-${A})` });
  }
  if (RA) {
    E += RA[0];
    let nA = RA[1];
    DA += Tt({ left: e, top: t, width: r, height: n, props: { transform: B || void 0, "clip-path": `url(#${nA})` } }, a);
  }
  let NA = js({ width: r, height: n, id: A, opacity: d2, shape: M(c2, { x: e, y: t, width: r, height: n, fill: "#fff", stroke: "#fff", "stroke-width": 0, d: b || void 0, transform: B || void 0, "clip-path": q, mask: p }) }, a);
  return (E ? M("defs", {}, E) : "") + (NA ? NA[0] : "") + (eA ? eA[0] : "") + lA + (d2 !== 1 ? `<g opacity="${d2}">` : "") + (a.transform && (q || p) ? `<g${q ? ` clip-path="${q}"` : ""}${p ? ` mask="${p}"` : ""}>` : "") + (D || DA) + (a.transform && (q || p) ? "</g>" : "") + (d2 !== 1 ? "</g>" : "") + (NA ? NA[1] : "") + m2;
}
var Ca = String.raw;
var Qa = Ca`\p{Emoji}(?:\p{EMod}|[\u{E0020}-\u{E007E}]+\u{E007F}|\uFE0F?\u20E3?)`;
var da = () => new RegExp(Ca`\p{RI}{2}|(?![#*\d](?!\uFE0F?\u20E3))${Qa}(?:\u200D${Qa})*`, "gu");
var Jl = new RegExp(da(), "u");
var ni = { emoji: Jl, symbol: /\p{Symbol}/u, math: /\p{Math}/u };
var ii = { "ja-JP": /\p{scx=Hira}|\p{scx=Kana}|\p{scx=Han}|[\u3000]|[\uFF00-\uFFEF]/u, "ko-KR": /\p{scx=Hangul}/u, "zh-CN": /\p{scx=Han}/u, "zh-TW": /\p{scx=Han}/u, "zh-HK": /\p{scx=Han}/u, "th-TH": /\p{scx=Thai}/u, "bn-IN": /\p{scx=Bengali}/u, "ar-AR": /\p{scx=Arabic}/u, "ta-IN": /\p{scx=Tamil}/u, "ml-IN": /\p{scx=Malayalam}/u, "he-IL": /\p{scx=Hebrew}/u, "te-IN": /\p{scx=Telugu}/u, devanagari: /\p{scx=Devanagari}/u, kannada: /\p{scx=Kannada}/u };
var rn = Object.keys({ ...ii, ...ni });
function ha(A) {
  return rn.includes(A);
}
function pa(A, e) {
  for (let r of Object.keys(ni))
    if (ni[r].test(A))
      return [r];
  let t = Object.keys(ii).filter((r) => ii[r].test(A));
  if (t.length === 0)
    return ["unknown"];
  if (e) {
    let r = t.findIndex((n) => n === e);
    r !== -1 && (t.splice(r, 1), t.unshift(e));
  }
  return t;
}
function ma(A) {
  if (A)
    return rn.find((e) => e.toLowerCase().startsWith(A.toLowerCase()));
}
async function* Jt(A, e) {
  var xA;
  let t = await Ye(), { id: r, inheritedStyle: n, parent: i, font: o, debug: s, locale: a, embedFont: I = true, graphemeImages: g2, canLoadAdditionalAssets: c2, getTwStyles: B } = e;
  if (A === null || typeof A > "u")
    return yield, yield, "";
  if (!Et(A) || Is(A.type)) {
    let J;
    if (!Et(A))
      J = jn(String(A), e), yield (await J.next()).value;
    else {
      if (gs(A.type))
        throw new Error("Class component is not supported.");
      let fA;
      Rn(A.type) ? fA = A.type.render : fA = A.type, J = Jt(await fA(A.props), e), yield (await J.next()).value;
    }
    await J.next();
    let rA = yield;
    return (await J.next(rA)).value;
  }
  let { type: E, props: Q } = A, d2 = E;
  if (Q && us(Q))
    throw new Error("dangerouslySetInnerHTML property is not supported. See documentation for more information https://github.com/vercel/satori#jsx.");
  let { style: m2, children: D, tw: x2, lang: y = a } = Q || {}, p = ma(y);
  if (x2) {
    let J = B(x2, m2);
    m2 = Object.assign(J, m2);
  }
  let b = t.Node.create();
  i.insertChild(b, i.getChildCount());
  let [R2, U] = await Yn(b, d2, n, m2, Q), P2 = R2.transform === n.transform;
  if (P2 || (R2.transform.__parent = n.transform), (R2.overflow === "hidden" || R2.clipPath && R2.clipPath !== "none") && (U._inheritedClipPathId = `satori_cp-${r}`, U._inheritedMaskId = `satori_om-${r}`), R2.maskImage && (U._inheritedMaskId = `satori_mi-${r}`), R2.backgroundClip === "text") {
    let J = { value: "" };
    U._inheritedBackgroundClipTextPath = J, R2._inheritedBackgroundClipTextPath = J, R2.backgroundImage && (U._inheritedBackgroundClipTextHasBackground = "true", R2._inheritedBackgroundClipTextHasBackground = "true");
  }
  let q = ls(D), lA = [], DA = 0, RA = [];
  for (let J of q) {
    let rA = Jt(J, { id: r + "-" + DA++, parentStyle: R2, inheritedStyle: U, isInheritingTransform: true, parent: b, font: o, embedFont: I, debug: s, graphemeImages: g2, canLoadAdditionalAssets: c2, locale: p, getTwStyles: B, onNodeDetected: e.onNodeDetected });
    c2 ? RA.push(...(await rA.next()).value || []) : await rA.next(), lA.push(rA);
  }
  yield RA;
  for (let J of lA)
    await J.next();
  let [eA, NA] = yield, { left: nA, top: $, width: HA, height: tA } = b.getComputedLayout();
  nA += eA, $ += NA;
  let bA = "", mA = "", te = "", { children: FA, ...kA } = Q;
  if ((xA = e.onNodeDetected) == null || xA.call(e, { left: nA, top: $, width: HA, height: tA, type: d2, props: kA, key: A.key, textContent: Et(FA) ? void 0 : FA }), d2 === "img") {
    let J = R2.__src;
    mA = await _t({ id: r, left: nA, top: $, width: HA, height: tA, src: J, isInheritingTransform: P2, debug: s }, R2, U);
  } else if (d2 === "svg") {
    let J = R2.color, rA = await Hs(A, J);
    mA = await _t({ id: r, left: nA, top: $, width: HA, height: tA, src: rA, isInheritingTransform: P2, debug: s }, R2, U);
  } else {
    let J = m2 == null ? void 0 : m2.display;
    if (d2 === "div" && D && typeof D != "string" && J !== "flex" && J !== "none" && J !== "contents")
      throw new Error('Expected <div> to have explicit "display: flex", "display: contents", or "display: none" if it has more than one child node.');
    mA = await _t({ id: r, left: nA, top: $, width: HA, height: tA, isInheritingTransform: P2, debug: s }, R2, U);
  }
  for (let J of lA)
    bA += (await J.next([nA, $])).value;
  return R2._inheritedBackgroundClipTextPath && (te += M("clipPath", { id: `satori_bct-${r}`, "clip-path": R2._inheritedClipPathId ? `url(#${R2._inheritedClipPathId})` : void 0 }, R2._inheritedBackgroundClipTextPath.value)), te + mA + bA;
}
var ya = "unknown";
function Kl(A) {
  let e = [], t = [0, 0], r = [0, 0], n = (i, o) => {
    let s = i[0];
    for (let a = 1; a <= o; a++) {
      let I = a / o, g2 = Wl(i, I);
      e.push({ from: s, to: g2 }), s = g2;
    }
    r = i[i.length - 1];
  };
  for (let i of A) {
    if (i.type === "M") {
      t = r = [i.x, i.y];
      continue;
    }
    if (i.type === "L") {
      let o = [i.x, i.y];
      e.push({ from: r, to: o }), r = o;
      continue;
    }
    if (i.type === "Q") {
      n([r, [i.x1, i.y1], [i.x, i.y]], 12);
      continue;
    }
    if (i.type === "C") {
      n([r, [i.x1, i.y1], [i.x2, i.y2], [i.x, i.y]], 16);
      continue;
    }
    i.type === "Z" && (e.push({ from: r, to: t }), r = t);
  }
  return e;
}
function Wl(A, e) {
  let t = A;
  for (; t.length > 1; ) {
    let r = [];
    for (let n = 0; n < t.length - 1; n++)
      r.push([t[n][0] + (t[n + 1][0] - t[n][0]) * e, t[n][1] + (t[n + 1][1] - t[n][1]) * e]);
    t = r;
  }
  return t[0];
}
function Yl(A, e) {
  if (!e)
    return [];
  let t = e.strokeWidth, r = e.underlineY - t * 0.25, n = e.underlineY + t * 2.5, i = Kl(A);
  if (!i.length)
    return [];
  let o = n - r, s = Math.max(12, Math.ceil(o / 0.25)), a = o / s, I = r + a / 2, g2 = /* @__PURE__ */ new Set();
  for (let y = 0; y < s; y++) {
    let p = I + a * y, b = [];
    for (let R2 of i) {
      let [U, P2] = R2.from, [q, lA] = R2.to;
      if (P2 === lA)
        continue;
      let DA = Math.min(P2, lA), RA = Math.max(P2, lA);
      if (p < DA || p >= RA)
        continue;
      let eA = (p - P2) / (lA - P2), NA = U + (q - U) * eA;
      b.push(NA);
    }
    if (b.length) {
      b.sort((R2, U) => R2 - U);
      for (let R2 = 0; R2 < b.length - 1; R2 += 2) {
        let U = Math.min(b[R2], b[R2 + 1]), P2 = Math.max(b[R2], b[R2 + 1]), q = Math.floor(U), lA = Math.ceil(P2);
        for (let DA = q; DA < lA; DA++)
          g2.add(DA);
      }
    }
  }
  if (!g2.size)
    return [];
  let c2 = Array.from(g2.values()).sort((y, p) => y - p), B = [], E = c2[0], Q = c2[0];
  for (let y = 1; y < c2.length; y++) {
    let p = c2[y];
    p > Q + 1 && (B.push([E, Q + 1]), E = p), Q = p;
  }
  B.push([E, Q + 1]);
  let d2 = [], m2 = t * 0.6, D = B[0][0], x2 = B[B.length - 1][1];
  for (let [y, p] of B) {
    let b = Math.min(y, D) - m2, R2 = Math.max(p, x2) + m2;
    d2.push({ x1: b, x2: R2, y1: r, y2: n });
  }
  return d2;
}
function ql(A, e, [t, r], [n, i]) {
  if (t !== n)
    return t ? !n || t === A ? -1 : n === A ? 1 : A === 400 && t === 500 || A === 500 && t === 400 ? -1 : A === 400 && n === 500 || A === 500 && n === 400 ? 1 : A < 400 ? t < A && n < A ? n - t : t < A ? -1 : n < A ? 1 : t - n : A < t && A < n ? t - n : A < t ? -1 : A < n ? 1 : n - t : 1;
  if (r !== i) {
    if (r === e)
      return -1;
    if (i === e)
      return 1;
  }
  return -1;
}
var oi = /* @__PURE__ */ new WeakMap();
var Wt = class {
  constructor(e) {
    this.fonts = /* @__PURE__ */ new Map();
    this.addFonts(e);
  }
  get({ name: e, weight: t, style: r }) {
    if (!this.fonts.has(e))
      return null;
    t === "normal" && (t = 400), t === "bold" && (t = 700), typeof t == "string" && (t = Number.parseInt(t, 10));
    let n = [...this.fonts.get(e)], i = n[0];
    for (let o = 1; o < n.length; o++) {
      let [, s, a] = i, [, I, g2] = n[o];
      ql(t, r, [s, a], [I, g2]) > 0 && (i = n[o]);
    }
    return i[0];
  }
  addFonts(e) {
    for (let t of e) {
      let { name: r, data: n, lang: i } = t;
      if (i && !ha(i))
        throw new Error(`Invalid value for props \`lang\`: "${i}". The value must be one of the following: ${rn.join(", ")}.`);
      let o = i ?? ya, s;
      if (oi.has(n))
        s = oi.get(n);
      else {
        s = opentype_module_default.parse("buffer" in n ? n.buffer.slice(n.byteOffset, n.byteOffset + n.byteLength) : n, { lowMemory: true });
        let I = s.charToGlyphIndex;
        s.charToGlyphIndex = (g2) => {
          let c2 = I.call(s, g2);
          return c2 === 0 && s._trackBrokenChars && s._trackBrokenChars.push(g2), c2;
        }, oi.set(n, s);
      }
      this.defaultFont || (this.defaultFont = s);
      let a = `${r.toLowerCase()}_${o}`;
      this.fonts.has(a) || this.fonts.set(a, []), this.fonts.get(a).push([s, t.weight, t.style]);
    }
  }
  getEngine(e = 16, t = "normal", { fontFamily: r = "sans-serif", fontWeight: n = 400, fontStyle: i = "normal" }, o) {
    if (!this.fonts.size)
      throw new Error("No fonts are loaded. At least one font is required to calculate the layout.");
    r = (Array.isArray(r) ? r : [r]).map((y) => y.toLowerCase());
    let s = [];
    r.forEach((y) => {
      let p = this.get({ name: y, weight: n, style: i });
      if (p) {
        s.push(p);
        return;
      }
      let b = this.get({ name: y + "_unknown", weight: n, style: i });
      if (b) {
        s.push(b);
        return;
      }
    });
    let a = Array.from(this.fonts.keys()), I = [], g2 = [], c2 = [];
    for (let y of a)
      if (!r.includes(y))
        if (o) {
          let p = Xl(y);
          p ? p === o ? I.push(this.get({ name: y, weight: n, style: i })) : g2.push(this.get({ name: y, weight: n, style: i })) : c2.push(this.get({ name: y, weight: n, style: i }));
        } else
          c2.push(this.get({ name: y, weight: n, style: i }));
    let B = /* @__PURE__ */ new Map(), E = (y, p = true) => {
      let b = [...s, ...c2, ...I, ...p ? g2 : []];
      if (typeof y > "u")
        return p ? b[b.length - 1] : void 0;
      let R2 = y.charCodeAt(0);
      if (B.has(R2))
        return B.get(R2);
      let U = b.find((P2, q) => !!P2.charToGlyphIndex(y) || p && q === b.length - 1);
      return U && B.set(R2, U), U;
    }, Q = (y, p = false) => {
      var R2, U;
      return ((p ? (U = (R2 = y.tables) == null ? void 0 : R2.os2) == null ? void 0 : U.sTypoAscender : 0) || y.ascender) / y.unitsPerEm * e;
    }, d2 = (y, p = false) => {
      var R2, U;
      return ((p ? (U = (R2 = y.tables) == null ? void 0 : R2.os2) == null ? void 0 : U.sTypoDescender : 0) || y.descender) / y.unitsPerEm * e;
    }, m2 = (y, p = false) => {
      var b, R2;
      if (typeof t == "string" && t === "normal") {
        let U = (p ? (R2 = (b = y.tables) == null ? void 0 : b.os2) == null ? void 0 : R2.sTypoLineGap : 0) || 0;
        return Q(y, p) - d2(y, p) + U / y.unitsPerEm * e;
      } else if (typeof t == "number")
        return e * t;
    }, D = (y) => E(y, false);
    return { has: (y) => {
      if (y === `
`)
        return true;
      let p = D(y);
      return p ? (p._trackBrokenChars = [], p.stringToGlyphs(y), p._trackBrokenChars.length ? (p._trackBrokenChars = void 0, false) : true) : false;
    }, baseline: (y, p = typeof y > "u" ? s[0] : E(y)) => {
      let b = Q(p), R2 = d2(p), U = b - R2;
      return b + (m2(p) - U) / 2;
    }, height: (y, p = typeof y > "u" ? s[0] : E(y)) => m2(p), measure: (y, p) => this.measure(E, y, p), getSVG: (y, p, b) => this.getSVG(E, y, p, b) };
  }
  patchFontFallbackResolver(e, t) {
    let r = [];
    e._trackBrokenChars = r;
    let n = e.stringToGlyphs;
    return e.stringToGlyphs = (i, ...o) => {
      let s = n.call(e, i, ...o);
      for (let a = 0; a < s.length; a++)
        if (s[a].unicode === void 0) {
          let I = r.shift(), g2 = t(I);
          if (g2 !== e) {
            let c2 = g2.charToGlyph(I), B = e.unitsPerEm / g2.unitsPerEm, E = new opentype_module_default.Path();
            E.unitsPerEm = e.unitsPerEm, E.commands = c2.path.commands.map((d2) => {
              let m2 = { ...d2 };
              for (let D in m2)
                typeof m2[D] == "number" && (m2[D] *= B);
              return m2;
            });
            let Q = new opentype_module_default.Glyph({ ...c2, advanceWidth: c2.advanceWidth * B, xMin: c2.xMin * B, xMax: c2.xMax * B, yMin: c2.yMin * B, yMax: c2.yMax * B, path: E });
            s[a] = Q;
          }
        }
      return s;
    }, () => {
      e.stringToGlyphs = n, e._trackBrokenChars = void 0;
    };
  }
  measure(e, t, { fontSize: r, letterSpacing: n = 0 }) {
    let i = e(t), o = this.patchFontFallbackResolver(i, e);
    try {
      return i.getAdvanceWidth(t, r, { letterSpacing: n / r });
    } finally {
      o();
    }
  }
  getSVG(e, t, { fontSize: r, top: n, left: i, letterSpacing: o = 0 }, s) {
    let a = e(t), I = this.patchFontFallbackResolver(a, e);
    try {
      if (r === 0)
        return { path: "", boxes: [] };
      let g2 = new opentype_module_default.Path(), c2 = [], B = { letterSpacing: o / r }, E = /* @__PURE__ */ new WeakMap();
      return a.forEachGlyph(t.replace(/\n/g, ""), i, n, r, B, function(Q, d2, m2, D) {
        let x2;
        if (!E.has(Q))
          x2 = Q.getPath(d2, m2, D, B), E.set(Q, [d2, m2, x2]);
        else {
          let [p, b, R2] = E.get(Q);
          x2 = new opentype_module_default.Path(), x2.commands = R2.commands.map((U) => {
            let P2 = { ...U };
            for (let q in P2)
              typeof P2[q] == "number" && ((q === "x" || q === "x1" || q === "x2") && (P2[q] += d2 - p), (q === "y" || q === "y1" || q === "y2") && (P2[q] += m2 - b));
            return P2;
          });
        }
        let y = s ? Yl(x2.commands, s) : [];
        y.length && c2.push(...y), g2.extend(x2);
      }), { path: g2.toPathData(1), boxes: c2 };
    } finally {
      I();
    }
  }
};
function Xl(A) {
  let e = A.split("_"), t = e[e.length - 1];
  return t === ya ? void 0 : t;
}
function si({ width: A, height: e, content: t }) {
  return M("svg", { width: A, height: e, viewBox: `0 0 ${A} ${e}`, xmlns: "http://www.w3.org/2000/svg" }, t);
}
var tu = fu(FI());
var LC = ["ios", "android", "windows", "macos", "web"];
function LI(A) {
  return LC.includes(A);
}
var GC2 = ["portrait", "landscape"];
function GI(A) {
  return GC2.includes(A);
}
var MI;
(function(A) {
  A.fontSize = "fontSize", A.lineHeight = "lineHeight";
})(MI || (MI = {}));
var aA;
(function(A) {
  A.rem = "rem", A.em = "em", A.px = "px", A.percent = "%", A.vw = "vw", A.vh = "vh", A.none = "<no-css-unit>";
})(aA || (aA = {}));
function Mo(A) {
  return typeof A == "string";
}
function Lo(A) {
  return typeof A == "object";
}
var Go;
function w2(A) {
  return { kind: "complete", style: A };
}
function LA(A, e = {}) {
  let { fractions: t } = e;
  if (t && A.includes("/")) {
    let [i = "", o = ""] = A.split("/", 2), s = LA(i), a = LA(o);
    return !s || !a ? null : [s[0] / a[0], a[1]];
  }
  let r = parseFloat(A);
  if (Number.isNaN(r))
    return null;
  let n = A.match(/(([a-z]{2,}|%))$/);
  if (!n)
    return [r, aA.none];
  switch (n == null ? void 0 : n[1]) {
    case "rem":
      return [r, aA.rem];
    case "px":
      return [r, aA.px];
    case "em":
      return [r, aA.em];
    case "%":
      return [r, aA.percent];
    case "vw":
      return [r, aA.vw];
    case "vh":
      return [r, aA.vh];
    default:
      return null;
  }
}
function _e(A, e, t = {}) {
  let r = Re(e, t);
  return r === null ? null : w2({ [A]: r });
}
function mn(A, e, t) {
  let r = Re(e);
  return r !== null && (t[A] = r), t;
}
function HI(A, e) {
  let t = Re(e);
  return t === null ? null : { [A]: t };
}
function Re(A, e = {}) {
  if (A === void 0)
    return null;
  let t = LA(String(A), e);
  return t ? je(...t, e) : null;
}
function je(A, e, t = {}) {
  let { isNegative: r, device: n } = t;
  switch (e) {
    case aA.rem:
      return A * 16 * (r ? -1 : 1);
    case aA.px:
      return A * (r ? -1 : 1);
    case aA.percent:
      return `${r ? "-" : ""}${A}%`;
    case aA.none:
      return A * (r ? -1 : 1);
    case aA.vw:
      return n != null && n.windowDimensions ? n.windowDimensions.width * (A / 100) : (ZA("`vw` CSS unit requires configuration with `useDeviceContext()`"), null);
    case aA.vh:
      return n != null && n.windowDimensions ? n.windowDimensions.height * (A / 100) : (ZA("`vh` CSS unit requires configuration with `useDeviceContext()`"), null);
    default:
      return null;
  }
}
function Uo(A) {
  let e = LA(A);
  if (!e)
    return null;
  let [t, r] = e;
  switch (r) {
    case aA.rem:
      return t * 16;
    case aA.px:
      return t;
    default:
      return null;
  }
}
var UC = { t: "Top", tr: "TopRight", tl: "TopLeft", b: "Bottom", br: "BottomRight", bl: "BottomLeft", l: "Left", r: "Right", x: "Horizontal", y: "Vertical" };
function Ho(A) {
  return UC[A ?? ""] || "All";
}
function Oo(A) {
  let e = "All";
  return [A.replace(/^-(t|b|r|l|tr|tl|br|bl)(-|$)/, (r, n) => (e = Ho(n), "")), e];
}
function gt(A, e = {}) {
  if (A.includes("/")) {
    let t = UI(A, { ...e, fractions: true });
    if (t)
      return t;
  }
  return A[0] === "[" && (A = A.slice(1, -1)), UI(A, e);
}
function ce(A, e, t = {}) {
  let r = gt(e, t);
  return r === null ? null : w2({ [A]: r });
}
function UI(A, e = {}) {
  if (A === "px")
    return 1;
  let t = LA(A, e);
  if (!t)
    return null;
  let [r, n] = t;
  return e.fractions && (n = aA.percent, r *= 100), n === aA.none && (r = r / 4, n = aA.rem), je(r, n, e);
}
function HC(...A) {
  console.warn(...A);
}
function OC(...A) {
}
var ZA = typeof process > "u" || ((Go = process == null ? void 0 : process.env) === null || Go === void 0 ? void 0 : Go.JEST_WORKER_ID) === void 0 ? HC : OC;
var TC = [["aspect-square", w2({ aspectRatio: 1 })], ["aspect-video", w2({ aspectRatio: 16 / 9 })], ["items-center", w2({ alignItems: "center" })], ["items-start", w2({ alignItems: "flex-start" })], ["items-end", w2({ alignItems: "flex-end" })], ["items-baseline", w2({ alignItems: "baseline" })], ["items-stretch", w2({ alignItems: "stretch" })], ["justify-start", w2({ justifyContent: "flex-start" })], ["justify-end", w2({ justifyContent: "flex-end" })], ["justify-center", w2({ justifyContent: "center" })], ["justify-between", w2({ justifyContent: "space-between" })], ["justify-around", w2({ justifyContent: "space-around" })], ["justify-evenly", w2({ justifyContent: "space-evenly" })], ["content-start", w2({ alignContent: "flex-start" })], ["content-end", w2({ alignContent: "flex-end" })], ["content-between", w2({ alignContent: "space-between" })], ["content-around", w2({ alignContent: "space-around" })], ["content-stretch", w2({ alignContent: "stretch" })], ["content-center", w2({ alignContent: "center" })], ["self-auto", w2({ alignSelf: "auto" })], ["self-start", w2({ alignSelf: "flex-start" })], ["self-end", w2({ alignSelf: "flex-end" })], ["self-center", w2({ alignSelf: "center" })], ["self-stretch", w2({ alignSelf: "stretch" })], ["self-baseline", w2({ alignSelf: "baseline" })], ["direction-inherit", w2({ direction: "inherit" })], ["direction-ltr", w2({ direction: "ltr" })], ["direction-rtl", w2({ direction: "rtl" })], ["hidden", w2({ display: "none" })], ["flex", w2({ display: "flex" })], ["flex-row", w2({ flexDirection: "row" })], ["flex-row-reverse", w2({ flexDirection: "row-reverse" })], ["flex-col", w2({ flexDirection: "column" })], ["flex-col-reverse", w2({ flexDirection: "column-reverse" })], ["flex-wrap", w2({ flexWrap: "wrap" })], ["flex-wrap-reverse", w2({ flexWrap: "wrap-reverse" })], ["flex-nowrap", w2({ flexWrap: "nowrap" })], ["flex-auto", w2({ flexGrow: 1, flexShrink: 1, flexBasis: "auto" })], ["flex-initial", w2({ flexGrow: 0, flexShrink: 1, flexBasis: "auto" })], ["flex-none", w2({ flexGrow: 0, flexShrink: 0, flexBasis: "auto" })], ["overflow-hidden", w2({ overflow: "hidden" })], ["overflow-visible", w2({ overflow: "visible" })], ["overflow-scroll", w2({ overflow: "scroll" })], ["absolute", w2({ position: "absolute" })], ["relative", w2({ position: "relative" })], ["italic", w2({ fontStyle: "italic" })], ["not-italic", w2({ fontStyle: "normal" })], ["oldstyle-nums", mr("oldstyle-nums")], ["small-caps", mr("small-caps")], ["lining-nums", mr("lining-nums")], ["tabular-nums", mr("tabular-nums")], ["proportional-nums", mr("proportional-nums")], ["font-thin", w2({ fontWeight: "100" })], ["font-100", w2({ fontWeight: "100" })], ["font-extralight", w2({ fontWeight: "200" })], ["font-200", w2({ fontWeight: "200" })], ["font-light", w2({ fontWeight: "300" })], ["font-300", w2({ fontWeight: "300" })], ["font-normal", w2({ fontWeight: "normal" })], ["font-400", w2({ fontWeight: "400" })], ["font-medium", w2({ fontWeight: "500" })], ["font-500", w2({ fontWeight: "500" })], ["font-semibold", w2({ fontWeight: "600" })], ["font-600", w2({ fontWeight: "600" })], ["font-bold", w2({ fontWeight: "bold" })], ["font-700", w2({ fontWeight: "700" })], ["font-extrabold", w2({ fontWeight: "800" })], ["font-800", w2({ fontWeight: "800" })], ["font-black", w2({ fontWeight: "900" })], ["font-900", w2({ fontWeight: "900" })], ["include-font-padding", w2({ includeFontPadding: true })], ["remove-font-padding", w2({ includeFontPadding: false })], ["max-w-none", w2({ maxWidth: "99999%" })], ["text-left", w2({ textAlign: "left" })], ["text-center", w2({ textAlign: "center" })], ["text-right", w2({ textAlign: "right" })], ["text-justify", w2({ textAlign: "justify" })], ["text-auto", w2({ textAlign: "auto" })], ["underline", w2({ textDecorationLine: "underline" })], ["line-through", w2({ textDecorationLine: "line-through" })], ["no-underline", w2({ textDecorationLine: "none" })], ["uppercase", w2({ textTransform: "uppercase" })], ["lowercase", w2({ textTransform: "lowercase" })], ["capitalize", w2({ textTransform: "capitalize" })], ["normal-case", w2({ textTransform: "none" })], ["w-auto", w2({ width: "auto" })], ["h-auto", w2({ height: "auto" })], ["shadow-sm", w2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.025, elevation: 1 })], ["shadow", w2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.075, elevation: 2 })], ["shadow-md", w2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 3, shadowOpacity: 0.125, elevation: 3 })], ["shadow-lg", w2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 })], ["shadow-xl", w2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.19, shadowRadius: 20, elevation: 12 })], ["shadow-2xl", w2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 30, elevation: 16 })], ["shadow-none", w2({ shadowOffset: { width: 0, height: 0 }, shadowColor: "#000", shadowRadius: 0, shadowOpacity: 0, elevation: 0 })]];
var To = TC;
function mr(A) {
  return { kind: "dependent", complete(e) {
    (!e.fontVariant || !Array.isArray(e.fontVariant)) && (e.fontVariant = []), e.fontVariant.push(A);
  } };
}
var yr = class {
  constructor(e) {
    this.ir = new Map(To), this.styles = /* @__PURE__ */ new Map(), this.prefixes = /* @__PURE__ */ new Map(), this.ir = new Map([...To, ...e ?? []]);
  }
  getStyle(e) {
    return this.styles.get(e);
  }
  setStyle(e, t) {
    this.styles.set(e, t);
  }
  getIr(e) {
    return this.ir.get(e);
  }
  setIr(e, t) {
    this.ir.set(e, t);
  }
  getPrefixMatch(e) {
    return this.prefixes.get(e);
  }
  setPrefixMatch(e, t) {
    this.prefixes.set(e, t);
  }
};
function Po(A, e, t = {}) {
  let r = e == null ? void 0 : e[A];
  if (!r)
    return ce("fontSize", A, t);
  if (typeof r == "string")
    return _e("fontSize", r);
  let n = {}, [i, o] = r, s = HI("fontSize", i);
  if (s && (n = s), typeof o == "string")
    return w2(mn("lineHeight", OI(o, n), n));
  let { lineHeight: a, letterSpacing: I } = o;
  return a && mn("lineHeight", OI(a, n), n), I && mn("letterSpacing", I, n), w2(n);
}
function OI(A, e) {
  let t = LA(A);
  if (t) {
    let [r, n] = t;
    if ((n === aA.none || n === aA.em) && typeof e.fontSize == "number")
      return e.fontSize * r;
  }
  return A;
}
function _o(A, e) {
  var t;
  let r = (t = e == null ? void 0 : e[A]) !== null && t !== void 0 ? t : A.startsWith("[") ? A.slice(1, -1) : A, n = LA(r);
  if (!n)
    return null;
  let [i, o] = n;
  if (o === aA.none)
    return { kind: "dependent", complete(a) {
      if (typeof a.fontSize != "number")
        return "relative line-height utilities require that font-size be set";
      a.lineHeight = a.fontSize * i;
    } };
  let s = je(i, o);
  return s !== null ? w2({ lineHeight: s }) : null;
}
function Jo(A, e, t, r, n) {
  let i = "";
  if (r[0] === "[")
    i = r.slice(1, -1);
  else {
    let I = n == null ? void 0 : n[r];
    if (I)
      i = I;
    else {
      let g2 = gt(r);
      return g2 && typeof g2 == "number" ? TI(g2, aA.px, e, A) : null;
    }
  }
  if (i === "auto")
    return PI(e, A, "auto");
  let o = LA(i);
  if (!o)
    return null;
  let [s, a] = o;
  return t && (s = -s), TI(s, a, e, A);
}
function TI(A, e, t, r) {
  let n = je(A, e);
  return n === null ? null : PI(t, r, n);
}
function PI(A, e, t) {
  switch (A) {
    case "All":
      return { kind: "complete", style: { [`${e}Top`]: t, [`${e}Right`]: t, [`${e}Bottom`]: t, [`${e}Left`]: t } };
    case "Bottom":
    case "Top":
    case "Left":
    case "Right":
      return { kind: "complete", style: { [`${e}${A}`]: t } };
    case "Vertical":
      return { kind: "complete", style: { [`${e}Top`]: t, [`${e}Bottom`]: t } };
    case "Horizontal":
      return { kind: "complete", style: { [`${e}Left`]: t, [`${e}Right`]: t } };
    default:
      return null;
  }
}
function Ko(A) {
  if (!A)
    return {};
  let e = Object.entries(A).reduce((n, [i, o]) => {
    let s = [0, 1 / 0, 0], a = typeof o == "string" ? { min: o } : o, I = a.min ? Uo(a.min) : 0;
    I === null ? ZA(`invalid screen config value: ${i}->min: ${a.min}`) : s[0] = I;
    let g2 = a.max ? Uo(a.max) : 1 / 0;
    return g2 === null ? ZA(`invalid screen config value: ${i}->max: ${a.max}`) : s[1] = g2, n[i] = s, n;
  }, {}), t = Object.values(e);
  t.sort((n, i) => {
    let [o, s] = n, [a, I] = i;
    return s === 1 / 0 || I === 1 / 0 ? o - a : s - I;
  });
  let r = 0;
  return t.forEach((n) => n[2] = r++), e;
}
function Wo(A, e) {
  let t = e == null ? void 0 : e[A];
  if (!t)
    return null;
  if (typeof t == "string")
    return w2({ fontFamily: t });
  let r = t[0];
  return r ? w2({ fontFamily: r }) : null;
}
function It(A, e, t) {
  if (!t)
    return null;
  let r;
  e.includes("/") && ([e = "", r] = e.split("/", 2));
  let n = "";
  if (e.startsWith("[#") || e.startsWith("[rgb") ? n = e.slice(1, -1) : n = KI(e, t), !n)
    return null;
  if (r) {
    let i = Number(r);
    if (!Number.isNaN(i))
      return n = _I(n, i / 100), w2({ [yn[A].color]: n });
  }
  return { kind: "dependent", complete(i) {
    let o = yn[A].opacity, s = i[o];
    typeof s == "number" && (n = _I(n, s)), i[yn[A].color] = n;
  } };
}
function wr(A, e) {
  let t = parseInt(e, 10);
  if (Number.isNaN(t))
    return null;
  let r = t / 100;
  return { kind: "complete", style: { [yn[A].opacity]: r } };
}
function _I(A, e) {
  return A.startsWith("#") ? A = PC(A) : A.startsWith("rgb(") && (A = A.replace(/^rgb\(/, "rgba(").replace(/\)$/, ", 1)")), A.replace(/, ?\d*\.?(\d+)\)$/, `, ${e})`);
}
function JI(A) {
  for (let e in A)
    e.startsWith("__opacity_") && delete A[e];
}
var yn = { bg: { opacity: "__opacity_bg", color: "backgroundColor" }, text: { opacity: "__opacity_text", color: "color" }, border: { opacity: "__opacity_border", color: "borderColor" }, borderTop: { opacity: "__opacity_border", color: "borderTopColor" }, borderBottom: { opacity: "__opacity_border", color: "borderBottomColor" }, borderLeft: { opacity: "__opacity_border", color: "borderLeftColor" }, borderRight: { opacity: "__opacity_border", color: "borderRightColor" }, shadow: { opacity: "__opacity_shadow", color: "shadowColor" }, tint: { opacity: "__opacity_tint", color: "tintColor" } };
function PC(A) {
  let e = A;
  A = A.replace(_C, (o, s, a, I) => s + s + a + a + I + I);
  let t = JC.exec(A);
  if (!t)
    return ZA(`invalid config hex color value: ${e}`), "rgba(0, 0, 0, 1)";
  let r = parseInt(t[1], 16), n = parseInt(t[2], 16), i = parseInt(t[3], 16);
  return `rgba(${r}, ${n}, ${i}, 1)`;
}
function KI(A, e) {
  let t = e[A];
  if (Mo(t))
    return t;
  if (Lo(t) && Mo(t.DEFAULT))
    return t.DEFAULT;
  let [r = "", ...n] = A.split("-");
  for (; r !== A; ) {
    let i = e[r];
    if (Lo(i))
      return KI(n.join("-"), i);
    if (n.length === 0)
      return "";
    r = `${r}-${n.shift()}`;
  }
  return "";
}
var _C = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
var JC = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
function YI(A, e) {
  let [t, r] = Oo(A);
  if (t.match(/^(-?(\d)+)?$/))
    return KC(t, r, e == null ? void 0 : e.borderWidth);
  if (t = t.replace(/^-/, ""), ["dashed", "solid", "dotted"].includes(t))
    return w2({ borderStyle: t });
  let i = "border";
  switch (r) {
    case "Bottom":
      i = "borderBottom";
      break;
    case "Top":
      i = "borderTop";
      break;
    case "Left":
      i = "borderLeft";
      break;
    case "Right":
      i = "borderRight";
      break;
  }
  let o = It(i, t, e == null ? void 0 : e.borderColor);
  if (o)
    return o;
  let s = `border${r === "All" ? "" : r}Width`;
  t = t.replace(/^-/, "");
  let a = t.slice(1, -1), I = ce(s, a);
  return typeof (I == null ? void 0 : I.style[s]) != "number" ? null : I;
}
function KC(A, e, t) {
  if (!t)
    return null;
  A = A.replace(/^-/, "");
  let n = t[A === "" ? "DEFAULT" : A];
  if (n === void 0)
    return null;
  let i = `border${e === "All" ? "" : e}Width`;
  return _e(i, n);
}
function qI(A, e) {
  if (!e)
    return null;
  let [t, r] = Oo(A);
  t = t.replace(/^-/, ""), t === "" && (t = "DEFAULT");
  let n = `border${r === "All" ? "" : r}Radius`, i = e[t];
  if (i)
    return WI(_e(n, i));
  let o = ce(n, t);
  return typeof (o == null ? void 0 : o.style[n]) != "number" ? null : WI(o);
}
function WI(A) {
  if ((A == null ? void 0 : A.kind) !== "complete")
    return A;
  let e = A.style.borderTopRadius;
  e !== void 0 && (A.style.borderTopLeftRadius = e, A.style.borderTopRightRadius = e, delete A.style.borderTopRadius);
  let t = A.style.borderBottomRadius;
  t !== void 0 && (A.style.borderBottomLeftRadius = t, A.style.borderBottomRightRadius = t, delete A.style.borderBottomRadius);
  let r = A.style.borderLeftRadius;
  r !== void 0 && (A.style.borderBottomLeftRadius = r, A.style.borderTopLeftRadius = r, delete A.style.borderLeftRadius);
  let n = A.style.borderRightRadius;
  return n !== void 0 && (A.style.borderBottomRightRadius = n, A.style.borderTopRightRadius = n, delete A.style.borderRightRadius), A;
}
function St(A, e, t, r) {
  let n = null;
  A === "inset" && (e = e.replace(/^(x|y)-/, (s, a) => (n = a === "x" ? "x" : "y", "")));
  let i = r == null ? void 0 : r[e];
  if (i) {
    let s = Re(i, { isNegative: t });
    if (s !== null)
      return XI(A, n, s);
  }
  let o = gt(e, { isNegative: t });
  return o !== null ? XI(A, n, o) : null;
}
function XI(A, e, t) {
  if (A !== "inset")
    return w2({ [A]: t });
  switch (e) {
    case null:
      return w2({ top: t, left: t, right: t, bottom: t });
    case "y":
      return w2({ top: t, bottom: t });
    case "x":
      return w2({ left: t, right: t });
  }
}
function Dr(A, e, t) {
  var r;
  e = e.replace(/^-/, "");
  let n = e === "" ? "DEFAULT" : e, i = Number((r = t == null ? void 0 : t[n]) !== null && r !== void 0 ? r : e);
  return Number.isNaN(i) ? null : w2({ [`flex${A}`]: i });
}
function VI(A, e) {
  var t, r;
  if (A = (e == null ? void 0 : e[A]) || A, ["min-content", "revert", "unset"].includes(A))
    return null;
  if (A.match(/^\d+(\.\d+)?$/))
    return w2({ flexGrow: Number(A), flexBasis: "0%" });
  let n = A.match(/^(\d+)\s+(\d+)$/);
  if (n)
    return w2({ flexGrow: Number(n[1]), flexShrink: Number(n[2]) });
  if (n = A.match(/^(\d+)\s+([^ ]+)$/), n) {
    let i = Re((t = n[2]) !== null && t !== void 0 ? t : "");
    return i ? w2({ flexGrow: Number(n[1]), flexBasis: i }) : null;
  }
  if (n = A.match(/^(\d+)\s+(\d+)\s+(.+)$/), n) {
    let i = Re((r = n[3]) !== null && r !== void 0 ? r : "");
    return i ? w2({ flexGrow: Number(n[1]), flexShrink: Number(n[2]), flexBasis: i }) : null;
  }
  return null;
}
function Yo(A, e, t = {}, r) {
  let n = r == null ? void 0 : r[e];
  return n !== void 0 ? _e(A, n, t) : ce(A, e, t);
}
function Sr(A, e, t = {}, r) {
  let n = Re(r == null ? void 0 : r[e], t);
  return n ? w2({ [A]: n }) : (e === "screen" && (e = A.includes("Width") ? "100vw" : "100vh"), ce(A, e, t));
}
function zI(A, e, t) {
  let r = t == null ? void 0 : t[A];
  if (r) {
    let n = LA(r, { isNegative: e });
    if (!n)
      return null;
    let [i, o] = n;
    if (o === aA.em)
      return WC(i);
    if (o === aA.percent)
      return ZA("percentage-based letter-spacing configuration currently unsupported, switch to `em`s, or open an issue if you'd like to see support added."), null;
    let s = je(i, o, { isNegative: e });
    return s !== null ? w2({ letterSpacing: s }) : null;
  }
  return ce("letterSpacing", A, { isNegative: e });
}
function WC(A) {
  return { kind: "dependent", complete(e) {
    let t = e.fontSize;
    if (typeof t != "number" || Number.isNaN(t))
      return "tracking-X relative letter spacing classes require font-size to be set";
    e.letterSpacing = Math.round((A * t + Number.EPSILON) * 100) / 100;
  } };
}
function ZI(A, e) {
  let t = e == null ? void 0 : e[A];
  if (t) {
    let n = LA(String(t));
    if (n)
      return w2({ opacity: n[0] });
  }
  let r = LA(A);
  return r ? w2({ opacity: r[0] / 100 }) : null;
}
function jI(A) {
  let e = parseInt(A, 10);
  return Number.isNaN(e) ? null : { kind: "complete", style: { shadowOpacity: e / 100 } };
}
function $I(A) {
  if (A.includes("/")) {
    let [t = "", r = ""] = A.split("/", 2), n = qo(t), i = qo(r);
    return n === null || i === null ? null : { kind: "complete", style: { shadowOffset: { width: n, height: i } } };
  }
  let e = qo(A);
  return e === null ? null : { kind: "complete", style: { shadowOffset: { width: e, height: e } } };
}
function qo(A) {
  let e = gt(A);
  return typeof e == "number" ? e : null;
}
var bt = class {
  constructor(e, t = {}, r, n, i) {
    var o, s, a, I, g2, c2;
    this.config = t, this.cache = r, this.position = 0, this.isNull = false, this.isNegative = false, this.context = {}, this.context.device = n;
    let B = e.trim().split(":"), E = [];
    B.length === 1 ? this.string = e : (this.string = (o = B.pop()) !== null && o !== void 0 ? o : "", E = B), this.char = this.string[0];
    let Q = Ko((s = this.config.theme) === null || s === void 0 ? void 0 : s.screens);
    for (let d2 of E)
      if (Q[d2]) {
        let m2 = (a = Q[d2]) === null || a === void 0 ? void 0 : a[2];
        m2 !== void 0 && (this.order = ((I = this.order) !== null && I !== void 0 ? I : 0) + m2);
        let D = (g2 = n.windowDimensions) === null || g2 === void 0 ? void 0 : g2.width;
        if (D) {
          let [x2, y] = (c2 = Q[d2]) !== null && c2 !== void 0 ? c2 : [0, 0];
          (D <= x2 || D > y) && (this.isNull = true);
        } else
          this.isNull = true;
      } else
        LI(d2) ? this.isNull = d2 !== i : GI(d2) ? n.windowDimensions ? (n.windowDimensions.width > n.windowDimensions.height ? "landscape" : "portrait") !== d2 ? this.isNull = true : this.incrementOrder() : this.isNull = true : d2 === "retina" ? n.pixelDensity === 2 ? this.incrementOrder() : this.isNull = true : d2 === "dark" ? n.colorScheme !== "dark" ? this.isNull = true : this.incrementOrder() : this.handlePossibleArbitraryBreakpointPrefix(d2) || (this.isNull = true);
  }
  parse() {
    if (this.isNull)
      return { kind: "null" };
    let e = this.cache.getIr(this.rest);
    if (e)
      return e;
    this.parseIsNegative();
    let t = this.parseUtility();
    return t ? this.order !== void 0 ? { kind: "ordered", order: this.order, styleIr: t } : t : { kind: "null" };
  }
  parseUtility() {
    var e, t, r, n, i;
    let o = this.config.theme, s = null;
    switch (this.char) {
      case "m":
      case "p": {
        let a = this.peekSlice(1, 3).match(/^(t|b|r|l|x|y)?-/);
        if (a) {
          let I = this.char === "m" ? "margin" : "padding";
          this.advance(((t = (e = a[0]) === null || e === void 0 ? void 0 : e.length) !== null && t !== void 0 ? t : 0) + 1);
          let g2 = Ho(a[1]), c2 = Jo(I, g2, this.isNegative, this.rest, (r = this.config.theme) === null || r === void 0 ? void 0 : r[I]);
          if (c2)
            return c2;
        }
      }
    }
    if (this.consumePeeked("h-") && (s = Yo("height", this.rest, this.context, o == null ? void 0 : o.height), s) || this.consumePeeked("w-") && (s = Yo("width", this.rest, this.context, o == null ? void 0 : o.width), s) || this.consumePeeked("min-w-") && (s = Sr("minWidth", this.rest, this.context, o == null ? void 0 : o.minWidth), s) || this.consumePeeked("min-h-") && (s = Sr("minHeight", this.rest, this.context, o == null ? void 0 : o.minHeight), s) || this.consumePeeked("max-w-") && (s = Sr("maxWidth", this.rest, this.context, o == null ? void 0 : o.maxWidth), s) || this.consumePeeked("max-h-") && (s = Sr("maxHeight", this.rest, this.context, o == null ? void 0 : o.maxHeight), s) || this.consumePeeked("leading-") && (s = _o(this.rest, o == null ? void 0 : o.lineHeight), s) || this.consumePeeked("text-") && (s = Po(this.rest, o == null ? void 0 : o.fontSize, this.context), s || (s = It("text", this.rest, o == null ? void 0 : o.textColor), s) || this.consumePeeked("opacity-") && (s = wr("text", this.rest), s)) || this.consumePeeked("font-") && (s = Wo(this.rest, o == null ? void 0 : o.fontFamily), s) || this.consumePeeked("aspect-") && (this.consumePeeked("ratio-") && ZA("`aspect-ratio-{ratio}` is deprecated, use `aspect-{ratio}` instead"), s = _e("aspectRatio", this.rest, { fractions: true }), s) || this.consumePeeked("tint-") && (s = It("tint", this.rest, o == null ? void 0 : o.colors), s) || this.consumePeeked("bg-") && (s = It("bg", this.rest, o == null ? void 0 : o.backgroundColor), s || this.consumePeeked("opacity-") && (s = wr("bg", this.rest), s)) || this.consumePeeked("border") && (s = YI(this.rest, o), s || this.consumePeeked("-opacity-") && (s = wr("border", this.rest), s)) || this.consumePeeked("rounded") && (s = qI(this.rest, o == null ? void 0 : o.borderRadius), s) || this.consumePeeked("bottom-") && (s = St("bottom", this.rest, this.isNegative, o == null ? void 0 : o.inset), s) || this.consumePeeked("top-") && (s = St("top", this.rest, this.isNegative, o == null ? void 0 : o.inset), s) || this.consumePeeked("left-") && (s = St("left", this.rest, this.isNegative, o == null ? void 0 : o.inset), s) || this.consumePeeked("right-") && (s = St("right", this.rest, this.isNegative, o == null ? void 0 : o.inset), s) || this.consumePeeked("inset-") && (s = St("inset", this.rest, this.isNegative, o == null ? void 0 : o.inset), s) || this.consumePeeked("flex-") && (this.consumePeeked("grow") ? s = Dr("Grow", this.rest, o == null ? void 0 : o.flexGrow) : this.consumePeeked("shrink") ? s = Dr("Shrink", this.rest, o == null ? void 0 : o.flexShrink) : s = VI(this.rest, o == null ? void 0 : o.flex), s) || this.consumePeeked("grow") && (s = Dr("Grow", this.rest, o == null ? void 0 : o.flexGrow), s) || this.consumePeeked("shrink") && (s = Dr("Shrink", this.rest, o == null ? void 0 : o.flexShrink), s) || this.consumePeeked("shadow-color-opacity-") && (s = wr("shadow", this.rest), s) || this.consumePeeked("shadow-opacity-") && (s = jI(this.rest), s) || this.consumePeeked("shadow-offset-") && (s = $I(this.rest), s) || this.consumePeeked("shadow-radius-") && (s = ce("shadowRadius", this.rest), s) || this.consumePeeked("shadow-") && (s = It("shadow", this.rest, o == null ? void 0 : o.colors), s))
      return s;
    if (this.consumePeeked("elevation-")) {
      let a = parseInt(this.rest, 10);
      if (!Number.isNaN(a))
        return w2({ elevation: a });
    }
    if (this.consumePeeked("opacity-") && (s = ZI(this.rest, o == null ? void 0 : o.opacity), s) || this.consumePeeked("tracking-") && (s = zI(this.rest, this.isNegative, o == null ? void 0 : o.letterSpacing), s))
      return s;
    if (this.consumePeeked("z-")) {
      let a = Number((i = (n = o == null ? void 0 : o.zIndex) === null || n === void 0 ? void 0 : n[this.rest]) !== null && i !== void 0 ? i : this.rest);
      if (!Number.isNaN(a))
        return w2({ zIndex: a });
    }
    return ZA(`\`${this.rest}\` unknown or invalid utility`), null;
  }
  handlePossibleArbitraryBreakpointPrefix(e) {
    var t;
    if (e[0] !== "m")
      return false;
    let r = e.match(/^(min|max)-(w|h)-\[([^\]]+)\]$/);
    if (!r)
      return false;
    if (!(!((t = this.context.device) === null || t === void 0) && t.windowDimensions))
      return this.isNull = true, true;
    let n = this.context.device.windowDimensions, [, i = "", o = "", s = ""] = r, a = o === "w" ? n.width : n.height, I = LA(s, this.context);
    if (I === null)
      return this.isNull = true, true;
    let [g2, c2] = I;
    return c2 !== "px" && (this.isNull = true), (i === "min" ? a >= g2 : a <= g2) ? this.incrementOrder() : this.isNull = true, true;
  }
  advance(e = 1) {
    this.position += e, this.char = this.string[this.position];
  }
  get rest() {
    return this.peekSlice(0, this.string.length);
  }
  peekSlice(e, t) {
    return this.string.slice(this.position + e, this.position + t);
  }
  consumePeeked(e) {
    return this.peekSlice(0, e.length) === e ? (this.advance(e.length), true) : false;
  }
  parseIsNegative() {
    this.char === "-" && (this.advance(), this.isNegative = true, this.context.isNegative = true);
  }
  incrementOrder() {
    var e;
    this.order = ((e = this.order) !== null && e !== void 0 ? e : 0) + 1;
  }
};
function Au(A) {
  let e = [], t = null;
  return A.forEach((r) => {
    if (typeof r == "string")
      e = [...e, ...Xo(r)];
    else if (Array.isArray(r))
      e = [...e, ...r.flatMap(Xo)];
    else if (typeof r == "object" && r !== null)
      for (let [n, i] of Object.entries(r))
        typeof i == "boolean" ? e = [...e, ...i ? Xo(n) : []] : t ? t[n] = i : t = { [n]: i };
  }), [e.filter(Boolean).filter(YC), t];
}
function Xo(A) {
  return A.trim().split(/\s+/);
}
function YC(A, e, t) {
  return t.indexOf(A) === e;
}
function eu(A) {
  var e;
  return (e = A == null ? void 0 : A.reduce((t, r) => ({ ...t, ...qC(r.handler) }), {})) !== null && e !== void 0 ? e : {};
}
function qC(A) {
  let e = {};
  return A({ addUtilities: (t) => {
    e = t;
  }, ...XC }), e;
}
function ve(A) {
  throw new Error(`tailwindcss plugin function argument object prop "${A}" not implemented`);
}
var XC = { addComponents: ve, addBase: ve, addVariant: ve, e: ve, prefix: ve, theme: ve, variants: ve, config: ve, corePlugins: ve, matchUtilities: ve, postcss: null };
function ru(A, e) {
  let t = (0, tu.default)(VC(A)), r = {}, n = eu(t.plugins), i = {}, o = Object.entries(n).map(([Q, d2]) => typeof d2 == "string" ? (i[Q] = d2, [Q, { kind: "null" }]) : [Q, w2(d2)]).filter(([, Q]) => Q.kind !== "null");
  function s() {
    return [r.windowDimensions ? `w${r.windowDimensions.width}` : false, r.windowDimensions ? `h${r.windowDimensions.height}` : false, r.fontScale ? `fs${r.fontScale}` : false, r.colorScheme === "dark" ? "dark" : false, r.pixelDensity === 2 ? "retina" : false].filter(Boolean).join("--") || "default";
  }
  let a = s(), I = {};
  function g2() {
    let Q = I[a];
    if (Q)
      return Q;
    let d2 = new yr(o);
    return I[a] = d2, d2;
  }
  function c2(...Q) {
    let d2 = g2(), m2 = {}, D = [], x2 = [], [y, p] = Au(Q), b = y.join(" "), R2 = d2.getStyle(b);
    if (R2)
      return { ...R2, ...p || {} };
    for (let U of y) {
      let P2 = d2.getIr(U);
      if (!P2 && U in i) {
        let lA = c2(i[U]);
        d2.setIr(U, w2(lA)), m2 = { ...m2, ...lA };
        continue;
      }
      switch (P2 = new bt(U, t, d2, r, e).parse(), P2.kind) {
        case "complete":
          m2 = { ...m2, ...P2.style }, d2.setIr(U, P2);
          break;
        case "dependent":
          D.push(P2);
          break;
        case "ordered":
          x2.push(P2);
          break;
        case "null":
          d2.setIr(U, P2);
          break;
      }
    }
    if (x2.length > 0) {
      x2.sort((U, P2) => U.order - P2.order);
      for (let U of x2)
        switch (U.styleIr.kind) {
          case "complete":
            m2 = { ...m2, ...U.styleIr.style };
            break;
          case "dependent":
            D.push(U.styleIr);
            break;
        }
    }
    if (D.length > 0) {
      for (let U of D) {
        let P2 = U.complete(m2);
        P2 && ZA(P2);
      }
      JI(m2);
    }
    return b !== "" && d2.setStyle(b, m2), p && (m2 = { ...m2, ...p }), m2;
  }
  function B(Q) {
    let d2 = c2(Q.split(/\s+/g).map((m2) => m2.replace(/^(bg|text|border)-/, "")).map((m2) => `bg-${m2}`).join(" "));
    return typeof d2.backgroundColor == "string" ? d2.backgroundColor : void 0;
  }
  let E = (Q, ...d2) => {
    let m2 = "";
    return Q.forEach((D, x2) => {
      var y;
      m2 += D + ((y = d2[x2]) !== null && y !== void 0 ? y : "");
    }), c2(m2);
  };
  return E.style = c2, E.color = B, E.prefixMatch = (...Q) => {
    let d2 = Q.sort().join(":"), m2 = g2(), D = m2.getPrefixMatch(d2);
    if (D !== void 0)
      return D;
    let p = new bt(`${d2}:flex`, t, m2, r, e).parse().kind !== "null";
    return m2.setPrefixMatch(d2, p), p;
  }, E.setWindowDimensions = (Q) => {
    r.windowDimensions = Q, a = s();
  }, E.setFontScale = (Q) => {
    r.fontScale = Q, a = s();
  }, E.setPixelDensity = (Q) => {
    r.pixelDensity = Q, a = s();
  }, E.setColorScheme = (Q) => {
    r.colorScheme = Q, a = s();
  }, E;
}
function VC(A) {
  return { ...A, content: ["_no_warnings_please"] };
}
var ZC = { handler: ({ addUtilities: A }) => {
  A({ "shadow-sm": { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }, shadow: { boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" }, "shadow-md": { boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }, "shadow-lg": { boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }, "shadow-xl": { boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }, "shadow-2xl": { boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)" }, "shadow-inner": { boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" }, "shadow-none": { boxShadow: "0 0 #0000" } });
} };
function jC(A) {
  return ru({ ...A, plugins: [...(A == null ? void 0 : A.plugins) ?? [], ZC] }, "web");
}
var wn;
function Vo({ width: A, height: e, config: t }) {
  return wn || (wn = jC(t)), wn.setWindowDimensions({ width: +A, height: +e }), wn;
}
var zo = /* @__PURE__ */ new WeakMap();
async function iu(A, e) {
  let t = await Ye();
  if (!t || !t.Node)
    throw new Error("Satori is not initialized: expect `yoga` to be loaded, got " + t);
  e.fonts = e.fonts || [];
  let r;
  zo.has(e.fonts) ? r = zo.get(e.fonts) : zo.set(e.fonts, r = new Wt(e.fonts));
  let n = "width" in e ? e.width : void 0, i = "height" in e ? e.height : void 0, o = $C(t, e.pointScaleFactor);
  n && o.setWidth(n), i && o.setHeight(i), o.setFlexDirection(t.FLEX_DIRECTION_ROW), o.setFlexWrap(t.WRAP_WRAP), o.setAlignContent(t.ALIGN_AUTO), o.setAlignItems(t.ALIGN_FLEX_START), o.setJustifyContent(t.JUSTIFY_FLEX_START), o.setOverflow(t.OVERFLOW_HIDDEN);
  let s = Object.assign(/* @__PURE__ */ Object.create(null), e.graphemeImages), a = /* @__PURE__ */ new Set();
  ke.clear(), Mt.clear(), await Us(A);
  let I = Jt(A, { id: "id", parentStyle: {}, inheritedStyle: { fontSize: 16, fontWeight: "normal", fontFamily: "serif", fontStyle: "normal", lineHeight: "normal", color: "black", opacity: 1, whiteSpace: "normal", _viewportWidth: n, _viewportHeight: i }, parent: o, font: r, embedFont: e.embedFont, debug: e.debug, graphemeImages: s, canLoadAdditionalAssets: !!e.loadAdditionalAsset, onNodeDetected: e.onNodeDetected, getTwStyles: (Q, d2) => {
    let D = { ...Vo({ width: n, height: i, config: e.tailwindConfig })([Q]) };
    return typeof D.lineHeight == "number" && (D.lineHeight = D.lineHeight / (+D.fontSize || d2.fontSize || 16)), D.shadowColor && D.boxShadow && (D.boxShadow = D.boxShadow.replace(/rgba?\([^)]+\)/, D.shadowColor)), D;
  } }), g2 = (await I.next()).value;
  if (e.loadAdditionalAsset && g2.length) {
    let Q = Ad(g2), d2 = [], m2 = {};
    await Promise.all(Object.entries(Q).flatMap(([D, x2]) => x2.map((y) => {
      let p = `${D}_${y}`;
      return a.has(p) ? null : (a.add(p), e.loadAdditionalAsset(D, y).then((b) => {
        typeof b == "string" ? m2[y] = b : b && (Array.isArray(b) ? d2.push(...b) : d2.push(b));
      }));
    }))), r.addFonts(d2), Object.assign(s, m2);
  }
  await I.next(), o.calculateLayout(n, i, t.DIRECTION_LTR);
  let c2 = (await I.next([0, 0])).value, B = o.getComputedWidth(), E = o.getComputedHeight();
  return o.freeRecursive(), si({ width: B, height: E, content: c2 });
}
function $C(A, e) {
  if (e) {
    let t = A.Config.create();
    return t.setPointScaleFactor(e), A.Node.createWithConfig(t);
  } else
    return A.Node.create();
}
function Ad(A) {
  let e = {}, t = {};
  for (let { word: r, locale: n } of A) {
    let i = pa(r, n).join("|");
    t[i] = t[i] || "", t[i] += r;
  }
  return Object.keys(t).forEach((r) => {
    e[r] = e[r] || [], r === "emoji" ? e[r].push(...nu(WA(t[r], "grapheme"))) : (e[r][0] = e[r][0] || "", e[r][0] += nu(WA(t[r], "grapheme", r === "unknown" ? void 0 : r)).join(""));
  }), e;
}
function nu(A) {
  return Array.from(new Set(A));
}

// node_modules/.pnpm/@resvg+resvg-wasm@2.4.1/node_modules/@resvg/resvg-wasm/index.mjs
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

// src/index.node.ts
import { Readable } from "stream";
import fs2 from "fs";
import { fileURLToPath } from "url";

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
  async detect(text, fonts2) {
    await this.load(fonts2);
    const result = {};
    for (const segment of text) {
      const lang = this.detectSegment(segment, fonts2);
      if (lang) {
        result[lang] = result[lang] || "";
        result[lang] += segment;
      }
    }
    return result;
  }
  detectSegment(segment, fonts2) {
    for (const font of fonts2) {
      const range = this.rangesByLang[font];
      if (range && checkSegmentInRange(segment, range)) {
        return font;
      }
    }
    return null;
  }
  async load(fonts2) {
    let params = "";
    const existingLang = Object.keys(this.rangesByLang);
    const langNeedsToLoad = fonts2.filter((font) => !existingLang.includes(font));
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
      const fonts2 = Object.keys(textByFont);
      const fontData2 = await Promise.all(
        fonts2.map((font) => loadGoogleFont(font, textByFont[font]))
      );
      return fontData2.map((data, index) => ({
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
async function render(satori2, resvg, sharp, opts, defaultFonts, element) {
  const options = Object.assign(
    {
      width: 1200,
      height: 630,
      debug: false
    },
    opts
  );
  const svg = await satori2(element, {
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

// src/index.node.ts
var satori = iu.default || iu;
var fontData = fs2.readFileSync(
  fileURLToPath(new URL("./Geist-Regular.ttf", import.meta.url))
);
var resvg_wasm = fs2.readFileSync(
  fileURLToPath(new URL("./resvg.wasm", import.meta.url))
);
var fonts = [
  {
    name: "geist",
    data: fontData,
    weight: 400,
    style: "normal"
  }
];
var initializedResvg = initWasm(resvg_wasm);
var _sharp;
async function getSharp() {
  if (_sharp) {
    return _sharp;
  }
  try {
    _sharp = (await import("sharp")).default;
  } catch (e) {
    return void 0;
  }
  return _sharp;
}
var ImageResponse = class extends Response {
  constructor(element, options = {}) {
    if (typeof Response === "undefined" || typeof ReadableStream === "undefined") {
      throw new Error(
        "The `ImageResponse` API is not supported in this runtime, use the `unstable_createNodejsStream` API instead or switch to the Vercel Edge Runtime."
      );
    }
    const result = new ReadableStream({
      async start(controller) {
        await initializedResvg;
        const result2 = await render(
          satori,
          resvg_wasm_exports,
          await getSharp(),
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
async function unstable_createNodejsStream(element, options = {}) {
  await initializedResvg;
  const fonts2 = [
    {
      name: "sans serif",
      data: fontData,
      weight: 700,
      style: "normal"
    }
  ];
  const result = await render(
    satori,
    resvg_wasm_exports,
    await getSharp(),
    options,
    fonts2,
    element
  );
  return Readable.from(Buffer.from(result));
}
export {
  ImageResponse,
  unstable_createNodejsStream
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
//# sourceMappingURL=index.node.js.map