const path = require('path');

module.exports = {
  experimental: {
    sassOptions: {
      includePaths: [
        path.resolve(__dirname, 'node_modules'),
      ],
    },
  },
};
