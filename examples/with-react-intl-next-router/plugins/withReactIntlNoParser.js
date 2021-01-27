module.exports = function withReactIntlNoParser() {
  return function (nextConfig) {
    return {
      ...nextConfig,
      webpack: (config, options) => {
        if (!config.resolve.alias) {
          config.resolve.alias = {};
        }

        config.resolve.alias['react-intl'] =
          'react-intl/react-intl-no-parser.umd';

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options);
        }

        return config;
      },
    };
  };
};
