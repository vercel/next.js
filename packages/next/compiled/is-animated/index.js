module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 713:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var gif = __webpack_require__(641)
var png = __webpack_require__(751)
var webp = __webpack_require__(120)

/**
 * Checks if buffer contains animated image
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isAnimated (buffer) {
  if (gif.isGIF(buffer)) {
    return gif.isAnimated(buffer)
  }

  if (png.isPNG(buffer)) {
    return png.isAnimated(buffer)
  }

  if (webp.isWebp(buffer)) {
    return webp.isAnimated(buffer)
  }

  return false
}

module.exports = isAnimated


/***/ }),

/***/ 641:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


/**
 * Returns total length of data blocks sequence
 *
 * @param {Buffer} buffer
 * @param {number} offset
 * @returns {number}
 */
function getDataBlocksLength (buffer, offset) {
  var length = 0

  while (buffer[offset + length]) {
    length += buffer[offset + length] + 1
  }

  return length + 1
}

/**
 * Checks if buffer contains GIF image
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
exports.isGIF = function (buffer) {
  var header = buffer.slice(0, 3).toString('ascii')
  return (header === 'GIF')
}

/**
 * Checks if buffer contains animated GIF image
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
exports.isAnimated = function (buffer) {
  var hasColorTable, colorTableSize, header
  var offset = 0
  var imagesCount = 0

  // Check if this is this image has valid GIF header.
  // If not return false. Chrome, FF and IE doesn't handle GIFs with invalid version.
  header = buffer.slice(0, 3).toString('ascii')

  if (header !== 'GIF') {
    return false
  }

  // Skip header, logical screen descriptor and global color table

  hasColorTable = buffer[10] & 0x80 // 0b10000000
  colorTableSize = buffer[10] & 0x07 // 0b00000111

  offset += 6 // skip header
  offset += 7 // skip logical screen descriptor
  offset += hasColorTable ? 3 * Math.pow(2, colorTableSize + 1) : 0 // skip global color table

  // Find if there is more than one image descriptor

  while (imagesCount < 2 && offset < buffer.length) {
    switch (buffer[offset]) {
      // Image descriptor block. According to specification there could be any
      // number of these blocks (even zero). When there is more than one image
      // descriptor browsers will display animation (they shouldn't when there
      // is no delays defined, but they do it anyway).
      case 0x2C:
        imagesCount += 1

        hasColorTable = buffer[offset + 9] & 0x80 // 0b10000000
        colorTableSize = buffer[offset + 9] & 0x07 // 0b00000111

        offset += 10 // skip image descriptor
        offset += hasColorTable ? 3 * Math.pow(2, colorTableSize + 1) : 0 // skip local color table
        offset += getDataBlocksLength(buffer, offset + 1) + 1 // skip image data

        break

      // Skip all extension blocks. In theory this "plain text extension" blocks
      // could be frames of animation, but no browser renders them.
      case 0x21:
        offset += 2 // skip introducer and label
        offset += getDataBlocksLength(buffer, offset) // skip this block and following data blocks

        break

      // Stop processing on trailer block,
      // all data after this point will is ignored by decoders
      case 0x3B:
        offset = buffer.length // fast forward to end of buffer
        break

      // Oops! This GIF seems to be invalid
      default:
        offset = buffer.length // fast forward to end of buffer
        break
    }
  }

  return (imagesCount > 1)
}


/***/ }),

/***/ 751:
/***/ ((__unused_webpack_module, exports) => {

exports.isPNG = function (buffer) {
  var header = buffer.slice(0, 8).toString('hex')
  return (header === '89504e470d0a1a0a') // \211 P N G \r \n \032 'n
}

exports.isAnimated = function (buffer) {
  var hasACTL = false
  var hasIDAT = false
  var hasFDAT = false

  var previousChunkType = null

  var offset = 8

  while (offset < buffer.length) {
    var chunkLength = buffer.readUInt32BE(offset)
    var chunkType = buffer.slice(offset + 4, offset + 8).toString('ascii')

    switch (chunkType) {
      case 'acTL':
        hasACTL = true
        break
      case 'IDAT':
        if (!hasACTL) {
          return false
        }

        if (previousChunkType !== 'fcTL') {
          return false
        }

        hasIDAT = true
        break
      case 'fdAT':
        if (!hasIDAT) {
          return false
        }

        if (previousChunkType !== 'fcTL') {
          return false
        }

        hasFDAT = true
        break
    }

    previousChunkType = chunkType
    offset += 4 + 4 + chunkLength + 4
  }

  return (hasACTL && hasIDAT && hasFDAT)
}


/***/ }),

/***/ 120:
/***/ ((__unused_webpack_module, exports) => {

/**
 * @since 2019-02-27 10:20
 * @author vivaxy
 */

exports.isWebp = function (buffer) {
  var WEBP = [0x57, 0x45, 0x42, 0x50]
  for (var i = 0; i < WEBP.length; i++) {
    if (buffer[i + 8] !== WEBP[i]) {
      return false
    }
  }
  return true
}

exports.isAnimated = function (buffer) {
  var ANIM = [0x41, 0x4E, 0x49, 0x4D]
  for (var i = 0; i < buffer.length; i++) {
    for (var j = 0; j < ANIM.length; j++) {
      if (buffer[i + j] !== ANIM[j]) {
        break
      }
    }
    if (j === ANIM.length) {
      return true
    }
  }
  return false
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(__webpack_module_cache__[moduleId]) {
/******/ 			return __webpack_module_cache__[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__webpack_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(713);
/******/ })()
;