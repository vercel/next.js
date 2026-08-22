const fontFileUrl = process.env.NEXT_FONT_GOOGLE_TEST_FONT_FILE_URL

if (!fontFileUrl) {
  throw new Error('NEXT_FONT_GOOGLE_TEST_FONT_FILE_URL is not set')
}

module.exports = {
  'https://fonts.googleapis.com/css2?family=Bitter:wght@400&display=swap': `
@font-face {
  font-family: 'Bitter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${fontFileUrl}) format('woff2');
  unicode-range: U+0000-00FF;
}
  `,
}
