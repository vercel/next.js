const path = require('path')
module.exports = {
  plugins: [
    'tailwindcss',
    [
      '@fullhuman/postcss-purgecss',
      {
        content: [path.join(__dirname, './pages/**/*.{js,jsx,ts,tsx}')],
        defaultExtractor: content => content.match(/[A-Za-z0-9-_:/]+/g) || [],
      },
    ],
  ],
}
