/*
 * MIT License http://opensource.org/licenses/MIT
 * Author: Ben Holloway @bholloway
 */
'use strict';

var os      = require('os'),
    path    = require('path'),
    postcss = require('postcss');

var fileProtocol = require('../file-protocol');

var ORPHAN_CR_REGEX = /\r(?!\n)(.|\n)?/g;

/**
 * Process the given CSS content into reworked CSS content.
 *
 * @param {string} sourceFile The absolute path of the file being processed
 * @param {string} sourceContent CSS content without source-map
 * @param {{outputSourceMap: boolean, transformDeclaration:function, absSourceMap:object,
 *        sourceMapConsumer:object, removeCR:boolean}} params Named parameters
 * @return {{content: string, map: object}} Reworked CSS and optional source-map
 */
function process(sourceFile, sourceContent, params) {
  // #107 libsass emits orphan CR not considered newline, postcss does consider newline (content vs source-map mismatch)
  var correctedContent = params.removeCR && (os.EOL !== '\r') ?
    sourceContent.replace(ORPHAN_CR_REGEX, ' $1') :
    sourceContent;

  // prepend file protocol to all sources to avoid problems with source map
  return postcss([
    postcss.plugin('postcss-resolve-url', postcssPlugin)
  ])
    .process(correctedContent, {
      from: fileProtocol.prepend(sourceFile),
      map : params.outputSourceMap && {
        prev          : !!params.absSourceMap && fileProtocol.prepend(params.absSourceMap),
        inline        : false,
        annotation    : false,
        sourcesContent: true  // #98 sourcesContent missing from output map
      }
    })
    .then(result => ({
      content: result.css,
      map    : params.outputSourceMap ? fileProtocol.remove(result.map.toJSON()) : null
    }));

  /**
   * Plugin for postcss that follows SASS transpilation.
   */
  function postcssPlugin() {
    return function(styles) {
      styles.walkDecls(eachDeclaration);
    };

    /**
     * Process a declaration from the syntax tree.
     * @param declaration
     */
    function eachDeclaration(declaration) {
      var isValid = declaration.value && (declaration.value.indexOf('url') >= 0);
      if (isValid) {

        // reverse the original source-map to find the original source file before transpilation
        var startPosApparent = declaration.source.start,
            startPosOriginal = params.sourceMapConsumer &&
              params.sourceMapConsumer.originalPositionFor(startPosApparent);

        // we require a valid directory for the specified file
        var directory =
          startPosOriginal &&
          startPosOriginal.source &&
          fileProtocol.remove(path.dirname(startPosOriginal.source));
        if (directory) {
          declaration.value = params.transformDeclaration(declaration.value, directory);
        }
        // source-map present but invalid entry
        else if (params.sourceMapConsumer) {
          throw new Error(
            'source-map information is not available at url() declaration ' +
            (ORPHAN_CR_REGEX.test(sourceContent) ? '(found orphan CR, try removeCR option)' : '(no orphan CR found)')
          );
        }
      }
    }
  }
}

module.exports = process;
