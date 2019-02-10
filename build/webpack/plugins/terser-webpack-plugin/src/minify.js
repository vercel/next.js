/* eslint-disable
  arrow-body-style
*/
import { minify as terserMinify } from 'terser';

const buildTerserOptions = ({
  ecma,
  warnings,
  parse = {},
  compress = {},
  mangle,
  module,
  output,
  toplevel,
  nameCache,
  ie8,
  /* eslint-disable camelcase */
  keep_classnames,
  keep_fnames,
  /* eslint-enable camelcase */
  safari10,
} = {}) => ({
  ecma,
  warnings,
  parse: { ...parse },
  compress: typeof compress === 'boolean' ? compress : { ...compress },
  // eslint-disable-next-line no-nested-ternary
  mangle:
    mangle == null
      ? true
      : typeof mangle === 'boolean'
      ? mangle
      : { ...mangle },
  output: {
    shebang: true,
    comments: false,
    beautify: false,
    semicolons: true,
    ...output,
  },
  module,
  // Ignoring sourceMap from options
  sourceMap: null,
  toplevel,
  nameCache,
  ie8,
  keep_classnames,
  keep_fnames,
  safari10,
});

const buildComments = (options, terserOptions, extractedComments) => {
  const condition = {};
  const commentsOpts = terserOptions.output.comments;

  // Use /^\**!|@preserve|@license|@cc_on/i RegExp
  if (typeof options.extractComments === 'boolean') {
    condition.preserve = commentsOpts;
    condition.extract = /^\**!|@preserve|@license|@cc_on/i;
  } else if (
    typeof options.extractComments === 'string' ||
    options.extractComments instanceof RegExp
  ) {
    // extractComments specifies the extract condition and commentsOpts specifies the preserve condition
    condition.preserve = commentsOpts;
    condition.extract = options.extractComments;
  } else if (typeof options.extractComments === 'function') {
    condition.preserve = commentsOpts;
    condition.extract = options.extractComments;
  } else if (
    Object.prototype.hasOwnProperty.call(options.extractComments, 'condition')
  ) {
    // Extract condition is given in extractComments.condition
    condition.preserve = commentsOpts;
    condition.extract = options.extractComments.condition;
  } else {
    // No extract condition is given. Extract comments that match commentsOpts instead of preserving them
    condition.preserve = false;
    condition.extract = commentsOpts;
  }

  // Ensure that both conditions are functions
  ['preserve', 'extract'].forEach((key) => {
    let regexStr;
    let regex;

    switch (typeof condition[key]) {
      case 'boolean':
        condition[key] = condition[key] ? () => true : () => false;

        break;
      case 'function':
        break;
      case 'string':
        if (condition[key] === 'all') {
          condition[key] = () => true;

          break;
        }

        if (condition[key] === 'some') {
          condition[key] = (astNode, comment) => {
            return (
              comment.type === 'comment2' &&
              /^\**!|@preserve|@license|@cc_on/i.test(comment.value)
            );
          };

          break;
        }

        regexStr = condition[key];

        condition[key] = (astNode, comment) => {
          return new RegExp(regexStr).test(comment.value);
        };

        break;
      default:
        regex = condition[key];

        condition[key] = (astNode, comment) => regex.test(comment.value);
    }
  });

  // Redefine the comments function to extract and preserve
  // comments according to the two conditions
  return (astNode, comment) => {
    if (condition.extract(astNode, comment)) {
      const commentText =
        comment.type === 'comment2'
          ? `/*${comment.value}*/`
          : `//${comment.value}`;

      // Don't include duplicate comments
      if (!extractedComments.includes(commentText)) {
        extractedComments.push(commentText);
      }
    }

    return condition.preserve(astNode, comment);
  };
};

const minify = (options) => {
  const {
    file,
    input,
    inputSourceMap,
    extractComments,
    minify: minifyFn,
  } = options;

  if (minifyFn) {
    return minifyFn({ [file]: input }, inputSourceMap);
  }

  // Copy terser options
  const terserOptions = buildTerserOptions(options.terserOptions);

  // Add source map data
  if (inputSourceMap) {
    terserOptions.sourceMap = {
      content: inputSourceMap,
    };
  }

  const extractedComments = [];

  if (extractComments) {
    terserOptions.output.comments = buildComments(
      options,
      terserOptions,
      extractedComments
    );
  }

  const { error, map, code, warnings } = terserMinify(
    { [file]: input },
    terserOptions
  );

  return { error, map, code, warnings, extractedComments };
};

export default minify;
