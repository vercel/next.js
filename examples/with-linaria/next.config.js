const withLinaria = require('next-with-linaria');

/** @type {import('next-with-linaria').LinariaConfig} */
const config = {
  experimental: {
    appDir: true,
  },
};
module.exports = withLinaria(config);