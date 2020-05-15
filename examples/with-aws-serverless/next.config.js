const withImages = require('next-images');
const serverEnv = process.env.SERVER_ENV || 'local';

module.exports = withImages({
  inlineImageLimit: 8 * 1024,
  env : {
    SERVER_ENV: serverEnv,
  },
  serverRuntimeConfig: {
    PROJECT_ROOT: __dirname
  }
});
