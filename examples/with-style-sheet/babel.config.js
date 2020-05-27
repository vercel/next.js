const path = require('path')

module.exports = {
  presets: [
    [
      'next/babel',
      {
        'preset-react': {
          pragma: 'createElement',
        },
      },
    ],
  ],
  plugins: [
    [
      'style-sheet/babel',
      {
        stylePropName: 'css',
        stylePropPackageName: path.resolve('./lib/styleSheet.js'),
      },
    ],
  ],
}
