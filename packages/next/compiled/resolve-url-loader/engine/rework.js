/*
 * MIT License http://opensource.org/licenses/MIT
 * Author: Ben Holloway @bholloway
 */
'use strict';

var path    = require('path'),
    convert = require('convert-source-map'),
    rework  = require('rework'),
    visit   = require('rework-visit');

var fileProtocol = require('../file-protocol');

/**
 * Process the given CSS content into reworked CSS content.
 *
 * @param {string} sourceFile The absolute path of the file being processed
 * @param {string} sourceContent CSS content without source-map
 * @param {{outputSourceMap: boolean, transformDeclaration:function, absSourceMap:object,
 *        sourceMapConsumer:object}} params Named parameters
 * @return {{content: string, map: object}} Reworked CSS and optional source-map
 */
function process(sourceFile, sourceContent, params) {

  // embed source-map in css
  //  prepend file protocol to all sources to avoid problems with source map
  var contentWithMap = sourceContent + (
    params.absSourceMap ?
      convert.fromObject(fileProtocol.prepend(params.absSourceMap)).toComment({multiline: true}) :
      ''
  );

  // need to prepend file protocol to source as well to avoid problems with source map
  var reworked = rework(contentWithMap, {source: fileProtocol.prepend(sourceFile)})
    .use(reworkPlugin)
    .toString({
      sourcemap        : params.outputSourceMap,
      sourcemapAsObject: params.outputSourceMap
    });

  // complete with source-map
  if (params.outputSourceMap) {
    return {
      content: reworked.code,
      map    : fileProtocol.remove(reworked.map)
    };
  }
  // complete without source-map
  else {
    return {
      content: reworked,
      map    : null
    };
  }

  /**
   * Plugin for css rework that follows SASS transpilation.
   *
   * @param {object} stylesheet AST for the CSS output from SASS
   */
  function reworkPlugin(stylesheet) {

    // visit each node (selector) in the stylesheet recursively using the official utility method
    //  each node may have multiple declarations
    visit(stylesheet, function visitor(declarations) {
      if (declarations) {
        declarations.forEach(eachDeclaration);
      }
    });

    /**
     * Process a declaration from the syntax tree.
     * @param declaration
     */
    function eachDeclaration(declaration) {
      var isValid = declaration.value && (declaration.value.indexOf('url') >= 0);
      if (isValid) {

        // reverse the original source-map to find the original source file before transpilation
        var startPosApparent = declaration.position.start,
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
          throw new Error('source-map information is not available at url() declaration');
        }
      }
    }
  }
}

module.exports = process;
