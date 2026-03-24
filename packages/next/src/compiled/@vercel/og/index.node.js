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
    function tinf_build_fixed_trees(lt, dt) {
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
        dt.table[i] = 0;
      dt.table[5] = 32;
      for (i = 0; i < 32; ++i)
        dt.trans[i] = i;
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
    function tinf_decode_trees(d2, lt, dt) {
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
      tinf_build_tree(dt, lengths, hlit, hdist);
    }
    function tinf_inflate_block_data(d2, lt, dt) {
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
          dist = tinf_decode_symbol(d2, dt);
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
      return str.replace(/[_.-](\w|$)/g, function(_, x2) {
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/index.js
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/index.js
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/index.js
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
  var co2;
  if (r) {
    co2 = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v2 = le[cd[i] - 1]++ << r_1;
        for (var m2 = v2 | (1 << r_1) - 1; v2 <= m2; ++v2) {
          co2[rev[v2] >>> rvb] = sv;
        }
      }
    }
  } else {
    co2 = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co2[i] = rev[le[cd[i] - 1]++] >>> 15 - cd[i];
      }
    }
  }
  return co2;
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
    var bl2 = buf.length;
    if (l3 > bl2) {
      var nbuf = new u8(Math.max(bl2 * 2, l3));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
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
          cbuf(bt + l2);
        }
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l2, st.p = pos = t * 8, st.f = final;
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
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
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
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
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
          buf[bt] = buf[bt - dt];
          buf[bt + 1] = buf[bt + 1 - dt];
          buf[bt + 2] = buf[bt + 2 - dt];
          buf[bt + 3] = buf[bt + 3 - dt];
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
    var dt;
    if (!pv || pv === this) {
      do1 = p.xo - rp1.xo;
      do2 = p.xo - rp2.xo;
      dm1 = rp1.x - rp1.xo;
      dm2 = rp2.x - rp2.xo;
      doa1 = Math.abs(do1);
      doa2 = Math.abs(do2);
      dt = doa1 + doa2;
      if (dt === 0) {
        p.x = p.xo + (dm1 + dm2) / 2;
        return;
      }
      p.x = p.xo + (dm1 * doa2 + dm2 * doa1) / dt;
      return;
    }
    do1 = pv.distance(p, rp1, true, true);
    do2 = pv.distance(p, rp2, true, true);
    dm1 = pv.distance(rp1, rp1, false, true);
    dm2 = pv.distance(rp2, rp2, false, true);
    doa1 = Math.abs(do1);
    doa2 = Math.abs(do2);
    dt = doa1 + doa2;
    if (dt === 0) {
      xUnitVector.setRelative(p, p, (dm1 + dm2) / 2, pv, true);
      return;
    }
    xUnitVector.setRelative(p, p, (dm1 * doa2 + dm2 * doa1) / dt, pv, true);
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
    var dt;
    if (!pv || pv === this) {
      do1 = p.yo - rp1.yo;
      do2 = p.yo - rp2.yo;
      dm1 = rp1.y - rp1.yo;
      dm2 = rp2.y - rp2.yo;
      doa1 = Math.abs(do1);
      doa2 = Math.abs(do2);
      dt = doa1 + doa2;
      if (dt === 0) {
        p.y = p.yo + (dm1 + dm2) / 2;
        return;
      }
      p.y = p.yo + (dm1 * doa2 + dm2 * doa1) / dt;
      return;
    }
    do1 = pv.distance(p, rp1, true, true);
    do2 = pv.distance(p, rp2, true, true);
    dm1 = pv.distance(rp1, rp1, false, true);
    dm2 = pv.distance(rp2, rp2, false, true);
    doa1 = Math.abs(do1);
    doa2 = Math.abs(do2);
    dt = doa1 + doa2;
    if (dt === 0) {
      yUnitVector.setRelative(p, p, (dm1 + dm2) / 2, pv, true);
      return;
    }
    yUnitVector.setRelative(p, p, (dm1 * doa2 + dm2 * doa1) / dt, pv, true);
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
  var dt;
  do1 = pv.distance(p, rp1, true, true);
  do2 = pv.distance(p, rp2, true, true);
  dm1 = pv.distance(rp1, rp1, false, true);
  dm2 = pv.distance(rp2, rp2, false, true);
  doa1 = Math.abs(do1);
  doa2 = Math.abs(do2);
  dt = doa1 + doa2;
  if (dt === 0) {
    this.setRelative(p, p, (dm1 + dm2) / 2, pv, true);
    return;
  }
  this.setRelative(p, p, (dm1 * doa2 + dm2 * doa1) / dt, pv, true);
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
      for (var pi2 = 0; pi2 < gz.length; pi2++) {
        var p = gz[pi2];
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
  var pi2 = stack.pop();
  var z0 = state.z0;
  var z1 = state.z1;
  var pa0 = z0[pa0i];
  var pa1 = z0[pa1i];
  var pb0 = z1[pb0i];
  var pb1 = z1[pb1i];
  var p = state.z2[pi2];
  if (exports.DEBUG) {
    console.log("ISECT[], ", pa0i, pa1i, pb0i, pb1i, pi2);
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
  var fn2 = stack.pop();
  var c2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "LOOPCALL[]", fn2, c2);
  }
  var cip = state.ip;
  var cprog = state.prog;
  state.prog = state.funcs[fn2];
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
  var fn2 = state.stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "CALL[]", fn2);
  }
  var cip = state.ip;
  var cprog = state.prog;
  state.prog = state.funcs[fn2];
  exec(state);
  state.ip = cip;
  state.prog = cprog;
  if (exports.DEBUG) {
    console.log(++state.step, "returning from", fn2);
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
  var fn2 = stack.pop();
  var ipBegin = ip;
  if (exports.DEBUG) {
    console.log(state.step, "FDEF[]", fn2);
  }
  while (prog[++ip] !== 45) {
  }
  state.ip = ip;
  state.funcs[fn2] = prog.slice(ipBegin + 1, ip);
}
function MDAP(round, state) {
  var pi2 = state.stack.pop();
  var p = state.z0[pi2];
  var fv = state.fv;
  var pv = state.pv;
  if (exports.DEBUG) {
    console.log(state.step, "MDAP[" + round + "]", pi2);
  }
  var d2 = pv.distance(p, HPZero);
  if (round) {
    d2 = state.round(d2);
  }
  fv.setRelative(p, HPZero, d2, pv);
  fv.touch(p);
  state.rp0 = state.rp1 = pi2;
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
    var pi2 = stack.pop();
    var p = z2[pi2];
    var d2 = pv.distance(rp, rp, false, true);
    fv.setRelative(p, p, d2, pv);
    fv.touch(p);
    if (exports.DEBUG) {
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHP[" + (a ? "rp1" : "rp2") + "]",
        pi2
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
    var pi2 = stack.pop();
    var p = z2[pi2];
    if (exports.DEBUG) {
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHPIX[]",
        pi2,
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
    var pi2 = stack.pop();
    var p = z2[pi2];
    if (exports.DEBUG) {
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "IP[]",
        pi2,
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
  var pi2 = stack.pop();
  var p = state.z1[pi2];
  var rp0 = state.z0[state.rp0];
  var fv = state.fv;
  var pv = state.pv;
  fv.setRelative(p, rp0, d2, pv);
  fv.touch(p);
  if (exports.DEBUG) {
    console.log(state.step, "MSIRP[" + a + "]", d2, pi2);
  }
  state.rp1 = state.rp0;
  state.rp2 = pi2;
  if (a) {
    state.rp0 = pi2;
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
    var pi2 = stack.pop();
    var p = z1[pi2];
    if (exports.DEBUG) {
      console.log(
        state.step,
        (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "ALIGNRP[]",
        pi2
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
  var pi2 = stack.pop();
  var p = state.z0[pi2];
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
      pi2
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
  state.rp0 = state.rp1 = pi2;
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
  var pi2 = stack.pop();
  var p = state.z2[pi2];
  if (exports.DEBUG) {
    console.log(state.step, "GC[" + a + "]", pi2);
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
    var pi2 = stack.pop();
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
      console.log(state.step, "DELTAPFIX", pi2, "by", mag * ds2);
    }
    var p = z0[pi2];
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
function ROUND(dt, state) {
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
    var w2 = prog[++ip] << 8 | prog[++ip];
    if (w2 & 32768) {
      w2 = -((w2 ^ 65535) + 1);
    }
    stack.push(w2);
  }
  state.ip = ip;
}
function MDRP_MIRP(indirect, setRp0, keepD, ro, dt, state) {
  var stack = state.stack;
  var cvte = indirect && stack.pop();
  var pi2 = stack.pop();
  var rp0i = state.rp0;
  var rp = state.z0[rp0i];
  var p = state.z1[pi2];
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
      (indirect ? "MIRP[" : "MDRP[") + (setRp0 ? "M" : "m") + (keepD ? ">" : "_") + (ro ? "R" : "_") + (dt === 0 ? "Gr" : dt === 1 ? "Bl" : dt === 2 ? "Wh" : "") + "]",
      indirect ? cvte + "(" + state.cvt[cvte] + "," + cv + ")" : "",
      pi2,
      "(d =",
      od,
      "->",
      sign * d2,
      ")"
    );
  }
  state.rp1 = state.rp0;
  state.rp2 = pi2;
  if (setRp0) {
    state.rp0 = pi2;
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

// node_modules/.pnpm/satori@0.25.0/node_modules/satori/dist/index.js
var cI = Object.create;
var Kr = Object.defineProperty;
var fI = Object.getOwnPropertyDescriptor;
var BI = Object.getOwnPropertyNames;
var EI = Object.getPrototypeOf;
var QI = Object.prototype.hasOwnProperty;
var Xe = (A, e) => () => (A && (e = A(A = 0)), e);
var K2 = (A, e) => () => (e || A((e = { exports: {} }).exports, e), e.exports);
var kt = (A, e) => {
  for (var t in e)
    Kr(A, t, { get: e[t], enumerable: true });
};
var cs = (A, e, t, r) => {
  if (e && typeof e == "object" || typeof e == "function")
    for (let n of BI(e))
      !QI.call(A, n) && n !== t && Kr(A, n, { get: () => e[n], enumerable: !(r = fI(e, n)) || r.enumerable });
  return A;
};
var CI = (A, e, t) => (t = A != null ? cI(EI(A)) : {}, cs(e || !A || !A.__esModule ? Kr(t, "default", { value: A, enumerable: true }) : t, A));
var Yr = (A) => cs(Kr({}, "__esModule", { value: true }), A);
var ze;
var vs;
var ks;
var qt;
var _n;
var Ze;
var Mt;
var NI;
var zr;
var Jn;
var Ft;
var Lt;
var Wn;
var xs;
var Kn;
var Yn;
var Oe;
var qn;
var MI;
var Rs;
var Zr = Xe(() => {
  ze = function(A) {
    return A[A.Auto = 0] = "Auto", A[A.FlexStart = 1] = "FlexStart", A[A.Center = 2] = "Center", A[A.FlexEnd = 3] = "FlexEnd", A[A.Stretch = 4] = "Stretch", A[A.Baseline = 5] = "Baseline", A[A.SpaceBetween = 6] = "SpaceBetween", A[A.SpaceAround = 7] = "SpaceAround", A[A.SpaceEvenly = 8] = "SpaceEvenly", A;
  }({}), vs = function(A) {
    return A[A.BorderBox = 0] = "BorderBox", A[A.ContentBox = 1] = "ContentBox", A;
  }({}), ks = function(A) {
    return A[A.Width = 0] = "Width", A[A.Height = 1] = "Height", A;
  }({}), qt = function(A) {
    return A[A.Inherit = 0] = "Inherit", A[A.LTR = 1] = "LTR", A[A.RTL = 2] = "RTL", A;
  }({}), _n = function(A) {
    return A[A.Flex = 0] = "Flex", A[A.None = 1] = "None", A[A.Contents = 2] = "Contents", A;
  }({}), Ze = function(A) {
    return A[A.Left = 0] = "Left", A[A.Top = 1] = "Top", A[A.Right = 2] = "Right", A[A.Bottom = 3] = "Bottom", A[A.Start = 4] = "Start", A[A.End = 5] = "End", A[A.Horizontal = 6] = "Horizontal", A[A.Vertical = 7] = "Vertical", A[A.All = 8] = "All", A;
  }({}), Mt = function(A) {
    return A[A.None = 0] = "None", A[A.StretchFlexBasis = 1] = "StretchFlexBasis", A[A.AbsolutePositionWithoutInsetsExcludesPadding = 2] = "AbsolutePositionWithoutInsetsExcludesPadding", A[A.AbsolutePercentAgainstInnerSize = 4] = "AbsolutePercentAgainstInnerSize", A[A.All = 2147483647] = "All", A[A.Classic = 2147483646] = "Classic", A;
  }({}), NI = function(A) {
    return A[A.WebFlexBasis = 0] = "WebFlexBasis", A;
  }({}), zr = function(A) {
    return A[A.Column = 0] = "Column", A[A.ColumnReverse = 1] = "ColumnReverse", A[A.Row = 2] = "Row", A[A.RowReverse = 3] = "RowReverse", A;
  }({}), Jn = function(A) {
    return A[A.Column = 0] = "Column", A[A.Row = 1] = "Row", A[A.All = 2] = "All", A;
  }({}), Ft = function(A) {
    return A[A.FlexStart = 0] = "FlexStart", A[A.Center = 1] = "Center", A[A.FlexEnd = 2] = "FlexEnd", A[A.SpaceBetween = 3] = "SpaceBetween", A[A.SpaceAround = 4] = "SpaceAround", A[A.SpaceEvenly = 5] = "SpaceEvenly", A;
  }({}), Lt = function(A) {
    return A[A.Error = 0] = "Error", A[A.Warn = 1] = "Warn", A[A.Info = 2] = "Info", A[A.Debug = 3] = "Debug", A[A.Verbose = 4] = "Verbose", A[A.Fatal = 5] = "Fatal", A;
  }({}), Wn = function(A) {
    return A[A.Undefined = 0] = "Undefined", A[A.Exactly = 1] = "Exactly", A[A.AtMost = 2] = "AtMost", A;
  }({}), xs = function(A) {
    return A[A.Default = 0] = "Default", A[A.Text = 1] = "Text", A;
  }({}), Kn = function(A) {
    return A[A.Visible = 0] = "Visible", A[A.Hidden = 1] = "Hidden", A[A.Scroll = 2] = "Scroll", A;
  }({}), Yn = function(A) {
    return A[A.Static = 0] = "Static", A[A.Relative = 1] = "Relative", A[A.Absolute = 2] = "Absolute", A;
  }({}), Oe = function(A) {
    return A[A.Undefined = 0] = "Undefined", A[A.Point = 1] = "Point", A[A.Percent = 2] = "Percent", A[A.Auto = 3] = "Auto", A;
  }({}), qn = function(A) {
    return A[A.NoWrap = 0] = "NoWrap", A[A.Wrap = 1] = "Wrap", A[A.WrapReverse = 2] = "WrapReverse", A;
  }({}), MI = { ALIGN_AUTO: ze.Auto, ALIGN_FLEX_START: ze.FlexStart, ALIGN_CENTER: ze.Center, ALIGN_FLEX_END: ze.FlexEnd, ALIGN_STRETCH: ze.Stretch, ALIGN_BASELINE: ze.Baseline, ALIGN_SPACE_BETWEEN: ze.SpaceBetween, ALIGN_SPACE_AROUND: ze.SpaceAround, ALIGN_SPACE_EVENLY: ze.SpaceEvenly, BOX_SIZING_BORDER_BOX: vs.BorderBox, BOX_SIZING_CONTENT_BOX: vs.ContentBox, DIMENSION_WIDTH: ks.Width, DIMENSION_HEIGHT: ks.Height, DIRECTION_INHERIT: qt.Inherit, DIRECTION_LTR: qt.LTR, DIRECTION_RTL: qt.RTL, DISPLAY_FLEX: _n.Flex, DISPLAY_NONE: _n.None, DISPLAY_CONTENTS: _n.Contents, EDGE_LEFT: Ze.Left, EDGE_TOP: Ze.Top, EDGE_RIGHT: Ze.Right, EDGE_BOTTOM: Ze.Bottom, EDGE_START: Ze.Start, EDGE_END: Ze.End, EDGE_HORIZONTAL: Ze.Horizontal, EDGE_VERTICAL: Ze.Vertical, EDGE_ALL: Ze.All, ERRATA_NONE: Mt.None, ERRATA_STRETCH_FLEX_BASIS: Mt.StretchFlexBasis, ERRATA_ABSOLUTE_POSITION_WITHOUT_INSETS_EXCLUDES_PADDING: Mt.AbsolutePositionWithoutInsetsExcludesPadding, ERRATA_ABSOLUTE_PERCENT_AGAINST_INNER_SIZE: Mt.AbsolutePercentAgainstInnerSize, ERRATA_ALL: Mt.All, ERRATA_CLASSIC: Mt.Classic, EXPERIMENTAL_FEATURE_WEB_FLEX_BASIS: NI.WebFlexBasis, FLEX_DIRECTION_COLUMN: zr.Column, FLEX_DIRECTION_COLUMN_REVERSE: zr.ColumnReverse, FLEX_DIRECTION_ROW: zr.Row, FLEX_DIRECTION_ROW_REVERSE: zr.RowReverse, GUTTER_COLUMN: Jn.Column, GUTTER_ROW: Jn.Row, GUTTER_ALL: Jn.All, JUSTIFY_FLEX_START: Ft.FlexStart, JUSTIFY_CENTER: Ft.Center, JUSTIFY_FLEX_END: Ft.FlexEnd, JUSTIFY_SPACE_BETWEEN: Ft.SpaceBetween, JUSTIFY_SPACE_AROUND: Ft.SpaceAround, JUSTIFY_SPACE_EVENLY: Ft.SpaceEvenly, LOG_LEVEL_ERROR: Lt.Error, LOG_LEVEL_WARN: Lt.Warn, LOG_LEVEL_INFO: Lt.Info, LOG_LEVEL_DEBUG: Lt.Debug, LOG_LEVEL_VERBOSE: Lt.Verbose, LOG_LEVEL_FATAL: Lt.Fatal, MEASURE_MODE_UNDEFINED: Wn.Undefined, MEASURE_MODE_EXACTLY: Wn.Exactly, MEASURE_MODE_AT_MOST: Wn.AtMost, NODE_TYPE_DEFAULT: xs.Default, NODE_TYPE_TEXT: xs.Text, OVERFLOW_VISIBLE: Kn.Visible, OVERFLOW_HIDDEN: Kn.Hidden, OVERFLOW_SCROLL: Kn.Scroll, POSITION_TYPE_STATIC: Yn.Static, POSITION_TYPE_RELATIVE: Yn.Relative, POSITION_TYPE_ABSOLUTE: Yn.Absolute, UNIT_UNDEFINED: Oe.Undefined, UNIT_POINT: Oe.Point, UNIT_PERCENT: Oe.Percent, UNIT_AUTO: Oe.Auto, WRAP_NO_WRAP: qn.NoWrap, WRAP_WRAP: qn.Wrap, WRAP_WRAP_REVERSE: qn.WrapReverse }, Rs = MI;
});
function Xn(A) {
  function e(n, i, o) {
    let a = n[i];
    n[i] = function() {
      for (var u2 = arguments.length, l2 = new Array(u2), I = 0; I < u2; I++)
        l2[I] = arguments[I];
      return o.call(this, a, ...l2);
    };
  }
  for (let n of ["setPosition", "setMargin", "setFlexBasis", "setWidth", "setHeight", "setMinWidth", "setMinHeight", "setMaxWidth", "setMaxHeight", "setPadding", "setGap"]) {
    let i = { [Oe.Point]: A.Node.prototype[n], [Oe.Percent]: A.Node.prototype[`${n}Percent`], [Oe.Auto]: A.Node.prototype[`${n}Auto`] };
    e(A.Node.prototype, n, function(o) {
      for (var a = arguments.length, u2 = new Array(a > 1 ? a - 1 : 0), l2 = 1; l2 < a; l2++)
        u2[l2 - 1] = arguments[l2];
      let I = u2.pop(), E, C;
      if (I === "auto")
        E = Oe.Auto, C = void 0;
      else if (typeof I == "object")
        E = I.unit, C = I.valueOf();
      else if (E = typeof I == "string" && I.endsWith("%") ? Oe.Percent : Oe.Point, C = parseFloat(I), I !== void 0 && !Number.isNaN(I) && Number.isNaN(C))
        throw new Error(`Invalid value ${I} for ${n}`);
      if (!i[E])
        throw new Error(`Failed to execute "${n}": Unsupported unit '${I}'`);
      return C !== void 0 ? i[E].call(this, ...u2, C) : i[E].call(this, ...u2);
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
    let i = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : NaN, o = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : NaN, a = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : qt.LTR;
    return n.call(this, i, o, a);
  }), { Config: A.Config, Node: A.Node, ...Rs };
}
var Ns = Xe(() => {
  Zr();
  Zr();
});
var Fs = {};
kt(Fs, { default: () => FI });
function FI(A) {
  A = A || {};
  var e;
  e || (e = typeof A < "u" ? A : {});
  var t, r;
  e.ready = new Promise(function(f, s) {
    t = f, r = s;
  });
  var n = Object.assign({}, e), i = "";
  typeof document < "u" && document.currentScript && (i = document.currentScript.src), Ms && (i = Ms), i.indexOf("blob:") !== 0 ? i = i.substr(0, i.replace(/[?#].*/, "").lastIndexOf("/") + 1) : i = "";
  var o = e.print || console.log.bind(console), a = e.printErr || console.warn.bind(console);
  Object.assign(e, n), n = null;
  var u2;
  e.wasmBinary && (u2 = e.wasmBinary);
  var l2 = e.noExitRuntime || true;
  typeof WebAssembly != "object" && rA("no native wasm support detected");
  var I, E = false;
  function C(f, s, g2) {
    g2 = s + g2;
    for (var c2 = ""; !(s >= g2); ) {
      var B = f[s++];
      if (!B)
        break;
      if (B & 128) {
        var Q = f[s++] & 63;
        if ((B & 224) == 192)
          c2 += String.fromCharCode((B & 31) << 6 | Q);
        else {
          var h2 = f[s++] & 63;
          B = (B & 240) == 224 ? (B & 15) << 12 | Q << 6 | h2 : (B & 7) << 18 | Q << 12 | h2 << 6 | f[s++] & 63, 65536 > B ? c2 += String.fromCharCode(B) : (B -= 65536, c2 += String.fromCharCode(55296 | B >> 10, 56320 | B & 1023));
        }
      } else
        c2 += String.fromCharCode(B);
    }
    return c2;
  }
  var d2, p, y, k, x2, F, b, v2, M;
  function L() {
    var f = I.buffer;
    d2 = f, e.HEAP8 = p = new Int8Array(f), e.HEAP16 = k = new Int16Array(f), e.HEAP32 = F = new Int32Array(f), e.HEAPU8 = y = new Uint8Array(f), e.HEAPU16 = x2 = new Uint16Array(f), e.HEAPU32 = b = new Uint32Array(f), e.HEAPF32 = v2 = new Float32Array(f), e.HEAPF64 = M = new Float64Array(f);
  }
  var O, J = [], j = [], CA = [];
  function MA() {
    var f = e.preRun.shift();
    J.unshift(f);
  }
  var dA = 0, sA = null, vA = null;
  function rA(f) {
    throw e.onAbort && e.onAbort(f), f = "Aborted(" + f + ")", a(f), E = true, f = new WebAssembly.RuntimeError(f + ". Build with -sASSERTIONS for more info."), r(f), f;
  }
  function iA(f) {
    return f.startsWith("data:application/octet-stream;base64,");
  }
  var wA = "";
  if (!iA(wA)) {
    var aA = wA;
    wA = e.locateFile ? e.locateFile(aA, i) : i + aA;
  }
  function FA() {
    var f = wA;
    try {
      if (f == wA && u2)
        return new Uint8Array(u2);
      if (iA(f))
        try {
          var s = bt(f.slice(37)), g2 = new Uint8Array(s.length);
          for (f = 0; f < s.length; ++f)
            g2[f] = s.charCodeAt(f);
          var c2 = g2;
        } catch {
          throw Error("Converting base64 string to bytes failed.");
        }
      else
        c2 = void 0;
      var B = c2;
      if (B)
        return B;
      throw "both async and sync fetching of the wasm failed";
    } catch (Q) {
      rA(Q);
    }
  }
  function kA() {
    return u2 || typeof fetch != "function" ? Promise.resolve().then(function() {
      return FA();
    }) : fetch(wA, { credentials: "same-origin" }).then(function(f) {
      if (!f.ok)
        throw "failed to load wasm binary file at '" + wA + "'";
      return f.arrayBuffer();
    }).catch(function() {
      return FA();
    });
  }
  function te(f) {
    for (; 0 < f.length; )
      f.shift()(e);
  }
  function TA(f) {
    if (f === void 0)
      return "_unknown";
    f = f.replace(/[^a-zA-Z0-9_]/g, "$");
    var s = f.charCodeAt(0);
    return 48 <= s && 57 >= s ? "_" + f : f;
  }
  function xA(f, s) {
    return f = TA(f), function() {
      return s.apply(this, arguments);
    };
  }
  var fA = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }], q = [];
  function oA(f) {
    var s = Error, g2 = xA(f, function(c2) {
      this.name = f, this.message = c2, c2 = Error(c2).stack, c2 !== void 0 && (this.stack = this.toString() + `
` + c2.replace(/^Error(:[^\n]*)?\n/, ""));
    });
    return g2.prototype = Object.create(s.prototype), g2.prototype.constructor = g2, g2.prototype.toString = function() {
      return this.message === void 0 ? this.name : this.name + ": " + this.message;
    }, g2;
  }
  var BA = void 0;
  function W(f) {
    throw new BA(f);
  }
  var Y = (f) => (f || W("Cannot use deleted val. handle = " + f), fA[f].value), OA = (f) => {
    switch (f) {
      case void 0:
        return 1;
      case null:
        return 2;
      case true:
        return 3;
      case false:
        return 4;
      default:
        var s = q.length ? q.pop() : fA.length;
        return fA[s] = { ga: 1, value: f }, s;
    }
  }, PA = void 0, WA = void 0;
  function uA(f) {
    for (var s = ""; y[f]; )
      s += WA[y[f++]];
    return s;
  }
  var hA = [];
  function Ie() {
    for (; hA.length; ) {
      var f = hA.pop();
      f.M.$ = false, f.delete();
    }
  }
  var le = void 0, LA = {};
  function re(f, s) {
    for (s === void 0 && W("ptr should not be undefined"); f.R; )
      s = f.ba(s), f = f.R;
    return s;
  }
  var ce = {};
  function ye(f) {
    f = Wr(f);
    var s = uA(f);
    return ve(f), s;
  }
  function Pe(f, s) {
    var g2 = ce[f];
    return g2 === void 0 && W(s + " has unknown type " + ye(f)), g2;
  }
  function Ye() {
  }
  var Ge = false;
  function Ue(f) {
    --f.count.value, f.count.value === 0 && (f.T ? f.U.W(f.T) : f.P.N.W(f.O));
  }
  function we(f, s, g2) {
    return s === g2 ? f : g2.R === void 0 ? null : (f = we(f, s, g2.R), f === null ? null : g2.na(f));
  }
  var fe = {};
  function se(f, s) {
    return s = re(f, s), LA[s];
  }
  var qe = void 0;
  function zA(f) {
    throw new qe(f);
  }
  function ne(f, s) {
    return s.P && s.O || zA("makeClassHandle requires ptr and ptrType"), !!s.U != !!s.T && zA("Both smartPtrType and smartPtr must be specified"), s.count = { value: 1 }, ie(Object.create(f, { M: { value: s } }));
  }
  function ie(f) {
    return typeof FinalizationRegistry > "u" ? (ie = (s) => s, f) : (Ge = new FinalizationRegistry((s) => {
      Ue(s.M);
    }), ie = (s) => {
      var g2 = s.M;
      return g2.T && Ge.register(s, { M: g2 }, s), s;
    }, Ye = (s) => {
      Ge.unregister(s);
    }, ie(f));
  }
  var Be = {};
  function De(f) {
    for (; f.length; ) {
      var s = f.pop();
      f.pop()(s);
    }
  }
  function KA(f) {
    return this.fromWireType(F[f >> 2]);
  }
  var XA = {}, _A = {};
  function oe(f, s, g2) {
    function c2(m2) {
      m2 = g2(m2), m2.length !== f.length && zA("Mismatched type converter count");
      for (var w2 = 0; w2 < f.length; ++w2)
        Z(f[w2], m2[w2]);
    }
    f.forEach(function(m2) {
      _A[m2] = s;
    });
    var B = Array(s.length), Q = [], h2 = 0;
    s.forEach((m2, w2) => {
      ce.hasOwnProperty(m2) ? B[w2] = ce[m2] : (Q.push(m2), XA.hasOwnProperty(m2) || (XA[m2] = []), XA[m2].push(() => {
        B[w2] = ce[m2], ++h2, h2 === Q.length && c2(B);
      }));
    }), Q.length === 0 && c2(B);
  }
  function V(f) {
    switch (f) {
      case 1:
        return 0;
      case 2:
        return 1;
      case 4:
        return 2;
      case 8:
        return 3;
      default:
        throw new TypeError("Unknown type size: " + f);
    }
  }
  function Z(f, s, g2 = {}) {
    if (!("argPackAdvance" in s))
      throw new TypeError("registerType registeredInstance requires argPackAdvance");
    var c2 = s.name;
    if (f || W('type "' + c2 + '" must have a positive integer typeid pointer'), ce.hasOwnProperty(f)) {
      if (g2.ua)
        return;
      W("Cannot register type '" + c2 + "' twice");
    }
    ce[f] = s, delete _A[f], XA.hasOwnProperty(f) && (s = XA[f], delete XA[f], s.forEach((B) => B()));
  }
  function nA(f) {
    W(f.M.P.N.name + " instance already deleted");
  }
  function $() {
  }
  function IA(f, s, g2) {
    if (f[s].S === void 0) {
      var c2 = f[s];
      f[s] = function() {
        return f[s].S.hasOwnProperty(arguments.length) || W("Function '" + g2 + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + f[s].S + ")!"), f[s].S[arguments.length].apply(this, arguments);
      }, f[s].S = [], f[s].S[c2.Z] = c2;
    }
  }
  function lA(f, s) {
    e.hasOwnProperty(f) ? (W("Cannot register public name '" + f + "' twice"), IA(e, f, f), e.hasOwnProperty(void 0) && W("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"), e[f].S[void 0] = s) : e[f] = s;
  }
  function DA(f, s, g2, c2, B, Q, h2, m2) {
    this.name = f, this.constructor = s, this.X = g2, this.W = c2, this.R = B, this.pa = Q, this.ba = h2, this.na = m2, this.ja = [];
  }
  function cA(f, s, g2) {
    for (; s !== g2; )
      s.ba || W("Expected null or instance of " + g2.name + ", got an instance of " + s.name), f = s.ba(f), s = s.R;
    return f;
  }
  function gA(f, s) {
    return s === null ? (this.ea && W("null is not a valid " + this.name), 0) : (s.M || W('Cannot pass "' + ZA(s) + '" as a ' + this.name), s.M.O || W("Cannot pass deleted object as a pointer of type " + this.name), cA(s.M.O, s.M.P.N, this.N));
  }
  function Ee(f, s) {
    if (s === null) {
      if (this.ea && W("null is not a valid " + this.name), this.da) {
        var g2 = this.fa();
        return f !== null && f.push(this.W, g2), g2;
      }
      return 0;
    }
    if (s.M || W('Cannot pass "' + ZA(s) + '" as a ' + this.name), s.M.O || W("Cannot pass deleted object as a pointer of type " + this.name), !this.ca && s.M.P.ca && W("Cannot convert argument of type " + (s.M.U ? s.M.U.name : s.M.P.name) + " to parameter type " + this.name), g2 = cA(s.M.O, s.M.P.N, this.N), this.da)
      switch (s.M.T === void 0 && W("Passing raw pointer to smart pointer is illegal"), this.Ba) {
        case 0:
          s.M.U === this ? g2 = s.M.T : W("Cannot convert argument of type " + (s.M.U ? s.M.U.name : s.M.P.name) + " to parameter type " + this.name);
          break;
        case 1:
          g2 = s.M.T;
          break;
        case 2:
          if (s.M.U === this)
            g2 = s.M.T;
          else {
            var c2 = s.clone();
            g2 = this.xa(g2, OA(function() {
              c2.delete();
            })), f !== null && f.push(this.W, g2);
          }
          break;
        default:
          W("Unsupporting sharing policy");
      }
    return g2;
  }
  function eA(f, s) {
    return s === null ? (this.ea && W("null is not a valid " + this.name), 0) : (s.M || W('Cannot pass "' + ZA(s) + '" as a ' + this.name), s.M.O || W("Cannot pass deleted object as a pointer of type " + this.name), s.M.P.ca && W("Cannot convert argument of type " + s.M.P.name + " to parameter type " + this.name), cA(s.M.O, s.M.P.N, this.N));
  }
  function JA(f, s, g2, c2) {
    this.name = f, this.N = s, this.ea = g2, this.ca = c2, this.da = false, this.W = this.xa = this.fa = this.ka = this.Ba = this.wa = void 0, s.R !== void 0 ? this.toWireType = Ee : (this.toWireType = c2 ? gA : eA, this.V = null);
  }
  function RA(f, s) {
    e.hasOwnProperty(f) || zA("Replacing nonexistant public symbol"), e[f] = s, e[f].Z = void 0;
  }
  function ut(f, s) {
    var g2 = [];
    return function() {
      if (g2.length = 0, Object.assign(g2, arguments), f.includes("j")) {
        var c2 = e["dynCall_" + f];
        c2 = g2 && g2.length ? c2.apply(null, [s].concat(g2)) : c2.call(null, s);
      } else
        c2 = O.get(s).apply(null, g2);
      return c2;
    };
  }
  function GA(f, s) {
    f = uA(f);
    var g2 = f.includes("j") ? ut(f, s) : O.get(s);
    return typeof g2 != "function" && W("unknown function pointer with signature " + f + ": " + s), g2;
  }
  var YA = void 0;
  function qA(f, s) {
    function g2(Q) {
      B[Q] || ce[Q] || (_A[Q] ? _A[Q].forEach(g2) : (c2.push(Q), B[Q] = true));
    }
    var c2 = [], B = {};
    throw s.forEach(g2), new YA(f + ": " + c2.map(ye).join([", "]));
  }
  function Qe(f, s, g2, c2, B) {
    var Q = s.length;
    2 > Q && W("argTypes array size mismatch! Must at least get return value and 'this' types!");
    var h2 = s[1] !== null && g2 !== null, m2 = false;
    for (g2 = 1; g2 < s.length; ++g2)
      if (s[g2] !== null && s[g2].V === void 0) {
        m2 = true;
        break;
      }
    var w2 = s[0].name !== "void", D = Q - 2, S2 = Array(D), N = [], U = [];
    return function() {
      if (arguments.length !== D && W("function " + f + " called with " + arguments.length + " arguments, expected " + D + " args!"), U.length = 0, N.length = h2 ? 2 : 1, N[0] = B, h2) {
        var X = s[1].toWireType(U, this);
        N[1] = X;
      }
      for (var z = 0; z < D; ++z)
        S2[z] = s[z + 2].toWireType(U, arguments[z]), N.push(S2[z]);
      if (z = c2.apply(null, N), m2)
        De(U);
      else
        for (var AA = h2 ? 1 : 2; AA < s.length; AA++) {
          var NA = AA === 1 ? X : S2[AA - 2];
          s[AA].V !== null && s[AA].V(NA);
        }
      return X = w2 ? s[0].fromWireType(z) : void 0, X;
    };
  }
  function pA(f, s) {
    for (var g2 = [], c2 = 0; c2 < f; c2++)
      g2.push(b[s + 4 * c2 >> 2]);
    return g2;
  }
  function mA(f) {
    4 < f && --fA[f].ga === 0 && (fA[f] = void 0, q.push(f));
  }
  function ZA(f) {
    if (f === null)
      return "null";
    var s = typeof f;
    return s === "object" || s === "array" || s === "function" ? f.toString() : "" + f;
  }
  function jA(f, s) {
    switch (s) {
      case 2:
        return function(g2) {
          return this.fromWireType(v2[g2 >> 2]);
        };
      case 3:
        return function(g2) {
          return this.fromWireType(M[g2 >> 3]);
        };
      default:
        throw new TypeError("Unknown float type: " + f);
    }
  }
  function Se(f, s, g2) {
    switch (s) {
      case 0:
        return g2 ? function(c2) {
          return p[c2];
        } : function(c2) {
          return y[c2];
        };
      case 1:
        return g2 ? function(c2) {
          return k[c2 >> 1];
        } : function(c2) {
          return x2[c2 >> 1];
        };
      case 2:
        return g2 ? function(c2) {
          return F[c2 >> 2];
        } : function(c2) {
          return b[c2 >> 2];
        };
      default:
        throw new TypeError("Unknown integer type: " + f);
    }
  }
  function be(f, s) {
    for (var g2 = "", c2 = 0; !(c2 >= s / 2); ++c2) {
      var B = k[f + 2 * c2 >> 1];
      if (B == 0)
        break;
      g2 += String.fromCharCode(B);
    }
    return g2;
  }
  function $A(f, s, g2) {
    if (g2 === void 0 && (g2 = 2147483647), 2 > g2)
      return 0;
    g2 -= 2;
    var c2 = s;
    g2 = g2 < 2 * f.length ? g2 / 2 : f.length;
    for (var B = 0; B < g2; ++B)
      k[s >> 1] = f.charCodeAt(B), s += 2;
    return k[s >> 1] = 0, s - c2;
  }
  function Ce(f) {
    return 2 * f.length;
  }
  function It(f, s) {
    for (var g2 = 0, c2 = ""; !(g2 >= s / 4); ) {
      var B = F[f + 4 * g2 >> 2];
      if (B == 0)
        break;
      ++g2, 65536 <= B ? (B -= 65536, c2 += String.fromCharCode(55296 | B >> 10, 56320 | B & 1023)) : c2 += String.fromCharCode(B);
    }
    return c2;
  }
  function et2(f, s, g2) {
    if (g2 === void 0 && (g2 = 2147483647), 4 > g2)
      return 0;
    var c2 = s;
    g2 = c2 + g2 - 4;
    for (var B = 0; B < f.length; ++B) {
      var Q = f.charCodeAt(B);
      if (55296 <= Q && 57343 >= Q) {
        var h2 = f.charCodeAt(++B);
        Q = 65536 + ((Q & 1023) << 10) | h2 & 1023;
      }
      if (F[s >> 2] = Q, s += 4, s + 4 > g2)
        break;
    }
    return F[s >> 2] = 0, s - c2;
  }
  function wt(f) {
    for (var s = 0, g2 = 0; g2 < f.length; ++g2) {
      var c2 = f.charCodeAt(g2);
      55296 <= c2 && 57343 >= c2 && ++g2, s += 4;
    }
    return s;
  }
  var Dt = {};
  function lt(f) {
    var s = Dt[f];
    return s === void 0 ? uA(f) : s;
  }
  var ct = [];
  function St(f) {
    var s = ct.length;
    return ct.push(f), s;
  }
  function Fn(f, s) {
    for (var g2 = Array(f), c2 = 0; c2 < f; ++c2)
      g2[c2] = Pe(b[s + 4 * c2 >> 2], "parameter " + c2);
    return g2;
  }
  var Pr = [], _r = [null, [], []];
  BA = e.BindingError = oA("BindingError"), e.count_emval_handles = function() {
    for (var f = 0, s = 5; s < fA.length; ++s)
      fA[s] !== void 0 && ++f;
    return f;
  }, e.get_first_emval = function() {
    for (var f = 5; f < fA.length; ++f)
      if (fA[f] !== void 0)
        return fA[f];
    return null;
  }, PA = e.PureVirtualError = oA("PureVirtualError");
  for (var Jr = Array(256), ft = 0; 256 > ft; ++ft)
    Jr[ft] = String.fromCharCode(ft);
  WA = Jr, e.getInheritedInstanceCount = function() {
    return Object.keys(LA).length;
  }, e.getLiveInheritedInstances = function() {
    var f = [], s;
    for (s in LA)
      LA.hasOwnProperty(s) && f.push(LA[s]);
    return f;
  }, e.flushPendingDeletes = Ie, e.setDelayFunction = function(f) {
    le = f, hA.length && le && le(Ie);
  }, qe = e.InternalError = oA("InternalError"), $.prototype.isAliasOf = function(f) {
    if (!(this instanceof $ && f instanceof $))
      return false;
    var s = this.M.P.N, g2 = this.M.O, c2 = f.M.P.N;
    for (f = f.M.O; s.R; )
      g2 = s.ba(g2), s = s.R;
    for (; c2.R; )
      f = c2.ba(f), c2 = c2.R;
    return s === c2 && g2 === f;
  }, $.prototype.clone = function() {
    if (this.M.O || nA(this), this.M.aa)
      return this.M.count.value += 1, this;
    var f = ie, s = Object, g2 = s.create, c2 = Object.getPrototypeOf(this), B = this.M;
    return f = f(g2.call(s, c2, { M: { value: { count: B.count, $: B.$, aa: B.aa, O: B.O, P: B.P, T: B.T, U: B.U } } })), f.M.count.value += 1, f.M.$ = false, f;
  }, $.prototype.delete = function() {
    this.M.O || nA(this), this.M.$ && !this.M.aa && W("Object already scheduled for deletion"), Ye(this), Ue(this.M), this.M.aa || (this.M.T = void 0, this.M.O = void 0);
  }, $.prototype.isDeleted = function() {
    return !this.M.O;
  }, $.prototype.deleteLater = function() {
    return this.M.O || nA(this), this.M.$ && !this.M.aa && W("Object already scheduled for deletion"), hA.push(this), hA.length === 1 && le && le(Ie), this.M.$ = true, this;
  }, JA.prototype.qa = function(f) {
    return this.ka && (f = this.ka(f)), f;
  }, JA.prototype.ha = function(f) {
    this.W && this.W(f);
  }, JA.prototype.argPackAdvance = 8, JA.prototype.readValueFromPointer = KA, JA.prototype.deleteObject = function(f) {
    f !== null && f.delete();
  }, JA.prototype.fromWireType = function(f) {
    function s() {
      return this.da ? ne(this.N.X, { P: this.wa, O: g2, U: this, T: f }) : ne(this.N.X, { P: this, O: f });
    }
    var g2 = this.qa(f);
    if (!g2)
      return this.ha(f), null;
    var c2 = se(this.N, g2);
    if (c2 !== void 0)
      return c2.M.count.value === 0 ? (c2.M.O = g2, c2.M.T = f, c2.clone()) : (c2 = c2.clone(), this.ha(f), c2);
    if (c2 = this.N.pa(g2), c2 = fe[c2], !c2)
      return s.call(this);
    c2 = this.ca ? c2.la : c2.pointerType;
    var B = we(g2, this.N, c2.N);
    return B === null ? s.call(this) : this.da ? ne(c2.N.X, { P: c2, O: B, U: this, T: f }) : ne(c2.N.X, { P: c2, O: B });
  }, YA = e.UnboundTypeError = oA("UnboundTypeError");
  var bt = typeof atob == "function" ? atob : function(f) {
    var s = "", g2 = 0;
    f = f.replace(/[^A-Za-z0-9\+\/=]/g, "");
    do {
      var c2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(f.charAt(g2++)), B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(f.charAt(g2++)), Q = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(f.charAt(g2++)), h2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(f.charAt(g2++));
      c2 = c2 << 2 | B >> 4, B = (B & 15) << 4 | Q >> 2;
      var m2 = (Q & 3) << 6 | h2;
      s += String.fromCharCode(c2), Q !== 64 && (s += String.fromCharCode(B)), h2 !== 64 && (s += String.fromCharCode(m2));
    } while (g2 < f.length);
    return s;
  }, Ln = { l: function(f, s, g2, c2) {
    rA("Assertion failed: " + (f ? C(y, f) : "") + ", at: " + [s ? s ? C(y, s) : "" : "unknown filename", g2, c2 ? c2 ? C(y, c2) : "" : "unknown function"]);
  }, q: function(f, s, g2) {
    f = uA(f), s = Pe(s, "wrapper"), g2 = Y(g2);
    var c2 = [].slice, B = s.N, Q = B.X, h2 = B.R.X, m2 = B.R.constructor;
    f = xA(f, function() {
      B.R.ja.forEach(function(D) {
        if (this[D] === h2[D])
          throw new PA("Pure virtual function " + D + " must be implemented in JavaScript");
      }.bind(this)), Object.defineProperty(this, "__parent", { value: Q }), this.__construct.apply(this, c2.call(arguments));
    }), Q.__construct = function() {
      this === Q && W("Pass correct 'this' to __construct");
      var D = m2.implement.apply(void 0, [this].concat(c2.call(arguments)));
      Ye(D);
      var S2 = D.M;
      D.notifyOnDestruction(), S2.aa = true, Object.defineProperties(this, { M: { value: S2 } }), ie(this), D = S2.O, D = re(B, D), LA.hasOwnProperty(D) ? W("Tried to register registered instance: " + D) : LA[D] = this;
    }, Q.__destruct = function() {
      this === Q && W("Pass correct 'this' to __destruct"), Ye(this);
      var D = this.M.O;
      D = re(B, D), LA.hasOwnProperty(D) ? delete LA[D] : W("Tried to unregister unregistered instance: " + D);
    }, f.prototype = Object.create(Q);
    for (var w2 in g2)
      f.prototype[w2] = g2[w2];
    return OA(f);
  }, j: function(f) {
    var s = Be[f];
    delete Be[f];
    var g2 = s.fa, c2 = s.W, B = s.ia, Q = B.map((h2) => h2.ta).concat(B.map((h2) => h2.za));
    oe([f], Q, (h2) => {
      var m2 = {};
      return B.forEach((w2, D) => {
        var S2 = h2[D], N = w2.ra, U = w2.sa, X = h2[D + B.length], z = w2.ya, AA = w2.Aa;
        m2[w2.oa] = { read: (NA) => S2.fromWireType(N(U, NA)), write: (NA, Ae) => {
          var ae = [];
          z(AA, NA, X.toWireType(ae, Ae)), De(ae);
        } };
      }), [{ name: s.name, fromWireType: function(w2) {
        var D = {}, S2;
        for (S2 in m2)
          D[S2] = m2[S2].read(w2);
        return c2(w2), D;
      }, toWireType: function(w2, D) {
        for (var S2 in m2)
          if (!(S2 in D))
            throw new TypeError('Missing field:  "' + S2 + '"');
        var N = g2();
        for (S2 in m2)
          m2[S2].write(N, D[S2]);
        return w2 !== null && w2.push(c2, N), N;
      }, argPackAdvance: 8, readValueFromPointer: KA, V: c2 }];
    });
  }, v: function() {
  }, B: function(f, s, g2, c2, B) {
    var Q = V(g2);
    s = uA(s), Z(f, { name: s, fromWireType: function(h2) {
      return !!h2;
    }, toWireType: function(h2, m2) {
      return m2 ? c2 : B;
    }, argPackAdvance: 8, readValueFromPointer: function(h2) {
      if (g2 === 1)
        var m2 = p;
      else if (g2 === 2)
        m2 = k;
      else if (g2 === 4)
        m2 = F;
      else
        throw new TypeError("Unknown boolean type size: " + s);
      return this.fromWireType(m2[h2 >> Q]);
    }, V: null });
  }, f: function(f, s, g2, c2, B, Q, h2, m2, w2, D, S2, N, U) {
    S2 = uA(S2), Q = GA(B, Q), m2 && (m2 = GA(h2, m2)), D && (D = GA(w2, D)), U = GA(N, U);
    var X = TA(S2);
    lA(X, function() {
      qA("Cannot construct " + S2 + " due to unbound types", [c2]);
    }), oe([f, s, g2], c2 ? [c2] : [], function(z) {
      if (z = z[0], c2)
        var AA = z.N, NA = AA.X;
      else
        NA = $.prototype;
      z = xA(X, function() {
        if (Object.getPrototypeOf(this) !== Ae)
          throw new BA("Use 'new' to construct " + S2);
        if (ae.Y === void 0)
          throw new BA(S2 + " has no accessible constructor");
        var Wt = ae.Y[arguments.length];
        if (Wt === void 0)
          throw new BA("Tried to invoke ctor of " + S2 + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(ae.Y).toString() + ") parameters instead!");
        return Wt.apply(this, arguments);
      });
      var Ae = Object.create(NA, { constructor: { value: z } });
      z.prototype = Ae;
      var ae = new DA(S2, z, Ae, U, AA, Q, m2, D);
      AA = new JA(S2, ae, true, false), NA = new JA(S2 + "*", ae, false, false);
      var ke = new JA(S2 + " const*", ae, false, true);
      return fe[f] = { pointerType: NA, la: ke }, RA(X, z), [AA, NA, ke];
    });
  }, d: function(f, s, g2, c2, B, Q, h2) {
    var m2 = pA(g2, c2);
    s = uA(s), Q = GA(B, Q), oe([], [f], function(w2) {
      function D() {
        qA("Cannot call " + S2 + " due to unbound types", m2);
      }
      w2 = w2[0];
      var S2 = w2.name + "." + s;
      s.startsWith("@@") && (s = Symbol[s.substring(2)]);
      var N = w2.N.constructor;
      return N[s] === void 0 ? (D.Z = g2 - 1, N[s] = D) : (IA(N, s, S2), N[s].S[g2 - 1] = D), oe([], m2, function(U) {
        return U = Qe(S2, [U[0], null].concat(U.slice(1)), null, Q, h2), N[s].S === void 0 ? (U.Z = g2 - 1, N[s] = U) : N[s].S[g2 - 1] = U, [];
      }), [];
    });
  }, p: function(f, s, g2, c2, B, Q) {
    0 < s || rA();
    var h2 = pA(s, g2);
    B = GA(c2, B), oe([], [f], function(m2) {
      m2 = m2[0];
      var w2 = "constructor " + m2.name;
      if (m2.N.Y === void 0 && (m2.N.Y = []), m2.N.Y[s - 1] !== void 0)
        throw new BA("Cannot register multiple constructors with identical number of parameters (" + (s - 1) + ") for class '" + m2.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
      return m2.N.Y[s - 1] = () => {
        qA("Cannot construct " + m2.name + " due to unbound types", h2);
      }, oe([], h2, function(D) {
        return D.splice(1, 0, null), m2.N.Y[s - 1] = Qe(w2, D, null, B, Q), [];
      }), [];
    });
  }, a: function(f, s, g2, c2, B, Q, h2, m2) {
    var w2 = pA(g2, c2);
    s = uA(s), Q = GA(B, Q), oe([], [f], function(D) {
      function S2() {
        qA("Cannot call " + N + " due to unbound types", w2);
      }
      D = D[0];
      var N = D.name + "." + s;
      s.startsWith("@@") && (s = Symbol[s.substring(2)]), m2 && D.N.ja.push(s);
      var U = D.N.X, X = U[s];
      return X === void 0 || X.S === void 0 && X.className !== D.name && X.Z === g2 - 2 ? (S2.Z = g2 - 2, S2.className = D.name, U[s] = S2) : (IA(U, s, N), U[s].S[g2 - 2] = S2), oe([], w2, function(z) {
        return z = Qe(N, z, D, Q, h2), U[s].S === void 0 ? (z.Z = g2 - 2, U[s] = z) : U[s].S[g2 - 2] = z, [];
      }), [];
    });
  }, A: function(f, s) {
    s = uA(s), Z(f, { name: s, fromWireType: function(g2) {
      var c2 = Y(g2);
      return mA(g2), c2;
    }, toWireType: function(g2, c2) {
      return OA(c2);
    }, argPackAdvance: 8, readValueFromPointer: KA, V: null });
  }, n: function(f, s, g2) {
    g2 = V(g2), s = uA(s), Z(f, { name: s, fromWireType: function(c2) {
      return c2;
    }, toWireType: function(c2, B) {
      return B;
    }, argPackAdvance: 8, readValueFromPointer: jA(s, g2), V: null });
  }, e: function(f, s, g2, c2, B) {
    s = uA(s), B === -1 && (B = 4294967295), B = V(g2);
    var Q = (m2) => m2;
    if (c2 === 0) {
      var h2 = 32 - 8 * g2;
      Q = (m2) => m2 << h2 >>> h2;
    }
    g2 = s.includes("unsigned") ? function(m2, w2) {
      return w2 >>> 0;
    } : function(m2, w2) {
      return w2;
    }, Z(f, { name: s, fromWireType: Q, toWireType: g2, argPackAdvance: 8, readValueFromPointer: Se(s, B, c2 !== 0), V: null });
  }, b: function(f, s, g2) {
    function c2(Q) {
      Q >>= 2;
      var h2 = b;
      return new B(d2, h2[Q + 1], h2[Q]);
    }
    var B = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][s];
    g2 = uA(g2), Z(f, { name: g2, fromWireType: c2, argPackAdvance: 8, readValueFromPointer: c2 }, { ua: true });
  }, o: function(f, s) {
    s = uA(s);
    var g2 = s === "std::string";
    Z(f, { name: s, fromWireType: function(c2) {
      var B = b[c2 >> 2], Q = c2 + 4;
      if (g2)
        for (var h2 = Q, m2 = 0; m2 <= B; ++m2) {
          var w2 = Q + m2;
          if (m2 == B || y[w2] == 0) {
            if (h2 = h2 ? C(y, h2, w2 - h2) : "", D === void 0)
              var D = h2;
            else
              D += String.fromCharCode(0), D += h2;
            h2 = w2 + 1;
          }
        }
      else {
        for (D = Array(B), m2 = 0; m2 < B; ++m2)
          D[m2] = String.fromCharCode(y[Q + m2]);
        D = D.join("");
      }
      return ve(c2), D;
    }, toWireType: function(c2, B) {
      B instanceof ArrayBuffer && (B = new Uint8Array(B));
      var Q, h2 = typeof B == "string";
      if (h2 || B instanceof Uint8Array || B instanceof Uint8ClampedArray || B instanceof Int8Array || W("Cannot pass non-string to std::string"), g2 && h2) {
        var m2 = 0;
        for (Q = 0; Q < B.length; ++Q) {
          var w2 = B.charCodeAt(Q);
          127 >= w2 ? m2++ : 2047 >= w2 ? m2 += 2 : 55296 <= w2 && 57343 >= w2 ? (m2 += 4, ++Q) : m2 += 3;
        }
        Q = m2;
      } else
        Q = B.length;
      if (m2 = vt(4 + Q + 1), w2 = m2 + 4, b[m2 >> 2] = Q, g2 && h2) {
        if (h2 = w2, w2 = Q + 1, Q = y, 0 < w2) {
          w2 = h2 + w2 - 1;
          for (var D = 0; D < B.length; ++D) {
            var S2 = B.charCodeAt(D);
            if (55296 <= S2 && 57343 >= S2) {
              var N = B.charCodeAt(++D);
              S2 = 65536 + ((S2 & 1023) << 10) | N & 1023;
            }
            if (127 >= S2) {
              if (h2 >= w2)
                break;
              Q[h2++] = S2;
            } else {
              if (2047 >= S2) {
                if (h2 + 1 >= w2)
                  break;
                Q[h2++] = 192 | S2 >> 6;
              } else {
                if (65535 >= S2) {
                  if (h2 + 2 >= w2)
                    break;
                  Q[h2++] = 224 | S2 >> 12;
                } else {
                  if (h2 + 3 >= w2)
                    break;
                  Q[h2++] = 240 | S2 >> 18, Q[h2++] = 128 | S2 >> 12 & 63;
                }
                Q[h2++] = 128 | S2 >> 6 & 63;
              }
              Q[h2++] = 128 | S2 & 63;
            }
          }
          Q[h2] = 0;
        }
      } else if (h2)
        for (h2 = 0; h2 < Q; ++h2)
          D = B.charCodeAt(h2), 255 < D && (ve(w2), W("String has UTF-16 code units that do not fit in 8 bits")), y[w2 + h2] = D;
      else
        for (h2 = 0; h2 < Q; ++h2)
          y[w2 + h2] = B[h2];
      return c2 !== null && c2.push(ve, m2), m2;
    }, argPackAdvance: 8, readValueFromPointer: KA, V: function(c2) {
      ve(c2);
    } });
  }, i: function(f, s, g2) {
    if (g2 = uA(g2), s === 2)
      var c2 = be, B = $A, Q = Ce, h2 = () => x2, m2 = 1;
    else
      s === 4 && (c2 = It, B = et2, Q = wt, h2 = () => b, m2 = 2);
    Z(f, { name: g2, fromWireType: function(w2) {
      for (var D = b[w2 >> 2], S2 = h2(), N, U = w2 + 4, X = 0; X <= D; ++X) {
        var z = w2 + 4 + X * s;
        (X == D || S2[z >> m2] == 0) && (U = c2(U, z - U), N === void 0 ? N = U : (N += String.fromCharCode(0), N += U), U = z + s);
      }
      return ve(w2), N;
    }, toWireType: function(w2, D) {
      typeof D != "string" && W("Cannot pass non-string to C++ string type " + g2);
      var S2 = Q(D), N = vt(4 + S2 + s);
      return b[N >> 2] = S2 >> m2, B(D, N + 4, S2 + s), w2 !== null && w2.push(ve, N), N;
    }, argPackAdvance: 8, readValueFromPointer: KA, V: function(w2) {
      ve(w2);
    } });
  }, k: function(f, s, g2, c2, B, Q) {
    Be[f] = { name: uA(s), fa: GA(g2, c2), W: GA(B, Q), ia: [] };
  }, h: function(f, s, g2, c2, B, Q, h2, m2, w2, D) {
    Be[f].ia.push({ oa: uA(s), ta: g2, ra: GA(c2, B), sa: Q, za: h2, ya: GA(m2, w2), Aa: D });
  }, C: function(f, s) {
    s = uA(s), Z(f, { va: true, name: s, argPackAdvance: 0, fromWireType: function() {
    }, toWireType: function() {
    } });
  }, s: function(f, s, g2, c2, B) {
    f = ct[f], s = Y(s), g2 = lt(g2);
    var Q = [];
    return b[c2 >> 2] = OA(Q), f(s, g2, Q, B);
  }, t: function(f, s, g2, c2) {
    f = ct[f], s = Y(s), g2 = lt(g2), f(s, g2, null, c2);
  }, g: mA, m: function(f, s) {
    var g2 = Fn(f, s), c2 = g2[0];
    s = c2.name + "_$" + g2.slice(1).map(function(h2) {
      return h2.name;
    }).join("_") + "$";
    var B = Pr[s];
    if (B !== void 0)
      return B;
    var Q = Array(f - 1);
    return B = St((h2, m2, w2, D) => {
      for (var S2 = 0, N = 0; N < f - 1; ++N)
        Q[N] = g2[N + 1].readValueFromPointer(D + S2), S2 += g2[N + 1].argPackAdvance;
      for (h2 = h2[m2].apply(h2, Q), N = 0; N < f - 1; ++N)
        g2[N + 1].ma && g2[N + 1].ma(Q[N]);
      if (!c2.va)
        return c2.toWireType(w2, h2);
    }), Pr[s] = B;
  }, D: function(f) {
    4 < f && (fA[f].ga += 1);
  }, r: function(f) {
    var s = Y(f);
    De(s), mA(f);
  }, c: function() {
    rA("");
  }, x: function(f, s, g2) {
    y.copyWithin(f, s, s + g2);
  }, w: function(f) {
    var s = y.length;
    if (f >>>= 0, 2147483648 < f)
      return false;
    for (var g2 = 1; 4 >= g2; g2 *= 2) {
      var c2 = s * (1 + 0.2 / g2);
      c2 = Math.min(c2, f + 100663296);
      var B = Math;
      c2 = Math.max(f, c2), B = B.min.call(B, 2147483648, c2 + (65536 - c2 % 65536) % 65536);
      A: {
        try {
          I.grow(B - d2.byteLength + 65535 >>> 16), L();
          var Q = 1;
          break A;
        } catch {
        }
        Q = void 0;
      }
      if (Q)
        return true;
    }
    return false;
  }, z: function() {
    return 52;
  }, u: function() {
    return 70;
  }, y: function(f, s, g2, c2) {
    for (var B = 0, Q = 0; Q < g2; Q++) {
      var h2 = b[s >> 2], m2 = b[s + 4 >> 2];
      s += 8;
      for (var w2 = 0; w2 < m2; w2++) {
        var D = y[h2 + w2], S2 = _r[f];
        D === 0 || D === 10 ? ((f === 1 ? o : a)(C(S2, 0)), S2.length = 0) : S2.push(D);
      }
      B += m2;
    }
    return b[c2 >> 2] = B, 0;
  } };
  (function() {
    function f(B) {
      e.asm = B.exports, I = e.asm.E, L(), O = e.asm.J, j.unshift(e.asm.F), dA--, e.monitorRunDependencies && e.monitorRunDependencies(dA), dA == 0 && (sA !== null && (clearInterval(sA), sA = null), vA && (B = vA, vA = null, B()));
    }
    function s(B) {
      f(B.instance);
    }
    function g2(B) {
      return kA().then(function(Q) {
        return Q instanceof WebAssembly.Instance ? Q : WebAssembly.instantiate(Q, c2);
      }).then(function(Q) {
        return Q;
      }).then(B, function(Q) {
        a("failed to asynchronously prepare wasm: " + Q), rA(Q);
      });
    }
    var c2 = { a: Ln };
    if (dA++, e.monitorRunDependencies && e.monitorRunDependencies(dA), e.instantiateWasm)
      try {
        return e.instantiateWasm(c2, f);
      } catch (B) {
        a("Module.instantiateWasm callback failed with error: " + B), r(B);
      }
    return function() {
      return u2 || typeof WebAssembly.instantiateStreaming != "function" || iA(wA) || typeof fetch != "function" ? g2(s) : fetch(wA, { credentials: "same-origin" }).then(function(B) {
        return WebAssembly.instantiateStreaming(B, c2).then(s, function(Q) {
          return a("wasm streaming compile failed: " + Q), a("falling back to ArrayBuffer instantiation"), g2(s);
        });
      });
    }().catch(r), {};
  })(), e.___wasm_call_ctors = function() {
    return (e.___wasm_call_ctors = e.asm.F).apply(null, arguments);
  };
  var Wr = e.___getTypeName = function() {
    return (Wr = e.___getTypeName = e.asm.G).apply(null, arguments);
  };
  e.__embind_initialize_bindings = function() {
    return (e.__embind_initialize_bindings = e.asm.H).apply(null, arguments);
  };
  var vt = e._malloc = function() {
    return (vt = e._malloc = e.asm.I).apply(null, arguments);
  }, ve = e._free = function() {
    return (ve = e._free = e.asm.K).apply(null, arguments);
  };
  e.dynCall_jiji = function() {
    return (e.dynCall_jiji = e.asm.L).apply(null, arguments);
  };
  var de;
  vA = function f() {
    de || Bt(), de || (vA = f);
  };
  function Bt() {
    function f() {
      if (!de && (de = true, e.calledRun = true, !E)) {
        if (te(j), t(e), e.onRuntimeInitialized && e.onRuntimeInitialized(), e.postRun)
          for (typeof e.postRun == "function" && (e.postRun = [e.postRun]); e.postRun.length; ) {
            var s = e.postRun.shift();
            CA.unshift(s);
          }
        te(CA);
      }
    }
    if (!(0 < dA)) {
      if (e.preRun)
        for (typeof e.preRun == "function" && (e.preRun = [e.preRun]); e.preRun.length; )
          MA();
      te(J), 0 < dA || (e.setStatus ? (e.setStatus("Running..."), setTimeout(function() {
        setTimeout(function() {
          e.setStatus("");
        }, 1), f();
      }, 1)) : f());
    }
  }
  if (e.preInit)
    for (typeof e.preInit == "function" && (e.preInit = [e.preInit]); 0 < e.preInit.length; )
      e.preInit.pop()();
  return Bt(), A.ready;
}
var Ms;
var Ls = Xe(() => {
  Ms = "";
});
var Gs = {};
kt(Gs, { default: () => GI });
var LI;
var GI;
var Us = Xe(() => {
  LI = (() => {
    var A = import.meta.url;
    return function(e) {
      e = e || {};
      var t;
      t || (t = typeof e < "u" ? e : {});
      var r, n;
      t.ready = new Promise(function(s, g2) {
        r = s, n = g2;
      });
      var i = Object.assign({}, t), o = "";
      typeof document < "u" && document.currentScript && (o = document.currentScript.src), A && (o = A), o.indexOf("blob:") !== 0 ? o = o.substr(0, o.replace(/[?#].*/, "").lastIndexOf("/") + 1) : o = "";
      var a = t.print || console.log.bind(console), u2 = t.printErr || console.warn.bind(console);
      Object.assign(t, i), i = null;
      var l2;
      t.wasmBinary && (l2 = t.wasmBinary);
      var I = t.noExitRuntime || true;
      typeof WebAssembly != "object" && iA("no native wasm support detected");
      var E, C = false;
      function d2(s, g2, c2) {
        c2 = g2 + c2;
        for (var B = ""; !(g2 >= c2); ) {
          var Q = s[g2++];
          if (!Q)
            break;
          if (Q & 128) {
            var h2 = s[g2++] & 63;
            if ((Q & 224) == 192)
              B += String.fromCharCode((Q & 31) << 6 | h2);
            else {
              var m2 = s[g2++] & 63;
              Q = (Q & 240) == 224 ? (Q & 15) << 12 | h2 << 6 | m2 : (Q & 7) << 18 | h2 << 12 | m2 << 6 | s[g2++] & 63, 65536 > Q ? B += String.fromCharCode(Q) : (Q -= 65536, B += String.fromCharCode(55296 | Q >> 10, 56320 | Q & 1023));
            }
          } else
            B += String.fromCharCode(Q);
        }
        return B;
      }
      var p, y, k, x2, F, b, v2, M, L;
      function O() {
        var s = E.buffer;
        p = s, t.HEAP8 = y = new Int8Array(s), t.HEAP16 = x2 = new Int16Array(s), t.HEAP32 = b = new Int32Array(s), t.HEAPU8 = k = new Uint8Array(s), t.HEAPU16 = F = new Uint16Array(s), t.HEAPU32 = v2 = new Uint32Array(s), t.HEAPF32 = M = new Float32Array(s), t.HEAPF64 = L = new Float64Array(s);
      }
      var J, j = [], CA = [], MA = [];
      function dA() {
        var s = t.preRun.shift();
        j.unshift(s);
      }
      var sA = 0, vA = null, rA = null;
      function iA(s) {
        throw t.onAbort && t.onAbort(s), s = "Aborted(" + s + ")", u2(s), C = true, s = new WebAssembly.RuntimeError(s + ". Build with -sASSERTIONS for more info."), n(s), s;
      }
      function wA(s) {
        return s.startsWith("data:application/octet-stream;base64,");
      }
      var aA;
      if (aA = "data:application/octet-stream;base64,AGFzbQEAAAABugM3YAF/AGACf38AYAF/AX9gA39/fwBgAn98AGACf38Bf2ADf39/AX9gBH9/f30BfWADf398AGAAAGAEf39/fwBgAX8BfGACf38BfGAFf39/f38Bf2AAAX9gA39/fwF9YAZ/f31/fX8AYAV/f39/fwBgAn9/AX1gBX9/f319AX1gAX8BfWADf35/AX5gB39/f39/f38AYAZ/f39/f38AYAR/f39/AX9gBn9/f319fQF9YAR/f31/AGADf399AX1gBn98f39/fwF/YAR/fHx/AGACf30AYAh/f39/f39/fwBgDX9/f39/f39/f39/f38AYAp/f39/f39/f39/AGAFf39/f38BfGAEfHx/fwF9YA1/fX1/f399fX9/f39/AX9gB39/f319f38AYAJ+fwF/YAN/fX0BfWABfAF8YAN/fHwAYAR/f319AGAHf39/fX19fQF9YA1/fX99f31/fX19fX1/AX9gC39/f39/f399fX19AX9gCH9/f39/f319AGAEf39+fgBgB39/f39/f38Bf2ACfH8BfGAFf398fH8AYAN/f38BfGAEf39/fABgA39/fQBgBn9/fX99fwF/ArUBHgFhAWEAHwFhAWIAAwFhAWMACQFhAWQAFgFhAWUAEQFhAWYAIAFhAWcAAAFhAWgAIQFhAWkAAwFhAWoAAAFhAWsAFwFhAWwACgFhAW0ABQFhAW4AAwFhAW8AAQFhAXAAFwFhAXEABgFhAXIAAAFhAXMAIgFhAXQACgFhAXUADQFhAXYAFgFhAXcAAgFhAXgAAwFhAXkAGAFhAXoAAgFhAUEAAQFhAUIAEQFhAUMAAQFhAUQAAAOiAqACAgMSBwcACRkDAAoRBgYKEwAPDxMBBiMTCgcHGgMUASQFJRQHAwMKCgMmAQYYDxobFAAKBw8KBwMDAgkCAAAFGwACBwIHBgIDAQMIDAABKAkHBQURACkZASoAAAIrLAIALQcHBy4HLwkFCgMCMA0xAgMJAgACAQYKAQIBBQEACQIFAQEABQAODQ0GFQIBHBUGAgkCEAAAAAUyDzMMBQYINAUCAwUODg41AgMCAgIDBgICNgIBDAwMAQsLCwsLCx0CAAIAAAABABABBQICAQMCEgMMCwEBAQEBAQsLAQICAwICAgICAgIDAgIICAEICAgEBAQEBAQEBAQABAQABAQEBAAE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GiABQQA2AvADIAFCADcC6AMgAigC7AMiAyACKALoAyIERwRAIAMgBGsiBEEASA0FIAEgBBAeIgM2AuwDIAEgAzYC6AMgASADIARqNgLwAyACKALoAyIEIAIoAuwDIghHBEADQCADIAQoAgA2AgAgA0EEaiEDIARBBGoiBCAIRw0ACwsgASADNgLsAwsgASACKQL0AzcC9AMgASACKAKEBDYChAQgASACKQL8AzcC/AMgAUEANgLkAwsgBSABNgIAIAEgADYC5AMLIAZBAWohBiAFQQRqIgUgB0cNAAsLDwsQAgALUAACQAJAAkACQAJAIAIOBAQAAQIDCyAAIAEgAUEwahBDDwsgACABIAFBMGogAxBEDwsgACABIAFBMGoQQg8LECQACyAAIAEgAUEwaiADEEULcAIBfwF9IwBBEGsiBCQAIARBCGogACABQQJ0QdwlaigCACACEDZDAADAfyEFAkACQAJAIAQtAAxBAWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwt5AgF/AX0jAEEQayIDJAAgA0EIaiAAIAFBAnRB7CVqKAIAIAIQU0MAAMB/IQQCQAJAAkAgAy0ADEEBaw4CAAECCyADKgIIIQQMAQsgAyoCCEMAAAAAlEMK1yM8lCEECyADQRBqJAAgBEMAAAAAl0MAAAAAIAQgBFsbC1QAAkACQAJAAkACQCACDgQEAAECAwsgACABIAFBwgBqEEMPCyAAIAEgAUHCAGogAxBEDwsgACABIAFBwgBqEEIPCxAkAAsgACABIAFBwgBqIAMQRQsvACAAIAJFQQF0IgIgASADEGAgACACIAEQS5IgACACIAEgAxB/IAAgAiABEFKSkgvOAQIDfwJ9IwBBEGsiAyQAQQEhBCADQQhqIABB/ABqIgUgACABQQF0akH2AGoiAS8BABAfAkACQCADKgIIIgcgAioCACIGXARAIAcgB1sEQCACLQAEIQIMAgsgBiAGXCEECyACLQAEIQIgBEUNACADLQAMIAJB/wFxRg0BCyAFIAEgBiACEDkDQCAALQAAIgFBBHENASAAIAFBBHI6AAAgACgCECIBBEAgACABEQAACyAAQYCAgP4HNgKcASAAKALkAyIADQALCyADQRBqJAALzgECA38CfSMAQRBrIgMk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AWsOAgABAgsgBCoCCCEFDAELIAQqAgggA5RDCtcjPJQhBQsgBEEQaiQAIAVDAAAAACAFIAVbGwscACAAIAFBCCACpyACQiCIpyADpyADQiCIpxAVCwUAEFgACzkAIABFBEBBAA8LAn8gAUGAf3FBgL8DRiABQf8ATXJFBEBB/DtBGTYCAEF/DAELIAAgAToAAEEBCwvEAgACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCABQQlrDhIACgsMCgsCAwQFDAsMDAoLBwgJCyACIAIoAgAiAUEEajYCACAAIAEoAgA2AgAPCwALIAIgAigCACIBQQRqNgIAIAAgATIBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATMBADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATAAADcDAA8LIAIgAigCACIBQQRqNgIAIAAgATEAADcDAA8LAAsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKwMAOQMADwsgACACIAMRAQALDwsgAiACKAIAIgFBBGo2AgAgACABNAIANwMADwsgAiACKAIAIgFBBGo2AgAgACABNQIANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKQMANwMAC84BAgN/An0jAEEQayIDJABBASEEIANBCGogAEH8AGoiBSAAIAFBAXRqQegAaiIBLwEAEB8CQAJAIAMqAggiByACKgIAIgZcBEAgByAHWwRAIAItAAQhAgwCCyAGIAZcIQQLIAItAAQhAiAERQ0AIAMtAAwgAkH/AXFGDQELIAUgASAGIAIQOQNAIAAtAAAiAUEEcQ0BIAAgAUEEcjoAACAAKAIQIgEEQCAAIAERAAALIABBgICA/gc2ApwBIAAoAuQDIgANAAsLIANBEGokAAtdAQR/IAAoAgAhAgNAIAIsAAAiAxBXBEBBfyEEIAAgAkEBaiICNgIAIAFBzJmz5gBNBH9BfyADQTBrIgMgAUEKbCIEaiADIARB/////wdzShsFIAQLIQEMAQsLIAELrhQCEn8BfiMAQdAAayIIJAAgCCABNgJMIAhBN2ohFyAIQThqIRQCQAJAAkACQANAIAEhDSAHIA5B/////wdzSg0BIAcgDmohDgJAAkACQCANIgctAAAiCQRAA0ACQAJAIAlB/wFxIgFFBEAgByEBDAELIAFBJUcNASAH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IQEgAEIANwIEIAAgATYCACABIAA2AgQgAkEQaiQAIAALGwEBfyAABEAgACgCACIBBEAgARAjCyAAECMLC0kBAn9BBBAeIQFBIBAeIgBBADYCHCAAQoCAgICAgIDAPzcCFCAAQgA3AgwgAEEAOgAIIABBAzYCBCAAQQA2AgAgASAANgIAIAELIAAgAkEFR0EAIAIbRQRAQbgwIAMgBBBJDwsgAyAEEHALIgEBfiABIAKtIAOtQiCGhCAEIAARFQAiBUIgiKckASAFpwuoAQEFfyAAKAJUIgMoAgAhBSADKAIEIgQgACgCFCAAKAIcIgdrIgYgBCAGSRsiBgRAIAUgByAGECsaIAMgAygCACAGaiIFNgIAIAMgAygCBCAGayIENgIECyAEIAIgAiAESxsiBARAIAUgASAEECsaIAMgAygCACAEaiIFNgIAIAMgAygCBCAEazYCBAsgBUEAOgAAIAAgACgCLCIBNgIcIAAgATYCFCACCwQAQgALBABBAAuKBQIGfgJ/IAEgASgCAEEHakF4cSIBQRBqNgIAIAAhCSABKQMAIQMgASkDCCEGIwBBIGsiCCQAAkAgBkL///////////8AgyIEQoCAgICAgMCAPH0gBEKAgICAgIDA/8MAfVQEQCAGQgSGIANCPIiEIQQgA0L//////////w+DIgNCgYCAgICAgIAIWgRAIARCgYCAgICAgIDAAHwhAgwCCyAEQoCAgICAgICAQH0hAiADQoCAgICAgICACFINASACIARCAYN8IQIMAQsgA1AgBEKAgICAgIDA//8AVCAEQoCAgICAgMD//wBRG0UEQCAGQgSGIANCPIiEQv////////8Dg0KAgICAgICA/P8AhCECDAELQoCAgICAgID4/wAhAiAEQv///////7//wwBWDQBCACECIARCMIinIgBBkfcASQ0AIAMhAiAGQv///////z+DQoCAgICAgMAAhCIFIQcCQCAAQYH3AGsiAUHAAHEEQCACIAFBQGqthiEHQgAhAgwBCyABRQ0AIAcgAa0iBIYgAkHAACABa62IhCEHIAIgBIYhAgsgCCACNwMQIAggBzcDGAJAQYH4ACAAayIAQcAAcQRAIAUgAEFAaq2IIQNCACEFDAELIABFDQAgBUHAACAAa62GIAMgAK0iAoiEIQMgBSACiCEFCyAIIAM3AwAgCCAF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ASAAKAIAIQAgASACQQFxBH8gASgCACAAaigCAAUgAAsRCwALYQECfyMAQRBrIgIkACABIAAoAgQiA0EBdWohASAAKAIAIQAgAiABIANBAXEEfyABKAIAIABqKAIABSAACxEBAEEQEB4iACACKQMINwMIIAAgAikDADcDACACQRBqJAAgAAtjAQJ/IwBBEGsiAyQAIAEgACgCBCIEQQF1aiEBIAAoAgAhACADIAEgAiAEQQFxBH8gASgCACAAaigCAAUgAAsRAwBBEBAeIgAgAykDCDcDCCAAIAMpAwA3AwAgA0EQaiQAIAALNwEBfyABIAAoAgQiA0EBdWohASAAKAIAIQAgASACIANBAXEEfyABKAIAIABqKAIABSAACxEEAAs5AQF/IAEgACgCBCIEQQF1aiEBIAAoAgAhACABIAIgAyAEQQFxBH8gASgCACAAaigCAAUgAAsRCAALCQAgASAAEQIACwUAQcM7Cw8AIAEgACgCAGogAjYCAAsNACABIAAoAgBqKAIACxgBAX9BEBAeIgBCADcDCCAAQQA2AgAgAAsYAQF/QRAQHiIAQgA3AwAgAEIANwMIIAALDABBMBAeQQBBMBAqCzcBAX8gASAAKAIEIgNBAXVqIQEgACgCACEAIAEgAiADQQFxBH8gASgCACAAaigCAAUgAAsRHgALBQBBvjsLIQAgACABKAIAIAEgASwAC0EASBtBuzsgAigCABAQNgIACyoBAX9BDBAeIgFBADoABCABIAAoAgA2AgggAEEANgIAIAFB2Cc2AgAgAQsFAEG7OwsFAEG4OwshACAAIAEoAgAgASABLAALQQBIG0GkOyACKAIAEBA2AgAL2AEBBH8jAEEgayIDJAAgASgCACIEQfD///8HSQRAAkACQCAEQQtPBEAgBEEPckEBaiIFEB4hBiADIAVBgICAgHhyNgIQIAMgBjYCCCADIAQ2AgwgBCAGaiEFDAELIAMgBDoAEyADQQhqIgYgBGohBSAERQ0BCyAGIAFBBGogBBArGgsgBUEAOgAAIAMgAjYCACADQRhqIANBCGogAyAAEQMAIAMoAhgQHSADKAIYIgAQBiADKAIAEAYgAywAE0EASARAIAMoAggQIwsgA0EgaiQAIAAPCxACAAsqAQF/QQwQHiIBQQA6AAQgASAAKAIANgIIIABBADYCACABQeAmNgIA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AkEIaiAIIAYQHyACIAcgAC8AABAfQQEhAyACKgIIIgogAioCACILXAR/IAogClsNAyALIAtcBSADC0UNAiACLQAMIAItAARHDQILIABBAmohAEEBIQMgBCEGQQEhBCAGRQ0ACyABLwB6IgBBB3FFBEAgBS0AekEHcUUNAgsgCCAAECAiCiAHIAUvAHoQICILWw0BIAogClsNACALIAtcDQELIAFBFGogBUEUakHoABArGiABQfwAaiAFQfwAahCgAQNAIAEtAAAiAEEEcQ0BIAEgAEEEcjoAACABKAIQIgAEQCABIAARAAALIAFBgICA/gc2ApwBIAEoAuQDIgENAAsLIAJBEGokAAvGAwEEfyMAQaAEayICJAAgACgCBCEBIABBADYCBCABBEAgASABKAIAKAIEEQAACyAAKAIIIQEgAEEANgIIIAEEQCABIAEoAgAoAgQRAAALAkAgACgCACIAKALoAyAAKALsA0YEQCAAKALkAw0BIAAgAkEYaiAAKAL0AxBcIgEpAgA3AgAgACABKAIQNgIQIAAgASkCCDcCCCAAQRRqIAFBFGpB6AAQKxogACABKQKMATcCjAEgACABKQKEATcChAEgACABKQJ8NwJ8IAEoApQBIQQgAUEANgKUASAAKAKUASEDIAAgBDYClAEgAwRAIAMQWwsgAEGYAWogAUGYAWpB0AIQKxogACgC6AMiAwRAIAAgAzYC7AMgAxAjCyAAIAEoAugDNgLoAyAAIAEoAuwDNgLsAyAAIAEoAvADNgLwAyABQQA2AvADIAFCADcC6AMgACABKQL8AzcC/AMgACABKQL0AzcC9AMgACABKAKEBDYChAQgASgClAEhACABQQA2ApQBIAAEQCAAEFsLIAJBoARqJAAPCyACQfAcNgIQIABBBUHYJSACQRBqECwQJAALIAJB5hE2AgAgAEEFQdglIAIQLBAkAAsLAEEMEB4gABCiAQsLAEEMEB5BABCiAQsNACAAKAIALQAIQQFxCwoAIAAoAgAoAhQLGQAgAUH/AXEEQBACAAsgACgCACgCEEEBcQsYACAAKAIAIgAgAC0ACEH+AXEgAXI6AAgLJgAgASAAKAIAIgAoAhRHBEAgACABNgIUIAAgACgCDEEBajYCDAsLkgEBAn8jAEEQayICJAAgACgCACEAIAFDAAAAAGAEQCABIAAqAhhcBEAgACABOAIYIAAgACgCDEEBajYCDAsgAkEQaiQADwsgAkGIFDYCACMAQRBrIgMkACADIAI2AgwCQCAARQRAQbgwQdglIAIQSRoMAQsgAEEAQQVB2CUgAiAAKAIEEQ0AGgsgA0EQaiQAECQACz8AIAFB/wFxRQRAIAIgACgCACIAKAIQIgFBAXFHBEAgACABQX5xIAJyNgIQIAAgACgCDEEBajYCDAsPCxACAAsL4CYjAEGACAuBHk9ubHkgbGVhZiBub2RlcyB3aXRoIGN1c3RvbSBtZWFzdXJlIGZ1bmN0aW9ucyBzaG91bGQgbWFudWFsbHkgbWFyayB0aGVtc2VsdmVzIGFzIGRpcnR5AGlzRGlydHkAbWFya0RpcnR5AGRlc3Ryb3kAc2V0RGlzcGxheQBnZXREaXNwbGF5AHNldEZsZXgALSsgICAwWDB4AC0wWCswWCAwWC0weCsweCAweABzZXRGbGV4R3JvdwBnZXRGbGV4R3JvdwBzZXRPdmVyZmxvdwBnZXRPdmVyZmxvdwBoYXNOZXdMYXlvdXQAY2FsY3VsYXRlTGF5b3V0AGdldENvbXB1dGVkTGF5b3V0AHVuc2lnbmVkIHNob3J0AGdldENoaWxkQ291bnQAdW5zaWduZWQgaW50AHNldEp1c3RpZnlDb250ZW50AGdldEp1c3RpZnlDb250ZW50AGF2YWlsYWJsZUhlaWdodCBpcyBpbmRlZmluaXRlIHNvIGhlaWdodFNpemluZ01vZGUgbXVzdCBiZSBTaXppbmdNb2RlOjpNYXhDb250ZW50AGF2YWlsYWJsZVdpZHRoIGlzIGluZGVmaW5pdGUgc28gd2lkdGhTaXppbmdNb2RlIG11c3QgYmUgU2l6aW5nTW9kZTo6TWF4Q29udGVudABzZXRBbGlnbkNvbnRlbnQAZ2V0QWxpZ25Db250ZW50AGdldFBhcmVudABpbXBsZW1lbnQAc2V0TWF4SGVpZ2h0UGVyY2VudABzZXRIZWlnaHRQZXJjZW50AHNldE1pbkhlaWdodFBlcmNlbnQAc2V0RmxleEJhc2lzUGVyY2VudABzZXRHYXBQZXJjZW50AHNldFBvc2l0aW9uUGVyY2VudABzZXRNYXJnaW5QZXJjZW50AHNldE1heFdpZHRoUGVyY2VudABzZXRXaWR0aFBlcmNlbnQAc2V0TWluV2lkdGhQZXJjZW50AHNldFBhZGRpbmdQZXJjZW50AGhhbmRsZS50eXBlKCkgPT0gU3R5bGVWYWx1ZUhhbmRsZTo6VHlwZTo6UG9pbnQgfHwgaGFuZGxlLnR5cGUoKSA9PSBTdHlsZVZhbHVlSGFuZGxlOjpUeXBlOjpQZXJjZW50AGNyZWF0ZURlZmF1bHQAdW5pdAByaWdodABoZWlnaHQAc2V0TWF4SGVpZ2h0AGdldE1heEhlaWdodABzZXRIZWlnaHQAZ2V0SGVpZ2h0AHNldE1pbkhlaWdodABnZXRNaW5IZWlnaHQAZ2V0Q29tcHV0ZWRIZWlnaHQAZ2V0Q29tcHV0ZWRSaWdodABsZWZ0AGdldENvbXB1dGVkTGVmdAByZXNldABfX2Rlc3RydWN0AGZsb2F0AHVpbnQ2NF90AHVzZVdlYkRlZmF1bHRzAHNldFVzZVdlYkRlZmF1bHRzAHNldEFsaWduSXRlbXMAZ2V0QWxpZ25JdGVtcwBzZXRGbGV4QmFzaXMAZ2V0RmxleEJhc2lzAENhbm5vdCBnZXQgbGF5b3V0IHByb3BlcnRpZXMgb2YgbXVsdGktZWRnZSBzaG9ydGhhbmRzAHNldFBvaW50U2NhbGVGYWN0b3IATWVhc3VyZUNhbGxiYWNrV3JhcHBlcgBEaXJ0aWVkQ2FsbGJhY2tXcmFwcGVyAENhbm5vdCByZXNldCBhIG5vZGUgc3RpbGwgYXR0YWNoZWQgdG8gYSBvd25lcgBzZXRCb3JkZXIAZ2V0Qm9yZGVyAGdldENvbXB1dGVkQm9yZGVyAGdldE51bWJlcgBoYW5kbGUudHlwZSgpID09IFN0eWxlVmFsdWVIYW5kbGU6OlR5cGU6Ok51bWJlcgB1bnNpZ25lZCBjaGFyAHRvcABnZXRDb21wdXRlZFRvcABzZXRGbGV4V3JhcABnZXRGbGV4V3JhcABzZXRHYXAAZ2V0R2FwACVwAHNldEhlaWdodEF1dG8Ac2V0RmxleEJhc2lzQXV0bwBzZXRQb3NpdGlvbkF1dG8Ac2V0TWFyZ2luQXV0bwBzZXRXaWR0aEF1dG8AU2NhbGUgZmFjdG9yIHNob3VsZCBub3QgYmUgbGVzcyB0aGFuIHplcm8Ac2V0QXNwZWN0UmF0aW8AZ2V0QXNwZWN0UmF0aW8Ac2V0UG9zaXRpb24AZ2V0UG9zaXRpb24Abm90aWZ5T25EZXN0cnVjdGlvbgBzZXRGbGV4RGlyZWN0aW9uAGdldEZsZXhEaXJlY3Rpb24Ac2V0RGlyZWN0aW9uAGdldERpcmVjdGlvbgBzZXRNYXJnaW4AZ2V0TWFyZ2luAGdldENvbXB1dGVkTWFyZ2luAG1hcmtMYXlvdXRTZWVuAG5hbgBib3R0b20AZ2V0Q29tcHV0ZWRCb3R0b20AYm9vbABlbXNjcmlwdGVuOjp2YWwAc2V0RmxleFNocmluawBnZXRGbGV4U2hyaW5rAHNldEFsd2F5c0Zvcm1zQ29udGFpbmluZ0Jsb2NrAE1lYXN1cmVDYWxsYmFjawBEaXJ0aWVkQ2FsbGJhY2sAZ2V0TGVuZ3RoAHdpZHRoAHNldE1heFdpZHRoAGdldE1heFdpZHRoAHNldFdpZHRoAGdldFdpZHRoAHNldE1pbldpZHRoAGdldE1pbldpZHRoAGdldENvbXB1dGVkV2lkdGgAcHVzaAAvaG9tZS9ydW5uZXIvd29yay95b2dhL3lvZ2EvamF2YXNjcmlwdC8uLi95b2dhL3N0eWxlL1NtYWxsVmFsdWVCdWZmZXIuaAAvaG9tZS9ydW5uZXIvd29yay95b2dhL3lvZ2EvamF2YXNjcmlwdC8uLi95b2dhL3N0eWxlL1N0eWxlVmFsdWVQb29sLmgAdW5zaWduZWQgbG9uZwBzZXRCb3hTaXppbmcAZ2V0Qm94U2l6aW5nAHN0ZDo6d3N0cmluZwBzdGQ6OnN0cmluZwBzdGQ6OnUxNnN0cmluZwBzdGQ6OnUzMnN0cmluZwBzZXRQYWRkaW5nAGdldFBhZGRpbmcAZ2V0Q29tcHV0ZWRQYWRkaW5nAFRyaWVkIHRvIGNvbnN0cnVjdCBZR05vZGUgd2l0aCBudWxsIGNvbmZpZwBBdHRlbXB0aW5nIHRvIGNvbnN0cnVjdCBOb2RlIHdpdGggbnVsbCBjb25maWcAY3JlYXRlV2l0aENvbmZpZwBpbmYAc2V0QWxpZ25TZWxmAGdldEFsaWduU2VsZgBTaXplAHZhbHVlAFZhbHVlAGNyZWF0ZQBtZWFzdXJlAHNldFBvc2l0aW9uVHlwZQBnZXRQb3NpdGlvblR5cGUAaXNSZWZlcmVuY2VCYXNlbGluZQBzZXRJc1JlZmVyZW5jZUJhc2VsaW5lAGNvcHlTdHlsZQBkb3VibGUATm9kZQBleHRlbmQAaW5zZXJ0Q2hpbGQAZ2V0Q2hpbGQAcmVtb3ZlQ2hpbGQAdm9pZABzZXRFeHBlcmltZW50YWxGZWF0dXJlRW5hYmxlZABpc0V4cGVyaW1lbnRhbEZlYXR1cmVFbmFibGVkAGRpcnRpZWQAQ2Fubm90IHJlc2V0IGEgbm9kZSB3aGljaCBzdGlsbCBoYXMgY2hpbGRyZW4gYXR0YWNoZWQAdW5zZXRNZWFzdXJlRnVuYwB1bnNldERpcnRpZWRGdW5jAHNldEVycmF0YQBnZXRFcnJhdGEATWVhc3VyZSBmdW5jdGlvbiByZXR1cm5lZCBhbiBpbnZhbGlkIGRpbWVuc2lvbiB0byBZb2dhOiBbd2lkdGg9JWYsIGhlaWdodD0lZl0ARXhwZWN0IGN1c3RvbSBiYXNlbGluZSBmdW5jdGlvbiB0byBub3QgcmV0dXJuIE5hTgBOQU4ASU5GAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGZsb2F0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgY2hhcj4Ac3RkOjpiYXNpY19zdHJpbmc8dW5zaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2lnbmVk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", !wA(aA)) {
        var FA = aA;
        aA = t.locateFile ? t.locateFile(FA, o) : o + FA;
      }
      function kA() {
        var s = aA;
        try {
          if (s == aA && l2)
            return new Uint8Array(l2);
          if (wA(s))
            try {
              var g2 = Ln(s.slice(37)), c2 = new Uint8Array(g2.length);
              for (s = 0; s < g2.length; ++s)
                c2[s] = g2.charCodeAt(s);
              var B = c2;
            } catch {
              throw Error("Converting base64 string to bytes failed.");
            }
          else
            B = void 0;
          var Q = B;
          if (Q)
            return Q;
          throw "both async and sync fetching of the wasm failed";
        } catch (h2) {
          iA(h2);
        }
      }
      function te() {
        return l2 || typeof fetch != "function" ? Promise.resolve().then(function() {
          return kA();
        }) : fetch(aA, { credentials: "same-origin" }).then(function(s) {
          if (!s.ok)
            throw "failed to load wasm binary file at '" + aA + "'";
          return s.arrayBuffer();
        }).catch(function() {
          return kA();
        });
      }
      function TA(s) {
        for (; 0 < s.length; )
          s.shift()(t);
      }
      function xA(s) {
        if (s === void 0)
          return "_unknown";
        s = s.replace(/[^a-zA-Z0-9_]/g, "$");
        var g2 = s.charCodeAt(0);
        return 48 <= g2 && 57 >= g2 ? "_" + s : s;
      }
      function fA(s, g2) {
        return s = xA(s), function() {
          return g2.apply(this, arguments);
        };
      }
      var q = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }], oA = [];
      function BA(s) {
        var g2 = Error, c2 = fA(s, function(B) {
          this.name = s, this.message = B, B = Error(B).stack, B !== void 0 && (this.stack = this.toString() + `
` + B.replace(/^Error(:[^\n]*)?\n/, ""));
        });
        return c2.prototype = Object.create(g2.prototype), c2.prototype.constructor = c2, c2.prototype.toString = function() {
          return this.message === void 0 ? this.name : this.name + ": " + this.message;
        }, c2;
      }
      var W = void 0;
      function Y(s) {
        throw new W(s);
      }
      var OA = (s) => (s || Y("Cannot use deleted val. handle = " + s), q[s].value), PA = (s) => {
        switch (s) {
          case void 0:
            return 1;
          case null:
            return 2;
          case true:
            return 3;
          case false:
            return 4;
          default:
            var g2 = oA.length ? oA.pop() : q.length;
            return q[g2] = { ga: 1, value: s }, g2;
        }
      }, WA = void 0, uA = void 0;
      function hA(s) {
        for (var g2 = ""; k[s]; )
          g2 += uA[k[s++]];
        return g2;
      }
      var Ie = [];
      function le() {
        for (; Ie.length; ) {
          var s = Ie.pop();
          s.M.$ = false, s.delete();
        }
      }
      var LA = void 0, re = {};
      function ce(s, g2) {
        for (g2 === void 0 && Y("ptr should not be undefined"); s.R; )
          g2 = s.ba(g2), s = s.R;
        return g2;
      }
      var ye = {};
      function Pe(s) {
        s = vt(s);
        var g2 = hA(s);
        return de(s), g2;
      }
      function Ye(s, g2) {
        var c2 = ye[s];
        return c2 === void 0 && Y(g2 + " has unknown type " + Pe(s)), c2;
      }
      function Ge() {
      }
      var Ue = false;
      function we(s) {
        --s.count.value, s.count.value === 0 && (s.T ? s.U.W(s.T) : s.P.N.W(s.O));
      }
      function fe(s, g2, c2) {
        return g2 === c2 ? s : c2.R === void 0 ? null : (s = fe(s, g2, c2.R), s === null ? null : c2.na(s));
      }
      var se = {};
      function qe(s, g2) {
        return g2 = ce(s, g2), re[g2];
      }
      var zA = void 0;
      function ne(s) {
        throw new zA(s);
      }
      function ie(s, g2) {
        return g2.P && g2.O || ne("makeClassHandle requires ptr and ptrType"), !!g2.U != !!g2.T && ne("Both smartPtrType and smartPtr must be specified"), g2.count = { value: 1 }, Be(Object.create(s, { M: { value: g2 } }));
      }
      function Be(s) {
        return typeof FinalizationRegistry > "u" ? (Be = (g2) => g2, s) : (Ue = new FinalizationRegistry((g2) => {
          we(g2.M);
        }), Be = (g2) => {
          var c2 = g2.M;
          return c2.T && Ue.register(g2, { M: c2 }, g2), g2;
        }, Ge = (g2) => {
          Ue.unregister(g2);
        }, Be(s));
      }
      var De = {};
      function KA(s) {
        for (; s.length; ) {
          var g2 = s.pop();
          s.pop()(g2);
        }
      }
      function XA(s) {
        return this.fromWireType(b[s >> 2]);
      }
      var _A = {}, oe = {};
      function V(s, g2, c2) {
        function B(w2) {
          w2 = c2(w2), w2.length !== s.length && ne("Mismatched type converter count");
          for (var D = 0; D < s.length; ++D)
            nA(s[D], w2[D]);
        }
        s.forEach(function(w2) {
          oe[w2] = g2;
        });
        var Q = Array(g2.length), h2 = [], m2 = 0;
        g2.forEach((w2, D) => {
          ye.hasOwnProperty(w2) ? Q[D] = ye[w2] : (h2.push(w2), _A.hasOwnProperty(w2) || (_A[w2] = []), _A[w2].push(() => {
            Q[D] = ye[w2], ++m2, m2 === h2.length && B(Q);
          }));
        }), h2.length === 0 && B(Q);
      }
      function Z(s) {
        switch (s) {
          case 1:
            return 0;
          case 2:
            return 1;
          case 4:
            return 2;
          case 8:
            return 3;
          default:
            throw new TypeError("Unknown type size: " + s);
        }
      }
      function nA(s, g2, c2 = {}) {
        if (!("argPackAdvance" in g2))
          throw new TypeError("registerType registeredInstance requires argPackAdvance");
        var B = g2.name;
        if (s || Y('type "' + B + '" must have a positive integer typeid pointer'), ye.hasOwnProperty(s)) {
          if (c2.ua)
            return;
          Y("Cannot register type '" + B + "' twice");
        }
        ye[s] = g2, delete oe[s], _A.hasOwnProperty(s) && (g2 = _A[s], delete _A[s], g2.forEach((Q) => Q()));
      }
      function $(s) {
        Y(s.M.P.N.name + " instance already deleted");
      }
      function IA() {
      }
      function lA(s, g2, c2) {
        if (s[g2].S === void 0) {
          var B = s[g2];
          s[g2] = function() {
            return s[g2].S.hasOwnProperty(arguments.length) || Y("Function '" + c2 + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + s[g2].S + ")!"), s[g2].S[arguments.length].apply(this, arguments);
          }, s[g2].S = [], s[g2].S[B.Z] = B;
        }
      }
      function DA(s, g2) {
        t.hasOwnProperty(s) ? (Y("Cannot register public name '" + s + "' twice"), lA(t, s, s), t.hasOwnProperty(void 0) && Y("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"), t[s].S[void 0] = g2) : t[s] = g2;
      }
      function cA(s, g2, c2, B, Q, h2, m2, w2) {
        this.name = s, this.constructor = g2, this.X = c2, this.W = B, this.R = Q, this.pa = h2, this.ba = m2, this.na = w2, this.ja = [];
      }
      function gA(s, g2, c2) {
        for (; g2 !== c2; )
          g2.ba || Y("Expected null or instance of " + c2.name + ", got an instance of " + g2.name), s = g2.ba(s), g2 = g2.R;
        return s;
      }
      function Ee(s, g2) {
        return g2 === null ? (this.ea && Y("null is not a valid " + this.name), 0) : (g2.M || Y('Cannot pass "' + jA(g2) + '" as a ' + this.name), g2.M.O || Y("Cannot pass deleted object as a pointer of type " + this.name), gA(g2.M.O, g2.M.P.N, this.N));
      }
      function eA(s, g2) {
        if (g2 === null) {
          if (this.ea && Y("null is not a valid " + this.name), this.da) {
            var c2 = this.fa();
            return s !== null && s.push(this.W, c2), c2;
          }
          return 0;
        }
        if (g2.M || Y('Cannot pass "' + jA(g2) + '" as a ' + this.name), g2.M.O || Y("Cannot pass deleted object as a pointer of type " + this.name), !this.ca && g2.M.P.ca && Y("Cannot convert argument of type " + (g2.M.U ? g2.M.U.name : g2.M.P.name) + " to parameter type " + this.name), c2 = gA(g2.M.O, g2.M.P.N, this.N), this.da)
          switch (g2.M.T === void 0 && Y("Passing raw pointer to smart pointer is illegal"), this.Ba) {
            case 0:
              g2.M.U === this ? c2 = g2.M.T : Y("Cannot convert argument of type " + (g2.M.U ? g2.M.U.name : g2.M.P.name) + " to parameter type " + this.name);
              break;
            case 1:
              c2 = g2.M.T;
              break;
            case 2:
              if (g2.M.U === this)
                c2 = g2.M.T;
              else {
                var B = g2.clone();
                c2 = this.xa(c2, PA(function() {
                  B.delete();
                })), s !== null && s.push(this.W, c2);
              }
              break;
            default:
              Y("Unsupporting sharing policy");
          }
        return c2;
      }
      function JA(s, g2) {
        return g2 === null ? (this.ea && Y("null is not a valid " + this.name), 0) : (g2.M || Y('Cannot pass "' + jA(g2) + '" as a ' + this.name), g2.M.O || Y("Cannot pass deleted object as a pointer of type " + this.name), g2.M.P.ca && Y("Cannot convert argument of type " + g2.M.P.name + " to parameter type " + this.name), gA(g2.M.O, g2.M.P.N, this.N));
      }
      function RA(s, g2, c2, B) {
        this.name = s, this.N = g2, this.ea = c2, this.ca = B, this.da = false, this.W = this.xa = this.fa = this.ka = this.Ba = this.wa = void 0, g2.R !== void 0 ? this.toWireType = eA : (this.toWireType = B ? Ee : JA, this.V = null);
      }
      function ut(s, g2) {
        t.hasOwnProperty(s) || ne("Replacing nonexistant public symbol"), t[s] = g2, t[s].Z = void 0;
      }
      function GA(s, g2) {
        var c2 = [];
        return function() {
          if (c2.length = 0, Object.assign(c2, arguments), s.includes("j")) {
            var B = t["dynCall_" + s];
            B = c2 && c2.length ? B.apply(null, [g2].concat(c2)) : B.call(null, g2);
          } else
            B = J.get(g2).apply(null, c2);
          return B;
        };
      }
      function YA(s, g2) {
        s = hA(s);
        var c2 = s.includes("j") ? GA(s, g2) : J.get(g2);
        return typeof c2 != "function" && Y("unknown function pointer with signature " + s + ": " + g2), c2;
      }
      var qA = void 0;
      function Qe(s, g2) {
        function c2(h2) {
          Q[h2] || ye[h2] || (oe[h2] ? oe[h2].forEach(c2) : (B.push(h2), Q[h2] = true));
        }
        var B = [], Q = {};
        throw g2.forEach(c2), new qA(s + ": " + B.map(Pe).join([", "]));
      }
      function pA(s, g2, c2, B, Q) {
        var h2 = g2.length;
        2 > h2 && Y("argTypes array size mismatch! Must at least get return value and 'this' types!");
        var m2 = g2[1] !== null && c2 !== null, w2 = false;
        for (c2 = 1; c2 < g2.length; ++c2)
          if (g2[c2] !== null && g2[c2].V === void 0) {
            w2 = true;
            break;
          }
        var D = g2[0].name !== "void", S2 = h2 - 2, N = Array(S2), U = [], X = [];
        return function() {
          if (arguments.length !== S2 && Y("function " + s + " called with " + arguments.length + " arguments, expected " + S2 + " args!"), X.length = 0, U.length = m2 ? 2 : 1, U[0] = Q, m2) {
            var z = g2[1].toWireType(X, this);
            U[1] = z;
          }
          for (var AA = 0; AA < S2; ++AA)
            N[AA] = g2[AA + 2].toWireType(X, arguments[AA]), U.push(N[AA]);
          if (AA = B.apply(null, U), w2)
            KA(X);
          else
            for (var NA = m2 ? 1 : 2; NA < g2.length; NA++) {
              var Ae = NA === 1 ? z : N[NA - 2];
              g2[NA].V !== null && g2[NA].V(Ae);
            }
          return z = D ? g2[0].fromWireType(AA) : void 0, z;
        };
      }
      function mA(s, g2) {
        for (var c2 = [], B = 0; B < s; B++)
          c2.push(v2[g2 + 4 * B >> 2]);
        return c2;
      }
      function ZA(s) {
        4 < s && --q[s].ga === 0 && (q[s] = void 0, oA.push(s));
      }
      function jA(s) {
        if (s === null)
          return "null";
        var g2 = typeof s;
        return g2 === "object" || g2 === "array" || g2 === "function" ? s.toString() : "" + s;
      }
      function Se(s, g2) {
        switch (g2) {
          case 2:
            return function(c2) {
              return this.fromWireType(M[c2 >> 2]);
            };
          case 3:
            return function(c2) {
              return this.fromWireType(L[c2 >> 3]);
            };
          default:
            throw new TypeError("Unknown float type: " + s);
        }
      }
      function be(s, g2, c2) {
        switch (g2) {
          case 0:
            return c2 ? function(B) {
              return y[B];
            } : function(B) {
              return k[B];
            };
          case 1:
            return c2 ? function(B) {
              return x2[B >> 1];
            } : function(B) {
              return F[B >> 1];
            };
          case 2:
            return c2 ? function(B) {
              return b[B >> 2];
            } : function(B) {
              return v2[B >> 2];
            };
          default:
            throw new TypeError("Unknown integer type: " + s);
        }
      }
      function $A(s, g2) {
        for (var c2 = "", B = 0; !(B >= g2 / 2); ++B) {
          var Q = x2[s + 2 * B >> 1];
          if (Q == 0)
            break;
          c2 += String.fromCharCode(Q);
        }
        return c2;
      }
      function Ce(s, g2, c2) {
        if (c2 === void 0 && (c2 = 2147483647), 2 > c2)
          return 0;
        c2 -= 2;
        var B = g2;
        c2 = c2 < 2 * s.length ? c2 / 2 : s.length;
        for (var Q = 0; Q < c2; ++Q)
          x2[g2 >> 1] = s.charCodeAt(Q), g2 += 2;
        return x2[g2 >> 1] = 0, g2 - B;
      }
      function It(s) {
        return 2 * s.length;
      }
      function et2(s, g2) {
        for (var c2 = 0, B = ""; !(c2 >= g2 / 4); ) {
          var Q = b[s + 4 * c2 >> 2];
          if (Q == 0)
            break;
          ++c2, 65536 <= Q ? (Q -= 65536, B += String.fromCharCode(55296 | Q >> 10, 56320 | Q & 1023)) : B += String.fromCharCode(Q);
        }
        return B;
      }
      function wt(s, g2, c2) {
        if (c2 === void 0 && (c2 = 2147483647), 4 > c2)
          return 0;
        var B = g2;
        c2 = B + c2 - 4;
        for (var Q = 0; Q < s.length; ++Q) {
          var h2 = s.charCodeAt(Q);
          if (55296 <= h2 && 57343 >= h2) {
            var m2 = s.charCodeAt(++Q);
            h2 = 65536 + ((h2 & 1023) << 10) | m2 & 1023;
          }
          if (b[g2 >> 2] = h2, g2 += 4, g2 + 4 > c2)
            break;
        }
        return b[g2 >> 2] = 0, g2 - B;
      }
      function Dt(s) {
        for (var g2 = 0, c2 = 0; c2 < s.length; ++c2) {
          var B = s.charCodeAt(c2);
          55296 <= B && 57343 >= B && ++c2, g2 += 4;
        }
        return g2;
      }
      var lt = {};
      function ct(s) {
        var g2 = lt[s];
        return g2 === void 0 ? hA(s) : g2;
      }
      var St = [];
      function Fn(s) {
        var g2 = St.length;
        return St.push(s), g2;
      }
      function Pr(s, g2) {
        for (var c2 = Array(s), B = 0; B < s; ++B)
          c2[B] = Ye(v2[g2 + 4 * B >> 2], "parameter " + B);
        return c2;
      }
      var _r = [], Jr = [null, [], []];
      W = t.BindingError = BA("BindingError"), t.count_emval_handles = function() {
        for (var s = 0, g2 = 5; g2 < q.length; ++g2)
          q[g2] !== void 0 && ++s;
        return s;
      }, t.get_first_emval = function() {
        for (var s = 5; s < q.length; ++s)
          if (q[s] !== void 0)
            return q[s];
        return null;
      }, WA = t.PureVirtualError = BA("PureVirtualError");
      for (var ft = Array(256), bt = 0; 256 > bt; ++bt)
        ft[bt] = String.fromCharCode(bt);
      uA = ft, t.getInheritedInstanceCount = function() {
        return Object.keys(re).length;
      }, t.getLiveInheritedInstances = function() {
        var s = [], g2;
        for (g2 in re)
          re.hasOwnProperty(g2) && s.push(re[g2]);
        return s;
      }, t.flushPendingDeletes = le, t.setDelayFunction = function(s) {
        LA = s, Ie.length && LA && LA(le);
      }, zA = t.InternalError = BA("InternalError"), IA.prototype.isAliasOf = function(s) {
        if (!(this instanceof IA && s instanceof IA))
          return false;
        var g2 = this.M.P.N, c2 = this.M.O, B = s.M.P.N;
        for (s = s.M.O; g2.R; )
          c2 = g2.ba(c2), g2 = g2.R;
        for (; B.R; )
          s = B.ba(s), B = B.R;
        return g2 === B && c2 === s;
      }, IA.prototype.clone = function() {
        if (this.M.O || $(this), this.M.aa)
          return this.M.count.value += 1, this;
        var s = Be, g2 = Object, c2 = g2.create, B = Object.getPrototypeOf(this), Q = this.M;
        return s = s(c2.call(g2, B, { M: { value: { count: Q.count, $: Q.$, aa: Q.aa, O: Q.O, P: Q.P, T: Q.T, U: Q.U } } })), s.M.count.value += 1, s.M.$ = false, s;
      }, IA.prototype.delete = function() {
        this.M.O || $(this), this.M.$ && !this.M.aa && Y("Object already scheduled for deletion"), Ge(this), we(this.M), this.M.aa || (this.M.T = void 0, this.M.O = void 0);
      }, IA.prototype.isDeleted = function() {
        return !this.M.O;
      }, IA.prototype.deleteLater = function() {
        return this.M.O || $(this), this.M.$ && !this.M.aa && Y("Object already scheduled for deletion"), Ie.push(this), Ie.length === 1 && LA && LA(le), this.M.$ = true, this;
      }, RA.prototype.qa = function(s) {
        return this.ka && (s = this.ka(s)), s;
      }, RA.prototype.ha = function(s) {
        this.W && this.W(s);
      }, RA.prototype.argPackAdvance = 8, RA.prototype.readValueFromPointer = XA, RA.prototype.deleteObject = function(s) {
        s !== null && s.delete();
      }, RA.prototype.fromWireType = function(s) {
        function g2() {
          return this.da ? ie(this.N.X, { P: this.wa, O: c2, U: this, T: s }) : ie(this.N.X, { P: this, O: s });
        }
        var c2 = this.qa(s);
        if (!c2)
          return this.ha(s), null;
        var B = qe(this.N, c2);
        if (B !== void 0)
          return B.M.count.value === 0 ? (B.M.O = c2, B.M.T = s, B.clone()) : (B = B.clone(), this.ha(s), B);
        if (B = this.N.pa(c2), B = se[B], !B)
          return g2.call(this);
        B = this.ca ? B.la : B.pointerType;
        var Q = fe(c2, this.N, B.N);
        return Q === null ? g2.call(this) : this.da ? ie(B.N.X, { P: B, O: Q, U: this, T: s }) : ie(B.N.X, { P: B, O: Q });
      }, qA = t.UnboundTypeError = BA("UnboundTypeError");
      var Ln = typeof atob == "function" ? atob : function(s) {
        var g2 = "", c2 = 0;
        s = s.replace(/[^A-Za-z0-9\+\/=]/g, "");
        do {
          var B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(s.charAt(c2++)), Q = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(s.charAt(c2++)), h2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(s.charAt(c2++)), m2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".indexOf(s.charAt(c2++));
          B = B << 2 | Q >> 4, Q = (Q & 15) << 4 | h2 >> 2;
          var w2 = (h2 & 3) << 6 | m2;
          g2 += String.fromCharCode(B), h2 !== 64 && (g2 += String.fromCharCode(Q)), m2 !== 64 && (g2 += String.fromCharCode(w2));
        } while (c2 < s.length);
        return g2;
      }, Wr = { l: function(s, g2, c2, B) {
        iA("Assertion failed: " + (s ? d2(k, s) : "") + ", at: " + [g2 ? g2 ? d2(k, g2) : "" : "unknown filename", c2, B ? B ? d2(k, B) : "" : "unknown function"]);
      }, q: function(s, g2, c2) {
        s = hA(s), g2 = Ye(g2, "wrapper"), c2 = OA(c2);
        var B = [].slice, Q = g2.N, h2 = Q.X, m2 = Q.R.X, w2 = Q.R.constructor;
        s = fA(s, function() {
          Q.R.ja.forEach(function(S2) {
            if (this[S2] === m2[S2])
              throw new WA("Pure virtual function " + S2 + " must be implemented in JavaScript");
          }.bind(this)), Object.defineProperty(this, "__parent", { value: h2 }), this.__construct.apply(this, B.call(arguments));
        }), h2.__construct = function() {
          this === h2 && Y("Pass correct 'this' to __construct");
          var S2 = w2.implement.apply(void 0, [this].concat(B.call(arguments)));
          Ge(S2);
          var N = S2.M;
          S2.notifyOnDestruction(), N.aa = true, Object.defineProperties(this, { M: { value: N } }), Be(this), S2 = N.O, S2 = ce(Q, S2), re.hasOwnProperty(S2) ? Y("Tried to register registered instance: " + S2) : re[S2] = this;
        }, h2.__destruct = function() {
          this === h2 && Y("Pass correct 'this' to __destruct"), Ge(this);
          var S2 = this.M.O;
          S2 = ce(Q, S2), re.hasOwnProperty(S2) ? delete re[S2] : Y("Tried to unregister unregistered instance: " + S2);
        }, s.prototype = Object.create(h2);
        for (var D in c2)
          s.prototype[D] = c2[D];
        return PA(s);
      }, j: function(s) {
        var g2 = De[s];
        delete De[s];
        var c2 = g2.fa, B = g2.W, Q = g2.ia, h2 = Q.map((m2) => m2.ta).concat(Q.map((m2) => m2.za));
        V([s], h2, (m2) => {
          var w2 = {};
          return Q.forEach((D, S2) => {
            var N = m2[S2], U = D.ra, X = D.sa, z = m2[S2 + Q.length], AA = D.ya, NA = D.Aa;
            w2[D.oa] = { read: (Ae) => N.fromWireType(U(X, Ae)), write: (Ae, ae) => {
              var ke = [];
              AA(NA, Ae, z.toWireType(ke, ae)), KA(ke);
            } };
          }), [{ name: g2.name, fromWireType: function(D) {
            var S2 = {}, N;
            for (N in w2)
              S2[N] = w2[N].read(D);
            return B(D), S2;
          }, toWireType: function(D, S2) {
            for (var N in w2)
              if (!(N in S2))
                throw new TypeError('Missing field:  "' + N + '"');
            var U = c2();
            for (N in w2)
              w2[N].write(U, S2[N]);
            return D !== null && D.push(B, U), U;
          }, argPackAdvance: 8, readValueFromPointer: XA, V: B }];
        });
      }, v: function() {
      }, B: function(s, g2, c2, B, Q) {
        var h2 = Z(c2);
        g2 = hA(g2), nA(s, { name: g2, fromWireType: function(m2) {
          return !!m2;
        }, toWireType: function(m2, w2) {
          return w2 ? B : Q;
        }, argPackAdvance: 8, readValueFromPointer: function(m2) {
          if (c2 === 1)
            var w2 = y;
          else if (c2 === 2)
            w2 = x2;
          else if (c2 === 4)
            w2 = b;
          else
            throw new TypeError("Unknown boolean type size: " + g2);
          return this.fromWireType(w2[m2 >> h2]);
        }, V: null });
      }, f: function(s, g2, c2, B, Q, h2, m2, w2, D, S2, N, U, X) {
        N = hA(N), h2 = YA(Q, h2), w2 && (w2 = YA(m2, w2)), S2 && (S2 = YA(D, S2)), X = YA(U, X);
        var z = xA(N);
        DA(z, function() {
          Qe("Cannot construct " + N + " due to unbound types", [B]);
        }), V([s, g2, c2], B ? [B] : [], function(AA) {
          if (AA = AA[0], B)
            var NA = AA.N, Ae = NA.X;
          else
            Ae = IA.prototype;
          AA = fA(z, function() {
            if (Object.getPrototypeOf(this) !== ae)
              throw new W("Use 'new' to construct " + N);
            if (ke.Y === void 0)
              throw new W(N + " has no accessible constructor");
            var ls = ke.Y[arguments.length];
            if (ls === void 0)
              throw new W("Tried to invoke ctor of " + N + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(ke.Y).toString() + ") parameters instead!");
            return ls.apply(this, arguments);
          });
          var ae = Object.create(Ae, { constructor: { value: AA } });
          AA.prototype = ae;
          var ke = new cA(N, AA, ae, X, NA, h2, w2, S2);
          NA = new RA(N, ke, true, false), Ae = new RA(N + "*", ke, false, false);
          var Wt = new RA(N + " const*", ke, false, true);
          return se[s] = { pointerType: Ae, la: Wt }, ut(z, AA), [NA, Ae, Wt];
        });
      }, d: function(s, g2, c2, B, Q, h2, m2) {
        var w2 = mA(c2, B);
        g2 = hA(g2), h2 = YA(Q, h2), V([], [s], function(D) {
          function S2() {
            Qe("Cannot call " + N + " due to unbound types", w2);
          }
          D = D[0];
          var N = D.name + "." + g2;
          g2.startsWith("@@") && (g2 = Symbol[g2.substring(2)]);
          var U = D.N.constructor;
          return U[g2] === void 0 ? (S2.Z = c2 - 1, U[g2] = S2) : (lA(U, g2, N), U[g2].S[c2 - 1] = S2), V([], w2, function(X) {
            return X = pA(N, [X[0], null].concat(X.slice(1)), null, h2, m2), U[g2].S === void 0 ? (X.Z = c2 - 1, U[g2] = X) : U[g2].S[c2 - 1] = X, [];
          }), [];
        });
      }, p: function(s, g2, c2, B, Q, h2) {
        0 < g2 || iA();
        var m2 = mA(g2, c2);
        Q = YA(B, Q), V([], [s], function(w2) {
          w2 = w2[0];
          var D = "constructor " + w2.name;
          if (w2.N.Y === void 0 && (w2.N.Y = []), w2.N.Y[g2 - 1] !== void 0)
            throw new W("Cannot register multiple constructors with identical number of parameters (" + (g2 - 1) + ") for class '" + w2.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          return w2.N.Y[g2 - 1] = () => {
            Qe("Cannot construct " + w2.name + " due to unbound types", m2);
          }, V([], m2, function(S2) {
            return S2.splice(1, 0, null), w2.N.Y[g2 - 1] = pA(D, S2, null, Q, h2), [];
          }), [];
        });
      }, a: function(s, g2, c2, B, Q, h2, m2, w2) {
        var D = mA(c2, B);
        g2 = hA(g2), h2 = YA(Q, h2), V([], [s], function(S2) {
          function N() {
            Qe("Cannot call " + U + " due to unbound types", D);
          }
          S2 = S2[0];
          var U = S2.name + "." + g2;
          g2.startsWith("@@") && (g2 = Symbol[g2.substring(2)]), w2 && S2.N.ja.push(g2);
          var X = S2.N.X, z = X[g2];
          return z === void 0 || z.S === void 0 && z.className !== S2.name && z.Z === c2 - 2 ? (N.Z = c2 - 2, N.className = S2.name, X[g2] = N) : (lA(X, g2, U), X[g2].S[c2 - 2] = N), V([], D, function(AA) {
            return AA = pA(U, AA, S2, h2, m2), X[g2].S === void 0 ? (AA.Z = c2 - 2, X[g2] = AA) : X[g2].S[c2 - 2] = AA, [];
          }), [];
        });
      }, A: function(s, g2) {
        g2 = hA(g2), nA(s, { name: g2, fromWireType: function(c2) {
          var B = OA(c2);
          return ZA(c2), B;
        }, toWireType: function(c2, B) {
          return PA(B);
        }, argPackAdvance: 8, readValueFromPointer: XA, V: null });
      }, n: function(s, g2, c2) {
        c2 = Z(c2), g2 = hA(g2), nA(s, { name: g2, fromWireType: function(B) {
          return B;
        }, toWireType: function(B, Q) {
          return Q;
        }, argPackAdvance: 8, readValueFromPointer: Se(g2, c2), V: null });
      }, e: function(s, g2, c2, B, Q) {
        g2 = hA(g2), Q === -1 && (Q = 4294967295), Q = Z(c2);
        var h2 = (w2) => w2;
        if (B === 0) {
          var m2 = 32 - 8 * c2;
          h2 = (w2) => w2 << m2 >>> m2;
        }
        c2 = g2.includes("unsigned") ? function(w2, D) {
          return D >>> 0;
        } : function(w2, D) {
          return D;
        }, nA(s, { name: g2, fromWireType: h2, toWireType: c2, argPackAdvance: 8, readValueFromPointer: be(g2, Q, B !== 0), V: null });
      }, b: function(s, g2, c2) {
        function B(h2) {
          h2 >>= 2;
          var m2 = v2;
          return new Q(p, m2[h2 + 1], m2[h2]);
        }
        var Q = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array][g2];
        c2 = hA(c2), nA(s, { name: c2, fromWireType: B, argPackAdvance: 8, readValueFromPointer: B }, { ua: true });
      }, o: function(s, g2) {
        g2 = hA(g2);
        var c2 = g2 === "std::string";
        nA(s, { name: g2, fromWireType: function(B) {
          var Q = v2[B >> 2], h2 = B + 4;
          if (c2)
            for (var m2 = h2, w2 = 0; w2 <= Q; ++w2) {
              var D = h2 + w2;
              if (w2 == Q || k[D] == 0) {
                if (m2 = m2 ? d2(k, m2, D - m2) : "", S2 === void 0)
                  var S2 = m2;
                else
                  S2 += String.fromCharCode(0), S2 += m2;
                m2 = D + 1;
              }
            }
          else {
            for (S2 = Array(Q), w2 = 0; w2 < Q; ++w2)
              S2[w2] = String.fromCharCode(k[h2 + w2]);
            S2 = S2.join("");
          }
          return de(B), S2;
        }, toWireType: function(B, Q) {
          Q instanceof ArrayBuffer && (Q = new Uint8Array(Q));
          var h2, m2 = typeof Q == "string";
          if (m2 || Q instanceof Uint8Array || Q instanceof Uint8ClampedArray || Q instanceof Int8Array || Y("Cannot pass non-string to std::string"), c2 && m2) {
            var w2 = 0;
            for (h2 = 0; h2 < Q.length; ++h2) {
              var D = Q.charCodeAt(h2);
              127 >= D ? w2++ : 2047 >= D ? w2 += 2 : 55296 <= D && 57343 >= D ? (w2 += 4, ++h2) : w2 += 3;
            }
            h2 = w2;
          } else
            h2 = Q.length;
          if (w2 = ve(4 + h2 + 1), D = w2 + 4, v2[w2 >> 2] = h2, c2 && m2) {
            if (m2 = D, D = h2 + 1, h2 = k, 0 < D) {
              D = m2 + D - 1;
              for (var S2 = 0; S2 < Q.length; ++S2) {
                var N = Q.charCodeAt(S2);
                if (55296 <= N && 57343 >= N) {
                  var U = Q.charCodeAt(++S2);
                  N = 65536 + ((N & 1023) << 10) | U & 1023;
                }
                if (127 >= N) {
                  if (m2 >= D)
                    break;
                  h2[m2++] = N;
                } else {
                  if (2047 >= N) {
                    if (m2 + 1 >= D)
                      break;
                    h2[m2++] = 192 | N >> 6;
                  } else {
                    if (65535 >= N) {
                      if (m2 + 2 >= D)
                        break;
                      h2[m2++] = 224 | N >> 12;
                    } else {
                      if (m2 + 3 >= D)
                        break;
                      h2[m2++] = 240 | N >> 18, h2[m2++] = 128 | N >> 12 & 63;
                    }
                    h2[m2++] = 128 | N >> 6 & 63;
                  }
                  h2[m2++] = 128 | N & 63;
                }
              }
              h2[m2] = 0;
            }
          } else if (m2)
            for (m2 = 0; m2 < h2; ++m2)
              S2 = Q.charCodeAt(m2), 255 < S2 && (de(D), Y("String has UTF-16 code units that do not fit in 8 bits")), k[D + m2] = S2;
          else
            for (m2 = 0; m2 < h2; ++m2)
              k[D + m2] = Q[m2];
          return B !== null && B.push(de, w2), w2;
        }, argPackAdvance: 8, readValueFromPointer: XA, V: function(B) {
          de(B);
        } });
      }, i: function(s, g2, c2) {
        if (c2 = hA(c2), g2 === 2)
          var B = $A, Q = Ce, h2 = It, m2 = () => F, w2 = 1;
        else
          g2 === 4 && (B = et2, Q = wt, h2 = Dt, m2 = () => v2, w2 = 2);
        nA(s, { name: c2, fromWireType: function(D) {
          for (var S2 = v2[D >> 2], N = m2(), U, X = D + 4, z = 0; z <= S2; ++z) {
            var AA = D + 4 + z * g2;
            (z == S2 || N[AA >> w2] == 0) && (X = B(X, AA - X), U === void 0 ? U = X : (U += String.fromCharCode(0), U += X), X = AA + g2);
          }
          return de(D), U;
        }, toWireType: function(D, S2) {
          typeof S2 != "string" && Y("Cannot pass non-string to C++ string type " + c2);
          var N = h2(S2), U = ve(4 + N + g2);
          return v2[U >> 2] = N >> w2, Q(S2, U + 4, N + g2), D !== null && D.push(de, U), U;
        }, argPackAdvance: 8, readValueFromPointer: XA, V: function(D) {
          de(D);
        } });
      }, k: function(s, g2, c2, B, Q, h2) {
        De[s] = { name: hA(g2), fa: YA(c2, B), W: YA(Q, h2), ia: [] };
      }, h: function(s, g2, c2, B, Q, h2, m2, w2, D, S2) {
        De[s].ia.push({ oa: hA(g2), ta: c2, ra: YA(B, Q), sa: h2, za: m2, ya: YA(w2, D), Aa: S2 });
      }, C: function(s, g2) {
        g2 = hA(g2), nA(s, { va: true, name: g2, argPackAdvance: 0, fromWireType: function() {
        }, toWireType: function() {
        } });
      }, s: function(s, g2, c2, B, Q) {
        s = St[s], g2 = OA(g2), c2 = ct(c2);
        var h2 = [];
        return v2[B >> 2] = PA(h2), s(g2, c2, h2, Q);
      }, t: function(s, g2, c2, B) {
        s = St[s], g2 = OA(g2), c2 = ct(c2), s(g2, c2, null, B);
      }, g: ZA, m: function(s, g2) {
        var c2 = Pr(s, g2), B = c2[0];
        g2 = B.name + "_$" + c2.slice(1).map(function(m2) {
          return m2.name;
        }).join("_") + "$";
        var Q = _r[g2];
        if (Q !== void 0)
          return Q;
        var h2 = Array(s - 1);
        return Q = Fn((m2, w2, D, S2) => {
          for (var N = 0, U = 0; U < s - 1; ++U)
            h2[U] = c2[U + 1].readValueFromPointer(S2 + N), N += c2[U + 1].argPackAdvance;
          for (m2 = m2[w2].apply(m2, h2), U = 0; U < s - 1; ++U)
            c2[U + 1].ma && c2[U + 1].ma(h2[U]);
          if (!B.va)
            return B.toWireType(D, m2);
        }), _r[g2] = Q;
      }, D: function(s) {
        4 < s && (q[s].ga += 1);
      }, r: function(s) {
        var g2 = OA(s);
        KA(g2), ZA(s);
      }, c: function() {
        iA("");
      }, x: function(s, g2, c2) {
        k.copyWithin(s, g2, g2 + c2);
      }, w: function(s) {
        var g2 = k.length;
        if (s >>>= 0, 2147483648 < s)
          return false;
        for (var c2 = 1; 4 >= c2; c2 *= 2) {
          var B = g2 * (1 + 0.2 / c2);
          B = Math.min(B, s + 100663296);
          var Q = Math;
          B = Math.max(s, B), Q = Q.min.call(Q, 2147483648, B + (65536 - B % 65536) % 65536);
          A: {
            try {
              E.grow(Q - p.byteLength + 65535 >>> 16), O();
              var h2 = 1;
              break A;
            } catch {
            }
            h2 = void 0;
          }
          if (h2)
            return true;
        }
        return false;
      }, z: function() {
        return 52;
      }, u: function() {
        return 70;
      }, y: function(s, g2, c2, B) {
        for (var Q = 0, h2 = 0; h2 < c2; h2++) {
          var m2 = v2[g2 >> 2], w2 = v2[g2 + 4 >> 2];
          g2 += 8;
          for (var D = 0; D < w2; D++) {
            var S2 = k[m2 + D], N = Jr[s];
            S2 === 0 || S2 === 10 ? ((s === 1 ? a : u2)(d2(N, 0)), N.length = 0) : N.push(S2);
          }
          Q += w2;
        }
        return v2[B >> 2] = Q, 0;
      } };
      (function() {
        function s(Q) {
          t.asm = Q.exports, E = t.asm.E, O(), J = t.asm.J, CA.unshift(t.asm.F), sA--, t.monitorRunDependencies && t.monitorRunDependencies(sA), sA == 0 && (vA !== null && (clearInterval(vA), vA = null), rA && (Q = rA, rA = null, Q()));
        }
        function g2(Q) {
          s(Q.instance);
        }
        function c2(Q) {
          return te().then(function(h2) {
            return WebAssembly.instantiate(h2, B);
          }).then(function(h2) {
            return h2;
          }).then(Q, function(h2) {
            u2("failed to asynchronously prepare wasm: " + h2), iA(h2);
          });
        }
        var B = { a: Wr };
        if (sA++, t.monitorRunDependencies && t.monitorRunDependencies(sA), t.instantiateWasm)
          try {
            return t.instantiateWasm(B, s);
          } catch (Q) {
            u2("Module.instantiateWasm callback failed with error: " + Q), n(Q);
          }
        return function() {
          return l2 || typeof WebAssembly.instantiateStreaming != "function" || wA(aA) || typeof fetch != "function" ? c2(g2) : fetch(aA, { credentials: "same-origin" }).then(function(Q) {
            return WebAssembly.instantiateStreaming(Q, B).then(g2, function(h2) {
              return u2("wasm streaming compile failed: " + h2), u2("falling back to ArrayBuffer instantiation"), c2(g2);
            });
          });
        }().catch(n), {};
      })(), t.___wasm_call_ctors = function() {
        return (t.___wasm_call_ctors = t.asm.F).apply(null, arguments);
      };
      var vt = t.___getTypeName = function() {
        return (vt = t.___getTypeName = t.asm.G).apply(null, arguments);
      };
      t.__embind_initialize_bindings = function() {
        return (t.__embind_initialize_bindings = t.asm.H).apply(null, arguments);
      };
      var ve = t._malloc = function() {
        return (ve = t._malloc = t.asm.I).apply(null, arguments);
      }, de = t._free = function() {
        return (de = t._free = t.asm.K).apply(null, arguments);
      };
      t.dynCall_jiji = function() {
        return (t.dynCall_jiji = t.asm.L).apply(null, arguments);
      };
      var Bt;
      rA = function s() {
        Bt || f(), Bt || (rA = s);
      };
      function f() {
        function s() {
          if (!Bt && (Bt = true, t.calledRun = true, !C)) {
            if (TA(CA), r(t), t.onRuntimeInitialized && t.onRuntimeInitialized(), t.postRun)
              for (typeof t.postRun == "function" && (t.postRun = [t.postRun]); t.postRun.length; ) {
                var g2 = t.postRun.shift();
                MA.unshift(g2);
              }
            TA(MA);
          }
        }
        if (!(0 < sA)) {
          if (t.preRun)
            for (typeof t.preRun == "function" && (t.preRun = [t.preRun]); t.preRun.length; )
              dA();
          TA(j), 0 < sA || (t.setStatus ? (t.setStatus("Running..."), setTimeout(function() {
            setTimeout(function() {
              t.setStatus("");
            }, 1), s();
          }, 1)) : s());
        }
      }
      if (t.preInit)
        for (typeof t.preInit == "function" && (t.preInit = [t.preInit]); 0 < t.preInit.length; )
          t.preInit.pop()();
      return f(), e.ready;
    };
  })(), GI = LI;
});
async function jr(A) {
  let { default: e } = process.env.SATORI_STANDALONE === "1" ? await Promise.resolve().then(() => (Ls(), Fs)) : await Promise.resolve().then(() => (Us(), Gs));
  return Xn(await e(A));
}
var Vn = Xe(() => {
  Ns();
  Zr();
});
var Zn = {};
kt(Zn, { getYoga: () => PI, init: () => TI });
async function OI(A, e) {
  let t;
  if (typeof A == "string" || typeof Request == "function" && A instanceof Request || typeof URL == "function" && A instanceof URL ? t = await fetch(A) : t = await A, typeof Response == "function" && t instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming == "function")
      try {
        return await WebAssembly.instantiateStreaming(t, e);
      } catch (i) {
        t.headers.get("Content-Type") !== "application/wasm" && console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", i);
      }
    let n = await t.arrayBuffer();
    return await WebAssembly.instantiate(n, e);
  }
  let r = await WebAssembly.instantiate("buffer" in t ? t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) : t, e);
  return r instanceof WebAssembly.Instance ? { instance: r, module: t } : r;
}
function TI(A) {
  UI({ instantiateWasm(e, t) {
    return OI(A, e).then(({ instance: r }) => {
      t(r);
    }).catch(zn), {};
  } }).then(Hs).catch(zn);
}
function PI() {
  return HI;
}
var UI;
var Hs;
var zn;
var HI;
var jn = Xe(() => {
  Vn();
  UI = jr, HI = new Promise((A, e) => {
    Hs = A, zn = e;
  });
});
var $n = {};
kt($n, { getYoga: () => JI });
function JI() {
  return _I;
}
var _I;
var Ai = Xe(() => {
  Vn();
  _I = jr();
});
var wi = K2((yi) => {
  "use strict";
  Object.defineProperty(yi, "__esModule", { value: true });
  Object.defineProperty(yi, "default", { enumerable: true, get: () => Ac });
  function Ac(A) {
    if (A = `${A}`, A === "0")
      return "0";
    if (/^[+-]?(\d+|\d*\.\d+)(e[+-]?\d+)?(%|\w+)?$/.test(A))
      return A.replace(/^[+-]?/, (e) => e === "-" ? "" : "-");
    if (A.includes("var(") || A.includes("calc("))
      return `calc(${A} * -1)`;
  }
});
var Ra = K2((Di) => {
  "use strict";
  Object.defineProperty(Di, "__esModule", { value: true });
  Object.defineProperty(Di, "default", { enumerable: true, get: () => ec2 });
  var ec2 = ["preflight", "container", "accessibility", "pointerEvents", "visibility", "position", "inset", "isolation", "zIndex", "order", "gridColumn", "gridColumnStart", "gridColumnEnd", "gridRow", "gridRowStart", "gridRowEnd", "float", "clear", "margin", "boxSizing", "display", "aspectRatio", "height", "maxHeight", "minHeight", "width", "minWidth", "maxWidth", "flex", "flexShrink", "flexGrow", "flexBasis", "tableLayout", "borderCollapse", "borderSpacing", "transformOrigin", "translate", "rotate", "skew", "scale", "transform", "animation", "cursor", "touchAction", "userSelect", "resize", "scrollSnapType", "scrollSnapAlign", "scrollSnapStop", "scrollMargin", "scrollPadding", "listStylePosition", "listStyleType", "appearance", "columns", "breakBefore", "breakInside", "breakAfter", "gridAutoColumns", "gridAutoFlow", "gridAutoRows", "gridTemplateColumns", "gridTemplateRows", "flexDirection", "flexWrap", "placeContent", "placeItems", "alignContent", "alignItems", "justifyContent", "justifyItems", "gap", "space", "divideWidth", "divideStyle", "divideColor", "divideOpacity", "placeSelf", "alignSelf", "justifySelf", "overflow", "overscrollBehavior", "scrollBehavior", "textOverflow", "whitespace", "wordBreak", "borderRadius", "borderWidth", "borderStyle", "borderColor", "borderOpacity", "backgroundColor", "backgroundOpacity", "backgroundImage", "gradientColorStops", "boxDecorationBreak", "backgroundSize", "backgroundAttachment", "backgroundClip", "backgroundPosition", "backgroundRepeat", "backgroundOrigin", "fill", "stroke", "strokeWidth", "objectFit", "objectPosition", "padding", "textAlign", "textIndent", "verticalAlign", "fontFamily", "fontSize", "fontWeight", "textTransform", "fontStyle", "fontVariantNumeric", "lineHeight", "letterSpacing", "textColor", "textOpacity", "textDecoration", "textDecorationColor", "textDecorationStyle", "textDecorationThickness", "textUnderlineOffset", "fontSmoothing", "placeholderColor", "placeholderOpacity", "caretColor", "accentColor", "opacity", "backgroundBlendMode", "mixBlendMode", "boxShadow", "boxShadowColor", "outlineStyle", "outlineWidth", "outlineOffset", "outlineColor", "ringWidth", "ringColor", "ringOpacity", "ringOffsetWidth", "ringOffsetColor", "blur", "brightness", "contrast", "dropShadow", "grayscale", "hueRotate", "invert", "saturate", "sepia", "filter", "backdropBlur", "backdropBrightness", "backdropContrast", "backdropGrayscale", "backdropHueRotate", "backdropInvert", "backdropOpacity", "backdropSaturate", "backdropSepia", "backdropFilter", "transitionProperty", "transitionDelay", "transitionDuration", "transitionTimingFunction", "willChange", "content"];
});
var Na = K2((Si) => {
  "use strict";
  Object.defineProperty(Si, "__esModule", { value: true });
  Object.defineProperty(Si, "default", { enumerable: true, get: () => tc });
  function tc(A, e) {
    return A === void 0 ? e : Array.isArray(A) ? A : [...new Set(e.filter((r) => A !== false && A[r] !== false).concat(Object.keys(A).filter((r) => A[r] !== false)))];
  }
});
var bi = K2((e0, Ma) => {
  Ma.exports = { content: [], presets: [], darkMode: "media", theme: { screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" }, colors: ({ colors: A }) => ({ inherit: A.inherit, current: A.current, transparent: A.transparent, black: A.black, white: A.white, slate: A.slate, gray: A.gray, zinc: A.zinc, neutral: A.neutral, stone: A.stone, red: A.red, orange: A.orange, amber: A.amber, yellow: A.yellow, lime: A.lime, green: A.green, emerald: A.emerald, teal: A.teal, cyan: A.cyan, sky: A.sky, blue: A.blue, indigo: A.indigo, violet: A.violet, purple: A.purple, fuchsia: A.fuchsia, pink: A.pink, rose: A.rose }), columns: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem" }, spacing: { px: "1px", 0: "0px", 0.5: "0.125rem", 1: "0.25rem", 1.5: "0.375rem", 2: "0.5rem", 2.5: "0.625rem", 3: "0.75rem", 3.5: "0.875rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem", 11: "2.75rem", 12: "3rem", 14: "3.5rem", 16: "4rem", 20: "5rem", 24: "6rem", 28: "7rem", 32: "8rem", 36: "9rem", 40: "10rem", 44: "11rem", 48: "12rem", 52: "13rem", 56: "14rem", 60: "15rem", 64: "16rem", 72: "18rem", 80: "20rem", 96: "24rem" }, animation: { none: "none", spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite", pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", bounce: "bounce 1s infinite" }, aspectRatio: { auto: "auto", square: "1 / 1", video: "16 / 9" }, backdropBlur: ({ theme: A }) => A("blur"), backdropBrightness: ({ theme: A }) => A("brightness"), backdropContrast: ({ theme: A }) => A("contrast"), backdropGrayscale: ({ theme: A }) => A("grayscale"), backdropHueRotate: ({ theme: A }) => A("hueRotate"), backdropInvert: ({ theme: A }) => A("invert"), backdropOpacity: ({ theme: A }) => A("opacity"), backdropSaturate: ({ theme: A }) => A("saturate"), backdropSepia: ({ theme: A }) => A("sepia"), backgroundColor: ({ theme: A }) => A("colors"), backgroundImage: { none: "none", "gradient-to-t": "linear-gradient(to top, var(--tw-gradient-stops))", "gradient-to-tr": "linear-gradient(to top right, var(--tw-gradient-stops))", "gradient-to-r": "linear-gradient(to right, var(--tw-gradient-stops))", "gradient-to-br": "linear-gradient(to bottom right, var(--tw-gradient-stops))", "gradient-to-b": "linear-gradient(to bottom, var(--tw-gradient-stops))", "gradient-to-bl": "linear-gradient(to bottom left, var(--tw-gradient-stops))", "gradient-to-l": "linear-gradient(to left, var(--tw-gradient-stops))", "gradient-to-tl": "linear-gradient(to top left, var(--tw-gradient-stops))" }, backgroundOpacity: ({ theme: A }) => A("opacity"), backgroundPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, backgroundSize: { auto: "auto", cover: "cover", contain: "contain" }, blur: { 0: "0", none: "0", sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" }, brightness: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5", 200: "2" }, borderColor: ({ theme: A }) => ({ ...A("colors"), DEFAULT: A("colors.gray.200", "currentColor") }), borderOpacity: ({ theme: A }) => A("opacity"), borderRadius: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" }, borderSpacing: ({ theme: A }) => ({ ...A("spacing") }), borderWidth: { DEFAULT: "1px", 0: "0px", 2: "2px", 4: "4px", 8: "8px" }, boxShadow: { sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)", none: "none" }, boxShadowColor: ({ theme: A }) => A("colors"), caretColor: ({ theme: A }) => A("colors"), accentColor: ({ theme: A }) => ({ ...A("colors"), auto: "auto" }), contrast: { 0: "0", 50: ".5", 75: ".75", 100: "1", 125: "1.25", 150: "1.5", 200: "2" }, container: {}, content: { none: "none" }, cursor: { auto: "auto", default: "default", pointer: "pointer", wait: "wait", text: "text", move: "move", help: "help", "not-allowed": "not-allowed", none: "none", "context-menu": "context-menu", progress: "progress", cell: "cell", crosshair: "crosshair", "vertical-text": "vertical-text", alias: "alias", copy: "copy", "no-drop": "no-drop", grab: "grab", grabbing: "grabbing", "all-scroll": "all-scroll", "col-resize": "col-resize", "row-resize": "row-resize", "n-resize": "n-resize", "e-resize": "e-resize", "s-resize": "s-resize", "w-resize": "w-resize", "ne-resize": "ne-resize", "nw-resize": "nw-resize", "se-resize": "se-resize", "sw-resize": "sw-resize", "ew-resize": "ew-resize", "ns-resize": "ns-resize", "nesw-resize": "nesw-resize", "nwse-resize": "nwse-resize", "zoom-in": "zoom-in", "zoom-out": "zoom-out" }, divideColor: ({ theme: A }) => A("borderColor"), divideOpacity: ({ theme: A }) => A("borderOpacity"), divideWidth: ({ theme: A }) => A("borderWidth"), dropShadow: { sm: "0 1px 1px rgb(0 0 0 / 0.05)", DEFAULT: ["0 1px 2px rgb(0 0 0 / 0.1)", "0 1px 1px rgb(0 0 0 / 0.06)"], md: ["0 4px 3px rgb(0 0 0 / 0.07)", "0 2px 2px rgb(0 0 0 / 0.06)"], lg: ["0 10px 8px rgb(0 0 0 / 0.04)", "0 4px 3px rgb(0 0 0 / 0.1)"], xl: ["0 20px 13px rgb(0 0 0 / 0.03)", "0 8px 5px rgb(0 0 0 / 0.08)"], "2xl": "0 25px 25px rgb(0 0 0 / 0.15)", none: "0 0 #0000" }, fill: ({ theme: A }) => A("colors"), grayscale: { 0: "0", DEFAULT: "100%" }, hueRotate: { 0: "0deg", 15: "15deg", 30: "30deg", 60: "60deg", 90: "90deg", 180: "180deg" }, invert: { 0: "0", DEFAULT: "100%" }, flex: { 1: "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }, flexBasis: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%" }), flexGrow: { 0: "0", DEFAULT: "1" }, flexShrink: { 0: "0", DEFAULT: "1" }, fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", '"Noto Sans"', "sans-serif", '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'], serif: ["ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', '"Courier New"', "monospace"] }, fontSize: { xs: ["0.75rem", { lineHeight: "1rem" }], sm: ["0.875rem", { lineHeight: "1.25rem" }], base: ["1rem", { lineHeight: "1.5rem" }], lg: ["1.125rem", { lineHeight: "1.75rem" }], xl: ["1.25rem", { lineHeight: "1.75rem" }], "2xl": ["1.5rem", { lineHeight: "2rem" }], "3xl": ["1.875rem", { lineHeight: "2.25rem" }], "4xl": ["2.25rem", { lineHeight: "2.5rem" }], "5xl": ["3rem", { lineHeight: "1" }], "6xl": ["3.75rem", { lineHeight: "1" }], "7xl": ["4.5rem", { lineHeight: "1" }], "8xl": ["6rem", { lineHeight: "1" }], "9xl": ["8rem", { lineHeight: "1" }] }, fontWeight: { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" }, gap: ({ theme: A }) => A("spacing"), gradientColorStops: ({ theme: A }) => A("colors"), gridAutoColumns: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridAutoRows: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridColumn: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-7": "span 7 / span 7", "span-8": "span 8 / span 8", "span-9": "span 9 / span 9", "span-10": "span 10 / span 10", "span-11": "span 11 / span 11", "span-12": "span 12 / span 12", "span-full": "1 / -1" }, gridColumnEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridColumnStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridRow: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-full": "1 / -1" }, gridRowStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridRowEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridTemplateColumns: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))", 7: "repeat(7, minmax(0, 1fr))", 8: "repeat(8, minmax(0, 1fr))", 9: "repeat(9, minmax(0, 1fr))", 10: "repeat(10, minmax(0, 1fr))", 11: "repeat(11, minmax(0, 1fr))", 12: "repeat(12, minmax(0, 1fr))" }, gridTemplateRows: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))" }, height: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), inset: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), keyframes: { spin: { to: { transform: "rotate(360deg)" } }, ping: { "75%, 100%": { transform: "scale(2)", opacity: "0" } }, pulse: { "50%": { opacity: ".5" } }, bounce: { "0%, 100%": { transform: "translateY(-25%)", animationTimingFunction: "cubic-bezier(0.8,0,1,1)" }, "50%": { transform: "none", animationTimingFunction: "cubic-bezier(0,0,0.2,1)" } } }, letterSpacing: { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }, lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2", 3: ".75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem" }, listStyleType: { none: "none", disc: "disc", decimal: "decimal" }, margin: ({ theme: A }) => ({ auto: "auto", ...A("spacing") }), maxHeight: ({ theme: A }) => ({ ...A("spacing"), full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), maxWidth: ({ theme: A, breakpoints: e }) => ({ none: "none", 0: "0rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch", ...e(A("screens")) }), minHeight: { 0: "0px", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }, minWidth: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" }, objectPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, opacity: { 0: "0", 5: "0.05", 10: "0.1", 20: "0.2", 25: "0.25", 30: "0.3", 40: "0.4", 50: "0.5", 60: "0.6", 70: "0.7", 75: "0.75", 80: "0.8", 90: "0.9", 95: "0.95", 100: "1" }, order: { first: "-9999", last: "9999", none: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12" }, padding: ({ theme: A }) => A("spacing"), placeholderColor: ({ theme: A }) => A("colors"), placeholderOpacity: ({ theme: A }) => A("opacity"), outlineColor: ({ theme: A }) => A("colors"), outlineOffset: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, outlineWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringColor: ({ theme: A }) => ({ DEFAULT: A("colors.blue.500", "#3b82f6"), ...A("colors") }), ringOffsetColor: ({ theme: A }) => A("colors"), ringOffsetWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringOpacity: ({ theme: A }) => ({ DEFAULT: "0.5", ...A("opacity") }), ringWidth: { DEFAULT: "3px", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, rotate: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg", 45: "45deg", 90: "90deg", 180: "180deg" }, saturate: { 0: "0", 50: ".5", 100: "1", 150: "1.5", 200: "2" }, scale: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5" }, scrollMargin: ({ theme: A }) => ({ ...A("spacing") }), scrollPadding: ({ theme: A }) => A("spacing"), sepia: { 0: "0", DEFAULT: "100%" }, skew: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg" }, space: ({ theme: A }) => ({ ...A("spacing") }), stroke: ({ theme: A }) => A("colors"), strokeWidth: { 0: "0", 1: "1", 2: "2" }, textColor: ({ theme: A }) => A("colors"), textDecorationColor: ({ theme: A }) => A("colors"), textDecorationThickness: { auto: "auto", "from-font": "from-font", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textUnderlineOffset: { auto: "auto", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textIndent: ({ theme: A }) => ({ ...A("spacing") }), textOpacity: ({ theme: A }) => A("opacity"), transformOrigin: { center: "center", top: "top", "top-right": "top right", right: "right", "bottom-right": "bottom right", bottom: "bottom", "bottom-left": "bottom left", left: "left", "top-left": "top left" }, transitionDelay: { 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionDuration: { DEFAULT: "150ms", 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionProperty: { none: "none", all: "all", DEFAULT: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter", colors: "color, background-color, border-color, text-decoration-color, fill, stroke", opacity: "opacity", shadow: "box-shadow", transform: "transform" }, transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)", linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" }, translate: ({ theme: A }) => ({ ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), width: ({ theme: A }) => ({ auto: "auto", ...A("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%", screen: "100vw", min: "min-content", max: "max-content", fit: "fit-content" }), willChange: { auto: "auto", scroll: "scroll-position", contents: "contents", transform: "transform" }, zIndex: { auto: "auto", 0: "0", 10: "10", 20: "20", 30: "30", 40: "40", 50: "50" } }, variantOrder: ["first", "last", "odd", "even", "visited", "checked", "empty", "read-only", "group-hover", "group-focus", "focus-within", "hover", "focus", "focus-visible", "active", "disabled"], plugins: [] };
});
var fn = {};
kt(fn, { default: () => rc });
var rc;
var Bn = Xe(() => {
  rc = { info(A, e) {
    console.info(...Array.isArray(A) ? [A] : [e, A]);
  }, warn(A, e) {
    console.warn(...Array.isArray(A) ? [A] : [e, A]);
  }, risk(A, e) {
    console.error(...Array.isArray(A) ? [A] : [e, A]);
  } };
});
var Fa = K2((vi) => {
  "use strict";
  Object.defineProperty(vi, "__esModule", { value: true });
  Object.defineProperty(vi, "default", { enumerable: true, get: () => oc });
  var nc = ic((Bn(), Yr(fn)));
  function ic(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function or({ version: A, from: e, to: t }) {
    nc.default.warn(`${e}-color-renamed`, [`As of Tailwind CSS ${A}, \`${e}\` has been renamed to \`${t}\`.`, "Update your configuration file to silence this warning."]);
  }
  var oc = { inherit: "inherit", current: "currentColor", transparent: "transparent", black: "#000", white: "#fff", slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" }, gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151", 800: "#1f2937", 900: "#111827" }, zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b" }, neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717" }, stone: { 50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1", 400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c", 800: "#292524", 900: "#1c1917" }, red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" }, orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" }, amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" }, yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" }, lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314" }, green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" }, emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" }, teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a" }, cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63" }, sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e" }, blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" }, indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" }, violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95" }, purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" }, fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75" }, pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" }, rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337" }, get lightBlue() {
    return or({ version: "v2.2", from: "lightBlue", to: "sky" }), this.sky;
  }, get warmGray() {
    return or({ version: "v3.0", from: "warmGray", to: "stone" }), this.stone;
  }, get trueGray() {
    return or({ version: "v3.0", from: "trueGray", to: "neutral" }), this.neutral;
  }, get coolGray() {
    return or({ version: "v3.0", from: "coolGray", to: "gray" }), this.gray;
  }, get blueGray() {
    return or({ version: "v3.0", from: "blueGray", to: "slate" }), this.slate;
  } };
});
var La = K2((ki) => {
  "use strict";
  Object.defineProperty(ki, "__esModule", { value: true });
  Object.defineProperty(ki, "defaults", { enumerable: true, get: () => sc });
  function sc(A, ...e) {
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
var Ga = K2((xi) => {
  "use strict";
  Object.defineProperty(xi, "__esModule", { value: true });
  Object.defineProperty(xi, "toPath", { enumerable: true, get: () => ac });
  function ac(A) {
    if (Array.isArray(A))
      return A;
    let e = A.split("[").length - 1, t = A.split("]").length - 1;
    if (e !== t)
      throw new Error(`Path is invalid. Has unbalanced brackets: ${A}`);
    return A.split(/\.(?![^\[]*\])|[\[\]]/g).filter(Boolean);
  }
});
var Ha = K2((Ri) => {
  "use strict";
  Object.defineProperty(Ri, "__esModule", { value: true });
  Object.defineProperty(Ri, "normalizeConfig", { enumerable: true, get: () => uc });
  var sr = gc((Bn(), Yr(fn)));
  function Ua(A) {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap(), t = /* @__PURE__ */ new WeakMap();
    return (Ua = function(r) {
      return r ? t : e;
    })(A);
  }
  function gc(A, e) {
    if (!e && A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var t = Ua(e);
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
  function uc(A) {
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
    })() || sr.default.warn("purge-deprecation", ["The `purge`/`content` options have changed in Tailwind CSS v3.0.", "Update your configuration file to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#configure-content-sources"]), A.safelist = (() => {
      var r;
      let { content: n, purge: i, safelist: o } = A;
      return Array.isArray(o) ? o : Array.isArray(n == null ? void 0 : n.safelist) ? n.safelist : Array.isArray(i == null ? void 0 : i.safelist) ? i.safelist : Array.isArray(i == null || (r = i.options) === null || r === void 0 ? void 0 : r.safelist) ? i.options.safelist : [];
    })(), typeof A.prefix == "function")
      sr.default.warn("prefix-function", ["As of Tailwind CSS v3.0, `prefix` cannot be a function.", "Update `prefix` in your configuration to be a string to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#prefix-cannot-be-a-function"]), A.prefix = "";
    else {
      var t;
      A.prefix = (t = A.prefix) !== null && t !== void 0 ? t : "";
    }
    A.content = { files: (() => {
      let { content: r, purge: n } = A;
      return Array.isArray(n) ? n : Array.isArray(n == null ? void 0 : n.content) ? n.content : Array.isArray(r) ? r : Array.isArray(r == null ? void 0 : r.content) ? r.content : Array.isArray(r == null ? void 0 : r.files) ? r.files : [];
    })(), extract: (() => {
      let r = (() => {
        var o, a, u2, l2, I, E, C, d2, p, y;
        return !((o = A.purge) === null || o === void 0) && o.extract ? A.purge.extract : !((a = A.content) === null || a === void 0) && a.extract ? A.content.extract : !((u2 = A.purge) === null || u2 === void 0 || (l2 = u2.extract) === null || l2 === void 0) && l2.DEFAULT ? A.purge.extract.DEFAULT : !((I = A.content) === null || I === void 0 || (E = I.extract) === null || E === void 0) && E.DEFAULT ? A.content.extract.DEFAULT : !((C = A.purge) === null || C === void 0 || (d2 = C.options) === null || d2 === void 0) && d2.extractors ? A.purge.options.extractors : !((p = A.content) === null || p === void 0 || (y = p.options) === null || y === void 0) && y.extractors ? A.content.options.extractors : {};
      })(), n = {}, i = (() => {
        var o, a, u2, l2;
        if (!((o = A.purge) === null || o === void 0 || (a = o.options) === null || a === void 0) && a.defaultExtractor)
          return A.purge.options.defaultExtractor;
        if (!((u2 = A.content) === null || u2 === void 0 || (l2 = u2.options) === null || l2 === void 0) && l2.defaultExtractor)
          return A.content.options.defaultExtractor;
      })();
      if (i !== void 0 && (n.DEFAULT = i), typeof r == "function")
        n.DEFAULT = r;
      else if (Array.isArray(r))
        for (let { extensions: o, extractor: a } of r ?? [])
          for (let u2 of o)
            n[u2] = a;
      else
        typeof r == "object" && r !== null && Object.assign(n, r);
      return n;
    })(), transform: (() => {
      let r = (() => {
        var i, o, a, u2, l2, I;
        return !((i = A.purge) === null || i === void 0) && i.transform ? A.purge.transform : !((o = A.content) === null || o === void 0) && o.transform ? A.content.transform : !((a = A.purge) === null || a === void 0 || (u2 = a.transform) === null || u2 === void 0) && u2.DEFAULT ? A.purge.transform.DEFAULT : !((l2 = A.content) === null || l2 === void 0 || (I = l2.transform) === null || I === void 0) && I.DEFAULT ? A.content.transform.DEFAULT : {};
      })(), n = {};
      return typeof r == "function" && (n.DEFAULT = r), typeof r == "object" && r !== null && Object.assign(n, r), n;
    })() };
    for (let r of A.content.files)
      if (typeof r == "string" && /{([^,]*?)}/g.test(r)) {
        sr.default.warn("invalid-glob-braces", [`The glob pattern ${(0, sr.dim)(r)} in your Tailwind CSS configuration is invalid.`, `Update it to ${(0, sr.dim)(r.replace(/{([^,]*?)}/g, "$1"))} to silence this warning.`]);
        break;
      }
    return A;
  }
});
var Oa = K2((Ni) => {
  "use strict";
  Object.defineProperty(Ni, "__esModule", { value: true });
  Object.defineProperty(Ni, "default", { enumerable: true, get: () => Ic });
  function Ic(A) {
    if (Object.prototype.toString.call(A) !== "[object Object]")
      return false;
    let e = Object.getPrototypeOf(A);
    return e === null || e === Object.prototype;
  }
});
var Ta = K2((Fi) => {
  "use strict";
  Object.defineProperty(Fi, "__esModule", { value: true });
  Object.defineProperty(Fi, "cloneDeep", { enumerable: true, get: () => Mi });
  function Mi(A) {
    return Array.isArray(A) ? A.map((e) => Mi(e)) : typeof A == "object" && A !== null ? Object.fromEntries(Object.entries(A).map(([e, t]) => [e, Mi(t)])) : A;
  }
});
var Li = K2((En, Pa) => {
  "use strict";
  En.__esModule = true;
  En.default = fc;
  function lc(A) {
    for (var e = A.toLowerCase(), t = "", r = false, n = 0; n < 6 && e[n] !== void 0; n++) {
      var i = e.charCodeAt(n), o = i >= 97 && i <= 102 || i >= 48 && i <= 57;
      if (r = i === 32, !o)
        break;
      t += e[n];
    }
    if (t.length !== 0) {
      var a = parseInt(t, 16), u2 = a >= 55296 && a <= 57343;
      return u2 || a === 0 || a > 1114111 ? ["\uFFFD", t.length + (r ? 1 : 0)] : [String.fromCodePoint(a), t.length + (r ? 1 : 0)];
    }
  }
  var cc = /\\/;
  function fc(A) {
    var e = cc.test(A);
    if (!e)
      return A;
    for (var t = "", r = 0; r < A.length; r++) {
      if (A[r] === "\\") {
        var n = lc(A.slice(r + 1, r + 7));
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
  Pa.exports = En.default;
});
var Ja = K2((Qn, _a2) => {
  "use strict";
  Qn.__esModule = true;
  Qn.default = Bc;
  function Bc(A) {
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
  _a2.exports = Qn.default;
});
var Ka = K2((Cn, Wa) => {
  "use strict";
  Cn.__esModule = true;
  Cn.default = Ec;
  function Ec(A) {
    for (var e = arguments.length, t = new Array(e > 1 ? e - 1 : 0), r = 1; r < e; r++)
      t[r - 1] = arguments[r];
    for (; t.length > 0; ) {
      var n = t.shift();
      A[n] || (A[n] = {}), A = A[n];
    }
  }
  Wa.exports = Cn.default;
});
var qa = K2((dn, Ya) => {
  "use strict";
  dn.__esModule = true;
  dn.default = Qc;
  function Qc(A) {
    for (var e = "", t = A.indexOf("/*"), r = 0; t >= 0; ) {
      e = e + A.slice(r, t);
      var n = A.indexOf("*/", t + 2);
      if (n < 0)
        return e;
      r = n + 2, t = A.indexOf("/*", r);
    }
    return e = e + A.slice(r), e;
  }
  Ya.exports = dn.default;
});
var ar = K2((Je) => {
  "use strict";
  Je.__esModule = true;
  Je.stripComments = Je.ensureObject = Je.getProp = Je.unesc = void 0;
  var Cc = hn(Li());
  Je.unesc = Cc.default;
  var dc = hn(Ja());
  Je.getProp = dc.default;
  var hc = hn(Ka());
  Je.ensureObject = hc.default;
  var pc = hn(qa());
  Je.stripComments = pc.default;
  function hn(A) {
    return A && A.__esModule ? A : { default: A };
  }
});
var je = K2((gr, za) => {
  "use strict";
  gr.__esModule = true;
  gr.default = void 0;
  var Xa = ar();
  function Va(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function mc(A, e, t) {
    return e && Va(A.prototype, e), t && Va(A, t), A;
  }
  var yc = function A(e, t) {
    if (typeof e != "object" || e === null)
      return e;
    var r = new e.constructor();
    for (var n in e)
      if (e.hasOwnProperty(n)) {
        var i = e[n], o = typeof i;
        n === "parent" && o === "object" ? t && (r[n] = t) : i instanceof Array ? r[n] = i.map(function(a) {
          return A(a, r);
        }) : r[n] = A(i, r);
      }
    return r;
  }, wc = function() {
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
      var n = yc(this);
      for (var i in r)
        n[i] = r[i];
      return n;
    }, e.appendToPropertyAndEscape = function(r, n, i) {
      this.raws || (this.raws = {});
      var o = this[r], a = this.raws[r];
      this[r] = o + n, a || i !== n ? this.raws[r] = (a || o) + i : delete this.raws[r];
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
    }, mc(A, [{ key: "rawSpaceBefore", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.before;
      return r === void 0 && (r = this.spaces && this.spaces.before), r || "";
    }, set: function(r) {
      (0, Xa.ensureObject)(this, "raws", "spaces"), this.raws.spaces.before = r;
    } }, { key: "rawSpaceAfter", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.after;
      return r === void 0 && (r = this.spaces.after), r || "";
    }, set: function(r) {
      (0, Xa.ensureObject)(this, "raws", "spaces"), this.raws.spaces.after = r;
    } }]), A;
  }();
  gr.default = wc;
  za.exports = gr.default;
});
var ee = K2((SA) => {
  "use strict";
  SA.__esModule = true;
  SA.UNIVERSAL = SA.ATTRIBUTE = SA.CLASS = SA.COMBINATOR = SA.COMMENT = SA.ID = SA.NESTING = SA.PSEUDO = SA.ROOT = SA.SELECTOR = SA.STRING = SA.TAG = void 0;
  var Dc = "tag";
  SA.TAG = Dc;
  var Sc = "string";
  SA.STRING = Sc;
  var bc = "selector";
  SA.SELECTOR = bc;
  var vc = "root";
  SA.ROOT = vc;
  var kc = "pseudo";
  SA.PSEUDO = kc;
  var xc = "nesting";
  SA.NESTING = xc;
  var Rc = "id";
  SA.ID = Rc;
  var Nc = "comment";
  SA.COMMENT = Nc;
  var Mc = "combinator";
  SA.COMBINATOR = Mc;
  var Fc = "class";
  SA.CLASS = Fc;
  var Lc = "attribute";
  SA.ATTRIBUTE = Lc;
  var Gc = "universal";
  SA.UNIVERSAL = Gc;
});
var pn = K2((ur, Ag) => {
  "use strict";
  ur.__esModule = true;
  ur.default = void 0;
  var Uc = Oc(je()), $e = Hc(ee());
  function $a() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return $a = function() {
      return A;
    }, A;
  }
  function Hc(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = $a();
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
  function Oc(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Tc(A, e) {
    var t;
    if (typeof Symbol > "u" || A[Symbol.iterator] == null) {
      if (Array.isArray(A) || (t = Pc(A)) || e && A && typeof A.length == "number") {
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
  function Pc(A, e) {
    if (A) {
      if (typeof A == "string")
        return Za(A, e);
      var t = Object.prototype.toString.call(A).slice(8, -1);
      if (t === "Object" && A.constructor && (t = A.constructor.name), t === "Map" || t === "Set")
        return Array.from(A);
      if (t === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))
        return Za(A, e);
    }
  }
  function Za(A, e) {
    (e == null || e > A.length) && (e = A.length);
    for (var t = 0, r = new Array(e); t < e; t++)
      r[t] = A[t];
    return r;
  }
  function ja(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function _c(A, e, t) {
    return e && ja(A.prototype, e), t && ja(A, t), A;
  }
  function Jc(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Gi(A, e);
  }
  function Gi(A, e) {
    return Gi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Gi(A, e);
  }
  var Wc = function(A) {
    Jc(e, A);
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
      for (var n = Tc(this.nodes), i; !(i = n()).done; ) {
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
      var a;
      for (var u2 in this.indexes)
        a = this.indexes[u2], o <= a && (this.indexes[u2] = a + 1);
      return this;
    }, t.insertBefore = function(n, i) {
      i.parent = this;
      var o = this.index(n);
      this.nodes.splice(o, 0, i), i.parent = this;
      var a;
      for (var u2 in this.indexes)
        a = this.indexes[u2], a <= o && (this.indexes[u2] = a + 1);
      return this;
    }, t._findChildAtPosition = function(n, i) {
      var o = void 0;
      return this.each(function(a) {
        if (a.atPosition) {
          var u2 = a.atPosition(n, i);
          if (u2)
            return o = u2, false;
        } else if (a.isAtPosition(n, i))
          return o = a, false;
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
        for (var o, a; this.indexes[i] < this.length && (o = this.indexes[i], a = n(this.at(o), o), a !== false); )
          this.indexes[i] += 1;
        if (delete this.indexes[i], a === false)
          return false;
      }
    }, t.walk = function(n) {
      return this.each(function(i, o) {
        var a = n(i, o);
        if (a !== false && i.length && (a = i.walk(n)), a === false)
          return false;
      });
    }, t.walkAttributes = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.ATTRIBUTE)
          return n.call(i, o);
      });
    }, t.walkClasses = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.CLASS)
          return n.call(i, o);
      });
    }, t.walkCombinators = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.COMBINATOR)
          return n.call(i, o);
      });
    }, t.walkComments = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.COMMENT)
          return n.call(i, o);
      });
    }, t.walkIds = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.ID)
          return n.call(i, o);
      });
    }, t.walkNesting = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.NESTING)
          return n.call(i, o);
      });
    }, t.walkPseudos = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.PSEUDO)
          return n.call(i, o);
      });
    }, t.walkTags = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.TAG)
          return n.call(i, o);
      });
    }, t.walkUniversals = function(n) {
      var i = this;
      return this.walk(function(o) {
        if (o.type === $e.UNIVERSAL)
          return n.call(i, o);
      });
    }, t.split = function(n) {
      var i = this, o = [];
      return this.reduce(function(a, u2, l2) {
        var I = n.call(i, u2);
        return o.push(u2), I ? (a.push(o), o = []) : l2 === i.length - 1 && a.push(o), a;
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
    }, _c(e, [{ key: "first", get: function() {
      return this.at(0);
    } }, { key: "last", get: function() {
      return this.at(this.length - 1);
    } }, { key: "length", get: function() {
      return this.nodes.length;
    } }]), e;
  }(Uc.default);
  ur.default = Wc;
  Ag.exports = ur.default;
});
var Hi = K2((Ir, tg) => {
  "use strict";
  Ir.__esModule = true;
  Ir.default = void 0;
  var Kc = qc(pn()), Yc = ee();
  function qc(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function eg(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function Xc(A, e, t) {
    return e && eg(A.prototype, e), t && eg(A, t), A;
  }
  function Vc(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Ui(A, e);
  }
  function Ui(A, e) {
    return Ui = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Ui(A, e);
  }
  var zc = function(A) {
    Vc(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = Yc.ROOT, n;
    }
    var t = e.prototype;
    return t.toString = function() {
      var n = this.reduce(function(i, o) {
        return i.push(String(o)), i;
      }, []).join(",");
      return this.trailingComma ? n + "," : n;
    }, t.error = function(n, i) {
      return this._error ? this._error(n, i) : new Error(n);
    }, Xc(e, [{ key: "errorGenerator", set: function(n) {
      this._error = n;
    } }]), e;
  }(Kc.default);
  Ir.default = zc;
  tg.exports = Ir.default;
});
var Ti = K2((lr, rg) => {
  "use strict";
  lr.__esModule = true;
  lr.default = void 0;
  var Zc = $c(pn()), jc = ee();
  function $c(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Af(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Oi(A, e);
  }
  function Oi(A, e) {
    return Oi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Oi(A, e);
  }
  var ef = function(A) {
    Af(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = jc.SELECTOR, r;
    }
    return e;
  }(Zc.default);
  lr.default = ef;
  rg.exports = lr.default;
});
var mn = K2((u0, ng) => {
  "use strict";
  var tf = {}, rf = tf.hasOwnProperty, nf = function(e, t) {
    if (!e)
      return t;
    var r = {};
    for (var n in t)
      r[n] = rf.call(e, n) ? e[n] : t[n];
    return r;
  }, of = /[ -,\.\/:-@\[-\^`\{-~]/, sf = /[ -,\.\/:-@\[\]\^`\{-~]/, af = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g, Pi = function A(e, t) {
    t = nf(t, A.options), t.quotes != "single" && t.quotes != "double" && (t.quotes = "single");
    for (var r = t.quotes == "double" ? '"' : "'", n = t.isIdentifier, i = e.charAt(0), o = "", a = 0, u2 = e.length; a < u2; ) {
      var l2 = e.charAt(a++), I = l2.charCodeAt(), E = void 0;
      if (I < 32 || I > 126) {
        if (I >= 55296 && I <= 56319 && a < u2) {
          var C = e.charCodeAt(a++);
          (C & 64512) == 56320 ? I = ((I & 1023) << 10) + (C & 1023) + 65536 : a--;
        }
        E = "\\" + I.toString(16).toUpperCase() + " ";
      } else
        t.escapeEverything ? of.test(l2) ? E = "\\" + l2 : E = "\\" + I.toString(16).toUpperCase() + " " : /[\t\n\f\r\x0B]/.test(l2) ? E = "\\" + I.toString(16).toUpperCase() + " " : l2 == "\\" || !n && (l2 == '"' && r == l2 || l2 == "'" && r == l2) || n && sf.test(l2) ? E = "\\" + l2 : E = l2;
      o += E;
    }
    return n && (/^-[-\d]/.test(o) ? o = "\\-" + o.slice(1) : /\d/.test(i) && (o = "\\3" + i + " " + o.slice(1))), o = o.replace(af, function(d2, p, y) {
      return p && p.length % 2 ? d2 : (p || "") + y;
    }), !n && t.wrap ? r + o + r : o;
  };
  Pi.options = { escapeEverything: false, isIdentifier: false, quotes: "single", wrap: false };
  Pi.version = "3.0.0";
  ng.exports = Pi;
});
var Ji = K2((cr, sg) => {
  "use strict";
  cr.__esModule = true;
  cr.default = void 0;
  var gf = og(mn()), uf = ar(), If = og(je()), lf = ee();
  function og(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function ig(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function cf(A, e, t) {
    return e && ig(A.prototype, e), t && ig(A, t), A;
  }
  function ff(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, _i(A, e);
  }
  function _i(A, e) {
    return _i = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, _i(A, e);
  }
  var Bf = function(A) {
    ff(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = lf.CLASS, n._constructed = true, n;
    }
    var t = e.prototype;
    return t.valueToString = function() {
      return "." + A.prototype.valueToString.call(this);
    }, cf(e, [{ key: "value", get: function() {
      return this._value;
    }, set: function(n) {
      if (this._constructed) {
        var i = (0, gf.default)(n, { isIdentifier: true });
        i !== n ? ((0, uf.ensureObject)(this, "raws"), this.raws.value = i) : this.raws && delete this.raws.value;
      }
      this._value = n;
    } }]), e;
  }(If.default);
  cr.default = Bf;
  sg.exports = cr.default;
});
var Ki = K2((fr, ag) => {
  "use strict";
  fr.__esModule = true;
  fr.default = void 0;
  var Ef = Cf(je()), Qf = ee();
  function Cf(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function df(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Wi(A, e);
  }
  function Wi(A, e) {
    return Wi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Wi(A, e);
  }
  var hf = function(A) {
    df(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = Qf.COMMENT, r;
    }
    return e;
  }(Ef.default);
  fr.default = hf;
  ag.exports = fr.default;
});
var qi = K2((Br, gg) => {
  "use strict";
  Br.__esModule = true;
  Br.default = void 0;
  var pf = yf(je()), mf = ee();
  function yf(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function wf(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Yi(A, e);
  }
  function Yi(A, e) {
    return Yi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Yi(A, e);
  }
  var Df = function(A) {
    wf(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = mf.ID, n;
    }
    var t = e.prototype;
    return t.valueToString = function() {
      return "#" + A.prototype.valueToString.call(this);
    }, e;
  }(pf.default);
  Br.default = Df;
  gg.exports = Br.default;
});
var yn = K2((Er, lg) => {
  "use strict";
  Er.__esModule = true;
  Er.default = void 0;
  var Sf = Ig(mn()), bf = ar(), vf = Ig(je());
  function Ig(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function ug(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function kf(A, e, t) {
    return e && ug(A.prototype, e), t && ug(A, t), A;
  }
  function xf(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Xi(A, e);
  }
  function Xi(A, e) {
    return Xi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Xi(A, e);
  }
  var Rf = function(A) {
    xf(e, A);
    function e() {
      return A.apply(this, arguments) || this;
    }
    var t = e.prototype;
    return t.qualifiedName = function(n) {
      return this.namespace ? this.namespaceString + "|" + n : n;
    }, t.valueToString = function() {
      return this.qualifiedName(A.prototype.valueToString.call(this));
    }, kf(e, [{ key: "namespace", get: function() {
      return this._namespace;
    }, set: function(n) {
      if (n === true || n === "*" || n === "&") {
        this._namespace = n, this.raws && delete this.raws.namespace;
        return;
      }
      var i = (0, Sf.default)(n, { isIdentifier: true });
      this._namespace = n, i !== n ? ((0, bf.ensureObject)(this, "raws"), this.raws.namespace = i) : this.raws && delete this.raws.namespace;
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
  }(vf.default);
  Er.default = Rf;
  lg.exports = Er.default;
});
var zi = K2((Qr, cg) => {
  "use strict";
  Qr.__esModule = true;
  Qr.default = void 0;
  var Nf = Ff(yn()), Mf = ee();
  function Ff(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Lf(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Vi(A, e);
  }
  function Vi(A, e) {
    return Vi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Vi(A, e);
  }
  var Gf = function(A) {
    Lf(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = Mf.TAG, r;
    }
    return e;
  }(Nf.default);
  Qr.default = Gf;
  cg.exports = Qr.default;
});
var ji = K2((Cr, fg) => {
  "use strict";
  Cr.__esModule = true;
  Cr.default = void 0;
  var Uf = Of(je()), Hf = ee();
  function Of(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Tf(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Zi(A, e);
  }
  function Zi(A, e) {
    return Zi = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Zi(A, e);
  }
  var Pf = function(A) {
    Tf(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = Hf.STRING, r;
    }
    return e;
  }(Uf.default);
  Cr.default = Pf;
  fg.exports = Cr.default;
});
var Ao = K2((dr, Bg) => {
  "use strict";
  dr.__esModule = true;
  dr.default = void 0;
  var _f = Wf(pn()), Jf = ee();
  function Wf(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Kf(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, $i(A, e);
  }
  function $i(A, e) {
    return $i = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, $i(A, e);
  }
  var Yf = function(A) {
    Kf(e, A);
    function e(r) {
      var n;
      return n = A.call(this, r) || this, n.type = Jf.PSEUDO, n;
    }
    var t = e.prototype;
    return t.toString = function() {
      var n = this.length ? "(" + this.map(String).join(",") + ")" : "";
      return [this.rawSpaceBefore, this.stringifyProperty("value"), n, this.rawSpaceAfter].join("");
    }, e;
  }(_f.default);
  dr.default = Yf;
  Bg.exports = dr.default;
});
var Qg = K2((I0, Eg) => {
  Eg.exports = function(e, t) {
    return function(...r) {
      return console.warn(t), e(...r);
    };
  };
});
var oo = K2((mr) => {
  "use strict";
  mr.__esModule = true;
  mr.unescapeValue = io;
  mr.default = void 0;
  var hr = no(mn()), qf = no(Li()), Xf = no(yn()), Vf = ee(), eo;
  function no(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Cg(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function zf(A, e, t) {
    return e && Cg(A.prototype, e), t && Cg(A, t), A;
  }
  function Zf(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, ro(A, e);
  }
  function ro(A, e) {
    return ro = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, ro(A, e);
  }
  var pr = Qg(), jf = /^('|")([^]*)\1$/, $f = pr(function() {
  }, "Assigning an attribute a value containing characters that might need to be escaped is deprecated. Call attribute.setValue() instead."), AB = pr(function() {
  }, "Assigning attr.quoted is deprecated and has no effect. Assign to attr.quoteMark instead."), eB = pr(function() {
  }, "Constructing an Attribute selector with a value without specifying quoteMark is deprecated. Note: The value should be unescaped now.");
  function io(A) {
    var e = false, t = null, r = A, n = r.match(jf);
    return n && (t = n[1], r = n[2]), r = (0, qf.default)(r), r !== A && (e = true), { deprecatedUsage: e, unescaped: r, quoteMark: t };
  }
  function tB(A) {
    if (A.quoteMark !== void 0 || A.value === void 0)
      return A;
    eB();
    var e = io(A.value), t = e.quoteMark, r = e.unescaped;
    return A.raws || (A.raws = {}), A.raws.value === void 0 && (A.raws.value = A.value), A.value = r, A.quoteMark = t, A;
  }
  var wn = function(A) {
    Zf(e, A);
    function e(r) {
      var n;
      return r === void 0 && (r = {}), n = A.call(this, tB(r)) || this, n.type = Vf.ATTRIBUTE, n.raws = n.raws || {}, Object.defineProperty(n.raws, "unquoted", { get: pr(function() {
        return n.value;
      }, "attr.raws.unquoted is deprecated. Call attr.value instead."), set: pr(function() {
        return n.value;
      }, "Setting attr.raws.unquoted is deprecated and has no effect. attr.value is unescaped by default now.") }), n._constructed = true, n;
    }
    var t = e.prototype;
    return t.getQuotedValue = function(n) {
      n === void 0 && (n = {});
      var i = this._determineQuoteMark(n), o = to[i], a = (0, hr.default)(this._value, o);
      return a;
    }, t._determineQuoteMark = function(n) {
      return n.smart ? this.smartQuoteMark(n) : this.preferredQuoteMark(n);
    }, t.setValue = function(n, i) {
      i === void 0 && (i = {}), this._value = n, this._quoteMark = this._determineQuoteMark(i), this._syncRawValue();
    }, t.smartQuoteMark = function(n) {
      var i = this.value, o = i.replace(/[^']/g, "").length, a = i.replace(/[^"]/g, "").length;
      if (o + a === 0) {
        var u2 = (0, hr.default)(i, { isIdentifier: true });
        if (u2 === i)
          return e.NO_QUOTE;
        var l2 = this.preferredQuoteMark(n);
        if (l2 === e.NO_QUOTE) {
          var I = this.quoteMark || n.quoteMark || e.DOUBLE_QUOTE, E = to[I], C = (0, hr.default)(i, E);
          if (C.length < u2.length)
            return I;
        }
        return l2;
      } else
        return a === o ? this.preferredQuoteMark(n) : a < o ? e.DOUBLE_QUOTE : e.SINGLE_QUOTE;
    }, t.preferredQuoteMark = function(n) {
      var i = n.preferCurrentQuoteMark ? this.quoteMark : n.quoteMark;
      return i === void 0 && (i = n.preferCurrentQuoteMark ? n.quoteMark : this.quoteMark), i === void 0 && (i = e.DOUBLE_QUOTE), i;
    }, t._syncRawValue = function() {
      var n = (0, hr.default)(this._value, to[this.quoteMark]);
      n === this._value ? this.raws && delete this.raws.value : this.raws.value = n;
    }, t._handleEscapes = function(n, i) {
      if (this._constructed) {
        var o = (0, hr.default)(i, { isIdentifier: true });
        o !== i ? this.raws[n] = o : delete this.raws[n];
      }
    }, t._spacesFor = function(n) {
      var i = { before: "", after: "" }, o = this.spaces[n] || {}, a = this.raws.spaces && this.raws.spaces[n] || {};
      return Object.assign(i, o, a);
    }, t._stringFor = function(n, i, o) {
      i === void 0 && (i = n), o === void 0 && (o = dg);
      var a = this._spacesFor(i);
      return o(this.stringifyProperty(n), a);
    }, t.offsetOf = function(n) {
      var i = 1, o = this._spacesFor("attribute");
      if (i += o.before.length, n === "namespace" || n === "ns")
        return this.namespace ? i : -1;
      if (n === "attributeNS" || (i += this.namespaceString.length, this.namespace && (i += 1), n === "attribute"))
        return i;
      i += this.stringifyProperty("attribute").length, i += o.after.length;
      var a = this._spacesFor("operator");
      i += a.before.length;
      var u2 = this.stringifyProperty("operator");
      if (n === "operator")
        return u2 ? i : -1;
      i += u2.length, i += a.after.length;
      var l2 = this._spacesFor("value");
      i += l2.before.length;
      var I = this.stringifyProperty("value");
      if (n === "value")
        return I ? i : -1;
      i += I.length, i += l2.after.length;
      var E = this._spacesFor("insensitive");
      return i += E.before.length, n === "insensitive" && this.insensitive ? i : -1;
    }, t.toString = function() {
      var n = this, i = [this.rawSpaceBefore, "["];
      return i.push(this._stringFor("qualifiedAttribute", "attribute")), this.operator && (this.value || this.value === "") && (i.push(this._stringFor("operator")), i.push(this._stringFor("value")), i.push(this._stringFor("insensitiveFlag", "insensitive", function(o, a) {
        return o.length > 0 && !n.quoted && a.before.length === 0 && !(n.spaces.value && n.spaces.value.after) && (a.before = " "), dg(o, a);
      }))), i.push("]"), i.push(this.rawSpaceAfter), i.join("");
    }, zf(e, [{ key: "quoted", get: function() {
      var n = this.quoteMark;
      return n === "'" || n === '"';
    }, set: function(n) {
      AB();
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
        var i = io(n), o = i.deprecatedUsage, a = i.unescaped, u2 = i.quoteMark;
        if (o && $f(), a === this._value && u2 === this._quoteMark)
          return;
        this._value = a, this._quoteMark = u2, this._syncRawValue();
      } else
        this._value = n;
    } }, { key: "attribute", get: function() {
      return this._attribute;
    }, set: function(n) {
      this._handleEscapes("attribute", n), this._attribute = n;
    } }]), e;
  }(Xf.default);
  mr.default = wn;
  wn.NO_QUOTE = null;
  wn.SINGLE_QUOTE = "'";
  wn.DOUBLE_QUOTE = '"';
  var to = (eo = { "'": { quotes: "single", wrap: true }, '"': { quotes: "double", wrap: true } }, eo[null] = { isIdentifier: true }, eo);
  function dg(A, e) {
    return "" + e.before + A + e.after;
  }
});
var ao = K2((yr, hg) => {
  "use strict";
  yr.__esModule = true;
  yr.default = void 0;
  var rB = iB(yn()), nB = ee();
  function iB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function oB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, so(A, e);
  }
  function so(A, e) {
    return so = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, so(A, e);
  }
  var sB = function(A) {
    oB(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = nB.UNIVERSAL, r.value = "*", r;
    }
    return e;
  }(rB.default);
  yr.default = sB;
  hg.exports = yr.default;
});
var uo = K2((wr, pg) => {
  "use strict";
  wr.__esModule = true;
  wr.default = void 0;
  var aB = uB(je()), gB = ee();
  function uB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function IB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, go(A, e);
  }
  function go(A, e) {
    return go = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, go(A, e);
  }
  var lB = function(A) {
    IB(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = gB.COMBINATOR, r;
    }
    return e;
  }(aB.default);
  wr.default = lB;
  pg.exports = wr.default;
});
var lo = K2((Dr, mg) => {
  "use strict";
  Dr.__esModule = true;
  Dr.default = void 0;
  var cB = BB(je()), fB = ee();
  function BB(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function EB(A, e) {
    A.prototype = Object.create(e.prototype), A.prototype.constructor = A, Io(A, e);
  }
  function Io(A, e) {
    return Io = Object.setPrototypeOf || function(r, n) {
      return r.__proto__ = n, r;
    }, Io(A, e);
  }
  var QB = function(A) {
    EB(e, A);
    function e(t) {
      var r;
      return r = A.call(this, t) || this, r.type = fB.NESTING, r.value = "&", r;
    }
    return e;
  }(cB.default);
  Dr.default = QB;
  mg.exports = Dr.default;
});
var wg = K2((Dn, yg) => {
  "use strict";
  Dn.__esModule = true;
  Dn.default = CB;
  function CB(A) {
    return A.sort(function(e, t) {
      return e - t;
    });
  }
  yg.exports = Dn.default;
});
var co = K2((_) => {
  "use strict";
  _.__esModule = true;
  _.combinator = _.word = _.comment = _.str = _.tab = _.newline = _.feed = _.cr = _.backslash = _.bang = _.slash = _.doubleQuote = _.singleQuote = _.space = _.greaterThan = _.pipe = _.equals = _.plus = _.caret = _.tilde = _.dollar = _.closeSquare = _.openSquare = _.closeParenthesis = _.openParenthesis = _.semicolon = _.colon = _.comma = _.at = _.asterisk = _.ampersand = void 0;
  var dB = 38;
  _.ampersand = dB;
  var hB = 42;
  _.asterisk = hB;
  var pB = 64;
  _.at = pB;
  var mB = 44;
  _.comma = mB;
  var yB = 58;
  _.colon = yB;
  var wB = 59;
  _.semicolon = wB;
  var DB = 40;
  _.openParenthesis = DB;
  var SB = 41;
  _.closeParenthesis = SB;
  var bB = 91;
  _.openSquare = bB;
  var vB = 93;
  _.closeSquare = vB;
  var kB = 36;
  _.dollar = kB;
  var xB = 126;
  _.tilde = xB;
  var RB = 94;
  _.caret = RB;
  var NB = 43;
  _.plus = NB;
  var MB = 61;
  _.equals = MB;
  var FB = 124;
  _.pipe = FB;
  var LB = 62;
  _.greaterThan = LB;
  var GB = 32;
  _.space = GB;
  var Dg = 39;
  _.singleQuote = Dg;
  var UB = 34;
  _.doubleQuote = UB;
  var HB = 47;
  _.slash = HB;
  var OB = 33;
  _.bang = OB;
  var TB = 92;
  _.backslash = TB;
  var PB = 13;
  _.cr = PB;
  var _B = 12;
  _.feed = _B;
  var JB = 10;
  _.newline = JB;
  var WB = 9;
  _.tab = WB;
  var KB = Dg;
  _.str = KB;
  var YB = -1;
  _.comment = YB;
  var qB = -2;
  _.word = qB;
  var XB = -3;
  _.combinator = XB;
});
var vg = K2((Sr) => {
  "use strict";
  Sr.__esModule = true;
  Sr.default = eE;
  Sr.FIELDS = void 0;
  var T = VB(co()), Ht, yA;
  function bg() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return bg = function() {
      return A;
    }, A;
  }
  function VB(A) {
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
  var zB = (Ht = {}, Ht[T.tab] = true, Ht[T.newline] = true, Ht[T.cr] = true, Ht[T.feed] = true, Ht), ZB = (yA = {}, yA[T.space] = true, yA[T.tab] = true, yA[T.newline] = true, yA[T.cr] = true, yA[T.feed] = true, yA[T.ampersand] = true, yA[T.asterisk] = true, yA[T.bang] = true, yA[T.comma] = true, yA[T.colon] = true, yA[T.semicolon] = true, yA[T.openParenthesis] = true, yA[T.closeParenthesis] = true, yA[T.openSquare] = true, yA[T.closeSquare] = true, yA[T.singleQuote] = true, yA[T.doubleQuote] = true, yA[T.plus] = true, yA[T.pipe] = true, yA[T.tilde] = true, yA[T.greaterThan] = true, yA[T.equals] = true, yA[T.dollar] = true, yA[T.caret] = true, yA[T.slash] = true, yA), fo = {}, Sg = "0123456789abcdefABCDEF";
  for (Sn = 0; Sn < Sg.length; Sn++)
    fo[Sg.charCodeAt(Sn)] = true;
  var Sn;
  function jB(A, e) {
    var t = e, r;
    do {
      if (r = A.charCodeAt(t), ZB[r])
        return t - 1;
      r === T.backslash ? t = $B(A, t) + 1 : t++;
    } while (t < A.length);
    return t - 1;
  }
  function $B(A, e) {
    var t = e, r = A.charCodeAt(t + 1);
    if (!zB[r])
      if (fo[r]) {
        var n = 0;
        do
          t++, n++, r = A.charCodeAt(t + 1);
        while (fo[r] && n < 6);
        n < 6 && r === T.space && t++;
      } else
        t++;
    return t;
  }
  var AE = { TYPE: 0, START_LINE: 1, START_COL: 2, END_LINE: 3, END_COL: 4, START_POS: 5, END_POS: 6 };
  Sr.FIELDS = AE;
  function eE(A) {
    var e = [], t = A.css.valueOf(), r = t, n = r.length, i = -1, o = 1, a = 0, u2 = 0, l2, I, E, C, d2, p, y, k, x2, F, b, v2, M;
    function L(O, J) {
      if (A.safe)
        t += J, x2 = t.length - 1;
      else
        throw A.error("Unclosed " + O, o, a - i, a);
    }
    for (; a < n; ) {
      switch (l2 = t.charCodeAt(a), l2 === T.newline && (i = a, o += 1), l2) {
        case T.space:
        case T.tab:
        case T.newline:
        case T.cr:
        case T.feed:
          x2 = a;
          do
            x2 += 1, l2 = t.charCodeAt(x2), l2 === T.newline && (i = x2, o += 1);
          while (l2 === T.space || l2 === T.newline || l2 === T.tab || l2 === T.cr || l2 === T.feed);
          M = T.space, C = o, E = x2 - i - 1, u2 = x2;
          break;
        case T.plus:
        case T.greaterThan:
        case T.tilde:
        case T.pipe:
          x2 = a;
          do
            x2 += 1, l2 = t.charCodeAt(x2);
          while (l2 === T.plus || l2 === T.greaterThan || l2 === T.tilde || l2 === T.pipe);
          M = T.combinator, C = o, E = a - i, u2 = x2;
          break;
        case T.asterisk:
        case T.ampersand:
        case T.bang:
        case T.comma:
        case T.equals:
        case T.dollar:
        case T.caret:
        case T.openSquare:
        case T.closeSquare:
        case T.colon:
        case T.semicolon:
        case T.openParenthesis:
        case T.closeParenthesis:
          x2 = a, M = l2, C = o, E = a - i, u2 = x2 + 1;
          break;
        case T.singleQuote:
        case T.doubleQuote:
          v2 = l2 === T.singleQuote ? "'" : '"', x2 = a;
          do
            for (d2 = false, x2 = t.indexOf(v2, x2 + 1), x2 === -1 && L("quote", v2), p = x2; t.charCodeAt(p - 1) === T.backslash; )
              p -= 1, d2 = !d2;
          while (d2);
          M = T.str, C = o, E = a - i, u2 = x2 + 1;
          break;
        default:
          l2 === T.slash && t.charCodeAt(a + 1) === T.asterisk ? (x2 = t.indexOf("*/", a + 2) + 1, x2 === 0 && L("comment", "*/"), I = t.slice(a, x2 + 1), k = I.split(`
`), y = k.length - 1, y > 0 ? (F = o + y, b = x2 - k[y].length) : (F = o, b = i), M = T.comment, o = F, C = F, E = x2 - b) : l2 === T.slash ? (x2 = a, M = l2, C = o, E = a - i, u2 = x2 + 1) : (x2 = jB(t, a), M = T.word, C = o, E = x2 - i), u2 = x2 + 1;
          break;
      }
      e.push([M, o, a - i, C, E, a, u2]), b && (i = b, b = null), a = u2;
    }
    return e;
  }
});
var Gg = K2((br, Lg) => {
  "use strict";
  br.__esModule = true;
  br.default = void 0;
  var tE = Re(Hi()), Bo = Re(Ti()), rE = Re(Ji()), kg = Re(Ki()), nE = Re(qi()), iE = Re(zi()), Eo = Re(ji()), oE = Re(Ao()), xg = bn(oo()), sE = Re(ao()), Qo = Re(uo()), aE = Re(lo()), gE = Re(wg()), G = bn(vg()), P2 = bn(co()), uE = bn(ee()), UA = ar(), Ct, Co;
  function Fg() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return Fg = function() {
      return A;
    }, A;
  }
  function bn(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = Fg();
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
  function Re(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Rg(A, e) {
    for (var t = 0; t < e.length; t++) {
      var r = e[t];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(A, r.key, r);
    }
  }
  function IE(A, e, t) {
    return e && Rg(A.prototype, e), t && Rg(A, t), A;
  }
  var mo = (Ct = {}, Ct[P2.space] = true, Ct[P2.cr] = true, Ct[P2.feed] = true, Ct[P2.newline] = true, Ct[P2.tab] = true, Ct), lE = Object.assign({}, mo, (Co = {}, Co[P2.comment] = true, Co));
  function Ng(A) {
    return { line: A[G.FIELDS.START_LINE], column: A[G.FIELDS.START_COL] };
  }
  function Mg(A) {
    return { line: A[G.FIELDS.END_LINE], column: A[G.FIELDS.END_COL] };
  }
  function dt(A, e, t, r) {
    return { start: { line: A, column: e }, end: { line: t, column: r } };
  }
  function Ot(A) {
    return dt(A[G.FIELDS.START_LINE], A[G.FIELDS.START_COL], A[G.FIELDS.END_LINE], A[G.FIELDS.END_COL]);
  }
  function ho(A, e) {
    if (A)
      return dt(A[G.FIELDS.START_LINE], A[G.FIELDS.START_COL], e[G.FIELDS.END_LINE], e[G.FIELDS.END_COL]);
  }
  function Tt(A, e) {
    var t = A[e];
    if (typeof t == "string")
      return t.indexOf("\\") !== -1 && ((0, UA.ensureObject)(A, "raws"), A[e] = (0, UA.unesc)(t), A.raws[e] === void 0 && (A.raws[e] = t)), A;
  }
  function po(A, e) {
    for (var t = -1, r = []; (t = A.indexOf(e, t + 1)) !== -1; )
      r.push(t);
    return r;
  }
  function cE() {
    var A = Array.prototype.concat.apply([], arguments);
    return A.filter(function(e, t) {
      return t === A.indexOf(e);
    });
  }
  var fE = function() {
    function A(t, r) {
      r === void 0 && (r = {}), this.rule = t, this.options = Object.assign({ lossy: false, safe: false }, r), this.position = 0, this.css = typeof this.rule == "string" ? this.rule : this.rule.selector, this.tokens = (0, G.default)({ css: this.css, error: this._errorGenerator(), safe: this.options.safe });
      var n = ho(this.tokens[0], this.tokens[this.tokens.length - 1]);
      this.root = new tE.default({ source: n }), this.root.errorGenerator = this._errorGenerator();
      var i = new Bo.default({ source: { start: { line: 1, column: 1 } } });
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
      for (this.position++; this.position < this.tokens.length && this.currToken[G.FIELDS.TYPE] !== P2.closeSquare; )
        r.push(this.currToken), this.position++;
      if (this.currToken[G.FIELDS.TYPE] !== P2.closeSquare)
        return this.expected("closing square bracket", this.currToken[G.FIELDS.START_POS]);
      var i = r.length, o = { source: dt(n[1], n[2], this.currToken[3], this.currToken[4]), sourceIndex: n[G.FIELDS.START_POS] };
      if (i === 1 && !~[P2.word].indexOf(r[0][G.FIELDS.TYPE]))
        return this.expected("attribute", r[0][G.FIELDS.START_POS]);
      for (var a = 0, u2 = "", l2 = "", I = null, E = false; a < i; ) {
        var C = r[a], d2 = this.content(C), p = r[a + 1];
        switch (C[G.FIELDS.TYPE]) {
          case P2.space:
            if (E = true, this.options.lossy)
              break;
            if (I) {
              (0, UA.ensureObject)(o, "spaces", I);
              var y = o.spaces[I].after || "";
              o.spaces[I].after = y + d2;
              var k = (0, UA.getProp)(o, "raws", "spaces", I, "after") || null;
              k && (o.raws.spaces[I].after = k + d2);
            } else
              u2 = u2 + d2, l2 = l2 + d2;
            break;
          case P2.asterisk:
            if (p[G.FIELDS.TYPE] === P2.equals)
              o.operator = d2, I = "operator";
            else if ((!o.namespace || I === "namespace" && !E) && p) {
              u2 && ((0, UA.ensureObject)(o, "spaces", "attribute"), o.spaces.attribute.before = u2, u2 = ""), l2 && ((0, UA.ensureObject)(o, "raws", "spaces", "attribute"), o.raws.spaces.attribute.before = u2, l2 = ""), o.namespace = (o.namespace || "") + d2;
              var x2 = (0, UA.getProp)(o, "raws", "namespace") || null;
              x2 && (o.raws.namespace += d2), I = "namespace";
            }
            E = false;
            break;
          case P2.dollar:
            if (I === "value") {
              var F = (0, UA.getProp)(o, "raws", "value");
              o.value += "$", F && (o.raws.value = F + "$");
              break;
            }
          case P2.caret:
            p[G.FIELDS.TYPE] === P2.equals && (o.operator = d2, I = "operator"), E = false;
            break;
          case P2.combinator:
            if (d2 === "~" && p[G.FIELDS.TYPE] === P2.equals && (o.operator = d2, I = "operator"), d2 !== "|") {
              E = false;
              break;
            }
            p[G.FIELDS.TYPE] === P2.equals ? (o.operator = d2, I = "operator") : !o.namespace && !o.attribute && (o.namespace = true), E = false;
            break;
          case P2.word:
            if (p && this.content(p) === "|" && r[a + 2] && r[a + 2][G.FIELDS.TYPE] !== P2.equals && !o.operator && !o.namespace)
              o.namespace = d2, I = "namespace";
            else if (!o.attribute || I === "attribute" && !E) {
              u2 && ((0, UA.ensureObject)(o, "spaces", "attribute"), o.spaces.attribute.before = u2, u2 = ""), l2 && ((0, UA.ensureObject)(o, "raws", "spaces", "attribute"), o.raws.spaces.attribute.before = l2, l2 = ""), o.attribute = (o.attribute || "") + d2;
              var b = (0, UA.getProp)(o, "raws", "attribute") || null;
              b && (o.raws.attribute += d2), I = "attribute";
            } else if (!o.value && o.value !== "" || I === "value" && !E) {
              var v2 = (0, UA.unesc)(d2), M = (0, UA.getProp)(o, "raws", "value") || "", L = o.value || "";
              o.value = L + v2, o.quoteMark = null, (v2 !== d2 || M) && ((0, UA.ensureObject)(o, "raws"), o.raws.value = (M || L) + d2), I = "value";
            } else {
              var O = d2 === "i" || d2 === "I";
              (o.value || o.value === "") && (o.quoteMark || E) ? (o.insensitive = O, (!O || d2 === "I") && ((0, UA.ensureObject)(o, "raws"), o.raws.insensitiveFlag = d2), I = "insensitive", u2 && ((0, UA.ensureObject)(o, "spaces", "insensitive"), o.spaces.insensitive.before = u2, u2 = ""), l2 && ((0, UA.ensureObject)(o, "raws", "spaces", "insensitive"), o.raws.spaces.insensitive.before = l2, l2 = "")) : (o.value || o.value === "") && (I = "value", o.value += d2, o.raws.value && (o.raws.value += d2));
            }
            E = false;
            break;
          case P2.str:
            if (!o.attribute || !o.operator)
              return this.error("Expected an attribute followed by an operator preceding the string.", { index: C[G.FIELDS.START_POS] });
            var J = (0, xg.unescapeValue)(d2), j = J.unescaped, CA = J.quoteMark;
            o.value = j, o.quoteMark = CA, I = "value", (0, UA.ensureObject)(o, "raws"), o.raws.value = d2, E = false;
            break;
          case P2.equals:
            if (!o.attribute)
              return this.expected("attribute", C[G.FIELDS.START_POS], d2);
            if (o.value)
              return this.error('Unexpected "=" found; an operator was already defined.', { index: C[G.FIELDS.START_POS] });
            o.operator = o.operator ? o.operator + d2 : d2, I = "operator", E = false;
            break;
          case P2.comment:
            if (I)
              if (E || p && p[G.FIELDS.TYPE] === P2.space || I === "insensitive") {
                var MA = (0, UA.getProp)(o, "spaces", I, "after") || "", dA = (0, UA.getProp)(o, "raws", "spaces", I, "after") || MA;
                (0, UA.ensureObject)(o, "raws", "spaces", I), o.raws.spaces[I].after = dA + d2;
              } else {
                var sA = o[I] || "", vA = (0, UA.getProp)(o, "raws", I) || sA;
                (0, UA.ensureObject)(o, "raws"), o.raws[I] = vA + d2;
              }
            else
              l2 = l2 + d2;
            break;
          default:
            return this.error('Unexpected "' + d2 + '" found.', { index: C[G.FIELDS.START_POS] });
        }
        a++;
      }
      Tt(o, "attribute"), Tt(o, "namespace"), this.newNode(new xg.default(o)), this.position++;
    }, e.parseWhitespaceEquivalentTokens = function(r) {
      r < 0 && (r = this.tokens.length);
      var n = this.position, i = [], o = "", a = void 0;
      do
        if (mo[this.currToken[G.FIELDS.TYPE]])
          this.options.lossy || (o += this.content());
        else if (this.currToken[G.FIELDS.TYPE] === P2.comment) {
          var u2 = {};
          o && (u2.before = o, o = ""), a = new kg.default({ value: this.content(), source: Ot(this.currToken), sourceIndex: this.currToken[G.FIELDS.START_POS], spaces: u2 }), i.push(a);
        }
      while (++this.position < r);
      if (o) {
        if (a)
          a.spaces.after = o;
        else if (!this.options.lossy) {
          var l2 = this.tokens[n], I = this.tokens[this.position - 1];
          i.push(new Eo.default({ value: "", source: dt(l2[G.FIELDS.START_LINE], l2[G.FIELDS.START_COL], I[G.FIELDS.END_LINE], I[G.FIELDS.END_COL]), sourceIndex: l2[G.FIELDS.START_POS], spaces: { before: o, after: "" } }));
        }
      }
      return i;
    }, e.convertWhitespaceNodesToSpace = function(r, n) {
      var i = this;
      n === void 0 && (n = false);
      var o = "", a = "";
      r.forEach(function(l2) {
        var I = i.lossySpace(l2.spaces.before, n), E = i.lossySpace(l2.rawSpaceBefore, n);
        o += I + i.lossySpace(l2.spaces.after, n && I.length === 0), a += I + l2.value + i.lossySpace(l2.rawSpaceAfter, n && E.length === 0);
      }), a === o && (a = void 0);
      var u2 = { space: o, rawSpace: a };
      return u2;
    }, e.isNamedCombinator = function(r) {
      return r === void 0 && (r = this.position), this.tokens[r + 0] && this.tokens[r + 0][G.FIELDS.TYPE] === P2.slash && this.tokens[r + 1] && this.tokens[r + 1][G.FIELDS.TYPE] === P2.word && this.tokens[r + 2] && this.tokens[r + 2][G.FIELDS.TYPE] === P2.slash;
    }, e.namedCombinator = function() {
      if (this.isNamedCombinator()) {
        var r = this.content(this.tokens[this.position + 1]), n = (0, UA.unesc)(r).toLowerCase(), i = {};
        n !== r && (i.value = "/" + r + "/");
        var o = new Qo.default({ value: "/" + n + "/", source: dt(this.currToken[G.FIELDS.START_LINE], this.currToken[G.FIELDS.START_COL], this.tokens[this.position + 2][G.FIELDS.END_LINE], this.tokens[this.position + 2][G.FIELDS.END_COL]), sourceIndex: this.currToken[G.FIELDS.START_POS], raws: i });
        return this.position = this.position + 3, o;
      } else
        this.unexpected();
    }, e.combinator = function() {
      var r = this;
      if (this.content() === "|")
        return this.namespace();
      var n = this.locateNextMeaningfulToken(this.position);
      if (n < 0 || this.tokens[n][G.FIELDS.TYPE] === P2.comma) {
        var i = this.parseWhitespaceEquivalentTokens(n);
        if (i.length > 0) {
          var o = this.current.last;
          if (o) {
            var a = this.convertWhitespaceNodesToSpace(i), u2 = a.space, l2 = a.rawSpace;
            l2 !== void 0 && (o.rawSpaceAfter += l2), o.spaces.after += u2;
          } else
            i.forEach(function(M) {
              return r.newNode(M);
            });
        }
        return;
      }
      var I = this.currToken, E = void 0;
      n > this.position && (E = this.parseWhitespaceEquivalentTokens(n));
      var C;
      if (this.isNamedCombinator() ? C = this.namedCombinator() : this.currToken[G.FIELDS.TYPE] === P2.combinator ? (C = new Qo.default({ value: this.content(), source: Ot(this.currToken), sourceIndex: this.currToken[G.FIELDS.START_POS] }), this.position++) : mo[this.currToken[G.FIELDS.TYPE]] || E || this.unexpected(), C) {
        if (E) {
          var d2 = this.convertWhitespaceNodesToSpace(E), p = d2.space, y = d2.rawSpace;
          C.spaces.before = p, C.rawSpaceBefore = y;
        }
      } else {
        var k = this.convertWhitespaceNodesToSpace(E, true), x2 = k.space, F = k.rawSpace;
        F || (F = x2);
        var b = {}, v2 = { spaces: {} };
        x2.endsWith(" ") && F.endsWith(" ") ? (b.before = x2.slice(0, x2.length - 1), v2.spaces.before = F.slice(0, F.length - 1)) : x2.startsWith(" ") && F.startsWith(" ") ? (b.after = x2.slice(1), v2.spaces.after = F.slice(1)) : v2.value = F, C = new Qo.default({ value: " ", source: ho(I, this.tokens[this.position - 1]), sourceIndex: I[G.FIELDS.START_POS], spaces: b, raws: v2 });
      }
      return this.currToken && this.currToken[G.FIELDS.TYPE] === P2.space && (C.spaces.after = this.optionalSpace(this.content()), this.position++), this.newNode(C);
    }, e.comma = function() {
      if (this.position === this.tokens.length - 1) {
        this.root.trailingComma = true, this.position++;
        return;
      }
      this.current._inferEndPosition();
      var r = new Bo.default({ source: { start: Ng(this.tokens[this.position + 1]) } });
      this.current.parent.append(r), this.current = r, this.position++;
    }, e.comment = function() {
      var r = this.currToken;
      this.newNode(new kg.default({ value: this.content(), source: Ot(r), sourceIndex: r[G.FIELDS.START_POS] })), this.position++;
    }, e.error = function(r, n) {
      throw this.root.error(r, n);
    }, e.missingBackslash = function() {
      return this.error("Expected a backslash preceding the semicolon.", { index: this.currToken[G.FIELDS.START_POS] });
    }, e.missingParenthesis = function() {
      return this.expected("opening parenthesis", this.currToken[G.FIELDS.START_POS]);
    }, e.missingSquareBracket = function() {
      return this.expected("opening square bracket", this.currToken[G.FIELDS.START_POS]);
    }, e.unexpected = function() {
      return this.error("Unexpected '" + this.content() + "'. Escaping special characters with \\ may help.", this.currToken[G.FIELDS.START_POS]);
    }, e.namespace = function() {
      var r = this.prevToken && this.content(this.prevToken) || true;
      if (this.nextToken[G.FIELDS.TYPE] === P2.word)
        return this.position++, this.word(r);
      if (this.nextToken[G.FIELDS.TYPE] === P2.asterisk)
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
      this.newNode(new aE.default({ value: this.content(), source: Ot(n), sourceIndex: n[G.FIELDS.START_POS] })), this.position++;
    }, e.parentheses = function() {
      var r = this.current.last, n = 1;
      if (this.position++, r && r.type === uE.PSEUDO) {
        var i = new Bo.default({ source: { start: Ng(this.tokens[this.position - 1]) } }), o = this.current;
        for (r.append(i), this.current = i; this.position < this.tokens.length && n; )
          this.currToken[G.FIELDS.TYPE] === P2.openParenthesis && n++, this.currToken[G.FIELDS.TYPE] === P2.closeParenthesis && n--, n ? this.parse() : (this.current.source.end = Mg(this.currToken), this.current.parent.source.end = Mg(this.currToken), this.position++);
        this.current = o;
      } else {
        for (var a = this.currToken, u2 = "(", l2; this.position < this.tokens.length && n; )
          this.currToken[G.FIELDS.TYPE] === P2.openParenthesis && n++, this.currToken[G.FIELDS.TYPE] === P2.closeParenthesis && n--, l2 = this.currToken, u2 += this.parseParenthesisToken(this.currToken), this.position++;
        r ? r.appendToPropertyAndEscape("value", u2, u2) : this.newNode(new Eo.default({ value: u2, source: dt(a[G.FIELDS.START_LINE], a[G.FIELDS.START_COL], l2[G.FIELDS.END_LINE], l2[G.FIELDS.END_COL]), sourceIndex: a[G.FIELDS.START_POS] }));
      }
      if (n)
        return this.expected("closing parenthesis", this.currToken[G.FIELDS.START_POS]);
    }, e.pseudo = function() {
      for (var r = this, n = "", i = this.currToken; this.currToken && this.currToken[G.FIELDS.TYPE] === P2.colon; )
        n += this.content(), this.position++;
      if (!this.currToken)
        return this.expected(["pseudo-class", "pseudo-element"], this.position - 1);
      if (this.currToken[G.FIELDS.TYPE] === P2.word)
        this.splitWord(false, function(o, a) {
          n += o, r.newNode(new oE.default({ value: n, source: ho(i, r.currToken), sourceIndex: i[G.FIELDS.START_POS] })), a > 1 && r.nextToken && r.nextToken[G.FIELDS.TYPE] === P2.openParenthesis && r.error("Misplaced parenthesis.", { index: r.nextToken[G.FIELDS.START_POS] });
        });
      else
        return this.expected(["pseudo-class", "pseudo-element"], this.currToken[G.FIELDS.START_POS]);
    }, e.space = function() {
      var r = this.content();
      this.position === 0 || this.prevToken[G.FIELDS.TYPE] === P2.comma || this.prevToken[G.FIELDS.TYPE] === P2.openParenthesis || this.current.nodes.every(function(n) {
        return n.type === "comment";
      }) ? (this.spaces = this.optionalSpace(r), this.position++) : this.position === this.tokens.length - 1 || this.nextToken[G.FIELDS.TYPE] === P2.comma || this.nextToken[G.FIELDS.TYPE] === P2.closeParenthesis ? (this.current.last.spaces.after = this.optionalSpace(r), this.position++) : this.combinator();
    }, e.string = function() {
      var r = this.currToken;
      this.newNode(new Eo.default({ value: this.content(), source: Ot(r), sourceIndex: r[G.FIELDS.START_POS] })), this.position++;
    }, e.universal = function(r) {
      var n = this.nextToken;
      if (n && this.content(n) === "|")
        return this.position++, this.namespace();
      var i = this.currToken;
      this.newNode(new sE.default({ value: this.content(), source: Ot(i), sourceIndex: i[G.FIELDS.START_POS] }), r), this.position++;
    }, e.splitWord = function(r, n) {
      for (var i = this, o = this.nextToken, a = this.content(); o && ~[P2.dollar, P2.caret, P2.equals, P2.word].indexOf(o[G.FIELDS.TYPE]); ) {
        this.position++;
        var u2 = this.content();
        if (a += u2, u2.lastIndexOf("\\") === u2.length - 1) {
          var l2 = this.nextToken;
          l2 && l2[G.FIELDS.TYPE] === P2.space && (a += this.requiredSpace(this.content(l2)), this.position++);
        }
        o = this.nextToken;
      }
      var I = po(a, ".").filter(function(p) {
        var y = a[p - 1] === "\\", k = /^\d+\.\d+%$/.test(a);
        return !y && !k;
      }), E = po(a, "#").filter(function(p) {
        return a[p - 1] !== "\\";
      }), C = po(a, "#{");
      C.length && (E = E.filter(function(p) {
        return !~C.indexOf(p);
      }));
      var d2 = (0, gE.default)(cE([0].concat(I, E)));
      d2.forEach(function(p, y) {
        var k = d2[y + 1] || a.length, x2 = a.slice(p, k);
        if (y === 0 && n)
          return n.call(i, x2, d2.length);
        var F, b = i.currToken, v2 = b[G.FIELDS.START_POS] + d2[y], M = dt(b[1], b[2] + p, b[3], b[2] + (k - 1));
        if (~I.indexOf(p)) {
          var L = { value: x2.slice(1), source: M, sourceIndex: v2 };
          F = new rE.default(Tt(L, "value"));
        } else if (~E.indexOf(p)) {
          var O = { value: x2.slice(1), source: M, sourceIndex: v2 };
          F = new nE.default(Tt(O, "value"));
        } else {
          var J = { value: x2, source: M, sourceIndex: v2 };
          Tt(J, "value"), F = new iE.default(J);
        }
        i.newNode(F, r), r = null;
      }), this.position++;
    }, e.word = function(r) {
      var n = this.nextToken;
      return n && this.content(n) === "|" ? (this.position++, this.namespace()) : this.splitWord(r);
    }, e.loop = function() {
      for (; this.position < this.tokens.length; )
        this.parse(true);
      return this.current._inferEndPosition(), this.root;
    }, e.parse = function(r) {
      switch (this.currToken[G.FIELDS.TYPE]) {
        case P2.space:
          this.space();
          break;
        case P2.comment:
          this.comment();
          break;
        case P2.openParenthesis:
          this.parentheses();
          break;
        case P2.closeParenthesis:
          r && this.missingParenthesis();
          break;
        case P2.openSquare:
          this.attribute();
          break;
        case P2.dollar:
        case P2.caret:
        case P2.equals:
        case P2.word:
          this.word();
          break;
        case P2.colon:
          this.pseudo();
          break;
        case P2.comma:
          this.comma();
          break;
        case P2.asterisk:
          this.universal();
          break;
        case P2.ampersand:
          this.nesting();
          break;
        case P2.slash:
        case P2.combinator:
          this.combinator();
          break;
        case P2.str:
          this.string();
          break;
        case P2.closeSquare:
          this.missingSquareBracket();
        case P2.semicolon:
          this.missingBackslash();
        default:
          this.unexpected();
      }
    }, e.expected = function(r, n, i) {
      if (Array.isArray(r)) {
        var o = r.pop();
        r = r.join(", ") + " or " + o;
      }
      var a = /^[aeiou]/.test(r[0]) ? "an" : "a";
      return i ? this.error("Expected " + a + " " + r + ', found "' + i + '" instead.', { index: n }) : this.error("Expected " + a + " " + r + ".", { index: n });
    }, e.requiredSpace = function(r) {
      return this.options.lossy ? " " : r;
    }, e.optionalSpace = function(r) {
      return this.options.lossy ? "" : r;
    }, e.lossySpace = function(r, n) {
      return this.options.lossy ? n ? " " : "" : r;
    }, e.parseParenthesisToken = function(r) {
      var n = this.content(r);
      return r[G.FIELDS.TYPE] === P2.space ? this.requiredSpace(n) : n;
    }, e.newNode = function(r, n) {
      return n && (/^ +$/.test(n) && (this.options.lossy || (this.spaces = (this.spaces || "") + n), n = true), r.namespace = n, Tt(r, "namespace")), this.spaces && (r.spaces.before = this.spaces, this.spaces = ""), this.current.append(r);
    }, e.content = function(r) {
      return r === void 0 && (r = this.currToken), this.css.slice(r[G.FIELDS.START_POS], r[G.FIELDS.END_POS]);
    }, e.locateNextMeaningfulToken = function(r) {
      r === void 0 && (r = this.position + 1);
      for (var n = r; n < this.tokens.length; )
        if (lE[this.tokens[n][G.FIELDS.TYPE]]) {
          n++;
          continue;
        } else
          return n;
      return -1;
    }, IE(A, [{ key: "currToken", get: function() {
      return this.tokens[this.position];
    } }, { key: "nextToken", get: function() {
      return this.tokens[this.position + 1];
    } }, { key: "prevToken", get: function() {
      return this.tokens[this.position - 1];
    } }]), A;
  }();
  br.default = fE;
  Lg.exports = br.default;
});
var Hg = K2((vr, Ug) => {
  "use strict";
  vr.__esModule = true;
  vr.default = void 0;
  var BE = EE(Gg());
  function EE(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var QE = function() {
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
      var i = new BE.default(r, this._parseOptions(n));
      return i.root;
    }, e._parseOptions = function(r) {
      return { lossy: this._isLossy(r) };
    }, e._run = function(r, n) {
      var i = this;
      return n === void 0 && (n = {}), new Promise(function(o, a) {
        try {
          var u2 = i._root(r, n);
          Promise.resolve(i.func(u2)).then(function(l2) {
            var I = void 0;
            return i._shouldUpdateSelector(r, n) && (I = u2.toString(), r.selector = I), { transform: l2, root: u2, string: I };
          }).then(o, a);
        } catch (l2) {
          a(l2);
          return;
        }
      });
    }, e._runSync = function(r, n) {
      n === void 0 && (n = {});
      var i = this._root(r, n), o = this.func(i);
      if (o && typeof o.then == "function")
        throw new Error("Selector processor returned a promise to a synchronous call.");
      var a = void 0;
      return n.updateSelector && typeof r != "string" && (a = i.toString(), r.selector = a), { transform: o, root: i, string: a };
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
  vr.default = QE;
  Ug.exports = vr.default;
});
var Og = K2((bA) => {
  "use strict";
  bA.__esModule = true;
  bA.universal = bA.tag = bA.string = bA.selector = bA.root = bA.pseudo = bA.nesting = bA.id = bA.comment = bA.combinator = bA.className = bA.attribute = void 0;
  var CE = Ne(oo()), dE = Ne(Ji()), hE = Ne(uo()), pE = Ne(Ki()), mE = Ne(qi()), yE = Ne(lo()), wE = Ne(Ao()), DE = Ne(Hi()), SE = Ne(Ti()), bE = Ne(ji()), vE = Ne(zi()), kE = Ne(ao());
  function Ne(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var xE = function(e) {
    return new CE.default(e);
  };
  bA.attribute = xE;
  var RE = function(e) {
    return new dE.default(e);
  };
  bA.className = RE;
  var NE = function(e) {
    return new hE.default(e);
  };
  bA.combinator = NE;
  var ME = function(e) {
    return new pE.default(e);
  };
  bA.comment = ME;
  var FE = function(e) {
    return new mE.default(e);
  };
  bA.id = FE;
  var LE = function(e) {
    return new yE.default(e);
  };
  bA.nesting = LE;
  var GE = function(e) {
    return new wE.default(e);
  };
  bA.pseudo = GE;
  var UE = function(e) {
    return new DE.default(e);
  };
  bA.root = UE;
  var HE = function(e) {
    return new SE.default(e);
  };
  bA.selector = HE;
  var OE = function(e) {
    return new bE.default(e);
  };
  bA.string = OE;
  var TE = function(e) {
    return new vE.default(e);
  };
  bA.tag = TE;
  var PE = function(e) {
    return new kE.default(e);
  };
  bA.universal = PE;
});
var Jg = K2((EA) => {
  "use strict";
  EA.__esModule = true;
  EA.isNode = yo;
  EA.isPseudoElement = _g;
  EA.isPseudoClass = jE;
  EA.isContainer = $E;
  EA.isNamespace = AQ;
  EA.isUniversal = EA.isTag = EA.isString = EA.isSelector = EA.isRoot = EA.isPseudo = EA.isNesting = EA.isIdentifier = EA.isComment = EA.isCombinator = EA.isClassName = EA.isAttribute = void 0;
  var HA = ee(), he, _E = (he = {}, he[HA.ATTRIBUTE] = true, he[HA.CLASS] = true, he[HA.COMBINATOR] = true, he[HA.COMMENT] = true, he[HA.ID] = true, he[HA.NESTING] = true, he[HA.PSEUDO] = true, he[HA.ROOT] = true, he[HA.SELECTOR] = true, he[HA.STRING] = true, he[HA.TAG] = true, he[HA.UNIVERSAL] = true, he);
  function yo(A) {
    return typeof A == "object" && _E[A.type];
  }
  function Me(A, e) {
    return yo(e) && e.type === A;
  }
  var Tg = Me.bind(null, HA.ATTRIBUTE);
  EA.isAttribute = Tg;
  var JE = Me.bind(null, HA.CLASS);
  EA.isClassName = JE;
  var WE = Me.bind(null, HA.COMBINATOR);
  EA.isCombinator = WE;
  var KE = Me.bind(null, HA.COMMENT);
  EA.isComment = KE;
  var YE = Me.bind(null, HA.ID);
  EA.isIdentifier = YE;
  var qE = Me.bind(null, HA.NESTING);
  EA.isNesting = qE;
  var wo = Me.bind(null, HA.PSEUDO);
  EA.isPseudo = wo;
  var XE = Me.bind(null, HA.ROOT);
  EA.isRoot = XE;
  var VE = Me.bind(null, HA.SELECTOR);
  EA.isSelector = VE;
  var zE = Me.bind(null, HA.STRING);
  EA.isString = zE;
  var Pg = Me.bind(null, HA.TAG);
  EA.isTag = Pg;
  var ZE = Me.bind(null, HA.UNIVERSAL);
  EA.isUniversal = ZE;
  function _g(A) {
    return wo(A) && A.value && (A.value.startsWith("::") || A.value.toLowerCase() === ":before" || A.value.toLowerCase() === ":after" || A.value.toLowerCase() === ":first-letter" || A.value.toLowerCase() === ":first-line");
  }
  function jE(A) {
    return wo(A) && !_g(A);
  }
  function $E(A) {
    return !!(yo(A) && A.walk);
  }
  function AQ(A) {
    return Tg(A) || Pg(A);
  }
});
var Wg = K2((Te) => {
  "use strict";
  Te.__esModule = true;
  var Do = ee();
  Object.keys(Do).forEach(function(A) {
    A === "default" || A === "__esModule" || A in Te && Te[A] === Do[A] || (Te[A] = Do[A]);
  });
  var So = Og();
  Object.keys(So).forEach(function(A) {
    A === "default" || A === "__esModule" || A in Te && Te[A] === So[A] || (Te[A] = So[A]);
  });
  var bo = Jg();
  Object.keys(bo).forEach(function(A) {
    A === "default" || A === "__esModule" || A in Te && Te[A] === bo[A] || (Te[A] = bo[A]);
  });
});
var qg = K2((kr, Yg) => {
  "use strict";
  kr.__esModule = true;
  kr.default = void 0;
  var eQ = nQ(Hg()), tQ = rQ(Wg());
  function Kg() {
    if (typeof WeakMap != "function")
      return null;
    var A = /* @__PURE__ */ new WeakMap();
    return Kg = function() {
      return A;
    }, A;
  }
  function rQ(A) {
    if (A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var e = Kg();
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
  function nQ(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var vo = function(e) {
    return new eQ.default(e);
  };
  Object.assign(vo, tQ);
  delete vo.__esModule;
  var iQ = vo;
  kr.default = iQ;
  Yg.exports = kr.default;
});
var Xg = K2((ko) => {
  "use strict";
  Object.defineProperty(ko, "__esModule", { value: true });
  Object.defineProperty(ko, "default", { enumerable: true, get: () => oQ });
  function oQ(A) {
    return A.replace(/\\,/g, "\\2c ");
  }
});
var zg = K2((d0, Vg) => {
  "use strict";
  Vg.exports = { aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255], aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220], bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205], blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42], burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0], chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237], cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11], darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169], darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139], darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209], darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255], dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255], firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34], fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255], gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128], green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128], honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92], indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140], lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0], lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128], lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211], lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250], lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222], lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50], linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0], mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211], mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238], mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133], midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225], moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128], oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35], orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214], palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238], palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185], peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221], powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153], red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225], saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96], seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45], silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205], slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250], springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140], teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71], turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179], white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0], yellowgreen: [154, 205, 50] };
});
var Ro = K2((xo) => {
  "use strict";
  Object.defineProperty(xo, "__esModule", { value: true });
  function sQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  sQ(xo, { parseColor: () => cQ, formatColor: () => fQ });
  var Zg = aQ(zg());
  function aQ(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var gQ = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i, uQ = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i, ot = /(?:\d+|\d*\.\d+)%?/, vn = /(?:\s*,\s*|\s+)/, jg = /\s*[,/]\s*/, st = /var\(--(?:[^ )]*?)\)/, IQ = new RegExp(`^(rgb)a?\\(\\s*(${ot.source}|${st.source})(?:${vn.source}(${ot.source}|${st.source}))?(?:${vn.source}(${ot.source}|${st.source}))?(?:${jg.source}(${ot.source}|${st.source}))?\\s*\\)$`), lQ = new RegExp(`^(hsl)a?\\(\\s*((?:${ot.source})(?:deg|rad|grad|turn)?|${st.source})(?:${vn.source}(${ot.source}|${st.source}))?(?:${vn.source}(${ot.source}|${st.source}))?(?:${jg.source}(${ot.source}|${st.source}))?\\s*\\)$`);
  function cQ(A, { loose: e = false } = {}) {
    var t, r;
    if (typeof A != "string")
      return null;
    if (A = A.trim(), A === "transparent")
      return { mode: "rgb", color: ["0", "0", "0"], alpha: "0" };
    if (A in Zg.default)
      return { mode: "rgb", color: Zg.default[A].map((u2) => u2.toString()) };
    let n = A.replace(uQ, (u2, l2, I, E, C) => ["#", l2, l2, I, I, E, E, C ? C + C : ""].join("")).match(gQ);
    if (n !== null)
      return { mode: "rgb", color: [parseInt(n[1], 16), parseInt(n[2], 16), parseInt(n[3], 16)].map((u2) => u2.toString()), alpha: n[4] ? (parseInt(n[4], 16) / 255).toString() : void 0 };
    var i;
    let o = (i = A.match(IQ)) !== null && i !== void 0 ? i : A.match(lQ);
    if (o === null)
      return null;
    let a = [o[2], o[3], o[4]].filter(Boolean).map((u2) => u2.toString());
    return !e && a.length !== 3 || a.length < 3 && !a.some((u2) => /^var\(.*?\)$/.test(u2)) ? null : { mode: o[1], color: a, alpha: (t = o[5]) === null || t === void 0 || (r = t.toString) === null || r === void 0 ? void 0 : r.call(t) };
  }
  function fQ({ mode: A, color: e, alpha: t }) {
    let r = t !== void 0;
    return `${A}(${e.join(" ")}${r ? ` / ${t}` : ""})`;
  }
});
var Mo = K2((No) => {
  "use strict";
  Object.defineProperty(No, "__esModule", { value: true });
  function BQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  BQ(No, { withAlphaValue: () => EQ2, default: () => QQ });
  var kn = Ro();
  function EQ2(A, e, t) {
    if (typeof A == "function")
      return A({ opacityValue: e });
    let r = (0, kn.parseColor)(A, { loose: true });
    return r === null ? t : (0, kn.formatColor)({ ...r, alpha: e });
  }
  function QQ({ color: A, property: e, variable: t }) {
    let r = [].concat(e);
    if (typeof A == "function")
      return { [t]: "1", ...Object.fromEntries(r.map((i) => [i, A({ opacityVariable: t, opacityValue: `var(${t})` })])) };
    let n = (0, kn.parseColor)(A);
    return n === null ? Object.fromEntries(r.map((i) => [i, A])) : n.alpha !== void 0 ? Object.fromEntries(r.map((i) => [i, A])) : { [t]: "1", ...Object.fromEntries(r.map((i) => [i, (0, kn.formatColor)({ ...n, alpha: `var(${t})` })])) };
  }
});
var ru = K2((Fo) => {
  "use strict";
  Object.defineProperty(Fo, "__esModule", { value: true });
  function CQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  CQ(Fo, { pattern: () => hQ, withoutCapturing: () => Au, any: () => eu, optional: () => pQ, zeroOrMore: () => mQ, nestedBrackets: () => tu, escape: () => ht });
  var $g = /[\\^$.*+?()[\]{}|]/g, dQ = RegExp($g.source);
  function xr(A) {
    return A = Array.isArray(A) ? A : [A], A = A.map((e) => e instanceof RegExp ? e.source : e), A.join("");
  }
  function hQ(A) {
    return new RegExp(xr(A), "g");
  }
  function Au(A) {
    return new RegExp(`(?:${xr(A)})`, "g");
  }
  function eu(A) {
    return `(?:${A.map(xr).join("|")})`;
  }
  function pQ(A) {
    return `(?:${xr(A)})?`;
  }
  function mQ(A) {
    return `(?:${xr(A)})*`;
  }
  function tu(A, e, t = 1) {
    return Au([ht(A), /[^\s]*/, t === 1 ? `[^${ht(A)}${ht(e)}s]*` : eu([`[^${ht(A)}${ht(e)}s]*`, tu(A, e, t - 1)]), /[^\s]*/, ht(e)]);
  }
  function ht(A) {
    return A && dQ.test(A) ? A.replace($g, "\\$&") : A || "";
  }
});
var iu = K2((Lo) => {
  "use strict";
  Object.defineProperty(Lo, "__esModule", { value: true });
  Object.defineProperty(Lo, "splitAtTopLevelOnly", { enumerable: true, get: () => DQ });
  var yQ = wQ(ru());
  function nu(A) {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap(), t = /* @__PURE__ */ new WeakMap();
    return (nu = function(r) {
      return r ? t : e;
    })(A);
  }
  function wQ(A, e) {
    if (!e && A && A.__esModule)
      return A;
    if (A === null || typeof A != "object" && typeof A != "function")
      return { default: A };
    var t = nu(e);
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
  function* DQ(A, e) {
    let t = new RegExp(`[(){}\\[\\]${yQ.escape(e)}]`, "g"), r = 0, n = 0, i = false, o = 0, a = 0, u2 = e.length;
    for (let l2 of A.matchAll(t)) {
      let I = l2[0] === e[o], E = o === u2 - 1, C = I && E;
      l2[0] === "(" && r++, l2[0] === ")" && r--, l2[0] === "[" && r++, l2[0] === "]" && r--, l2[0] === "{" && r++, l2[0] === "}" && r--, I && r === 0 && (a === 0 && (a = l2.index), o++), C && r === 0 && (i = true, yield A.substring(n, a), n = a + u2), o === u2 && (o = 0, a = 0);
    }
    i ? yield A.substring(n) : yield A;
  }
});
var su = K2((Go) => {
  "use strict";
  Object.defineProperty(Go, "__esModule", { value: true });
  function SQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  SQ(Go, { parseBoxShadowValue: () => xQ, formatBoxShadowValue: () => RQ });
  var bQ = iu(), vQ = /* @__PURE__ */ new Set(["inset", "inherit", "initial", "revert", "unset"]), kQ = /\ +(?![^(]*\))/g, ou = /^-?(\d+|\.\d+)(.*?)$/g;
  function xQ(A) {
    return Array.from((0, bQ.splitAtTopLevelOnly)(A, ",")).map((t) => {
      let r = t.trim(), n = { raw: r }, i = r.split(kQ), o = /* @__PURE__ */ new Set();
      for (let a of i)
        ou.lastIndex = 0, !o.has("KEYWORD") && vQ.has(a) ? (n.keyword = a, o.add("KEYWORD")) : ou.test(a) ? o.has("X") ? o.has("Y") ? o.has("BLUR") ? o.has("SPREAD") || (n.spread = a, o.add("SPREAD")) : (n.blur = a, o.add("BLUR")) : (n.y = a, o.add("Y")) : (n.x = a, o.add("X")) : n.color ? (n.unknown || (n.unknown = []), n.unknown.push(a)) : n.color = a;
      return n.valid = n.x !== void 0 && n.y !== void 0, n;
    });
  }
  function RQ(A) {
    return A.map((e) => e.valid ? [e.keyword, e.x, e.y, e.blur, e.spread, e.color].filter(Boolean).join(" ") : e.raw).join(", ");
  }
});
var fu = K2((Ho) => {
  "use strict";
  Object.defineProperty(Ho, "__esModule", { value: true });
  function NQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  NQ(Ho, { normalize: () => at, url: () => uu, number: () => LQ, percentage: () => Iu, length: () => lu, lineWidth: () => HQ, shadow: () => OQ, color: () => TQ, image: () => PQ, gradient: () => cu, position: () => WQ, familyName: () => KQ, genericName: () => qQ, absoluteSize: () => VQ, relativeSize: () => ZQ });
  var MQ = Ro(), FQ = su(), Uo = ["min", "max", "clamp", "calc"], gu = /,(?![^(]*\))/g, xn = /_(?![^(]*\))/g;
  function at(A, e = true) {
    return A.includes("url(") ? A.split(/(url\(.*?\))/g).filter(Boolean).map((t) => /^url\(.*?\)$/.test(t) ? t : at(t, false)).join("") : (A = A.replace(/([^\\])_+/g, (t, r) => r + " ".repeat(t.length - 1)).replace(/^_/g, " ").replace(/\\_/g, "_"), e && (A = A.trim()), A = A.replace(/(calc|min|max|clamp)\(.+\)/g, (t) => t.replace(/(-?\d*\.?\d(?!\b-.+[,)](?![^+\-/*])\D)(?:%|[a-z]+)?|\))([+\-/*])/g, "$1 $2 ")), A);
  }
  function uu(A) {
    return A.startsWith("url(");
  }
  function LQ(A) {
    return !isNaN(Number(A)) || Uo.some((e) => new RegExp(`^${e}\\(.+?`).test(A));
  }
  function Iu(A) {
    return A.split(xn).every((e) => /%$/g.test(e) || Uo.some((t) => new RegExp(`^${t}\\(.+?%`).test(e)));
  }
  var GQ = ["cm", "mm", "Q", "in", "pc", "pt", "px", "em", "ex", "ch", "rem", "lh", "vw", "vh", "vmin", "vmax"], au = `(?:${GQ.join("|")})`;
  function lu(A) {
    return A.split(xn).every((e) => e === "0" || new RegExp(`${au}$`).test(e) || Uo.some((t) => new RegExp(`^${t}\\(.+?${au}`).test(e)));
  }
  var UQ = /* @__PURE__ */ new Set(["thin", "medium", "thick"]);
  function HQ(A) {
    return UQ.has(A);
  }
  function OQ(A) {
    let e = (0, FQ.parseBoxShadowValue)(at(A));
    for (let t of e)
      if (!t.valid)
        return false;
    return true;
  }
  function TQ(A) {
    let e = 0;
    return A.split(xn).every((r) => (r = at(r), r.startsWith("var(") ? true : (0, MQ.parseColor)(r, { loose: true }) !== null ? (e++, true) : false)) ? e > 0 : false;
  }
  function PQ(A) {
    let e = 0;
    return A.split(gu).every((r) => (r = at(r), r.startsWith("var(") ? true : uu(r) || cu(r) || ["element(", "image(", "cross-fade(", "image-set("].some((n) => r.startsWith(n)) ? (e++, true) : false)) ? e > 0 : false;
  }
  var _Q = /* @__PURE__ */ new Set(["linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "conic-gradient"]);
  function cu(A) {
    A = at(A);
    for (let e of _Q)
      if (A.startsWith(`${e}(`))
        return true;
    return false;
  }
  var JQ = /* @__PURE__ */ new Set(["center", "top", "right", "bottom", "left"]);
  function WQ(A) {
    let e = 0;
    return A.split(xn).every((r) => (r = at(r), r.startsWith("var(") ? true : JQ.has(r) || lu(r) || Iu(r) ? (e++, true) : false)) ? e > 0 : false;
  }
  function KQ(A) {
    let e = 0;
    return A.split(gu).every((r) => (r = at(r), r.startsWith("var(") ? true : r.includes(" ") && !/(['"])([^"']+)\1/g.test(r) || /^\d/g.test(r) ? false : (e++, true))) ? e > 0 : false;
  }
  var YQ = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
  function qQ(A) {
    return YQ.has(A);
  }
  var XQ = /* @__PURE__ */ new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "x-large", "xxx-large"]);
  function VQ(A) {
    return XQ.has(A);
  }
  var zQ = /* @__PURE__ */ new Set(["larger", "smaller"]);
  function ZQ(A) {
    return zQ.has(A);
  }
});
var mu = K2((Po) => {
  "use strict";
  Object.defineProperty(Po, "__esModule", { value: true });
  function jQ(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  jQ(Po, { updateAllClasses: () => eC, asValue: () => Nr, parseColorFormat: () => Oo, asColor: () => du, asLookupValue: () => hu, coerceValue: () => iC });
  var $Q = To(qg()), AC = To(Xg()), Bu = Mo(), pe = fu(), Eu = To(wi());
  function To(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function eC(A, e) {
    return (0, $Q.default)((n) => {
      n.walkClasses((i) => {
        let o = e(i.value);
        i.value = o, i.raws && i.raws.value && (i.raws.value = (0, AC.default)(i.raws.value));
      });
    }).processSync(A);
  }
  function Cu(A, e) {
    if (!Rr(A))
      return;
    let t = A.slice(1, -1);
    if (e(t))
      return (0, pe.normalize)(t);
  }
  function tC(A, e = {}, t) {
    let r = e[A];
    if (r !== void 0)
      return (0, Eu.default)(r);
    if (Rr(A)) {
      let n = Cu(A, t);
      return n === void 0 ? void 0 : (0, Eu.default)(n);
    }
  }
  function Nr(A, e = {}, { validate: t = () => true } = {}) {
    var r;
    let n = (r = e.values) === null || r === void 0 ? void 0 : r[A];
    return n !== void 0 ? n : e.supportsNegativeValues && A.startsWith("-") ? tC(A.slice(1), e.values, t) : Cu(A, t);
  }
  function Rr(A) {
    return A.startsWith("[") && A.endsWith("]");
  }
  function rC(A) {
    let e = A.lastIndexOf("/");
    return e === -1 || e === A.length - 1 ? [A] : [A.slice(0, e), A.slice(e + 1)];
  }
  function Oo(A) {
    if (typeof A == "string" && A.includes("<alpha-value>")) {
      let e = A;
      return ({ opacityValue: t = 1 }) => e.replace("<alpha-value>", t);
    }
    return A;
  }
  function du(A, e = {}, { tailwindConfig: t = {} } = {}) {
    var r;
    if (((r = e.values) === null || r === void 0 ? void 0 : r[A]) !== void 0) {
      var n;
      return Oo((n = e.values) === null || n === void 0 ? void 0 : n[A]);
    }
    let [i, o] = rC(A);
    if (o !== void 0) {
      var a, u2, l2, I;
      let E = (I = (a = e.values) === null || a === void 0 ? void 0 : a[i]) !== null && I !== void 0 ? I : Rr(i) ? i.slice(1, -1) : void 0;
      return E === void 0 ? void 0 : (E = Oo(E), Rr(o) ? (0, Bu.withAlphaValue)(E, o.slice(1, -1)) : ((u2 = t.theme) === null || u2 === void 0 || (l2 = u2.opacity) === null || l2 === void 0 ? void 0 : l2[o]) === void 0 ? void 0 : (0, Bu.withAlphaValue)(E, t.theme.opacity[o]));
    }
    return Nr(A, e, { validate: pe.color });
  }
  function hu(A, e = {}) {
    var t;
    return (t = e.values) === null || t === void 0 ? void 0 : t[A];
  }
  function Fe(A) {
    return (e, t) => Nr(e, t, { validate: A });
  }
  var pu = { any: Nr, color: du, url: Fe(pe.url), image: Fe(pe.image), length: Fe(pe.length), percentage: Fe(pe.percentage), position: Fe(pe.position), lookup: hu, "generic-name": Fe(pe.genericName), "family-name": Fe(pe.familyName), number: Fe(pe.number), "line-width": Fe(pe.lineWidth), "absolute-size": Fe(pe.absoluteSize), "relative-size": Fe(pe.relativeSize), shadow: Fe(pe.shadow) }, Qu = Object.keys(pu);
  function nC(A, e) {
    let t = A.indexOf(e);
    return t === -1 ? [void 0, A] : [A.slice(0, t), A.slice(t + 1)];
  }
  function iC(A, e, t, r) {
    if (Rr(e)) {
      let n = e.slice(1, -1), [i, o] = nC(n, ":");
      if (!/^[\w-_]+$/g.test(i))
        o = n;
      else if (i !== void 0 && !Qu.includes(i))
        return [];
      if (o.length > 0 && Qu.includes(i))
        return [Nr(`[${o}]`, t), i];
    }
    for (let n of [].concat(A)) {
      let i = pu[n](e, t, { tailwindConfig: r });
      if (i !== void 0)
        return [i, n];
    }
    return [];
  }
});
var yu = K2((_o) => {
  "use strict";
  Object.defineProperty(_o, "__esModule", { value: true });
  Object.defineProperty(_o, "default", { enumerable: true, get: () => oC });
  function oC(A) {
    return typeof A == "function" ? A({}) : A;
  }
});
var vu = K2((Wo) => {
  "use strict";
  Object.defineProperty(Wo, "__esModule", { value: true });
  Object.defineProperty(Wo, "default", { enumerable: true, get: () => SC });
  var sC = pt(wi()), aC = pt(Ra()), gC = pt(Na()), uC = pt(bi()), IC = pt(Fa()), Su = La(), wu = Ga(), lC = Ha(), cC = pt(Oa()), fC = Ta(), BC = mu(), EC = Mo(), QC = pt(yu());
  function pt(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Pt(A) {
    return typeof A == "function";
  }
  function Mr(A) {
    return typeof A == "object" && A !== null;
  }
  function Fr(A, ...e) {
    let t = e.pop();
    for (let r of e)
      for (let n in r) {
        let i = t(A[n], r[n]);
        i === void 0 ? Mr(A[n]) && Mr(r[n]) ? A[n] = Fr(A[n], r[n], t) : A[n] = r[n] : A[n] = i;
      }
    return A;
  }
  var Jo = { colors: IC.default, negative(A) {
    return Object.keys(A).filter((e) => A[e] !== "0").reduce((e, t) => {
      let r = (0, sC.default)(A[t]);
      return r !== void 0 && (e[`-${t}`] = r), e;
    }, {});
  }, breakpoints(A) {
    return Object.keys(A).filter((e) => typeof A[e] == "string").reduce((e, t) => ({ ...e, [`screen-${t}`]: A[t] }), {});
  } };
  function CC(A, ...e) {
    return Pt(A) ? A(...e) : A;
  }
  function dC(A) {
    return A.reduce((e, { extend: t }) => Fr(e, t, (r, n) => r === void 0 ? [n] : Array.isArray(r) ? [n, ...r] : [n, r]), {});
  }
  function hC(A) {
    return { ...A.reduce((e, t) => (0, Su.defaults)(e, t), {}), extend: dC(A) };
  }
  function Du(A, e) {
    if (Array.isArray(A) && Mr(A[0]))
      return A.concat(e);
    if (Array.isArray(e) && Mr(e[0]) && Mr(A))
      return [A, ...e];
    if (Array.isArray(e))
      return e;
  }
  function pC({ extend: A, ...e }) {
    return Fr(e, A, (t, r) => !Pt(t) && !r.some(Pt) ? Fr({}, t, ...r, Du) : (n, i) => Fr({}, ...[t, ...r].map((o) => CC(o, n, i)), Du));
  }
  function* mC(A) {
    let e = (0, wu.toPath)(A);
    if (e.length === 0 || (yield e, Array.isArray(A)))
      return;
    let t = /^(.*?)\s*\/\s*([^/]+)$/, r = A.match(t);
    if (r !== null) {
      let [, n, i] = r, o = (0, wu.toPath)(n);
      o.alpha = i, yield o;
    }
  }
  function yC(A) {
    let e = (t, r) => {
      for (let n of mC(t)) {
        let i = 0, o = A;
        for (; o != null && i < n.length; )
          o = o[n[i++]], o = Pt(o) && (n.alpha === void 0 || i <= n.length - 1) ? o(e, Jo) : o;
        if (o !== void 0) {
          if (n.alpha !== void 0) {
            let a = (0, BC.parseColorFormat)(o);
            return (0, EC.withAlphaValue)(a, n.alpha, (0, QC.default)(a));
          }
          return (0, cC.default)(o) ? (0, fC.cloneDeep)(o) : o;
        }
      }
      return r;
    };
    return Object.assign(e, { theme: e, ...Jo }), Object.keys(A).reduce((t, r) => (t[r] = Pt(A[r]) ? A[r](e, Jo) : A[r], t), {});
  }
  function bu(A) {
    let e = [];
    return A.forEach((t) => {
      e = [...e, t];
      var r;
      let n = (r = t == null ? void 0 : t.plugins) !== null && r !== void 0 ? r : [];
      n.length !== 0 && n.forEach((i) => {
        i.__isOptionsFunction && (i = i());
        var o;
        e = [...e, ...bu([(o = i == null ? void 0 : i.config) !== null && o !== void 0 ? o : {}])];
      });
    }), e;
  }
  function wC(A) {
    return [...A].reduceRight((t, r) => Pt(r) ? r({ corePlugins: t }) : (0, gC.default)(r, t), aC.default);
  }
  function DC(A) {
    return [...A].reduceRight((t, r) => [...t, ...r], []);
  }
  function SC(A) {
    let e = [...bu(A), { prefix: "", important: false, separator: ":", variantOrder: uC.default.variantOrder }];
    var t, r;
    return (0, lC.normalizeConfig)((0, Su.defaults)({ theme: yC(pC(hC(e.map((n) => (t = n == null ? void 0 : n.theme) !== null && t !== void 0 ? t : {})))), corePlugins: wC(e.map((n) => n.corePlugins)), plugins: DC(A.map((n) => (r = n == null ? void 0 : n.plugins) !== null && r !== void 0 ? r : [])) }, ...e));
  }
});
var ku = {};
kt(ku, { default: () => bC });
var bC;
var xu = Xe(() => {
  bC = { yellow: (A) => A };
});
var Fu = K2((Ko) => {
  "use strict";
  Object.defineProperty(Ko, "__esModule", { value: true });
  function vC(A, e) {
    for (var t in e)
      Object.defineProperty(A, t, { enumerable: true, get: e[t] });
  }
  vC(Ko, { flagEnabled: () => RC, issueFlagNotices: () => NC, default: () => MC });
  var kC = Mu((xu(), Yr(ku))), xC = Mu((Bn(), Yr(fn)));
  function Mu(A) {
    return A && A.__esModule ? A : { default: A };
  }
  var Ru = { optimizeUniversalDefaults: false }, Lr = { future: ["hoverOnlyWhenSupported", "respectDefaultRingColorOpacity"], experimental: ["optimizeUniversalDefaults", "matchVariant"] };
  function RC(A, e) {
    if (Lr.future.includes(e)) {
      var t, r, n;
      return A.future === "all" || ((n = (r = A == null || (t = A.future) === null || t === void 0 ? void 0 : t[e]) !== null && r !== void 0 ? r : Ru[e]) !== null && n !== void 0 ? n : false);
    }
    if (Lr.experimental.includes(e)) {
      var i, o, a;
      return A.experimental === "all" || ((a = (o = A == null || (i = A.experimental) === null || i === void 0 ? void 0 : i[e]) !== null && o !== void 0 ? o : Ru[e]) !== null && a !== void 0 ? a : false);
    }
    return false;
  }
  function Nu(A) {
    if (A.experimental === "all")
      return Lr.experimental;
    var e;
    return Object.keys((e = A == null ? void 0 : A.experimental) !== null && e !== void 0 ? e : {}).filter((t) => Lr.experimental.includes(t) && A.experimental[t]);
  }
  function NC(A) {
    if (process.env.JEST_WORKER_ID === void 0 && Nu(A).length > 0) {
      let e = Nu(A).map((t) => kC.default.yellow(t)).join(", ");
      xC.default.warn("experimental-flags-enabled", [`You have enabled experimental features: ${e}`, "Experimental features in Tailwind CSS are not covered by semver, may introduce breaking changes, and can change at any time."]);
    }
  }
  var MC = Lr;
});
var Gu = K2((Yo) => {
  "use strict";
  Object.defineProperty(Yo, "__esModule", { value: true });
  Object.defineProperty(Yo, "default", { enumerable: true, get: () => Lu });
  var FC = GC2(bi()), LC = Fu();
  function GC2(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function Lu(A) {
    var e;
    let t = ((e = A == null ? void 0 : A.presets) !== null && e !== void 0 ? e : [FC.default]).slice().reverse().flatMap((i) => Lu(typeof i == "function" ? i() : i)), r = { respectDefaultRingColorOpacity: { theme: { ringColor: { DEFAULT: "#3b82f67f" } } } }, n = Object.keys(r).filter((i) => (0, LC.flagEnabled)(A, i)).map((i) => r[i]);
    return [A, ...n, ...t];
  }
});
var Hu = K2((qo) => {
  "use strict";
  Object.defineProperty(qo, "__esModule", { value: true });
  Object.defineProperty(qo, "default", { enumerable: true, get: () => OC });
  var UC = Uu(vu()), HC = Uu(Gu());
  function Uu(A) {
    return A && A.__esModule ? A : { default: A };
  }
  function OC(...A) {
    let [, ...e] = (0, HC.default)(A[0]);
    return (0, UC.default)([...A, ...e]);
  }
});
var Tu = K2((N0, Ou) => {
  var Xo = Hu();
  Ou.exports = (Xo.__esModule ? Xo : { default: Xo }).default;
});
var Kt = (A, e) => () => (e || A((e = { exports: {} }).exports, e), e.exports);
var dI = Kt((A, e) => {
  e.exports = ["em", "ex", "ch", "rem", "vh", "vw", "vmin", "vmax", "px", "mm", "cm", "in", "pt", "pc", "mozmm"];
});
var hI = Kt((A, e) => {
  e.exports = ["deg", "grad", "rad", "turn"];
});
var pI = Kt((A, e) => {
  e.exports = ["dpi", "dpcm", "dppx"];
});
var mI = Kt((A, e) => {
  e.exports = ["Hz", "kHz"];
});
var yI = Kt((A, e) => {
  e.exports = ["s", "ms"];
});
var wI = dI();
var fs = hI();
var Bs = pI();
var Es = mI();
var Qs = yI();
function Un(A) {
  if (/\.\D?$/.test(A))
    throw new Error("The dot should be followed by a number");
  if (/^[+-]{2}/.test(A))
    throw new Error("Only one leading +/- is allowed");
  if (DI(A) > 1)
    throw new Error("Only one dot is allowed");
  if (/%$/.test(A)) {
    this.type = "percentage", this.value = Gn(A), this.unit = "%";
    return;
  }
  var e = bI(A);
  if (!e) {
    this.type = "number", this.value = Gn(A);
    return;
  }
  this.type = kI(e), this.value = Gn(A.substr(0, A.length - e.length)), this.unit = e;
}
Un.prototype.valueOf = function() {
  return this.value;
};
Un.prototype.toString = function() {
  return this.value + (this.unit || "");
};
function He(A) {
  return new Un(A);
}
function DI(A) {
  var e = A.match(/\./g);
  return e ? e.length : 0;
}
function Gn(A) {
  var e = parseFloat(A);
  if (isNaN(e))
    throw new Error("Invalid number: " + A);
  return e;
}
var SI = [].concat(fs, Es, wI, Bs, Qs);
function bI(A) {
  var e = A.match(/\D+$/), t = e && e[0];
  if (t && SI.indexOf(t) === -1)
    throw new Error("Invalid unit: " + t);
  return t;
}
var vI = Object.assign(qr(fs, "angle"), qr(Es, "frequency"), qr(Bs, "resolution"), qr(Qs, "time"));
function qr(A, e) {
  return Object.fromEntries(A.map((t) => [t, e]));
}
function kI(A) {
  return vI[A] || "length";
}
function Rt(A) {
  let e = typeof A;
  return !(e === "number" || e === "bigint" || e === "string" || e === "boolean");
}
function Cs(A) {
  return /^class\s/.test(A.toString());
}
function Tn(A) {
  return A && A.$$typeof === Symbol.for("react.forward_ref");
}
function ds(A) {
  return typeof A == "function" || Tn(A);
}
function hs(A) {
  return "dangerouslySetInnerHTML" in A;
}
function ps(A) {
  let e = typeof A > "u" ? [] : [].concat(A).flat(1 / 0), t = [];
  for (let r = 0; r < e.length; r++) {
    let n = e[r];
    typeof n > "u" || typeof n == "boolean" || n === null || (typeof n == "number" && (n = String(n)), typeof n == "string" && t.length && typeof t[t.length - 1] == "string" ? t[t.length - 1] += n : t.push(n));
  }
  return t;
}
function tA(A, e, t, r, n = false) {
  if (typeof A == "number")
    return A;
  try {
    if (A = A.trim(), /[ /\(,]/.test(A))
      return;
    if (A === String(+A))
      return +A;
    let i = new He(A);
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
        return Pn(A);
      if (i.type === "percentage" && n)
        return i.value / 100 * t;
    }
  } catch {
  }
}
function Pn(A) {
  let e = new He(A);
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
function Yt(A, e) {
  return [A[0] * e[0] + A[2] * e[1], A[1] * e[0] + A[3] * e[1], A[0] * e[2] + A[2] * e[3], A[1] * e[2] + A[3] * e[3], A[0] * e[4] + A[2] * e[5] + A[4], A[1] * e[4] + A[3] * e[5] + A[5]];
}
function ue(A, e, t, r) {
  let n = e[A];
  if (typeof n > "u") {
    if (r && typeof A < "u")
      throw new Error(`Invalid value for CSS property "${r}". Allowed values: ${Object.keys(e).map((i) => `"${i}"`).join(" | ")}. Received: "${A}".`);
    n = t;
  }
  return n;
}
var Hn;
var On;
var ms = [32, 160, 4961, 65792, 65793, 4153, 4241, 10].map((A) => String.fromCodePoint(A));
var xt = /* @__PURE__ */ new Map();
var RI = 500;
function ge(A, e, t) {
  let r = `${e}:${t || ""}:${A}`;
  if (xt.has(r))
    return xt.get(r);
  if (!Hn || !On) {
    if (!(typeof Intl < "u" && "Segmenter" in Intl))
      throw new Error("Intl.Segmenter does not exist, please use import a polyfill.");
    Hn = new Intl.Segmenter(t, { granularity: "word" }), On = new Intl.Segmenter(t, { granularity: "grapheme" });
  }
  let n;
  if (e === "grapheme")
    n = [...On.segment(A)].map((i) => i.segment);
  else {
    let i = [...Hn.segment(A)].map((u2) => u2.segment), o = [], a = 0;
    for (; a < i.length; ) {
      let u2 = i[a];
      if (u2 == "\xA0") {
        let l2 = a === 0 ? "" : o.pop(), I = a === i.length - 1 ? "" : i[a + 1];
        o.push(l2 + "\xA0" + I), a += 2;
      } else
        o.push(u2), a++;
    }
    n = o;
  }
  if (xt.size >= RI) {
    let i = xt.keys().next().value;
    xt.delete(i);
  }
  return xt.set(r, n), n;
}
function H(A, e, t) {
  let r = "";
  for (let [n, i] of Object.entries(e))
    typeof i < "u" && (r += ` ${n}="${i}"`);
  return t ? `<${A}${r}>${t}</${A}>` : `<${A}${r}/>`;
}
function ys(A = 20) {
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
      let a = e.keys().next().value;
      e.delete(a);
    }
    e.set(i, o);
  }
  function n() {
    e.clear();
  }
  return { set: r, get: t, clear: n };
}
function Nt(A) {
  return A ? A.split(/[, ]/).filter(Boolean).map(Number) : null;
}
function Xr(A) {
  return typeof A == "string";
}
function ws(A) {
  return typeof A == "number";
}
function Ds(A) {
  return typeof A > "u";
}
function Ve(A, e) {
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
function tt(A, e) {
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
function Ss(A, e) {
  if (e === "break-all")
    return { words: ge(A, "grapheme"), requiredBreaks: [] };
  if (e === "keep-all")
    return { words: ge(A, "word"), requiredBreaks: [] };
  let t = new $557adaaeb0c7885f$exports(A), r = 0, n = t.nextBreak(), i = [], o = [false];
  for (; n; ) {
    let a = A.slice(r, n.position);
    i.push(a), n.required ? o.push(true) : o.push(false), r = n.position, n = t.nextBreak();
  }
  return { words: i, requiredBreaks: o };
}
var bs = (A) => A.replaceAll(/([A-Z])/g, (e, t) => `-${t.toLowerCase()}`);
function Vr(A, e = ",") {
  let t = [], r = 0, n = 0;
  e = new RegExp(e);
  for (let i = 0; i < A.length; i++)
    A[i] === "(" ? n++ : A[i] === ")" && n--, n === 0 && e.test(A[i]) && (t.push(A.slice(r, i).trim()), r = i + 1);
  return t.push(A.slice(r).trim()), t;
}
function rt() {
  return process.env.SATORI_STANDALONE === "1" ? Promise.resolve().then(() => (jn(), Zn)).then((A) => A.getYoga()) : Promise.resolve().then(() => (Ai(), $n)).then((A) => A.getYoga());
}
process.env.SATORI_STANDALONE !== "1" && Promise.resolve().then(() => (Ai(), $n));
var KI = "image/avif";
var YI = "image/webp";
var $r = "image/apng";
var An = "image/png";
var en = "image/jpeg";
var tn = "image/gif";
var ei = "image/svg+xml";
function Ps(A) {
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
function _s(A) {
  let e = new Uint8Array(A.slice(6, 10));
  return [e[0] | e[1] << 8, e[2] | e[3] << 8];
}
function Js(A) {
  let e = new DataView(A);
  return [e.getUint16(18, false), e.getUint16(22, false)];
}
var _e = ys(500);
var Xt = /* @__PURE__ */ new Map();
var qI = [An, $r, en, tn, ei];
var XI = /<svg[^>]*>/i;
var VI = /viewBox=['"]([^'"]+)['"]/;
var zI = /width=['"](\d*\.?\d+)['"]/;
var ZI = /height=['"](\d*\.?\d+)['"]/;
function jI(A) {
  let e = new Uint8Array(A), t = 32768, r = "";
  for (let n = 0; n < e.length; n += t) {
    let i = e.subarray(n, Math.min(n + t, e.length));
    r += String.fromCharCode(...i);
  }
  return btoa(r);
}
function $I(A) {
  let e = atob(A), t = e.length, r = new Uint8Array(t);
  for (let n = 0; n < t; n++)
    r[n] = e.charCodeAt(n);
  return r.buffer;
}
function Os(A, e) {
  let t = e.match(XI);
  if (!t)
    throw new Error(`Failed to parse SVG from ${A}`);
  let r = t[0], n = VI.exec(r), i = zI.exec(r), o = ZI.exec(r), a = n ? Nt(n[1]) : null;
  if (!a && (!i || !o))
    throw new Error(`Failed to parse SVG from ${A}: missing "viewBox"`);
  let u2 = a ? [a[2], a[3]] : [+i[1], +o[1]], l2 = u2[0] / u2[1];
  return i && o ? [+i[1], +o[1]] : i ? [+i[1], +i[1] / l2] : o ? [+o[1] * l2, +o[1]] : [u2[0], u2[1]];
}
function Ts(A) {
  let e, t = Al(new Uint8Array(A));
  switch (t) {
    case An:
    case $r:
      e = Js(A);
      break;
    case tn:
      e = _s(A);
      break;
    case en:
      e = Ps(A);
      break;
  }
  if (!qI.includes(t))
    throw new Error(`Unsupported image type: ${t || "unknown"}`);
  return [`data:${t};base64,${jI(A)}`, e];
}
async function Gt(A) {
  if (!A)
    throw new Error("Image source is not provided.");
  if (typeof A == "object") {
    let [n, i] = Ts(A);
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
    let { imageType: i, encodingType: o, dataString: a } = n;
    if (i === ei) {
      let u2 = o === "base64" ? atob(a) : decodeURIComponent(a.replace(/ /g, "%20")), l2 = o === "base64" ? A : `data:image/svg+xml;base64,${btoa(u2)}`, I = Os(A, u2);
      return _e.set(A, [l2, ...I]), [l2, ...I];
    } else if (o === "base64") {
      let u2, l2 = $I(a);
      switch (i) {
        case An:
        case $r:
          u2 = Js(l2);
          break;
        case tn:
          u2 = _s(l2);
          break;
        case en:
          u2 = Ps(l2);
          break;
      }
      return _e.set(A, [A, ...u2]), [A, ...u2];
    } else
      return console.warn("Image data URI resolved without size:" + A), _e.set(A, [A]), [A];
  }
  if (!globalThis.fetch)
    throw new Error("`fetch` is required to be polyfilled to load images.");
  if (Xt.has(A))
    return Xt.get(A);
  let e = _e.get(A);
  if (e)
    return e;
  let t = A, r = fetch(t).then((n) => {
    let i = n.headers.get("content-type");
    return i === "image/svg+xml" || i === "application/svg+xml" ? n.text() : n.arrayBuffer();
  }).then((n) => {
    if (typeof n == "string")
      try {
        let a = `data:image/svg+xml;base64,${btoa(n)}`, u2 = Os(t, n);
        return [a, ...u2];
      } catch (a) {
        throw new Error(`Failed to parse SVG image: ${a.message}`);
      }
    let [i, o] = Ts(n);
    return [i, ...o];
  }).then((n) => (_e.set(t, n), n)).catch((n) => (console.error(`Can't load image ${t}: ` + n.message), _e.set(t, []), []));
  return Xt.set(t, r), r;
}
function Al(A) {
  return [255, 216, 255].every((e, t) => A[t] === e) ? en : [137, 80, 78, 71, 13, 10, 26, 10].every((e, t) => A[t] === e) ? el(A) ? $r : An : [71, 73, 70, 56].every((e, t) => A[t] === e) ? tn : [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80].every((e, t) => !e || A[t] === e) ? YI : [60, 63, 120, 109, 108].every((e, t) => A[t] === e) ? ei : [0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102].every((e, t) => !e || A[t] === e) ? KI : null;
}
function el(A) {
  let e = new DataView(A.buffer), t, r, n = 8, i = false;
  for (; !i && t !== "IEND" && n < A.length; ) {
    r = e.getUint32(n);
    let o = A.subarray(n + 4, n + 8);
    t = String.fromCharCode(...o), i = t === "acTL", n += 12 + r;
  }
  return i;
}
var ti = { accentHeight: "accent-height", alignmentBaseline: "alignment-baseline", arabicForm: "arabic-form", baselineShift: "baseline-shift", capHeight: "cap-height", clipPath: "clip-path", clipRule: "clip-rule", colorInterpolation: "color-interpolation", colorInterpolationFilters: "color-interpolation-filters", colorProfile: "color-profile", colorRendering: "color-rendering", dominantBaseline: "dominant-baseline", enableBackground: "enable-background", fillOpacity: "fill-opacity", fillRule: "fill-rule", floodColor: "flood-color", floodOpacity: "flood-opacity", fontFamily: "font-family", fontSize: "font-size", fontSizeAdjust: "font-size-adjust", fontStretch: "font-stretch", fontStyle: "font-style", fontVariant: "font-variant", fontWeight: "font-weight", glyphName: "glyph-name", glyphOrientationHorizontal: "glyph-orientation-horizontal", glyphOrientationVertical: "glyph-orientation-vertical", horizAdvX: "horiz-adv-x", horizOriginX: "horiz-origin-x", href: "href", imageRendering: "image-rendering", letterSpacing: "letter-spacing", lightingColor: "lighting-color", markerEnd: "marker-end", markerMid: "marker-mid", markerStart: "marker-start", overlinePosition: "overline-position", overlineThickness: "overline-thickness", paintOrder: "paint-order", panose1: "panose-1", pointerEvents: "pointer-events", renderingIntent: "rendering-intent", shapeRendering: "shape-rendering", stopColor: "stop-color", stopOpacity: "stop-opacity", strikethroughPosition: "strikethrough-position", strikethroughThickness: "strikethrough-thickness", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width", textAnchor: "text-anchor", textDecoration: "text-decoration", textRendering: "text-rendering", underlinePosition: "underline-position", underlineThickness: "underline-thickness", unicodeBidi: "unicode-bidi", unicodeRange: "unicode-range", unitsPerEm: "units-per-em", vAlphabetic: "v-alphabetic", vHanging: "v-hanging", vIdeographic: "v-ideographic", vMathematical: "v-mathematical", vectorEffect: "vector-effect", vertAdvY: "vert-adv-y", vertOriginX: "vert-origin-x", vertOriginY: "vert-origin-y", wordSpacing: "word-spacing", writingMode: "writing-mode", xHeight: "x-height", xlinkActuate: "xlink:actuate", xlinkArcrole: "xlink:arcrole", xlinkHref: "xlink:href", xlinkRole: "xlink:role", xlinkShow: "xlink:show", xlinkTitle: "xlink:title", xlinkType: "xlink:type", xmlBase: "xml:base", xmlLang: "xml:lang", xmlSpace: "xml:space", xmlnsXlink: "xmlns:xlink" };
var tl = /[\r\n%#()<>?[\\\]^`{|}"']/g;
function ri(A, e) {
  if (!A)
    return "";
  if (Array.isArray(A))
    return A.map((l2) => ri(l2, e)).join("");
  if (typeof A != "object")
    return String(A);
  let t = A.type;
  if (t === "text")
    throw new Error("<text> nodes are not currently supported, please convert them to <path>");
  let { children: r, style: n, ...i } = A.props || {}, o = (n == null ? void 0 : n.color) || e, a = `${Object.entries(i).map(([l2, I]) => (typeof I == "string" && I.toLowerCase() === "currentcolor" && (I = o), (l2 === "href" || l2 === "xlinkHref") && t === "image" ? ` ${ti[l2] || l2}="${_e.get(I)[0]}"` : ` ${ti[l2] || l2}="${I}"`)).join("")}`, u2 = n ? ` style="${Object.entries(n).map(([l2, I]) => `${bs(l2)}:${I}`).join(";")}"` : "";
  return `<${t}${a}${u2}>${ri(r, o)}</${t}>`;
}
async function Ws(A) {
  let e = /* @__PURE__ */ new Set(), t = (r) => {
    if (r && Rt(r)) {
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
  return t(A), Promise.all(Array.from(e).map((r) => Gt(r)));
}
async function Ks(A, e) {
  let { viewBox: t, viewbox: r, width: n, height: i, className: o, style: a, children: u2, ...l2 } = A.props || {};
  t ||= r, l2.xmlns = "http://www.w3.org/2000/svg";
  let I = (a == null ? void 0 : a.color) || e, E = Nt(t), C = E ? E[3] / E[2] : null;
  return n = n || C && i ? i / C : null, i = i || C && n ? n * C : null, l2.width = n, l2.height = i, t && (l2.viewBox = t), `data:image/svg+xml;utf8,${`<svg ${Object.entries(l2).map(([d2, p]) => (typeof p == "string" && p.toLowerCase() === "currentcolor" && (p = I), ` ${ti[d2] || d2}="${p}"`)).join("")}>${ri(u2, I)}</svg>`.replace(tl, encodeURIComponent)}`;
}
var xe = "flex";
var Ys = { p: { display: xe, marginTop: "1em", marginBottom: "1em" }, div: { display: xe }, blockquote: { display: xe, marginTop: "1em", marginBottom: "1em", marginLeft: 40, marginRight: 40 }, center: { display: xe, textAlign: "center" }, hr: { display: xe, marginTop: "0.5em", marginBottom: "0.5em", marginLeft: "auto", marginRight: "auto", borderWidth: 1, borderStyle: "solid" }, h1: { display: xe, fontSize: "2em", marginTop: "0.67em", marginBottom: "0.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h2: { display: xe, fontSize: "1.5em", marginTop: "0.83em", marginBottom: "0.83em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h3: { display: xe, fontSize: "1.17em", marginTop: "1em", marginBottom: "1em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h4: { display: xe, marginTop: "1.33em", marginBottom: "1.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h5: { display: xe, fontSize: "0.83em", marginTop: "1.67em", marginBottom: "1.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h6: { display: xe, fontSize: "0.67em", marginTop: "2.33em", marginBottom: "2.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, u: { textDecoration: "underline" }, strong: { fontWeight: "bold" }, b: { fontWeight: "bold" }, i: { fontStyle: "italic" }, em: { fontStyle: "italic" }, code: { fontFamily: "monospace" }, kbd: { fontFamily: "monospace" }, pre: { display: xe, fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", marginBottom: "1em" }, mark: { backgroundColor: "yellow", color: "black" }, big: { fontSize: "larger" }, small: { fontSize: "smaller" }, s: { textDecoration: "line-through" } };
var rl = /* @__PURE__ */ new Set(["color", "font", "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textIndent", "textTransform", "textShadowOffset", "textShadowColor", "textShadowRadius", "WebkitTextStrokeWidth", "WebkitTextStrokeColor", "textDecorationLine", "textDecorationStyle", "textDecorationColor", "textDecorationSkipInk", "whiteSpace", "transform", "wordBreak", "tabSize", "opacity", "filter", "_viewportWidth", "_viewportHeight", "_inheritedClipPathId", "_inheritedMaskId", "_inheritedBackgroundClipTextPath", "_inheritedBackgroundClipTextHasBackground"]);
function ni(A) {
  let e = {};
  for (let t in A)
    (rl.has(t) || t.startsWith("--")) && (e[t] = A[t]);
  return e;
}
function il(A, e) {
  try {
    let t = new He(A);
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
function ii(A, e, t) {
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
      let r = il(A, e);
      return r.absolute ? { [t ? "xAbsolute" : "yAbsolute"]: r.absolute } : r.relative ? { [t ? "xRelative" : "yRelative"]: r.relative } : {};
    }
  }
}
function oi(A, e) {
  if (typeof A == "number")
    return { xAbsolute: A };
  let t;
  try {
    t = (0, import_postcss_value_parser.default)(A).nodes.filter((r) => r.type === "word").map((r) => r.value);
  } catch {
    return {};
  }
  return t.length === 1 ? ii(t[0], e, true) : t.length === 2 ? ((t[0] === "top" || t[0] === "bottom" || t[1] === "left" || t[1] === "right") && t.reverse(), { ...ii(t[0], e, true), ...ii(t[1], e, false) }) : {};
}
function Vt(A, e) {
  let t = (0, import_css_to_react_native2.getPropertyName)(`mask-${e}`);
  return A[t] || A[`WebkitM${t.substring(1)}`];
}
function qs(A) {
  let e = A.maskImage || A.WebkitMaskImage, t = { position: Vt(A, "position") || "0% 0%", size: Vt(A, "size") || "100% 100%", repeat: Vt(A, "repeat") || "repeat", origin: Vt(A, "origin") || "border-box", clip: Vt(A, "origin") || "border-box" };
  return Vr(e).filter((n) => n && n !== "none").reverse().map((n) => ({ image: n, ...t }));
}
function Vs(A) {
  let e = {}, t = {};
  for (let r in A)
    r.startsWith("--") ? e[r] = String(A[r]) : t[r] = A[r];
  return { variables: e, remainingStyle: t };
}
function zs(A, e) {
  return { ...A, ...e };
}
function Zt(A, e, t = /* @__PURE__ */ new Set()) {
  if (typeof A != "string" || !A.includes("var("))
    return A;
  try {
    let r = (0, import_postcss_value_parser2.default)(A), n = false;
    if (r.walk((i) => {
      if (i.type === "function" && i.value === "var") {
        n = true;
        let o = sl(i);
        if (!o)
          return;
        let { varName: a, fallback: u2 } = o;
        if (t.has(a)) {
          console.warn(`Circular reference detected for CSS variable: ${a}`), u2 !== void 0 ? zt(i, u2) : zt(i, "initial");
          return;
        }
        let l2 = e[a];
        if (l2 !== void 0) {
          let I = new Set(t);
          I.add(a);
          let E = Zt(l2, e, I);
          zt(i, String(E));
        } else if (u2 !== void 0) {
          let I = Zt(u2, e, t);
          zt(i, String(I));
        } else
          zt(i, "initial");
      }
    }), n)
      return r.toString();
  } catch {
    console.warn(`Failed to parse CSS value for variable resolution: ${A}`);
  }
  return A;
}
function sl(A) {
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
function zt(A, e) {
  A.type = "word", A.value = e, delete A.nodes;
}
var ll = /* @__PURE__ */ new Set(["flex", "flexGrow", "flexShrink", "flexBasis", "fontWeight", "lineHeight", "opacity", "scale", "scaleX", "scaleY"]);
var cl = /* @__PURE__ */ new Set(["lineHeight"]);
function fl2(A, e, t, r) {
  return A === "textDecoration" && !t.includes(e.textDecorationColor) && (e.textDecorationColor = r), e;
}
function Et(A, e) {
  let t = Number(e);
  return isNaN(t) ? e : ll.has(A) ? cl.has(A) ? t : String(e) : t + "px";
}
function Bl(A, e, t) {
  if (A === "zIndex")
    return console.warn("`z-index` is currently not supported."), { [A]: e };
  if (A === "lineHeight")
    return { lineHeight: Et(A, e) };
  if (A === "fontFamily")
    return { fontFamily: e.split(",").map((r) => r.trim().replace(/(^['"])|(['"]$)/g, "").toLocaleLowerCase()) };
  if (A === "borderRadius") {
    if (typeof e != "string" || !e.includes("/"))
      return;
    let [r, n] = e.split("/"), i = (0, import_css_to_react_native.getStylesForProperty)(A, r, true), o = (0, import_css_to_react_native.getStylesForProperty)(A, n, true);
    for (let a in i)
      o[a] = Et(A, i[a]) + " " + Et(A, o[a]);
    return o;
  }
  if (/^border(Top|Right|Bottom|Left)?$/.test(A)) {
    let r = (0, import_css_to_react_native.getStylesForProperty)("border", e, true);
    r.borderWidth === 1 && !String(e).includes("1px") && (r.borderWidth = 3), r.borderColor === "black" && !String(e).includes("black") && (r.borderColor = t);
    let n = { Width: Et(A + "Width", r.borderWidth), Style: ue(r.borderStyle, { solid: "solid", dashed: "dashed" }, "solid", A + "Style"), Color: r.borderColor }, i = {};
    for (let o of A === "border" ? ["Top", "Right", "Bottom", "Left"] : [A.slice(6)])
      for (let a in n)
        i["border" + o + a] = n[a];
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
    let r = {}, n = e.replace(/(-?[\d.]+%)/g, (o, a) => {
      let u2 = ~~(Math.random() * 1e9);
      return r[u2] = a, u2 + "px";
    }), i = (0, import_css_to_react_native.getStylesForProperty)("transform", n, true);
    for (let o of i.transform)
      for (let a in o)
        r[o[a]] && (o[a] = r[o[a]]);
    return i;
  }
  if (A === "background")
    return e = e.toString().trim(), /^(linear-gradient|radial-gradient|url|repeating-linear-gradient|repeating-radial-gradient)\(/.test(e) ? (0, import_css_to_react_native.getStylesForProperty)("backgroundImage", e, true) : (0, import_css_to_react_native.getStylesForProperty)("background", e, true);
  if (A === "textShadow") {
    e = e.toString().trim();
    let r = {}, n = Vr(e);
    for (let i of n) {
      let o = (0, import_css_to_react_native.getStylesForProperty)("textShadow", i, true);
      for (let a in o)
        r[a] ? r[a].push(o[a]) : r[a] = [o[a]];
    }
    return r;
  }
  if (A === "WebkitTextStroke") {
    e = e.toString().trim();
    let r = e.split(" ");
    if (r.length !== 2)
      throw new Error("Invalid `WebkitTextStroke` value.");
    return { WebkitTextStrokeWidth: Et(A, r[0]), WebkitTextStrokeColor: Et(A, r[1]) };
  }
  if (A === "textDecorationSkipInk") {
    let r = e.toString().trim().toLowerCase();
    if (!["auto", "none", "all"].includes(r))
      throw new Error("Invalid `textDecorationSkipInk` value.");
    return { textDecorationSkipInk: r };
  }
}
function Zs(A) {
  return A === "transform" ? " Only absolute lengths such as `10px` are supported." : "";
}
var js = /rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\.\d]+)\)/;
function Aa(A) {
  if (typeof A == "string" && js.test(A.trim()))
    return A.trim().replace(js, (e, t, r, n, i) => `rgba(${t}, ${r}, ${n}, ${i})`);
  if (typeof A == "object" && A !== null) {
    for (let e in A)
      A[e] = Aa(A[e]);
    return A;
  }
  return A;
}
function rn(A, e) {
  let t = {}, r = {};
  for (let u2 in e)
    u2.startsWith("--") && (r[u2] = String(e[u2]));
  let n = {}, i = A;
  if (A) {
    let { variables: u2, remainingStyle: l2 } = Vs(A);
    n = u2, i = l2;
  }
  let o = zs(r, n);
  for (let u2 in o)
    t[u2] = o[u2];
  if (i) {
    let u2 = i.color ? Zt(i.color, o) : void 0, l2 = Ql(u2, e.color);
    t.color = l2;
    for (let I in i) {
      if (I.startsWith("_")) {
        t[I] = i[I];
        continue;
      }
      if (I === "color")
        continue;
      let E = (0, import_css_to_react_native.getPropertyName)(I), C = Zt(i[I], o), d2 = dl(C, l2);
      try {
        let p = Bl(E, d2, l2) || fl2(E, (0, import_css_to_react_native.getStylesForProperty)(E, Et(E, d2), true), d2, l2);
        Object.assign(t, p);
      } catch (p) {
        throw new Error(p.message + (p.message.includes(d2) ? `
  ` + Zs(E) : `
  in CSS rule \`${E}: ${d2}\`.${Zs(E)}`));
      }
    }
  }
  if (t.backgroundImage) {
    let { backgrounds: u2 } = (0, import_css_background_parser.parseElementStyle)(t);
    t.backgroundImage = u2;
  }
  (t.maskImage || t.WebkitMaskImage) && (t.maskImage = qs(t));
  let a = El(t.fontSize, e.fontSize);
  typeof t.fontSize < "u" && (t.fontSize = a), t.transformOrigin && (t.transformOrigin = oi(t.transformOrigin, a));
  for (let u2 in t) {
    let l2 = t[u2];
    if (u2 === "lineHeight")
      typeof l2 == "string" && l2 !== "normal" && (l2 = t[u2] = tA(l2, a, a, e, true) / a);
    else {
      if (typeof l2 == "string") {
        let I = tA(l2, a, a, e);
        typeof I < "u" && (t[u2] = I), l2 = t[u2];
      }
      if (typeof l2 == "string" || typeof l2 == "object") {
        let I = Aa(l2);
        I && (t[u2] = I), l2 = t[u2];
      }
    }
    if (u2 === "opacity" && typeof l2 == "number" && (t.opacity = l2 * e.opacity), u2 === "transform") {
      let I = l2;
      for (let E of I) {
        let C = Object.keys(E)[0], d2 = E[C], p = typeof d2 == "string" ? tA(d2, a, a, e) ?? d2 : d2;
        E[C] = p;
      }
    }
    if (u2 === "textShadowRadius") {
      let I = l2;
      t.textShadowRadius = I.map((E) => tA(E, a, 0, e, false));
    }
    if (u2 === "textShadowOffset") {
      let I = l2;
      t.textShadowOffset = I.map(({ height: E, width: C }) => ({ height: tA(E, a, 0, e, false), width: tA(C, a, 0, e, false) }));
    }
  }
  return t;
}
function El(A, e) {
  if (typeof A == "number")
    return A;
  try {
    let t = new He(A);
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
function $s(A) {
  if (A.startsWith("hsl")) {
    let e = index_esm_default(A), [t, r, n] = e.values;
    return `hsl(${[t, `${r}%`, `${n}%`].concat(e.alpha === 1 ? [] : [e.alpha]).join(",")})`;
  }
  return A;
}
function Ql(A, e) {
  return A && A.toLowerCase() !== "currentcolor" ? $s(A) : $s(e);
}
function Cl(A, e) {
  return A.replace(/currentcolor/gi, e);
}
function dl(A, e) {
  return Xr(A) && (A = Cl(A, e)), A;
}
async function si(A, e, t, r, n) {
  let i = await rt(), o = Object.assign({}, t, rn(Ys[e], t), rn(r, t));
  if (e === "img") {
    let [a, u2, l2] = await Gt(n.src);
    if (u2 === void 0 && l2 === void 0) {
      if (n.width === void 0 || n.height === void 0)
        throw new Error("Image size cannot be determined. Please provide the width and height of the image.");
      u2 = parseInt(n.width), l2 = parseInt(n.height);
    }
    let I = l2 / u2, E = (o.borderLeftWidth || 0) + (o.borderRightWidth || 0) + (o.paddingLeft || 0) + (o.paddingRight || 0), C = (o.borderTopWidth || 0) + (o.borderBottomWidth || 0) + (o.paddingTop || 0) + (o.paddingBottom || 0), d2 = o.width || n.width, p = o.height || n.height, y = typeof d2 == "number" && typeof p == "number";
    y && (d2 -= E, p -= C), d2 === void 0 && p === void 0 ? (d2 = "100%", A.setAspectRatio(1 / I)) : d2 === void 0 ? typeof p == "number" ? d2 = p / I : A.setAspectRatio(1 / I) : p === void 0 && (typeof d2 == "number" ? p = d2 * I : A.setAspectRatio(1 / I)), o.width = y ? d2 + E : d2, o.height = y ? p + C : p, o.__src = a, o.__naturalWidth = u2, o.__naturalHeight = l2;
  }
  if (e === "svg") {
    let a = n.viewBox || n.viewbox, u2 = Nt(a), l2 = u2 ? u2[3] / u2[2] : null, { width: I, height: E } = n;
    typeof I > "u" && E ? l2 == null ? I = 0 : typeof E == "string" && E.endsWith("%") ? I = parseInt(E) / l2 + "%" : (E = tA(E, t.fontSize, 1, t), I = E / l2) : typeof E > "u" && I ? l2 == null ? I = 0 : typeof I == "string" && I.endsWith("%") ? E = parseInt(I) * l2 + "%" : (I = tA(I, t.fontSize, 1, t), E = I * l2) : (typeof I < "u" && (I = tA(I, t.fontSize, 1, t) || I), typeof E < "u" && (E = tA(E, t.fontSize, 1, t) || E), I ||= u2 == null ? void 0 : u2[2], E ||= u2 == null ? void 0 : u2[3]), !o.width && I && (o.width = I), !o.height && E && (o.height = E);
  }
  return A.setDisplay(ue(o.display, { flex: i.DISPLAY_FLEX, block: i.DISPLAY_FLEX, contents: i.DISPLAY_CONTENTS, none: i.DISPLAY_NONE, "-webkit-box": i.DISPLAY_FLEX }, i.DISPLAY_FLEX, "display")), A.setAlignContent(ue(o.alignContent, { stretch: i.ALIGN_STRETCH, center: i.ALIGN_CENTER, "flex-start": i.ALIGN_FLEX_START, "flex-end": i.ALIGN_FLEX_END, "space-between": i.ALIGN_SPACE_BETWEEN, "space-around": i.ALIGN_SPACE_AROUND, baseline: i.ALIGN_BASELINE, normal: i.ALIGN_AUTO }, i.ALIGN_AUTO, "alignContent")), A.setAlignItems(ue(o.alignItems, { stretch: i.ALIGN_STRETCH, center: i.ALIGN_CENTER, "flex-start": i.ALIGN_FLEX_START, "flex-end": i.ALIGN_FLEX_END, baseline: i.ALIGN_BASELINE, normal: i.ALIGN_AUTO }, i.ALIGN_STRETCH, "alignItems")), A.setAlignSelf(ue(o.alignSelf, { stretch: i.ALIGN_STRETCH, center: i.ALIGN_CENTER, "flex-start": i.ALIGN_FLEX_START, "flex-end": i.ALIGN_FLEX_END, baseline: i.ALIGN_BASELINE, normal: i.ALIGN_AUTO }, i.ALIGN_AUTO, "alignSelf")), A.setJustifyContent(ue(o.justifyContent, { center: i.JUSTIFY_CENTER, "flex-start": i.JUSTIFY_FLEX_START, "flex-end": i.JUSTIFY_FLEX_END, "space-between": i.JUSTIFY_SPACE_BETWEEN, "space-around": i.JUSTIFY_SPACE_AROUND }, i.JUSTIFY_FLEX_START, "justifyContent")), A.setFlexDirection(ue(o.flexDirection, { row: i.FLEX_DIRECTION_ROW, column: i.FLEX_DIRECTION_COLUMN, "row-reverse": i.FLEX_DIRECTION_ROW_REVERSE, "column-reverse": i.FLEX_DIRECTION_COLUMN_REVERSE }, i.FLEX_DIRECTION_ROW, "flexDirection")), A.setFlexWrap(ue(o.flexWrap, { wrap: i.WRAP_WRAP, nowrap: i.WRAP_NO_WRAP, "wrap-reverse": i.WRAP_WRAP_REVERSE }, i.WRAP_NO_WRAP, "flexWrap")), typeof o.gap < "u" && A.setGap(i.GUTTER_ALL, o.gap), typeof o.rowGap < "u" && A.setGap(i.GUTTER_ROW, o.rowGap), typeof o.columnGap < "u" && A.setGap(i.GUTTER_COLUMN, o.columnGap), typeof o.flexBasis < "u" && A.setFlexBasis(tt(o.flexBasis, "flexBasis")), A.setFlexGrow(typeof o.flexGrow > "u" ? 0 : o.flexGrow), A.setFlexShrink(typeof o.flexShrink > "u" ? 0 : o.flexShrink), typeof o.maxHeight < "u" && A.setMaxHeight(Ve(o.maxHeight, "maxHeight")), typeof o.maxWidth < "u" && A.setMaxWidth(Ve(o.maxWidth, "maxWidth")), typeof o.minHeight < "u" && A.setMinHeight(Ve(o.minHeight, "minHeight")), typeof o.minWidth < "u" && A.setMinWidth(Ve(o.minWidth, "minWidth")), A.setOverflow(ue(o.overflow, { visible: i.OVERFLOW_VISIBLE, hidden: i.OVERFLOW_HIDDEN }, i.OVERFLOW_VISIBLE, "overflow")), A.setMargin(i.EDGE_TOP, tt(o.marginTop || 0)), A.setMargin(i.EDGE_BOTTOM, tt(o.marginBottom || 0)), A.setMargin(i.EDGE_LEFT, tt(o.marginLeft || 0)), A.setMargin(i.EDGE_RIGHT, tt(o.marginRight || 0)), A.setBorder(i.EDGE_TOP, o.borderTopWidth || 0), A.setBorder(i.EDGE_BOTTOM, o.borderBottomWidth || 0), A.setBorder(i.EDGE_LEFT, o.borderLeftWidth || 0), A.setBorder(i.EDGE_RIGHT, o.borderRightWidth || 0), A.setPadding(i.EDGE_TOP, o.paddingTop || 0), A.setPadding(i.EDGE_BOTTOM, o.paddingBottom || 0), A.setPadding(i.EDGE_LEFT, o.paddingLeft || 0), A.setPadding(i.EDGE_RIGHT, o.paddingRight || 0), A.setBoxSizing(ue(o.boxSizing, { "border-box": i.BOX_SIZING_BORDER_BOX, "content-box": i.BOX_SIZING_CONTENT_BOX }, i.BOX_SIZING_BORDER_BOX, "boxSizing")), A.setPositionType(ue(o.position, { absolute: i.POSITION_TYPE_ABSOLUTE, relative: i.POSITION_TYPE_RELATIVE, static: i.POSITION_TYPE_STATIC }, i.POSITION_TYPE_RELATIVE, "position")), typeof o.top < "u" && A.setPosition(i.EDGE_TOP, Ve(o.top, "top")), typeof o.bottom < "u" && A.setPosition(i.EDGE_BOTTOM, Ve(o.bottom, "bottom")), typeof o.left < "u" && A.setPosition(i.EDGE_LEFT, Ve(o.left, "left")), typeof o.right < "u" && A.setPosition(i.EDGE_RIGHT, Ve(o.right, "right")), typeof o.height < "u" ? A.setHeight(tt(o.height, "height")) : A.setHeightAuto(), typeof o.width < "u" ? A.setWidth(tt(o.width, "width")) : A.setWidthAuto(), [o, ni(o)];
}
var ea = [1, 0, 0, 1, 0, 0];
function hl(A, e, t) {
  let r = [...ea];
  for (let n of A) {
    let i = Object.keys(n)[0], o = n[i];
    if (typeof o == "string")
      if (i === "translateX")
        o = parseFloat(o) / 100 * e, n[i] = o;
      else if (i === "translateY")
        o = parseFloat(o) / 100 * t, n[i] = o;
      else
        throw new Error(`Invalid transform: "${i}: ${o}".`);
    let a = o, u2 = [...ea];
    switch (i) {
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
        let l2 = a * Math.PI / 180, I = Math.cos(l2), E = Math.sin(l2);
        u2[0] = I, u2[1] = E, u2[2] = -E, u2[3] = I;
        break;
      }
      case "skewX":
        u2[2] = Math.tan(a * Math.PI / 180);
        break;
      case "skewY":
        u2[1] = Math.tan(a * Math.PI / 180);
        break;
    }
    r = Yt(u2, r);
  }
  A.splice(0, A.length), A.push(...r), A.__resolved = true;
}
function jt({ left: A, top: e, width: t, height: r }, n, i, o) {
  let a;
  n.__resolved || hl(n, t, r);
  let u2 = n;
  if (i)
    a = u2;
  else {
    let l2 = (o == null ? void 0 : o.xAbsolute) ?? ((o == null ? void 0 : o.xRelative) ?? 50) * t / 100, I = (o == null ? void 0 : o.yAbsolute) ?? ((o == null ? void 0 : o.yRelative) ?? 50) * r / 100, E = A + l2, C = e + I;
    a = Yt([1, 0, 0, 1, E, C], Yt(u2, [1, 0, 0, 1, -E, -C])), u2.__parent && (a = Yt(u2.__parent, a)), u2.splice(0, 6, ...a);
  }
  return `matrix(${a.map((l2) => l2.toFixed(2)).join(",")})`;
}
function ra({ left: A, top: e, width: t, height: r, isInheritingTransform: n }, i) {
  let o = "", a = 1;
  return i.transform && (o = jt({ left: A, top: e, width: t, height: r }, i.transform, n, i.transformOrigin)), i.opacity !== void 0 && (a = +i.opacity), { matrix: o, opacity: a };
}
function ai({ id: A, content: e, filter: t, left: r, top: n, width: i, height: o, matrix: a, opacity: u2, image: l2, clipPathId: I, debug: E, shape: C, decorationShape: d2 }, p) {
  let y = "";
  if (E && (y = H("rect", { x: r, y: n - o, width: i, height: o, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: a || void 0, "clip-path": I ? `url(#${I})` : void 0 })), l2) {
    let x2 = { href: l2, x: r, y: n, width: i, height: o, transform: a || void 0, "clip-path": I ? `url(#${I})` : void 0, style: p.filter ? `filter:${p.filter}` : void 0 };
    return [(t ? `${t}<g filter="url(#satori_s-${A})">` : "") + H("image", { ...x2, opacity: u2 !== 1 ? u2 : void 0 }) + (d2 || "") + (t ? "</g>" : "") + y, ""];
  }
  let k = { x: r, y: n, width: i, height: o, "font-weight": p.fontWeight, "font-style": p.fontStyle, "font-size": p.fontSize, "font-family": p.fontFamily, "letter-spacing": p.letterSpacing || void 0, transform: a || void 0, "clip-path": I ? `url(#${I})` : void 0, style: p.filter ? `filter:${p.filter}` : void 0, "stroke-width": p.WebkitTextStrokeWidth ? `${p.WebkitTextStrokeWidth}px` : void 0, stroke: p.WebkitTextStrokeWidth ? p.WebkitTextStrokeColor : void 0, "stroke-linejoin": p.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": p.WebkitTextStrokeWidth ? "stroke" : void 0 };
  return [(t ? `${t}<g filter="url(#satori_s-${A})">` : "") + H("text", { ...k, fill: p.color, opacity: u2 !== 1 ? u2 : void 0 }, (0, import_escape_html.default)(e)) + (d2 || "") + (t ? "</g>" : "") + y, C ? H("text", k, (0, import_escape_html.default)(e)) : ""];
}
function pl(A, e, t) {
  return A.replace(/([MA])([0-9.-]+),([0-9.-]+)/g, function(r, n, i, o) {
    return n + (parseFloat(i) + e) + "," + (parseFloat(o) + t);
  });
}
var nn = 1.1;
function na({ id: A, width: e, height: t }, r, n = false) {
  if (!r.shadowColor || !r.shadowOffset || typeof r.shadowRadius > "u")
    return "";
  let i = r.shadowColor.length, o = "", a = "", u2 = 0, l2 = e, I = 0, E = t;
  for (let C = 0; C < i; C++) {
    let d2 = r.shadowRadius[C] * r.shadowRadius[C] / 4;
    if (u2 = Math.min(r.shadowOffset[C].width - d2, u2), l2 = Math.max(r.shadowOffset[C].width + d2 + e, l2), I = Math.min(r.shadowOffset[C].height - d2, I), E = Math.max(r.shadowOffset[C].height + d2 + t, E), n) {
      let p = `satori_s-${A}-result-${C}`;
      o += H("feGaussianBlur", { in: "SourceAlpha", stdDeviation: r.shadowRadius[C] / 2, result: `${p}-blur` }) + H("feOffset", { in: `${p}-blur`, dx: r.shadowOffset[C].width, dy: r.shadowOffset[C].height, result: `${p}-offset` }) + H("feFlood", { "flood-color": r.shadowColor[C], "flood-opacity": 1, result: `${p}-color` }) + H("feComposite", { in: `${p}-color`, in2: `${p}-offset`, operator: "in", result: i > 1 ? p : void 0 });
    } else
      o += H("feDropShadow", { dx: r.shadowOffset[C].width, dy: r.shadowOffset[C].height, stdDeviation: r.shadowRadius[C] / 2, "flood-color": r.shadowColor[C], "flood-opacity": 1, ...i > 1 ? { in: "SourceGraphic", result: `satori_s-${A}-result-${C}` } : {} });
    i > 1 && (a = H("feMergeNode", { in: `satori_s-${A}-result-${C}` }) + a);
  }
  return H("filter", { id: `satori_s-${A}`, x: (u2 / e * 100 * nn).toFixed(2) + "%", y: (I / t * 100 * nn).toFixed(2) + "%", width: ((l2 - u2) / e * 100 * nn).toFixed(2) + "%", height: ((E - I) / t * 100 * nn).toFixed(2) + "%" }, o + (a ? H("feMerge", {}, a) : ""));
}
function ia({ width: A, height: e, shape: t, opacity: r, id: n }, i) {
  if (!i.boxShadow)
    return null;
  let o = "", a = "";
  for (let u2 = i.boxShadow.length - 1; u2 >= 0; u2--) {
    let l2 = "", I = i.boxShadow[u2];
    I.spreadRadius && I.inset && (I.spreadRadius = -I.spreadRadius);
    let E = I.blurRadius * I.blurRadius / 4 + (I.spreadRadius || 0), C = Math.min(-E - (I.inset ? I.offsetX : 0), 0), d2 = Math.max(E + A - (I.inset ? I.offsetX : 0), A), p = Math.min(-E - (I.inset ? I.offsetY : 0), 0), y = Math.max(E + e - (I.inset ? I.offsetY : 0), e), k = `satori_s-${n}-${u2}`, x2 = `satori_ms-${n}-${u2}`, F = I.spreadRadius ? t.replace('stroke-width="0"', `stroke-width="${I.spreadRadius * 2}"`) : t;
    l2 += H("mask", { id: x2, maskUnits: "userSpaceOnUse" }, H("rect", { x: 0, y: 0, width: i._viewportWidth || "100%", height: i._viewportHeight || "100%", fill: I.inset ? "#000" : "#fff" }) + F.replace('fill="#fff"', I.inset ? 'fill="#fff"' : 'fill="#000"').replace('stroke="#fff"', ""));
    let b = F.replace(/d="([^"]+)"/, (v2, M) => 'd="' + pl(M, I.offsetX, I.offsetY) + '"').replace(/x="([^"]+)"/, (v2, M) => 'x="' + (parseFloat(M) + I.offsetX) + '"').replace(/y="([^"]+)"/, (v2, M) => 'y="' + (parseFloat(M) + I.offsetY) + '"');
    I.spreadRadius && I.spreadRadius < 0 && (l2 += H("mask", { id: x2 + "-neg", maskUnits: "userSpaceOnUse" }, b.replace('stroke="#fff"', 'stroke="#000"').replace(/stroke-width="[^"]+"/, `stroke-width="${-I.spreadRadius * 2}"`))), I.spreadRadius && I.spreadRadius < 0 && (b = H("g", { mask: `url(#${x2}-neg)` }, b)), l2 += H("defs", {}, H("filter", { id: k, x: `${C / A * 100}%`, y: `${p / e * 100}%`, width: `${(d2 - C) / A * 100}%`, height: `${(y - p) / e * 100}%` }, H("feGaussianBlur", { stdDeviation: I.blurRadius / 2, result: "b" }) + H("feFlood", { "flood-color": I.color, in: "SourceGraphic", result: "f" }) + H("feComposite", { in: "f", in2: "b", operator: I.inset ? "out" : "in" }))) + H("g", { mask: `url(#${x2})`, filter: `url(#${k})`, opacity: r }, b), I.inset ? a += l2 : o += l2;
  }
  return [o, a];
}
function ml(A, e, t, r, n, i) {
  let o = n / 2, a = Math.max(o, n * 1.25), u2 = [];
  for (let E of t) {
    if (E.y2 < i + o || E.y1 > r + o)
      continue;
    let C = Math.max(A, E.x1 - a), d2 = Math.min(e, E.x2 + a);
    if (C >= d2)
      continue;
    if (u2.length === 0) {
      u2.push([C, d2]);
      continue;
    }
    let p = u2[u2.length - 1];
    C <= p[1] ? p[1] = Math.max(p[1], d2) : u2.push([C, d2]);
  }
  if (!u2.length)
    return [[A, e]];
  let l2 = [], I = A;
  for (let [E, C] of u2)
    if (E > I && l2.push([I, E]), I = Math.max(I, C), I >= e)
      break;
  return I < e && l2.push([I, e]), l2;
}
function gi({ width: A, left: e, top: t, ascender: r, clipPathId: n, matrix: i, glyphBoxes: o }, a) {
  let { textDecorationColor: u2, textDecorationStyle: l2, textDecorationLine: I, textDecorationSkipInk: E, fontSize: C, color: d2 } = a;
  if (!I || I === "none")
    return "";
  let p = Math.max(1, C * 0.1), y = I === "line-through" ? t + r * 0.7 : I === "underline" ? t + r * 1.1 : t, k = l2 === "dashed" ? `${p * 1.2} ${p * 2}` : l2 === "dotted" ? `0 ${p * 2}` : void 0, x2 = I === "underline" && (E || "auto") !== "none" && (o == null ? void 0 : o.length), F = t + r, b = x2 ? ml(e, e + A, o, y, p, F) : [[e, e + A]], v2 = l2 === "double" ? b.map(([M, L]) => H("line", { x1: M, y1: y + p + 1, x2: L, y2: y + p + 1, stroke: u2 || d2, "stroke-width": p, "stroke-dasharray": k, "stroke-linecap": l2 === "dotted" ? "round" : "square", transform: i })).join("") : "";
  return (n ? `<g clip-path="url(#${n})">` : "") + b.map(([M, L]) => H("line", { x1: M, y1: y, x2: L, y2: y, stroke: u2 || d2, "stroke-width": p, "stroke-dasharray": k, "stroke-linecap": l2 === "dotted" ? "round" : "square", transform: i })).join("") + v2 + (n ? "</g>" : "");
}
function ui(A) {
  return A = A.replace("U+", "0x"), String.fromCodePoint(Number(A));
}
var Qt = ui("U+0020");
var Ii = ui("U+0009");
var Ut = ui("U+2026");
function oa(A, e, t) {
  let { fontSize: r, letterSpacing: n } = t, i = /* @__PURE__ */ new Map();
  function o(l2) {
    let I = i.get(l2);
    return I === void 0 && (I = A.measure(l2, { fontSize: r, letterSpacing: n }), i.set(l2, I)), I;
  }
  function a(l2) {
    let I = 0;
    for (let E of l2)
      e(E) ? I += r : I += o(E);
    return I;
  }
  function u2(l2) {
    return a(ge(l2, "grapheme"));
  }
  return { measureGrapheme: o, measureGraphemeArray: a, measureText: u2 };
}
function sa(A, e, t) {
  let { textTransform: r, whiteSpace: n, wordBreak: i } = e;
  A = yl(A, r, t);
  let { content: o, shouldCollapseTabsAndSpaces: a, allowSoftWrap: u2 } = Sl(A, n), { words: l2, requiredBreaks: I, allowBreakWord: E } = Dl(o, i), [C, d2] = wl(e, u2);
  return { words: l2, requiredBreaks: I, allowSoftWrap: u2, allowBreakWord: E, processedContent: o, shouldCollapseTabsAndSpaces: a, lineLimit: C, blockEllipsis: d2 };
}
function yl(A, e, t) {
  return e === "uppercase" ? A = A.toLocaleUpperCase(t) : e === "lowercase" ? A = A.toLocaleLowerCase(t) : e === "capitalize" && (A = ge(A, "word", t).map((r) => ge(r, "grapheme", t).map((n, i) => i === 0 ? n.toLocaleUpperCase(t) : n).join("")).join("")), A;
}
function wl(A, e) {
  let { textOverflow: t, lineClamp: r, WebkitLineClamp: n, WebkitBoxOrient: i, overflow: o, display: a } = A;
  if (a === "block" && r) {
    let [u2, l2 = Ut] = bl(r);
    if (u2)
      return [u2, l2];
  }
  return t === "ellipsis" && a === "-webkit-box" && i === "vertical" && ws(n) && n > 0 ? [n, Ut] : t === "ellipsis" && o === "hidden" && !e ? [1, Ut] : [1 / 0];
}
function Dl(A, e) {
  let t = ["break-all", "break-word"].includes(e), { words: r, requiredBreaks: n } = Ss(A, e);
  return { words: r, requiredBreaks: n, allowBreakWord: t };
}
function Sl(A, e) {
  let t = ["pre", "pre-wrap", "pre-line"].includes(e), r = ["normal", "nowrap", "pre-line"].includes(e), n = !["pre", "nowrap"].includes(e);
  return t || (A = A.replace(/\n/g, Qt)), r && (A = A.replace(/([ ]|\t)+/g, Qt).replace(/^[ ]|[ ]$/g, "")), { content: A, shouldCollapseTabsAndSpaces: r, allowSoftWrap: n };
}
function bl(A) {
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
var vl = /* @__PURE__ */ new Set([Ii]);
function kl(A) {
  return vl.has(A);
}
function li(A) {
  if (A === "transparent")
    return true;
  let e = index_esm_default(A);
  return e ? e.alpha === 0 : false;
}
function aa(A) {
  if (!A)
    return false;
  let e = index_esm_default(A);
  if (!e)
    return false;
  let [t, r, n, i] = e.values;
  return t === 255 && r === 255 && n === 255 && (i === void 0 || i === 1);
}
async function* ci(A, e) {
  let t = await rt(), { parentStyle: r, inheritedStyle: n, parent: i, font: o, id: a, isInheritingTransform: u2, debug: l2, embedFont: I, graphemeImages: E, locale: C, canLoadAdditionalAssets: d2 } = e, { textAlign: p, textIndent: y = 0, lineHeight: k, textWrap: x2, fontSize: F, filter: b, tabSize: v2 = 8, letterSpacing: M, _inheritedBackgroundClipTextPath: L, _inheritedBackgroundClipTextHasBackground: O, flexShrink: J } = r, { words: j, requiredBreaks: CA, allowSoftWrap: MA, allowBreakWord: dA, processedContent: sA, shouldCollapseTabsAndSpaces: vA, lineLimit: rA, blockEllipsis: iA } = sa(A, r, C), wA = xl(t, p);
  i.insertChild(wA, i.getChildCount()), Ds(J) && i.setFlexShrink(1);
  let aA = o.getEngine(F, k, r, C), FA = d2 ? ge(sA, "grapheme").filter((V) => !kl(V) && !aA.has(V)) : [];
  yield FA.map((V) => ({ word: V, locale: C })), FA.length && (aA = o.getEngine(F, k, r, C));
  function kA(V) {
    return !!(E && E[V]);
  }
  let { measureGrapheme: te, measureGraphemeArray: TA, measureText: xA } = oa(aA, kA, { fontSize: F, letterSpacing: M }), fA = Xr(v2) ? tA(v2, F, 1, r) : te(Qt) * v2, q = (V, Z) => {
    if (V.length === 0)
      return { originWidth: 0, endingSpacesWidth: 0, text: V };
    let { index: nA, tabCount: $ } = Rl(V), IA = 0;
    if ($ > 0) {
      let DA = V.slice(0, nA), cA = V.slice(nA + $), gA = xA(DA), Ee = gA + Z;
      IA = (fA === 0 ? gA : (Math.floor(Ee / fA) + $) * fA) + xA(cA);
    } else
      IA = xA(V);
    let lA = V.trimEnd() === V ? IA : xA(V.trimEnd());
    return { originWidth: IA, endingSpacesWidth: IA - lA, text: V };
  }, oA = [], BA = [], W = [], Y = [], OA = [];
  function PA(V) {
    let Z = 0, nA = 0, $ = -1, IA = 0, lA = 0, DA = 0, cA = 0;
    oA = [], W = [0], Y = [], OA = [];
    let gA = 0, Ee = 0;
    for (; gA < j.length && Z < rA; ) {
      let eA = j[gA], JA = CA[gA], RA = 0, { originWidth: ut, endingSpacesWidth: GA, text: YA } = q(eA, lA);
      eA = YA, RA = ut;
      let qA = GA;
      JA && DA === 0 && (DA = aA.height(eA));
      let Qe = p === "justify", pA = gA && lA + RA > V + qA && MA;
      if (dA && RA > V && (!lA || pA || JA)) {
        let jA = ge(eA, "grapheme");
        j.splice(gA, 1, ...jA), lA > 0 && (oA.push(lA - Ee), BA.push(cA), Z++, IA += DA, lA = 0, DA = 0, cA = 0, W.push(1), $ = -1), Ee = qA;
        continue;
      }
      if (JA || pA)
        vA && eA === Qt && (RA = 0), oA.push(lA - Ee), BA.push(cA), Z++, IA += DA, lA = RA, DA = RA ? Math.round(aA.height(eA)) : 0, cA = RA ? Math.round(aA.baseline(eA)) : 0, W.push(1), $ = -1, JA || (nA = Math.max(nA, V));
      else {
        lA += RA;
        let jA = Math.round(aA.height(eA));
        jA > DA && (DA = jA, cA = Math.round(aA.baseline(eA))), Qe && W[W.length - 1]++;
      }
      Qe && $++, nA = Math.max(nA, lA);
      let ZA = lA - RA;
      if (RA === 0)
        OA.push({ y: IA, x: ZA, width: 0, line: Z, lineIndex: $, isImage: false });
      else {
        let jA = ge(eA, "word");
        for (let Se = 0; Se < jA.length; Se++) {
          let be = jA[Se], $A = 0, Ce = false;
          kA(be) ? ($A = F, Ce = true) : !I && be.length > 1 ? $A = xA(be) : $A = te(be), Y.push(be), OA.push({ y: IA, x: ZA, width: $A, line: Z, lineIndex: $, isImage: Ce }), ZA += $A;
        }
      }
      gA++, Ee = qA;
    }
    return lA && (Z < rA && (IA += DA), Z++, oA.push(lA), BA.push(cA)), { width: nA, height: IA };
  }
  let WA = { width: 0, height: 0 };
  wA.setMeasureFunc((V) => {
    let { width: Z, height: nA } = PA(V);
    if (x2 === "balance") {
      let IA = Z / 2, lA = Z, DA = Z;
      for (; IA + 1 < lA; ) {
        DA = (IA + lA) / 2;
        let { height: gA } = PA(DA);
        gA > nA ? IA = DA : lA = DA;
      }
      PA(lA);
      let cA = Math.ceil(lA);
      return WA = { width: cA, height: nA }, { width: cA, height: nA };
    }
    if (x2 === "pretty" && oA[oA.length - 1] < Z / 3) {
      let DA = Z * 0.9, cA = PA(DA);
      if (cA.height <= nA * 1.3)
        return WA = { width: Z, height: cA.height }, { width: Z, height: cA.height };
    }
    let $ = Math.ceil(Z);
    return WA = { width: $, height: nA }, { width: $, height: nA };
  });
  let [uA, hA] = yield, Ie = "", le = "", LA = n._inheritedClipPathId, re = n._inheritedMaskId, { left: ce, top: ye, width: Pe, height: Ye } = wA.getComputedLayout(), Ge = typeof y == "string" ? tA(y, F, Pe, r, true) || 0 : y, Ue = i.getComputedWidth() - i.getComputedPadding(t.EDGE_LEFT) - i.getComputedPadding(t.EDGE_RIGHT) - i.getComputedBorder(t.EDGE_LEFT) - i.getComputedBorder(t.EDGE_RIGHT), we = uA + ce, fe = hA + ye, { matrix: se, opacity: qe } = ra({ left: ce, top: ye, width: Pe, height: Ye, isInheritingTransform: u2 }, r), zA = "";
  if (r.textShadowOffset) {
    let { textShadowColor: V, textShadowOffset: Z, textShadowRadius: nA } = r;
    zA = na({ width: WA.width, height: WA.height, id: a }, { shadowColor: V, shadowOffset: Z, shadowRadius: nA }, li(r.color) || O && aa(r.color)), zA = H("defs", {}, zA);
  }
  let ne = "", ie = "", Be = "", De = -1, KA = {}, XA = {}, _A = null, oe = 0;
  for (let V = 0; V < Y.length; V++) {
    let Z = OA[V], nA = OA[V + 1];
    if (!Z)
      continue;
    let $ = Y[V], IA = null, lA = false, DA = E ? E[$] : null, cA = Z.y, gA = Z.x, Ee = Z.width, eA = Z.line, JA = r.textDecorationLine === "underline" && (r.textDecorationSkipInk || "auto") !== "none";
    if (eA === De)
      continue;
    let RA = false;
    if (eA === 0 && Ge !== 0 && (gA += Ge), oA.length > 1) {
      let pA = Pe - oA[eA];
      if (p === "right" || p === "end")
        gA += pA;
      else if (p === "center")
        gA += pA / 2;
      else if (p === "justify" && eA < oA.length - 1) {
        let mA = W[eA], ZA = mA > 1 ? pA / (mA - 1) : 0;
        gA += ZA * Z.lineIndex, RA = true;
      }
      I && (gA = Math.round(gA));
    }
    let ut = BA[eA], GA = aA.baseline($), YA = aA.height($), qA = ut - GA, Qe = (pA) => !JA || r.textDecorationLine !== "underline" ? void 0 : { underlineY: fe + pA + qA + GA + GA * 0.1, strokeWidth: Math.max(1, F * 0.1) };
    if (KA[eA] || (KA[eA] = { left: gA, top: fe + cA + qA, ascender: GA, width: RA ? Pe : oA[eA] }), rA !== 1 / 0) {
      let be = function($A, Ce) {
        let It = ge(Ce, "grapheme", C), et2 = "", wt = 0;
        for (let Dt of It) {
          let lt = $A + TA([et2 + Dt]);
          if (et2 && lt + mA > Ue)
            break;
          et2 += Dt, wt = lt;
        }
        return { subset: et2, resolvedWidth: wt };
      }, pA = iA, mA = te(iA);
      mA > Ue && (pA = Ut, mA = te(pA));
      let ZA = te(Qt), jA = eA < oA.length - 1;
      if (eA + 1 === rA && (jA || oA[eA] > Ue)) {
        if (gA + Ee + mA + ZA > Ue) {
          let { subset: $A, resolvedWidth: Ce } = be(gA, $);
          $ = $A + pA, De = eA, KA[eA].width = Math.max(0, Ce - KA[eA].left), lA = true;
        } else if (nA && nA.line !== eA)
          if (p === "center") {
            let { subset: $A, resolvedWidth: Ce } = be(gA, $);
            $ = $A + pA, De = eA, KA[eA].width = Math.max(0, Ce - KA[eA].left), lA = true;
          } else {
            let $A = Y[V + 1], { subset: Ce, resolvedWidth: It } = be(Ee + gA, $A);
            $ = $ + Ce + pA, De = eA, KA[eA].width = Math.max(0, It - KA[eA].left), lA = true;
          }
      }
    }
    if (DA)
      cA += 0;
    else if (I) {
      if (!$.includes(Ii) && !ms.includes($) && Y[V + 1] && nA && !nA.isImage && cA === nA.y && !lA) {
        _A === null && (oe = gA), _A = _A === null ? $ : _A + $;
        continue;
      }
      let pA = _A === null ? $ : _A + $, mA = _A === null ? gA : oe, ZA = Z.width + gA - mA, jA = Qe(cA), Se = aA.getSVG(pA.replace(/(\t)+/g, ""), { fontSize: F, left: we + mA, top: fe + cA + GA + qA, letterSpacing: M }, jA);
      IA = Se.path, JA && Se.boxes && Se.boxes.length && (XA[eA] || (XA[eA] = [])).push(...Se.boxes), _A = null, l2 && (Be += H("rect", { x: we + mA, y: fe + cA + qA, width: ZA, height: YA, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: se || void 0, "clip-path": LA ? `url(#${LA})` : void 0 }) + H("line", { x1: we + gA, x2: we + gA + Z.width, y1: fe + cA + qA + GA, y2: fe + cA + qA + GA, stroke: "#14c000", "stroke-width": 1, transform: se || void 0, "clip-path": LA ? `url(#${LA})` : void 0 }));
    } else if (cA += GA + qA, JA && !DA) {
      let pA = Qe(cA), mA = aA.getSVG($.replace(/(\t)+/g, ""), { fontSize: F, left: we + gA, top: fe + cA, letterSpacing: M }, pA);
      mA.boxes && mA.boxes.length && (XA[eA] || (XA[eA] = [])).push(...mA.boxes);
    }
    if (IA !== null)
      ie += IA + " ";
    else {
      let [pA, mA] = ai({ content: $, filter: zA, id: a, left: we + gA, top: fe + cA, width: Ee, height: YA, matrix: se, opacity: qe, image: DA, clipPathId: LA, debug: l2, shape: !!L }, r);
      Ie += pA, le += mA;
    }
    if (lA)
      break;
  }
  if (r.textDecorationLine && (ne = Object.entries(KA).map(([V, Z]) => {
    if (!Z)
      return "";
    let nA = XA[V] || [];
    return gi({ left: we + Z.left, top: Z.top, width: Z.width, ascender: Z.ascender, clipPathId: LA, matrix: se, glyphBoxes: nA }, r);
  }).join("")), ie) {
    let V = (!li(r.color) || zA) && qe !== 0 ? `<g ${re ? `mask="url(#${re})"` : ""} ${LA ? `clip-path="url(#${LA})"` : ""}>` + H("path", { fill: zA && (li(r.color) || O && aa(r.color)) ? "black" : r.color, d: ie, transform: se || void 0, opacity: qe !== 1 ? qe : void 0, style: b ? `filter:${b}` : void 0, "stroke-width": n.WebkitTextStrokeWidth ? `${n.WebkitTextStrokeWidth}px` : void 0, stroke: n.WebkitTextStrokeWidth ? n.WebkitTextStrokeColor : void 0, "stroke-linejoin": n.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": n.WebkitTextStrokeWidth ? "stroke" : void 0 }) + "</g>" : "";
    L && (le = H("path", { d: ie, transform: se || void 0 })), Ie += (zA ? zA + H("g", { filter: `url(#satori_s-${a})` }, V + ne) : V + ne) + Be;
  } else
    ne && (Ie += zA ? H("g", { filter: `url(#satori_s-${a})` }, ne) : ne);
  return le && (r._inheritedBackgroundClipTextPath.value += le), Ie;
}
function xl(A, e) {
  let t = A.Node.create();
  return t.setAlignItems(A.ALIGN_BASELINE), t.setJustifyContent(ue(e, { left: A.JUSTIFY_FLEX_START, right: A.JUSTIFY_FLEX_END, center: A.JUSTIFY_CENTER, justify: A.JUSTIFY_SPACE_BETWEEN, start: A.JUSTIFY_FLEX_START, end: A.JUSTIFY_FLEX_END }, A.JUSTIFY_FLEX_START, "textAlign")), t;
}
function Rl(A) {
  let e = /(\t)+/.exec(A);
  return e ? { index: e.index, tabCount: e[0].length } : { index: null, tabCount: 0 };
}
function on(A, e, t, r, n) {
  let i = [], o = e.at(-1), a = o && o.offset && o.offset.unit === "%" && r ? +o.offset.value : 100;
  for (let E of e) {
    let { color: C } = E;
    if (!i.length && (i.push({ offset: 0, color: C }), !E.offset || E.offset.value === "0"))
      continue;
    let d2 = typeof E.offset > "u" ? void 0 : E.offset.unit === "%" ? +E.offset.value / a : Number(tA(`${E.offset.value}${E.offset.unit}`, t.fontSize, A, t, true)) / A;
    i.push({ offset: d2, color: C });
  }
  i.length || i.push({ offset: 0, color: "transparent" });
  let u2 = i[i.length - 1];
  u2.offset !== 1 && (typeof u2.offset > "u" ? u2.offset = 1 : r ? i[i.length - 1] = { offset: 1, color: u2.color } : i.push({ offset: 1, color: u2.color }));
  let l2 = 0, I = 1;
  for (let E = 0; E < i.length; E++)
    if (typeof i[E].offset > "u") {
      for (I < E && (I = E); typeof i[I].offset > "u"; )
        I++;
      i[E].offset = (i[I].offset - i[l2].offset) / (I - l2) * (E - l2) + i[l2].offset;
    } else
      l2 = E;
  return n === "mask" ? i.map((E) => {
    let C = index_esm_default(E.color);
    return C ? C.alpha === 0 ? { ...E, color: "rgba(0, 0, 0, 1)" } : { ...E, color: `rgba(255, 255, 255, ${C.alpha})` } : E;
  }) : i;
}
function ua({ id: A, width: e, height: t, repeatX: r, repeatY: n }, i, o, a, u2, l2) {
  let I = P(i), [E, C] = o, d2 = i.startsWith("repeating"), p, y, k;
  if (I.orientation.type === "directional")
    p = Ll(I.orientation.value), y = Math.sqrt(Math.pow((p.x2 - p.x1) * E, 2) + Math.pow((p.y2 - p.y1) * C, 2));
  else if (I.orientation.type === "angular") {
    let { length: M, ...L } = Gl(Pn(`${I.orientation.value.value}${I.orientation.value.unit}`) / 180 * Math.PI, E, C);
    y = M, p = L;
  }
  k = d2 ? Ul(I.stops, y, p, u2) : p;
  let x2 = on(d2 ? Fl(I.stops, y) : y, I.stops, u2, d2, l2), F = `satori_bi${A}`, b = `satori_pattern_${A}`, v2 = H("pattern", { id: b, x: a[0] / e, y: a[1] / t, width: r ? E / e : "1", height: n ? C / t : "1", patternUnits: "objectBoundingBox" }, H("linearGradient", { id: F, ...k, spreadMethod: d2 ? "repeat" : "pad" }, x2.map((M) => H("stop", { offset: (M.offset ?? 0) * 100 + "%", "stop-color": M.color })).join("")) + H("rect", { x: 0, y: 0, width: E, height: C, fill: `url(#${F})` }));
  return [b, v2];
}
function Fl(A, e) {
  let t = A[A.length - 1], { offset: r } = t;
  return r ? r.unit === "%" ? Number(r.value) / 100 * e : Number(r.value) : e;
}
function Ll(A) {
  let e = 0, t = 0, r = 0, n = 0;
  return A.includes("top") ? t = 1 : A.includes("bottom") && (n = 1), A.includes("left") ? e = 1 : A.includes("right") && (r = 1), !e && !r && !t && !n && (t = 1), { x1: e, y1: t, x2: r, y2: n };
}
function Gl(A, e, t) {
  let r = Math.pow(t / e, 2);
  A = (A % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let n, i, o, a, u2, l2, I, E, C = (d2) => {
    if (d2 === 0) {
      n = 0, i = t, o = 0, a = 0, u2 = t;
      return;
    } else if (d2 === Math.PI / 2) {
      n = 0, i = 0, o = e, a = 0, u2 = e;
      return;
    }
    if (d2 > 0 && d2 < Math.PI / 2) {
      n = (r * e / 2 / Math.tan(d2) - t / 2) / (Math.tan(d2) + r / Math.tan(d2)), i = Math.tan(d2) * n + t, o = Math.abs(e / 2 - n) + e / 2, a = t / 2 - Math.abs(i - t / 2), u2 = Math.sqrt(Math.pow(o - n, 2) + Math.pow(a - i, 2)), I = (e / 2 / Math.tan(d2) - t / 2) / (Math.tan(d2) + 1 / Math.tan(d2)), E = Math.tan(d2) * I + t, u2 = 2 * Math.sqrt(Math.pow(e / 2 - I, 2) + Math.pow(t / 2 - E, 2));
      return;
    } else if (d2 > Math.PI / 2 && d2 < Math.PI) {
      n = (t / 2 + r * e / 2 / Math.tan(d2)) / (Math.tan(d2) + r / Math.tan(d2)), i = Math.tan(d2) * n, o = Math.abs(e / 2 - n) + e / 2, a = t / 2 + Math.abs(i - t / 2), I = (e / 2 / Math.tan(d2) + t / 2) / (Math.tan(d2) + 1 / Math.tan(d2)), E = Math.tan(d2) * I, u2 = 2 * Math.sqrt(Math.pow(e / 2 - I, 2) + Math.pow(t / 2 - E, 2));
      return;
    } else
      d2 >= Math.PI && (C(d2 - Math.PI), l2 = n, n = o, o = l2, l2 = i, i = a, a = l2);
  };
  return C(A), { x1: n / e, y1: i / t, x2: o / e, y2: a / t, length: u2 };
}
function Ul(A, e, t, r) {
  let { x1: n, x2: i, y1: o, y2: a } = t, u2 = A[0].offset ? A[0].offset.unit === "%" ? Number(A[0].offset.value) / 100 : tA(`${A[0].offset.value}${A[0].offset.unit}`, r.fontSize, e, r, true) / e : 0, l2 = A.at(-1).offset ? A.at(-1).offset.unit === "%" ? Number(A.at(-1).offset.value) / 100 : tA(`${A.at(-1).offset.value}${A.at(-1).offset.unit}`, r.fontSize, e, r, true) / e : 1, I = (i - n) * u2 + n, E = (a - o) * u2 + o, C = (i - n) * l2 + n, d2 = (a - o) * l2 + o;
  return { x1: I, y1: E, x2: C, y2: d2 };
}
function la({ id: A, width: e, height: t, repeatX: r, repeatY: n }, i, o, a, u2, l2) {
  var sA;
  let { shape: I, stops: E, position: C, size: d2, repeating: p } = K(i), [y, k] = o, x2 = y / 2, F = k / 2, b = Tl(C.x, C.y, y, k, u2.fontSize, u2);
  x2 = b.x, F = b.y;
  let v2 = Ol(e, E, p, u2), M = on(v2, E, u2, p, l2), L = `satori_radial_${A}`, O = `satori_pattern_${A}`, J = `satori_mask_${A}`, j = _l(I, d2, u2.fontSize, { x: x2, y: F }, [y, k], u2, p), CA = Pl(I, u2.fontSize, E, [y, k], u2, p, j), MA = H("pattern", { id: O, x: a[0] / e, y: a[1] / t, width: r ? y / e : "1", height: n ? k / t : "1", patternUnits: "objectBoundingBox" }, H("radialGradient", { id: L, ...CA }, M.map((vA) => H("stop", { offset: vA.offset || 0, "stop-color": vA.color })).join("")) + H("mask", { id: J }, H("rect", { x: 0, y: 0, width: y, height: k, fill: "#fff" })) + H("rect", { x: 0, y: 0, width: y, height: k, fill: ((sA = M.at(-1)) == null ? void 0 : sA.color) || "transparent" }) + H(I, { cx: x2, cy: F, width: y, height: k, ...j, fill: `url(#${L})`, mask: `url(#${J})` }));
  return [O, MA];
}
function Ol(A, e, t, r) {
  if (!t)
    return A;
  let n = e.at(-1);
  return !n || !n.offset || n.offset.unit === "%" ? A : tA(`${n.offset.value}${n.offset.unit}`, +r.fontSize, A, r, true);
}
function Tl(A, e, t, r, n, i) {
  let o = { x: t / 2, y: r / 2 };
  return A.type === "keyword" ? Object.assign(o, Ia(A.value, t, r, "x")) : o.x = tA(`${A.value.value}${A.value.unit}`, n, t, i, true) ?? t / 2, e.type === "keyword" ? Object.assign(o, Ia(e.value, t, r, "y")) : o.y = tA(`${e.value.value}${e.value.unit}`, n, r, i, true) ?? r / 2, o;
}
function Ia(A, e, t, r) {
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
function Pl(A, e, t, [r, n], i, o, a) {
  let { r: u2, rx: l2, ratio: I = 1 } = a;
  if (!o)
    return { spreadMethod: "pad" };
  let E = t.at(-1), C = A === "circle" ? u2 * 2 : l2 * 2;
  return { spreadMethod: "repeat", cx: "50%", cy: "50%", r: E.offset.unit === "%" ? `${Number(E.offset.value) * Math.min(n / r, 1) / I}%` : Number(tA(`${E.offset.value}${E.offset.unit}`, e, r, i, true) / C) };
}
function _l(A, e, t, r, n, i, o) {
  let [a, u2] = n, { x: l2, y: I } = r, E = {}, C = 0, d2 = 0;
  if (Jl(e)) {
    if (e.some((p) => p.value.value.startsWith("-")))
      throw new Error("disallow setting negative values to the size of the shape. Check https://w3c.github.io/csswg-drafts/css-images/#valdef-rg-size-length-0");
    return A === "circle" ? Object.assign(E, { r: Number(tA(`${e[0].value.value}${e[0].value.unit}`, t, a, i, true)) }) : Object.assign(E, { rx: Number(tA(`${e[0].value.value}${e[0].value.unit}`, t, a, i, true)), ry: Number(tA(`${e[1].value.value}${e[1].value.unit}`, t, u2, i, true)) }), sn(E, a, u2, l2, I, o, A), E;
  }
  switch (e[0].value) {
    case "farthest-corner":
      C = Math.max(Math.abs(a - l2), Math.abs(l2)), d2 = Math.max(Math.abs(u2 - I), Math.abs(I));
      break;
    case "closest-corner":
      C = Math.min(Math.abs(a - l2), Math.abs(l2)), d2 = Math.min(Math.abs(u2 - I), Math.abs(I));
      break;
    case "farthest-side":
      return A === "circle" ? E.r = Math.max(Math.abs(a - l2), Math.abs(l2), Math.abs(u2 - I), Math.abs(I)) : (E.rx = Math.max(Math.abs(a - l2), Math.abs(l2)), E.ry = Math.max(Math.abs(u2 - I), Math.abs(I))), sn(E, a, u2, l2, I, o, A), E;
    case "closest-side":
      return A === "circle" ? E.r = Math.min(Math.abs(a - l2), Math.abs(l2), Math.abs(u2 - I), Math.abs(I)) : (E.rx = Math.min(Math.abs(a - l2), Math.abs(l2)), E.ry = Math.min(Math.abs(u2 - I), Math.abs(I))), sn(E, a, u2, l2, I, o, A), E;
  }
  return A === "circle" ? E.r = Math.sqrt(C * C + d2 * d2) : Object.assign(E, ca(C, d2)), sn(E, a, u2, l2, I, o, A), E;
}
function sn(A, e, t, r, n, i, o) {
  if (i)
    if (o === "ellipse") {
      let a = Math.max(Math.abs(e - r), Math.abs(r)), u2 = Math.max(Math.abs(t - n), Math.abs(n)), { rx: l2, ry: I } = ca(a, u2);
      A.ratio = Math.max(l2 / A.rx, I / A.ry), A.ratio > 1 && (A.rx *= A.ratio, A.ry *= A.ratio);
    } else {
      let a = Math.max(Math.abs(e - r), Math.abs(r)), u2 = Math.max(Math.abs(t - n), Math.abs(n)), l2 = Math.sqrt(a * a + u2 * u2);
      A.ratio = l2 / A.r, A.ratio > 1 && (A.r = l2);
    }
}
function ca(A, e) {
  let t = e !== 0 ? A / e : 1;
  if (A === 0)
    return { rx: 0, ry: 0 };
  {
    let r = Math.sqrt(A * A + e * e * t * t) / t;
    return { ry: r, rx: r * t };
  }
}
function Jl(A) {
  return !A.some((e) => e.type === "keyword");
}
function Bi(A, e) {
  return typeof A == "string" && A.endsWith("%") ? e * parseFloat(A) / 100 : +A;
}
function Wl(A, e, t, r, n) {
  if (!r || !n)
    return [e, t];
  if (A === "cover") {
    let i = e / r, o = t / n, a = Math.max(i, o);
    return [r * a, n * a];
  }
  if (A === "contain") {
    let i = e / r, o = t / n, a = Math.min(i, o);
    return [r * a, n * a];
  }
  if (A === "auto" || A.includes("auto")) {
    let i = A.split(" "), o = i[0] || "auto", a = i[1] || i[0] || "auto", u2 = r, l2 = n;
    if (o === "auto" && a !== "auto") {
      let I = Bi(a, t);
      l2 = I, u2 = r / n * I;
    } else if (a === "auto" && o !== "auto") {
      let I = Bi(o, e);
      u2 = I, l2 = n / r * I;
    }
    return [u2, l2];
  }
  return [e, t];
}
function fi(A, { x: e, y: t, defaultX: r, defaultY: n }) {
  return (A ? A.split(" ").map((i) => {
    try {
      let o = new He(i);
      return o.type === "length" || o.type === "number" ? o.value : o.value + o.unit;
    } catch {
      return null;
    }
  }).filter((i) => i !== null) : [r, n]).map((i, o) => Bi(i, [e, t][o]));
}
async function $t({ id: A, width: e, height: t, left: r, top: n }, { image: i, size: o, position: a, repeat: u2 }, l2, I) {
  u2 = u2 || "repeat", I = I || "background";
  let E = u2 === "repeat-x" || u2 === "repeat", C = u2 === "repeat-y" || u2 === "repeat", d2 = o && (o === "cover" || o === "contain" || o === "auto" || o.includes("auto")), p = i.startsWith("linear-gradient(") || i.startsWith("repeating-linear-gradient(") || i.startsWith("radial-gradient(") || i.startsWith("repeating-radial-gradient("), y = d2 && p ? [e, t] : d2 ? [0, 0] : fi(o, { x: e, y: t, defaultX: e, defaultY: t }), k = fi(a, { x: e, y: t, defaultX: 0, defaultY: 0 });
  if (i.startsWith("linear-gradient(") || i.startsWith("repeating-linear-gradient("))
    return ua({ id: A, width: e, height: t, repeatX: E, repeatY: C }, i, y, k, l2, I);
  if (i.startsWith("radial-gradient(") || i.startsWith("repeating-radial-gradient("))
    return la({ id: A, width: e, height: t, repeatX: E, repeatY: C }, i, y, k, l2, I);
  if (i.startsWith("url(")) {
    let [x2, F, b] = await Gt(i.slice(4, -1)), v2, M;
    if (d2) {
      let [L, O] = Wl(o, e, t, F, b);
      v2 = L, M = O;
    } else {
      let L = fi(o, { x: e, y: t, defaultX: 0, defaultY: 0 });
      v2 = I === "mask" ? F || L[0] : L[0] || F, M = I === "mask" ? b || L[1] : L[1] || b;
    }
    return [`satori_bi${A}`, H("pattern", { id: `satori_bi${A}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: k[0] + r, y: k[1] + n, width: E ? v2 : "100%", height: C ? M : "100%" }, H("image", { x: 0, y: 0, width: v2, height: M, preserveAspectRatio: "none", href: x2 }))];
  }
  if (index_esm_default(i)) {
    let x2 = index_esm_default(i), [F, b, v2, M] = x2.values, O = `rgba(${F},${b},${v2},${M !== void 0 ? M : 1})`;
    return [`satori_bi${A}`, H("pattern", { id: `satori_bi${A}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: r, y: n, width: e, height: t }, H("rect", { x: 0, y: 0, width: e, height: t, fill: O }))];
  }
  throw new Error(`Invalid background image: "${i}"`);
}
function Kl([A, e]) {
  return Math.round(A * 1e3) === 0 && Math.round(e * 1e3) === 0 ? 0 : Math.round(A * e / Math.sqrt(A * A + e * e) * 1e3) / 1e3;
}
function an(A, e, t) {
  return t < A + e && (t / 2 < A && t / 2 < e ? A = e = t / 2 : t / 2 < A ? A = t - e : t / 2 < e && (e = t - A)), [A, e];
}
function gn(A) {
  A[0] = A[1] = Math.min(A[0], A[1]);
}
function un(A, e, t, r, n) {
  if (typeof A == "string") {
    let i = A.split(" ").map((a) => a.trim()), o = !i[1] && !i[0].endsWith("%");
    return i[1] = i[1] || i[0], [o, [Math.min(tA(i[0], r, e, n, true), e), Math.min(tA(i[1], r, t, n, true), t)]];
  }
  return typeof A == "number" ? [true, [Math.min(A, e), Math.min(A, t)]] : [true, void 0];
}
var In = (A) => A && A[0] !== 0 && A[1] !== 0;
function Ba({ id: A, borderRadiusPath: e, borderType: t, left: r, top: n, width: i, height: o }, a) {
  let u2 = `satori_brc-${A}`;
  return [H("clipPath", { id: u2 }, H(t, { x: r, y: n, width: i, height: o, d: e || void 0 })), u2];
}
function it({ left: A, top: e, width: t, height: r }, n, i) {
  let { borderTopLeftRadius: o, borderTopRightRadius: a, borderBottomLeftRadius: u2, borderBottomRightRadius: l2, fontSize: I } = n, E, C, d2, p;
  if ([E, o] = un(o, t, r, I, n), [C, a] = un(a, t, r, I, n), [d2, u2] = un(u2, t, r, I, n), [p, l2] = un(l2, t, r, I, n), !i && !In(o) && !In(a) && !In(u2) && !In(l2))
    return "";
  o ||= [0, 0], a ||= [0, 0], u2 ||= [0, 0], l2 ||= [0, 0], [o[0], a[0]] = an(o[0], a[0], t), [u2[0], l2[0]] = an(u2[0], l2[0], t), [o[1], u2[1]] = an(o[1], u2[1], r), [a[1], l2[1]] = an(a[1], l2[1], r), E && gn(o), C && gn(a), d2 && gn(u2), p && gn(l2);
  let y = [];
  y[0] = [a, a], y[1] = [l2, [-l2[0], l2[1]]], y[2] = [u2, [-u2[0], -u2[1]]], y[3] = [o, [o[0], -o[1]]];
  let k = `h${t - o[0] - a[0]} a${y[0][0]} 0 0 1 ${y[0][1]}`, x2 = `v${r - a[1] - l2[1]} a${y[1][0]} 0 0 1 ${y[1][1]}`, F = `h${l2[0] + u2[0] - t} a${y[2][0]} 0 0 1 ${y[2][1]}`, b = `v${u2[1] + o[1] - r} a${y[3][0]} 0 0 1 ${y[3][1]}`;
  if (i) {
    let M = function(dA) {
      let sA = Kl([o, a, l2, u2][dA]);
      return dA === 0 ? [[A + o[0] - sA, e + o[1] - sA], [A + o[0], e]] : dA === 1 ? [[A + t - a[0] + sA, e + a[1] - sA], [A + t, e + a[1]]] : dA === 2 ? [[A + t - l2[0] + sA, e + r - l2[1] + sA], [A + t - l2[0], e + r]] : [[A + u2[0] - sA, e + r - u2[1] + sA], [A, e + r - u2[1]]];
    }, v2 = i.indexOf(false);
    if (!i.includes(true))
      throw new Error("Invalid `partialSides`.");
    if (v2 === -1)
      v2 = 0;
    else
      for (; !i[v2]; )
        v2 = (v2 + 1) % 4;
    let L = "", O = M(v2), J = `M${O[0]} A${y[(v2 + 3) % 4][0]} 0 0 1 ${O[1]}`, j = 0;
    for (; j < 4 && i[(v2 + j) % 4]; j++)
      L += J + " ", J = [k, x2, F, b][(v2 + j) % 4];
    let CA = (v2 + j) % 4;
    L += J.split(" ")[0];
    let MA = M(CA);
    return L += ` A${y[(CA + 3) % 4][0]} 0 0 1 ${MA[0]}`, L;
  }
  return `M${A + o[0]},${e} ${k} ${x2} ${F} ${b}`;
}
function Ea(A, e, t) {
  return t[A + "Width"] === t[e + "Width"] && t[A + "Style"] === t[e + "Style"] && t[A + "Color"] === t[e + "Color"];
}
function Qa({ id: A, currentClipPathId: e, borderPath: t, borderType: r, left: n, top: i, width: o, height: a }, u2) {
  if (!(u2.borderTopWidth || u2.borderRightWidth || u2.borderBottomWidth || u2.borderLeftWidth))
    return null;
  let I = `satori_bc-${A}`;
  return [H("clipPath", { id: I, "clip-path": e ? `url(#${e})` : void 0 }, H(r, { x: n, y: i, width: o, height: a, d: t || void 0 })), I];
}
function Ar({ left: A, top: e, width: t, height: r, props: n, asContentMask: i, maskBorderOnly: o }, a) {
  let u2 = ["borderTop", "borderRight", "borderBottom", "borderLeft"];
  if (!i && !u2.some((d2) => a[d2 + "Width"]))
    return "";
  let l2 = "", I = 0;
  for (; I > 0 && Ea(u2[I], u2[(I + 3) % 4], a); )
    I = (I + 3) % 4;
  let E = [false, false, false, false], C = [];
  for (let d2 = 0; d2 < 4; d2++) {
    let p = (I + d2) % 4, y = (I + d2 + 1) % 4, k = u2[p], x2 = u2[y];
    if (E[p] = true, C = [a[k + "Width"], a[k + "Style"], a[k + "Color"], k], !Ea(k, x2, a)) {
      let F = (C[0] || 0) + (i && !o && a[k.replace("border", "padding")] || 0);
      F && (l2 += H("path", { width: t, height: r, ...n, fill: "none", stroke: i ? "#000" : C[2], "stroke-width": F * 2, "stroke-dasharray": !i && C[1] === "dashed" ? F * 2 + " " + F : void 0, d: it({ left: A, top: e, width: t, height: r }, a, E) })), E = [false, false, false, false];
    }
  }
  if (E.some(Boolean)) {
    let d2 = (C[0] || 0) + (i && !o && a[C[3].replace("border", "padding")] || 0);
    d2 && (l2 += H("path", { width: t, height: r, ...n, fill: "none", stroke: i ? "#000" : C[2], "stroke-width": d2 * 2, "stroke-dasharray": !i && C[1] === "dashed" ? d2 * 2 + " " + d2 : void 0, d: it({ left: A, top: e, width: t, height: r }, a, E) }));
  }
  return l2;
}
function Ei({ id: A, left: e, top: t, width: r, height: n, matrix: i, borderOnly: o }, a) {
  let u2 = (a.borderLeftWidth || 0) + (o ? 0 : a.paddingLeft || 0), l2 = (a.borderTopWidth || 0) + (o ? 0 : a.paddingTop || 0), I = (a.borderRightWidth || 0) + (o ? 0 : a.paddingRight || 0), E = (a.borderBottomWidth || 0) + (o ? 0 : a.paddingBottom || 0), C = { x: e + u2, y: t + l2, width: r - u2 - I, height: n - l2 - E };
  return H("mask", { id: A }, H("rect", { ...C, fill: "#fff", transform: a.overflow === "hidden" && a.transform && i ? i : void 0, mask: a._inheritedMaskId ? `url(#${a._inheritedMaskId})` : void 0 }) + Ar({ left: e, top: t, width: r, height: n, props: { transform: i || void 0 }, asContentMask: true, maskBorderOnly: o }, a));
}
var er = { circle: /circle\((.+)\)/, ellipse: /ellipse\((.+)\)/, path: /path\((.+)\)/, polygon: /polygon\((.+)\)/, inset: /inset\((.+)\)/ };
function pa({ width: A, height: e }, t, r) {
  function n(l2) {
    let I = l2.match(er.circle);
    if (!I)
      return null;
    let [, E] = I, [C, d2 = ""] = E.split("at").map((k) => k.trim()), { x: p, y } = ha(d2, A, e);
    return { type: "circle", r: tA(C, r.fontSize, Math.sqrt(Math.pow(A, 2) + Math.pow(e, 2)) / Math.sqrt(2), r, true), cx: tA(p, r.fontSize, A, r, true), cy: tA(y, r.fontSize, e, r, true) };
  }
  function i(l2) {
    let I = l2.match(er.ellipse);
    if (!I)
      return null;
    let [, E] = I, [C, d2 = ""] = E.split("at").map((F) => F.trim()), [p, y] = C.split(" "), { x: k, y: x2 } = ha(d2, A, e);
    return { type: "ellipse", rx: tA(p || "50%", r.fontSize, A, r, true), ry: tA(y || "50%", r.fontSize, e, r, true), cx: tA(k, r.fontSize, A, r, true), cy: tA(x2, r.fontSize, e, r, true) };
  }
  function o(l2) {
    let I = l2.match(er.path);
    if (!I)
      return null;
    let [E, C] = da(I[1]);
    return { type: "path", d: C, "fill-rule": E };
  }
  function a(l2) {
    let I = l2.match(er.polygon);
    if (!I)
      return null;
    let [E, C] = da(I[1]);
    return { type: "polygon", "fill-rule": E, points: C.split(",").map((d2) => d2.split(" ").map((p, y) => tA(p, r.fontSize, y === 0 ? A : e, r, true)).join(" ")).join(",") };
  }
  function u2(l2) {
    let I = l2.match(er.inset);
    if (!I)
      return null;
    let [E, C] = (I[1].includes("round") ? I[1] : `${I[1].trim()} round 0`).split("round"), d2 = (0, import_css_to_react_native3.getStylesForProperty)("borderRadius", C, true), p = Object.values(d2).map((v2) => String(v2)).map((v2, M) => tA(v2, r.fontSize, M === 0 || M === 2 ? e : A, r, true) || 0), y = Object.values((0, import_css_to_react_native3.getStylesForProperty)("margin", E, true)).map((v2) => String(v2)).map((v2, M) => tA(v2, r.fontSize, M === 0 || M === 2 ? e : A, r, true) || 0), k = y[3], x2 = y[0], F = A - (y[1] + y[3]), b = e - (y[0] + y[2]);
    return p.some((v2) => v2 > 0) ? { type: "path", d: it({ left: k, top: x2, width: F, height: b }, { ...t, ...d2 }) } : { type: "rect", x: k, y: x2, width: F, height: b };
  }
  return { parseCircle: n, parseEllipse: i, parsePath: o, parsePolygon: a, parseInset: u2 };
}
function da(A) {
  let [, e = "nonzero", t] = A.replace(/('|")/g, "").match(/^(nonzero|evenodd)?,?(.+)/) || [];
  return [e, t];
}
function ha(A, e, t) {
  let r = A.split(" "), n = { x: r[0] || "50%", y: r[1] || "50%" };
  return r.forEach((i) => {
    i === "top" ? n.y = 0 : i === "bottom" ? n.y = t : i === "left" ? n.x = 0 : i === "right" ? n.x = e : i === "center" && (n.x = e / 2, n.y = t / 2);
  }), n;
}
function ln(A) {
  return `satori_cp-${A}`;
}
function ma(A) {
  return `url(#${ln(A)})`;
}
function ya(A, e, t) {
  if (e.clipPath === "none")
    return "";
  let r = pa(A, e, t), n = e.clipPath, i = { type: "" };
  for (let o of Object.keys(r))
    if (i = r[o](n), i)
      break;
  if (i) {
    let { type: o, ...a } = i;
    return H("clipPath", { id: ln(A.id), "clip-path": A.currentClipPath, transform: `translate(${A.left}, ${A.top})` }, H(o, a));
  }
  return "";
}
function Qi({ left: A, top: e, width: t, height: r, path: n, matrix: i, id: o, currentClipPath: a, src: u2 }, l2, I) {
  let E = "", C = l2.clipPath && l2.clipPath !== "none" ? ya({ left: A, top: e, width: t, height: r, path: n, id: o, matrix: i, currentClipPath: a, src: u2 }, l2, I) : "";
  if (l2.overflow !== "hidden" && !u2)
    E = "";
  else {
    let p = C ? `satori_ocp-${o}` : ln(o);
    E = H("clipPath", { id: p, "clip-path": a }, H(n ? "path" : "rect", { x: A, y: e, width: t, height: r, d: n || void 0, transform: l2.overflow === "hidden" && l2.transform && i ? i : void 0 }));
  }
  let d2 = Ei({ id: `satori_om-${o}`, left: A, top: e, width: t, height: r, matrix: i, borderOnly: !u2 }, l2);
  return C + E + d2;
}
var Yl = (A) => `satori_mi-${A}`;
async function Ci(A, e, t) {
  if (!e.maskImage)
    return ["", ""];
  let { left: r, top: n, width: i, height: o, id: a } = A, u2 = e.maskImage, l2 = u2.length;
  if (!l2)
    return ["", ""];
  let I = Yl(a), E = "";
  for (let C = 0; C < l2; C++) {
    let d2 = u2[C], [p, y] = await $t({ id: `${I}-${C}`, left: r, top: n, width: i, height: o }, d2, t, "mask");
    E += y + H("rect", { x: r, y: n, width: i, height: o, fill: `url(#${p})` });
  }
  return E = H("mask", { id: I }, E), [I, E];
}
function ql(A, e, t) {
  let r = A.toLowerCase().trim().split(/\s+/), n = (u2, l2) => ({ left: "0%", center: "50%", right: "100%", top: "0%", bottom: "100%" })[u2] || u2, i, o;
  if (r.length === 1) {
    let u2 = r[0];
    u2 === "left" || u2 === "center" || u2 === "right" ? (i = n(u2, "x"), o = "50%") : u2 === "top" || u2 === "bottom" ? (i = "50%", o = n(u2, "y")) : (i = u2, o = "50%");
  } else {
    let u2 = r[0], l2 = r[1];
    u2 === "top" || u2 === "bottom" ? (o = n(u2, "y"), l2 === "left" || l2 === "right" || l2 === "center" ? i = n(l2, "x") : (i = "50%", o = u2 === "top" || u2 === "bottom" ? n(u2, "y") : l2)) : (i = n(u2, "x"), o = n(l2, "y"));
  }
  let a = (u2, l2) => {
    try {
      if (u2.endsWith("%"))
        return l2 * parseFloat(u2) / 100;
      let I = new He(u2);
      return I.type === "length" || I.type === "number" ? I.value : 0;
    } catch {
      return 0;
    }
  };
  return [a(i, e), a(o, t)];
}
async function tr({ id: A, left: e, top: t, width: r, height: n, isInheritingTransform: i, src: o, debug: a }, u2, l2) {
  if (u2.display === "none")
    return "";
  let I = !!o, E = "rect", C = "", d2 = "", p = [], y = 1, k = "";
  u2.backgroundColor && p.push(u2.backgroundColor), u2.opacity !== void 0 && (y = +u2.opacity), u2.transform && (C = jt({ left: e, top: t, width: r, height: n }, u2.transform, i, u2.transformOrigin));
  let x2 = "";
  if (u2.backgroundImage) {
    let rA = [];
    for (let iA = 0; iA < u2.backgroundImage.length; iA++) {
      let wA = u2.backgroundImage[iA], aA = await $t({ id: A + "_" + iA, width: r, height: n, left: e, top: t }, wA, l2);
      aA && rA.unshift(aA);
    }
    for (let iA of rA)
      p.push(`url(#${iA[0]})`), d2 += iA[1], iA[2] && (x2 += iA[2]);
  }
  let [F, b] = await Ci({ id: A, left: e, top: t, width: r, height: n }, u2, l2);
  d2 += b;
  let v2 = F ? `url(#${F})` : u2._inheritedMaskId ? `url(#${u2._inheritedMaskId})` : void 0, M = it({ left: e, top: t, width: r, height: n }, u2);
  M && (E = "path");
  let L = u2._inheritedClipPathId;
  a && (k = H("rect", { x: e, y: t, width: r, height: n, fill: "transparent", stroke: "#ff5757", "stroke-width": 1, transform: C || void 0, "clip-path": L ? `url(#${L})` : void 0 }));
  let { backgroundClip: O, filter: J } = u2, j = O === "text" ? `url(#satori_bct-${A})` : L ? `url(#${L})` : u2.clipPath ? ma(A) : void 0, CA = Qi({ left: e, top: t, width: r, height: n, path: M, id: A, matrix: C, currentClipPath: j, src: o }, u2, l2), MA = p.map((rA) => H(E, { x: e, y: t, width: r, height: n, fill: rA, d: M || void 0, transform: C || void 0, "clip-path": u2.transform ? void 0 : j, style: J ? `filter:${J}` : void 0, mask: u2.transform ? void 0 : v2 })).join(""), dA = Qa({ id: A, left: e, top: t, width: r, height: n, currentClipPathId: L, borderPath: M, borderType: E }, u2), sA;
  if (I) {
    let rA = (u2.borderLeftWidth || 0) + (u2.paddingLeft || 0), iA = (u2.borderTopWidth || 0) + (u2.paddingTop || 0), wA = (u2.borderRightWidth || 0) + (u2.paddingRight || 0), aA = (u2.borderBottomWidth || 0) + (u2.paddingBottom || 0), FA = r - rA - wA, kA = n - iA - aA, te = (u2.objectPosition || "center").toString(), [TA, xA] = ql(te, FA, kA), fA = u2.__naturalWidth || FA, q = u2.__naturalHeight || kA, oA, BA = FA, W = kA, Y = e + rA, OA = t + iA;
    if (u2.objectFit === "contain") {
      let PA = FA / fA, WA = kA / q, uA = Math.min(PA, WA);
      BA = fA * uA, W = q * uA, Y = e + rA + TA - BA * TA / FA, OA = t + iA + xA - W * xA / kA, oA = "none";
    } else if (u2.objectFit === "cover") {
      let PA = FA / fA, WA = kA / q, uA = Math.max(PA, WA);
      BA = fA * uA, W = q * uA, Y = e + rA + TA - BA * TA / FA, OA = t + iA + xA - W * xA / kA, oA = "none";
    } else if (u2.objectFit === "fill")
      oA = "none";
    else if (u2.objectFit === "scale-down")
      if (fA && q) {
        let PA = FA / fA, WA = kA / q, uA = Math.min(PA, WA);
        if (uA >= 1)
          BA = fA, W = q, oA = "none", Y = e + rA + TA - BA * TA / FA, OA = t + iA + xA - W * xA / kA;
        else {
          let hA = uA;
          BA = fA * hA, W = q * hA, Y = e + rA + TA - BA * TA / FA, OA = t + iA + xA - W * xA / kA, oA = "none";
        }
      } else {
        let PA = FA / fA, WA = kA / q, uA = Math.min(PA, WA);
        BA = fA * uA, W = q * uA, Y = e + rA + TA - BA * TA / FA, OA = t + iA + xA - W * xA / kA, oA = "none";
      }
    else
      oA = "none";
    u2.transform && (sA = Ba({ id: A, borderRadiusPath: M, borderType: E, left: e, top: t, width: r, height: n }, u2)), MA += H("image", { x: Y, y: OA, width: BA, height: W, href: o, preserveAspectRatio: oA, transform: C || void 0, style: J ? `filter:${J}` : void 0, "clip-path": u2.transform ? sA ? `url(#${sA[1]})` : void 0 : `url(#satori_cp-${A})`, mask: u2.transform ? void 0 : F ? `url(#${F})` : `url(#satori_om-${A})` });
  }
  if (dA) {
    d2 += dA[0];
    let rA = dA[1];
    MA += Ar({ left: e, top: t, width: r, height: n, props: { transform: C || void 0, "clip-path": `url(#${rA})` } }, u2);
  }
  let vA = ia({ width: r, height: n, id: A, opacity: y, shape: H(E, { x: e, y: t, width: r, height: n, fill: "#fff", stroke: "#fff", "stroke-width": 0, d: M || void 0, transform: C || void 0, "clip-path": j, mask: v2 }) }, u2);
  return (d2 ? H("defs", {}, d2) : "") + (vA ? vA[0] : "") + (sA ? sA[0] : "") + CA + (y !== 1 ? `<g opacity="${y}">` : "") + (u2.transform && (j || v2) ? `<g${j ? ` clip-path="${j}"` : ""}${v2 ? ` mask="${v2}"` : ""}>` : "") + (x2 || MA) + (u2.transform && (j || v2) ? "</g>" : "") + (y !== 1 ? "</g>" : "") + (vA ? vA[1] : "") + k;
}
var Da = String.raw;
var wa = Da`\p{Emoji}(?:\p{EMod}|[\u{E0020}-\u{E007E}]+\u{E007F}|\uFE0F?\u20E3?)`;
var Sa = () => new RegExp(Da`\p{RI}{2}|(?![#*\d](?!\uFE0F?\u20E3))${wa}(?:\u200D${wa})*`, "gu");
var Xl = new RegExp(Sa(), "u");
var di = { emoji: Xl, symbol: /\p{Symbol}/u, math: /\p{Math}/u };
var hi = { "ja-JP": /\p{scx=Hira}|\p{scx=Kana}|\p{scx=Han}|[\u3000]|[\uFF00-\uFFEF]/u, "ko-KR": /\p{scx=Hangul}/u, "zh-CN": /\p{scx=Han}/u, "zh-TW": /\p{scx=Han}/u, "zh-HK": /\p{scx=Han}/u, "th-TH": /\p{scx=Thai}/u, "bn-IN": /\p{scx=Bengali}/u, "ar-AR": /\p{scx=Arabic}/u, "ta-IN": /\p{scx=Tamil}/u, "ml-IN": /\p{scx=Malayalam}/u, "he-IL": /\p{scx=Hebrew}/u, "te-IN": /\p{scx=Telugu}/u, devanagari: /\p{scx=Devanagari}/u, kannada: /\p{scx=Kannada}/u };
var cn = Object.keys({ ...hi, ...di });
function ba(A) {
  return cn.includes(A);
}
function va(A, e) {
  for (let r of Object.keys(di))
    if (di[r].test(A))
      return [r];
  let t = Object.keys(hi).filter((r) => hi[r].test(A));
  if (t.length === 0)
    return ["unknown"];
  if (e) {
    let r = t.findIndex((n) => n === e);
    r !== -1 && (t.splice(r, 1), t.unshift(e));
  }
  return t;
}
function ka(A) {
  if (A)
    return cn.find((e) => e.toLowerCase().startsWith(A.toLowerCase()));
}
async function* rr(A, e) {
  var fA;
  let t = await rt(), { id: r, inheritedStyle: n, parent: i, font: o, debug: a, locale: u2, embedFont: l2 = true, graphemeImages: I, canLoadAdditionalAssets: E, getTwStyles: C } = e;
  if (A === null || typeof A > "u")
    return yield, yield, "";
  if (!Rt(A) || ds(A.type)) {
    let q;
    if (!Rt(A))
      q = ci(String(A), e), yield (await q.next()).value;
    else {
      if (Cs(A.type))
        throw new Error("Class component is not supported.");
      let BA;
      Tn(A.type) ? BA = A.type.render : BA = A.type, q = rr(await BA(A.props), e), yield (await q.next()).value;
    }
    await q.next();
    let oA = yield;
    return (await q.next(oA)).value;
  }
  let { type: d2, props: p } = A, y = d2;
  if (p && hs(p))
    throw new Error("dangerouslySetInnerHTML property is not supported. See documentation for more information https://github.com/vercel/satori#jsx.");
  let { style: k, children: x2, tw: F, lang: b = u2 } = p || {}, v2 = ka(b);
  if (F) {
    let q = C(F, k);
    k = Object.assign(q, k);
  }
  let M = t.Node.create();
  i.insertChild(M, i.getChildCount());
  let [L, O] = await si(M, y, n, k, p), J = L.transform === n.transform;
  if (J || (L.transform.__parent = n.transform), (L.overflow === "hidden" || L.clipPath && L.clipPath !== "none") && (O._inheritedClipPathId = `satori_cp-${r}`, O._inheritedMaskId = `satori_om-${r}`), L.maskImage && (O._inheritedMaskId = `satori_mi-${r}`), L.backgroundClip === "text") {
    let q = { value: "" };
    O._inheritedBackgroundClipTextPath = q, L._inheritedBackgroundClipTextPath = q, L.backgroundImage && (O._inheritedBackgroundClipTextHasBackground = "true", L._inheritedBackgroundClipTextHasBackground = "true");
  }
  let j = ps(x2), CA = [], MA = 0, dA = [];
  for (let q of j) {
    let oA = rr(q, { id: r + "-" + MA++, parentStyle: L, inheritedStyle: O, isInheritingTransform: true, parent: M, font: o, embedFont: l2, debug: a, graphemeImages: I, canLoadAdditionalAssets: E, locale: v2, getTwStyles: C, onNodeDetected: e.onNodeDetected });
    E ? dA.push(...(await oA.next()).value || []) : await oA.next(), CA.push(oA);
  }
  yield dA;
  for (let q of CA)
    await q.next();
  let [sA, vA] = yield, { left: rA, top: iA, width: wA, height: aA } = M.getComputedLayout();
  rA += sA, iA += vA;
  let FA = "", kA = "", te = "", { children: TA, ...xA } = p;
  if ((fA = e.onNodeDetected) == null || fA.call(e, { left: rA, top: iA, width: wA, height: aA, type: y, props: xA, key: A.key, textContent: Rt(TA) ? void 0 : TA }), y === "img") {
    let q = L.__src;
    kA = await tr({ id: r, left: rA, top: iA, width: wA, height: aA, src: q, isInheritingTransform: J, debug: a }, L, O);
  } else if (y === "svg") {
    let q = L.color, oA = await Ks(A, q);
    kA = await tr({ id: r, left: rA, top: iA, width: wA, height: aA, src: oA, isInheritingTransform: J, debug: a }, L, O);
  } else {
    let q = k == null ? void 0 : k.display;
    if (y === "div" && x2 && typeof x2 != "string" && q !== "flex" && q !== "none" && q !== "contents")
      throw new Error('Expected <div> to have explicit "display: flex", "display: contents", or "display: none" if it has more than one child node.');
    kA = await tr({ id: r, left: rA, top: iA, width: wA, height: aA, isInheritingTransform: J, debug: a }, L, O);
  }
  for (let q of CA)
    FA += (await q.next([rA, iA])).value;
  return L._inheritedBackgroundClipTextPath && (te += H("clipPath", { id: `satori_bct-${r}`, "clip-path": L._inheritedClipPathId ? `url(#${L._inheritedClipPathId})` : void 0 }, L._inheritedBackgroundClipTextPath.value)), te + kA + FA;
}
var xa = "unknown";
function Vl(A) {
  let e = [], t = [0, 0], r = [0, 0], n = (i, o) => {
    let a = i[0];
    for (let u2 = 1; u2 <= o; u2++) {
      let l2 = u2 / o, I = zl(i, l2);
      e.push({ from: a, to: I }), a = I;
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
function zl(A, e) {
  let t = A;
  for (; t.length > 1; ) {
    let r = [];
    for (let n = 0; n < t.length - 1; n++)
      r.push([t[n][0] + (t[n + 1][0] - t[n][0]) * e, t[n][1] + (t[n + 1][1] - t[n][1]) * e]);
    t = r;
  }
  return t[0];
}
function Zl(A, e) {
  if (!e)
    return [];
  let t = e.strokeWidth, r = e.underlineY - t * 0.25, n = e.underlineY + t * 2.5, i = Vl(A);
  if (!i.length)
    return [];
  let o = n - r, a = Math.max(12, Math.ceil(o / 0.25)), u2 = o / a, l2 = r + u2 / 2, I = /* @__PURE__ */ new Set();
  for (let b = 0; b < a; b++) {
    let v2 = l2 + u2 * b, M = [];
    for (let L of i) {
      let [O, J] = L.from, [j, CA] = L.to;
      if (J === CA)
        continue;
      let MA = Math.min(J, CA), dA = Math.max(J, CA);
      if (v2 < MA || v2 >= dA)
        continue;
      let sA = (v2 - J) / (CA - J), vA = O + (j - O) * sA;
      M.push(vA);
    }
    if (M.length) {
      M.sort((L, O) => L - O);
      for (let L = 0; L < M.length - 1; L += 2) {
        let O = Math.min(M[L], M[L + 1]), J = Math.max(M[L], M[L + 1]), j = Math.floor(O), CA = Math.ceil(J);
        for (let MA = j; MA < CA; MA++)
          I.add(MA);
      }
    }
  }
  if (!I.size)
    return [];
  let E = Array.from(I.values()).sort((b, v2) => b - v2), C = [], d2 = E[0], p = E[0];
  for (let b = 1; b < E.length; b++) {
    let v2 = E[b];
    v2 > p + 1 && (C.push([d2, p + 1]), d2 = v2), p = v2;
  }
  C.push([d2, p + 1]);
  let y = [], k = t * 0.6, x2 = C[0][0], F = C[C.length - 1][1];
  for (let [b, v2] of C) {
    let M = Math.min(b, x2) - k, L = Math.max(v2, F) + k;
    y.push({ x1: M, x2: L, y1: r, y2: n });
  }
  return y;
}
function jl(A, e, [t, r], [n, i]) {
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
var pi = /* @__PURE__ */ new WeakMap();
var ir = class {
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
      let [, a, u2] = i, [, l2, I] = n[o];
      jl(t, r, [a, u2], [l2, I]) > 0 && (i = n[o]);
    }
    return i[0];
  }
  addFonts(e) {
    for (let t of e) {
      let { name: r, data: n, lang: i } = t;
      if (i && !ba(i))
        throw new Error(`Invalid value for props \`lang\`: "${i}". The value must be one of the following: ${cn.join(", ")}.`);
      let o = i ?? xa, a;
      if (pi.has(n))
        a = pi.get(n);
      else {
        a = opentype_module_default.parse("buffer" in n ? n.buffer.slice(n.byteOffset, n.byteOffset + n.byteLength) : n, { lowMemory: true });
        let l2 = a.charToGlyphIndex;
        a.charToGlyphIndex = (I) => {
          let E = l2.call(a, I);
          return E === 0 && a._trackBrokenChars && a._trackBrokenChars.push(I), E;
        }, pi.set(n, a);
      }
      this.defaultFont || (this.defaultFont = a);
      let u2 = `${r.toLowerCase()}_${o}`;
      this.fonts.has(u2) || this.fonts.set(u2, []), this.fonts.get(u2).push([a, t.weight, t.style]);
    }
  }
  getEngine(e = 16, t = "normal", { fontFamily: r = "sans-serif", fontWeight: n = 400, fontStyle: i = "normal" }, o) {
    if (!this.fonts.size)
      throw new Error("No fonts are loaded. At least one font is required to calculate the layout.");
    r = (Array.isArray(r) ? r : [r]).map((b) => b.toLowerCase());
    let a = [];
    r.forEach((b) => {
      let v2 = this.get({ name: b, weight: n, style: i });
      if (v2) {
        a.push(v2);
        return;
      }
      let M = this.get({ name: b + "_unknown", weight: n, style: i });
      if (M) {
        a.push(M);
        return;
      }
    });
    let u2 = Array.from(this.fonts.keys()), l2 = [], I = [], E = [];
    for (let b of u2)
      if (!r.includes(b))
        if (o) {
          let v2 = $l(b);
          v2 ? v2 === o ? l2.push(this.get({ name: b, weight: n, style: i })) : I.push(this.get({ name: b, weight: n, style: i })) : E.push(this.get({ name: b, weight: n, style: i }));
        } else
          E.push(this.get({ name: b, weight: n, style: i }));
    let C = /* @__PURE__ */ new Map(), d2 = (b, v2 = true) => {
      let M = [...a, ...E, ...l2, ...v2 ? I : []];
      if (typeof b > "u")
        return v2 ? M[M.length - 1] : void 0;
      let L = b.charCodeAt(0);
      if (C.has(L))
        return C.get(L);
      let O = M.find((J, j) => !!J.charToGlyphIndex(b) || v2 && j === M.length - 1);
      return O && C.set(L, O), O;
    }, p = (b, v2 = false) => {
      var L, O;
      return ((v2 ? (O = (L = b.tables) == null ? void 0 : L.os2) == null ? void 0 : O.sTypoAscender : 0) || b.ascender) / b.unitsPerEm * e;
    }, y = (b, v2 = false) => {
      var L, O;
      return ((v2 ? (O = (L = b.tables) == null ? void 0 : L.os2) == null ? void 0 : O.sTypoDescender : 0) || b.descender) / b.unitsPerEm * e;
    }, k = (b, v2 = false) => {
      var M, L;
      if (typeof t == "string" && t === "normal") {
        let O = (v2 ? (L = (M = b.tables) == null ? void 0 : M.os2) == null ? void 0 : L.sTypoLineGap : 0) || 0;
        return p(b, v2) - y(b, v2) + O / b.unitsPerEm * e;
      } else if (typeof t == "number")
        return e * t;
    }, x2 = (b) => d2(b, false);
    return { has: (b) => {
      if (b === `
`)
        return true;
      let v2 = x2(b);
      return v2 ? (v2._trackBrokenChars = [], v2.stringToGlyphs(b), v2._trackBrokenChars.length ? (v2._trackBrokenChars = void 0, false) : true) : false;
    }, baseline: (b, v2 = typeof b > "u" ? a[0] : d2(b)) => {
      let M = p(v2), L = y(v2), O = M - L;
      return M + (k(v2) - O) / 2;
    }, height: (b, v2 = typeof b > "u" ? a[0] : d2(b)) => k(v2), measure: (b, v2) => this.measure(d2, b, v2), getSVG: (b, v2, M) => this.getSVG(d2, b, v2, M) };
  }
  patchFontFallbackResolver(e, t) {
    let r = [];
    e._trackBrokenChars = r;
    let n = e.stringToGlyphs;
    return e.stringToGlyphs = (i, ...o) => {
      let a = n.call(e, i, ...o);
      for (let u2 = 0; u2 < a.length; u2++)
        if (a[u2].unicode === void 0) {
          let l2 = r.shift(), I = t(l2);
          if (I !== e) {
            let E = I.charToGlyph(l2), C = e.unitsPerEm / I.unitsPerEm, d2 = new opentype_module_default.Path();
            d2.unitsPerEm = e.unitsPerEm, d2.commands = E.path.commands.map((y) => {
              let k = { ...y };
              for (let x2 in k)
                typeof k[x2] == "number" && (k[x2] *= C);
              return k;
            });
            let p = new opentype_module_default.Glyph({ ...E, advanceWidth: E.advanceWidth * C, xMin: E.xMin * C, xMax: E.xMax * C, yMin: E.yMin * C, yMax: E.yMax * C, path: d2 });
            a[u2] = p;
          }
        }
      return a;
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
  getSVG(e, t, { fontSize: r, top: n, left: i, letterSpacing: o = 0 }, a) {
    let u2 = e(t), l2 = this.patchFontFallbackResolver(u2, e);
    try {
      if (r === 0)
        return { path: "", boxes: [] };
      let I = new opentype_module_default.Path(), E = [], C = { letterSpacing: o / r }, d2 = /* @__PURE__ */ new WeakMap();
      return u2.forEachGlyph(t.replace(/\n/g, ""), i, n, r, C, function(p, y, k, x2) {
        let F;
        if (!d2.has(p))
          F = p.getPath(y, k, x2, C), d2.set(p, [y, k, F]);
        else {
          let [v2, M, L] = d2.get(p);
          F = new opentype_module_default.Path(), F.commands = L.commands.map((O) => {
            let J = { ...O };
            for (let j in J)
              typeof J[j] == "number" && ((j === "x" || j === "x1" || j === "x2") && (J[j] += y - v2), (j === "y" || j === "y1" || j === "y2") && (J[j] += k - M));
            return J;
          });
        }
        let b = a ? Zl(F.commands, a) : [];
        b.length && E.push(...b), I.extend(F);
      }), { path: I.toPathData(1), boxes: E };
    } finally {
      l2();
    }
  }
};
function $l(A) {
  let e = A.split("_"), t = e[e.length - 1];
  return t === xa ? void 0 : t;
}
function mi({ width: A, height: e, content: t }) {
  return H("svg", { width: A, height: e, viewBox: `0 0 ${A} ${e}`, xmlns: "http://www.w3.org/2000/svg" }, t);
}
var gI = CI(Tu());
var TC = ["ios", "android", "windows", "macos", "web"];
function _u(A) {
  return TC.includes(A);
}
var PC = ["portrait", "landscape"];
function Ju(A) {
  return PC.includes(A);
}
var Pu;
(function(A) {
  A.fontSize = "fontSize", A.lineHeight = "lineHeight";
})(Pu || (Pu = {}));
var QA;
(function(A) {
  A.rem = "rem", A.em = "em", A.px = "px", A.percent = "%", A.vw = "vw", A.vh = "vh", A.none = "<no-css-unit>";
})(QA || (QA = {}));
function Vo(A) {
  return typeof A == "string";
}
function zo(A) {
  return typeof A == "object";
}
var Zo;
function R2(A) {
  return { kind: "complete", style: A };
}
function VA(A, e = {}) {
  let { fractions: t } = e;
  if (t && A.includes("/")) {
    let [i = "", o = ""] = A.split("/", 2), a = VA(i), u2 = VA(o);
    return !a || !u2 ? null : [a[0] / u2[0], u2[1]];
  }
  let r = parseFloat(A);
  if (Number.isNaN(r))
    return null;
  let n = A.match(/(([a-z]{2,}|%))$/);
  if (!n)
    return [r, QA.none];
  switch (n == null ? void 0 : n[1]) {
    case "rem":
      return [r, QA.rem];
    case "px":
      return [r, QA.px];
    case "em":
      return [r, QA.em];
    case "%":
      return [r, QA.percent];
    case "vw":
      return [r, QA.vw];
    case "vh":
      return [r, QA.vh];
    default:
      return null;
  }
}
function At(A, e, t = {}) {
  let r = We(e, t);
  return r === null ? null : R2({ [A]: r });
}
function Rn(A, e, t) {
  let r = We(e);
  return r !== null && (t[A] = r), t;
}
function Ku(A, e) {
  let t = We(e);
  return t === null ? null : { [A]: t };
}
function We(A, e = {}) {
  if (A === void 0)
    return null;
  let t = VA(String(A), e);
  return t ? gt(...t, e) : null;
}
function gt(A, e, t = {}) {
  let { isNegative: r, device: n } = t;
  switch (e) {
    case QA.rem:
      return A * 16 * (r ? -1 : 1);
    case QA.px:
      return A * (r ? -1 : 1);
    case QA.percent:
      return `${r ? "-" : ""}${A}%`;
    case QA.none:
      return A * (r ? -1 : 1);
    case QA.vw:
      return n != null && n.windowDimensions ? n.windowDimensions.width * (A / 100) : (me("`vw` CSS unit requires configuration with `useDeviceContext()`"), null);
    case QA.vh:
      return n != null && n.windowDimensions ? n.windowDimensions.height * (A / 100) : (me("`vh` CSS unit requires configuration with `useDeviceContext()`"), null);
    default:
      return null;
  }
}
function jo(A) {
  let e = VA(A);
  if (!e)
    return null;
  let [t, r] = e;
  switch (r) {
    case QA.rem:
      return t * 16;
    case QA.px:
      return t;
    default:
      return null;
  }
}
var _C = { t: "Top", tr: "TopRight", tl: "TopLeft", b: "Bottom", br: "BottomRight", bl: "BottomLeft", l: "Left", r: "Right", x: "Horizontal", y: "Vertical" };
function $o(A) {
  return _C[A ?? ""] || "All";
}
function As(A) {
  let e = "All";
  return [A.replace(/^-(t|b|r|l|tr|tl|br|bl)(-|$)/, (r, n) => (e = $o(n), "")), e];
}
function mt(A, e = {}) {
  if (A.includes("/")) {
    let t = Wu(A, { ...e, fractions: true });
    if (t)
      return t;
  }
  return A[0] === "[" && (A = A.slice(1, -1)), Wu(A, e);
}
function Le(A, e, t = {}) {
  let r = mt(e, t);
  return r === null ? null : R2({ [A]: r });
}
function Wu(A, e = {}) {
  if (A === "px")
    return 1;
  let t = VA(A, e);
  if (!t)
    return null;
  let [r, n] = t;
  return e.fractions && (n = QA.percent, r *= 100), n === QA.none && (r = r / 4, n = QA.rem), gt(r, n, e);
}
function JC(...A) {
  console.warn(...A);
}
function WC(...A) {
}
var me = typeof process > "u" || ((Zo = process == null ? void 0 : process.env) === null || Zo === void 0 ? void 0 : Zo.JEST_WORKER_ID) === void 0 ? JC : WC;
var KC = [["aspect-square", R2({ aspectRatio: 1 })], ["aspect-video", R2({ aspectRatio: 16 / 9 })], ["items-center", R2({ alignItems: "center" })], ["items-start", R2({ alignItems: "flex-start" })], ["items-end", R2({ alignItems: "flex-end" })], ["items-baseline", R2({ alignItems: "baseline" })], ["items-stretch", R2({ alignItems: "stretch" })], ["justify-start", R2({ justifyContent: "flex-start" })], ["justify-end", R2({ justifyContent: "flex-end" })], ["justify-center", R2({ justifyContent: "center" })], ["justify-between", R2({ justifyContent: "space-between" })], ["justify-around", R2({ justifyContent: "space-around" })], ["justify-evenly", R2({ justifyContent: "space-evenly" })], ["content-start", R2({ alignContent: "flex-start" })], ["content-end", R2({ alignContent: "flex-end" })], ["content-between", R2({ alignContent: "space-between" })], ["content-around", R2({ alignContent: "space-around" })], ["content-stretch", R2({ alignContent: "stretch" })], ["content-center", R2({ alignContent: "center" })], ["self-auto", R2({ alignSelf: "auto" })], ["self-start", R2({ alignSelf: "flex-start" })], ["self-end", R2({ alignSelf: "flex-end" })], ["self-center", R2({ alignSelf: "center" })], ["self-stretch", R2({ alignSelf: "stretch" })], ["self-baseline", R2({ alignSelf: "baseline" })], ["direction-inherit", R2({ direction: "inherit" })], ["direction-ltr", R2({ direction: "ltr" })], ["direction-rtl", R2({ direction: "rtl" })], ["hidden", R2({ display: "none" })], ["flex", R2({ display: "flex" })], ["flex-row", R2({ flexDirection: "row" })], ["flex-row-reverse", R2({ flexDirection: "row-reverse" })], ["flex-col", R2({ flexDirection: "column" })], ["flex-col-reverse", R2({ flexDirection: "column-reverse" })], ["flex-wrap", R2({ flexWrap: "wrap" })], ["flex-wrap-reverse", R2({ flexWrap: "wrap-reverse" })], ["flex-nowrap", R2({ flexWrap: "nowrap" })], ["flex-auto", R2({ flexGrow: 1, flexShrink: 1, flexBasis: "auto" })], ["flex-initial", R2({ flexGrow: 0, flexShrink: 1, flexBasis: "auto" })], ["flex-none", R2({ flexGrow: 0, flexShrink: 0, flexBasis: "auto" })], ["overflow-hidden", R2({ overflow: "hidden" })], ["overflow-visible", R2({ overflow: "visible" })], ["overflow-scroll", R2({ overflow: "scroll" })], ["absolute", R2({ position: "absolute" })], ["relative", R2({ position: "relative" })], ["italic", R2({ fontStyle: "italic" })], ["not-italic", R2({ fontStyle: "normal" })], ["oldstyle-nums", Gr("oldstyle-nums")], ["small-caps", Gr("small-caps")], ["lining-nums", Gr("lining-nums")], ["tabular-nums", Gr("tabular-nums")], ["proportional-nums", Gr("proportional-nums")], ["font-thin", R2({ fontWeight: "100" })], ["font-100", R2({ fontWeight: "100" })], ["font-extralight", R2({ fontWeight: "200" })], ["font-200", R2({ fontWeight: "200" })], ["font-light", R2({ fontWeight: "300" })], ["font-300", R2({ fontWeight: "300" })], ["font-normal", R2({ fontWeight: "normal" })], ["font-400", R2({ fontWeight: "400" })], ["font-medium", R2({ fontWeight: "500" })], ["font-500", R2({ fontWeight: "500" })], ["font-semibold", R2({ fontWeight: "600" })], ["font-600", R2({ fontWeight: "600" })], ["font-bold", R2({ fontWeight: "bold" })], ["font-700", R2({ fontWeight: "700" })], ["font-extrabold", R2({ fontWeight: "800" })], ["font-800", R2({ fontWeight: "800" })], ["font-black", R2({ fontWeight: "900" })], ["font-900", R2({ fontWeight: "900" })], ["include-font-padding", R2({ includeFontPadding: true })], ["remove-font-padding", R2({ includeFontPadding: false })], ["max-w-none", R2({ maxWidth: "99999%" })], ["text-left", R2({ textAlign: "left" })], ["text-center", R2({ textAlign: "center" })], ["text-right", R2({ textAlign: "right" })], ["text-justify", R2({ textAlign: "justify" })], ["text-auto", R2({ textAlign: "auto" })], ["underline", R2({ textDecorationLine: "underline" })], ["line-through", R2({ textDecorationLine: "line-through" })], ["no-underline", R2({ textDecorationLine: "none" })], ["uppercase", R2({ textTransform: "uppercase" })], ["lowercase", R2({ textTransform: "lowercase" })], ["capitalize", R2({ textTransform: "capitalize" })], ["normal-case", R2({ textTransform: "none" })], ["w-auto", R2({ width: "auto" })], ["h-auto", R2({ height: "auto" })], ["shadow-sm", R2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.025, elevation: 1 })], ["shadow", R2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.075, elevation: 2 })], ["shadow-md", R2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 3, shadowOpacity: 0.125, elevation: 3 })], ["shadow-lg", R2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 })], ["shadow-xl", R2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.19, shadowRadius: 20, elevation: 12 })], ["shadow-2xl", R2({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 30, elevation: 16 })], ["shadow-none", R2({ shadowOffset: { width: 0, height: 0 }, shadowColor: "#000", shadowRadius: 0, shadowOpacity: 0, elevation: 0 })]];
var es = KC;
function Gr(A) {
  return { kind: "dependent", complete(e) {
    (!e.fontVariant || !Array.isArray(e.fontVariant)) && (e.fontVariant = []), e.fontVariant.push(A);
  } };
}
var Ur = class {
  constructor(e) {
    this.ir = new Map(es), this.styles = /* @__PURE__ */ new Map(), this.prefixes = /* @__PURE__ */ new Map(), this.ir = new Map([...es, ...e ?? []]);
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
function ts(A, e, t = {}) {
  let r = e == null ? void 0 : e[A];
  if (!r)
    return Le("fontSize", A, t);
  if (typeof r == "string")
    return At("fontSize", r);
  let n = {}, [i, o] = r, a = Ku("fontSize", i);
  if (a && (n = a), typeof o == "string")
    return R2(Rn("lineHeight", Yu(o, n), n));
  let { lineHeight: u2, letterSpacing: l2 } = o;
  return u2 && Rn("lineHeight", Yu(u2, n), n), l2 && Rn("letterSpacing", l2, n), R2(n);
}
function Yu(A, e) {
  let t = VA(A);
  if (t) {
    let [r, n] = t;
    if ((n === QA.none || n === QA.em) && typeof e.fontSize == "number")
      return e.fontSize * r;
  }
  return A;
}
function rs(A, e) {
  var t;
  let r = (t = e == null ? void 0 : e[A]) !== null && t !== void 0 ? t : A.startsWith("[") ? A.slice(1, -1) : A, n = VA(r);
  if (!n)
    return null;
  let [i, o] = n;
  if (o === QA.none)
    return { kind: "dependent", complete(u2) {
      if (typeof u2.fontSize != "number")
        return "relative line-height utilities require that font-size be set";
      u2.lineHeight = u2.fontSize * i;
    } };
  let a = gt(i, o);
  return a !== null ? R2({ lineHeight: a }) : null;
}
function ns(A, e, t, r, n) {
  let i = "";
  if (r[0] === "[")
    i = r.slice(1, -1);
  else {
    let l2 = n == null ? void 0 : n[r];
    if (l2)
      i = l2;
    else {
      let I = mt(r);
      return I && typeof I == "number" ? qu(I, QA.px, e, A) : null;
    }
  }
  if (i === "auto")
    return Xu(e, A, "auto");
  let o = VA(i);
  if (!o)
    return null;
  let [a, u2] = o;
  return t && (a = -a), qu(a, u2, e, A);
}
function qu(A, e, t, r) {
  let n = gt(A, e);
  return n === null ? null : Xu(t, r, n);
}
function Xu(A, e, t) {
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
function is(A) {
  if (!A)
    return {};
  let e = Object.entries(A).reduce((n, [i, o]) => {
    let a = [0, 1 / 0, 0], u2 = typeof o == "string" ? { min: o } : o, l2 = u2.min ? jo(u2.min) : 0;
    l2 === null ? me(`invalid screen config value: ${i}->min: ${u2.min}`) : a[0] = l2;
    let I = u2.max ? jo(u2.max) : 1 / 0;
    return I === null ? me(`invalid screen config value: ${i}->max: ${u2.max}`) : a[1] = I, n[i] = a, n;
  }, {}), t = Object.values(e);
  t.sort((n, i) => {
    let [o, a] = n, [u2, l2] = i;
    return a === 1 / 0 || l2 === 1 / 0 ? o - u2 : a - l2;
  });
  let r = 0;
  return t.forEach((n) => n[2] = r++), e;
}
function os(A, e) {
  let t = e == null ? void 0 : e[A];
  if (!t)
    return null;
  if (typeof t == "string")
    return R2({ fontFamily: t });
  let r = t[0];
  return r ? R2({ fontFamily: r }) : null;
}
function yt(A, e, t) {
  if (!t)
    return null;
  let r;
  e.includes("/") && ([e = "", r] = e.split("/", 2));
  let n = "";
  if (e.startsWith("[#") || e.startsWith("[rgb") ? n = e.slice(1, -1) : n = Zu(e, t), !n)
    return null;
  if (r) {
    let i = Number(r);
    if (!Number.isNaN(i))
      return n = Vu(n, i / 100), R2({ [Nn[A].color]: n });
  }
  return { kind: "dependent", complete(i) {
    let o = Nn[A].opacity, a = i[o];
    typeof a == "number" && (n = Vu(n, a)), i[Nn[A].color] = n;
  } };
}
function Hr(A, e) {
  let t = parseInt(e, 10);
  if (Number.isNaN(t))
    return null;
  let r = t / 100;
  return { kind: "complete", style: { [Nn[A].opacity]: r } };
}
function Vu(A, e) {
  return A.startsWith("#") ? A = YC(A) : A.startsWith("rgb(") && (A = A.replace(/^rgb\(/, "rgba(").replace(/\)$/, ", 1)")), A.replace(/, ?\d*\.?(\d+)\)$/, `, ${e})`);
}
function zu(A) {
  for (let e in A)
    e.startsWith("__opacity_") && delete A[e];
}
var Nn = { bg: { opacity: "__opacity_bg", color: "backgroundColor" }, text: { opacity: "__opacity_text", color: "color" }, border: { opacity: "__opacity_border", color: "borderColor" }, borderTop: { opacity: "__opacity_border", color: "borderTopColor" }, borderBottom: { opacity: "__opacity_border", color: "borderBottomColor" }, borderLeft: { opacity: "__opacity_border", color: "borderLeftColor" }, borderRight: { opacity: "__opacity_border", color: "borderRightColor" }, shadow: { opacity: "__opacity_shadow", color: "shadowColor" }, tint: { opacity: "__opacity_tint", color: "tintColor" } };
function YC(A) {
  let e = A;
  A = A.replace(qC, (o, a, u2, l2) => a + a + u2 + u2 + l2 + l2);
  let t = XC.exec(A);
  if (!t)
    return me(`invalid config hex color value: ${e}`), "rgba(0, 0, 0, 1)";
  let r = parseInt(t[1], 16), n = parseInt(t[2], 16), i = parseInt(t[3], 16);
  return `rgba(${r}, ${n}, ${i}, 1)`;
}
function Zu(A, e) {
  let t = e[A];
  if (Vo(t))
    return t;
  if (zo(t) && Vo(t.DEFAULT))
    return t.DEFAULT;
  let [r = "", ...n] = A.split("-");
  for (; r !== A; ) {
    let i = e[r];
    if (zo(i))
      return Zu(n.join("-"), i);
    if (n.length === 0)
      return "";
    r = `${r}-${n.shift()}`;
  }
  return "";
}
var qC = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
var XC = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
function $u(A, e) {
  let [t, r] = As(A);
  if (t.match(/^(-?(\d)+)?$/))
    return VC(t, r, e == null ? void 0 : e.borderWidth);
  if (t = t.replace(/^-/, ""), ["dashed", "solid", "dotted"].includes(t))
    return R2({ borderStyle: t });
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
  let o = yt(i, t, e == null ? void 0 : e.borderColor);
  if (o)
    return o;
  let a = `border${r === "All" ? "" : r}Width`;
  t = t.replace(/^-/, "");
  let u2 = t.slice(1, -1), l2 = Le(a, u2);
  return typeof (l2 == null ? void 0 : l2.style[a]) != "number" ? null : l2;
}
function VC(A, e, t) {
  if (!t)
    return null;
  A = A.replace(/^-/, "");
  let n = t[A === "" ? "DEFAULT" : A];
  if (n === void 0)
    return null;
  let i = `border${e === "All" ? "" : e}Width`;
  return At(i, n);
}
function AI(A, e) {
  if (!e)
    return null;
  let [t, r] = As(A);
  t = t.replace(/^-/, ""), t === "" && (t = "DEFAULT");
  let n = `border${r === "All" ? "" : r}Radius`, i = e[t];
  if (i)
    return ju(At(n, i));
  let o = Le(n, t);
  return typeof (o == null ? void 0 : o.style[n]) != "number" ? null : ju(o);
}
function ju(A) {
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
function _t(A, e, t, r) {
  let n = null;
  A === "inset" && (e = e.replace(/^(x|y)-/, (a, u2) => (n = u2 === "x" ? "x" : "y", "")));
  let i = r == null ? void 0 : r[e];
  if (i) {
    let a = We(i, { isNegative: t });
    if (a !== null)
      return eI(A, n, a);
  }
  let o = mt(e, { isNegative: t });
  return o !== null ? eI(A, n, o) : null;
}
function eI(A, e, t) {
  if (A !== "inset")
    return R2({ [A]: t });
  switch (e) {
    case null:
      return R2({ top: t, left: t, right: t, bottom: t });
    case "y":
      return R2({ top: t, bottom: t });
    case "x":
      return R2({ left: t, right: t });
  }
}
function Or(A, e, t) {
  var r;
  e = e.replace(/^-/, "");
  let n = e === "" ? "DEFAULT" : e, i = Number((r = t == null ? void 0 : t[n]) !== null && r !== void 0 ? r : e);
  return Number.isNaN(i) ? null : R2({ [`flex${A}`]: i });
}
function tI(A, e) {
  var t, r;
  if (A = (e == null ? void 0 : e[A]) || A, ["min-content", "revert", "unset"].includes(A))
    return null;
  if (A.match(/^\d+(\.\d+)?$/))
    return R2({ flexGrow: Number(A), flexBasis: "0%" });
  let n = A.match(/^(\d+)\s+(\d+)$/);
  if (n)
    return R2({ flexGrow: Number(n[1]), flexShrink: Number(n[2]) });
  if (n = A.match(/^(\d+)\s+([^ ]+)$/), n) {
    let i = We((t = n[2]) !== null && t !== void 0 ? t : "");
    return i ? R2({ flexGrow: Number(n[1]), flexBasis: i }) : null;
  }
  if (n = A.match(/^(\d+)\s+(\d+)\s+(.+)$/), n) {
    let i = We((r = n[3]) !== null && r !== void 0 ? r : "");
    return i ? R2({ flexGrow: Number(n[1]), flexShrink: Number(n[2]), flexBasis: i }) : null;
  }
  return null;
}
function ss(A, e, t = {}, r) {
  let n = r == null ? void 0 : r[e];
  return n !== void 0 ? At(A, n, t) : Le(A, e, t);
}
function Tr(A, e, t = {}, r) {
  let n = We(r == null ? void 0 : r[e], t);
  return n ? R2({ [A]: n }) : (e === "screen" && (e = A.includes("Width") ? "100vw" : "100vh"), Le(A, e, t));
}
function rI(A, e, t) {
  let r = t == null ? void 0 : t[A];
  if (r) {
    let n = VA(r, { isNegative: e });
    if (!n)
      return null;
    let [i, o] = n;
    if (o === QA.em)
      return zC(i);
    if (o === QA.percent)
      return me("percentage-based letter-spacing configuration currently unsupported, switch to `em`s, or open an issue if you'd like to see support added."), null;
    let a = gt(i, o, { isNegative: e });
    return a !== null ? R2({ letterSpacing: a }) : null;
  }
  return Le("letterSpacing", A, { isNegative: e });
}
function zC(A) {
  return { kind: "dependent", complete(e) {
    let t = e.fontSize;
    if (typeof t != "number" || Number.isNaN(t))
      return "tracking-X relative letter spacing classes require font-size to be set";
    e.letterSpacing = Math.round((A * t + Number.EPSILON) * 100) / 100;
  } };
}
function nI(A, e) {
  let t = e == null ? void 0 : e[A];
  if (t) {
    let n = VA(String(t));
    if (n)
      return R2({ opacity: n[0] });
  }
  let r = VA(A);
  return r ? R2({ opacity: r[0] / 100 }) : null;
}
function iI(A) {
  let e = parseInt(A, 10);
  return Number.isNaN(e) ? null : { kind: "complete", style: { shadowOpacity: e / 100 } };
}
function oI(A) {
  if (A.includes("/")) {
    let [t = "", r = ""] = A.split("/", 2), n = as(t), i = as(r);
    return n === null || i === null ? null : { kind: "complete", style: { shadowOffset: { width: n, height: i } } };
  }
  let e = as(A);
  return e === null ? null : { kind: "complete", style: { shadowOffset: { width: e, height: e } } };
}
function as(A) {
  let e = mt(A);
  return typeof e == "number" ? e : null;
}
var Jt = class {
  constructor(e, t = {}, r, n, i) {
    var o, a, u2, l2, I, E;
    this.config = t, this.cache = r, this.position = 0, this.isNull = false, this.isNegative = false, this.context = {}, this.context.device = n;
    let C = e.trim().split(":"), d2 = [];
    C.length === 1 ? this.string = e : (this.string = (o = C.pop()) !== null && o !== void 0 ? o : "", d2 = C), this.char = this.string[0];
    let p = is((a = this.config.theme) === null || a === void 0 ? void 0 : a.screens);
    for (let y of d2)
      if (p[y]) {
        let k = (u2 = p[y]) === null || u2 === void 0 ? void 0 : u2[2];
        k !== void 0 && (this.order = ((l2 = this.order) !== null && l2 !== void 0 ? l2 : 0) + k);
        let x2 = (I = n.windowDimensions) === null || I === void 0 ? void 0 : I.width;
        if (x2) {
          let [F, b] = (E = p[y]) !== null && E !== void 0 ? E : [0, 0];
          (x2 <= F || x2 > b) && (this.isNull = true);
        } else
          this.isNull = true;
      } else
        _u(y) ? this.isNull = y !== i : Ju(y) ? n.windowDimensions ? (n.windowDimensions.width > n.windowDimensions.height ? "landscape" : "portrait") !== y ? this.isNull = true : this.incrementOrder() : this.isNull = true : y === "retina" ? n.pixelDensity === 2 ? this.incrementOrder() : this.isNull = true : y === "dark" ? n.colorScheme !== "dark" ? this.isNull = true : this.incrementOrder() : this.handlePossibleArbitraryBreakpointPrefix(y) || (this.isNull = true);
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
    let o = this.config.theme, a = null;
    switch (this.char) {
      case "m":
      case "p": {
        let u2 = this.peekSlice(1, 3).match(/^(t|b|r|l|x|y)?-/);
        if (u2) {
          let l2 = this.char === "m" ? "margin" : "padding";
          this.advance(((t = (e = u2[0]) === null || e === void 0 ? void 0 : e.length) !== null && t !== void 0 ? t : 0) + 1);
          let I = $o(u2[1]), E = ns(l2, I, this.isNegative, this.rest, (r = this.config.theme) === null || r === void 0 ? void 0 : r[l2]);
          if (E)
            return E;
        }
      }
    }
    if (this.consumePeeked("h-") && (a = ss("height", this.rest, this.context, o == null ? void 0 : o.height), a) || this.consumePeeked("w-") && (a = ss("width", this.rest, this.context, o == null ? void 0 : o.width), a) || this.consumePeeked("min-w-") && (a = Tr("minWidth", this.rest, this.context, o == null ? void 0 : o.minWidth), a) || this.consumePeeked("min-h-") && (a = Tr("minHeight", this.rest, this.context, o == null ? void 0 : o.minHeight), a) || this.consumePeeked("max-w-") && (a = Tr("maxWidth", this.rest, this.context, o == null ? void 0 : o.maxWidth), a) || this.consumePeeked("max-h-") && (a = Tr("maxHeight", this.rest, this.context, o == null ? void 0 : o.maxHeight), a) || this.consumePeeked("leading-") && (a = rs(this.rest, o == null ? void 0 : o.lineHeight), a) || this.consumePeeked("text-") && (a = ts(this.rest, o == null ? void 0 : o.fontSize, this.context), a || (a = yt("text", this.rest, o == null ? void 0 : o.textColor), a) || this.consumePeeked("opacity-") && (a = Hr("text", this.rest), a)) || this.consumePeeked("font-") && (a = os(this.rest, o == null ? void 0 : o.fontFamily), a) || this.consumePeeked("aspect-") && (this.consumePeeked("ratio-") && me("`aspect-ratio-{ratio}` is deprecated, use `aspect-{ratio}` instead"), a = At("aspectRatio", this.rest, { fractions: true }), a) || this.consumePeeked("tint-") && (a = yt("tint", this.rest, o == null ? void 0 : o.colors), a) || this.consumePeeked("bg-") && (a = yt("bg", this.rest, o == null ? void 0 : o.backgroundColor), a || this.consumePeeked("opacity-") && (a = Hr("bg", this.rest), a)) || this.consumePeeked("border") && (a = $u(this.rest, o), a || this.consumePeeked("-opacity-") && (a = Hr("border", this.rest), a)) || this.consumePeeked("rounded") && (a = AI(this.rest, o == null ? void 0 : o.borderRadius), a) || this.consumePeeked("bottom-") && (a = _t("bottom", this.rest, this.isNegative, o == null ? void 0 : o.inset), a) || this.consumePeeked("top-") && (a = _t("top", this.rest, this.isNegative, o == null ? void 0 : o.inset), a) || this.consumePeeked("left-") && (a = _t("left", this.rest, this.isNegative, o == null ? void 0 : o.inset), a) || this.consumePeeked("right-") && (a = _t("right", this.rest, this.isNegative, o == null ? void 0 : o.inset), a) || this.consumePeeked("inset-") && (a = _t("inset", this.rest, this.isNegative, o == null ? void 0 : o.inset), a) || this.consumePeeked("flex-") && (this.consumePeeked("grow") ? a = Or("Grow", this.rest, o == null ? void 0 : o.flexGrow) : this.consumePeeked("shrink") ? a = Or("Shrink", this.rest, o == null ? void 0 : o.flexShrink) : a = tI(this.rest, o == null ? void 0 : o.flex), a) || this.consumePeeked("grow") && (a = Or("Grow", this.rest, o == null ? void 0 : o.flexGrow), a) || this.consumePeeked("shrink") && (a = Or("Shrink", this.rest, o == null ? void 0 : o.flexShrink), a) || this.consumePeeked("shadow-color-opacity-") && (a = Hr("shadow", this.rest), a) || this.consumePeeked("shadow-opacity-") && (a = iI(this.rest), a) || this.consumePeeked("shadow-offset-") && (a = oI(this.rest), a) || this.consumePeeked("shadow-radius-") && (a = Le("shadowRadius", this.rest), a) || this.consumePeeked("shadow-") && (a = yt("shadow", this.rest, o == null ? void 0 : o.colors), a))
      return a;
    if (this.consumePeeked("elevation-")) {
      let u2 = parseInt(this.rest, 10);
      if (!Number.isNaN(u2))
        return R2({ elevation: u2 });
    }
    if (this.consumePeeked("opacity-") && (a = nI(this.rest, o == null ? void 0 : o.opacity), a) || this.consumePeeked("tracking-") && (a = rI(this.rest, this.isNegative, o == null ? void 0 : o.letterSpacing), a))
      return a;
    if (this.consumePeeked("z-")) {
      let u2 = Number((i = (n = o == null ? void 0 : o.zIndex) === null || n === void 0 ? void 0 : n[this.rest]) !== null && i !== void 0 ? i : this.rest);
      if (!Number.isNaN(u2))
        return R2({ zIndex: u2 });
    }
    return me(`\`${this.rest}\` unknown or invalid utility`), null;
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
    let n = this.context.device.windowDimensions, [, i = "", o = "", a = ""] = r, u2 = o === "w" ? n.width : n.height, l2 = VA(a, this.context);
    if (l2 === null)
      return this.isNull = true, true;
    let [I, E] = l2;
    return E !== "px" && (this.isNull = true), (i === "min" ? u2 >= I : u2 <= I) ? this.incrementOrder() : this.isNull = true, true;
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
function sI(A) {
  let e = [], t = null;
  return A.forEach((r) => {
    if (typeof r == "string")
      e = [...e, ...gs(r)];
    else if (Array.isArray(r))
      e = [...e, ...r.flatMap(gs)];
    else if (typeof r == "object" && r !== null)
      for (let [n, i] of Object.entries(r))
        typeof i == "boolean" ? e = [...e, ...i ? gs(n) : []] : t ? t[n] = i : t = { [n]: i };
  }), [e.filter(Boolean).filter(ZC), t];
}
function gs(A) {
  return A.trim().split(/\s+/);
}
function ZC(A, e, t) {
  return t.indexOf(A) === e;
}
function aI(A) {
  var e;
  return (e = A == null ? void 0 : A.reduce((t, r) => ({ ...t, ...jC(r.handler) }), {})) !== null && e !== void 0 ? e : {};
}
function jC(A) {
  let e = {};
  return A({ addUtilities: (t) => {
    e = t;
  }, ...$C }), e;
}
function Ke(A) {
  throw new Error(`tailwindcss plugin function argument object prop "${A}" not implemented`);
}
var $C = { addComponents: Ke, addBase: Ke, addVariant: Ke, e: Ke, prefix: Ke, theme: Ke, variants: Ke, config: Ke, corePlugins: Ke, matchUtilities: Ke, postcss: null };
function uI(A, e) {
  let t = (0, gI.default)(Ad(A)), r = {}, n = aI(t.plugins), i = {}, o = Object.entries(n).map(([p, y]) => typeof y == "string" ? (i[p] = y, [p, { kind: "null" }]) : [p, R2(y)]).filter(([, p]) => p.kind !== "null");
  function a() {
    return [r.windowDimensions ? `w${r.windowDimensions.width}` : false, r.windowDimensions ? `h${r.windowDimensions.height}` : false, r.fontScale ? `fs${r.fontScale}` : false, r.colorScheme === "dark" ? "dark" : false, r.pixelDensity === 2 ? "retina" : false].filter(Boolean).join("--") || "default";
  }
  let u2 = a(), l2 = {};
  function I() {
    let p = l2[u2];
    if (p)
      return p;
    let y = new Ur(o);
    return l2[u2] = y, y;
  }
  function E(...p) {
    let y = I(), k = {}, x2 = [], F = [], [b, v2] = sI(p), M = b.join(" "), L = y.getStyle(M);
    if (L)
      return { ...L, ...v2 || {} };
    for (let O of b) {
      let J = y.getIr(O);
      if (!J && O in i) {
        let CA = E(i[O]);
        y.setIr(O, R2(CA)), k = { ...k, ...CA };
        continue;
      }
      switch (J = new Jt(O, t, y, r, e).parse(), J.kind) {
        case "complete":
          k = { ...k, ...J.style }, y.setIr(O, J);
          break;
        case "dependent":
          x2.push(J);
          break;
        case "ordered":
          F.push(J);
          break;
        case "null":
          y.setIr(O, J);
          break;
      }
    }
    if (F.length > 0) {
      F.sort((O, J) => O.order - J.order);
      for (let O of F)
        switch (O.styleIr.kind) {
          case "complete":
            k = { ...k, ...O.styleIr.style };
            break;
          case "dependent":
            x2.push(O.styleIr);
            break;
        }
    }
    if (x2.length > 0) {
      for (let O of x2) {
        let J = O.complete(k);
        J && me(J);
      }
      zu(k);
    }
    return M !== "" && y.setStyle(M, k), v2 && (k = { ...k, ...v2 }), k;
  }
  function C(p) {
    let y = E(p.split(/\s+/g).map((k) => k.replace(/^(bg|text|border)-/, "")).map((k) => `bg-${k}`).join(" "));
    return typeof y.backgroundColor == "string" ? y.backgroundColor : void 0;
  }
  let d2 = (p, ...y) => {
    let k = "";
    return p.forEach((x2, F) => {
      var b;
      k += x2 + ((b = y[F]) !== null && b !== void 0 ? b : "");
    }), E(k);
  };
  return d2.style = E, d2.color = C, d2.prefixMatch = (...p) => {
    let y = p.sort().join(":"), k = I(), x2 = k.getPrefixMatch(y);
    if (x2 !== void 0)
      return x2;
    let v2 = new Jt(`${y}:flex`, t, k, r, e).parse().kind !== "null";
    return k.setPrefixMatch(y, v2), v2;
  }, d2.setWindowDimensions = (p) => {
    r.windowDimensions = p, u2 = a();
  }, d2.setFontScale = (p) => {
    r.fontScale = p, u2 = a();
  }, d2.setPixelDensity = (p) => {
    r.pixelDensity = p, u2 = a();
  }, d2.setColorScheme = (p) => {
    r.colorScheme = p, u2 = a();
  }, d2;
}
function Ad(A) {
  return { ...A, content: ["_no_warnings_please"] };
}
var td2 = { handler: ({ addUtilities: A }) => {
  A({ "shadow-sm": { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }, shadow: { boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" }, "shadow-md": { boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }, "shadow-lg": { boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }, "shadow-xl": { boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }, "shadow-2xl": { boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)" }, "shadow-inner": { boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" }, "shadow-none": { boxShadow: "0 0 #0000" } });
} };
function rd(A) {
  return uI({ ...A, plugins: [...(A == null ? void 0 : A.plugins) ?? [], td2] }, "web");
}
var Mn;
function us({ width: A, height: e, config: t }) {
  return Mn || (Mn = rd(t)), Mn.setWindowDimensions({ width: +A, height: +e }), Mn;
}
var Is = /* @__PURE__ */ new WeakMap();
async function lI(A, e) {
  let t = await rt();
  if (!t || !t.Node)
    throw new Error("Satori is not initialized: expect `yoga` to be loaded, got " + t);
  e.fonts = e.fonts || [];
  let r;
  Is.has(e.fonts) ? r = Is.get(e.fonts) : Is.set(e.fonts, r = new ir(e.fonts));
  let n = "width" in e ? e.width : void 0, i = "height" in e ? e.height : void 0, o = nd(t, e.pointScaleFactor);
  n && o.setWidth(n), i && o.setHeight(i), o.setFlexDirection(t.FLEX_DIRECTION_ROW), o.setFlexWrap(t.WRAP_WRAP), o.setAlignContent(t.ALIGN_AUTO), o.setAlignItems(t.ALIGN_FLEX_START), o.setJustifyContent(t.JUSTIFY_FLEX_START), o.setOverflow(t.OVERFLOW_HIDDEN);
  let a = { ...e.graphemeImages }, u2 = /* @__PURE__ */ new Set();
  _e.clear(), Xt.clear(), await Ws(A);
  let l2 = rr(A, { id: "id", parentStyle: {}, inheritedStyle: { fontSize: 16, fontWeight: "normal", fontFamily: "serif", fontStyle: "normal", lineHeight: "normal", color: "black", opacity: 1, whiteSpace: "normal", _viewportWidth: n, _viewportHeight: i }, parent: o, font: r, embedFont: e.embedFont, debug: e.debug, graphemeImages: a, canLoadAdditionalAssets: !!e.loadAdditionalAsset, onNodeDetected: e.onNodeDetected, getTwStyles: (p, y) => {
    let x2 = { ...us({ width: n, height: i, config: e.tailwindConfig })([p]) };
    return typeof x2.lineHeight == "number" && (x2.lineHeight = x2.lineHeight / (+x2.fontSize || y.fontSize || 16)), x2.shadowColor && x2.boxShadow && (x2.boxShadow = x2.boxShadow.replace(/rgba?\([^)]+\)/, x2.shadowColor)), x2;
  } }), I = (await l2.next()).value;
  if (e.loadAdditionalAsset && I.length) {
    let p = id(I), y = [], k = {};
    await Promise.all(Object.entries(p).flatMap(([x2, F]) => F.map((b) => {
      let v2 = `${x2}_${b}`;
      return u2.has(v2) ? null : (u2.add(v2), e.loadAdditionalAsset(x2, b).then((M) => {
        typeof M == "string" ? k[b] = M : M && (Array.isArray(M) ? y.push(...M) : y.push(M));
      }));
    }))), r.addFonts(y), Object.assign(a, k);
  }
  await l2.next(), o.calculateLayout(n, i, t.DIRECTION_LTR);
  let E = (await l2.next([0, 0])).value, C = o.getComputedWidth(), d2 = o.getComputedHeight();
  return o.freeRecursive(), mi({ width: C, height: d2, content: E });
}
function nd(A, e) {
  if (e) {
    let t = A.Config.create();
    return t.setPointScaleFactor(e), A.Node.createWithConfig(t);
  } else
    return A.Node.create();
}
function id(A) {
  let e = {}, t = {};
  for (let { word: r, locale: n } of A) {
    let i = va(r, n).join("|");
    t[i] = t[i] || "", t[i] += r;
  }
  return Object.keys(t).forEach((r) => {
    e[r] = e[r] || [], r === "emoji" ? e[r].push(...II(ge(t[r], "grapheme"))) : (e[r][0] = e[r][0] || "", e[r][0] += II(ge(t[r], "grapheme", r === "unknown" ? void 0 : r)).join(""));
  }), e;
}
function II(A) {
  return Array.from(new Set(A));
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
  const fn2 = async (code, text) => {
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
    const asset = await fn2(...args);
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
var satori = lI.default || lI;
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