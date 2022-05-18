const withMarkdoc = require('@markdoc/next.js');

module.exports = withMarkdoc(/* config: https://markdoc.io/docs/nextjs#options */)({
  pageExtensions: ['js', 'md', 'mdoc']
});
