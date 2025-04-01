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
        placeHolders = b64.charAt(len - 2) === "=" ? 2 : b64.charAt(len - 1) === "=" ? 1 : 0;
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

// node_modules/.pnpm/satori@0.12.2/node_modules/satori/dist/index.wasm.js
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

// node_modules/.pnpm/satori@0.12.2/node_modules/satori/dist/index.wasm.js
var import_postcss_value_parser = __toESM(require_lib(), 1);
var import_css_to_react_native2 = __toESM(require_css_to_react_native(), 1);
var import_escape_html = __toESM(require_escape_html(), 1);

// node_modules/.pnpm/css-gradient-parser@0.0.16/node_modules/css-gradient-parser/dist/index.js
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
var u = /^(-?\d+\.?\d*)(%|vw|vh|px|em|rem|deg|rad|grad|turn)$/;
function m(e) {
  return u.test(e);
}
function l(e) {
  if (!e)
    return;
  let [, o, t] = e.trim().match(u) || [];
  return { value: o, unit: t };
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
var w = /* @__PURE__ */ new Set(["closest-corner", "closest-side", "farthest-corner", "farthest-side"]);
var v = /* @__PURE__ */ new Set(["center", "left", "top", "right", "bottom"]);
function d(e) {
  return w.has(e);
}
function h(e) {
  return v.has(e);
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

// node_modules/.pnpm/satori@0.12.2/node_modules/satori/dist/index.wasm.js
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
  var le2 = new u16(mb);
  for (i = 0; i < mb; ++i) {
    le2[i] = le2[i - 1] + l2[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v2 = le2[cd[i] - 1]++ << r_1;
        for (var m2 = v2 | (1 << r_1) - 1; v2 <= m2; ++v2) {
          co[rev[v2] >>> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le2[cd[i] - 1]++] >>> 15 - cd[i];
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
var inflt = function(dat, buf, st2) {
  var sl2 = dat.length;
  if (!sl2 || st2 && st2.f && !st2.l) {
    return buf || new u8(0);
  }
  var noBuf = !buf || st2;
  var noSt = !st2 || st2.i;
  if (!st2) {
    st2 = {};
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
  var final = st2.f || 0, pos = st2.p || 0, bt2 = st2.b || 0, lm = st2.l, dm = st2.d, lbt = st2.m, dbt = st2.n;
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
        st2.b = bt2 += l2, st2.p = pos = t * 8, st2.f = final;
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
          cbuf(bt2 + 131072);
        }
        var end = bt2 + add;
        for (; bt2 < end; bt2 += 4) {
          buf[bt2] = buf[bt2 - dt];
          buf[bt2 + 1] = buf[bt2 + 1 - dt];
          buf[bt2 + 2] = buf[bt2 + 2 - dt];
          buf[bt2 + 3] = buf[bt2 + 3 - dt];
        }
        bt2 = end;
      }
    }
    st2.l = lm, st2.p = lpos, st2.b = bt2, st2.f = final;
    if (lm) {
      final = 1, st2.m = lbt, st2.d = dm, st2.n = dbt;
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
      p.quadraticCurveTo(x2 + cmd.x1 * xScale, y + -cmd.y1 * yScale, x2 + cmd.x * xScale, y + -cmd.y * yScale);
    } else if (cmd.type === "C") {
      p.curveTo(x2 + cmd.x1 * xScale, y + -cmd.y1 * yScale, x2 + cmd.x2 * xScale, y + -cmd.y2 * yScale, x2 + cmd.x * xScale, y + -cmd.y * yScale);
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
          for (var k2 = 0; k2 < pairSet.length; k2++) {
            var pair = pairSet[k2];
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
        for (var k2 = 0; k2 < ligSet.length; k2++) {
          var lig = ligSet[k2];
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
  normalSlope: Number.NEGATIVE_INFINITY,
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
  normalSlope: 0,
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
      console.log(++state.step, i + 1 < c2 ? "next loopcall" : "done loopcall", i);
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
  var k2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "CINDEX[]", k2);
  }
  stack.push(stack[stack.length - k2]);
}
function MINDEX(state) {
  var stack = state.stack;
  var k2 = stack.pop();
  if (exports.DEBUG) {
    console.log(state.step, "MINDEX[]", k2);
  }
  stack.push(stack.splice(stack.length - k2, 1)[0]);
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
      console.log(state.step, (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "SHPIX[]", pi, d2);
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
      console.log(state.step, (state.loop > 1 ? "loop " + (state.loop - loop) + ": " : "") + "IP[]", pi, rp1i, "<->", rp2i);
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
function MDRP_MIRP(indirect, setRp0, keepD, ro, dt, state) {
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
    console.log(state.step, (indirect ? "MIRP[" : "MDRP[") + (setRp0 ? "M" : "m") + (keepD ? ">" : "_") + (ro ? "R" : "_") + (dt === 0 ? "Gr" : dt === 1 ? "Bl" : dt === 2 ? "Wh" : "") + "]", indirect ? cvte + "(" + state.cvt[cvte] + "," + cv + ")" : "", pi, "(d =", od, "->", sign * d2, ")");
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
        arabicCharAhead = contextParams.lookahead.some(function(c2) {
          return isArabicChar(c2) || isTashkeelArabicChar(c2);
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
    kerningLookups = this.position.getKerningTables(script, options.language);
  }
  for (var i = 0; i < glyphs.length; i += 1) {
    var glyph = glyphs[i];
    callback.call(this, glyph, x2, y, fontSize, options);
    if (glyph.advanceWidth) {
      x2 += glyph.advanceWidth * fontScale;
    }
    if (options.kerning && i < glyphs.length - 1) {
      var kerningValue = kerningLookups ? this.position.getKerningValue(kerningLookups, glyph.index, glyphs[i + 1].index) : this.getKerningValue(glyph, glyphs[i + 1]);
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
  this.forEachGlyph(text, x2, y, fontSize, options, function(glyph, gX, gY, gFontSize) {
    var glyphPath = glyph.getPath(gX, gY, gFontSize, options, this);
    fullPath.extend(glyphPath);
  });
  return fullPath;
};
Font.prototype.getPaths = function(text, x2, y, fontSize, options) {
  var glyphPaths = [];
  this.forEachGlyph(text, x2, y, fontSize, options, function(glyph, gX, gY, gFontSize) {
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
              console.log("Glyph " + glyph.index + ": unknown operator " + 1200 + v2);
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
            console.log("Glyph " + glyph.index + ": unknown operator " + v2);
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

// node_modules/.pnpm/satori@0.12.2/node_modules/satori/dist/index.wasm.js
var Tl = Object.create;
var Br = Object.defineProperty;
var Al = Object.getOwnPropertyDescriptor;
var Ol = Object.getOwnPropertyNames;
var Pl = Object.getPrototypeOf;
var Bl = Object.prototype.hasOwnProperty;
var xn = (e, t) => () => (e && (t = e(e = 0)), t);
var k = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var Fn = (e, t) => {
  for (var n in t)
    Br(e, n, { get: t[n], enumerable: true });
};
var Go = (e, t, n, r) => {
  if (t && typeof t == "object" || typeof t == "function")
    for (let i of Ol(t))
      !Bl.call(e, i) && i !== n && Br(e, i, { get: () => t[i], enumerable: !(r = Al(t, i)) || r.enumerable });
  return e;
};
var Il = (e, t, n) => (n = e != null ? Tl(Pl(e)) : {}, Go(t || !e || !e.__esModule ? Br(n, "default", { value: e, enumerable: true }) : n, e));
var Ir = (e) => Go(Br({}, "__esModule", { value: true }), e);
var jo = {};
Fn(jo, { getYogaModule: () => Rl });
async function Rl() {
  return {};
}
var Ho = xn(() => {
});
var Xn = k((Yn) => {
  "use strict";
  Object.defineProperty(Yn, "__esModule", { value: true });
  Object.defineProperty(Yn, "default", { enumerable: true, get: () => Yf });
  function Yf(e) {
    if (e = `${e}`, e === "0")
      return "0";
    if (/^[+-]?(\d+|\d*\.\d+)(e[+-]?\d+)?(%|\w+)?$/.test(e))
      return e.replace(/^[+-]?/, (t) => t === "-" ? "" : "-");
    if (e.includes("var(") || e.includes("calc("))
      return `calc(${e} * -1)`;
  }
});
var Uu = k((Qn) => {
  "use strict";
  Object.defineProperty(Qn, "__esModule", { value: true });
  Object.defineProperty(Qn, "default", { enumerable: true, get: () => Xf });
  var Xf = ["preflight", "container", "accessibility", "pointerEvents", "visibility", "position", "inset", "isolation", "zIndex", "order", "gridColumn", "gridColumnStart", "gridColumnEnd", "gridRow", "gridRowStart", "gridRowEnd", "float", "clear", "margin", "boxSizing", "display", "aspectRatio", "height", "maxHeight", "minHeight", "width", "minWidth", "maxWidth", "flex", "flexShrink", "flexGrow", "flexBasis", "tableLayout", "borderCollapse", "borderSpacing", "transformOrigin", "translate", "rotate", "skew", "scale", "transform", "animation", "cursor", "touchAction", "userSelect", "resize", "scrollSnapType", "scrollSnapAlign", "scrollSnapStop", "scrollMargin", "scrollPadding", "listStylePosition", "listStyleType", "appearance", "columns", "breakBefore", "breakInside", "breakAfter", "gridAutoColumns", "gridAutoFlow", "gridAutoRows", "gridTemplateColumns", "gridTemplateRows", "flexDirection", "flexWrap", "placeContent", "placeItems", "alignContent", "alignItems", "justifyContent", "justifyItems", "gap", "space", "divideWidth", "divideStyle", "divideColor", "divideOpacity", "placeSelf", "alignSelf", "justifySelf", "overflow", "overscrollBehavior", "scrollBehavior", "textOverflow", "whitespace", "wordBreak", "borderRadius", "borderWidth", "borderStyle", "borderColor", "borderOpacity", "backgroundColor", "backgroundOpacity", "backgroundImage", "gradientColorStops", "boxDecorationBreak", "backgroundSize", "backgroundAttachment", "backgroundClip", "backgroundPosition", "backgroundRepeat", "backgroundOrigin", "fill", "stroke", "strokeWidth", "objectFit", "objectPosition", "padding", "textAlign", "textIndent", "verticalAlign", "fontFamily", "fontSize", "fontWeight", "textTransform", "fontStyle", "fontVariantNumeric", "lineHeight", "letterSpacing", "textColor", "textOpacity", "textDecoration", "textDecorationColor", "textDecorationStyle", "textDecorationThickness", "textUnderlineOffset", "fontSmoothing", "placeholderColor", "placeholderOpacity", "caretColor", "accentColor", "opacity", "backgroundBlendMode", "mixBlendMode", "boxShadow", "boxShadowColor", "outlineStyle", "outlineWidth", "outlineOffset", "outlineColor", "ringWidth", "ringColor", "ringOpacity", "ringOffsetWidth", "ringOffsetColor", "blur", "brightness", "contrast", "dropShadow", "grayscale", "hueRotate", "invert", "saturate", "sepia", "filter", "backdropBlur", "backdropBrightness", "backdropContrast", "backdropGrayscale", "backdropHueRotate", "backdropInvert", "backdropOpacity", "backdropSaturate", "backdropSepia", "backdropFilter", "transitionProperty", "transitionDelay", "transitionDuration", "transitionTimingFunction", "willChange", "content"];
});
var Gu = k((Kn) => {
  "use strict";
  Object.defineProperty(Kn, "__esModule", { value: true });
  Object.defineProperty(Kn, "default", { enumerable: true, get: () => Qf });
  function Qf(e, t) {
    return e === void 0 ? t : Array.isArray(e) ? e : [...new Set(t.filter((r) => e !== false && e[r] !== false).concat(Object.keys(e).filter((r) => e[r] !== false)))];
  }
});
var Jn = k((Cb, ju) => {
  ju.exports = { content: [], presets: [], darkMode: "media", theme: { screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" }, colors: ({ colors: e }) => ({ inherit: e.inherit, current: e.current, transparent: e.transparent, black: e.black, white: e.white, slate: e.slate, gray: e.gray, zinc: e.zinc, neutral: e.neutral, stone: e.stone, red: e.red, orange: e.orange, amber: e.amber, yellow: e.yellow, lime: e.lime, green: e.green, emerald: e.emerald, teal: e.teal, cyan: e.cyan, sky: e.sky, blue: e.blue, indigo: e.indigo, violet: e.violet, purple: e.purple, fuchsia: e.fuchsia, pink: e.pink, rose: e.rose }), columns: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", "3xs": "16rem", "2xs": "18rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem" }, spacing: { px: "1px", 0: "0px", 0.5: "0.125rem", 1: "0.25rem", 1.5: "0.375rem", 2: "0.5rem", 2.5: "0.625rem", 3: "0.75rem", 3.5: "0.875rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem", 11: "2.75rem", 12: "3rem", 14: "3.5rem", 16: "4rem", 20: "5rem", 24: "6rem", 28: "7rem", 32: "8rem", 36: "9rem", 40: "10rem", 44: "11rem", 48: "12rem", 52: "13rem", 56: "14rem", 60: "15rem", 64: "16rem", 72: "18rem", 80: "20rem", 96: "24rem" }, animation: { none: "none", spin: "spin 1s linear infinite", ping: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite", pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite", bounce: "bounce 1s infinite" }, aspectRatio: { auto: "auto", square: "1 / 1", video: "16 / 9" }, backdropBlur: ({ theme: e }) => e("blur"), backdropBrightness: ({ theme: e }) => e("brightness"), backdropContrast: ({ theme: e }) => e("contrast"), backdropGrayscale: ({ theme: e }) => e("grayscale"), backdropHueRotate: ({ theme: e }) => e("hueRotate"), backdropInvert: ({ theme: e }) => e("invert"), backdropOpacity: ({ theme: e }) => e("opacity"), backdropSaturate: ({ theme: e }) => e("saturate"), backdropSepia: ({ theme: e }) => e("sepia"), backgroundColor: ({ theme: e }) => e("colors"), backgroundImage: { none: "none", "gradient-to-t": "linear-gradient(to top, var(--tw-gradient-stops))", "gradient-to-tr": "linear-gradient(to top right, var(--tw-gradient-stops))", "gradient-to-r": "linear-gradient(to right, var(--tw-gradient-stops))", "gradient-to-br": "linear-gradient(to bottom right, var(--tw-gradient-stops))", "gradient-to-b": "linear-gradient(to bottom, var(--tw-gradient-stops))", "gradient-to-bl": "linear-gradient(to bottom left, var(--tw-gradient-stops))", "gradient-to-l": "linear-gradient(to left, var(--tw-gradient-stops))", "gradient-to-tl": "linear-gradient(to top left, var(--tw-gradient-stops))" }, backgroundOpacity: ({ theme: e }) => e("opacity"), backgroundPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, backgroundSize: { auto: "auto", cover: "cover", contain: "contain" }, blur: { 0: "0", none: "0", sm: "4px", DEFAULT: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" }, brightness: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5", 200: "2" }, borderColor: ({ theme: e }) => ({ ...e("colors"), DEFAULT: e("colors.gray.200", "currentColor") }), borderOpacity: ({ theme: e }) => e("opacity"), borderRadius: { none: "0px", sm: "0.125rem", DEFAULT: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" }, borderSpacing: ({ theme: e }) => ({ ...e("spacing") }), borderWidth: { DEFAULT: "1px", 0: "0px", 2: "2px", 4: "4px", 8: "8px" }, boxShadow: { sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)", none: "none" }, boxShadowColor: ({ theme: e }) => e("colors"), caretColor: ({ theme: e }) => e("colors"), accentColor: ({ theme: e }) => ({ ...e("colors"), auto: "auto" }), contrast: { 0: "0", 50: ".5", 75: ".75", 100: "1", 125: "1.25", 150: "1.5", 200: "2" }, container: {}, content: { none: "none" }, cursor: { auto: "auto", default: "default", pointer: "pointer", wait: "wait", text: "text", move: "move", help: "help", "not-allowed": "not-allowed", none: "none", "context-menu": "context-menu", progress: "progress", cell: "cell", crosshair: "crosshair", "vertical-text": "vertical-text", alias: "alias", copy: "copy", "no-drop": "no-drop", grab: "grab", grabbing: "grabbing", "all-scroll": "all-scroll", "col-resize": "col-resize", "row-resize": "row-resize", "n-resize": "n-resize", "e-resize": "e-resize", "s-resize": "s-resize", "w-resize": "w-resize", "ne-resize": "ne-resize", "nw-resize": "nw-resize", "se-resize": "se-resize", "sw-resize": "sw-resize", "ew-resize": "ew-resize", "ns-resize": "ns-resize", "nesw-resize": "nesw-resize", "nwse-resize": "nwse-resize", "zoom-in": "zoom-in", "zoom-out": "zoom-out" }, divideColor: ({ theme: e }) => e("borderColor"), divideOpacity: ({ theme: e }) => e("borderOpacity"), divideWidth: ({ theme: e }) => e("borderWidth"), dropShadow: { sm: "0 1px 1px rgb(0 0 0 / 0.05)", DEFAULT: ["0 1px 2px rgb(0 0 0 / 0.1)", "0 1px 1px rgb(0 0 0 / 0.06)"], md: ["0 4px 3px rgb(0 0 0 / 0.07)", "0 2px 2px rgb(0 0 0 / 0.06)"], lg: ["0 10px 8px rgb(0 0 0 / 0.04)", "0 4px 3px rgb(0 0 0 / 0.1)"], xl: ["0 20px 13px rgb(0 0 0 / 0.03)", "0 8px 5px rgb(0 0 0 / 0.08)"], "2xl": "0 25px 25px rgb(0 0 0 / 0.15)", none: "0 0 #0000" }, fill: ({ theme: e }) => e("colors"), grayscale: { 0: "0", DEFAULT: "100%" }, hueRotate: { 0: "0deg", 15: "15deg", 30: "30deg", 60: "60deg", 90: "90deg", 180: "180deg" }, invert: { 0: "0", DEFAULT: "100%" }, flex: { 1: "1 1 0%", auto: "1 1 auto", initial: "0 1 auto", none: "none" }, flexBasis: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%" }), flexGrow: { 0: "0", DEFAULT: "1" }, flexShrink: { 0: "0", DEFAULT: "1" }, fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", '"Noto Sans"', "sans-serif", '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'], serif: ["ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", '"Liberation Mono"', '"Courier New"', "monospace"] }, fontSize: { xs: ["0.75rem", { lineHeight: "1rem" }], sm: ["0.875rem", { lineHeight: "1.25rem" }], base: ["1rem", { lineHeight: "1.5rem" }], lg: ["1.125rem", { lineHeight: "1.75rem" }], xl: ["1.25rem", { lineHeight: "1.75rem" }], "2xl": ["1.5rem", { lineHeight: "2rem" }], "3xl": ["1.875rem", { lineHeight: "2.25rem" }], "4xl": ["2.25rem", { lineHeight: "2.5rem" }], "5xl": ["3rem", { lineHeight: "1" }], "6xl": ["3.75rem", { lineHeight: "1" }], "7xl": ["4.5rem", { lineHeight: "1" }], "8xl": ["6rem", { lineHeight: "1" }], "9xl": ["8rem", { lineHeight: "1" }] }, fontWeight: { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" }, gap: ({ theme: e }) => e("spacing"), gradientColorStops: ({ theme: e }) => e("colors"), gridAutoColumns: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridAutoRows: { auto: "auto", min: "min-content", max: "max-content", fr: "minmax(0, 1fr)" }, gridColumn: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-7": "span 7 / span 7", "span-8": "span 8 / span 8", "span-9": "span 9 / span 9", "span-10": "span 10 / span 10", "span-11": "span 11 / span 11", "span-12": "span 12 / span 12", "span-full": "1 / -1" }, gridColumnEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridColumnStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12", 13: "13" }, gridRow: { auto: "auto", "span-1": "span 1 / span 1", "span-2": "span 2 / span 2", "span-3": "span 3 / span 3", "span-4": "span 4 / span 4", "span-5": "span 5 / span 5", "span-6": "span 6 / span 6", "span-full": "1 / -1" }, gridRowStart: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridRowEnd: { auto: "auto", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7" }, gridTemplateColumns: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))", 7: "repeat(7, minmax(0, 1fr))", 8: "repeat(8, minmax(0, 1fr))", 9: "repeat(9, minmax(0, 1fr))", 10: "repeat(10, minmax(0, 1fr))", 11: "repeat(11, minmax(0, 1fr))", 12: "repeat(12, minmax(0, 1fr))" }, gridTemplateRows: { none: "none", 1: "repeat(1, minmax(0, 1fr))", 2: "repeat(2, minmax(0, 1fr))", 3: "repeat(3, minmax(0, 1fr))", 4: "repeat(4, minmax(0, 1fr))", 5: "repeat(5, minmax(0, 1fr))", 6: "repeat(6, minmax(0, 1fr))" }, height: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), inset: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), keyframes: { spin: { to: { transform: "rotate(360deg)" } }, ping: { "75%, 100%": { transform: "scale(2)", opacity: "0" } }, pulse: { "50%": { opacity: ".5" } }, bounce: { "0%, 100%": { transform: "translateY(-25%)", animationTimingFunction: "cubic-bezier(0.8,0,1,1)" }, "50%": { transform: "none", animationTimingFunction: "cubic-bezier(0,0,0.2,1)" } } }, letterSpacing: { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }, lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2", 3: ".75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 7: "1.75rem", 8: "2rem", 9: "2.25rem", 10: "2.5rem" }, listStyleType: { none: "none", disc: "disc", decimal: "decimal" }, margin: ({ theme: e }) => ({ auto: "auto", ...e("spacing") }), maxHeight: ({ theme: e }) => ({ ...e("spacing"), full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }), maxWidth: ({ theme: e, breakpoints: t }) => ({ none: "none", 0: "0rem", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch", ...t(e("screens")) }), minHeight: { 0: "0px", full: "100%", screen: "100vh", min: "min-content", max: "max-content", fit: "fit-content" }, minWidth: { 0: "0px", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" }, objectPosition: { bottom: "bottom", center: "center", left: "left", "left-bottom": "left bottom", "left-top": "left top", right: "right", "right-bottom": "right bottom", "right-top": "right top", top: "top" }, opacity: { 0: "0", 5: "0.05", 10: "0.1", 20: "0.2", 25: "0.25", 30: "0.3", 40: "0.4", 50: "0.5", 60: "0.6", 70: "0.7", 75: "0.75", 80: "0.8", 90: "0.9", 95: "0.95", 100: "1" }, order: { first: "-9999", last: "9999", none: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "11", 12: "12" }, padding: ({ theme: e }) => e("spacing"), placeholderColor: ({ theme: e }) => e("colors"), placeholderOpacity: ({ theme: e }) => e("opacity"), outlineColor: ({ theme: e }) => e("colors"), outlineOffset: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, outlineWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringColor: ({ theme: e }) => ({ DEFAULT: e("colors.blue.500", "#3b82f6"), ...e("colors") }), ringOffsetColor: ({ theme: e }) => e("colors"), ringOffsetWidth: { 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, ringOpacity: ({ theme: e }) => ({ DEFAULT: "0.5", ...e("opacity") }), ringWidth: { DEFAULT: "3px", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, rotate: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg", 45: "45deg", 90: "90deg", 180: "180deg" }, saturate: { 0: "0", 50: ".5", 100: "1", 150: "1.5", 200: "2" }, scale: { 0: "0", 50: ".5", 75: ".75", 90: ".9", 95: ".95", 100: "1", 105: "1.05", 110: "1.1", 125: "1.25", 150: "1.5" }, scrollMargin: ({ theme: e }) => ({ ...e("spacing") }), scrollPadding: ({ theme: e }) => e("spacing"), sepia: { 0: "0", DEFAULT: "100%" }, skew: { 0: "0deg", 1: "1deg", 2: "2deg", 3: "3deg", 6: "6deg", 12: "12deg" }, space: ({ theme: e }) => ({ ...e("spacing") }), stroke: ({ theme: e }) => e("colors"), strokeWidth: { 0: "0", 1: "1", 2: "2" }, textColor: ({ theme: e }) => e("colors"), textDecorationColor: ({ theme: e }) => e("colors"), textDecorationThickness: { auto: "auto", "from-font": "from-font", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textUnderlineOffset: { auto: "auto", 0: "0px", 1: "1px", 2: "2px", 4: "4px", 8: "8px" }, textIndent: ({ theme: e }) => ({ ...e("spacing") }), textOpacity: ({ theme: e }) => e("opacity"), transformOrigin: { center: "center", top: "top", "top-right": "top right", right: "right", "bottom-right": "bottom right", bottom: "bottom", "bottom-left": "bottom left", left: "left", "top-left": "top left" }, transitionDelay: { 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionDuration: { DEFAULT: "150ms", 75: "75ms", 100: "100ms", 150: "150ms", 200: "200ms", 300: "300ms", 500: "500ms", 700: "700ms", 1e3: "1000ms" }, transitionProperty: { none: "none", all: "all", DEFAULT: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter", colors: "color, background-color, border-color, text-decoration-color, fill, stroke", opacity: "opacity", shadow: "box-shadow", transform: "transform" }, transitionTimingFunction: { DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)", linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" }, translate: ({ theme: e }) => ({ ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", full: "100%" }), width: ({ theme: e }) => ({ auto: "auto", ...e("spacing"), "1/2": "50%", "1/3": "33.333333%", "2/3": "66.666667%", "1/4": "25%", "2/4": "50%", "3/4": "75%", "1/5": "20%", "2/5": "40%", "3/5": "60%", "4/5": "80%", "1/6": "16.666667%", "2/6": "33.333333%", "3/6": "50%", "4/6": "66.666667%", "5/6": "83.333333%", "1/12": "8.333333%", "2/12": "16.666667%", "3/12": "25%", "4/12": "33.333333%", "5/12": "41.666667%", "6/12": "50%", "7/12": "58.333333%", "8/12": "66.666667%", "9/12": "75%", "10/12": "83.333333%", "11/12": "91.666667%", full: "100%", screen: "100vw", min: "min-content", max: "max-content", fit: "fit-content" }), willChange: { auto: "auto", scroll: "scroll-position", contents: "contents", transform: "transform" }, zIndex: { auto: "auto", 0: "0", 10: "10", 20: "20", 30: "30", 40: "40", 50: "50" } }, variantOrder: ["first", "last", "odd", "even", "visited", "checked", "empty", "read-only", "group-hover", "group-focus", "focus-within", "hover", "focus", "focus-visible", "active", "disabled"], plugins: [] };
});
var Kr = {};
Fn(Kr, { default: () => Kf });
var Kf;
var Jr = xn(() => {
  Kf = { info(e, t) {
    console.info(...Array.isArray(e) ? [e] : [t, e]);
  }, warn(e, t) {
    console.warn(...Array.isArray(e) ? [e] : [t, e]);
  }, risk(e, t) {
    console.error(...Array.isArray(e) ? [e] : [t, e]);
  } };
});
var Hu = k((Zn) => {
  "use strict";
  Object.defineProperty(Zn, "__esModule", { value: true });
  Object.defineProperty(Zn, "default", { enumerable: true, get: () => ec2 });
  var Jf = Zf((Jr(), Ir(Kr)));
  function Zf(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function zt({ version: e, from: t, to: n }) {
    Jf.default.warn(`${t}-color-renamed`, [`As of Tailwind CSS ${e}, \`${t}\` has been renamed to \`${n}\`.`, "Update your configuration file to silence this warning."]);
  }
  var ec2 = { inherit: "inherit", current: "currentColor", transparent: "transparent", black: "#000", white: "#fff", slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" }, gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151", 800: "#1f2937", 900: "#111827" }, zinc: { 50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b" }, neutral: { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717" }, stone: { 50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1", 400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c", 800: "#292524", 900: "#1c1917" }, red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" }, orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12" }, amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" }, yellow: { 50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047", 400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207", 800: "#854d0e", 900: "#713f12" }, lime: { 50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264", 400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f", 800: "#3f6212", 900: "#365314" }, green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" }, emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b" }, teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a" }, cyan: { 50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490", 800: "#155e75", 900: "#164e63" }, sky: { 50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e" }, blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a" }, indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" }, violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95" }, purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe", 400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce", 800: "#6b21a8", 900: "#581c87" }, fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc", 400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf", 800: "#86198f", 900: "#701a75" }, pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4", 400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d", 800: "#9d174d", 900: "#831843" }, rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337" }, get lightBlue() {
    return zt({ version: "v2.2", from: "lightBlue", to: "sky" }), this.sky;
  }, get warmGray() {
    return zt({ version: "v3.0", from: "warmGray", to: "stone" }), this.stone;
  }, get trueGray() {
    return zt({ version: "v3.0", from: "trueGray", to: "neutral" }), this.neutral;
  }, get coolGray() {
    return zt({ version: "v3.0", from: "coolGray", to: "gray" }), this.gray;
  }, get blueGray() {
    return zt({ version: "v3.0", from: "blueGray", to: "slate" }), this.slate;
  } };
});
var Vu = k((ei) => {
  "use strict";
  Object.defineProperty(ei, "__esModule", { value: true });
  Object.defineProperty(ei, "defaults", { enumerable: true, get: () => tc });
  function tc(e, ...t) {
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
var Yu = k((ti) => {
  "use strict";
  Object.defineProperty(ti, "__esModule", { value: true });
  Object.defineProperty(ti, "toPath", { enumerable: true, get: () => rc });
  function rc(e) {
    if (Array.isArray(e))
      return e;
    let t = e.split("[").length - 1, n = e.split("]").length - 1;
    if (t !== n)
      throw new Error(`Path is invalid. Has unbalanced brackets: ${e}`);
    return e.split(/\.(?![^\[]*\])|[\[\]]/g).filter(Boolean);
  }
});
var Qu = k((ri) => {
  "use strict";
  Object.defineProperty(ri, "__esModule", { value: true });
  Object.defineProperty(ri, "normalizeConfig", { enumerable: true, get: () => ic });
  var Ut = nc((Jr(), Ir(Kr)));
  function Xu(e) {
    if (typeof WeakMap != "function")
      return null;
    var t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new WeakMap();
    return (Xu = function(r) {
      return r ? n : t;
    })(e);
  }
  function nc(e, t) {
    if (!t && e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var n = Xu(t);
    if (n && n.has(e))
      return n.get(e);
    var r = {}, i = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var o in e)
      if (o !== "default" && Object.prototype.hasOwnProperty.call(e, o)) {
        var u2 = i ? Object.getOwnPropertyDescriptor(e, o) : null;
        u2 && (u2.get || u2.set) ? Object.defineProperty(r, o, u2) : r[o] = e[o];
      }
    return r.default = e, n && n.set(e, r), r;
  }
  function ic(e) {
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
    })() || Ut.default.warn("purge-deprecation", ["The `purge`/`content` options have changed in Tailwind CSS v3.0.", "Update your configuration file to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#configure-content-sources"]), e.safelist = (() => {
      var r;
      let { content: i, purge: o, safelist: u2 } = e;
      return Array.isArray(u2) ? u2 : Array.isArray(i == null ? void 0 : i.safelist) ? i.safelist : Array.isArray(o == null ? void 0 : o.safelist) ? o.safelist : Array.isArray(o == null || (r = o.options) === null || r === void 0 ? void 0 : r.safelist) ? o.options.safelist : [];
    })(), typeof e.prefix == "function")
      Ut.default.warn("prefix-function", ["As of Tailwind CSS v3.0, `prefix` cannot be a function.", "Update `prefix` in your configuration to be a string to eliminate this warning.", "https://tailwindcss.com/docs/upgrade-guide#prefix-cannot-be-a-function"]), e.prefix = "";
    else {
      var n;
      e.prefix = (n = e.prefix) !== null && n !== void 0 ? n : "";
    }
    e.content = { files: (() => {
      let { content: r, purge: i } = e;
      return Array.isArray(i) ? i : Array.isArray(i == null ? void 0 : i.content) ? i.content : Array.isArray(r) ? r : Array.isArray(r == null ? void 0 : r.content) ? r.content : Array.isArray(r == null ? void 0 : r.files) ? r.files : [];
    })(), extract: (() => {
      let r = (() => {
        var u2, s, a, l2, f, c2, p, d2, h2, m2;
        return !((u2 = e.purge) === null || u2 === void 0) && u2.extract ? e.purge.extract : !((s = e.content) === null || s === void 0) && s.extract ? e.content.extract : !((a = e.purge) === null || a === void 0 || (l2 = a.extract) === null || l2 === void 0) && l2.DEFAULT ? e.purge.extract.DEFAULT : !((f = e.content) === null || f === void 0 || (c2 = f.extract) === null || c2 === void 0) && c2.DEFAULT ? e.content.extract.DEFAULT : !((p = e.purge) === null || p === void 0 || (d2 = p.options) === null || d2 === void 0) && d2.extractors ? e.purge.options.extractors : !((h2 = e.content) === null || h2 === void 0 || (m2 = h2.options) === null || m2 === void 0) && m2.extractors ? e.content.options.extractors : {};
      })(), i = {}, o = (() => {
        var u2, s, a, l2;
        if (!((u2 = e.purge) === null || u2 === void 0 || (s = u2.options) === null || s === void 0) && s.defaultExtractor)
          return e.purge.options.defaultExtractor;
        if (!((a = e.content) === null || a === void 0 || (l2 = a.options) === null || l2 === void 0) && l2.defaultExtractor)
          return e.content.options.defaultExtractor;
      })();
      if (o !== void 0 && (i.DEFAULT = o), typeof r == "function")
        i.DEFAULT = r;
      else if (Array.isArray(r))
        for (let { extensions: u2, extractor: s } of r ?? [])
          for (let a of u2)
            i[a] = s;
      else
        typeof r == "object" && r !== null && Object.assign(i, r);
      return i;
    })(), transform: (() => {
      let r = (() => {
        var o, u2, s, a, l2, f;
        return !((o = e.purge) === null || o === void 0) && o.transform ? e.purge.transform : !((u2 = e.content) === null || u2 === void 0) && u2.transform ? e.content.transform : !((s = e.purge) === null || s === void 0 || (a = s.transform) === null || a === void 0) && a.DEFAULT ? e.purge.transform.DEFAULT : !((l2 = e.content) === null || l2 === void 0 || (f = l2.transform) === null || f === void 0) && f.DEFAULT ? e.content.transform.DEFAULT : {};
      })(), i = {};
      return typeof r == "function" && (i.DEFAULT = r), typeof r == "object" && r !== null && Object.assign(i, r), i;
    })() };
    for (let r of e.content.files)
      if (typeof r == "string" && /{([^,]*?)}/g.test(r)) {
        Ut.default.warn("invalid-glob-braces", [`The glob pattern ${(0, Ut.dim)(r)} in your Tailwind CSS configuration is invalid.`, `Update it to ${(0, Ut.dim)(r.replace(/{([^,]*?)}/g, "$1"))} to silence this warning.`]);
        break;
      }
    return e;
  }
});
var Ku = k((ni) => {
  "use strict";
  Object.defineProperty(ni, "__esModule", { value: true });
  Object.defineProperty(ni, "default", { enumerable: true, get: () => oc });
  function oc(e) {
    if (Object.prototype.toString.call(e) !== "[object Object]")
      return false;
    let t = Object.getPrototypeOf(e);
    return t === null || t === Object.prototype;
  }
});
var Ju = k((oi) => {
  "use strict";
  Object.defineProperty(oi, "__esModule", { value: true });
  Object.defineProperty(oi, "cloneDeep", { enumerable: true, get: () => ii });
  function ii(e) {
    return Array.isArray(e) ? e.map((t) => ii(t)) : typeof e == "object" && e !== null ? Object.fromEntries(Object.entries(e).map(([t, n]) => [t, ii(n)])) : e;
  }
});
var ui = k((Zr, Zu) => {
  "use strict";
  Zr.__esModule = true;
  Zr.default = ac;
  function uc(e) {
    for (var t = e.toLowerCase(), n = "", r = false, i = 0; i < 6 && t[i] !== void 0; i++) {
      var o = t.charCodeAt(i), u2 = o >= 97 && o <= 102 || o >= 48 && o <= 57;
      if (r = o === 32, !u2)
        break;
      n += t[i];
    }
    if (n.length !== 0) {
      var s = parseInt(n, 16), a = s >= 55296 && s <= 57343;
      return a || s === 0 || s > 1114111 ? ["\uFFFD", n.length + (r ? 1 : 0)] : [String.fromCodePoint(s), n.length + (r ? 1 : 0)];
    }
  }
  var sc = /\\/;
  function ac(e) {
    var t = sc.test(e);
    if (!t)
      return e;
    for (var n = "", r = 0; r < e.length; r++) {
      if (e[r] === "\\") {
        var i = uc(e.slice(r + 1, r + 7));
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
  Zu.exports = Zr.default;
});
var ts = k((en, es) => {
  "use strict";
  en.__esModule = true;
  en.default = lc;
  function lc(e) {
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
  es.exports = en.default;
});
var ns = k((tn, rs) => {
  "use strict";
  tn.__esModule = true;
  tn.default = fc;
  function fc(e) {
    for (var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)
      n[r - 1] = arguments[r];
    for (; n.length > 0; ) {
      var i = n.shift();
      e[i] || (e[i] = {}), e = e[i];
    }
  }
  rs.exports = tn.default;
});
var os = k((rn, is) => {
  "use strict";
  rn.__esModule = true;
  rn.default = cc;
  function cc(e) {
    for (var t = "", n = e.indexOf("/*"), r = 0; n >= 0; ) {
      t = t + e.slice(r, n);
      var i = e.indexOf("*/", n + 2);
      if (i < 0)
        return t;
      r = i + 2, n = e.indexOf("/*", r);
    }
    return t = t + e.slice(r), t;
  }
  is.exports = rn.default;
});
var Gt = k((Oe) => {
  "use strict";
  Oe.__esModule = true;
  Oe.stripComments = Oe.ensureObject = Oe.getProp = Oe.unesc = void 0;
  var dc = nn(ui());
  Oe.unesc = dc.default;
  var pc = nn(ts());
  Oe.getProp = pc.default;
  var hc = nn(ns());
  Oe.ensureObject = hc.default;
  var mc = nn(os());
  Oe.stripComments = mc.default;
  function nn(e) {
    return e && e.__esModule ? e : { default: e };
  }
});
var Me = k((jt, as) => {
  "use strict";
  jt.__esModule = true;
  jt.default = void 0;
  var us = Gt();
  function ss(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Dc(e, t, n) {
    return t && ss(e.prototype, t), n && ss(e, n), e;
  }
  var gc = function e(t, n) {
    if (typeof t != "object" || t === null)
      return t;
    var r = new t.constructor();
    for (var i in t)
      if (t.hasOwnProperty(i)) {
        var o = t[i], u2 = typeof o;
        i === "parent" && u2 === "object" ? n && (r[i] = n) : o instanceof Array ? r[i] = o.map(function(s) {
          return e(s, r);
        }) : r[i] = e(o, r);
      }
    return r;
  }, bc = function() {
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
      var i = gc(this);
      for (var o in r)
        i[o] = r[o];
      return i;
    }, t.appendToPropertyAndEscape = function(r, i, o) {
      this.raws || (this.raws = {});
      var u2 = this[r], s = this.raws[r];
      this[r] = u2 + i, s || o !== i ? this.raws[r] = (s || u2) + o : delete this.raws[r];
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
    }, Dc(e, [{ key: "rawSpaceBefore", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.before;
      return r === void 0 && (r = this.spaces && this.spaces.before), r || "";
    }, set: function(r) {
      (0, us.ensureObject)(this, "raws", "spaces"), this.raws.spaces.before = r;
    } }, { key: "rawSpaceAfter", get: function() {
      var r = this.raws && this.raws.spaces && this.raws.spaces.after;
      return r === void 0 && (r = this.spaces.after), r || "";
    }, set: function(r) {
      (0, us.ensureObject)(this, "raws", "spaces"), this.raws.spaces.after = r;
    } }]), e;
  }();
  jt.default = bc;
  as.exports = jt.default;
});
var ne = k((U) => {
  "use strict";
  U.__esModule = true;
  U.UNIVERSAL = U.ATTRIBUTE = U.CLASS = U.COMBINATOR = U.COMMENT = U.ID = U.NESTING = U.PSEUDO = U.ROOT = U.SELECTOR = U.STRING = U.TAG = void 0;
  var vc = "tag";
  U.TAG = vc;
  var yc = "string";
  U.STRING = yc;
  var xc = "selector";
  U.SELECTOR = xc;
  var Fc = "root";
  U.ROOT = Fc;
  var wc = "pseudo";
  U.PSEUDO = wc;
  var Ec = "nesting";
  U.NESTING = Ec;
  var Sc = "id";
  U.ID = Sc;
  var Cc = "comment";
  U.COMMENT = Cc;
  var _c = "combinator";
  U.COMBINATOR = _c;
  var kc = "class";
  U.CLASS = kc;
  var Tc = "attribute";
  U.ATTRIBUTE = Tc;
  var Ac = "universal";
  U.UNIVERSAL = Ac;
});
var on = k((Ht, ds) => {
  "use strict";
  Ht.__esModule = true;
  Ht.default = void 0;
  var Oc = Bc(Me()), Ne = Pc(ne());
  function cs() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return cs = function() {
      return e;
    }, e;
  }
  function Pc(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = cs();
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
  function Bc(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Ic(e, t) {
    var n;
    if (typeof Symbol > "u" || e[Symbol.iterator] == null) {
      if (Array.isArray(e) || (n = Rc(e)) || t && e && typeof e.length == "number") {
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
  function Rc(e, t) {
    if (e) {
      if (typeof e == "string")
        return ls(e, t);
      var n = Object.prototype.toString.call(e).slice(8, -1);
      if (n === "Object" && e.constructor && (n = e.constructor.name), n === "Map" || n === "Set")
        return Array.from(e);
      if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
        return ls(e, t);
    }
  }
  function ls(e, t) {
    (t == null || t > e.length) && (t = e.length);
    for (var n = 0, r = new Array(t); n < t; n++)
      r[n] = e[n];
    return r;
  }
  function fs2(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Lc(e, t, n) {
    return t && fs2(e.prototype, t), n && fs2(e, n), e;
  }
  function Mc(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, si(e, t);
  }
  function si(e, t) {
    return si = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, si(e, t);
  }
  var Nc = function(e) {
    Mc(t, e);
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
      for (var u2 in this.indexes)
        o = this.indexes[u2], o >= i && (this.indexes[u2] = o - 1);
      return this;
    }, n.removeAll = function() {
      for (var i = Ic(this.nodes), o; !(o = i()).done; ) {
        var u2 = o.value;
        u2.parent = void 0;
      }
      return this.nodes = [], this;
    }, n.empty = function() {
      return this.removeAll();
    }, n.insertAfter = function(i, o) {
      o.parent = this;
      var u2 = this.index(i);
      this.nodes.splice(u2 + 1, 0, o), o.parent = this;
      var s;
      for (var a in this.indexes)
        s = this.indexes[a], u2 <= s && (this.indexes[a] = s + 1);
      return this;
    }, n.insertBefore = function(i, o) {
      o.parent = this;
      var u2 = this.index(i);
      this.nodes.splice(u2, 0, o), o.parent = this;
      var s;
      for (var a in this.indexes)
        s = this.indexes[a], s <= u2 && (this.indexes[a] = s + 1);
      return this;
    }, n._findChildAtPosition = function(i, o) {
      var u2 = void 0;
      return this.each(function(s) {
        if (s.atPosition) {
          var a = s.atPosition(i, o);
          if (a)
            return u2 = a, false;
        } else if (s.isAtPosition(i, o))
          return u2 = s, false;
      }), u2;
    }, n.atPosition = function(i, o) {
      if (this.isAtPosition(i, o))
        return this._findChildAtPosition(i, o) || this;
    }, n._inferEndPosition = function() {
      this.last && this.last.source && this.last.source.end && (this.source = this.source || {}, this.source.end = this.source.end || {}, Object.assign(this.source.end, this.last.source.end));
    }, n.each = function(i) {
      this.lastEach || (this.lastEach = 0), this.indexes || (this.indexes = {}), this.lastEach++;
      var o = this.lastEach;
      if (this.indexes[o] = 0, !!this.length) {
        for (var u2, s; this.indexes[o] < this.length && (u2 = this.indexes[o], s = i(this.at(u2), u2), s !== false); )
          this.indexes[o] += 1;
        if (delete this.indexes[o], s === false)
          return false;
      }
    }, n.walk = function(i) {
      return this.each(function(o, u2) {
        var s = i(o, u2);
        if (s !== false && o.length && (s = o.walk(i)), s === false)
          return false;
      });
    }, n.walkAttributes = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.ATTRIBUTE)
          return i.call(o, u2);
      });
    }, n.walkClasses = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.CLASS)
          return i.call(o, u2);
      });
    }, n.walkCombinators = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.COMBINATOR)
          return i.call(o, u2);
      });
    }, n.walkComments = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.COMMENT)
          return i.call(o, u2);
      });
    }, n.walkIds = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.ID)
          return i.call(o, u2);
      });
    }, n.walkNesting = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.NESTING)
          return i.call(o, u2);
      });
    }, n.walkPseudos = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.PSEUDO)
          return i.call(o, u2);
      });
    }, n.walkTags = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.TAG)
          return i.call(o, u2);
      });
    }, n.walkUniversals = function(i) {
      var o = this;
      return this.walk(function(u2) {
        if (u2.type === Ne.UNIVERSAL)
          return i.call(o, u2);
      });
    }, n.split = function(i) {
      var o = this, u2 = [];
      return this.reduce(function(s, a, l2) {
        var f = i.call(o, a);
        return u2.push(a), f ? (s.push(u2), u2 = []) : l2 === o.length - 1 && s.push(u2), s;
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
    }, Lc(t, [{ key: "first", get: function() {
      return this.at(0);
    } }, { key: "last", get: function() {
      return this.at(this.length - 1);
    } }, { key: "length", get: function() {
      return this.nodes.length;
    } }]), t;
  }(Oc.default);
  Ht.default = Nc;
  ds.exports = Ht.default;
});
var li = k((Vt, hs) => {
  "use strict";
  Vt.__esModule = true;
  Vt.default = void 0;
  var Wc = qc(on()), $c = ne();
  function qc(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function ps(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function zc(e, t, n) {
    return t && ps(e.prototype, t), n && ps(e, n), e;
  }
  function Uc(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, ai(e, t);
  }
  function ai(e, t) {
    return ai = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, ai(e, t);
  }
  var Gc = function(e) {
    Uc(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = $c.ROOT, i;
    }
    var n = t.prototype;
    return n.toString = function() {
      var i = this.reduce(function(o, u2) {
        return o.push(String(u2)), o;
      }, []).join(",");
      return this.trailingComma ? i + "," : i;
    }, n.error = function(i, o) {
      return this._error ? this._error(i, o) : new Error(i);
    }, zc(t, [{ key: "errorGenerator", set: function(i) {
      this._error = i;
    } }]), t;
  }(Wc.default);
  Vt.default = Gc;
  hs.exports = Vt.default;
});
var ci = k((Yt, ms) => {
  "use strict";
  Yt.__esModule = true;
  Yt.default = void 0;
  var jc = Vc(on()), Hc = ne();
  function Vc(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Yc(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, fi(e, t);
  }
  function fi(e, t) {
    return fi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, fi(e, t);
  }
  var Xc = function(e) {
    Yc(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Hc.SELECTOR, r;
    }
    return t;
  }(jc.default);
  Yt.default = Xc;
  ms.exports = Yt.default;
});
var un = k((Rb, Ds) => {
  "use strict";
  var Qc = {}, Kc = Qc.hasOwnProperty, Jc = function(t, n) {
    if (!t)
      return n;
    var r = {};
    for (var i in n)
      r[i] = Kc.call(t, i) ? t[i] : n[i];
    return r;
  }, Zc = /[ -,\.\/:-@\[-\^`\{-~]/, ed = /[ -,\.\/:-@\[\]\^`\{-~]/, td2 = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g, di = function e(t, n) {
    n = Jc(n, e.options), n.quotes != "single" && n.quotes != "double" && (n.quotes = "single");
    for (var r = n.quotes == "double" ? '"' : "'", i = n.isIdentifier, o = t.charAt(0), u2 = "", s = 0, a = t.length; s < a; ) {
      var l2 = t.charAt(s++), f = l2.charCodeAt(), c2 = void 0;
      if (f < 32 || f > 126) {
        if (f >= 55296 && f <= 56319 && s < a) {
          var p = t.charCodeAt(s++);
          (p & 64512) == 56320 ? f = ((f & 1023) << 10) + (p & 1023) + 65536 : s--;
        }
        c2 = "\\" + f.toString(16).toUpperCase() + " ";
      } else
        n.escapeEverything ? Zc.test(l2) ? c2 = "\\" + l2 : c2 = "\\" + f.toString(16).toUpperCase() + " " : /[\t\n\f\r\x0B]/.test(l2) ? c2 = "\\" + f.toString(16).toUpperCase() + " " : l2 == "\\" || !i && (l2 == '"' && r == l2 || l2 == "'" && r == l2) || i && ed.test(l2) ? c2 = "\\" + l2 : c2 = l2;
      u2 += c2;
    }
    return i && (/^-[-\d]/.test(u2) ? u2 = "\\-" + u2.slice(1) : /\d/.test(o) && (u2 = "\\3" + o + " " + u2.slice(1))), u2 = u2.replace(td2, function(d2, h2, m2) {
      return h2 && h2.length % 2 ? d2 : (h2 || "") + m2;
    }), !i && n.wrap ? r + u2 + r : u2;
  };
  di.options = { escapeEverything: false, isIdentifier: false, quotes: "single", wrap: false };
  di.version = "3.0.0";
  Ds.exports = di;
});
var hi = k((Xt, vs) => {
  "use strict";
  Xt.__esModule = true;
  Xt.default = void 0;
  var rd = bs(un()), nd = Gt(), id = bs(Me()), od = ne();
  function bs(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function gs(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function ud(e, t, n) {
    return t && gs(e.prototype, t), n && gs(e, n), e;
  }
  function sd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, pi(e, t);
  }
  function pi(e, t) {
    return pi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, pi(e, t);
  }
  var ad = function(e) {
    sd(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = od.CLASS, i._constructed = true, i;
    }
    var n = t.prototype;
    return n.valueToString = function() {
      return "." + e.prototype.valueToString.call(this);
    }, ud(t, [{ key: "value", get: function() {
      return this._value;
    }, set: function(i) {
      if (this._constructed) {
        var o = (0, rd.default)(i, { isIdentifier: true });
        o !== i ? ((0, nd.ensureObject)(this, "raws"), this.raws.value = o) : this.raws && delete this.raws.value;
      }
      this._value = i;
    } }]), t;
  }(id.default);
  Xt.default = ad;
  vs.exports = Xt.default;
});
var Di = k((Qt, ys) => {
  "use strict";
  Qt.__esModule = true;
  Qt.default = void 0;
  var ld = cd(Me()), fd2 = ne();
  function cd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function dd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, mi(e, t);
  }
  function mi(e, t) {
    return mi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, mi(e, t);
  }
  var pd = function(e) {
    dd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = fd2.COMMENT, r;
    }
    return t;
  }(ld.default);
  Qt.default = pd;
  ys.exports = Qt.default;
});
var bi = k((Kt, xs) => {
  "use strict";
  Kt.__esModule = true;
  Kt.default = void 0;
  var hd = Dd(Me()), md = ne();
  function Dd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function gd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, gi(e, t);
  }
  function gi(e, t) {
    return gi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, gi(e, t);
  }
  var bd = function(e) {
    gd(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = md.ID, i;
    }
    var n = t.prototype;
    return n.valueToString = function() {
      return "#" + e.prototype.valueToString.call(this);
    }, t;
  }(hd.default);
  Kt.default = bd;
  xs.exports = Kt.default;
});
var sn = k((Jt, Es) => {
  "use strict";
  Jt.__esModule = true;
  Jt.default = void 0;
  var vd = ws(un()), yd = Gt(), xd = ws(Me());
  function ws(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Fs(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Fd(e, t, n) {
    return t && Fs(e.prototype, t), n && Fs(e, n), e;
  }
  function wd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, vi(e, t);
  }
  function vi(e, t) {
    return vi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, vi(e, t);
  }
  var Ed = function(e) {
    wd(t, e);
    function t() {
      return e.apply(this, arguments) || this;
    }
    var n = t.prototype;
    return n.qualifiedName = function(i) {
      return this.namespace ? this.namespaceString + "|" + i : i;
    }, n.valueToString = function() {
      return this.qualifiedName(e.prototype.valueToString.call(this));
    }, Fd(t, [{ key: "namespace", get: function() {
      return this._namespace;
    }, set: function(i) {
      if (i === true || i === "*" || i === "&") {
        this._namespace = i, this.raws && delete this.raws.namespace;
        return;
      }
      var o = (0, vd.default)(i, { isIdentifier: true });
      this._namespace = i, o !== i ? ((0, yd.ensureObject)(this, "raws"), this.raws.namespace = o) : this.raws && delete this.raws.namespace;
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
  }(xd.default);
  Jt.default = Ed;
  Es.exports = Jt.default;
});
var xi = k((Zt, Ss) => {
  "use strict";
  Zt.__esModule = true;
  Zt.default = void 0;
  var Sd = _d(sn()), Cd = ne();
  function _d(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function kd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, yi(e, t);
  }
  function yi(e, t) {
    return yi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, yi(e, t);
  }
  var Td = function(e) {
    kd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Cd.TAG, r;
    }
    return t;
  }(Sd.default);
  Zt.default = Td;
  Ss.exports = Zt.default;
});
var wi = k((er, Cs) => {
  "use strict";
  er.__esModule = true;
  er.default = void 0;
  var Ad = Pd(Me()), Od = ne();
  function Pd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Bd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Fi(e, t);
  }
  function Fi(e, t) {
    return Fi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Fi(e, t);
  }
  var Id = function(e) {
    Bd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Od.STRING, r;
    }
    return t;
  }(Ad.default);
  er.default = Id;
  Cs.exports = er.default;
});
var Si = k((tr, _s) => {
  "use strict";
  tr.__esModule = true;
  tr.default = void 0;
  var Rd = Md(on()), Ld = ne();
  function Md(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Nd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Ei(e, t);
  }
  function Ei(e, t) {
    return Ei = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Ei(e, t);
  }
  var Wd = function(e) {
    Nd(t, e);
    function t(r) {
      var i;
      return i = e.call(this, r) || this, i.type = Ld.PSEUDO, i;
    }
    var n = t.prototype;
    return n.toString = function() {
      var i = this.length ? "(" + this.map(String).join(",") + ")" : "";
      return [this.rawSpaceBefore, this.stringifyProperty("value"), i, this.rawSpaceAfter].join("");
    }, t;
  }(Rd.default);
  tr.default = Wd;
  _s.exports = tr.default;
});
var Ts = k((Lb, ks) => {
  ks.exports = function(t, n) {
    return function(...r) {
      return console.warn(n), t(...r);
    };
  };
});
var Oi = k((ir) => {
  "use strict";
  ir.__esModule = true;
  ir.unescapeValue = Ai;
  ir.default = void 0;
  var rr = Ti(un()), $d = Ti(ui()), qd = Ti(sn()), zd = ne(), Ci;
  function Ti(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function As(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function Ud(e, t, n) {
    return t && As(e.prototype, t), n && As(e, n), e;
  }
  function Gd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, ki(e, t);
  }
  function ki(e, t) {
    return ki = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, ki(e, t);
  }
  var nr = Ts(), jd = /^('|")([^]*)\1$/, Hd = nr(function() {
  }, "Assigning an attribute a value containing characters that might need to be escaped is deprecated. Call attribute.setValue() instead."), Vd = nr(function() {
  }, "Assigning attr.quoted is deprecated and has no effect. Assign to attr.quoteMark instead."), Yd = nr(function() {
  }, "Constructing an Attribute selector with a value without specifying quoteMark is deprecated. Note: The value should be unescaped now.");
  function Ai(e) {
    var t = false, n = null, r = e, i = r.match(jd);
    return i && (n = i[1], r = i[2]), r = (0, $d.default)(r), r !== e && (t = true), { deprecatedUsage: t, unescaped: r, quoteMark: n };
  }
  function Xd(e) {
    if (e.quoteMark !== void 0 || e.value === void 0)
      return e;
    Yd();
    var t = Ai(e.value), n = t.quoteMark, r = t.unescaped;
    return e.raws || (e.raws = {}), e.raws.value === void 0 && (e.raws.value = e.value), e.value = r, e.quoteMark = n, e;
  }
  var an = function(e) {
    Gd(t, e);
    function t(r) {
      var i;
      return r === void 0 && (r = {}), i = e.call(this, Xd(r)) || this, i.type = zd.ATTRIBUTE, i.raws = i.raws || {}, Object.defineProperty(i.raws, "unquoted", { get: nr(function() {
        return i.value;
      }, "attr.raws.unquoted is deprecated. Call attr.value instead."), set: nr(function() {
        return i.value;
      }, "Setting attr.raws.unquoted is deprecated and has no effect. attr.value is unescaped by default now.") }), i._constructed = true, i;
    }
    var n = t.prototype;
    return n.getQuotedValue = function(i) {
      i === void 0 && (i = {});
      var o = this._determineQuoteMark(i), u2 = _i[o], s = (0, rr.default)(this._value, u2);
      return s;
    }, n._determineQuoteMark = function(i) {
      return i.smart ? this.smartQuoteMark(i) : this.preferredQuoteMark(i);
    }, n.setValue = function(i, o) {
      o === void 0 && (o = {}), this._value = i, this._quoteMark = this._determineQuoteMark(o), this._syncRawValue();
    }, n.smartQuoteMark = function(i) {
      var o = this.value, u2 = o.replace(/[^']/g, "").length, s = o.replace(/[^"]/g, "").length;
      if (u2 + s === 0) {
        var a = (0, rr.default)(o, { isIdentifier: true });
        if (a === o)
          return t.NO_QUOTE;
        var l2 = this.preferredQuoteMark(i);
        if (l2 === t.NO_QUOTE) {
          var f = this.quoteMark || i.quoteMark || t.DOUBLE_QUOTE, c2 = _i[f], p = (0, rr.default)(o, c2);
          if (p.length < a.length)
            return f;
        }
        return l2;
      } else
        return s === u2 ? this.preferredQuoteMark(i) : s < u2 ? t.DOUBLE_QUOTE : t.SINGLE_QUOTE;
    }, n.preferredQuoteMark = function(i) {
      var o = i.preferCurrentQuoteMark ? this.quoteMark : i.quoteMark;
      return o === void 0 && (o = i.preferCurrentQuoteMark ? i.quoteMark : this.quoteMark), o === void 0 && (o = t.DOUBLE_QUOTE), o;
    }, n._syncRawValue = function() {
      var i = (0, rr.default)(this._value, _i[this.quoteMark]);
      i === this._value ? this.raws && delete this.raws.value : this.raws.value = i;
    }, n._handleEscapes = function(i, o) {
      if (this._constructed) {
        var u2 = (0, rr.default)(o, { isIdentifier: true });
        u2 !== o ? this.raws[i] = u2 : delete this.raws[i];
      }
    }, n._spacesFor = function(i) {
      var o = { before: "", after: "" }, u2 = this.spaces[i] || {}, s = this.raws.spaces && this.raws.spaces[i] || {};
      return Object.assign(o, u2, s);
    }, n._stringFor = function(i, o, u2) {
      o === void 0 && (o = i), u2 === void 0 && (u2 = Os);
      var s = this._spacesFor(o);
      return u2(this.stringifyProperty(i), s);
    }, n.offsetOf = function(i) {
      var o = 1, u2 = this._spacesFor("attribute");
      if (o += u2.before.length, i === "namespace" || i === "ns")
        return this.namespace ? o : -1;
      if (i === "attributeNS" || (o += this.namespaceString.length, this.namespace && (o += 1), i === "attribute"))
        return o;
      o += this.stringifyProperty("attribute").length, o += u2.after.length;
      var s = this._spacesFor("operator");
      o += s.before.length;
      var a = this.stringifyProperty("operator");
      if (i === "operator")
        return a ? o : -1;
      o += a.length, o += s.after.length;
      var l2 = this._spacesFor("value");
      o += l2.before.length;
      var f = this.stringifyProperty("value");
      if (i === "value")
        return f ? o : -1;
      o += f.length, o += l2.after.length;
      var c2 = this._spacesFor("insensitive");
      return o += c2.before.length, i === "insensitive" && this.insensitive ? o : -1;
    }, n.toString = function() {
      var i = this, o = [this.rawSpaceBefore, "["];
      return o.push(this._stringFor("qualifiedAttribute", "attribute")), this.operator && (this.value || this.value === "") && (o.push(this._stringFor("operator")), o.push(this._stringFor("value")), o.push(this._stringFor("insensitiveFlag", "insensitive", function(u2, s) {
        return u2.length > 0 && !i.quoted && s.before.length === 0 && !(i.spaces.value && i.spaces.value.after) && (s.before = " "), Os(u2, s);
      }))), o.push("]"), o.push(this.rawSpaceAfter), o.join("");
    }, Ud(t, [{ key: "quoted", get: function() {
      var i = this.quoteMark;
      return i === "'" || i === '"';
    }, set: function(i) {
      Vd();
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
        var o = Ai(i), u2 = o.deprecatedUsage, s = o.unescaped, a = o.quoteMark;
        if (u2 && Hd(), s === this._value && a === this._quoteMark)
          return;
        this._value = s, this._quoteMark = a, this._syncRawValue();
      } else
        this._value = i;
    } }, { key: "attribute", get: function() {
      return this._attribute;
    }, set: function(i) {
      this._handleEscapes("attribute", i), this._attribute = i;
    } }]), t;
  }(qd.default);
  ir.default = an;
  an.NO_QUOTE = null;
  an.SINGLE_QUOTE = "'";
  an.DOUBLE_QUOTE = '"';
  var _i = (Ci = { "'": { quotes: "single", wrap: true }, '"': { quotes: "double", wrap: true } }, Ci[null] = { isIdentifier: true }, Ci);
  function Os(e, t) {
    return "" + t.before + e + t.after;
  }
});
var Bi = k((or, Ps) => {
  "use strict";
  or.__esModule = true;
  or.default = void 0;
  var Qd = Jd(sn()), Kd = ne();
  function Jd(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Zd(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Pi(e, t);
  }
  function Pi(e, t) {
    return Pi = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Pi(e, t);
  }
  var ep = function(e) {
    Zd(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = Kd.UNIVERSAL, r.value = "*", r;
    }
    return t;
  }(Qd.default);
  or.default = ep;
  Ps.exports = or.default;
});
var Ri = k((ur, Bs) => {
  "use strict";
  ur.__esModule = true;
  ur.default = void 0;
  var tp = np(Me()), rp = ne();
  function np(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function ip(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Ii(e, t);
  }
  function Ii(e, t) {
    return Ii = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Ii(e, t);
  }
  var op = function(e) {
    ip(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = rp.COMBINATOR, r;
    }
    return t;
  }(tp.default);
  ur.default = op;
  Bs.exports = ur.default;
});
var Mi = k((sr, Is) => {
  "use strict";
  sr.__esModule = true;
  sr.default = void 0;
  var up = ap(Me()), sp = ne();
  function ap(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function lp(e, t) {
    e.prototype = Object.create(t.prototype), e.prototype.constructor = e, Li(e, t);
  }
  function Li(e, t) {
    return Li = Object.setPrototypeOf || function(r, i) {
      return r.__proto__ = i, r;
    }, Li(e, t);
  }
  var fp = function(e) {
    lp(t, e);
    function t(n) {
      var r;
      return r = e.call(this, n) || this, r.type = sp.NESTING, r.value = "&", r;
    }
    return t;
  }(up.default);
  sr.default = fp;
  Is.exports = sr.default;
});
var Ls = k((ln, Rs) => {
  "use strict";
  ln.__esModule = true;
  ln.default = cp;
  function cp(e) {
    return e.sort(function(t, n) {
      return t - n;
    });
  }
  Rs.exports = ln.default;
});
var Ni = k((_) => {
  "use strict";
  _.__esModule = true;
  _.combinator = _.word = _.comment = _.str = _.tab = _.newline = _.feed = _.cr = _.backslash = _.bang = _.slash = _.doubleQuote = _.singleQuote = _.space = _.greaterThan = _.pipe = _.equals = _.plus = _.caret = _.tilde = _.dollar = _.closeSquare = _.openSquare = _.closeParenthesis = _.openParenthesis = _.semicolon = _.colon = _.comma = _.at = _.asterisk = _.ampersand = void 0;
  var dp = 38;
  _.ampersand = dp;
  var pp = 42;
  _.asterisk = pp;
  var hp = 64;
  _.at = hp;
  var mp = 44;
  _.comma = mp;
  var Dp = 58;
  _.colon = Dp;
  var gp = 59;
  _.semicolon = gp;
  var bp = 40;
  _.openParenthesis = bp;
  var vp = 41;
  _.closeParenthesis = vp;
  var yp = 91;
  _.openSquare = yp;
  var xp = 93;
  _.closeSquare = xp;
  var Fp = 36;
  _.dollar = Fp;
  var wp = 126;
  _.tilde = wp;
  var Ep = 94;
  _.caret = Ep;
  var Sp = 43;
  _.plus = Sp;
  var Cp = 61;
  _.equals = Cp;
  var _p = 124;
  _.pipe = _p;
  var kp = 62;
  _.greaterThan = kp;
  var Tp = 32;
  _.space = Tp;
  var Ms = 39;
  _.singleQuote = Ms;
  var Ap = 34;
  _.doubleQuote = Ap;
  var Op = 47;
  _.slash = Op;
  var Pp = 33;
  _.bang = Pp;
  var Bp = 92;
  _.backslash = Bp;
  var Ip = 13;
  _.cr = Ip;
  var Rp = 12;
  _.feed = Rp;
  var Lp = 10;
  _.newline = Lp;
  var Mp = 9;
  _.tab = Mp;
  var Np = Ms;
  _.str = Np;
  var Wp = -1;
  _.comment = Wp;
  var $p = -2;
  _.word = $p;
  var qp = -3;
  _.combinator = qp;
});
var $s = k((ar) => {
  "use strict";
  ar.__esModule = true;
  ar.default = Yp;
  ar.FIELDS = void 0;
  var w2 = zp(Ni()), yt, q;
  function Ws() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return Ws = function() {
      return e;
    }, e;
  }
  function zp(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = Ws();
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
  var Up = (yt = {}, yt[w2.tab] = true, yt[w2.newline] = true, yt[w2.cr] = true, yt[w2.feed] = true, yt), Gp = (q = {}, q[w2.space] = true, q[w2.tab] = true, q[w2.newline] = true, q[w2.cr] = true, q[w2.feed] = true, q[w2.ampersand] = true, q[w2.asterisk] = true, q[w2.bang] = true, q[w2.comma] = true, q[w2.colon] = true, q[w2.semicolon] = true, q[w2.openParenthesis] = true, q[w2.closeParenthesis] = true, q[w2.openSquare] = true, q[w2.closeSquare] = true, q[w2.singleQuote] = true, q[w2.doubleQuote] = true, q[w2.plus] = true, q[w2.pipe] = true, q[w2.tilde] = true, q[w2.greaterThan] = true, q[w2.equals] = true, q[w2.dollar] = true, q[w2.caret] = true, q[w2.slash] = true, q), Wi = {}, Ns = "0123456789abcdefABCDEF";
  for (fn = 0; fn < Ns.length; fn++)
    Wi[Ns.charCodeAt(fn)] = true;
  var fn;
  function jp(e, t) {
    var n = t, r;
    do {
      if (r = e.charCodeAt(n), Gp[r])
        return n - 1;
      r === w2.backslash ? n = Hp(e, n) + 1 : n++;
    } while (n < e.length);
    return n - 1;
  }
  function Hp(e, t) {
    var n = t, r = e.charCodeAt(n + 1);
    if (!Up[r])
      if (Wi[r]) {
        var i = 0;
        do
          n++, i++, r = e.charCodeAt(n + 1);
        while (Wi[r] && i < 6);
        i < 6 && r === w2.space && n++;
      } else
        n++;
    return n;
  }
  var Vp = { TYPE: 0, START_LINE: 1, START_COL: 2, END_LINE: 3, END_COL: 4, START_POS: 5, END_POS: 6 };
  ar.FIELDS = Vp;
  function Yp(e) {
    var t = [], n = e.css.valueOf(), r = n, i = r.length, o = -1, u2 = 1, s = 0, a = 0, l2, f, c2, p, d2, h2, m2, x2, g2, S2, v2, b, y;
    function T(A, P2) {
      if (e.safe)
        n += P2, g2 = n.length - 1;
      else
        throw e.error("Unclosed " + A, u2, s - o, s);
    }
    for (; s < i; ) {
      switch (l2 = n.charCodeAt(s), l2 === w2.newline && (o = s, u2 += 1), l2) {
        case w2.space:
        case w2.tab:
        case w2.newline:
        case w2.cr:
        case w2.feed:
          g2 = s;
          do
            g2 += 1, l2 = n.charCodeAt(g2), l2 === w2.newline && (o = g2, u2 += 1);
          while (l2 === w2.space || l2 === w2.newline || l2 === w2.tab || l2 === w2.cr || l2 === w2.feed);
          y = w2.space, p = u2, c2 = g2 - o - 1, a = g2;
          break;
        case w2.plus:
        case w2.greaterThan:
        case w2.tilde:
        case w2.pipe:
          g2 = s;
          do
            g2 += 1, l2 = n.charCodeAt(g2);
          while (l2 === w2.plus || l2 === w2.greaterThan || l2 === w2.tilde || l2 === w2.pipe);
          y = w2.combinator, p = u2, c2 = s - o, a = g2;
          break;
        case w2.asterisk:
        case w2.ampersand:
        case w2.bang:
        case w2.comma:
        case w2.equals:
        case w2.dollar:
        case w2.caret:
        case w2.openSquare:
        case w2.closeSquare:
        case w2.colon:
        case w2.semicolon:
        case w2.openParenthesis:
        case w2.closeParenthesis:
          g2 = s, y = l2, p = u2, c2 = s - o, a = g2 + 1;
          break;
        case w2.singleQuote:
        case w2.doubleQuote:
          b = l2 === w2.singleQuote ? "'" : '"', g2 = s;
          do
            for (d2 = false, g2 = n.indexOf(b, g2 + 1), g2 === -1 && T("quote", b), h2 = g2; n.charCodeAt(h2 - 1) === w2.backslash; )
              h2 -= 1, d2 = !d2;
          while (d2);
          y = w2.str, p = u2, c2 = s - o, a = g2 + 1;
          break;
        default:
          l2 === w2.slash && n.charCodeAt(s + 1) === w2.asterisk ? (g2 = n.indexOf("*/", s + 2) + 1, g2 === 0 && T("comment", "*/"), f = n.slice(s, g2 + 1), x2 = f.split(`
`), m2 = x2.length - 1, m2 > 0 ? (S2 = u2 + m2, v2 = g2 - x2[m2].length) : (S2 = u2, v2 = o), y = w2.comment, u2 = S2, p = S2, c2 = g2 - v2) : l2 === w2.slash ? (g2 = s, y = l2, p = u2, c2 = s - o, a = g2 + 1) : (g2 = jp(n, s), y = w2.word, p = u2, c2 = g2 - o), a = g2 + 1;
          break;
      }
      t.push([y, u2, s - o, p, c2, s, a]), v2 && (o = v2, v2 = null), s = a;
    }
    return t;
  }
});
var Ys = k((lr, Vs) => {
  "use strict";
  lr.__esModule = true;
  lr.default = void 0;
  var Xp = ve(li()), $i = ve(ci()), Qp = ve(hi()), qs = ve(Di()), Kp = ve(bi()), Jp = ve(xi()), qi = ve(wi()), Zp = ve(Si()), zs = cn(Oi()), e0 = ve(Bi()), zi = ve(Ri()), t0 = ve(Mi()), r0 = ve(Ls()), F = cn($s()), C = cn(Ni()), n0 = cn(ne()), Y = Gt(), nt, Ui;
  function Hs() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return Hs = function() {
      return e;
    }, e;
  }
  function cn(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = Hs();
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
  function ve(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Us(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      r.enumerable = r.enumerable || false, r.configurable = true, "value" in r && (r.writable = true), Object.defineProperty(e, r.key, r);
    }
  }
  function i0(e, t, n) {
    return t && Us(e.prototype, t), n && Us(e, n), e;
  }
  var Hi = (nt = {}, nt[C.space] = true, nt[C.cr] = true, nt[C.feed] = true, nt[C.newline] = true, nt[C.tab] = true, nt), o0 = Object.assign({}, Hi, (Ui = {}, Ui[C.comment] = true, Ui));
  function Gs(e) {
    return { line: e[F.FIELDS.START_LINE], column: e[F.FIELDS.START_COL] };
  }
  function js(e) {
    return { line: e[F.FIELDS.END_LINE], column: e[F.FIELDS.END_COL] };
  }
  function it(e, t, n, r) {
    return { start: { line: e, column: t }, end: { line: n, column: r } };
  }
  function xt(e) {
    return it(e[F.FIELDS.START_LINE], e[F.FIELDS.START_COL], e[F.FIELDS.END_LINE], e[F.FIELDS.END_COL]);
  }
  function Gi(e, t) {
    if (e)
      return it(e[F.FIELDS.START_LINE], e[F.FIELDS.START_COL], t[F.FIELDS.END_LINE], t[F.FIELDS.END_COL]);
  }
  function Ft(e, t) {
    var n = e[t];
    if (typeof n == "string")
      return n.indexOf("\\") !== -1 && ((0, Y.ensureObject)(e, "raws"), e[t] = (0, Y.unesc)(n), e.raws[t] === void 0 && (e.raws[t] = n)), e;
  }
  function ji(e, t) {
    for (var n = -1, r = []; (n = e.indexOf(t, n + 1)) !== -1; )
      r.push(n);
    return r;
  }
  function u0() {
    var e = Array.prototype.concat.apply([], arguments);
    return e.filter(function(t, n) {
      return n === e.indexOf(t);
    });
  }
  var s0 = function() {
    function e(n, r) {
      r === void 0 && (r = {}), this.rule = n, this.options = Object.assign({ lossy: false, safe: false }, r), this.position = 0, this.css = typeof this.rule == "string" ? this.rule : this.rule.selector, this.tokens = (0, F.default)({ css: this.css, error: this._errorGenerator(), safe: this.options.safe });
      var i = Gi(this.tokens[0], this.tokens[this.tokens.length - 1]);
      this.root = new Xp.default({ source: i }), this.root.errorGenerator = this._errorGenerator();
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
      for (this.position++; this.position < this.tokens.length && this.currToken[F.FIELDS.TYPE] !== C.closeSquare; )
        r.push(this.currToken), this.position++;
      if (this.currToken[F.FIELDS.TYPE] !== C.closeSquare)
        return this.expected("closing square bracket", this.currToken[F.FIELDS.START_POS]);
      var o = r.length, u2 = { source: it(i[1], i[2], this.currToken[3], this.currToken[4]), sourceIndex: i[F.FIELDS.START_POS] };
      if (o === 1 && !~[C.word].indexOf(r[0][F.FIELDS.TYPE]))
        return this.expected("attribute", r[0][F.FIELDS.START_POS]);
      for (var s = 0, a = "", l2 = "", f = null, c2 = false; s < o; ) {
        var p = r[s], d2 = this.content(p), h2 = r[s + 1];
        switch (p[F.FIELDS.TYPE]) {
          case C.space:
            if (c2 = true, this.options.lossy)
              break;
            if (f) {
              (0, Y.ensureObject)(u2, "spaces", f);
              var m2 = u2.spaces[f].after || "";
              u2.spaces[f].after = m2 + d2;
              var x2 = (0, Y.getProp)(u2, "raws", "spaces", f, "after") || null;
              x2 && (u2.raws.spaces[f].after = x2 + d2);
            } else
              a = a + d2, l2 = l2 + d2;
            break;
          case C.asterisk:
            if (h2[F.FIELDS.TYPE] === C.equals)
              u2.operator = d2, f = "operator";
            else if ((!u2.namespace || f === "namespace" && !c2) && h2) {
              a && ((0, Y.ensureObject)(u2, "spaces", "attribute"), u2.spaces.attribute.before = a, a = ""), l2 && ((0, Y.ensureObject)(u2, "raws", "spaces", "attribute"), u2.raws.spaces.attribute.before = a, l2 = ""), u2.namespace = (u2.namespace || "") + d2;
              var g2 = (0, Y.getProp)(u2, "raws", "namespace") || null;
              g2 && (u2.raws.namespace += d2), f = "namespace";
            }
            c2 = false;
            break;
          case C.dollar:
            if (f === "value") {
              var S2 = (0, Y.getProp)(u2, "raws", "value");
              u2.value += "$", S2 && (u2.raws.value = S2 + "$");
              break;
            }
          case C.caret:
            h2[F.FIELDS.TYPE] === C.equals && (u2.operator = d2, f = "operator"), c2 = false;
            break;
          case C.combinator:
            if (d2 === "~" && h2[F.FIELDS.TYPE] === C.equals && (u2.operator = d2, f = "operator"), d2 !== "|") {
              c2 = false;
              break;
            }
            h2[F.FIELDS.TYPE] === C.equals ? (u2.operator = d2, f = "operator") : !u2.namespace && !u2.attribute && (u2.namespace = true), c2 = false;
            break;
          case C.word:
            if (h2 && this.content(h2) === "|" && r[s + 2] && r[s + 2][F.FIELDS.TYPE] !== C.equals && !u2.operator && !u2.namespace)
              u2.namespace = d2, f = "namespace";
            else if (!u2.attribute || f === "attribute" && !c2) {
              a && ((0, Y.ensureObject)(u2, "spaces", "attribute"), u2.spaces.attribute.before = a, a = ""), l2 && ((0, Y.ensureObject)(u2, "raws", "spaces", "attribute"), u2.raws.spaces.attribute.before = l2, l2 = ""), u2.attribute = (u2.attribute || "") + d2;
              var v2 = (0, Y.getProp)(u2, "raws", "attribute") || null;
              v2 && (u2.raws.attribute += d2), f = "attribute";
            } else if (!u2.value && u2.value !== "" || f === "value" && !c2) {
              var b = (0, Y.unesc)(d2), y = (0, Y.getProp)(u2, "raws", "value") || "", T = u2.value || "";
              u2.value = T + b, u2.quoteMark = null, (b !== d2 || y) && ((0, Y.ensureObject)(u2, "raws"), u2.raws.value = (y || T) + d2), f = "value";
            } else {
              var A = d2 === "i" || d2 === "I";
              (u2.value || u2.value === "") && (u2.quoteMark || c2) ? (u2.insensitive = A, (!A || d2 === "I") && ((0, Y.ensureObject)(u2, "raws"), u2.raws.insensitiveFlag = d2), f = "insensitive", a && ((0, Y.ensureObject)(u2, "spaces", "insensitive"), u2.spaces.insensitive.before = a, a = ""), l2 && ((0, Y.ensureObject)(u2, "raws", "spaces", "insensitive"), u2.raws.spaces.insensitive.before = l2, l2 = "")) : (u2.value || u2.value === "") && (f = "value", u2.value += d2, u2.raws.value && (u2.raws.value += d2));
            }
            c2 = false;
            break;
          case C.str:
            if (!u2.attribute || !u2.operator)
              return this.error("Expected an attribute followed by an operator preceding the string.", { index: p[F.FIELDS.START_POS] });
            var P2 = (0, zs.unescapeValue)(d2), j = P2.unescaped, ie = P2.quoteMark;
            u2.value = j, u2.quoteMark = ie, f = "value", (0, Y.ensureObject)(u2, "raws"), u2.raws.value = d2, c2 = false;
            break;
          case C.equals:
            if (!u2.attribute)
              return this.expected("attribute", p[F.FIELDS.START_POS], d2);
            if (u2.value)
              return this.error('Unexpected "=" found; an operator was already defined.', { index: p[F.FIELDS.START_POS] });
            u2.operator = u2.operator ? u2.operator + d2 : d2, f = "operator", c2 = false;
            break;
          case C.comment:
            if (f)
              if (c2 || h2 && h2[F.FIELDS.TYPE] === C.space || f === "insensitive") {
                var ue = (0, Y.getProp)(u2, "spaces", f, "after") || "", fe = (0, Y.getProp)(u2, "raws", "spaces", f, "after") || ue;
                (0, Y.ensureObject)(u2, "raws", "spaces", f), u2.raws.spaces[f].after = fe + d2;
              } else {
                var Q = u2[f] || "", oe = (0, Y.getProp)(u2, "raws", f) || Q;
                (0, Y.ensureObject)(u2, "raws"), u2.raws[f] = oe + d2;
              }
            else
              l2 = l2 + d2;
            break;
          default:
            return this.error('Unexpected "' + d2 + '" found.', { index: p[F.FIELDS.START_POS] });
        }
        s++;
      }
      Ft(u2, "attribute"), Ft(u2, "namespace"), this.newNode(new zs.default(u2)), this.position++;
    }, t.parseWhitespaceEquivalentTokens = function(r) {
      r < 0 && (r = this.tokens.length);
      var i = this.position, o = [], u2 = "", s = void 0;
      do
        if (Hi[this.currToken[F.FIELDS.TYPE]])
          this.options.lossy || (u2 += this.content());
        else if (this.currToken[F.FIELDS.TYPE] === C.comment) {
          var a = {};
          u2 && (a.before = u2, u2 = ""), s = new qs.default({ value: this.content(), source: xt(this.currToken), sourceIndex: this.currToken[F.FIELDS.START_POS], spaces: a }), o.push(s);
        }
      while (++this.position < r);
      if (u2) {
        if (s)
          s.spaces.after = u2;
        else if (!this.options.lossy) {
          var l2 = this.tokens[i], f = this.tokens[this.position - 1];
          o.push(new qi.default({ value: "", source: it(l2[F.FIELDS.START_LINE], l2[F.FIELDS.START_COL], f[F.FIELDS.END_LINE], f[F.FIELDS.END_COL]), sourceIndex: l2[F.FIELDS.START_POS], spaces: { before: u2, after: "" } }));
        }
      }
      return o;
    }, t.convertWhitespaceNodesToSpace = function(r, i) {
      var o = this;
      i === void 0 && (i = false);
      var u2 = "", s = "";
      r.forEach(function(l2) {
        var f = o.lossySpace(l2.spaces.before, i), c2 = o.lossySpace(l2.rawSpaceBefore, i);
        u2 += f + o.lossySpace(l2.spaces.after, i && f.length === 0), s += f + l2.value + o.lossySpace(l2.rawSpaceAfter, i && c2.length === 0);
      }), s === u2 && (s = void 0);
      var a = { space: u2, rawSpace: s };
      return a;
    }, t.isNamedCombinator = function(r) {
      return r === void 0 && (r = this.position), this.tokens[r + 0] && this.tokens[r + 0][F.FIELDS.TYPE] === C.slash && this.tokens[r + 1] && this.tokens[r + 1][F.FIELDS.TYPE] === C.word && this.tokens[r + 2] && this.tokens[r + 2][F.FIELDS.TYPE] === C.slash;
    }, t.namedCombinator = function() {
      if (this.isNamedCombinator()) {
        var r = this.content(this.tokens[this.position + 1]), i = (0, Y.unesc)(r).toLowerCase(), o = {};
        i !== r && (o.value = "/" + r + "/");
        var u2 = new zi.default({ value: "/" + i + "/", source: it(this.currToken[F.FIELDS.START_LINE], this.currToken[F.FIELDS.START_COL], this.tokens[this.position + 2][F.FIELDS.END_LINE], this.tokens[this.position + 2][F.FIELDS.END_COL]), sourceIndex: this.currToken[F.FIELDS.START_POS], raws: o });
        return this.position = this.position + 3, u2;
      } else
        this.unexpected();
    }, t.combinator = function() {
      var r = this;
      if (this.content() === "|")
        return this.namespace();
      var i = this.locateNextMeaningfulToken(this.position);
      if (i < 0 || this.tokens[i][F.FIELDS.TYPE] === C.comma) {
        var o = this.parseWhitespaceEquivalentTokens(i);
        if (o.length > 0) {
          var u2 = this.current.last;
          if (u2) {
            var s = this.convertWhitespaceNodesToSpace(o), a = s.space, l2 = s.rawSpace;
            l2 !== void 0 && (u2.rawSpaceAfter += l2), u2.spaces.after += a;
          } else
            o.forEach(function(y) {
              return r.newNode(y);
            });
        }
        return;
      }
      var f = this.currToken, c2 = void 0;
      i > this.position && (c2 = this.parseWhitespaceEquivalentTokens(i));
      var p;
      if (this.isNamedCombinator() ? p = this.namedCombinator() : this.currToken[F.FIELDS.TYPE] === C.combinator ? (p = new zi.default({ value: this.content(), source: xt(this.currToken), sourceIndex: this.currToken[F.FIELDS.START_POS] }), this.position++) : Hi[this.currToken[F.FIELDS.TYPE]] || c2 || this.unexpected(), p) {
        if (c2) {
          var d2 = this.convertWhitespaceNodesToSpace(c2), h2 = d2.space, m2 = d2.rawSpace;
          p.spaces.before = h2, p.rawSpaceBefore = m2;
        }
      } else {
        var x2 = this.convertWhitespaceNodesToSpace(c2, true), g2 = x2.space, S2 = x2.rawSpace;
        S2 || (S2 = g2);
        var v2 = {}, b = { spaces: {} };
        g2.endsWith(" ") && S2.endsWith(" ") ? (v2.before = g2.slice(0, g2.length - 1), b.spaces.before = S2.slice(0, S2.length - 1)) : g2.startsWith(" ") && S2.startsWith(" ") ? (v2.after = g2.slice(1), b.spaces.after = S2.slice(1)) : b.value = S2, p = new zi.default({ value: " ", source: Gi(f, this.tokens[this.position - 1]), sourceIndex: f[F.FIELDS.START_POS], spaces: v2, raws: b });
      }
      return this.currToken && this.currToken[F.FIELDS.TYPE] === C.space && (p.spaces.after = this.optionalSpace(this.content()), this.position++), this.newNode(p);
    }, t.comma = function() {
      if (this.position === this.tokens.length - 1) {
        this.root.trailingComma = true, this.position++;
        return;
      }
      this.current._inferEndPosition();
      var r = new $i.default({ source: { start: Gs(this.tokens[this.position + 1]) } });
      this.current.parent.append(r), this.current = r, this.position++;
    }, t.comment = function() {
      var r = this.currToken;
      this.newNode(new qs.default({ value: this.content(), source: xt(r), sourceIndex: r[F.FIELDS.START_POS] })), this.position++;
    }, t.error = function(r, i) {
      throw this.root.error(r, i);
    }, t.missingBackslash = function() {
      return this.error("Expected a backslash preceding the semicolon.", { index: this.currToken[F.FIELDS.START_POS] });
    }, t.missingParenthesis = function() {
      return this.expected("opening parenthesis", this.currToken[F.FIELDS.START_POS]);
    }, t.missingSquareBracket = function() {
      return this.expected("opening square bracket", this.currToken[F.FIELDS.START_POS]);
    }, t.unexpected = function() {
      return this.error("Unexpected '" + this.content() + "'. Escaping special characters with \\ may help.", this.currToken[F.FIELDS.START_POS]);
    }, t.namespace = function() {
      var r = this.prevToken && this.content(this.prevToken) || true;
      if (this.nextToken[F.FIELDS.TYPE] === C.word)
        return this.position++, this.word(r);
      if (this.nextToken[F.FIELDS.TYPE] === C.asterisk)
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
      this.newNode(new t0.default({ value: this.content(), source: xt(i), sourceIndex: i[F.FIELDS.START_POS] })), this.position++;
    }, t.parentheses = function() {
      var r = this.current.last, i = 1;
      if (this.position++, r && r.type === n0.PSEUDO) {
        var o = new $i.default({ source: { start: Gs(this.tokens[this.position - 1]) } }), u2 = this.current;
        for (r.append(o), this.current = o; this.position < this.tokens.length && i; )
          this.currToken[F.FIELDS.TYPE] === C.openParenthesis && i++, this.currToken[F.FIELDS.TYPE] === C.closeParenthesis && i--, i ? this.parse() : (this.current.source.end = js(this.currToken), this.current.parent.source.end = js(this.currToken), this.position++);
        this.current = u2;
      } else {
        for (var s = this.currToken, a = "(", l2; this.position < this.tokens.length && i; )
          this.currToken[F.FIELDS.TYPE] === C.openParenthesis && i++, this.currToken[F.FIELDS.TYPE] === C.closeParenthesis && i--, l2 = this.currToken, a += this.parseParenthesisToken(this.currToken), this.position++;
        r ? r.appendToPropertyAndEscape("value", a, a) : this.newNode(new qi.default({ value: a, source: it(s[F.FIELDS.START_LINE], s[F.FIELDS.START_COL], l2[F.FIELDS.END_LINE], l2[F.FIELDS.END_COL]), sourceIndex: s[F.FIELDS.START_POS] }));
      }
      if (i)
        return this.expected("closing parenthesis", this.currToken[F.FIELDS.START_POS]);
    }, t.pseudo = function() {
      for (var r = this, i = "", o = this.currToken; this.currToken && this.currToken[F.FIELDS.TYPE] === C.colon; )
        i += this.content(), this.position++;
      if (!this.currToken)
        return this.expected(["pseudo-class", "pseudo-element"], this.position - 1);
      if (this.currToken[F.FIELDS.TYPE] === C.word)
        this.splitWord(false, function(u2, s) {
          i += u2, r.newNode(new Zp.default({ value: i, source: Gi(o, r.currToken), sourceIndex: o[F.FIELDS.START_POS] })), s > 1 && r.nextToken && r.nextToken[F.FIELDS.TYPE] === C.openParenthesis && r.error("Misplaced parenthesis.", { index: r.nextToken[F.FIELDS.START_POS] });
        });
      else
        return this.expected(["pseudo-class", "pseudo-element"], this.currToken[F.FIELDS.START_POS]);
    }, t.space = function() {
      var r = this.content();
      this.position === 0 || this.prevToken[F.FIELDS.TYPE] === C.comma || this.prevToken[F.FIELDS.TYPE] === C.openParenthesis || this.current.nodes.every(function(i) {
        return i.type === "comment";
      }) ? (this.spaces = this.optionalSpace(r), this.position++) : this.position === this.tokens.length - 1 || this.nextToken[F.FIELDS.TYPE] === C.comma || this.nextToken[F.FIELDS.TYPE] === C.closeParenthesis ? (this.current.last.spaces.after = this.optionalSpace(r), this.position++) : this.combinator();
    }, t.string = function() {
      var r = this.currToken;
      this.newNode(new qi.default({ value: this.content(), source: xt(r), sourceIndex: r[F.FIELDS.START_POS] })), this.position++;
    }, t.universal = function(r) {
      var i = this.nextToken;
      if (i && this.content(i) === "|")
        return this.position++, this.namespace();
      var o = this.currToken;
      this.newNode(new e0.default({ value: this.content(), source: xt(o), sourceIndex: o[F.FIELDS.START_POS] }), r), this.position++;
    }, t.splitWord = function(r, i) {
      for (var o = this, u2 = this.nextToken, s = this.content(); u2 && ~[C.dollar, C.caret, C.equals, C.word].indexOf(u2[F.FIELDS.TYPE]); ) {
        this.position++;
        var a = this.content();
        if (s += a, a.lastIndexOf("\\") === a.length - 1) {
          var l2 = this.nextToken;
          l2 && l2[F.FIELDS.TYPE] === C.space && (s += this.requiredSpace(this.content(l2)), this.position++);
        }
        u2 = this.nextToken;
      }
      var f = ji(s, ".").filter(function(h2) {
        var m2 = s[h2 - 1] === "\\", x2 = /^\d+\.\d+%$/.test(s);
        return !m2 && !x2;
      }), c2 = ji(s, "#").filter(function(h2) {
        return s[h2 - 1] !== "\\";
      }), p = ji(s, "#{");
      p.length && (c2 = c2.filter(function(h2) {
        return !~p.indexOf(h2);
      }));
      var d2 = (0, r0.default)(u0([0].concat(f, c2)));
      d2.forEach(function(h2, m2) {
        var x2 = d2[m2 + 1] || s.length, g2 = s.slice(h2, x2);
        if (m2 === 0 && i)
          return i.call(o, g2, d2.length);
        var S2, v2 = o.currToken, b = v2[F.FIELDS.START_POS] + d2[m2], y = it(v2[1], v2[2] + h2, v2[3], v2[2] + (x2 - 1));
        if (~f.indexOf(h2)) {
          var T = { value: g2.slice(1), source: y, sourceIndex: b };
          S2 = new Qp.default(Ft(T, "value"));
        } else if (~c2.indexOf(h2)) {
          var A = { value: g2.slice(1), source: y, sourceIndex: b };
          S2 = new Kp.default(Ft(A, "value"));
        } else {
          var P2 = { value: g2, source: y, sourceIndex: b };
          Ft(P2, "value"), S2 = new Jp.default(P2);
        }
        o.newNode(S2, r), r = null;
      }), this.position++;
    }, t.word = function(r) {
      var i = this.nextToken;
      return i && this.content(i) === "|" ? (this.position++, this.namespace()) : this.splitWord(r);
    }, t.loop = function() {
      for (; this.position < this.tokens.length; )
        this.parse(true);
      return this.current._inferEndPosition(), this.root;
    }, t.parse = function(r) {
      switch (this.currToken[F.FIELDS.TYPE]) {
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
        var u2 = r.pop();
        r = r.join(", ") + " or " + u2;
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
      return r[F.FIELDS.TYPE] === C.space ? this.requiredSpace(i) : i;
    }, t.newNode = function(r, i) {
      return i && (/^ +$/.test(i) && (this.options.lossy || (this.spaces = (this.spaces || "") + i), i = true), r.namespace = i, Ft(r, "namespace")), this.spaces && (r.spaces.before = this.spaces, this.spaces = ""), this.current.append(r);
    }, t.content = function(r) {
      return r === void 0 && (r = this.currToken), this.css.slice(r[F.FIELDS.START_POS], r[F.FIELDS.END_POS]);
    }, t.locateNextMeaningfulToken = function(r) {
      r === void 0 && (r = this.position + 1);
      for (var i = r; i < this.tokens.length; )
        if (o0[this.tokens[i][F.FIELDS.TYPE]]) {
          i++;
          continue;
        } else
          return i;
      return -1;
    }, i0(e, [{ key: "currToken", get: function() {
      return this.tokens[this.position];
    } }, { key: "nextToken", get: function() {
      return this.tokens[this.position + 1];
    } }, { key: "prevToken", get: function() {
      return this.tokens[this.position - 1];
    } }]), e;
  }();
  lr.default = s0;
  Vs.exports = lr.default;
});
var Qs = k((fr, Xs) => {
  "use strict";
  fr.__esModule = true;
  fr.default = void 0;
  var a0 = l0(Ys());
  function l0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var f0 = function() {
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
      var o = new a0.default(r, this._parseOptions(i));
      return o.root;
    }, t._parseOptions = function(r) {
      return { lossy: this._isLossy(r) };
    }, t._run = function(r, i) {
      var o = this;
      return i === void 0 && (i = {}), new Promise(function(u2, s) {
        try {
          var a = o._root(r, i);
          Promise.resolve(o.func(a)).then(function(l2) {
            var f = void 0;
            return o._shouldUpdateSelector(r, i) && (f = a.toString(), r.selector = f), { transform: l2, root: a, string: f };
          }).then(u2, s);
        } catch (l2) {
          s(l2);
          return;
        }
      });
    }, t._runSync = function(r, i) {
      i === void 0 && (i = {});
      var o = this._root(r, i), u2 = this.func(o);
      if (u2 && typeof u2.then == "function")
        throw new Error("Selector processor returned a promise to a synchronous call.");
      var s = void 0;
      return i.updateSelector && typeof r != "string" && (s = o.toString(), r.selector = s), { transform: u2, root: o, string: s };
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
  fr.default = f0;
  Xs.exports = fr.default;
});
var Ks = k((G) => {
  "use strict";
  G.__esModule = true;
  G.universal = G.tag = G.string = G.selector = G.root = G.pseudo = G.nesting = G.id = G.comment = G.combinator = G.className = G.attribute = void 0;
  var c0 = ye(Oi()), d0 = ye(hi()), p0 = ye(Ri()), h0 = ye(Di()), m0 = ye(bi()), D0 = ye(Mi()), g0 = ye(Si()), b0 = ye(li()), v0 = ye(ci()), y0 = ye(wi()), x0 = ye(xi()), F0 = ye(Bi());
  function ye(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var w0 = function(t) {
    return new c0.default(t);
  };
  G.attribute = w0;
  var E0 = function(t) {
    return new d0.default(t);
  };
  G.className = E0;
  var S0 = function(t) {
    return new p0.default(t);
  };
  G.combinator = S0;
  var C0 = function(t) {
    return new h0.default(t);
  };
  G.comment = C0;
  var _0 = function(t) {
    return new m0.default(t);
  };
  G.id = _0;
  var k0 = function(t) {
    return new D0.default(t);
  };
  G.nesting = k0;
  var T0 = function(t) {
    return new g0.default(t);
  };
  G.pseudo = T0;
  var A0 = function(t) {
    return new b0.default(t);
  };
  G.root = A0;
  var O0 = function(t) {
    return new v0.default(t);
  };
  G.selector = O0;
  var P0 = function(t) {
    return new y0.default(t);
  };
  G.string = P0;
  var B0 = function(t) {
    return new x0.default(t);
  };
  G.tag = B0;
  var I0 = function(t) {
    return new F0.default(t);
  };
  G.universal = I0;
});
var ta = k((L) => {
  "use strict";
  L.__esModule = true;
  L.isNode = Vi;
  L.isPseudoElement = ea;
  L.isPseudoClass = j0;
  L.isContainer = H0;
  L.isNamespace = V0;
  L.isUniversal = L.isTag = L.isString = L.isSelector = L.isRoot = L.isPseudo = L.isNesting = L.isIdentifier = L.isComment = L.isCombinator = L.isClassName = L.isAttribute = void 0;
  var X = ne(), de, R0 = (de = {}, de[X.ATTRIBUTE] = true, de[X.CLASS] = true, de[X.COMBINATOR] = true, de[X.COMMENT] = true, de[X.ID] = true, de[X.NESTING] = true, de[X.PSEUDO] = true, de[X.ROOT] = true, de[X.SELECTOR] = true, de[X.STRING] = true, de[X.TAG] = true, de[X.UNIVERSAL] = true, de);
  function Vi(e) {
    return typeof e == "object" && R0[e.type];
  }
  function xe(e, t) {
    return Vi(t) && t.type === e;
  }
  var Js = xe.bind(null, X.ATTRIBUTE);
  L.isAttribute = Js;
  var L0 = xe.bind(null, X.CLASS);
  L.isClassName = L0;
  var M0 = xe.bind(null, X.COMBINATOR);
  L.isCombinator = M0;
  var N0 = xe.bind(null, X.COMMENT);
  L.isComment = N0;
  var W0 = xe.bind(null, X.ID);
  L.isIdentifier = W0;
  var $0 = xe.bind(null, X.NESTING);
  L.isNesting = $0;
  var Yi = xe.bind(null, X.PSEUDO);
  L.isPseudo = Yi;
  var q0 = xe.bind(null, X.ROOT);
  L.isRoot = q0;
  var z0 = xe.bind(null, X.SELECTOR);
  L.isSelector = z0;
  var U0 = xe.bind(null, X.STRING);
  L.isString = U0;
  var Zs = xe.bind(null, X.TAG);
  L.isTag = Zs;
  var G0 = xe.bind(null, X.UNIVERSAL);
  L.isUniversal = G0;
  function ea(e) {
    return Yi(e) && e.value && (e.value.startsWith("::") || e.value.toLowerCase() === ":before" || e.value.toLowerCase() === ":after" || e.value.toLowerCase() === ":first-letter" || e.value.toLowerCase() === ":first-line");
  }
  function j0(e) {
    return Yi(e) && !ea(e);
  }
  function H0(e) {
    return !!(Vi(e) && e.walk);
  }
  function V0(e) {
    return Js(e) || Zs(e);
  }
});
var ra = k((Ce) => {
  "use strict";
  Ce.__esModule = true;
  var Xi = ne();
  Object.keys(Xi).forEach(function(e) {
    e === "default" || e === "__esModule" || e in Ce && Ce[e] === Xi[e] || (Ce[e] = Xi[e]);
  });
  var Qi = Ks();
  Object.keys(Qi).forEach(function(e) {
    e === "default" || e === "__esModule" || e in Ce && Ce[e] === Qi[e] || (Ce[e] = Qi[e]);
  });
  var Ki = ta();
  Object.keys(Ki).forEach(function(e) {
    e === "default" || e === "__esModule" || e in Ce && Ce[e] === Ki[e] || (Ce[e] = Ki[e]);
  });
});
var oa = k((cr, ia) => {
  "use strict";
  cr.__esModule = true;
  cr.default = void 0;
  var Y0 = K0(Qs()), X0 = Q0(ra());
  function na() {
    if (typeof WeakMap != "function")
      return null;
    var e = /* @__PURE__ */ new WeakMap();
    return na = function() {
      return e;
    }, e;
  }
  function Q0(e) {
    if (e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var t = na();
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
  function K0(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var Ji = function(t) {
    return new Y0.default(t);
  };
  Object.assign(Ji, X0);
  delete Ji.__esModule;
  var J0 = Ji;
  cr.default = J0;
  ia.exports = cr.default;
});
var ua = k((Zi) => {
  "use strict";
  Object.defineProperty(Zi, "__esModule", { value: true });
  Object.defineProperty(Zi, "default", { enumerable: true, get: () => Z0 });
  function Z0(e) {
    return e.replace(/\\,/g, "\\2c ");
  }
});
var aa = k((Gb, sa) => {
  "use strict";
  sa.exports = { aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255], aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220], bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205], blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42], burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0], chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237], cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255], darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11], darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169], darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47], darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0], darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139], darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209], darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255], dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255], firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34], fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255], gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128], green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128], honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92], indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140], lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0], lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128], lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211], lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193], lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250], lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222], lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50], linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0], mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211], mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238], mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133], midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225], moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128], oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35], orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214], palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238], palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185], peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221], powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153], red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225], saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96], seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45], silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205], slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250], springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140], teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71], turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179], white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0], yellowgreen: [154, 205, 50] };
});
var to = k((eo) => {
  "use strict";
  Object.defineProperty(eo, "__esModule", { value: true });
  function eh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  eh(eo, { parseColor: () => uh, formatColor: () => sh });
  var la = th(aa());
  function th(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var rh = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i, nh = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i, Ve = /(?:\d+|\d*\.\d+)%?/, dn = /(?:\s*,\s*|\s+)/, fa = /\s*[,/]\s*/, Ye = /var\(--(?:[^ )]*?)\)/, ih = new RegExp(`^(rgb)a?\\(\\s*(${Ve.source}|${Ye.source})(?:${dn.source}(${Ve.source}|${Ye.source}))?(?:${dn.source}(${Ve.source}|${Ye.source}))?(?:${fa.source}(${Ve.source}|${Ye.source}))?\\s*\\)$`), oh = new RegExp(`^(hsl)a?\\(\\s*((?:${Ve.source})(?:deg|rad|grad|turn)?|${Ye.source})(?:${dn.source}(${Ve.source}|${Ye.source}))?(?:${dn.source}(${Ve.source}|${Ye.source}))?(?:${fa.source}(${Ve.source}|${Ye.source}))?\\s*\\)$`);
  function uh(e, { loose: t = false } = {}) {
    var n, r;
    if (typeof e != "string")
      return null;
    if (e = e.trim(), e === "transparent")
      return { mode: "rgb", color: ["0", "0", "0"], alpha: "0" };
    if (e in la.default)
      return { mode: "rgb", color: la.default[e].map((a) => a.toString()) };
    let i = e.replace(nh, (a, l2, f, c2, p) => ["#", l2, l2, f, f, c2, c2, p ? p + p : ""].join("")).match(rh);
    if (i !== null)
      return { mode: "rgb", color: [parseInt(i[1], 16), parseInt(i[2], 16), parseInt(i[3], 16)].map((a) => a.toString()), alpha: i[4] ? (parseInt(i[4], 16) / 255).toString() : void 0 };
    var o;
    let u2 = (o = e.match(ih)) !== null && o !== void 0 ? o : e.match(oh);
    if (u2 === null)
      return null;
    let s = [u2[2], u2[3], u2[4]].filter(Boolean).map((a) => a.toString());
    return !t && s.length !== 3 || s.length < 3 && !s.some((a) => /^var\(.*?\)$/.test(a)) ? null : { mode: u2[1], color: s, alpha: (n = u2[5]) === null || n === void 0 || (r = n.toString) === null || r === void 0 ? void 0 : r.call(n) };
  }
  function sh({ mode: e, color: t, alpha: n }) {
    let r = n !== void 0;
    return `${e}(${t.join(" ")}${r ? ` / ${n}` : ""})`;
  }
});
var no = k((ro) => {
  "use strict";
  Object.defineProperty(ro, "__esModule", { value: true });
  function ah(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  ah(ro, { withAlphaValue: () => lh, default: () => fh });
  var pn = to();
  function lh(e, t, n) {
    if (typeof e == "function")
      return e({ opacityValue: t });
    let r = (0, pn.parseColor)(e, { loose: true });
    return r === null ? n : (0, pn.formatColor)({ ...r, alpha: t });
  }
  function fh({ color: e, property: t, variable: n }) {
    let r = [].concat(t);
    if (typeof e == "function")
      return { [n]: "1", ...Object.fromEntries(r.map((o) => [o, e({ opacityVariable: n, opacityValue: `var(${n})` })])) };
    let i = (0, pn.parseColor)(e);
    return i === null ? Object.fromEntries(r.map((o) => [o, e])) : i.alpha !== void 0 ? Object.fromEntries(r.map((o) => [o, e])) : { [n]: "1", ...Object.fromEntries(r.map((o) => [o, (0, pn.formatColor)({ ...i, alpha: `var(${n})` })])) };
  }
});
var ma = k((io) => {
  "use strict";
  Object.defineProperty(io, "__esModule", { value: true });
  function ch(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  ch(io, { pattern: () => ph, withoutCapturing: () => da, any: () => pa, optional: () => hh, zeroOrMore: () => mh, nestedBrackets: () => ha, escape: () => ot });
  var ca = /[\\^$.*+?()[\]{}|]/g, dh = RegExp(ca.source);
  function dr(e) {
    return e = Array.isArray(e) ? e : [e], e = e.map((t) => t instanceof RegExp ? t.source : t), e.join("");
  }
  function ph(e) {
    return new RegExp(dr(e), "g");
  }
  function da(e) {
    return new RegExp(`(?:${dr(e)})`, "g");
  }
  function pa(e) {
    return `(?:${e.map(dr).join("|")})`;
  }
  function hh(e) {
    return `(?:${dr(e)})?`;
  }
  function mh(e) {
    return `(?:${dr(e)})*`;
  }
  function ha(e, t, n = 1) {
    return da([ot(e), /[^\s]*/, n === 1 ? `[^${ot(e)}${ot(t)}s]*` : pa([`[^${ot(e)}${ot(t)}s]*`, ha(e, t, n - 1)]), /[^\s]*/, ot(t)]);
  }
  function ot(e) {
    return e && dh.test(e) ? e.replace(ca, "\\$&") : e || "";
  }
});
var ga = k((oo) => {
  "use strict";
  Object.defineProperty(oo, "__esModule", { value: true });
  Object.defineProperty(oo, "splitAtTopLevelOnly", { enumerable: true, get: () => bh });
  var Dh = gh(ma());
  function Da(e) {
    if (typeof WeakMap != "function")
      return null;
    var t = /* @__PURE__ */ new WeakMap(), n = /* @__PURE__ */ new WeakMap();
    return (Da = function(r) {
      return r ? n : t;
    })(e);
  }
  function gh(e, t) {
    if (!t && e && e.__esModule)
      return e;
    if (e === null || typeof e != "object" && typeof e != "function")
      return { default: e };
    var n = Da(t);
    if (n && n.has(e))
      return n.get(e);
    var r = {}, i = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for (var o in e)
      if (o !== "default" && Object.prototype.hasOwnProperty.call(e, o)) {
        var u2 = i ? Object.getOwnPropertyDescriptor(e, o) : null;
        u2 && (u2.get || u2.set) ? Object.defineProperty(r, o, u2) : r[o] = e[o];
      }
    return r.default = e, n && n.set(e, r), r;
  }
  function* bh(e, t) {
    let n = new RegExp(`[(){}\\[\\]${Dh.escape(t)}]`, "g"), r = 0, i = 0, o = false, u2 = 0, s = 0, a = t.length;
    for (let l2 of e.matchAll(n)) {
      let f = l2[0] === t[u2], c2 = u2 === a - 1, p = f && c2;
      l2[0] === "(" && r++, l2[0] === ")" && r--, l2[0] === "[" && r++, l2[0] === "]" && r--, l2[0] === "{" && r++, l2[0] === "}" && r--, f && r === 0 && (s === 0 && (s = l2.index), u2++), p && r === 0 && (o = true, yield e.substring(i, s), i = s + a), u2 === a && (u2 = 0, s = 0);
    }
    o ? yield e.substring(i) : yield e;
  }
});
var va = k((uo) => {
  "use strict";
  Object.defineProperty(uo, "__esModule", { value: true });
  function vh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  vh(uo, { parseBoxShadowValue: () => wh, formatBoxShadowValue: () => Eh });
  var yh = ga(), xh = /* @__PURE__ */ new Set(["inset", "inherit", "initial", "revert", "unset"]), Fh = /\ +(?![^(]*\))/g, ba = /^-?(\d+|\.\d+)(.*?)$/g;
  function wh(e) {
    return Array.from((0, yh.splitAtTopLevelOnly)(e, ",")).map((n) => {
      let r = n.trim(), i = { raw: r }, o = r.split(Fh), u2 = /* @__PURE__ */ new Set();
      for (let s of o)
        ba.lastIndex = 0, !u2.has("KEYWORD") && xh.has(s) ? (i.keyword = s, u2.add("KEYWORD")) : ba.test(s) ? u2.has("X") ? u2.has("Y") ? u2.has("BLUR") ? u2.has("SPREAD") || (i.spread = s, u2.add("SPREAD")) : (i.blur = s, u2.add("BLUR")) : (i.y = s, u2.add("Y")) : (i.x = s, u2.add("X")) : i.color ? (i.unknown || (i.unknown = []), i.unknown.push(s)) : i.color = s;
      return i.valid = i.x !== void 0 && i.y !== void 0, i;
    });
  }
  function Eh(e) {
    return e.map((t) => t.valid ? [t.keyword, t.x, t.y, t.blur, t.spread, t.color].filter(Boolean).join(" ") : t.raw).join(", ");
  }
});
var Ca = k((ao) => {
  "use strict";
  Object.defineProperty(ao, "__esModule", { value: true });
  function Sh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  Sh(ao, { normalize: () => Xe, url: () => Fa, number: () => kh, percentage: () => wa, length: () => Ea, lineWidth: () => Oh, shadow: () => Ph, color: () => Bh, image: () => Ih, gradient: () => Sa, position: () => Mh, familyName: () => Nh, genericName: () => $h, absoluteSize: () => zh, relativeSize: () => Gh });
  var Ch = to(), _h = va(), so = ["min", "max", "clamp", "calc"], xa = /,(?![^(]*\))/g, hn = /_(?![^(]*\))/g;
  function Xe(e, t = true) {
    return e.includes("url(") ? e.split(/(url\(.*?\))/g).filter(Boolean).map((n) => /^url\(.*?\)$/.test(n) ? n : Xe(n, false)).join("") : (e = e.replace(/([^\\])_+/g, (n, r) => r + " ".repeat(n.length - 1)).replace(/^_/g, " ").replace(/\\_/g, "_"), t && (e = e.trim()), e = e.replace(/(calc|min|max|clamp)\(.+\)/g, (n) => n.replace(/(-?\d*\.?\d(?!\b-.+[,)](?![^+\-/*])\D)(?:%|[a-z]+)?|\))([+\-/*])/g, "$1 $2 ")), e);
  }
  function Fa(e) {
    return e.startsWith("url(");
  }
  function kh(e) {
    return !isNaN(Number(e)) || so.some((t) => new RegExp(`^${t}\\(.+?`).test(e));
  }
  function wa(e) {
    return e.split(hn).every((t) => /%$/g.test(t) || so.some((n) => new RegExp(`^${n}\\(.+?%`).test(t)));
  }
  var Th = ["cm", "mm", "Q", "in", "pc", "pt", "px", "em", "ex", "ch", "rem", "lh", "vw", "vh", "vmin", "vmax"], ya = `(?:${Th.join("|")})`;
  function Ea(e) {
    return e.split(hn).every((t) => t === "0" || new RegExp(`${ya}$`).test(t) || so.some((n) => new RegExp(`^${n}\\(.+?${ya}`).test(t)));
  }
  var Ah = /* @__PURE__ */ new Set(["thin", "medium", "thick"]);
  function Oh(e) {
    return Ah.has(e);
  }
  function Ph(e) {
    let t = (0, _h.parseBoxShadowValue)(Xe(e));
    for (let n of t)
      if (!n.valid)
        return false;
    return true;
  }
  function Bh(e) {
    let t = 0;
    return e.split(hn).every((r) => (r = Xe(r), r.startsWith("var(") ? true : (0, Ch.parseColor)(r, { loose: true }) !== null ? (t++, true) : false)) ? t > 0 : false;
  }
  function Ih(e) {
    let t = 0;
    return e.split(xa).every((r) => (r = Xe(r), r.startsWith("var(") ? true : Fa(r) || Sa(r) || ["element(", "image(", "cross-fade(", "image-set("].some((i) => r.startsWith(i)) ? (t++, true) : false)) ? t > 0 : false;
  }
  var Rh = /* @__PURE__ */ new Set(["linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "conic-gradient"]);
  function Sa(e) {
    e = Xe(e);
    for (let t of Rh)
      if (e.startsWith(`${t}(`))
        return true;
    return false;
  }
  var Lh = /* @__PURE__ */ new Set(["center", "top", "right", "bottom", "left"]);
  function Mh(e) {
    let t = 0;
    return e.split(hn).every((r) => (r = Xe(r), r.startsWith("var(") ? true : Lh.has(r) || Ea(r) || wa(r) ? (t++, true) : false)) ? t > 0 : false;
  }
  function Nh(e) {
    let t = 0;
    return e.split(xa).every((r) => (r = Xe(r), r.startsWith("var(") ? true : r.includes(" ") && !/(['"])([^"']+)\1/g.test(r) || /^\d/g.test(r) ? false : (t++, true))) ? t > 0 : false;
  }
  var Wh = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);
  function $h(e) {
    return Wh.has(e);
  }
  var qh = /* @__PURE__ */ new Set(["xx-small", "x-small", "small", "medium", "large", "x-large", "x-large", "xxx-large"]);
  function zh(e) {
    return qh.has(e);
  }
  var Uh = /* @__PURE__ */ new Set(["larger", "smaller"]);
  function Gh(e) {
    return Uh.has(e);
  }
});
var Ia = k((co) => {
  "use strict";
  Object.defineProperty(co, "__esModule", { value: true });
  function jh(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  jh(co, { updateAllClasses: () => Yh, asValue: () => hr, parseColorFormat: () => lo, asColor: () => Oa, asLookupValue: () => Pa, coerceValue: () => Jh });
  var Hh = fo(oa()), Vh = fo(ua()), _a2 = no(), pe = Ca(), ka = fo(Xn());
  function fo(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Yh(e, t) {
    return (0, Hh.default)((i) => {
      i.walkClasses((o) => {
        let u2 = t(o.value);
        o.value = u2, o.raws && o.raws.value && (o.raws.value = (0, Vh.default)(o.raws.value));
      });
    }).processSync(e);
  }
  function Aa(e, t) {
    if (!pr(e))
      return;
    let n = e.slice(1, -1);
    if (t(n))
      return (0, pe.normalize)(n);
  }
  function Xh(e, t = {}, n) {
    let r = t[e];
    if (r !== void 0)
      return (0, ka.default)(r);
    if (pr(e)) {
      let i = Aa(e, n);
      return i === void 0 ? void 0 : (0, ka.default)(i);
    }
  }
  function hr(e, t = {}, { validate: n = () => true } = {}) {
    var r;
    let i = (r = t.values) === null || r === void 0 ? void 0 : r[e];
    return i !== void 0 ? i : t.supportsNegativeValues && e.startsWith("-") ? Xh(e.slice(1), t.values, n) : Aa(e, n);
  }
  function pr(e) {
    return e.startsWith("[") && e.endsWith("]");
  }
  function Qh(e) {
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
  function Oa(e, t = {}, { tailwindConfig: n = {} } = {}) {
    var r;
    if (((r = t.values) === null || r === void 0 ? void 0 : r[e]) !== void 0) {
      var i;
      return lo((i = t.values) === null || i === void 0 ? void 0 : i[e]);
    }
    let [o, u2] = Qh(e);
    if (u2 !== void 0) {
      var s, a, l2, f;
      let c2 = (f = (s = t.values) === null || s === void 0 ? void 0 : s[o]) !== null && f !== void 0 ? f : pr(o) ? o.slice(1, -1) : void 0;
      return c2 === void 0 ? void 0 : (c2 = lo(c2), pr(u2) ? (0, _a2.withAlphaValue)(c2, u2.slice(1, -1)) : ((a = n.theme) === null || a === void 0 || (l2 = a.opacity) === null || l2 === void 0 ? void 0 : l2[u2]) === void 0 ? void 0 : (0, _a2.withAlphaValue)(c2, n.theme.opacity[u2]));
    }
    return hr(e, t, { validate: pe.color });
  }
  function Pa(e, t = {}) {
    var n;
    return (n = t.values) === null || n === void 0 ? void 0 : n[e];
  }
  function Fe(e) {
    return (t, n) => hr(t, n, { validate: e });
  }
  var Ba = { any: hr, color: Oa, url: Fe(pe.url), image: Fe(pe.image), length: Fe(pe.length), percentage: Fe(pe.percentage), position: Fe(pe.position), lookup: Pa, "generic-name": Fe(pe.genericName), "family-name": Fe(pe.familyName), number: Fe(pe.number), "line-width": Fe(pe.lineWidth), "absolute-size": Fe(pe.absoluteSize), "relative-size": Fe(pe.relativeSize), shadow: Fe(pe.shadow) }, Ta = Object.keys(Ba);
  function Kh(e, t) {
    let n = e.indexOf(t);
    return n === -1 ? [void 0, e] : [e.slice(0, n), e.slice(n + 1)];
  }
  function Jh(e, t, n, r) {
    if (pr(t)) {
      let i = t.slice(1, -1), [o, u2] = Kh(i, ":");
      if (!/^[\w-_]+$/g.test(o))
        u2 = i;
      else if (o !== void 0 && !Ta.includes(o))
        return [];
      if (u2.length > 0 && Ta.includes(o))
        return [hr(`[${u2}]`, n), o];
    }
    for (let i of [].concat(e)) {
      let o = Ba[i](t, n, { tailwindConfig: r });
      if (o !== void 0)
        return [o, i];
    }
    return [];
  }
});
var Ra = k((po) => {
  "use strict";
  Object.defineProperty(po, "__esModule", { value: true });
  Object.defineProperty(po, "default", { enumerable: true, get: () => Zh });
  function Zh(e) {
    return typeof e == "function" ? e({}) : e;
  }
});
var $a = k((mo) => {
  "use strict";
  Object.defineProperty(mo, "__esModule", { value: true });
  Object.defineProperty(mo, "default", { enumerable: true, get: () => vm });
  var em = ut(Xn()), tm = ut(Uu()), rm = ut(Gu()), nm = ut(Jn()), im = ut(Hu()), Na = Vu(), La = Yu(), om = Qu(), um = ut(Ku()), sm = Ju(), am = Ia(), lm = no(), fm = ut(Ra());
  function ut(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function wt(e) {
    return typeof e == "function";
  }
  function mr(e) {
    return typeof e == "object" && e !== null;
  }
  function Dr(e, ...t) {
    let n = t.pop();
    for (let r of t)
      for (let i in r) {
        let o = n(e[i], r[i]);
        o === void 0 ? mr(e[i]) && mr(r[i]) ? e[i] = Dr(e[i], r[i], n) : e[i] = r[i] : e[i] = o;
      }
    return e;
  }
  var ho = { colors: im.default, negative(e) {
    return Object.keys(e).filter((t) => e[t] !== "0").reduce((t, n) => {
      let r = (0, em.default)(e[n]);
      return r !== void 0 && (t[`-${n}`] = r), t;
    }, {});
  }, breakpoints(e) {
    return Object.keys(e).filter((t) => typeof e[t] == "string").reduce((t, n) => ({ ...t, [`screen-${n}`]: e[n] }), {});
  } };
  function cm(e, ...t) {
    return wt(e) ? e(...t) : e;
  }
  function dm(e) {
    return e.reduce((t, { extend: n }) => Dr(t, n, (r, i) => r === void 0 ? [i] : Array.isArray(r) ? [i, ...r] : [i, r]), {});
  }
  function pm(e) {
    return { ...e.reduce((t, n) => (0, Na.defaults)(t, n), {}), extend: dm(e) };
  }
  function Ma(e, t) {
    if (Array.isArray(e) && mr(e[0]))
      return e.concat(t);
    if (Array.isArray(t) && mr(t[0]) && mr(e))
      return [e, ...t];
    if (Array.isArray(t))
      return t;
  }
  function hm({ extend: e, ...t }) {
    return Dr(t, e, (n, r) => !wt(n) && !r.some(wt) ? Dr({}, n, ...r, Ma) : (i, o) => Dr({}, ...[n, ...r].map((u2) => cm(u2, i, o)), Ma));
  }
  function* mm(e) {
    let t = (0, La.toPath)(e);
    if (t.length === 0 || (yield t, Array.isArray(e)))
      return;
    let n = /^(.*?)\s*\/\s*([^/]+)$/, r = e.match(n);
    if (r !== null) {
      let [, i, o] = r, u2 = (0, La.toPath)(i);
      u2.alpha = o, yield u2;
    }
  }
  function Dm(e) {
    let t = (n, r) => {
      for (let i of mm(n)) {
        let o = 0, u2 = e;
        for (; u2 != null && o < i.length; )
          u2 = u2[i[o++]], u2 = wt(u2) && (i.alpha === void 0 || o <= i.length - 1) ? u2(t, ho) : u2;
        if (u2 !== void 0) {
          if (i.alpha !== void 0) {
            let s = (0, am.parseColorFormat)(u2);
            return (0, lm.withAlphaValue)(s, i.alpha, (0, fm.default)(s));
          }
          return (0, um.default)(u2) ? (0, sm.cloneDeep)(u2) : u2;
        }
      }
      return r;
    };
    return Object.assign(t, { theme: t, ...ho }), Object.keys(e).reduce((n, r) => (n[r] = wt(e[r]) ? e[r](t, ho) : e[r], n), {});
  }
  function Wa(e) {
    let t = [];
    return e.forEach((n) => {
      t = [...t, n];
      var r;
      let i = (r = n == null ? void 0 : n.plugins) !== null && r !== void 0 ? r : [];
      i.length !== 0 && i.forEach((o) => {
        o.__isOptionsFunction && (o = o());
        var u2;
        t = [...t, ...Wa([(u2 = o == null ? void 0 : o.config) !== null && u2 !== void 0 ? u2 : {}])];
      });
    }), t;
  }
  function gm(e) {
    return [...e].reduceRight((n, r) => wt(r) ? r({ corePlugins: n }) : (0, rm.default)(r, n), tm.default);
  }
  function bm(e) {
    return [...e].reduceRight((n, r) => [...n, ...r], []);
  }
  function vm(e) {
    let t = [...Wa(e), { prefix: "", important: false, separator: ":", variantOrder: nm.default.variantOrder }];
    var n, r;
    return (0, om.normalizeConfig)((0, Na.defaults)({ theme: Dm(hm(pm(t.map((i) => (n = i == null ? void 0 : i.theme) !== null && n !== void 0 ? n : {})))), corePlugins: gm(t.map((i) => i.corePlugins)), plugins: bm(e.map((i) => (r = i == null ? void 0 : i.plugins) !== null && r !== void 0 ? r : [])) }, ...t));
  }
});
var qa = {};
Fn(qa, { default: () => ym });
var ym;
var za = xn(() => {
  ym = { yellow: (e) => e };
});
var Ha = k((Do) => {
  "use strict";
  Object.defineProperty(Do, "__esModule", { value: true });
  function xm(e, t) {
    for (var n in t)
      Object.defineProperty(e, n, { enumerable: true, get: t[n] });
  }
  xm(Do, { flagEnabled: () => Em, issueFlagNotices: () => Sm, default: () => Cm });
  var Fm = ja((za(), Ir(qa))), wm = ja((Jr(), Ir(Kr)));
  function ja(e) {
    return e && e.__esModule ? e : { default: e };
  }
  var Ua = { optimizeUniversalDefaults: false }, gr = { future: ["hoverOnlyWhenSupported", "respectDefaultRingColorOpacity"], experimental: ["optimizeUniversalDefaults", "matchVariant"] };
  function Em(e, t) {
    if (gr.future.includes(t)) {
      var n, r, i;
      return e.future === "all" || ((i = (r = e == null || (n = e.future) === null || n === void 0 ? void 0 : n[t]) !== null && r !== void 0 ? r : Ua[t]) !== null && i !== void 0 ? i : false);
    }
    if (gr.experimental.includes(t)) {
      var o, u2, s;
      return e.experimental === "all" || ((s = (u2 = e == null || (o = e.experimental) === null || o === void 0 ? void 0 : o[t]) !== null && u2 !== void 0 ? u2 : Ua[t]) !== null && s !== void 0 ? s : false);
    }
    return false;
  }
  function Ga(e) {
    if (e.experimental === "all")
      return gr.experimental;
    var t;
    return Object.keys((t = e == null ? void 0 : e.experimental) !== null && t !== void 0 ? t : {}).filter((n) => gr.experimental.includes(n) && e.experimental[n]);
  }
  function Sm(e) {
    if (process.env.JEST_WORKER_ID === void 0 && Ga(e).length > 0) {
      let t = Ga(e).map((n) => Fm.default.yellow(n)).join(", ");
      wm.default.warn("experimental-flags-enabled", [`You have enabled experimental features: ${t}`, "Experimental features in Tailwind CSS are not covered by semver, may introduce breaking changes, and can change at any time."]);
    }
  }
  var Cm = gr;
});
var Ya = k((go) => {
  "use strict";
  Object.defineProperty(go, "__esModule", { value: true });
  Object.defineProperty(go, "default", { enumerable: true, get: () => Va });
  var _m = Tm(Jn()), km = Ha();
  function Tm(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Va(e) {
    var t;
    let n = ((t = e == null ? void 0 : e.presets) !== null && t !== void 0 ? t : [_m.default]).slice().reverse().flatMap((o) => Va(typeof o == "function" ? o() : o)), r = { respectDefaultRingColorOpacity: { theme: { ringColor: { DEFAULT: "#3b82f67f" } } } }, i = Object.keys(r).filter((o) => (0, km.flagEnabled)(e, o)).map((o) => r[o]);
    return [e, ...i, ...n];
  }
});
var Qa = k((bo) => {
  "use strict";
  Object.defineProperty(bo, "__esModule", { value: true });
  Object.defineProperty(bo, "default", { enumerable: true, get: () => Pm });
  var Am = Xa($a()), Om = Xa(Ya());
  function Xa(e) {
    return e && e.__esModule ? e : { default: e };
  }
  function Pm(...e) {
    let [, ...t] = (0, Om.default)(e[0]);
    return (0, Am.default)([...e, ...t]);
  }
});
var Ja = k((nv, Ka) => {
  var vo = Qa();
  Ka.exports = (vo.__esModule ? vo : { default: vo }).default;
});
var mt;
function Ll(e) {
  mt = e;
}
var At = null;
async function Re() {
  return mt || (At ? (await At, mt) : (At = Promise.resolve().then(() => (Ho(), jo)).then((e) => e.getYogaModule()).then((e) => mt = e), await At, At = null, mt));
}
var Ot = (e, t) => () => (t || e((t = { exports: {} }).exports, t), t.exports);
var Ml = Ot((e, t) => {
  t.exports = ["em", "ex", "ch", "rem", "vh", "vw", "vmin", "vmax", "px", "mm", "cm", "in", "pt", "pc", "mozmm"];
});
var Nl = Ot((e, t) => {
  t.exports = ["deg", "grad", "rad", "turn"];
});
var Wl = Ot((e, t) => {
  t.exports = ["dpi", "dpcm", "dppx"];
});
var $l = Ot((e, t) => {
  t.exports = ["Hz", "kHz"];
});
var ql = Ot((e, t) => {
  t.exports = ["s", "ms"];
});
var zl = Ml();
var Vo = Nl();
var Yo = Wl();
var Xo = $l();
var Qo = ql();
function En(e) {
  if (/\.\D?$/.test(e))
    throw new Error("The dot should be followed by a number");
  if (/^[+-]{2}/.test(e))
    throw new Error("Only one leading +/- is allowed");
  if (Ul(e) > 1)
    throw new Error("Only one dot is allowed");
  if (/%$/.test(e)) {
    this.type = "percentage", this.value = wn(e), this.unit = "%";
    return;
  }
  var t = jl(e);
  if (!t) {
    this.type = "number", this.value = wn(e);
    return;
  }
  this.type = Vl(t), this.value = wn(e.substr(0, e.length - t.length)), this.unit = t;
}
En.prototype.valueOf = function() {
  return this.value;
};
En.prototype.toString = function() {
  return this.value + (this.unit || "");
};
function Le(e) {
  return new En(e);
}
function Ul(e) {
  var t = e.match(/\./g);
  return t ? t.length : 0;
}
function wn(e) {
  var t = parseFloat(e);
  if (isNaN(t))
    throw new Error("Invalid number: " + e);
  return t;
}
var Gl = [].concat(Vo, Xo, zl, Yo, Qo);
function jl(e) {
  var t = e.match(/\D+$/), n = t && t[0];
  if (n && Gl.indexOf(n) === -1)
    throw new Error("Invalid unit: " + n);
  return n;
}
var Hl = Object.assign(Rr(Vo, "angle"), Rr(Xo, "frequency"), Rr(Yo, "resolution"), Rr(Qo, "time"));
function Rr(e, t) {
  return Object.fromEntries(e.map((n) => [n, t]));
}
function Vl(e) {
  return Hl[e] || "length";
}
function Dt(e) {
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
function O(e, t, n, r, i = false) {
  if (typeof e == "number")
    return e;
  try {
    if (e = e.trim(), /[ /\(,]/.test(e))
      return;
    if (e === String(+e))
      return +e;
    let o = new Le(e);
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
        return _n(e);
      if (o.type === "percentage" && i)
        return o.value / 100 * n;
    }
  } catch {
  }
}
function _n(e) {
  let t = new Le(e);
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
function Pt(e, t) {
  return [e[0] * t[0] + e[2] * t[1], e[1] * t[0] + e[3] * t[1], e[0] * t[2] + e[2] * t[3], e[1] * t[2] + e[3] * t[3], e[0] * t[4] + e[2] * t[5] + e[4], e[1] * t[4] + e[3] * t[5] + e[5]];
}
function ce(e, t, n, r) {
  let i = t[e];
  if (typeof i > "u") {
    if (r && typeof e < "u")
      throw new Error(`Invalid value for CSS property "${r}". Allowed values: ${Object.keys(t).map((o) => `"${o}"`).join(" | ")}. Received: "${e}".`);
    i = n;
  }
  return i;
}
var Sn;
var Cn;
var eu = [32, 160, 4961, 65792, 65793, 4153, 4241, 10].map((e) => String.fromCodePoint(e));
function le(e, t, n) {
  if (!Sn || !Cn) {
    if (!(typeof Intl < "u" && "Segmenter" in Intl))
      throw new Error("Intl.Segmenter does not exist, please use import a polyfill.");
    Sn = new Intl.Segmenter(n, { granularity: "word" }), Cn = new Intl.Segmenter(n, { granularity: "grapheme" });
  }
  if (t === "grapheme")
    return [...Cn.segment(e)].map((r) => r.segment);
  {
    let r = [...Sn.segment(e)].map((u2) => u2.segment), i = [], o = 0;
    for (; o < r.length; ) {
      let u2 = r[o];
      if (u2 == "\xA0") {
        let s = o === 0 ? "" : i.pop(), a = o === r.length - 1 ? "" : r[o + 1];
        i.push(s + "\xA0" + a), o += 2;
      } else
        i.push(u2), o++;
    }
    return i;
  }
}
function E(e, t, n) {
  let r = "";
  for (let [i, o] of Object.entries(t))
    typeof o < "u" && (r += ` ${i}="${o}"`);
  return n ? `<${e}${r}>${n}</${e}>` : `<${e}${r}/>`;
}
function tu(e = 20) {
  let t = /* @__PURE__ */ new Map();
  function n(o, u2) {
    if (t.size >= e) {
      let s = t.keys().next().value;
      t.delete(s);
    }
    t.set(o, u2);
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
function gt(e) {
  return e ? e.split(/[, ]/).filter(Boolean).map(Number) : null;
}
function Xl(e) {
  return Object.prototype.toString.call(e);
}
function Lr(e) {
  return typeof e == "string";
}
function ru(e) {
  return typeof e == "number";
}
function nu(e) {
  return Xl(e) === "[object Undefined]";
}
function iu(e, t) {
  if (t === "break-all")
    return { words: le(e, "grapheme"), requiredBreaks: [] };
  if (t === "keep-all")
    return { words: le(e, "word"), requiredBreaks: [] };
  let n = new $557adaaeb0c7885f$exports(e), r = 0, i = n.nextBreak(), o = [], u2 = [false];
  for (; i; ) {
    let s = e.slice(r, i.position);
    o.push(s), i.required ? u2.push(true) : u2.push(false), r = i.position, i = n.nextBreak();
  }
  return { words: o, requiredBreaks: u2 };
}
var ou = (e) => e.replaceAll(/([A-Z])/g, (t, n) => `-${n.toLowerCase()}`);
function Mr(e, t = ",") {
  let n = [], r = 0, i = 0;
  t = new RegExp(t);
  for (let o = 0; o < e.length; o++)
    e[o] === "(" ? i++ : e[o] === ")" && i--, i === 0 && t.test(e[o]) && (n.push(e.slice(r, o).trim()), r = o + 1);
  return n.push(e.slice(r).trim()), n;
}
var Ql = "image/avif";
var Kl = "image/webp";
var Nr = "image/apng";
var Wr = "image/png";
var $r = "image/jpeg";
var qr = "image/gif";
var kn = "image/svg+xml";
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
var Ae = tu(100);
var Bt = /* @__PURE__ */ new Map();
var Jl = [Wr, Nr, $r, qr, kn];
function Zl(e) {
  let t = "", n = new Uint8Array(e);
  for (let r = 0; r < n.byteLength; r++)
    t += String.fromCharCode(n[r]);
  return btoa(t);
}
function ef(e) {
  let t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    r[i] = t.charCodeAt(i);
  return r.buffer;
}
function uu(e, t) {
  let n = t.match(/<svg[^>]*>/)[0], r = n.match(/viewBox=['"](.+)['"]/), i = r ? gt(r[1]) : null, o = n.match(/width=['"](\d*\.\d+|\d+)['"]/), u2 = n.match(/height=['"](\d*\.\d+|\d+)['"]/);
  if (!i && (!o || !u2))
    throw new Error(`Failed to parse SVG from ${e}: missing "viewBox"`);
  let s = i ? [i[2], i[3]] : [+o[1], +u2[1]], a = s[0] / s[1];
  return o && u2 ? [+o[1], +u2[1]] : o ? [+o[1], +o[1] / a] : u2 ? [+u2[1] * a, +u2[1]] : [s[0], s[1]];
}
function su(e) {
  let t, n = tf(new Uint8Array(e));
  switch (n) {
    case Wr:
    case Nr:
      t = fu(e);
      break;
    case qr:
      t = lu(e);
      break;
    case $r:
      t = au(e);
      break;
  }
  if (!Jl.includes(n))
    throw new Error(`Unsupported image type: ${n || "unknown"}`);
  return [`data:${n};base64,${Zl(e)}`, t];
}
async function bt(e) {
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
      i = /data:(?<imageType>[a-z/+]+)(;[^;=]+=[^;=]+)*?(;(?<encodingType>[^;,]+))?,(?<dataString>.*)/g.exec(e).groups;
    } catch {
      return console.warn("Image data URI resolved without size:" + e), [e];
    }
    let { imageType: o, encodingType: u2, dataString: s } = i;
    if (o === kn) {
      let a = u2 === "base64" ? atob(s) : decodeURIComponent(s.replace(/ /g, "%20")), l2 = u2 === "base64" ? e : `data:image/svg+xml;base64,${btoa(a)}`, f = uu(e, a);
      return Ae.set(e, [l2, ...f]), [l2, ...f];
    } else if (u2 === "base64") {
      let a, l2 = ef(s);
      switch (o) {
        case Wr:
        case Nr:
          a = fu(l2);
          break;
        case qr:
          a = lu(l2);
          break;
        case $r:
          a = au(l2);
          break;
      }
      return Ae.set(e, [e, ...a]), [e, ...a];
    } else
      return console.warn("Image data URI resolved without size:" + e), Ae.set(e, [e]), [e];
  }
  if (!globalThis.fetch)
    throw new Error("`fetch` is required to be polyfilled to load images.");
  if (Bt.has(e))
    return Bt.get(e);
  let t = Ae.get(e);
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
    let [o, u2] = su(i);
    return [o, ...u2];
  }).then((i) => (Ae.set(n, i), i)).catch((i) => (console.error(`Can't load image ${n}: ` + i.message), Ae.set(n, []), []));
  return Bt.set(n, r), r;
}
function tf(e) {
  return [255, 216, 255].every((t, n) => e[n] === t) ? $r : [137, 80, 78, 71, 13, 10, 26, 10].every((t, n) => e[n] === t) ? rf(e) ? Nr : Wr : [71, 73, 70, 56].every((t, n) => e[n] === t) ? qr : [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80].every((t, n) => !t || e[n] === t) ? Kl : [60, 63, 120, 109, 108].every((t, n) => e[n] === t) ? kn : [0, 0, 0, 0, 102, 116, 121, 112, 97, 118, 105, 102].every((t, n) => !t || e[n] === t) ? Ql : null;
}
function rf(e) {
  let t = new DataView(e.buffer), n, r, i = 8, o = false;
  for (; !o && n !== "IEND" && i < e.length; ) {
    r = t.getUint32(i);
    let u2 = e.subarray(i + 4, i + 8);
    n = String.fromCharCode(...u2), o = n === "acTL", i += 12 + r;
  }
  return o;
}
var Tn = { accentHeight: "accent-height", alignmentBaseline: "alignment-baseline", arabicForm: "arabic-form", baselineShift: "baseline-shift", capHeight: "cap-height", clipPath: "clip-path", clipRule: "clip-rule", colorInterpolation: "color-interpolation", colorInterpolationFilters: "color-interpolation-filters", colorProfile: "color-profile", colorRendering: "color-rendering", dominantBaseline: "dominant-baseline", enableBackground: "enable-background", fillOpacity: "fill-opacity", fillRule: "fill-rule", floodColor: "flood-color", floodOpacity: "flood-opacity", fontFamily: "font-family", fontSize: "font-size", fontSizeAdjust: "font-size-adjust", fontStretch: "font-stretch", fontStyle: "font-style", fontVariant: "font-variant", fontWeight: "font-weight", glyphName: "glyph-name", glyphOrientationHorizontal: "glyph-orientation-horizontal", glyphOrientationVertical: "glyph-orientation-vertical", horizAdvX: "horiz-adv-x", horizOriginX: "horiz-origin-x", href: "href", imageRendering: "image-rendering", letterSpacing: "letter-spacing", lightingColor: "lighting-color", markerEnd: "marker-end", markerMid: "marker-mid", markerStart: "marker-start", overlinePosition: "overline-position", overlineThickness: "overline-thickness", paintOrder: "paint-order", panose1: "panose-1", pointerEvents: "pointer-events", renderingIntent: "rendering-intent", shapeRendering: "shape-rendering", stopColor: "stop-color", stopOpacity: "stop-opacity", strikethroughPosition: "strikethrough-position", strikethroughThickness: "strikethrough-thickness", strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin", strokeMiterlimit: "stroke-miterlimit", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width", textAnchor: "text-anchor", textDecoration: "text-decoration", textRendering: "text-rendering", underlinePosition: "underline-position", underlineThickness: "underline-thickness", unicodeBidi: "unicode-bidi", unicodeRange: "unicode-range", unitsPerEm: "units-per-em", vAlphabetic: "v-alphabetic", vHanging: "v-hanging", vIdeographic: "v-ideographic", vMathematical: "v-mathematical", vectorEffect: "vector-effect", vertAdvY: "vert-adv-y", vertOriginX: "vert-origin-x", vertOriginY: "vert-origin-y", wordSpacing: "word-spacing", writingMode: "writing-mode", xHeight: "x-height", xlinkActuate: "xlink:actuate", xlinkArcrole: "xlink:arcrole", xlinkHref: "xlink:href", xlinkRole: "xlink:role", xlinkShow: "xlink:show", xlinkTitle: "xlink:title", xlinkType: "xlink:type", xmlBase: "xml:base", xmlLang: "xml:lang", xmlSpace: "xml:space", xmlnsXlink: "xmlns:xlink" };
var nf = /[\r\n%#()<>?[\\\]^`{|}"']/g;
function An(e, t) {
  if (!e)
    return "";
  if (Array.isArray(e))
    return e.map((l2) => An(l2, t)).join("");
  if (typeof e != "object")
    return String(e);
  let n = e.type;
  if (n === "text")
    throw new Error("<text> nodes are not currently supported, please convert them to <path>");
  let { children: r, style: i, ...o } = e.props || {}, u2 = (i == null ? void 0 : i.color) || t, s = `${Object.entries(o).map(([l2, f]) => (typeof f == "string" && f.toLowerCase() === "currentcolor" && (f = u2), l2 === "href" && n === "image" ? ` ${Tn[l2] || l2}="${Ae.get(f)[0]}"` : ` ${Tn[l2] || l2}="${f}"`)).join("")}`, a = i ? ` style="${Object.entries(i).map(([l2, f]) => `${ou(l2)}:${f}`).join(";")}"` : "";
  return `<${n}${s}${a}>${An(r, u2)}</${n}>`;
}
async function cu(e) {
  let t = /* @__PURE__ */ new Set(), n = (r) => {
    if (r && Dt(r)) {
      if (Array.isArray(r)) {
        r.forEach((i) => n(i));
        return;
      } else
        typeof r == "object" && (r.type === "image" ? t.has(r.props.href) || t.add(r.props.href) : r.type === "img" && (t.has(r.props.src) || t.add(r.props.src)));
      Array.isArray(r.props.children) ? r.props.children.map((i) => n(i)) : n(r.props.children);
    }
  };
  return n(e), Promise.all(Array.from(t).map((r) => bt(r)));
}
async function du(e, t) {
  let { viewBox: n, viewbox: r, width: i, height: o, className: u2, style: s, children: a, ...l2 } = e.props || {};
  n || (n = r), l2.xmlns = "http://www.w3.org/2000/svg";
  let f = (s == null ? void 0 : s.color) || t, c2 = gt(n), p = c2 ? c2[3] / c2[2] : null;
  return i = i || p && o ? o / p : null, o = o || p && i ? i * p : null, l2.width = i, l2.height = o, n && (l2.viewBox = n), `data:image/svg+xml;utf8,${`<svg ${Object.entries(l2).map(([d2, h2]) => (typeof h2 == "string" && h2.toLowerCase() === "currentcolor" && (h2 = f), ` ${Tn[d2] || d2}="${h2}"`)).join("")}>${An(a, f)}</svg>`.replace(nf, encodeURIComponent)}`;
}
var be = "flex";
var pu = { p: { display: be, marginTop: "1em", marginBottom: "1em" }, div: { display: be }, blockquote: { display: be, marginTop: "1em", marginBottom: "1em", marginLeft: 40, marginRight: 40 }, center: { display: be, textAlign: "center" }, hr: { display: be, marginTop: "0.5em", marginBottom: "0.5em", marginLeft: "auto", marginRight: "auto", borderWidth: 1, borderStyle: "solid" }, h1: { display: be, fontSize: "2em", marginTop: "0.67em", marginBottom: "0.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h2: { display: be, fontSize: "1.5em", marginTop: "0.83em", marginBottom: "0.83em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h3: { display: be, fontSize: "1.17em", marginTop: "1em", marginBottom: "1em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h4: { display: be, marginTop: "1.33em", marginBottom: "1.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h5: { display: be, fontSize: "0.83em", marginTop: "1.67em", marginBottom: "1.67em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, h6: { display: be, fontSize: "0.67em", marginTop: "2.33em", marginBottom: "2.33em", marginLeft: 0, marginRight: 0, fontWeight: "bold" }, u: { textDecoration: "underline" }, strong: { fontWeight: "bold" }, b: { fontWeight: "bold" }, i: { fontStyle: "italic" }, em: { fontStyle: "italic" }, code: { fontFamily: "monospace" }, kbd: { fontFamily: "monospace" }, pre: { display: be, fontFamily: "monospace", whiteSpace: "pre", marginTop: "1em", marginBottom: "1em" }, mark: { backgroundColor: "yellow", color: "black" }, big: { fontSize: "larger" }, small: { fontSize: "smaller" }, s: { textDecoration: "line-through" } };
var of = /* @__PURE__ */ new Set(["color", "font", "fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textTransform", "textShadowOffset", "textShadowColor", "textShadowRadius", "WebkitTextStrokeWidth", "WebkitTextStrokeColor", "textDecorationLine", "textDecorationStyle", "textDecorationColor", "whiteSpace", "transform", "wordBreak", "tabSize", "opacity", "filter", "_viewportWidth", "_viewportHeight", "_inheritedClipPathId", "_inheritedMaskId", "_inheritedBackgroundClipTextPath"]);
function On(e) {
  let t = {};
  for (let n in e)
    of.has(n) && (t[n] = e[n]);
  return t;
}
function sf(e, t) {
  try {
    let n = new Le(e);
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
function Pn(e, t, n) {
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
      let r = sf(e, t);
      return r.absolute ? { [n ? "xAbsolute" : "yAbsolute"]: r.absolute } : r.relative ? { [n ? "xRelative" : "yRelative"]: r.relative } : {};
    }
  }
}
function Bn(e, t) {
  if (typeof e == "number")
    return { xAbsolute: e };
  let n;
  try {
    n = (0, import_postcss_value_parser.default)(e).nodes.filter((r) => r.type === "word").map((r) => r.value);
  } catch {
    return {};
  }
  return n.length === 1 ? Pn(n[0], t, true) : n.length === 2 ? ((n[0] === "top" || n[0] === "bottom" || n[1] === "left" || n[1] === "right") && n.reverse(), { ...Pn(n[0], t, true), ...Pn(n[1], t, false) }) : {};
}
function It(e, t) {
  let n = (0, import_css_to_react_native2.getPropertyName)(`mask-${t}`);
  return e[n] || e[`WebkitM${n.substring(1)}`];
}
function hu(e) {
  let t = e.maskImage || e.WebkitMaskImage, n = { position: It(e, "position") || "0% 0%", size: It(e, "size") || "100% 100%", repeat: It(e, "repeat") || "repeat", origin: It(e, "origin") || "border-box", clip: It(e, "origin") || "border-box" };
  return Mr(t).filter((i) => i && i !== "none").reverse().map((i) => ({ image: i, ...n }));
}
var pf = /* @__PURE__ */ new Set(["flex", "flexGrow", "flexShrink", "flexBasis", "fontWeight", "lineHeight", "opacity", "scale", "scaleX", "scaleY"]);
var hf = /* @__PURE__ */ new Set(["lineHeight"]);
function mf(e, t, n, r) {
  return e === "textDecoration" && !n.includes(t.textDecorationColor) && (t.textDecorationColor = r), t;
}
function tt(e, t) {
  let n = Number(t);
  return isNaN(n) ? t : pf.has(e) ? hf.has(e) ? n : String(t) : n + "px";
}
function Df(e, t, n) {
  if (e === "lineHeight")
    return { lineHeight: tt(e, t) };
  if (e === "fontFamily")
    return { fontFamily: t.split(",").map((r) => r.trim().replace(/(^['"])|(['"]$)/g, "").toLocaleLowerCase()) };
  if (e === "borderRadius") {
    if (typeof t != "string" || !t.includes("/"))
      return;
    let [r, i] = t.split("/"), o = (0, import_css_to_react_native.getStylesForProperty)(e, r, true), u2 = (0, import_css_to_react_native.getStylesForProperty)(e, i, true);
    for (let s in o)
      u2[s] = tt(e, o[s]) + " " + tt(e, u2[s]);
    return u2;
  }
  if (/^border(Top|Right|Bottom|Left)?$/.test(e)) {
    let r = (0, import_css_to_react_native.getStylesForProperty)("border", t, true);
    r.borderWidth === 1 && !String(t).includes("1px") && (r.borderWidth = 3), r.borderColor === "black" && !String(t).includes("black") && (r.borderColor = n);
    let i = { Width: tt(e + "Width", r.borderWidth), Style: ce(r.borderStyle, { solid: "solid", dashed: "dashed" }, "solid", e + "Style"), Color: r.borderColor }, o = {};
    for (let u2 of e === "border" ? ["Top", "Right", "Bottom", "Left"] : [e.slice(6)])
      for (let s in i)
        o["border" + u2 + s] = i[s];
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
    let r = {}, i = t.replace(/(-?[\d.]+%)/g, (u2, s) => {
      let a = ~~(Math.random() * 1e9);
      return r[a] = s, a + "px";
    }), o = (0, import_css_to_react_native.getStylesForProperty)("transform", i, true);
    for (let u2 of o.transform)
      for (let s in u2)
        r[u2[s]] && (u2[s] = r[u2[s]]);
    return o;
  }
  if (e === "background")
    return t = t.toString().trim(), /^(linear-gradient|radial-gradient|url|repeating-linear-gradient)\(/.test(t) ? (0, import_css_to_react_native.getStylesForProperty)("backgroundImage", t, true) : (0, import_css_to_react_native.getStylesForProperty)("background", t, true);
  if (e === "textShadow") {
    t = t.toString().trim();
    let r = {}, i = Mr(t);
    for (let o of i) {
      let u2 = (0, import_css_to_react_native.getStylesForProperty)("textShadow", o, true);
      for (let s in u2)
        r[s] ? r[s].push(u2[s]) : r[s] = [u2[s]];
    }
    return r;
  }
  if (e === "WebkitTextStroke") {
    t = t.toString().trim();
    let r = t.split(" ");
    if (r.length !== 2)
      throw new Error("Invalid `WebkitTextStroke` value.");
    return { WebkitTextStrokeWidth: tt(e, r[0]), WebkitTextStrokeColor: tt(e, r[1]) };
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
function zr(e, t) {
  let n = {};
  if (e) {
    let i = bf(e.color, t.color);
    n.color = i;
    for (let o in e) {
      if (o.startsWith("_")) {
        n[o] = e[o];
        continue;
      }
      if (o === "color")
        continue;
      let u2 = (0, import_css_to_react_native.getPropertyName)(o), s = yf(e[o], i);
      try {
        let a = Df(u2, s, i) || mf(u2, (0, import_css_to_react_native.getStylesForProperty)(u2, tt(u2, s), true), s, i);
        Object.assign(n, a);
      } catch (a) {
        throw new Error(a.message + (a.message.includes(s) ? `
  ` + mu(u2) : `
  in CSS rule \`${u2}: ${s}\`.${mu(u2)}`));
      }
    }
  }
  if (n.backgroundImage) {
    let { backgrounds: i } = (0, import_css_background_parser.parseElementStyle)(n);
    n.backgroundImage = i;
  }
  (n.maskImage || n.WebkitMaskImage) && (n.maskImage = hu(n));
  let r = gf(n.fontSize, t.fontSize);
  typeof n.fontSize < "u" && (n.fontSize = r), n.transformOrigin && (n.transformOrigin = Bn(n.transformOrigin, r));
  for (let i in n) {
    let o = n[i];
    if (i === "lineHeight")
      typeof o == "string" && o !== "normal" && (o = n[i] = O(o, r, r, t, true) / r);
    else {
      if (typeof o == "string") {
        let u2 = O(o, r, r, t);
        typeof u2 < "u" && (n[i] = u2), o = n[i];
      }
      if (typeof o == "string" || typeof o == "object") {
        let u2 = bu(o);
        u2 && (n[i] = u2), o = n[i];
      }
    }
    if (i === "opacity" && typeof o == "number" && (n.opacity = o * t.opacity), i === "transform") {
      let u2 = o;
      for (let s of u2) {
        let a = Object.keys(s)[0], l2 = s[a], f = typeof l2 == "string" ? O(l2, r, r, t) ?? l2 : l2;
        s[a] = f;
      }
    }
    if (i === "textShadowRadius") {
      let u2 = o;
      n.textShadowRadius = u2.map((s) => O(s, r, 0, t, false));
    }
    if (i === "textShadowOffset") {
      let u2 = o;
      n.textShadowOffset = u2.map(({ height: s, width: a }) => ({ height: O(s, r, 0, t, false), width: O(a, r, 0, t, false) }));
    }
  }
  return n;
}
function gf(e, t) {
  if (typeof e == "number")
    return e;
  try {
    let n = new Le(e);
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
function bf(e, t) {
  return e && e.toLowerCase() !== "currentcolor" ? gu(e) : gu(t);
}
function vf(e, t) {
  return e.replace(/currentcolor/gi, t);
}
function yf(e, t) {
  return Lr(e) && (e = vf(e, t)), e;
}
async function In(e, t, n, r, i) {
  let o = await Re(), u2 = { ...n, ...zr(pu[t], n), ...zr(r, n) };
  if (t === "img") {
    let [s, a, l2] = await bt(i.src);
    if (a === void 0 && l2 === void 0) {
      if (i.width === void 0 || i.height === void 0)
        throw new Error("Image size cannot be determined. Please provide the width and height of the image.");
      a = parseInt(i.width), l2 = parseInt(i.height);
    }
    let f = l2 / a, c2 = (u2.borderLeftWidth || 0) + (u2.borderRightWidth || 0) + (u2.paddingLeft || 0) + (u2.paddingRight || 0), p = (u2.borderTopWidth || 0) + (u2.borderBottomWidth || 0) + (u2.paddingTop || 0) + (u2.paddingBottom || 0), d2 = u2.width || i.width, h2 = u2.height || i.height, m2 = typeof d2 == "number" && typeof h2 == "number";
    m2 && (d2 -= c2, h2 -= p), d2 === void 0 && h2 === void 0 ? (d2 = "100%", e.setAspectRatio(1 / f)) : d2 === void 0 ? typeof h2 == "number" ? d2 = h2 / f : e.setAspectRatio(1 / f) : h2 === void 0 && (typeof d2 == "number" ? h2 = d2 * f : e.setAspectRatio(1 / f)), u2.width = m2 ? d2 + c2 : d2, u2.height = m2 ? h2 + p : h2, u2.__src = s;
  }
  if (t === "svg") {
    let s = i.viewBox || i.viewbox, a = gt(s), l2 = a ? a[3] / a[2] : null, { width: f, height: c2 } = i;
    typeof f > "u" && c2 ? l2 == null ? f = 0 : typeof c2 == "string" && c2.endsWith("%") ? f = parseInt(c2) / l2 + "%" : (c2 = O(c2, n.fontSize, 1, n), f = c2 / l2) : typeof c2 > "u" && f ? l2 == null ? f = 0 : typeof f == "string" && f.endsWith("%") ? c2 = parseInt(f) * l2 + "%" : (f = O(f, n.fontSize, 1, n), c2 = f * l2) : (typeof f < "u" && (f = O(f, n.fontSize, 1, n) || f), typeof c2 < "u" && (c2 = O(c2, n.fontSize, 1, n) || c2), f || (f = a == null ? void 0 : a[2]), c2 || (c2 = a == null ? void 0 : a[3])), !u2.width && f && (u2.width = f), !u2.height && c2 && (u2.height = c2);
  }
  return e.setDisplay(ce(u2.display, { flex: o.DISPLAY_FLEX, block: o.DISPLAY_FLEX, none: o.DISPLAY_NONE, "-webkit-box": o.DISPLAY_FLEX }, o.DISPLAY_FLEX, "display")), e.setAlignContent(ce(u2.alignContent, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, "space-between": o.ALIGN_SPACE_BETWEEN, "space-around": o.ALIGN_SPACE_AROUND, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_AUTO, "alignContent")), e.setAlignItems(ce(u2.alignItems, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_STRETCH, "alignItems")), e.setAlignSelf(ce(u2.alignSelf, { stretch: o.ALIGN_STRETCH, center: o.ALIGN_CENTER, "flex-start": o.ALIGN_FLEX_START, "flex-end": o.ALIGN_FLEX_END, baseline: o.ALIGN_BASELINE, normal: o.ALIGN_AUTO }, o.ALIGN_AUTO, "alignSelf")), e.setJustifyContent(ce(u2.justifyContent, { center: o.JUSTIFY_CENTER, "flex-start": o.JUSTIFY_FLEX_START, "flex-end": o.JUSTIFY_FLEX_END, "space-between": o.JUSTIFY_SPACE_BETWEEN, "space-around": o.JUSTIFY_SPACE_AROUND }, o.JUSTIFY_FLEX_START, "justifyContent")), e.setFlexDirection(ce(u2.flexDirection, { row: o.FLEX_DIRECTION_ROW, column: o.FLEX_DIRECTION_COLUMN, "row-reverse": o.FLEX_DIRECTION_ROW_REVERSE, "column-reverse": o.FLEX_DIRECTION_COLUMN_REVERSE }, o.FLEX_DIRECTION_ROW, "flexDirection")), e.setFlexWrap(ce(u2.flexWrap, { wrap: o.WRAP_WRAP, nowrap: o.WRAP_NO_WRAP, "wrap-reverse": o.WRAP_WRAP_REVERSE }, o.WRAP_NO_WRAP, "flexWrap")), typeof u2.gap < "u" && e.setGap(o.GUTTER_ALL, u2.gap), typeof u2.rowGap < "u" && e.setGap(o.GUTTER_ROW, u2.rowGap), typeof u2.columnGap < "u" && e.setGap(o.GUTTER_COLUMN, u2.columnGap), typeof u2.flexBasis < "u" && e.setFlexBasis(u2.flexBasis), e.setFlexGrow(typeof u2.flexGrow > "u" ? 0 : u2.flexGrow), e.setFlexShrink(typeof u2.flexShrink > "u" ? 0 : u2.flexShrink), typeof u2.maxHeight < "u" && e.setMaxHeight(u2.maxHeight), typeof u2.maxWidth < "u" && e.setMaxWidth(u2.maxWidth), typeof u2.minHeight < "u" && e.setMinHeight(u2.minHeight), typeof u2.minWidth < "u" && e.setMinWidth(u2.minWidth), e.setOverflow(ce(u2.overflow, { visible: o.OVERFLOW_VISIBLE, hidden: o.OVERFLOW_HIDDEN }, o.OVERFLOW_VISIBLE, "overflow")), e.setMargin(o.EDGE_TOP, u2.marginTop || 0), e.setMargin(o.EDGE_BOTTOM, u2.marginBottom || 0), e.setMargin(o.EDGE_LEFT, u2.marginLeft || 0), e.setMargin(o.EDGE_RIGHT, u2.marginRight || 0), e.setBorder(o.EDGE_TOP, u2.borderTopWidth || 0), e.setBorder(o.EDGE_BOTTOM, u2.borderBottomWidth || 0), e.setBorder(o.EDGE_LEFT, u2.borderLeftWidth || 0), e.setBorder(o.EDGE_RIGHT, u2.borderRightWidth || 0), e.setPadding(o.EDGE_TOP, u2.paddingTop || 0), e.setPadding(o.EDGE_BOTTOM, u2.paddingBottom || 0), e.setPadding(o.EDGE_LEFT, u2.paddingLeft || 0), e.setPadding(o.EDGE_RIGHT, u2.paddingRight || 0), e.setPositionType(ce(u2.position, { absolute: o.POSITION_TYPE_ABSOLUTE, relative: o.POSITION_TYPE_RELATIVE }, o.POSITION_TYPE_RELATIVE, "position")), typeof u2.top < "u" && e.setPosition(o.EDGE_TOP, u2.top), typeof u2.bottom < "u" && e.setPosition(o.EDGE_BOTTOM, u2.bottom), typeof u2.left < "u" && e.setPosition(o.EDGE_LEFT, u2.left), typeof u2.right < "u" && e.setPosition(o.EDGE_RIGHT, u2.right), typeof u2.height < "u" ? e.setHeight(u2.height) : e.setHeightAuto(), typeof u2.width < "u" ? e.setWidth(u2.width) : e.setWidthAuto(), [u2, On(u2)];
}
var vu = [1, 0, 0, 1, 0, 0];
function xf(e, t, n) {
  let r = [...vu];
  for (let i of e) {
    let o = Object.keys(i)[0], u2 = i[o];
    if (typeof u2 == "string")
      if (o === "translateX")
        u2 = parseFloat(u2) / 100 * t, i[o] = u2;
      else if (o === "translateY")
        u2 = parseFloat(u2) / 100 * n, i[o] = u2;
      else
        throw new Error(`Invalid transform: "${o}: ${u2}".`);
    let s = u2, a = [...vu];
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
        let l2 = s * Math.PI / 180, f = Math.cos(l2), c2 = Math.sin(l2);
        a[0] = f, a[1] = c2, a[2] = -c2, a[3] = f;
        break;
      }
      case "skewX":
        a[2] = Math.tan(s * Math.PI / 180);
        break;
      case "skewY":
        a[1] = Math.tan(s * Math.PI / 180);
        break;
    }
    r = Pt(a, r);
  }
  e.splice(0, e.length), e.push(...r), e.__resolved = true;
}
function Rt({ left: e, top: t, width: n, height: r }, i, o, u2) {
  let s;
  i.__resolved || xf(i, n, r);
  let a = i;
  if (o)
    s = a;
  else {
    let l2 = (u2 == null ? void 0 : u2.xAbsolute) ?? ((u2 == null ? void 0 : u2.xRelative) ?? 50) * n / 100, f = (u2 == null ? void 0 : u2.yAbsolute) ?? ((u2 == null ? void 0 : u2.yRelative) ?? 50) * r / 100, c2 = e + l2, p = t + f;
    s = Pt([1, 0, 0, 1, c2, p], Pt(a, [1, 0, 0, 1, -c2, -p])), a.__parent && (s = Pt(a.__parent, s)), a.splice(0, 6, ...s);
  }
  return `matrix(${s.map((l2) => l2.toFixed(2)).join(",")})`;
}
function xu({ left: e, top: t, width: n, height: r, isInheritingTransform: i }, o) {
  let u2 = "", s = 1;
  return o.transform && (u2 = Rt({ left: e, top: t, width: n, height: r }, o.transform, i, o.transformOrigin)), o.opacity !== void 0 && (s = +o.opacity), { matrix: u2, opacity: s };
}
function Rn({ id: e, content: t, filter: n, left: r, top: i, width: o, height: u2, matrix: s, opacity: a, image: l2, clipPathId: f, debug: c2, shape: p, decorationShape: d2 }, h2) {
  let m2 = "";
  if (c2 && (m2 = E("rect", { x: r, y: i - u2, width: o, height: u2, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: s || void 0, "clip-path": f ? `url(#${f})` : void 0 })), l2) {
    let g2 = { href: l2, x: r, y: i, width: o, height: u2, transform: s || void 0, "clip-path": f ? `url(#${f})` : void 0, style: h2.filter ? `filter:${h2.filter}` : void 0 };
    return [(n ? `${n}<g filter="url(#satori_s-${e})">` : "") + E("image", { ...g2, opacity: a !== 1 ? a : void 0 }) + (d2 || "") + (n ? "</g>" : "") + m2, ""];
  }
  let x2 = { x: r, y: i, width: o, height: u2, "font-weight": h2.fontWeight, "font-style": h2.fontStyle, "font-size": h2.fontSize, "font-family": h2.fontFamily, "letter-spacing": h2.letterSpacing || void 0, transform: s || void 0, "clip-path": f ? `url(#${f})` : void 0, style: h2.filter ? `filter:${h2.filter}` : void 0, "stroke-width": h2.WebkitTextStrokeWidth ? `${h2.WebkitTextStrokeWidth}px` : void 0, stroke: h2.WebkitTextStrokeWidth ? h2.WebkitTextStrokeColor : void 0, "stroke-linejoin": h2.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": h2.WebkitTextStrokeWidth ? "stroke" : void 0 };
  return [(n ? `${n}<g filter="url(#satori_s-${e})">` : "") + E("text", { ...x2, fill: h2.color, opacity: a !== 1 ? a : void 0 }, (0, import_escape_html.default)(t)) + (d2 || "") + (n ? "</g>" : "") + m2, p ? E("text", x2, (0, import_escape_html.default)(t)) : ""];
}
function Ff(e, t, n) {
  return e.replace(/([MA])([0-9.-]+),([0-9.-]+)/g, function(r, i, o, u2) {
    return i + (parseFloat(o) + t) + "," + (parseFloat(u2) + n);
  });
}
var Ur = 1.1;
function Fu({ id: e, width: t, height: n }, r) {
  if (!r.shadowColor || !r.shadowOffset || typeof r.shadowRadius > "u")
    return "";
  let i = r.shadowColor.length, o = "", u2 = "", s = 0, a = t, l2 = 0, f = n;
  for (let c2 = 0; c2 < i; c2++) {
    let p = r.shadowRadius[c2] * r.shadowRadius[c2] / 4;
    s = Math.min(r.shadowOffset[c2].width - p, s), a = Math.max(r.shadowOffset[c2].width + p + t, a), l2 = Math.min(r.shadowOffset[c2].height - p, l2), f = Math.max(r.shadowOffset[c2].height + p + n, f), o += E("feDropShadow", { dx: r.shadowOffset[c2].width, dy: r.shadowOffset[c2].height, stdDeviation: r.shadowRadius[c2] / 2, "flood-color": r.shadowColor[c2], "flood-opacity": 1, ...i > 1 ? { in: "SourceGraphic", result: `satori_s-${e}-result-${c2}` } : {} }), i > 1 && (u2 = E("feMergeNode", { in: `satori_s-${e}-result-${c2}` }) + u2);
  }
  return E("filter", { id: `satori_s-${e}`, x: (s / t * 100 * Ur).toFixed(2) + "%", y: (l2 / n * 100 * Ur).toFixed(2) + "%", width: ((a - s) / t * 100 * Ur).toFixed(2) + "%", height: ((f - l2) / n * 100 * Ur).toFixed(2) + "%" }, o + (u2 ? E("feMerge", {}, u2) : ""));
}
function wu({ width: e, height: t, shape: n, opacity: r, id: i }, o) {
  if (!o.boxShadow)
    return null;
  let u2 = "", s = "";
  for (let a = o.boxShadow.length - 1; a >= 0; a--) {
    let l2 = "", f = o.boxShadow[a];
    f.spreadRadius && f.inset && (f.spreadRadius = -f.spreadRadius);
    let c2 = f.blurRadius * f.blurRadius / 4 + (f.spreadRadius || 0), p = Math.min(-c2 - (f.inset ? f.offsetX : 0), 0), d2 = Math.max(c2 + e - (f.inset ? f.offsetX : 0), e), h2 = Math.min(-c2 - (f.inset ? f.offsetY : 0), 0), m2 = Math.max(c2 + t - (f.inset ? f.offsetY : 0), t), x2 = `satori_s-${i}-${a}`, g2 = `satori_ms-${i}-${a}`, S2 = f.spreadRadius ? n.replace('stroke-width="0"', `stroke-width="${f.spreadRadius * 2}"`) : n;
    l2 += E("mask", { id: g2, maskUnits: "userSpaceOnUse" }, E("rect", { x: 0, y: 0, width: o._viewportWidth || "100%", height: o._viewportHeight || "100%", fill: f.inset ? "#000" : "#fff" }) + S2.replace('fill="#fff"', f.inset ? 'fill="#fff"' : 'fill="#000"').replace('stroke="#fff"', ""));
    let v2 = S2.replace(/d="([^"]+)"/, (b, y) => 'd="' + Ff(y, f.offsetX, f.offsetY) + '"').replace(/x="([^"]+)"/, (b, y) => 'x="' + (parseFloat(y) + f.offsetX) + '"').replace(/y="([^"]+)"/, (b, y) => 'y="' + (parseFloat(y) + f.offsetY) + '"');
    f.spreadRadius && f.spreadRadius < 0 && (l2 += E("mask", { id: g2 + "-neg", maskUnits: "userSpaceOnUse" }, v2.replace('stroke="#fff"', 'stroke="#000"').replace(/stroke-width="[^"]+"/, `stroke-width="${-f.spreadRadius * 2}"`))), f.spreadRadius && f.spreadRadius < 0 && (v2 = E("g", { mask: `url(#${g2}-neg)` }, v2)), l2 += E("defs", {}, E("filter", { id: x2, x: `${p / e * 100}%`, y: `${h2 / t * 100}%`, width: `${(d2 - p) / e * 100}%`, height: `${(m2 - h2) / t * 100}%` }, E("feGaussianBlur", { stdDeviation: f.blurRadius / 2, result: "b" }) + E("feFlood", { "flood-color": f.color, in: "SourceGraphic", result: "f" }) + E("feComposite", { in: "f", in2: "b", operator: f.inset ? "out" : "in" }))) + E("g", { mask: `url(#${g2})`, filter: `url(#${x2})`, opacity: r }, v2), f.inset ? s += l2 : u2 += l2;
  }
  return [u2, s];
}
function Ln({ width: e, left: t, top: n, ascender: r, clipPathId: i, matrix: o }, u2) {
  let { textDecorationColor: s, textDecorationStyle: a, textDecorationLine: l2, fontSize: f, color: c2 } = u2;
  if (!l2 || l2 === "none")
    return "";
  let p = Math.max(1, f * 0.1), d2 = l2 === "line-through" ? n + r * 0.7 : l2 === "underline" ? n + r * 1.1 : n, h2 = a === "dashed" ? `${p * 1.2} ${p * 2}` : a === "dotted" ? `0 ${p * 2}` : void 0;
  return (i ? `<g clip-path="url(#${i})">` : "") + E("line", { x1: t, y1: d2, x2: t + e, y2: d2, stroke: s || c2, "stroke-width": p, "stroke-dasharray": h2, "stroke-linecap": a === "dotted" ? "round" : "square", transform: o }) + (i ? "</g>" : "");
}
function Mn(e) {
  return e = e.replace("U+", "0x"), String.fromCodePoint(Number(e));
}
var rt = Mn("U+0020");
var Nn = Mn("U+0009");
var vt = Mn("U+2026");
function Eu(e, t, n) {
  let { fontSize: r, letterSpacing: i } = n, o = /* @__PURE__ */ new Map();
  function u2(l2) {
    if (o.has(l2))
      return o.get(l2);
    let f = e.measure(l2, { fontSize: r, letterSpacing: i });
    return o.set(l2, f), f;
  }
  function s(l2) {
    let f = 0;
    for (let c2 of l2)
      t(c2) ? f += r : f += u2(c2);
    return f;
  }
  function a(l2) {
    return s(le(l2, "grapheme"));
  }
  return { measureGrapheme: u2, measureGraphemeArray: s, measureText: a };
}
function Su(e, t, n) {
  let { textTransform: r, whiteSpace: i, wordBreak: o } = t;
  e = wf(e, r, n);
  let { content: u2, shouldCollapseTabsAndSpaces: s, allowSoftWrap: a } = Cf(e, i), { words: l2, requiredBreaks: f, allowBreakWord: c2 } = Sf(u2, o), [p, d2] = Ef(t, a);
  return { words: l2, requiredBreaks: f, allowSoftWrap: a, allowBreakWord: c2, processedContent: u2, shouldCollapseTabsAndSpaces: s, lineLimit: p, blockEllipsis: d2 };
}
function wf(e, t, n) {
  return t === "uppercase" ? e = e.toLocaleUpperCase(n) : t === "lowercase" ? e = e.toLocaleLowerCase(n) : t === "capitalize" && (e = le(e, "word", n).map((r) => le(r, "grapheme", n).map((i, o) => o === 0 ? i.toLocaleUpperCase(n) : i).join("")).join("")), e;
}
function Ef(e, t) {
  let { textOverflow: n, lineClamp: r, WebkitLineClamp: i, WebkitBoxOrient: o, overflow: u2, display: s } = e;
  if (s === "block" && r) {
    let [a, l2 = vt] = _f(r);
    if (a)
      return [a, l2];
  }
  return n === "ellipsis" && s === "-webkit-box" && o === "vertical" && ru(i) && i > 0 ? [i, vt] : n === "ellipsis" && u2 === "hidden" && !t ? [1, vt] : [1 / 0];
}
function Sf(e, t) {
  let n = ["break-all", "break-word"].includes(t), { words: r, requiredBreaks: i } = iu(e, t);
  return { words: r, requiredBreaks: i, allowBreakWord: n };
}
function Cf(e, t) {
  let n = ["pre", "pre-wrap", "pre-line"].includes(t), r = ["normal", "nowrap", "pre-line"].includes(t), i = !["pre", "nowrap"].includes(t);
  return n || (e = e.replace(/\n/g, rt)), r && (e = e.replace(/([ ]|\t)+/g, rt).replace(/^[ ]|[ ]$/g, "")), { content: e, shouldCollapseTabsAndSpaces: r, allowSoftWrap: i };
}
function _f(e) {
  if (typeof e == "number")
    return [e];
  let t = /^(\d+)\s*"(.*)"$/, n = /^(\d+)\s*'(.*)'$/, r = t.exec(e), i = n.exec(e);
  if (r) {
    let o = +r[1], u2 = r[2];
    return [o, u2];
  } else if (i) {
    let o = +i[1], u2 = i[2];
    return [o, u2];
  }
  return [];
}
var kf = /* @__PURE__ */ new Set([Nn]);
function Tf(e) {
  return kf.has(e);
}
async function* Wn(e, t) {
  let n = await Re(), { parentStyle: r, inheritedStyle: i, parent: o, font: u2, id: s, isInheritingTransform: a, debug: l2, embedFont: f, graphemeImages: c2, locale: p, canLoadAdditionalAssets: d2 } = t, { textAlign: h2, lineHeight: m2, textWrap: x2, fontSize: g2, filter: S2, tabSize: v2 = 8, letterSpacing: b, _inheritedBackgroundClipTextPath: y, flexShrink: T } = r, { words: A, requiredBreaks: P2, allowSoftWrap: j, allowBreakWord: ie, processedContent: ue, shouldCollapseTabsAndSpaces: fe, lineLimit: Q, blockEllipsis: oe } = Su(e, r, p), Z = Af(n, h2);
  o.insertChild(Z, o.getChildCount()), nu(T) && o.setFlexShrink(1);
  let N = u2.getEngine(g2, m2, r, p), Ee = d2 ? le(ue, "grapheme").filter((B) => !Tf(B) && !N.has(B)) : [];
  yield Ee.map((B) => ({ word: B, locale: p })), Ee.length && (N = u2.getEngine(g2, m2, r, p));
  function _e(B) {
    return !!(c2 && c2[B]);
  }
  let { measureGrapheme: me, measureGraphemeArray: wr, measureText: Ke } = Eu(N, _e, { fontSize: g2, letterSpacing: b }), Ct = Lr(v2) ? O(v2, g2, 1, r) : me(rt) * v2, Er = (B, H) => {
    if (B.length === 0)
      return { originWidth: 0, endingSpacesWidth: 0, text: B };
    let { index: K2, tabCount: W } = Of(B), ee = 0;
    if (W > 0) {
      let te = B.slice(0, K2), J = B.slice(K2 + W), z = Ke(te), Te = z + H;
      ee = (Ct === 0 ? z : (Math.floor(Te / Ct) + W) * Ct) + Ke(J);
    } else
      ee = Ke(B);
    let $ = B.trimEnd() === B ? ee : Ke(B.trimEnd());
    return { originWidth: ee, endingSpacesWidth: ee - $, text: B };
  }, I = [], De = [], lt = [], ft = [], _t = [];
  function bn(B) {
    let H = 0, K2 = 0, W = -1, ee = 0, $ = 0, te = 0, J = 0;
    I = [], lt = [0], ft = [], _t = [];
    let z = 0, Te = 0;
    for (; z < A.length && H < Q; ) {
      let R2 = A[z], Je = P2[z], ge = 0, { originWidth: ze, endingSpacesWidth: Or, text: Ue } = Er(R2, $);
      R2 = Ue, ge = ze;
      let V = Or;
      Je && te === 0 && (te = N.height(R2));
      let se = ",.!?:-@)>]}%#".indexOf(R2[0]) < 0, Ge = !$, Pr = z && se && $ + ge > B + V && j;
      if (ie && ge > B && (!$ || Pr || Je)) {
        let ae = le(R2, "grapheme");
        A.splice(z, 1, ...ae), $ > 0 && (I.push($ - Te), De.push(J), H++, ee += te, $ = 0, te = 0, J = 0, lt.push(1), W = -1), Te = V;
        continue;
      }
      if (Je || Pr)
        fe && R2 === rt && (ge = 0), I.push($ - Te), De.push(J), H++, ee += te, $ = ge, te = ge ? N.height(R2) : 0, J = ge ? N.baseline(R2) : 0, lt.push(1), W = -1, Je || (K2 = Math.max(K2, B));
      else {
        $ += ge;
        let ae = N.height(R2);
        ae > te && (te = ae, J = N.baseline(R2)), Ge && lt[lt.length - 1]++;
      }
      Ge && W++, K2 = Math.max(K2, $);
      let Ze = $ - ge;
      if (ge === 0)
        _t.push({ y: ee, x: Ze, width: 0, line: H, lineIndex: W, isImage: false });
      else {
        let ae = le(R2, "word");
        for (let Se = 0; Se < ae.length; Se++) {
          let et2 = ae[Se], Ie = 0, Tt = false;
          _e(et2) ? (Ie = g2, Tt = true) : Ie = me(et2), ft.push(et2), _t.push({ y: ee, x: Ze, width: Ie, line: H, lineIndex: W, isImage: Tt }), Ze += Ie;
        }
      }
      z++, Te = V;
    }
    return $ && (H < Q && (ee += te), H++, I.push($), De.push(J)), { width: K2, height: ee };
  }
  let Sr = { width: 0, height: 0 };
  Z.setMeasureFunc((B) => {
    let { width: H, height: K2 } = bn(B);
    if (x2 === "balance") {
      let ee = H / 2, $ = H, te = H;
      for (; ee + 1 < $; ) {
        te = (ee + $) / 2;
        let { height: z } = bn(te);
        z > K2 ? ee = te : $ = te;
      }
      bn($);
      let J = Math.ceil($);
      return Sr = { width: J, height: K2 }, { width: J, height: K2 };
    }
    let W = Math.ceil(H);
    return Sr = { width: W, height: K2 }, { width: W, height: K2 };
  });
  let [Sl, Cl] = yield, vn = "", Cr = "", $e = i._inheritedClipPathId, Mo = i._inheritedMaskId, { left: No, top: Wo, width: yn, height: _l } = Z.getComputedLayout(), _r = o.getComputedWidth() - o.getComputedPadding(n.EDGE_LEFT) - o.getComputedPadding(n.EDGE_RIGHT) - o.getComputedBorder(n.EDGE_LEFT) - o.getComputedBorder(n.EDGE_RIGHT), ct = Sl + No, dt = Cl + Wo, { matrix: ke, opacity: kr } = xu({ left: No, top: Wo, width: yn, height: _l, isInheritingTransform: a }, r), pt = "";
  if (r.textShadowOffset) {
    let { textShadowColor: B, textShadowOffset: H, textShadowRadius: K2 } = r;
    pt = Fu({ width: Sr.width, height: Sr.height, id: s }, { shadowColor: B, shadowOffset: H, shadowRadius: K2 }), pt = E("defs", {}, pt);
  }
  let kt = "", Tr = "", $o = "", Ar = -1, ht = {}, qe = null, qo = 0;
  for (let B = 0; B < ft.length; B++) {
    let H = _t[B], K2 = _t[B + 1];
    if (!H)
      continue;
    let W = ft[B], ee = null, $ = false, te = c2 ? c2[W] : null, J = H.y, z = H.x, Te = H.width, R2 = H.line;
    if (R2 === Ar)
      continue;
    let Je = false;
    if (I.length > 1) {
      let V = yn - I[R2];
      if (h2 === "right" || h2 === "end")
        z += V;
      else if (h2 === "center")
        z += V / 2;
      else if (h2 === "justify" && R2 < I.length - 1) {
        let se = lt[R2], Ge = se > 1 ? V / (se - 1) : 0;
        z += Ge * H.lineIndex, Je = true;
      }
    }
    let ge = De[R2], ze = N.baseline(W), Or = N.height(W), Ue = ge - ze;
    if (ht[R2] || (ht[R2] = [z, dt + J + Ue, ze, Je ? yn : I[R2]]), Q !== 1 / 0) {
      let Ze = function(ae, Se) {
        let et2 = le(Se, "grapheme", p), Ie = "", Tt = 0;
        for (let zo of et2) {
          let Uo = ae + wr([Ie + zo]);
          if (Ie && Uo + se > _r)
            break;
          Ie += zo, Tt = Uo;
        }
        return { subset: Ie, resolvedWidth: Tt };
      }, V = oe, se = me(oe);
      se > _r && (V = vt, se = me(V));
      let Ge = me(rt), Pr = R2 < I.length - 1;
      if (R2 + 1 === Q && (Pr || I[R2] > _r)) {
        if (z + Te + se + Ge > _r) {
          let { subset: ae, resolvedWidth: Se } = Ze(z, W);
          W = ae + V, Ar = R2, ht[R2][2] = Se, $ = true;
        } else if (K2 && K2.line !== R2)
          if (h2 === "center") {
            let { subset: ae, resolvedWidth: Se } = Ze(z, W);
            W = ae + V, Ar = R2, ht[R2][2] = Se, $ = true;
          } else {
            let ae = ft[B + 1], { subset: Se, resolvedWidth: et2 } = Ze(Te + z, ae);
            W = W + Se + V, Ar = R2, ht[R2][2] = et2, $ = true;
          }
      }
    }
    if (te)
      J += 0;
    else if (f) {
      if (!W.includes(Nn) && !eu.includes(W) && ft[B + 1] && K2 && !K2.isImage && J === K2.y && !$) {
        qe === null && (qo = z), qe = qe === null ? W : qe + W;
        continue;
      }
      let V = qe === null ? W : qe + W, se = qe === null ? z : qo, Ge = H.width + z - se;
      ee = N.getSVG(V.replace(/(\t)+/g, ""), { fontSize: g2, left: ct + se, top: dt + J + ze + Ue, letterSpacing: b }), qe = null, l2 && ($o += E("rect", { x: ct + se, y: dt + J + Ue, width: Ge, height: Or, fill: "transparent", stroke: "#575eff", "stroke-width": 1, transform: ke || void 0, "clip-path": $e ? `url(#${$e})` : void 0 }) + E("line", { x1: ct + z, x2: ct + z + H.width, y1: dt + J + Ue + ze, y2: dt + J + Ue + ze, stroke: "#14c000", "stroke-width": 1, transform: ke || void 0, "clip-path": $e ? `url(#${$e})` : void 0 }));
    } else
      J += ze + Ue;
    if (r.textDecorationLine) {
      let V = ht[R2];
      V && !V[4] && (kt += Ln({ left: ct + V[0], top: V[1], width: V[3], ascender: V[2], clipPathId: $e, matrix: ke }, r), V[4] = 1);
    }
    if (ee !== null)
      Tr += ee + " ";
    else {
      let [V, se] = Rn({ content: W, filter: pt, id: s, left: ct + z, top: dt + J, width: Te, height: Or, matrix: ke, opacity: kr, image: te, clipPathId: $e, debug: l2, shape: !!y, decorationShape: kt }, r);
      vn += V, Cr += se, kt = "";
    }
    if ($)
      break;
  }
  if (Tr) {
    let B = r.color !== "transparent" && kr !== 0 ? E("path", { fill: r.color, d: Tr, transform: ke || void 0, opacity: kr !== 1 ? kr : void 0, "clip-path": $e ? `url(#${$e})` : void 0, mask: Mo ? `url(#${Mo})` : void 0, style: S2 ? `filter:${S2}` : void 0, "stroke-width": i.WebkitTextStrokeWidth ? `${i.WebkitTextStrokeWidth}px` : void 0, stroke: i.WebkitTextStrokeWidth ? i.WebkitTextStrokeColor : void 0, "stroke-linejoin": i.WebkitTextStrokeWidth ? "round" : void 0, "paint-order": i.WebkitTextStrokeWidth ? "stroke" : void 0 }) : "";
    y && (Cr = E("path", { d: Tr, transform: ke || void 0 })), vn += (pt ? pt + E("g", { filter: `url(#satori_s-${s})` }, B + kt) : B + kt) + $o;
  }
  return Cr && (r._inheritedBackgroundClipTextPath.value += Cr), vn;
}
function Af(e, t) {
  let n = e.Node.create();
  return n.setAlignItems(e.ALIGN_BASELINE), n.setJustifyContent(ce(t, { left: e.JUSTIFY_FLEX_START, right: e.JUSTIFY_FLEX_END, center: e.JUSTIFY_CENTER, justify: e.JUSTIFY_SPACE_BETWEEN, start: e.JUSTIFY_FLEX_START, end: e.JUSTIFY_FLEX_END }, e.JUSTIFY_FLEX_START, "textAlign")), n;
}
function Of(e) {
  let t = /(\t)+/.exec(e);
  return t ? { index: t.index, tabCount: t[0].length } : { index: null, tabCount: 0 };
}
function Gr(e, t, n, r, i) {
  let o = [];
  for (let l2 of t) {
    let { color: f } = l2;
    if (!o.length && (o.push({ offset: 0, color: f }), !l2.offset || l2.offset.value === "0"))
      continue;
    let c2 = typeof l2.offset > "u" ? void 0 : l2.offset.unit === "%" ? +l2.offset.value / 100 : Number(O(`${l2.offset.value}${l2.offset.unit}`, n.fontSize, e, n, true)) / e;
    o.push({ offset: c2, color: f });
  }
  o.length || o.push({ offset: 0, color: "transparent" });
  let u2 = o[o.length - 1];
  u2.offset !== 1 && (typeof u2.offset > "u" ? u2.offset = 1 : r ? o[o.length - 1] = { offset: 1, color: u2.color } : o.push({ offset: 1, color: u2.color }));
  let s = 0, a = 1;
  for (let l2 = 0; l2 < o.length; l2++)
    if (typeof o[l2].offset > "u") {
      for (a < l2 && (a = l2); typeof o[a].offset > "u"; )
        a++;
      o[l2].offset = (o[a].offset - o[s].offset) / (a - s) * (l2 - s) + o[s].offset;
    } else
      s = l2;
  return i === "mask" ? o.map((l2) => {
    let f = index_esm_default(l2.color);
    return f ? f.alpha === 0 ? { ...l2, color: "rgba(0, 0, 0, 1)" } : { ...l2, color: `rgba(255, 255, 255, ${f.alpha})` } : l2;
  }) : o;
}
function Cu({ id: e, width: t, height: n, repeatX: r, repeatY: i }, o, u2, s, a, l2) {
  let f = P(o), [c2, p] = u2, d2 = o.startsWith("repeating"), h2, m2, x2;
  if (f.orientation.type === "directional")
    h2 = Rf(f.orientation.value), m2 = Math.sqrt(Math.pow((h2.x2 - h2.x1) * c2, 2) + Math.pow((h2.y2 - h2.y1) * p, 2));
  else if (f.orientation.type === "angular") {
    let { length: y, ...T } = Lf(_n(`${f.orientation.value.value}${f.orientation.value.unit}`) / 180 * Math.PI, c2, p);
    m2 = y, h2 = T;
  }
  x2 = d2 ? Mf(f.stops, m2, h2, a) : h2;
  let g2 = Gr(d2 ? If(f.stops, m2) : m2, f.stops, a, d2, l2), S2 = `satori_bi${e}`, v2 = `satori_pattern_${e}`, b = E("pattern", { id: v2, x: s[0] / t, y: s[1] / n, width: r ? c2 / t : "1", height: i ? p / n : "1", patternUnits: "objectBoundingBox" }, E("linearGradient", { id: S2, ...x2, spreadMethod: d2 ? "repeat" : "pad" }, g2.map((y) => E("stop", { offset: (y.offset ?? 0) * 100 + "%", "stop-color": y.color })).join("")) + E("rect", { x: 0, y: 0, width: c2, height: p, fill: `url(#${S2})` }));
  return [v2, b];
}
function If(e, t) {
  let n = e[e.length - 1], { offset: r } = n;
  return r ? r.unit === "%" ? Number(r.value) / 100 * t : Number(r.value) : t;
}
function Rf(e) {
  let t = 0, n = 0, r = 0, i = 0;
  return e.includes("top") ? n = 1 : e.includes("bottom") && (i = 1), e.includes("left") ? t = 1 : e.includes("right") && (r = 1), !t && !r && !n && !i && (n = 1), { x1: t, y1: n, x2: r, y2: i };
}
function Lf(e, t, n) {
  let r = Math.pow(n / t, 2);
  e = (e % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let i, o, u2, s, a, l2, f, c2, p = (d2) => {
    if (d2 === 0) {
      i = 0, o = n, u2 = 0, s = 0, a = n;
      return;
    } else if (d2 === Math.PI / 2) {
      i = 0, o = 0, u2 = t, s = 0, a = t;
      return;
    }
    if (d2 > 0 && d2 < Math.PI / 2) {
      i = (r * t / 2 / Math.tan(d2) - n / 2) / (Math.tan(d2) + r / Math.tan(d2)), o = Math.tan(d2) * i + n, u2 = Math.abs(t / 2 - i) + t / 2, s = n / 2 - Math.abs(o - n / 2), a = Math.sqrt(Math.pow(u2 - i, 2) + Math.pow(s - o, 2)), f = (t / 2 / Math.tan(d2) - n / 2) / (Math.tan(d2) + 1 / Math.tan(d2)), c2 = Math.tan(d2) * f + n, a = 2 * Math.sqrt(Math.pow(t / 2 - f, 2) + Math.pow(n / 2 - c2, 2));
      return;
    } else if (d2 > Math.PI / 2 && d2 < Math.PI) {
      i = (n / 2 + r * t / 2 / Math.tan(d2)) / (Math.tan(d2) + r / Math.tan(d2)), o = Math.tan(d2) * i, u2 = Math.abs(t / 2 - i) + t / 2, s = n / 2 + Math.abs(o - n / 2), f = (t / 2 / Math.tan(d2) + n / 2) / (Math.tan(d2) + 1 / Math.tan(d2)), c2 = Math.tan(d2) * f, a = 2 * Math.sqrt(Math.pow(t / 2 - f, 2) + Math.pow(n / 2 - c2, 2));
      return;
    } else
      d2 >= Math.PI && (p(d2 - Math.PI), l2 = i, i = u2, u2 = l2, l2 = o, o = s, s = l2);
  };
  return p(e), { x1: i / t, y1: o / n, x2: u2 / t, y2: s / n, length: a };
}
function Mf(e, t, n, r) {
  let { x1: i, x2: o, y1: u2, y2: s } = n, a = e[0].offset ? e[0].offset.unit === "%" ? Number(e[0].offset.value) / 100 : O(`${e[0].offset.value}${e[0].offset.unit}`, r.fontSize, t, r, true) / t : 0, l2 = e.at(-1).offset ? e.at(-1).offset.unit === "%" ? Number(e.at(-1).offset.value) / 100 : O(`${e.at(-1).offset.value}${e.at(-1).offset.unit}`, r.fontSize, t, r, true) / t : 1, f = (o - i) * a + i, c2 = (s - u2) * a + u2, p = (o - i) * l2 + i, d2 = (s - u2) * l2 + u2;
  return { x1: f, y1: c2, x2: p, y2: d2 };
}
function ku({ id: e, width: t, height: n, repeatX: r, repeatY: i }, o, u2, s, a, l2) {
  var ie;
  let { shape: f, stops: c2, position: p, size: d2 } = K(o), [h2, m2] = u2, x2 = h2 / 2, g2 = m2 / 2, S2 = Wf(p.x, p.y, h2, m2, a.fontSize, a);
  x2 = S2.x, g2 = S2.y;
  let v2 = Gr(t, c2, a, false, l2), b = `satori_radial_${e}`, y = `satori_pattern_${e}`, T = `satori_mask_${e}`, A = $f(f, d2, a.fontSize, { x: x2, y: g2 }, [h2, m2], a), P2 = E("pattern", { id: y, x: s[0] / t, y: s[1] / n, width: r ? h2 / t : "1", height: i ? m2 / n : "1", patternUnits: "objectBoundingBox" }, E("radialGradient", { id: b }, v2.map((ue) => E("stop", { offset: ue.offset || 0, "stop-color": ue.color })).join("")) + E("mask", { id: T }, E("rect", { x: 0, y: 0, width: h2, height: m2, fill: "#fff" })) + E("rect", { x: 0, y: 0, width: h2, height: m2, fill: ((ie = v2.at(-1)) == null ? void 0 : ie.color) || "transparent" }) + E(f, { cx: x2, cy: g2, width: h2, height: m2, ...A, fill: `url(#${b})`, mask: `url(#${T})` }));
  return [y, P2];
}
function Wf(e, t, n, r, i, o) {
  let u2 = { x: n / 2, y: r / 2 };
  return e.type === "keyword" ? Object.assign(u2, _u(e.value, n, r, "x")) : u2.x = O(`${e.value.value}${e.value.unit}`, i, n, o, true) || n / 2, t.type === "keyword" ? Object.assign(u2, _u(t.value, n, r, "y")) : u2.y = O(`${t.value.value}${t.value.unit}`, i, r, o, true) || r / 2, u2;
}
function _u(e, t, n, r) {
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
function $f(e, t, n, r, i, o) {
  let [u2, s] = i, { x: a, y: l2 } = r, f = {}, c2 = 0, p = 0;
  if (qf(t)) {
    if (t.some((d2) => d2.value.value.startsWith("-")))
      throw new Error("disallow setting negative values to the size of the shape. Check https://w3c.github.io/csswg-drafts/css-images/#valdef-rg-size-length-0");
    return e === "circle" ? { r: Number(O(`${t[0].value.value}${t[0].value.unit}`, n, u2, o, true)) } : { rx: Number(O(`${t[0].value.value}${t[0].value.unit}`, n, u2, o, true)), ry: Number(O(`${t[1].value.value}${t[1].value.unit}`, n, s, o, true)) };
  }
  switch (t[0].value) {
    case "farthest-corner":
      c2 = Math.max(Math.abs(u2 - a), Math.abs(a)), p = Math.max(Math.abs(s - l2), Math.abs(l2));
      break;
    case "closest-corner":
      c2 = Math.min(Math.abs(u2 - a), Math.abs(a)), p = Math.min(Math.abs(s - l2), Math.abs(l2));
      break;
    case "farthest-side":
      return e === "circle" ? f.r = Math.max(Math.abs(u2 - a), Math.abs(a), Math.abs(s - l2), Math.abs(l2)) : (f.rx = Math.max(Math.abs(u2 - a), Math.abs(a)), f.ry = Math.max(Math.abs(s - l2), Math.abs(l2))), f;
    case "closest-side":
      return e === "circle" ? f.r = Math.min(Math.abs(u2 - a), Math.abs(a), Math.abs(s - l2), Math.abs(l2)) : (f.rx = Math.min(Math.abs(u2 - a), Math.abs(a)), f.ry = Math.min(Math.abs(s - l2), Math.abs(l2))), f;
  }
  if (e === "circle")
    f.r = Math.sqrt(c2 * c2 + p * p);
  else {
    let d2 = p !== 0 ? c2 / p : 1;
    c2 === 0 ? (f.rx = 0, f.ry = 0) : (f.ry = Math.sqrt(c2 * c2 + p * p * d2 * d2) / d2, f.rx = f.ry * d2);
  }
  return f;
}
function qf(e) {
  return !e.some((t) => t.type === "keyword");
}
function zf(e, t) {
  return typeof e == "string" && e.endsWith("%") ? t * parseFloat(e) / 100 : +e;
}
function $n(e, { x: t, y: n, defaultX: r, defaultY: i }) {
  return (e ? e.split(" ").map((o) => {
    try {
      let u2 = new Le(o);
      return u2.type === "length" || u2.type === "number" ? u2.value : u2.value + u2.unit;
    } catch {
      return null;
    }
  }).filter((o) => o !== null) : [r, i]).map((o, u2) => zf(o, [t, n][u2]));
}
async function Lt({ id: e, width: t, height: n, left: r, top: i }, { image: o, size: u2, position: s, repeat: a }, l2, f) {
  a = a || "repeat", f = f || "background";
  let c2 = a === "repeat-x" || a === "repeat", p = a === "repeat-y" || a === "repeat", d2 = $n(u2, { x: t, y: n, defaultX: t, defaultY: n }), h2 = $n(s, { x: t, y: n, defaultX: 0, defaultY: 0 });
  if (o.startsWith("linear-gradient(") || o.startsWith("repeating-linear-gradient("))
    return Cu({ id: e, width: t, height: n, repeatX: c2, repeatY: p }, o, d2, h2, l2, f);
  if (o.startsWith("radial-gradient("))
    return ku({ id: e, width: t, height: n, repeatX: c2, repeatY: p }, o, d2, h2, l2, f);
  if (o.startsWith("url(")) {
    let m2 = $n(u2, { x: t, y: n, defaultX: 0, defaultY: 0 }), [x2, g2, S2] = await bt(o.slice(4, -1)), v2 = f === "mask" ? g2 || m2[0] : m2[0] || g2, b = f === "mask" ? S2 || m2[1] : m2[1] || S2;
    return [`satori_bi${e}`, E("pattern", { id: `satori_bi${e}`, patternContentUnits: "userSpaceOnUse", patternUnits: "userSpaceOnUse", x: h2[0] + r, y: h2[1] + i, width: c2 ? v2 : "100%", height: p ? b : "100%" }, E("image", { x: 0, y: 0, width: v2, height: b, preserveAspectRatio: "none", href: x2 }))];
  }
  throw new Error(`Invalid background image: "${o}"`);
}
function Uf([e, t]) {
  return Math.round(e * 1e3) === 0 && Math.round(t * 1e3) === 0 ? 0 : Math.round(e * t / Math.sqrt(e * e + t * t) * 1e3) / 1e3;
}
function jr(e, t, n) {
  return n < e + t && (n / 2 < e && n / 2 < t ? e = t = n / 2 : n / 2 < e ? e = n - t : n / 2 < t && (t = n - e)), [e, t];
}
function Hr(e) {
  e[0] = e[1] = Math.min(e[0], e[1]);
}
function Vr(e, t, n, r, i) {
  if (typeof e == "string") {
    let o = e.split(" ").map((s) => s.trim()), u2 = !o[1] && !o[0].endsWith("%");
    return o[1] = o[1] || o[0], [u2, [Math.min(O(o[0], r, t, i, true), t), Math.min(O(o[1], r, n, i, true), n)]];
  }
  return typeof e == "number" ? [true, [Math.min(e, t), Math.min(e, n)]] : [true, void 0];
}
var Yr = (e) => e && e[0] !== 0 && e[1] !== 0;
function Tu({ id: e, borderRadiusPath: t, borderType: n, left: r, top: i, width: o, height: u2 }, s) {
  let a = `satori_brc-${e}`;
  return [E("clipPath", { id: a }, E(n, { x: r, y: i, width: o, height: u2, d: t || void 0 })), a];
}
function He({ left: e, top: t, width: n, height: r }, i, o) {
  let { borderTopLeftRadius: u2, borderTopRightRadius: s, borderBottomLeftRadius: a, borderBottomRightRadius: l2, fontSize: f } = i, c2, p, d2, h2;
  if ([c2, u2] = Vr(u2, n, r, f, i), [p, s] = Vr(s, n, r, f, i), [d2, a] = Vr(a, n, r, f, i), [h2, l2] = Vr(l2, n, r, f, i), !o && !Yr(u2) && !Yr(s) && !Yr(a) && !Yr(l2))
    return "";
  u2 || (u2 = [0, 0]), s || (s = [0, 0]), a || (a = [0, 0]), l2 || (l2 = [0, 0]), [u2[0], s[0]] = jr(u2[0], s[0], n), [a[0], l2[0]] = jr(a[0], l2[0], n), [u2[1], a[1]] = jr(u2[1], a[1], r), [s[1], l2[1]] = jr(s[1], l2[1], r), c2 && Hr(u2), p && Hr(s), d2 && Hr(a), h2 && Hr(l2);
  let m2 = [];
  m2[0] = [s, s], m2[1] = [l2, [-l2[0], l2[1]]], m2[2] = [a, [-a[0], -a[1]]], m2[3] = [u2, [u2[0], -u2[1]]];
  let x2 = `h${n - u2[0] - s[0]} a${m2[0][0]} 0 0 1 ${m2[0][1]}`, g2 = `v${r - s[1] - l2[1]} a${m2[1][0]} 0 0 1 ${m2[1][1]}`, S2 = `h${l2[0] + a[0] - n} a${m2[2][0]} 0 0 1 ${m2[2][1]}`, v2 = `v${a[1] + u2[1] - r} a${m2[3][0]} 0 0 1 ${m2[3][1]}`;
  if (o) {
    let y = function(fe) {
      let Q = Uf([u2, s, l2, a][fe]);
      return fe === 0 ? [[e + u2[0] - Q, t + u2[1] - Q], [e + u2[0], t]] : fe === 1 ? [[e + n - s[0] + Q, t + s[1] - Q], [e + n, t + s[1]]] : fe === 2 ? [[e + n - l2[0] + Q, t + r - l2[1] + Q], [e + n - l2[0], t + r]] : [[e + a[0] - Q, t + r - a[1] + Q], [e, t + r - a[1]]];
    }, b = o.indexOf(false);
    if (!o.includes(true))
      throw new Error("Invalid `partialSides`.");
    if (b === -1)
      b = 0;
    else
      for (; !o[b]; )
        b = (b + 1) % 4;
    let T = "", A = y(b), P2 = `M${A[0]} A${m2[(b + 3) % 4][0]} 0 0 1 ${A[1]}`, j = 0;
    for (; j < 4 && o[(b + j) % 4]; j++)
      T += P2 + " ", P2 = [x2, g2, S2, v2][(b + j) % 4];
    let ie = (b + j) % 4;
    T += P2.split(" ")[0];
    let ue = y(ie);
    return T += ` A${m2[(ie + 3) % 4][0]} 0 0 1 ${ue[0]}`, T;
  }
  return `M${e + u2[0]},${t} ${x2} ${g2} ${S2} ${v2}`;
}
function Au(e, t, n) {
  return n[e + "Width"] === n[t + "Width"] && n[e + "Style"] === n[t + "Style"] && n[e + "Color"] === n[t + "Color"];
}
function Ou({ id: e, currentClipPathId: t, borderPath: n, borderType: r, left: i, top: o, width: u2, height: s }, a) {
  if (!(a.borderTopWidth || a.borderRightWidth || a.borderBottomWidth || a.borderLeftWidth))
    return null;
  let f = `satori_bc-${e}`;
  return [E("clipPath", { id: f, "clip-path": t ? `url(#${t})` : void 0 }, E(r, { x: i, y: o, width: u2, height: s, d: n || void 0 })), f];
}
function Mt({ left: e, top: t, width: n, height: r, props: i, asContentMask: o, maskBorderOnly: u2 }, s) {
  let a = ["borderTop", "borderRight", "borderBottom", "borderLeft"];
  if (!o && !a.some((d2) => s[d2 + "Width"]))
    return "";
  let l2 = "", f = 0;
  for (; f > 0 && Au(a[f], a[(f + 3) % 4], s); )
    f = (f + 3) % 4;
  let c2 = [false, false, false, false], p = [];
  for (let d2 = 0; d2 < 4; d2++) {
    let h2 = (f + d2) % 4, m2 = (f + d2 + 1) % 4, x2 = a[h2], g2 = a[m2];
    if (c2[h2] = true, p = [s[x2 + "Width"], s[x2 + "Style"], s[x2 + "Color"], x2], !Au(x2, g2, s)) {
      let S2 = (p[0] || 0) + (o && !u2 && s[x2.replace("border", "padding")] || 0);
      S2 && (l2 += E("path", { width: n, height: r, ...i, fill: "none", stroke: o ? "#000" : p[2], "stroke-width": S2 * 2, "stroke-dasharray": !o && p[1] === "dashed" ? S2 * 2 + " " + S2 : void 0, d: He({ left: e, top: t, width: n, height: r }, s, c2) })), c2 = [false, false, false, false];
    }
  }
  if (c2.some(Boolean)) {
    let d2 = (p[0] || 0) + (o && !u2 && s[p[3].replace("border", "padding")] || 0);
    d2 && (l2 += E("path", { width: n, height: r, ...i, fill: "none", stroke: o ? "#000" : p[2], "stroke-width": d2 * 2, "stroke-dasharray": !o && p[1] === "dashed" ? d2 * 2 + " " + d2 : void 0, d: He({ left: e, top: t, width: n, height: r }, s, c2) }));
  }
  return l2;
}
function qn({ id: e, left: t, top: n, width: r, height: i, matrix: o, borderOnly: u2 }, s) {
  let a = (s.borderLeftWidth || 0) + (u2 ? 0 : s.paddingLeft || 0), l2 = (s.borderTopWidth || 0) + (u2 ? 0 : s.paddingTop || 0), f = (s.borderRightWidth || 0) + (u2 ? 0 : s.paddingRight || 0), c2 = (s.borderBottomWidth || 0) + (u2 ? 0 : s.paddingBottom || 0), p = { x: t + a, y: n + l2, width: r - a - f, height: i - l2 - c2 };
  return E("mask", { id: e }, E("rect", { ...p, fill: "#fff", transform: s.overflow === "hidden" && s.transform && o ? o : void 0, mask: s._inheritedMaskId ? `url(#${s._inheritedMaskId})` : void 0 }) + Mt({ left: t, top: n, width: r, height: i, props: { transform: o || void 0 }, asContentMask: true, maskBorderOnly: u2 }, s));
}
var Nt = { circle: /circle\((.+)\)/, ellipse: /ellipse\((.+)\)/, path: /path\((.+)\)/, polygon: /polygon\((.+)\)/, inset: /inset\((.+)\)/ };
function Ru({ width: e, height: t }, n, r) {
  function i(l2) {
    let f = l2.match(Nt.circle);
    if (!f)
      return null;
    let [, c2] = f, [p, d2 = ""] = c2.split("at").map((x2) => x2.trim()), { x: h2, y: m2 } = Iu(d2, e, t);
    return { type: "circle", r: O(p, r.fontSize, Math.sqrt(Math.pow(e, 2) + Math.pow(t, 2)) / Math.sqrt(2), r, true), cx: O(h2, r.fontSize, e, r, true), cy: O(m2, r.fontSize, t, r, true) };
  }
  function o(l2) {
    let f = l2.match(Nt.ellipse);
    if (!f)
      return null;
    let [, c2] = f, [p, d2 = ""] = c2.split("at").map((S2) => S2.trim()), [h2, m2] = p.split(" "), { x: x2, y: g2 } = Iu(d2, e, t);
    return { type: "ellipse", rx: O(h2 || "50%", r.fontSize, e, r, true), ry: O(m2 || "50%", r.fontSize, t, r, true), cx: O(x2, r.fontSize, e, r, true), cy: O(g2, r.fontSize, t, r, true) };
  }
  function u2(l2) {
    let f = l2.match(Nt.path);
    if (!f)
      return null;
    let [c2, p] = Bu(f[1]);
    return { type: "path", d: p, "fill-rule": c2 };
  }
  function s(l2) {
    let f = l2.match(Nt.polygon);
    if (!f)
      return null;
    let [c2, p] = Bu(f[1]);
    return { type: "polygon", "fill-rule": c2, points: p.split(",").map((d2) => d2.split(" ").map((h2, m2) => O(h2, r.fontSize, m2 === 0 ? e : t, r, true)).join(" ")).join(",") };
  }
  function a(l2) {
    let f = l2.match(Nt.inset);
    if (!f)
      return null;
    let [c2, p] = (f[1].includes("round") ? f[1] : `${f[1].trim()} round 0`).split("round"), d2 = (0, import_css_to_react_native3.getStylesForProperty)("borderRadius", p, true), h2 = Object.values(d2).map((b) => String(b)).map((b, y) => O(b, r.fontSize, y === 0 || y === 2 ? t : e, r, true) || 0), m2 = Object.values((0, import_css_to_react_native3.getStylesForProperty)("margin", c2, true)).map((b) => String(b)).map((b, y) => O(b, r.fontSize, y === 0 || y === 2 ? t : e, r, true) || 0), x2 = m2[3], g2 = m2[0], S2 = e - (m2[1] + m2[3]), v2 = t - (m2[0] + m2[2]);
    return h2.some((b) => b > 0) ? { type: "path", d: He({ left: x2, top: g2, width: S2, height: v2 }, { ...n, ...d2 }) } : { type: "rect", x: x2, y: g2, width: S2, height: v2 };
  }
  return { parseCircle: i, parseEllipse: o, parsePath: u2, parsePolygon: s, parseInset: a };
}
function Bu(e) {
  let [, t = "nonzero", n] = e.replace(/('|")/g, "").match(/^(nonzero|evenodd)?,?(.+)/) || [];
  return [t, n];
}
function Iu(e, t, n) {
  let r = e.split(" "), i = { x: r[0] || "50%", y: r[1] || "50%" };
  return r.forEach((o) => {
    o === "top" ? i.y = 0 : o === "bottom" ? i.y = n : o === "left" ? i.x = 0 : o === "right" ? i.x = t : o === "center" && (i.x = t / 2, i.y = n / 2);
  }), i;
}
function Xr(e) {
  return `satori_cp-${e}`;
}
function Lu(e) {
  return `url(#${Xr(e)})`;
}
function Mu(e, t, n) {
  if (t.clipPath === "none")
    return "";
  let r = Ru(e, t, n), i = t.clipPath, o = { type: "" };
  for (let u2 of Object.keys(r))
    if (o = r[u2](i), o)
      break;
  if (o) {
    let { type: u2, ...s } = o;
    return E("clipPath", { id: Xr(e.id), "clip-path": e.currentClipPath, transform: `translate(${e.left}, ${e.top})` }, E(u2, s));
  }
  return "";
}
function zn({ left: e, top: t, width: n, height: r, path: i, matrix: o, id: u2, currentClipPath: s, src: a }, l2, f) {
  let c2 = "", p = l2.clipPath && l2.clipPath !== "none" ? Mu({ left: e, top: t, width: n, height: r, path: i, id: u2, matrix: o, currentClipPath: s, src: a }, l2, f) : "";
  if (l2.overflow !== "hidden" && !a)
    c2 = "";
  else {
    let h2 = p ? `satori_ocp-${u2}` : Xr(u2);
    c2 = E("clipPath", { id: h2, "clip-path": s }, E(i ? "path" : "rect", { x: e, y: t, width: n, height: r, d: i || void 0, transform: l2.overflow === "hidden" && l2.transform && o ? o : void 0 }));
  }
  let d2 = qn({ id: `satori_om-${u2}`, left: e, top: t, width: n, height: r, matrix: o, borderOnly: !a }, l2);
  return p + c2 + d2;
}
var Gf = (e) => `satori_mi-${e}`;
async function Un(e, t, n) {
  if (!t.maskImage)
    return ["", ""];
  let { left: r, top: i, width: o, height: u2, id: s } = e, a = t.maskImage, l2 = a.length;
  if (!l2)
    return ["", ""];
  let f = Gf(s), c2 = "";
  for (let p = 0; p < l2; p++) {
    let d2 = a[p], [h2, m2] = await Lt({ id: `${f}-${p}`, left: r, top: i, width: o, height: u2 }, d2, n, "mask");
    c2 += m2 + E("rect", { x: r, y: i, width: o, height: u2, fill: `url(#${h2})` });
  }
  return c2 = E("mask", { id: f }, c2), [f, c2];
}
async function Wt({ id: e, left: t, top: n, width: r, height: i, isInheritingTransform: o, src: u2, debug: s }, a, l2) {
  if (a.display === "none")
    return "";
  let f = !!u2, c2 = "rect", p = "", d2 = "", h2 = [], m2 = 1, x2 = "";
  a.backgroundColor && h2.push(a.backgroundColor), a.opacity !== void 0 && (m2 = +a.opacity), a.transform && (p = Rt({ left: t, top: n, width: r, height: i }, a.transform, o, a.transformOrigin));
  let g2 = "";
  if (a.backgroundImage) {
    let Z = [];
    for (let N = 0; N < a.backgroundImage.length; N++) {
      let Ee = a.backgroundImage[N], _e = await Lt({ id: e + "_" + N, width: r, height: i, left: t, top: n }, Ee, l2);
      _e && Z.unshift(_e);
    }
    for (let N of Z)
      h2.push(`url(#${N[0]})`), d2 += N[1], N[2] && (g2 += N[2]);
  }
  let [S2, v2] = await Un({ id: e, left: t, top: n, width: r, height: i }, a, l2);
  d2 += v2;
  let b = S2 ? `url(#${S2})` : a._inheritedMaskId ? `url(#${a._inheritedMaskId})` : void 0, y = He({ left: t, top: n, width: r, height: i }, a);
  y && (c2 = "path");
  let T = a._inheritedClipPathId;
  s && (x2 = E("rect", { x: t, y: n, width: r, height: i, fill: "transparent", stroke: "#ff5757", "stroke-width": 1, transform: p || void 0, "clip-path": T ? `url(#${T})` : void 0 }));
  let { backgroundClip: A, filter: P2 } = a, j = A === "text" ? `url(#satori_bct-${e})` : T ? `url(#${T})` : a.clipPath ? Lu(e) : void 0, ie = zn({ left: t, top: n, width: r, height: i, path: y, id: e, matrix: p, currentClipPath: j, src: u2 }, a, l2), ue = h2.map((Z) => E(c2, { x: t, y: n, width: r, height: i, fill: Z, d: y || void 0, transform: p || void 0, "clip-path": a.transform ? void 0 : j, style: P2 ? `filter:${P2}` : void 0, mask: a.transform ? void 0 : b })).join(""), fe = Ou({ id: e, left: t, top: n, width: r, height: i, currentClipPathId: T, borderPath: y, borderType: c2 }, a), Q;
  if (f) {
    let Z = (a.borderLeftWidth || 0) + (a.paddingLeft || 0), N = (a.borderTopWidth || 0) + (a.paddingTop || 0), Ee = (a.borderRightWidth || 0) + (a.paddingRight || 0), _e = (a.borderBottomWidth || 0) + (a.paddingBottom || 0), me = a.objectFit === "contain" ? "xMidYMid" : a.objectFit === "cover" ? "xMidYMid slice" : "none";
    a.transform && (Q = Tu({ id: e, borderRadiusPath: y, borderType: c2, left: t, top: n, width: r, height: i }, a)), ue += E("image", { x: t + Z, y: n + N, width: r - Z - Ee, height: i - N - _e, href: u2, preserveAspectRatio: me, transform: p || void 0, style: P2 ? `filter:${P2}` : void 0, "clip-path": a.transform ? Q ? `url(#${Q[1]})` : void 0 : `url(#satori_cp-${e})`, mask: a.transform ? void 0 : S2 ? `url(#${S2})` : `url(#satori_om-${e})` });
  }
  if (fe) {
    d2 += fe[0];
    let Z = fe[1];
    ue += Mt({ left: t, top: n, width: r, height: i, props: { transform: p || void 0, "clip-path": `url(#${Z})` } }, a);
  }
  let oe = wu({ width: r, height: i, id: e, opacity: m2, shape: E(c2, { x: t, y: n, width: r, height: i, fill: "#fff", stroke: "#fff", "stroke-width": 0, d: y || void 0, transform: p || void 0, "clip-path": j, mask: b }) }, a);
  return (d2 ? E("defs", {}, d2) : "") + (oe ? oe[0] : "") + (Q ? Q[0] : "") + ie + (m2 !== 1 ? `<g opacity="${m2}">` : "") + (a.transform && (j || b) ? `<g${j ? ` clip-path="${j}"` : ""}${b ? ` mask="${b}"` : ""}>` : "") + (g2 || ue) + (a.transform && (j || b) ? "</g>" : "") + (m2 !== 1 ? "</g>" : "") + (oe ? oe[1] : "") + x2;
}
var Nu = () => /[#*0-9]\uFE0F?\u20E3|[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26AA\u26B0\u26B1\u26BD\u26BE\u26C4\u26C8\u26CF\u26D1\u26D3\u26E9\u26F0-\u26F5\u26F7\u26F8\u26FA\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u27A1\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B55\u3030\u303D\u3297\u3299]\uFE0F?|[\u261D\u270C\u270D](?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?|[\u270A\u270B](?:\uD83C[\uDFFB-\uDFFF])?|[\u23E9-\u23EC\u23F0\u23F3\u25FD\u2693\u26A1\u26AB\u26C5\u26CE\u26D4\u26EA\u26FD\u2705\u2728\u274C\u274E\u2753-\u2755\u2795-\u2797\u27B0\u27BF\u2B50]|\u26F9(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|\u2764\uFE0F?(?:\u200D(?:\uD83D\uDD25|\uD83E\uDE79))?|\uD83C(?:[\uDC04\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF5\uDFF7]\uFE0F?|[\uDF85\uDFC2\uDFC7](?:\uD83C[\uDFFB-\uDFFF])?|[\uDFC3\uDFC4\uDFCA](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDFCB\uDFCC](?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDCCF\uDD8E\uDD91-\uDD9A\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF84\uDF86-\uDF93\uDFA0-\uDFC1\uDFC5\uDFC6\uDFC8\uDFC9\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF8-\uDFFF]|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|\uDFF3\uFE0F?(?:\u200D(?:\u26A7\uFE0F?|\uD83C\uDF08))?|\uDFF4(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDC73\uDB40\uDC63\uDB40\uDC74|\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F)?)|\uD83D(?:[\uDC08\uDC26](?:\u200D\u2B1B)?|[\uDC3F\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3]\uFE0F?|[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC6E\uDC70\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD74\uDD90](?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?|[\uDC00-\uDC07\uDC09-\uDC14\uDC16-\uDC25\uDC27-\uDC3A\uDC3C-\uDC3E\uDC40\uDC44\uDC45\uDC51-\uDC65\uDC6A\uDC79-\uDC7B\uDC7D-\uDC80\uDC84\uDC88-\uDC8E\uDC90\uDC92-\uDCA9\uDCAB-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDDA4\uDDFB-\uDE2D\uDE2F-\uDE34\uDE37-\uDE44\uDE48-\uDE4A\uDE80-\uDEA2\uDEA4-\uDEB3\uDEB7-\uDEBF\uDEC1-\uDEC5\uDED0-\uDED2\uDED5-\uDED7\uDEDC-\uDEDF\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB\uDFF0]|\uDC15(?:\u200D\uD83E\uDDBA)?|\uDC3B(?:\u200D\u2744\uFE0F?)?|\uDC41\uFE0F?(?:\u200D\uD83D\uDDE8\uFE0F?)?|\uDC68(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDC68\uDC69]\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE])))?))?|\uDC69(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?[\uDC68\uDC69]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?))|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFE])))?))?|\uDC6F(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDD75(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDE2E(?:\u200D\uD83D\uDCA8)?|\uDE35(?:\u200D\uD83D\uDCAB)?|\uDE36(?:\u200D\uD83C\uDF2B\uFE0F?)?)|\uD83E(?:[\uDD0C\uDD0F\uDD18-\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5\uDEC3-\uDEC5\uDEF0\uDEF2-\uDEF8](?:\uD83C[\uDFFB-\uDFFF])?|[\uDD26\uDD35\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD4\uDDD6-\uDDDD](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDDDE\uDDDF](?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD0D\uDD0E\uDD10-\uDD17\uDD20-\uDD25\uDD27-\uDD2F\uDD3A\uDD3F-\uDD45\uDD47-\uDD76\uDD78-\uDDB4\uDDB7\uDDBA\uDDBC-\uDDCC\uDDD0\uDDE0-\uDDFF\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC2\uDECE-\uDEDB\uDEE0-\uDEE8]|\uDD3C(?:\u200D[\u2640\u2642]\uFE0F?|\uD83C[\uDFFB-\uDFFF])?|\uDDD1(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF-\uDDB3\uDDBC\uDDBD]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF])))?))?|\uDEF1(?:\uD83C(?:\uDFFB(?:\u200D\uD83E\uDEF2\uD83C[\uDFFC-\uDFFF])?|\uDFFC(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFD-\uDFFF])?|\uDFFD(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])?|\uDFFE(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFD\uDFFF])?|\uDFFF(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFE])?))?)/g;
var jf = new RegExp(Nu(), "");
var Gn = { emoji: jf, symbol: /\p{Symbol}/u, math: /\p{Math}/u };
var jn = { "ja-JP": /\p{scx=Hira}|\p{scx=Kana}|\p{scx=Han}|[\u3000]|[\uFF00-\uFFEF]/u, "ko-KR": /\p{scx=Hangul}/u, "zh-CN": /\p{scx=Han}/u, "zh-TW": /\p{scx=Han}/u, "zh-HK": /\p{scx=Han}/u, "th-TH": /\p{scx=Thai}/u, "bn-IN": /\p{scx=Bengali}/u, "ar-AR": /\p{scx=Arabic}/u, "ta-IN": /\p{scx=Tamil}/u, "ml-IN": /\p{scx=Malayalam}/u, "he-IL": /\p{scx=Hebrew}/u, "te-IN": /\p{scx=Telugu}/u, devanagari: /\p{scx=Devanagari}/u, kannada: /\p{scx=Kannada}/u };
var Qr = Object.keys({ ...jn, ...Gn });
function Wu(e) {
  return Qr.includes(e);
}
function $u(e, t) {
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
function qu(e) {
  if (e)
    return Qr.find((t) => t.toLowerCase().startsWith(e.toLowerCase()));
}
async function* $t(e, t) {
  var Er;
  let n = await Re(), { id: r, inheritedStyle: i, parent: o, font: u2, debug: s, locale: a, embedFont: l2 = true, graphemeImages: f, canLoadAdditionalAssets: c2, getTwStyles: p } = t;
  if (e === null || typeof e > "u")
    return yield, yield, "";
  if (!Dt(e) || typeof e.type == "function") {
    let I;
    if (!Dt(e))
      I = Wn(String(e), t), yield (await I.next()).value;
    else {
      if (Ko(e.type))
        throw new Error("Class component is not supported.");
      I = $t(e.type(e.props), t), yield (await I.next()).value;
    }
    await I.next();
    let De = yield;
    return (await I.next(De)).value;
  }
  let { type: d2, props: h2 } = e;
  if (h2 && Jo(h2))
    throw new Error("dangerouslySetInnerHTML property is not supported. See documentation for more information https://github.com/vercel/satori#jsx.");
  let { style: m2, children: x2, tw: g2, lang: S2 = a } = h2 || {}, v2 = qu(S2);
  if (g2) {
    let I = p(g2, m2);
    m2 = Object.assign(I, m2);
  }
  let b = n.Node.create();
  o.insertChild(b, o.getChildCount());
  let [y, T] = await In(b, d2, i, m2, h2), A = y.transform === i.transform;
  if (A || (y.transform.__parent = i.transform), (y.overflow === "hidden" || y.clipPath && y.clipPath !== "none") && (T._inheritedClipPathId = `satori_cp-${r}`, T._inheritedMaskId = `satori_om-${r}`), y.maskImage && (T._inheritedMaskId = `satori_mi-${r}`), y.backgroundClip === "text") {
    let I = { value: "" };
    T._inheritedBackgroundClipTextPath = I, y._inheritedBackgroundClipTextPath = I;
  }
  let P2 = Zo(x2), j = [], ie = 0, ue = [];
  for (let I of P2) {
    let De = $t(I, { id: r + "-" + ie++, parentStyle: y, inheritedStyle: T, isInheritingTransform: true, parent: b, font: u2, embedFont: l2, debug: s, graphemeImages: f, canLoadAdditionalAssets: c2, locale: v2, getTwStyles: p, onNodeDetected: t.onNodeDetected });
    c2 ? ue.push(...(await De.next()).value || []) : await De.next(), j.push(De);
  }
  yield ue;
  for (let I of j)
    await I.next();
  let [fe, Q] = yield, { left: oe, top: Z, width: N, height: Ee } = b.getComputedLayout();
  oe += fe, Z += Q;
  let _e = "", me = "", wr = "", { children: Ke, ...Ct } = h2;
  if ((Er = t.onNodeDetected) == null || Er.call(t, { left: oe, top: Z, width: N, height: Ee, type: d2, props: Ct, key: e.key, textContent: Dt(Ke) ? void 0 : Ke }), d2 === "img") {
    let I = y.__src;
    me = await Wt({ id: r, left: oe, top: Z, width: N, height: Ee, src: I, isInheritingTransform: A, debug: s }, y, T);
  } else if (d2 === "svg") {
    let I = y.color, De = await du(e, I);
    me = await Wt({ id: r, left: oe, top: Z, width: N, height: Ee, src: De, isInheritingTransform: A, debug: s }, y, T);
  } else {
    let I = m2 == null ? void 0 : m2.display;
    if (d2 === "div" && x2 && typeof x2 != "string" && I !== "flex" && I !== "none")
      throw new Error('Expected <div> to have explicit "display: flex" or "display: none" if it has more than one child node.');
    me = await Wt({ id: r, left: oe, top: Z, width: N, height: Ee, isInheritingTransform: A, debug: s }, y, T);
  }
  for (let I of j)
    _e += (await I.next([oe, Z])).value;
  return y._inheritedBackgroundClipTextPath && (wr += E("clipPath", { id: `satori_bct-${r}`, "clip-path": y._inheritedClipPathId ? `url(#${y._inheritedClipPathId})` : void 0 }, y._inheritedBackgroundClipTextPath.value)), wr + me + _e;
}
var zu = "unknown";
function Hf(e, t, [n, r], [i, o]) {
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
var qt = class {
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
    for (let u2 = 1; u2 < i.length; u2++) {
      let [, s, a] = o, [, l2, f] = i[u2];
      Hf(n, r, [s, a], [l2, f]) > 0 && (o = i[u2]);
    }
    return o[0];
  }
  addFonts(t) {
    for (let n of t) {
      let { name: r, data: i, lang: o } = n;
      if (o && !Wu(o))
        throw new Error(`Invalid value for props \`lang\`: "${o}". The value must be one of the following: ${Qr.join(", ")}.`);
      let u2 = o ?? zu, s = opentype_module_default.parse("buffer" in i ? i.buffer.slice(i.byteOffset, i.byteOffset + i.byteLength) : i, { lowMemory: true }), a = s.charToGlyphIndex;
      s.charToGlyphIndex = (f) => {
        let c2 = a.call(s, f);
        return c2 === 0 && s._trackBrokenChars && s._trackBrokenChars.push(f), c2;
      }, this.defaultFont || (this.defaultFont = s);
      let l2 = `${r.toLowerCase()}_${u2}`;
      this.fonts.has(l2) || this.fonts.set(l2, []), this.fonts.get(l2).push([s, n.weight, n.style]);
    }
  }
  getEngine(t = 16, n = "normal", { fontFamily: r = "sans-serif", fontWeight: i = 400, fontStyle: o = "normal" }, u2) {
    if (!this.fonts.size)
      throw new Error("No fonts are loaded. At least one font is required to calculate the layout.");
    r = (Array.isArray(r) ? r : [r]).map((v2) => v2.toLowerCase());
    let s = [];
    r.forEach((v2) => {
      let b = this.get({ name: v2, weight: i, style: o });
      if (b) {
        s.push(b);
        return;
      }
      let y = this.get({ name: v2 + "_unknown", weight: i, style: o });
      if (y) {
        s.push(y);
        return;
      }
    });
    let a = Array.from(this.fonts.keys()), l2 = [], f = [], c2 = [];
    for (let v2 of a)
      if (!r.includes(v2))
        if (u2) {
          let b = Vf(v2);
          b ? b === u2 ? l2.push(this.get({ name: v2, weight: i, style: o })) : f.push(this.get({ name: v2, weight: i, style: o })) : c2.push(this.get({ name: v2, weight: i, style: o }));
        } else
          c2.push(this.get({ name: v2, weight: i, style: o }));
    let p = /* @__PURE__ */ new Map(), d2 = (v2, b = true) => {
      let y = [...s, ...c2, ...l2, ...b ? f : []];
      if (typeof v2 > "u")
        return b ? y[y.length - 1] : void 0;
      let T = v2.charCodeAt(0);
      if (p.has(T))
        return p.get(T);
      let A = y.find((P2, j) => !!P2.charToGlyphIndex(v2) || b && j === y.length - 1);
      return A && p.set(T, A), A;
    }, h2 = (v2, b = false) => {
      var T, A;
      return ((b ? (A = (T = v2.tables) == null ? void 0 : T.os2) == null ? void 0 : A.sTypoAscender : 0) || v2.ascender) / v2.unitsPerEm * t;
    }, m2 = (v2, b = false) => {
      var T, A;
      return ((b ? (A = (T = v2.tables) == null ? void 0 : T.os2) == null ? void 0 : A.sTypoDescender : 0) || v2.descender) / v2.unitsPerEm * t;
    }, x2 = (v2, b = false) => {
      var y, T;
      if (typeof n == "string" && n === "normal") {
        let A = (b ? (T = (y = v2.tables) == null ? void 0 : y.os2) == null ? void 0 : T.sTypoLineGap : 0) || 0;
        return h2(v2, b) - m2(v2, b) + A / v2.unitsPerEm * t;
      } else if (typeof n == "number")
        return t * n;
    }, g2 = (v2) => d2(v2, false);
    return { has: (v2) => {
      if (v2 === `
`)
        return true;
      let b = g2(v2);
      return b ? (b._trackBrokenChars = [], b.stringToGlyphs(v2), b._trackBrokenChars.length ? (b._trackBrokenChars = void 0, false) : true) : false;
    }, baseline: (v2, b = typeof v2 > "u" ? s[0] : d2(v2)) => {
      let y = h2(b), T = m2(b), A = y - T;
      return y + (x2(b) - A) / 2;
    }, height: (v2, b = typeof v2 > "u" ? s[0] : d2(v2)) => x2(b), measure: (v2, b) => this.measure(d2, v2, b), getSVG: (v2, b) => this.getSVG(d2, v2, b) };
  }
  patchFontFallbackResolver(t, n) {
    let r = [];
    t._trackBrokenChars = r;
    let i = t.stringToGlyphs;
    return t.stringToGlyphs = (o, ...u2) => {
      let s = i.call(t, o, ...u2);
      for (let a = 0; a < s.length; a++)
        if (s[a].unicode === void 0) {
          let l2 = r.shift(), f = n(l2);
          if (f !== t) {
            let c2 = f.charToGlyph(l2), p = t.unitsPerEm / f.unitsPerEm, d2 = new opentype_module_default.Path();
            d2.unitsPerEm = t.unitsPerEm, d2.commands = c2.path.commands.map((m2) => {
              let x2 = { ...m2 };
              for (let g2 in x2)
                typeof x2[g2] == "number" && (x2[g2] *= p);
              return x2;
            });
            let h2 = new opentype_module_default.Glyph({ ...c2, advanceWidth: c2.advanceWidth * p, xMin: c2.xMin * p, xMax: c2.xMax * p, yMin: c2.yMin * p, yMax: c2.yMax * p, path: d2 });
            s[a] = h2;
          }
        }
      return s;
    }, () => {
      t.stringToGlyphs = i, t._trackBrokenChars = void 0;
    };
  }
  measure(t, n, { fontSize: r, letterSpacing: i = 0 }) {
    let o = t(n), u2 = this.patchFontFallbackResolver(o, t);
    try {
      return o.getAdvanceWidth(n, r, { letterSpacing: i / r });
    } finally {
      u2();
    }
  }
  getSVG(t, n, { fontSize: r, top: i, left: o, letterSpacing: u2 = 0 }) {
    let s = t(n), a = this.patchFontFallbackResolver(s, t);
    try {
      return r === 0 ? "" : s.getPath(n.replace(/\n/g, ""), o, i, r, { letterSpacing: u2 / r }).toPathData(1);
    } finally {
      a();
    }
  }
};
function Vf(e) {
  let t = e.split("_"), n = t[t.length - 1];
  return n === zu ? void 0 : n;
}
function Vn({ width: e, height: t, content: n }) {
  return E("svg", { width: e, height: t, viewBox: `0 0 ${e} ${t}`, xmlns: "http://www.w3.org/2000/svg" }, n);
}
var xl = Il(Ja());
var Bm = ["ios", "android", "windows", "macos", "web"];
function el(e) {
  return Bm.includes(e);
}
var Im = ["portrait", "landscape"];
function tl(e) {
  return Im.includes(e);
}
var Za;
(function(e) {
  e.fontSize = "fontSize", e.lineHeight = "lineHeight";
})(Za || (Za = {}));
var M;
(function(e) {
  e.rem = "rem", e.em = "em", e.px = "px", e.percent = "%", e.vw = "vw", e.vh = "vh", e.none = "<no-css-unit>";
})(M || (M = {}));
function yo(e) {
  return typeof e == "string";
}
function xo(e) {
  return typeof e == "object";
}
var Fo;
function D(e) {
  return { kind: "complete", style: e };
}
function re(e, t = {}) {
  let { fractions: n } = t;
  if (n && e.includes("/")) {
    let [o = "", u2 = ""] = e.split("/", 2), s = re(o), a = re(u2);
    return !s || !a ? null : [s[0] / a[0], a[1]];
  }
  let r = parseFloat(e);
  if (Number.isNaN(r))
    return null;
  let i = e.match(/(([a-z]{2,}|%))$/);
  if (!i)
    return [r, M.none];
  switch (i == null ? void 0 : i[1]) {
    case "rem":
      return [r, M.rem];
    case "px":
      return [r, M.px];
    case "em":
      return [r, M.em];
    case "%":
      return [r, M.percent];
    case "vw":
      return [r, M.vw];
    case "vh":
      return [r, M.vh];
    default:
      return null;
  }
}
function We(e, t, n = {}) {
  let r = Pe(t, n);
  return r === null ? null : D({ [e]: r });
}
function mn(e, t, n) {
  let r = Pe(t);
  return r !== null && (n[e] = r), n;
}
function nl(e, t) {
  let n = Pe(t);
  return n === null ? null : { [e]: n };
}
function Pe(e, t = {}) {
  if (e === void 0)
    return null;
  let n = re(String(e), t);
  return n ? Qe(...n, t) : null;
}
function Qe(e, t, n = {}) {
  let { isNegative: r, device: i } = n;
  switch (t) {
    case M.rem:
      return e * 16 * (r ? -1 : 1);
    case M.px:
      return e * (r ? -1 : 1);
    case M.percent:
      return `${r ? "-" : ""}${e}%`;
    case M.none:
      return e * (r ? -1 : 1);
    case M.vw:
      return i != null && i.windowDimensions ? i.windowDimensions.width * (e / 100) : (he("`vw` CSS unit requires configuration with `useDeviceContext()`"), null);
    case M.vh:
      return i != null && i.windowDimensions ? i.windowDimensions.height * (e / 100) : (he("`vh` CSS unit requires configuration with `useDeviceContext()`"), null);
    default:
      return null;
  }
}
function wo(e) {
  let t = re(e);
  if (!t)
    return null;
  let [n, r] = t;
  switch (r) {
    case M.rem:
      return n * 16;
    case M.px:
      return n;
    default:
      return null;
  }
}
var Rm = { t: "Top", tr: "TopRight", tl: "TopLeft", b: "Bottom", br: "BottomRight", bl: "BottomLeft", l: "Left", r: "Right", x: "Horizontal", y: "Vertical" };
function Eo(e) {
  return Rm[e ?? ""] || "All";
}
function So(e) {
  let t = "All";
  return [e.replace(/^-(t|b|r|l|tr|tl|br|bl)(-|$)/, (r, i) => (t = Eo(i), "")), t];
}
function st(e, t = {}) {
  if (e.includes("/")) {
    let n = rl(e, { ...t, fractions: true });
    if (n)
      return n;
  }
  return e[0] === "[" && (e = e.slice(1, -1)), rl(e, t);
}
function we(e, t, n = {}) {
  let r = st(t, n);
  return r === null ? null : D({ [e]: r });
}
function rl(e, t = {}) {
  if (e === "px")
    return 1;
  let n = re(e, t);
  if (!n)
    return null;
  let [r, i] = n;
  return t.fractions && (i = M.percent, r *= 100), i === M.none && (r = r / 4, i = M.rem), Qe(r, i, t);
}
function Lm(...e) {
  console.warn(...e);
}
function Mm(...e) {
}
var he = typeof process > "u" || ((Fo = process == null ? void 0 : process.env) === null || Fo === void 0 ? void 0 : Fo.JEST_WORKER_ID) === void 0 ? Lm : Mm;
var Nm = [["aspect-square", D({ aspectRatio: 1 })], ["aspect-video", D({ aspectRatio: 16 / 9 })], ["items-center", D({ alignItems: "center" })], ["items-start", D({ alignItems: "flex-start" })], ["items-end", D({ alignItems: "flex-end" })], ["items-baseline", D({ alignItems: "baseline" })], ["items-stretch", D({ alignItems: "stretch" })], ["justify-start", D({ justifyContent: "flex-start" })], ["justify-end", D({ justifyContent: "flex-end" })], ["justify-center", D({ justifyContent: "center" })], ["justify-between", D({ justifyContent: "space-between" })], ["justify-around", D({ justifyContent: "space-around" })], ["justify-evenly", D({ justifyContent: "space-evenly" })], ["content-start", D({ alignContent: "flex-start" })], ["content-end", D({ alignContent: "flex-end" })], ["content-between", D({ alignContent: "space-between" })], ["content-around", D({ alignContent: "space-around" })], ["content-stretch", D({ alignContent: "stretch" })], ["content-center", D({ alignContent: "center" })], ["self-auto", D({ alignSelf: "auto" })], ["self-start", D({ alignSelf: "flex-start" })], ["self-end", D({ alignSelf: "flex-end" })], ["self-center", D({ alignSelf: "center" })], ["self-stretch", D({ alignSelf: "stretch" })], ["self-baseline", D({ alignSelf: "baseline" })], ["direction-inherit", D({ direction: "inherit" })], ["direction-ltr", D({ direction: "ltr" })], ["direction-rtl", D({ direction: "rtl" })], ["hidden", D({ display: "none" })], ["flex", D({ display: "flex" })], ["flex-row", D({ flexDirection: "row" })], ["flex-row-reverse", D({ flexDirection: "row-reverse" })], ["flex-col", D({ flexDirection: "column" })], ["flex-col-reverse", D({ flexDirection: "column-reverse" })], ["flex-wrap", D({ flexWrap: "wrap" })], ["flex-wrap-reverse", D({ flexWrap: "wrap-reverse" })], ["flex-nowrap", D({ flexWrap: "nowrap" })], ["flex-auto", D({ flexGrow: 1, flexShrink: 1, flexBasis: "auto" })], ["flex-initial", D({ flexGrow: 0, flexShrink: 1, flexBasis: "auto" })], ["flex-none", D({ flexGrow: 0, flexShrink: 0, flexBasis: "auto" })], ["overflow-hidden", D({ overflow: "hidden" })], ["overflow-visible", D({ overflow: "visible" })], ["overflow-scroll", D({ overflow: "scroll" })], ["absolute", D({ position: "absolute" })], ["relative", D({ position: "relative" })], ["italic", D({ fontStyle: "italic" })], ["not-italic", D({ fontStyle: "normal" })], ["oldstyle-nums", br("oldstyle-nums")], ["small-caps", br("small-caps")], ["lining-nums", br("lining-nums")], ["tabular-nums", br("tabular-nums")], ["proportional-nums", br("proportional-nums")], ["font-thin", D({ fontWeight: "100" })], ["font-100", D({ fontWeight: "100" })], ["font-extralight", D({ fontWeight: "200" })], ["font-200", D({ fontWeight: "200" })], ["font-light", D({ fontWeight: "300" })], ["font-300", D({ fontWeight: "300" })], ["font-normal", D({ fontWeight: "normal" })], ["font-400", D({ fontWeight: "400" })], ["font-medium", D({ fontWeight: "500" })], ["font-500", D({ fontWeight: "500" })], ["font-semibold", D({ fontWeight: "600" })], ["font-600", D({ fontWeight: "600" })], ["font-bold", D({ fontWeight: "bold" })], ["font-700", D({ fontWeight: "700" })], ["font-extrabold", D({ fontWeight: "800" })], ["font-800", D({ fontWeight: "800" })], ["font-black", D({ fontWeight: "900" })], ["font-900", D({ fontWeight: "900" })], ["include-font-padding", D({ includeFontPadding: true })], ["remove-font-padding", D({ includeFontPadding: false })], ["max-w-none", D({ maxWidth: "99999%" })], ["text-left", D({ textAlign: "left" })], ["text-center", D({ textAlign: "center" })], ["text-right", D({ textAlign: "right" })], ["text-justify", D({ textAlign: "justify" })], ["text-auto", D({ textAlign: "auto" })], ["underline", D({ textDecorationLine: "underline" })], ["line-through", D({ textDecorationLine: "line-through" })], ["no-underline", D({ textDecorationLine: "none" })], ["uppercase", D({ textTransform: "uppercase" })], ["lowercase", D({ textTransform: "lowercase" })], ["capitalize", D({ textTransform: "capitalize" })], ["normal-case", D({ textTransform: "none" })], ["w-auto", D({ width: "auto" })], ["h-auto", D({ height: "auto" })], ["shadow-sm", D({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.025, elevation: 1 })], ["shadow", D({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 1, shadowOpacity: 0.075, elevation: 2 })], ["shadow-md", D({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowRadius: 3, shadowOpacity: 0.125, elevation: 3 })], ["shadow-lg", D({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 })], ["shadow-xl", D({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.19, shadowRadius: 20, elevation: 12 })], ["shadow-2xl", D({ shadowOffset: { width: 1, height: 1 }, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 30, elevation: 16 })], ["shadow-none", D({ shadowOffset: { width: 0, height: 0 }, shadowColor: "#000", shadowRadius: 0, shadowOpacity: 0, elevation: 0 })]];
var Co = Nm;
function br(e) {
  return { kind: "dependent", complete(t) {
    (!t.fontVariant || !Array.isArray(t.fontVariant)) && (t.fontVariant = []), t.fontVariant.push(e);
  } };
}
var vr = class {
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
    return we("fontSize", e, n);
  if (typeof r == "string")
    return We("fontSize", r);
  let i = {}, [o, u2] = r, s = nl("fontSize", o);
  if (s && (i = s), typeof u2 == "string")
    return D(mn("lineHeight", il(u2, i), i));
  let { lineHeight: a, letterSpacing: l2 } = u2;
  return a && mn("lineHeight", il(a, i), i), l2 && mn("letterSpacing", l2, i), D(i);
}
function il(e, t) {
  let n = re(e);
  if (n) {
    let [r, i] = n;
    if ((i === M.none || i === M.em) && typeof t.fontSize == "number")
      return t.fontSize * r;
  }
  return e;
}
function ko(e, t) {
  var n;
  let r = (n = t == null ? void 0 : t[e]) !== null && n !== void 0 ? n : e.startsWith("[") ? e.slice(1, -1) : e, i = re(r);
  if (!i)
    return null;
  let [o, u2] = i;
  if (u2 === M.none)
    return { kind: "dependent", complete(a) {
      if (typeof a.fontSize != "number")
        return "relative line-height utilities require that font-size be set";
      a.lineHeight = a.fontSize * o;
    } };
  let s = Qe(o, u2);
  return s !== null ? D({ lineHeight: s }) : null;
}
function To(e, t, n, r, i) {
  let o = "";
  if (r[0] === "[")
    o = r.slice(1, -1);
  else {
    let l2 = i == null ? void 0 : i[r];
    if (l2)
      o = l2;
    else {
      let f = st(r);
      return f && typeof f == "number" ? ol(f, M.px, t, e) : null;
    }
  }
  if (o === "auto")
    return ul(t, e, "auto");
  let u2 = re(o);
  if (!u2)
    return null;
  let [s, a] = u2;
  return n && (s = -s), ol(s, a, t, e);
}
function ol(e, t, n, r) {
  let i = Qe(e, t);
  return i === null ? null : ul(n, r, i);
}
function ul(e, t, n) {
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
  let t = Object.entries(e).reduce((i, [o, u2]) => {
    let s = [0, 1 / 0, 0], a = typeof u2 == "string" ? { min: u2 } : u2, l2 = a.min ? wo(a.min) : 0;
    l2 === null ? he(`invalid screen config value: ${o}->min: ${a.min}`) : s[0] = l2;
    let f = a.max ? wo(a.max) : 1 / 0;
    return f === null ? he(`invalid screen config value: ${o}->max: ${a.max}`) : s[1] = f, i[o] = s, i;
  }, {}), n = Object.values(t);
  n.sort((i, o) => {
    let [u2, s] = i, [a, l2] = o;
    return s === 1 / 0 || l2 === 1 / 0 ? u2 - a : s - l2;
  });
  let r = 0;
  return n.forEach((i) => i[2] = r++), t;
}
function Oo(e, t) {
  let n = t == null ? void 0 : t[e];
  if (!n)
    return null;
  if (typeof n == "string")
    return D({ fontFamily: n });
  let r = n[0];
  return r ? D({ fontFamily: r }) : null;
}
function at(e, t, n) {
  if (!n)
    return null;
  let r;
  t.includes("/") && ([t = "", r] = t.split("/", 2));
  let i = "";
  if (t.startsWith("[#") || t.startsWith("[rgb") ? i = t.slice(1, -1) : i = ll(t, n), !i)
    return null;
  if (r) {
    let o = Number(r);
    if (!Number.isNaN(o))
      return i = sl(i, o / 100), D({ [Dn[e].color]: i });
  }
  return { kind: "dependent", complete(o) {
    let u2 = Dn[e].opacity, s = o[u2];
    typeof s == "number" && (i = sl(i, s)), o[Dn[e].color] = i;
  } };
}
function yr(e, t) {
  let n = parseInt(t, 10);
  if (Number.isNaN(n))
    return null;
  let r = n / 100;
  return { kind: "complete", style: { [Dn[e].opacity]: r } };
}
function sl(e, t) {
  return e.startsWith("#") ? e = Wm(e) : e.startsWith("rgb(") && (e = e.replace(/^rgb\(/, "rgba(").replace(/\)$/, ", 1)")), e.replace(/, ?\d*\.?(\d+)\)$/, `, ${t})`);
}
function al(e) {
  for (let t in e)
    t.startsWith("__opacity_") && delete e[t];
}
var Dn = { bg: { opacity: "__opacity_bg", color: "backgroundColor" }, text: { opacity: "__opacity_text", color: "color" }, border: { opacity: "__opacity_border", color: "borderColor" }, borderTop: { opacity: "__opacity_border", color: "borderTopColor" }, borderBottom: { opacity: "__opacity_border", color: "borderBottomColor" }, borderLeft: { opacity: "__opacity_border", color: "borderLeftColor" }, borderRight: { opacity: "__opacity_border", color: "borderRightColor" }, shadow: { opacity: "__opacity_shadow", color: "shadowColor" }, tint: { opacity: "__opacity_tint", color: "tintColor" } };
function Wm(e) {
  let t = e;
  e = e.replace($m, (u2, s, a, l2) => s + s + a + a + l2 + l2);
  let n = qm.exec(e);
  if (!n)
    return he(`invalid config hex color value: ${t}`), "rgba(0, 0, 0, 1)";
  let r = parseInt(n[1], 16), i = parseInt(n[2], 16), o = parseInt(n[3], 16);
  return `rgba(${r}, ${i}, ${o}, 1)`;
}
function ll(e, t) {
  let n = t[e];
  if (yo(n))
    return n;
  if (xo(n) && yo(n.DEFAULT))
    return n.DEFAULT;
  let [r = "", ...i] = e.split("-");
  for (; r !== e; ) {
    let o = t[r];
    if (xo(o))
      return ll(i.join("-"), o);
    if (i.length === 0)
      return "";
    r = `${r}-${i.shift()}`;
  }
  return "";
}
var $m = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
var qm = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
function cl(e, t) {
  let [n, r] = So(e);
  if (n.match(/^(-?(\d)+)?$/))
    return zm(n, r, t == null ? void 0 : t.borderWidth);
  if (n = n.replace(/^-/, ""), ["dashed", "solid", "dotted"].includes(n))
    return D({ borderStyle: n });
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
  let u2 = at(o, n, t == null ? void 0 : t.borderColor);
  if (u2)
    return u2;
  let s = `border${r === "All" ? "" : r}Width`;
  n = n.replace(/^-/, "");
  let a = n.slice(1, -1), l2 = we(s, a);
  return typeof (l2 == null ? void 0 : l2.style[s]) != "number" ? null : l2;
}
function zm(e, t, n) {
  if (!n)
    return null;
  e = e.replace(/^-/, "");
  let i = n[e === "" ? "DEFAULT" : e];
  if (i === void 0)
    return null;
  let o = `border${t === "All" ? "" : t}Width`;
  return We(o, i);
}
function dl(e, t) {
  if (!t)
    return null;
  let [n, r] = So(e);
  n = n.replace(/^-/, ""), n === "" && (n = "DEFAULT");
  let i = `border${r === "All" ? "" : r}Radius`, o = t[n];
  if (o)
    return fl2(We(i, o));
  let u2 = we(i, n);
  return typeof (u2 == null ? void 0 : u2.style[i]) != "number" ? null : fl2(u2);
}
function fl2(e) {
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
function Et(e, t, n, r) {
  let i = null;
  e === "inset" && (t = t.replace(/^(x|y)-/, (s, a) => (i = a === "x" ? "x" : "y", "")));
  let o = r == null ? void 0 : r[t];
  if (o) {
    let s = Pe(o, { isNegative: n });
    if (s !== null)
      return pl(e, i, s);
  }
  let u2 = st(t, { isNegative: n });
  return u2 !== null ? pl(e, i, u2) : null;
}
function pl(e, t, n) {
  if (e !== "inset")
    return D({ [e]: n });
  switch (t) {
    case null:
      return D({ top: n, left: n, right: n, bottom: n });
    case "y":
      return D({ top: n, bottom: n });
    case "x":
      return D({ left: n, right: n });
  }
}
function xr(e, t, n) {
  var r;
  t = t.replace(/^-/, "");
  let i = t === "" ? "DEFAULT" : t, o = Number((r = n == null ? void 0 : n[i]) !== null && r !== void 0 ? r : t);
  return Number.isNaN(o) ? null : D({ [`flex${e}`]: o });
}
function hl(e, t) {
  var n, r;
  if (e = (t == null ? void 0 : t[e]) || e, ["min-content", "revert", "unset"].includes(e))
    return null;
  if (e.match(/^\d+(\.\d+)?$/))
    return D({ flexGrow: Number(e), flexBasis: "0%" });
  let i = e.match(/^(\d+)\s+(\d+)$/);
  if (i)
    return D({ flexGrow: Number(i[1]), flexShrink: Number(i[2]) });
  if (i = e.match(/^(\d+)\s+([^ ]+)$/), i) {
    let o = Pe((n = i[2]) !== null && n !== void 0 ? n : "");
    return o ? D({ flexGrow: Number(i[1]), flexBasis: o }) : null;
  }
  if (i = e.match(/^(\d+)\s+(\d+)\s+(.+)$/), i) {
    let o = Pe((r = i[3]) !== null && r !== void 0 ? r : "");
    return o ? D({ flexGrow: Number(i[1]), flexShrink: Number(i[2]), flexBasis: o }) : null;
  }
  return null;
}
function Po(e, t, n = {}, r) {
  let i = r == null ? void 0 : r[t];
  return i !== void 0 ? We(e, i, n) : we(e, t, n);
}
function Fr(e, t, n = {}, r) {
  let i = Pe(r == null ? void 0 : r[t], n);
  return i ? D({ [e]: i }) : (t === "screen" && (t = e.includes("Width") ? "100vw" : "100vh"), we(e, t, n));
}
function ml(e, t, n) {
  let r = n == null ? void 0 : n[e];
  if (r) {
    let i = re(r, { isNegative: t });
    if (!i)
      return null;
    let [o, u2] = i;
    if (u2 === M.em)
      return Um(o);
    if (u2 === M.percent)
      return he("percentage-based letter-spacing configuration currently unsupported, switch to `em`s, or open an issue if you'd like to see support added."), null;
    let s = Qe(o, u2, { isNegative: t });
    return s !== null ? D({ letterSpacing: s }) : null;
  }
  return we("letterSpacing", e, { isNegative: t });
}
function Um(e) {
  return { kind: "dependent", complete(t) {
    let n = t.fontSize;
    if (typeof n != "number" || Number.isNaN(n))
      return "tracking-X relative letter spacing classes require font-size to be set";
    t.letterSpacing = Math.round((e * n + Number.EPSILON) * 100) / 100;
  } };
}
function Dl(e, t) {
  let n = t == null ? void 0 : t[e];
  if (n) {
    let i = re(String(n));
    if (i)
      return D({ opacity: i[0] });
  }
  let r = re(e);
  return r ? D({ opacity: r[0] / 100 }) : null;
}
function gl(e) {
  let t = parseInt(e, 10);
  return Number.isNaN(t) ? null : { kind: "complete", style: { shadowOpacity: t / 100 } };
}
function bl(e) {
  if (e.includes("/")) {
    let [n = "", r = ""] = e.split("/", 2), i = Bo(n), o = Bo(r);
    return i === null || o === null ? null : { kind: "complete", style: { shadowOffset: { width: i, height: o } } };
  }
  let t = Bo(e);
  return t === null ? null : { kind: "complete", style: { shadowOffset: { width: t, height: t } } };
}
function Bo(e) {
  let t = st(e);
  return typeof t == "number" ? t : null;
}
var St = class {
  constructor(t, n = {}, r, i, o) {
    var u2, s, a, l2, f, c2;
    this.config = n, this.cache = r, this.position = 0, this.isNull = false, this.isNegative = false, this.context = {}, this.context.device = i;
    let p = t.trim().split(":"), d2 = [];
    p.length === 1 ? this.string = t : (this.string = (u2 = p.pop()) !== null && u2 !== void 0 ? u2 : "", d2 = p), this.char = this.string[0];
    let h2 = Ao((s = this.config.theme) === null || s === void 0 ? void 0 : s.screens);
    for (let m2 of d2)
      if (h2[m2]) {
        let x2 = (a = h2[m2]) === null || a === void 0 ? void 0 : a[2];
        x2 !== void 0 && (this.order = ((l2 = this.order) !== null && l2 !== void 0 ? l2 : 0) + x2);
        let g2 = (f = i.windowDimensions) === null || f === void 0 ? void 0 : f.width;
        if (g2) {
          let [S2, v2] = (c2 = h2[m2]) !== null && c2 !== void 0 ? c2 : [0, 0];
          (g2 <= S2 || g2 > v2) && (this.isNull = true);
        } else
          this.isNull = true;
      } else
        el(m2) ? this.isNull = m2 !== o : tl(m2) ? i.windowDimensions ? (i.windowDimensions.width > i.windowDimensions.height ? "landscape" : "portrait") !== m2 ? this.isNull = true : this.incrementOrder() : this.isNull = true : m2 === "retina" ? i.pixelDensity === 2 ? this.incrementOrder() : this.isNull = true : m2 === "dark" ? i.colorScheme !== "dark" ? this.isNull = true : this.incrementOrder() : this.handlePossibleArbitraryBreakpointPrefix(m2) || (this.isNull = true);
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
    let u2 = this.config.theme, s = null;
    switch (this.char) {
      case "m":
      case "p": {
        let a = this.peekSlice(1, 3).match(/^(t|b|r|l|x|y)?-/);
        if (a) {
          let l2 = this.char === "m" ? "margin" : "padding";
          this.advance(((n = (t = a[0]) === null || t === void 0 ? void 0 : t.length) !== null && n !== void 0 ? n : 0) + 1);
          let f = Eo(a[1]), c2 = To(l2, f, this.isNegative, this.rest, (r = this.config.theme) === null || r === void 0 ? void 0 : r[l2]);
          if (c2)
            return c2;
        }
      }
    }
    if (this.consumePeeked("h-") && (s = Po("height", this.rest, this.context, u2 == null ? void 0 : u2.height), s) || this.consumePeeked("w-") && (s = Po("width", this.rest, this.context, u2 == null ? void 0 : u2.width), s) || this.consumePeeked("min-w-") && (s = Fr("minWidth", this.rest, this.context, u2 == null ? void 0 : u2.minWidth), s) || this.consumePeeked("min-h-") && (s = Fr("minHeight", this.rest, this.context, u2 == null ? void 0 : u2.minHeight), s) || this.consumePeeked("max-w-") && (s = Fr("maxWidth", this.rest, this.context, u2 == null ? void 0 : u2.maxWidth), s) || this.consumePeeked("max-h-") && (s = Fr("maxHeight", this.rest, this.context, u2 == null ? void 0 : u2.maxHeight), s) || this.consumePeeked("leading-") && (s = ko(this.rest, u2 == null ? void 0 : u2.lineHeight), s) || this.consumePeeked("text-") && (s = _o(this.rest, u2 == null ? void 0 : u2.fontSize, this.context), s || (s = at("text", this.rest, u2 == null ? void 0 : u2.textColor), s) || this.consumePeeked("opacity-") && (s = yr("text", this.rest), s)) || this.consumePeeked("font-") && (s = Oo(this.rest, u2 == null ? void 0 : u2.fontFamily), s) || this.consumePeeked("aspect-") && (this.consumePeeked("ratio-") && he("`aspect-ratio-{ratio}` is deprecated, use `aspect-{ratio}` instead"), s = We("aspectRatio", this.rest, { fractions: true }), s) || this.consumePeeked("tint-") && (s = at("tint", this.rest, u2 == null ? void 0 : u2.colors), s) || this.consumePeeked("bg-") && (s = at("bg", this.rest, u2 == null ? void 0 : u2.backgroundColor), s || this.consumePeeked("opacity-") && (s = yr("bg", this.rest), s)) || this.consumePeeked("border") && (s = cl(this.rest, u2), s || this.consumePeeked("-opacity-") && (s = yr("border", this.rest), s)) || this.consumePeeked("rounded") && (s = dl(this.rest, u2 == null ? void 0 : u2.borderRadius), s) || this.consumePeeked("bottom-") && (s = Et("bottom", this.rest, this.isNegative, u2 == null ? void 0 : u2.inset), s) || this.consumePeeked("top-") && (s = Et("top", this.rest, this.isNegative, u2 == null ? void 0 : u2.inset), s) || this.consumePeeked("left-") && (s = Et("left", this.rest, this.isNegative, u2 == null ? void 0 : u2.inset), s) || this.consumePeeked("right-") && (s = Et("right", this.rest, this.isNegative, u2 == null ? void 0 : u2.inset), s) || this.consumePeeked("inset-") && (s = Et("inset", this.rest, this.isNegative, u2 == null ? void 0 : u2.inset), s) || this.consumePeeked("flex-") && (this.consumePeeked("grow") ? s = xr("Grow", this.rest, u2 == null ? void 0 : u2.flexGrow) : this.consumePeeked("shrink") ? s = xr("Shrink", this.rest, u2 == null ? void 0 : u2.flexShrink) : s = hl(this.rest, u2 == null ? void 0 : u2.flex), s) || this.consumePeeked("grow") && (s = xr("Grow", this.rest, u2 == null ? void 0 : u2.flexGrow), s) || this.consumePeeked("shrink") && (s = xr("Shrink", this.rest, u2 == null ? void 0 : u2.flexShrink), s) || this.consumePeeked("shadow-color-opacity-") && (s = yr("shadow", this.rest), s) || this.consumePeeked("shadow-opacity-") && (s = gl(this.rest), s) || this.consumePeeked("shadow-offset-") && (s = bl(this.rest), s) || this.consumePeeked("shadow-radius-") && (s = we("shadowRadius", this.rest), s) || this.consumePeeked("shadow-") && (s = at("shadow", this.rest, u2 == null ? void 0 : u2.colors), s))
      return s;
    if (this.consumePeeked("elevation-")) {
      let a = parseInt(this.rest, 10);
      if (!Number.isNaN(a))
        return D({ elevation: a });
    }
    if (this.consumePeeked("opacity-") && (s = Dl(this.rest, u2 == null ? void 0 : u2.opacity), s) || this.consumePeeked("tracking-") && (s = ml(this.rest, this.isNegative, u2 == null ? void 0 : u2.letterSpacing), s))
      return s;
    if (this.consumePeeked("z-")) {
      let a = Number((o = (i = u2 == null ? void 0 : u2.zIndex) === null || i === void 0 ? void 0 : i[this.rest]) !== null && o !== void 0 ? o : this.rest);
      if (!Number.isNaN(a))
        return D({ zIndex: a });
    }
    return he(`\`${this.rest}\` unknown or invalid utility`), null;
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
    let i = this.context.device.windowDimensions, [, o = "", u2 = "", s = ""] = r, a = u2 === "w" ? i.width : i.height, l2 = re(s, this.context);
    if (l2 === null)
      return this.isNull = true, true;
    let [f, c2] = l2;
    return c2 !== "px" && (this.isNull = true), (o === "min" ? a >= f : a <= f) ? this.incrementOrder() : this.isNull = true, true;
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
function vl(e) {
  let t = [], n = null;
  return e.forEach((r) => {
    if (typeof r == "string")
      t = [...t, ...Io(r)];
    else if (Array.isArray(r))
      t = [...t, ...r.flatMap(Io)];
    else if (typeof r == "object" && r !== null)
      for (let [i, o] of Object.entries(r))
        typeof o == "boolean" ? t = [...t, ...o ? Io(i) : []] : n ? n[i] = o : n = { [i]: o };
  }), [t.filter(Boolean).filter(Gm), n];
}
function Io(e) {
  return e.trim().split(/\s+/);
}
function Gm(e, t, n) {
  return n.indexOf(e) === t;
}
function yl(e) {
  var t;
  return (t = e == null ? void 0 : e.reduce((n, r) => ({ ...n, ...jm(r.handler) }), {})) !== null && t !== void 0 ? t : {};
}
function jm(e) {
  let t = {};
  return e({ addUtilities: (n) => {
    t = n;
  }, ...Hm }), t;
}
function Be(e) {
  throw new Error(`tailwindcss plugin function argument object prop "${e}" not implemented`);
}
var Hm = { addComponents: Be, addBase: Be, addVariant: Be, e: Be, prefix: Be, theme: Be, variants: Be, config: Be, corePlugins: Be, matchUtilities: Be, postcss: null };
function Fl(e, t) {
  let n = (0, xl.default)(Vm(e)), r = {}, i = yl(n.plugins), o = {}, u2 = Object.entries(i).map(([h2, m2]) => typeof m2 == "string" ? (o[h2] = m2, [h2, { kind: "null" }]) : [h2, D(m2)]).filter(([, h2]) => h2.kind !== "null");
  function s() {
    return [r.windowDimensions ? `w${r.windowDimensions.width}` : false, r.windowDimensions ? `h${r.windowDimensions.height}` : false, r.fontScale ? `fs${r.fontScale}` : false, r.colorScheme === "dark" ? "dark" : false, r.pixelDensity === 2 ? "retina" : false].filter(Boolean).join("--") || "default";
  }
  let a = s(), l2 = {};
  function f() {
    let h2 = l2[a];
    if (h2)
      return h2;
    let m2 = new vr(u2);
    return l2[a] = m2, m2;
  }
  function c2(...h2) {
    let m2 = f(), x2 = {}, g2 = [], S2 = [], [v2, b] = vl(h2), y = v2.join(" "), T = m2.getStyle(y);
    if (T)
      return { ...T, ...b || {} };
    for (let A of v2) {
      let P2 = m2.getIr(A);
      if (!P2 && A in o) {
        let ie = c2(o[A]);
        m2.setIr(A, D(ie)), x2 = { ...x2, ...ie };
        continue;
      }
      switch (P2 = new St(A, n, m2, r, t).parse(), P2.kind) {
        case "complete":
          x2 = { ...x2, ...P2.style }, m2.setIr(A, P2);
          break;
        case "dependent":
          g2.push(P2);
          break;
        case "ordered":
          S2.push(P2);
          break;
        case "null":
          m2.setIr(A, P2);
          break;
      }
    }
    if (S2.length > 0) {
      S2.sort((A, P2) => A.order - P2.order);
      for (let A of S2)
        switch (A.styleIr.kind) {
          case "complete":
            x2 = { ...x2, ...A.styleIr.style };
            break;
          case "dependent":
            g2.push(A.styleIr);
            break;
        }
    }
    if (g2.length > 0) {
      for (let A of g2) {
        let P2 = A.complete(x2);
        P2 && he(P2);
      }
      al(x2);
    }
    return y !== "" && m2.setStyle(y, x2), b && (x2 = { ...x2, ...b }), x2;
  }
  function p(h2) {
    let m2 = c2(h2.split(/\s+/g).map((x2) => x2.replace(/^(bg|text|border)-/, "")).map((x2) => `bg-${x2}`).join(" "));
    return typeof m2.backgroundColor == "string" ? m2.backgroundColor : void 0;
  }
  let d2 = (h2, ...m2) => {
    let x2 = "";
    return h2.forEach((g2, S2) => {
      var v2;
      x2 += g2 + ((v2 = m2[S2]) !== null && v2 !== void 0 ? v2 : "");
    }), c2(x2);
  };
  return d2.style = c2, d2.color = p, d2.prefixMatch = (...h2) => {
    let m2 = h2.sort().join(":"), x2 = f(), g2 = x2.getPrefixMatch(m2);
    if (g2 !== void 0)
      return g2;
    let b = new St(`${m2}:flex`, n, x2, r, t).parse().kind !== "null";
    return x2.setPrefixMatch(m2, b), b;
  }, d2.setWindowDimensions = (h2) => {
    r.windowDimensions = h2, a = s();
  }, d2.setFontScale = (h2) => {
    r.fontScale = h2, a = s();
  }, d2.setPixelDensity = (h2) => {
    r.pixelDensity = h2, a = s();
  }, d2.setColorScheme = (h2) => {
    r.colorScheme = h2, a = s();
  }, d2;
}
function Vm(e) {
  return { ...e, content: ["_no_warnings_please"] };
}
var Xm = { handler: ({ addUtilities: e }) => {
  e({ "shadow-sm": { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }, shadow: { boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" }, "shadow-md": { boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }, "shadow-lg": { boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }, "shadow-xl": { boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }, "shadow-2xl": { boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)" }, "shadow-inner": { boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" }, "shadow-none": { boxShadow: "0 0 #0000" } });
} };
function Qm(e) {
  return Fl({ ...e, plugins: [...(e == null ? void 0 : e.plugins) ?? [], Xm] }, "web");
}
var gn;
function Ro({ width: e, height: t, config: n }) {
  return gn || (gn = Qm(n)), gn.setWindowDimensions({ width: +e, height: +t }), gn;
}
var Lo = /* @__PURE__ */ new WeakMap();
async function El(e, t) {
  let n = await Re();
  if (!n || !n.Node)
    throw new Error("Satori is not initialized: expect `yoga` to be loaded, got " + n);
  t.fonts = t.fonts || [];
  let r;
  Lo.has(t.fonts) ? r = Lo.get(t.fonts) : Lo.set(t.fonts, r = new qt(t.fonts));
  let i = "width" in t ? t.width : void 0, o = "height" in t ? t.height : void 0, u2 = n.Node.create();
  i && u2.setWidth(i), o && u2.setHeight(o), u2.setFlexDirection(n.FLEX_DIRECTION_ROW), u2.setFlexWrap(n.WRAP_WRAP), u2.setAlignContent(n.ALIGN_AUTO), u2.setAlignItems(n.ALIGN_FLEX_START), u2.setJustifyContent(n.JUSTIFY_FLEX_START), u2.setOverflow(n.OVERFLOW_HIDDEN);
  let s = { ...t.graphemeImages }, a = /* @__PURE__ */ new Set();
  Ae.clear(), Bt.clear(), await cu(e);
  let l2 = $t(e, { id: "id", parentStyle: {}, inheritedStyle: { fontSize: 16, fontWeight: "normal", fontFamily: "serif", fontStyle: "normal", lineHeight: "normal", color: "black", opacity: 1, whiteSpace: "normal", _viewportWidth: i, _viewportHeight: o }, parent: u2, font: r, embedFont: t.embedFont, debug: t.debug, graphemeImages: s, canLoadAdditionalAssets: !!t.loadAdditionalAsset, onNodeDetected: t.onNodeDetected, getTwStyles: (h2, m2) => {
    let g2 = { ...Ro({ width: i, height: o, config: t.tailwindConfig })([h2]) };
    return typeof g2.lineHeight == "number" && (g2.lineHeight = g2.lineHeight / (+g2.fontSize || m2.fontSize || 16)), g2.shadowColor && g2.boxShadow && (g2.boxShadow = g2.boxShadow.replace(/rgba?\([^)]+\)/, g2.shadowColor)), g2;
  } }), f = (await l2.next()).value;
  if (t.loadAdditionalAsset && f.length) {
    let h2 = Km(f), m2 = [], x2 = {};
    await Promise.all(Object.entries(h2).flatMap(([g2, S2]) => S2.map((v2) => {
      let b = `${g2}_${v2}`;
      return a.has(b) ? null : (a.add(b), t.loadAdditionalAsset(g2, v2).then((y) => {
        typeof y == "string" ? x2[v2] = y : y && (Array.isArray(y) ? m2.push(...y) : m2.push(y));
      }));
    }))), r.addFonts(m2), Object.assign(s, x2);
  }
  await l2.next(), u2.calculateLayout(i, o, n.DIRECTION_LTR);
  let c2 = (await l2.next([0, 0])).value, p = u2.getComputedWidth(), d2 = u2.getComputedHeight();
  return u2.freeRecursive(), Vn({ width: p, height: d2, content: c2 });
}
function Km(e) {
  let t = {}, n = {};
  for (let { word: r, locale: i } of e) {
    let o = $u(r, i).join("|");
    n[o] = n[o] || "", n[o] += r;
  }
  return Object.keys(n).forEach((r) => {
    t[r] = t[r] || [], r === "emoji" ? t[r].push(...wl(le(n[r], "grapheme"))) : (t[r][0] = t[r][0] || "", t[r][0] += wl(le(n[r], "grapheme", r === "unknown" ? void 0 : r)).join(""));
  }), t;
}
function wl(e) {
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
var wrapAsm = (E2) => {
  function _(E3, _2, T2) {
    let N2 = E3[_2];
    E3[_2] = function(...E4) {
      return T2.call(this, N2, ...E4);
    };
  }
  for (let T2 of ["setPosition", "setMargin", "setFlexBasis", "setWidth", "setHeight", "setMinWidth", "setMinHeight", "setMaxWidth", "setMaxHeight", "setPadding"]) {
    let N2 = { [YGEnums.UNIT_POINT]: E2.Node.prototype[T2], [YGEnums.UNIT_PERCENT]: E2.Node.prototype[`${T2}Percent`], [YGEnums.UNIT_AUTO]: E2.Node.prototype[`${T2}Auto`] };
    _(E2.Node.prototype, T2, function(E3, ..._2) {
      let I, L;
      let O2 = _2.pop();
      if (O2 === "auto")
        I = YGEnums.UNIT_AUTO, L = void 0;
      else if (typeof O2 == "object")
        I = O2.unit, L = O2.valueOf();
      else if (I = typeof O2 == "string" && O2.endsWith("%") ? YGEnums.UNIT_PERCENT : YGEnums.UNIT_POINT, L = parseFloat(O2), !Number.isNaN(O2) && Number.isNaN(L))
        throw Error(`Invalid value ${O2} for ${T2}`);
      if (!N2[I])
        throw Error(`Failed to execute "${T2}": Unsupported unit '${O2}'`);
      return L !== void 0 ? N2[I].call(this, ..._2, L) : N2[I].call(this, ..._2);
    });
  }
  function T(_2) {
    return E2.MeasureCallback.implement({ measure: (...E3) => {
      let { width: T2, height: N2 } = _2(...E3);
      return { width: T2 ?? NaN, height: N2 ?? NaN };
    } });
  }
  function N(_2) {
    return E2.DirtiedCallback.implement({ dirtied: _2 });
  }
  return _(E2.Node.prototype, "setMeasureFunc", function(E3, _2) {
    return _2 ? E3.call(this, T(_2)) : this.unsetMeasureFunc();
  }), _(E2.Node.prototype, "setDirtiedFunc", function(E3, _2) {
    E3.call(this, N(_2));
  }), _(E2.Config.prototype, "free", function() {
    E2.Config.destroy(this);
  }), _(E2.Node, "create", (_2, T2) => T2 ? E2.Node.createWithConfig(T2) : E2.Node.createDefault()), _(E2.Node.prototype, "free", function() {
    E2.Node.destroy(this);
  }), _(E2.Node.prototype, "freeRecursive", function() {
    for (let E3 = 0, _2 = this.getChildCount(); E3 < _2; ++E3)
      this.getChild(0).freeRecursive();
    this.free();
  }), _(E2.Node.prototype, "calculateLayout", function(E3, _2 = NaN, T2 = NaN, N2 = YGEnums.DIRECTION_LTR) {
    return E3.call(this, _2, T2, N2);
  }), { Config: E2.Config, Node: E2.Node, ...YGEnums };
};

// node_modules/.pnpm/yoga-wasm-web@0.3.3/node_modules/yoga-wasm-web/dist/index.js
var yoga = (() => {
  var n = typeof document != "undefined" && document.currentScript ? document.currentScript.src : void 0;
  return function(t = {}) {
    u2 || (u2 = t !== void 0 ? t : {}), u2.ready = new Promise(function(n2, t2) {
      c2 = n2, f = t2;
    });
    var r, e, a = Object.assign({}, u2), i = "";
    typeof document != "undefined" && document.currentScript && (i = document.currentScript.src), n && (i = n), i = i.indexOf("blob:") !== 0 ? i.substr(0, i.replace(/[?#].*/, "").lastIndexOf("/") + 1) : "";
    var o = console.log.bind(console), s = console.warn.bind(console);
    Object.assign(u2, a), a = null, typeof WebAssembly != "object" && w2("no native wasm support detected");
    var u2, c2, f, l2, h2 = false;
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
    function v2() {
      var n2 = l2.buffer;
      u2.HEAP8 = d2 = new Int8Array(n2), u2.HEAP16 = m2 = new Int16Array(n2), u2.HEAP32 = g2 = new Int32Array(n2), u2.HEAPU8 = y = new Uint8Array(n2), u2.HEAPU16 = E2 = new Uint16Array(n2), u2.HEAPU32 = _ = new Uint32Array(n2), u2.HEAPF32 = T = new Float32Array(n2), u2.HEAPF64 = L = new Float64Array(n2);
    }
    var d2, y, m2, E2, g2, _, T, L, A, O2 = [], P2 = [], b = [], N = 0, I = null;
    function w2(n2) {
      throw s(n2 = "Aborted(" + n2 + ")"), h2 = true, f(n2 = new WebAssembly.RuntimeError(n2 + ". Build with -sASSERTIONS for more info.")), n2;
    }
    function S2() {
      return r.startsWith("data:application/octet-stream;base64,");
    }
    function R2() {
      try {
        throw "both async and sync fetching of the wasm failed";
      } catch (n2) {
        w2(n2);
      }
    }
    function C(n2) {
      for (; 0 < n2.length; )
        n2.shift()(u2);
    }
    function W(n2) {
      if (n2 === void 0)
        return "_unknown";
      var t2 = (n2 = n2.replace(/[^a-zA-Z0-9_]/g, "$")).charCodeAt(0);
      return 48 <= t2 && 57 >= t2 ? "_" + n2 : n2;
    }
    function U(n2, t2) {
      return n2 = W(n2), function() {
        return t2.apply(this, arguments);
      };
    }
    r = "yoga.wasm", S2() || (r = i + r);
    var M2 = [{}, { value: void 0 }, { value: null }, { value: true }, { value: false }], F = [];
    function D2(n2) {
      var t2 = Error, r2 = U(n2, function(t3) {
        this.name = n2, this.message = t3, (t3 = Error(t3).stack) !== void 0 && (this.stack = this.toString() + "\n" + t3.replace(/^Error(:[^\n]*)?\n/, ""));
      });
      return r2.prototype = Object.create(t2.prototype), r2.prototype.constructor = r2, r2.prototype.toString = function() {
        return this.message === void 0 ? this.name : this.name + ": " + this.message;
      }, r2;
    }
    var k2 = void 0;
    function V(n2) {
      throw new k2(n2);
    }
    var j = (n2) => (n2 || V("Cannot use deleted val. handle = " + n2), M2[n2].value), G = (n2) => {
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
          var t2 = F.length ? F.pop() : M2.length;
          return M2[t2] = { fa: 1, value: n2 }, t2;
      }
    }, Y = void 0, X = void 0;
    function B(n2) {
      for (var t2 = ""; y[n2]; )
        t2 += X[y[n2++]];
      return t2;
    }
    var H = [];
    function x2() {
      for (; H.length; ) {
        var n2 = H.pop();
        n2.L.Z = false, n2.delete();
      }
    }
    var z = void 0, $ = {};
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
    function K2(n2, t2) {
      var r2 = J[n2];
      return r2 === void 0 && V(t2 + " has unknown type " + q(n2)), r2;
    }
    function Q() {
    }
    var nn = false;
    function nt(n2) {
      --n2.count.value, n2.count.value === 0 && (n2.S ? n2.T.V(n2.S) : n2.O.M.V(n2.N));
    }
    var nr = {}, ne2 = void 0;
    function na(n2) {
      throw new ne2(n2);
    }
    function ni(n2, t2) {
      return t2.O && t2.N || na("makeClassHandle requires ptr and ptrType"), !!t2.T != !!t2.S && na("Both smartPtrType and smartPtr must be specified"), t2.count = { value: 1 }, no2(Object.create(n2, { L: { value: t2 } }));
    }
    function no2(n2) {
      return typeof FinalizationRegistry == "undefined" ? (no2 = (n3) => n3, n2) : (nn = new FinalizationRegistry((n3) => {
        nt(n3.L);
      }), no2 = (n3) => {
        var t2 = n3.L;
        return t2.S && nn.register(n3, { L: t2 }, n3), n3;
      }, Q = (n3) => {
        nn.unregister(n3);
      }, no2(n2));
    }
    var ns2 = {};
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
          var n3 = u2["dynCall_" + r2];
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
      var u3 = t2[0].name !== "void", c3 = i2 - 2, f2 = Array(c3), l3 = [], h3 = [];
      return function() {
        if (arguments.length !== c3 && V("function " + n2 + " called with " + arguments.length + " arguments, expected " + c3 + " args!"), h3.length = 0, l3.length = o2 ? 2 : 1, l3[0] = a2, o2) {
          var r3 = t2[1].toWireType(h3, this);
          l3[1] = r3;
        }
        for (var i3 = 0; i3 < c3; ++i3)
          f2[i3] = t2[i3 + 2].toWireType(h3, arguments[i3]), l3.push(f2[i3]);
        if (i3 = e2.apply(null, l3), s2)
          nu2(h3);
        else
          for (var p2 = o2 ? 1 : 2; p2 < t2.length; p2++) {
            var v3 = p2 === 1 ? r3 : f2[p2 - 2];
            t2[p2].U !== null && t2[p2].U(v3);
          }
        return u3 ? t2[0].fromWireType(i3) : void 0;
      };
    }
    function nS(n2, t2) {
      for (var r2 = [], e2 = 0; e2 < n2; e2++)
        r2.push(_[t2 + 4 * e2 >> 2]);
      return r2;
    }
    function nR(n2) {
      4 < n2 && --M2[n2].fa == 0 && (M2[n2] = void 0, F.push(n2));
    }
    function nC(n2) {
      if (n2 === null)
        return "null";
      var t2 = typeof n2;
      return t2 === "object" || t2 === "array" || t2 === "function" ? n2.toString() : "" + n2;
    }
    function nW(n2, t2) {
      for (var r2 = "", e2 = 0; !(e2 >= t2 / 2); ++e2) {
        var a2 = m2[n2 + 2 * e2 >> 1];
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
        m2[t2 >> 1] = n2.charCodeAt(a2), t2 += 2;
      return m2[t2 >> 1] = 0, t2 - e2;
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
    k2 = u2.BindingError = D2("BindingError"), u2.count_emval_handles = function() {
      for (var n2 = 0, t2 = 5; t2 < M2.length; ++t2)
        M2[t2] !== void 0 && ++n2;
      return n2;
    }, u2.get_first_emval = function() {
      for (var n2 = 5; n2 < M2.length; ++n2)
        if (M2[n2] !== void 0)
          return M2[n2];
      return null;
    }, Y = u2.PureVirtualError = D2("PureVirtualError");
    for (var nB = Array(256), nH = 0; 256 > nH; ++nH)
      nB[nH] = String.fromCharCode(nH);
    X = nB, u2.getInheritedInstanceCount = function() {
      return Object.keys($).length;
    }, u2.getLiveInheritedInstances = function() {
      var n2, t2 = [];
      for (n2 in $)
        $.hasOwnProperty(n2) && t2.push($[n2]);
      return t2;
    }, u2.flushPendingDeletes = x2, u2.setDelayFunction = function(n2) {
      z = n2, H.length && z && z(x2);
    }, ne2 = u2.InternalError = D2("InternalError"), ny.prototype.isAliasOf = function(n2) {
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
      return this.L.N || nd(this), this.L.Z && !this.L.$ && V("Object already scheduled for deletion"), H.push(this), H.length === 1 && z && z(x2), this.L.Z = true, this;
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
    }, nN = u2.UnboundTypeError = D2("UnboundTypeError");
    var nx = { q: function(n2, t2, r2) {
      n2 = B(n2), t2 = K2(t2, "wrapper"), r2 = j(r2);
      var e2 = [].slice, a2 = t2.M, i2 = a2.W, o2 = a2.P.W, s2 = a2.P.constructor;
      for (var u3 in n2 = U(n2, function() {
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
        n2.prototype[u3] = r2[u3];
      return G(n2);
    }, l: function(n2) {
      var t2 = ns2[n2];
      delete ns2[n2];
      var r2 = t2.ea, e2 = t2.V, a2 = t2.ha;
      nh([n2], a2.map((n3) => n3.sa).concat(a2.map((n3) => n3.ya)), (n3) => {
        var i2 = {};
        return a2.forEach((t3, r3) => {
          var e3 = n3[r3], o2 = t3.qa, s2 = t3.ra, u3 = n3[r3 + a2.length], c3 = t3.xa, f2 = t3.za;
          i2[t3.na] = { read: (n4) => e3.fromWireType(o2(s2, n4)), write: (n4, t4) => {
            var r4 = [];
            c3(f2, n4, u3.toWireType(r4, t4)), nu2(r4);
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
          var e3 = d2;
        else if (r2 === 2)
          e3 = m2;
        else if (r2 === 4)
          e3 = g2;
        else
          throw TypeError("Unknown boolean type size: " + t2);
        return this.fromWireType(e3[n3 >> i2]);
      }, U: null });
    }, h: function(n2, t2, r2, e2, a2, i2, o2, s2, c3, f2, l3, h3, p2) {
      l3 = B(l3), i2 = nb(a2, i2), s2 && (s2 = nb(o2, s2)), f2 && (f2 = nb(c3, f2)), p2 = nb(h3, p2);
      var v3, d3 = W(l3);
      v3 = function() {
        nI("Cannot construct " + l3 + " due to unbound types", [e2]);
      }, u2.hasOwnProperty(d3) ? (V("Cannot register public name '" + d3 + "' twice"), nm(u2, d3, d3), u2.hasOwnProperty(void 0) && V("Cannot register multiple overloads of a function with the same number of arguments (undefined)!"), u2[d3].R[void 0] = v3) : u2[d3] = v3, nh([n2, t2, r2], e2 ? [e2] : [], function(t3) {
        if (t3 = t3[0], e2)
          var r3, a3 = t3.M, o3 = a3.W;
        else
          o3 = ny.prototype;
        t3 = U(d3, function() {
          if (Object.getPrototypeOf(this) !== c4)
            throw new k2("Use 'new' to construct " + l3);
          if (h4.X === void 0)
            throw new k2(l3 + " has no accessible constructor");
          var n3 = h4.X[arguments.length];
          if (n3 === void 0)
            throw new k2("Tried to invoke ctor of " + l3 + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(h4.X).toString() + ") parameters instead!");
          return n3.apply(this, arguments);
        });
        var c4 = Object.create(o3, { constructor: { value: t3 } });
        t3.prototype = c4;
        var h4 = new nE(l3, t3, c4, p2, a3, i2, s2, f2);
        a3 = new nA(l3, h4, true, false), o3 = new nA(l3 + "*", h4, false, false);
        var v4 = new nA(l3 + " const*", h4, false, true);
        return nr[n2] = { pointerType: o3, ka: v4 }, r3 = t3, u2.hasOwnProperty(d3) || na("Replacing nonexistant public symbol"), u2[d3] = r3, u2[d3].Y = void 0, [a3, o3, v4];
      });
    }, d: function(n2, t2, r2, e2, a2, i2, o2) {
      var s2 = nS(r2, e2);
      t2 = B(t2), i2 = nb(a2, i2), nh([], [n2], function(n3) {
        function e3() {
          nI("Cannot call " + a3 + " due to unbound types", s2);
        }
        var a3 = (n3 = n3[0]).name + "." + t2;
        t2.startsWith("@@") && (t2 = Symbol[t2.substring(2)]);
        var u3 = n3.M.constructor;
        return u3[t2] === void 0 ? (e3.Y = r2 - 1, u3[t2] = e3) : (nm(u3, t2, a3), u3[t2].R[r2 - 1] = e3), nh([], s2, function(n4) {
          return n4 = nw(a3, [n4[0], null].concat(n4.slice(1)), null, i2, o2), u3[t2].R === void 0 ? (n4.Y = r2 - 1, u3[t2] = n4) : u3[t2].R[r2 - 1] = n4, [];
        }), [];
      });
    }, p: function(n2, t2, r2, e2, a2, i2) {
      0 < t2 || w2();
      var o2 = nS(t2, r2);
      a2 = nb(e2, a2), nh([], [n2], function(n3) {
        var r3 = "constructor " + (n3 = n3[0]).name;
        if (n3.M.X === void 0 && (n3.M.X = []), n3.M.X[t2 - 1] !== void 0)
          throw new k2("Cannot register multiple constructors with identical number of parameters (" + (t2 - 1) + ") for class '" + n3.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
        return n3.M.X[t2 - 1] = () => {
          nI("Cannot construct " + n3.name + " due to unbound types", o2);
        }, nh([], o2, function(e3) {
          return e3.splice(1, 0, null), n3.M.X[t2 - 1] = nw(r3, e3, null, a2, i2), [];
        }), [];
      });
    }, a: function(n2, t2, r2, e2, a2, i2, o2, s2) {
      var u3 = nS(r2, e2);
      t2 = B(t2), i2 = nb(a2, i2), nh([], [n2], function(n3) {
        function e3() {
          nI("Cannot call " + a3 + " due to unbound types", u3);
        }
        var a3 = (n3 = n3[0]).name + "." + t2;
        t2.startsWith("@@") && (t2 = Symbol[t2.substring(2)]), s2 && n3.M.ia.push(t2);
        var c3 = n3.M.W, f2 = c3[t2];
        return f2 === void 0 || f2.R === void 0 && f2.className !== n3.name && f2.Y === r2 - 2 ? (e3.Y = r2 - 2, e3.className = n3.name, c3[t2] = e3) : (nm(c3, t2, a3), c3[t2].R[r2 - 2] = e3), nh([], u3, function(e4) {
          return e4 = nw(a3, e4, n3, i2, o2), c3[t2].R === void 0 ? (e4.Y = r2 - 2, c3[t2] = e4) : c3[t2].R[r2 - 2] = e4, [];
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
              return this.fromWireType(T[n4 >> 2]);
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
              return d2[n4];
            } : function(n4) {
              return y[n4];
            };
          case 1:
            return r3 ? function(n4) {
              return m2[n4 >> 1];
            } : function(n4) {
              return E2[n4 >> 1];
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
              var u3 = t3.charCodeAt(s2);
              if (55296 <= u3 && 57343 >= u3 && (u3 = 65536 + ((1023 & u3) << 10) | 1023 & t3.charCodeAt(++s2)), 127 >= u3) {
                if (a2 >= o2)
                  break;
                e2[a2++] = u3;
              } else {
                if (2047 >= u3) {
                  if (a2 + 1 >= o2)
                    break;
                  e2[a2++] = 192 | u3 >> 6;
                } else {
                  if (65535 >= u3) {
                    if (a2 + 2 >= o2)
                      break;
                    e2[a2++] = 224 | u3 >> 12;
                  } else {
                    if (a2 + 3 >= o2)
                      break;
                    e2[a2++] = 240 | u3 >> 18, e2[a2++] = 128 | u3 >> 12 & 63;
                  }
                  e2[a2++] = 128 | u3 >> 6 & 63;
                }
                e2[a2++] = 128 | 63 & u3;
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
        var e2 = nW, a2 = nU, i2 = nM, o2 = () => E2, s2 = 1;
      else
        t2 === 4 && (e2 = nF, a2 = nD, i2 = nk, o2 = () => _, s2 = 2);
      nv(n2, { name: r2, fromWireType: function(n3) {
        for (var r3, a3 = _[n3 >> 2], i3 = o2(), u3 = n3 + 4, c3 = 0; c3 <= a3; ++c3) {
          var f2 = n3 + 4 + c3 * t2;
          (c3 == a3 || i3[f2 >> s2] == 0) && (u3 = e2(u3, f2 - u3), r3 === void 0 ? r3 = u3 : r3 += "\0" + u3, u3 = f2 + t2);
        }
        return nZ(n3), r3;
      }, toWireType: function(n3, e3) {
        typeof e3 != "string" && V("Cannot pass non-string to C++ string type " + r2);
        var o3 = i2(e3), u3 = n$(4 + o3 + t2);
        return _[u3 >> 2] = o3 >> s2, a2(e3, u3 + 4, o3 + t2), n3 !== null && n3.push(nZ, u3), u3;
      }, argPackAdvance: 8, readValueFromPointer: nc, U: function(n3) {
        nZ(n3);
      } });
    }, m: function(n2, t2, r2, e2, a2, i2) {
      ns2[n2] = { name: B(t2), ea: nb(r2, e2), V: nb(a2, i2), ha: [] };
    }, c: function(n2, t2, r2, e2, a2, i2, o2, s2, u3, c3) {
      ns2[n2].ha.push({ na: B(t2), sa: r2, qa: nb(e2, a2), ra: i2, ya: o2, xa: nb(s2, u3), za: c3 });
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
          r3[e3] = K2(_[t3 + 4 * e3 >> 2], "parameter " + e3);
        return r3;
      }(n2, t2), i2 = a2[0], o2 = nY[t2 = i2.name + "_$" + a2.slice(1).map(function(n3) {
        return n3.name;
      }).join("_") + "$"];
      if (o2 !== void 0)
        return o2;
      var s2 = Array(n2 - 1);
      return r2 = (t3, r3, e3, o3) => {
        for (var u3 = 0, c3 = 0; c3 < n2 - 1; ++c3)
          s2[c3] = a2[c3 + 1].readValueFromPointer(o3 + u3), u3 += a2[c3 + 1].argPackAdvance;
        for (c3 = 0, t3 = t3[r3].apply(t3, s2); c3 < n2 - 1; ++c3)
          a2[c3 + 1].la && a2[c3 + 1].la(s2[c3]);
        if (!i2.ua)
          return i2.toWireType(e3, t3);
      }, e2 = nG.length, nG.push(r2), o2 = e2, nY[t2] = o2;
    }, r: function(n2) {
      4 < n2 && (M2[n2].fa += 1);
    }, s: function(n2) {
      nu2(j(n2)), nR(n2);
    }, i: function() {
      w2("");
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
          var o2 = l2.buffer;
          try {
            l2.grow(i2.call(a2, 2147483648, e2) - o2.byteLength + 65535 >>> 16), v2();
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
        var u3 = _[t2 >> 2], c3 = _[t2 + 4 >> 2];
        t2 += 8;
        for (var f2 = 0; f2 < c3; f2++) {
          var l3 = y[u3 + f2], h3 = nX[n2];
          l3 === 0 || l3 === 10 ? ((n2 === 1 ? o : s)(p(h3, 0)), h3.length = 0) : h3.push(l3);
        }
        a2 += c3;
      }
      return _[e2 >> 2] = a2, 0;
    } };
    !function() {
      function n2(n3) {
        u2.asm = n3.exports, l2 = u2.asm.D, v2(), A = u2.asm.I, P2.unshift(u2.asm.E), --N == 0 && I && (n3 = I, I = null, n3());
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
          return R2();
        }) : Promise.resolve().then(function() {
          return R2();
        })).then(function(n4) {
          return WebAssembly.instantiate(n4, a2);
        }).then(function(n4) {
          return n4;
        }).then(n3, function(n4) {
          s("failed to asynchronously prepare wasm: " + n4), w2(n4);
        });
      }
      var a2 = { a: nx };
      if (N++, u2.instantiateWasm)
        try {
          return u2.instantiateWasm(a2, n2);
        } catch (n3) {
          s("Module.instantiateWasm callback failed with error: " + n3), f(n3);
        }
      (typeof WebAssembly.instantiateStreaming != "function" || S2() || typeof fetch != "function" ? e2(t2) : fetch(r, { credentials: "same-origin" }).then(function(n3) {
        return WebAssembly.instantiateStreaming(n3, a2).then(t2, function(n4) {
          return s("wasm streaming compile failed: " + n4), s("falling back to ArrayBuffer instantiation"), e2(t2);
        });
      })).catch(f);
    }();
    var nz = u2.___getTypeName = function() {
      return (nz = u2.___getTypeName = u2.asm.F).apply(null, arguments);
    };
    function n$() {
      return (n$ = u2.asm.H).apply(null, arguments);
    }
    function nZ() {
      return (nZ = u2.asm.J).apply(null, arguments);
    }
    function nJ() {
      0 < N || (C(O2), 0 < N || e || (e = true, u2.calledRun = true, h2 || (C(P2), c2(u2), C(b))));
    }
    return u2.__embind_initialize_bindings = function() {
      return (u2.__embind_initialize_bindings = u2.asm.G).apply(null, arguments);
    }, u2.dynCall_jiji = function() {
      return (u2.dynCall_jiji = u2.asm.K).apply(null, arguments);
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

// src/index.node.ts
import { Readable } from "stream";
import fs from "fs";
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
      const fontData2 = await Promise.all(fonts.map((font) => loadGoogleFont(font, textByFont[font])));
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
async function render(satori2, resvg, opts, defaultFonts, element) {
  const options = Object.assign({
    width: 1200,
    height: 630,
    debug: false
  }, opts);
  const svg = await satori2(element, {
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
  const pngData = resvgJS.render();
  const pngBuffer = pngData.asPng();
  pngData.free();
  resvgJS.free();
  return pngBuffer;
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
  const x2 = ((_g = svgText.match(/<tspan[^>]*x="([^"]*)"/)) == null ? void 0 : _g[1]) || "";
  const y = ((_h = svgText.match(/<tspan[^>]*y="([^"]*)"/)) == null ? void 0 : _h[1]) || "";
  const content = ((_i = svgText.match(/<tspan[^>]*>([^<]*)<\/tspan>/)) == null ? void 0 : _i[1]) || "";
  return {
    id,
    fill,
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    x: x2,
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
function assertValue(v2, errorMessage) {
  if (v2 === void 0) {
    throw new Error(errorMessage);
  }
  return v2;
}

// src/index.node.ts
var satori = El.default || El;
var fontData = fs.readFileSync(fileURLToPath(new URL("./noto-sans-v27-latin-regular.ttf", import.meta.url)));
var yoga_wasm = fs.readFileSync(fileURLToPath(new URL("./yoga.wasm", import.meta.url)));
var resvg_wasm = fs.readFileSync(fileURLToPath(new URL("./resvg.wasm", import.meta.url)));
var initializedResvg = initWasm(resvg_wasm);
var initializedYoga = initYoga(yoga_wasm).then((yoga2) => Ll(yoga2));
var ImageResponse = class extends Response {
  constructor(element, options = {}) {
    if (typeof Response === "undefined" || typeof ReadableStream === "undefined") {
      throw new Error("The `ImageResponse` API is not supported in this runtime, use the `unstable_createNodejsStream` API instead or switch to the Vercel Edge Runtime.");
    }
    const result = new ReadableStream({
      async start(controller) {
        await initializedYoga;
        await initializedResvg;
        const fonts = [
          {
            name: "sans serif",
            data: fontData,
            weight: 700,
            style: "normal"
          }
        ];
        const result2 = await render(satori, resvg_wasm_exports, options, fonts, element);
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
  await initializedYoga;
  await initializedResvg;
  const fonts = [
    {
      name: "sans serif",
      data: fontData,
      weight: 700,
      style: "normal"
    }
  ];
  const result = await render(satori, resvg_wasm_exports, options, fonts, element);
  return Readable.from(Buffer.from(result));
}
var experimental_FigmaImageResponse = async (props) => {
  return FigmaImageResponse({ ...props, Response: ImageResponse });
};
export {
  ImageResponse,
  experimental_FigmaImageResponse,
  unstable_createNodejsStream
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
//# sourceMappingURL=index.node.js.map