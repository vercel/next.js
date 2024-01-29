/**
 * @param {import('next').NextConfig} nextConfig
 */
const graphqlPlugin = (nextConfig = {}) => {
  return Object.assign({}, nextConfig, {
    webpack: (config, options) => {
      config.module.rules.push({
        test: /\.graphql$/,
        exclude: /node_modules/,
        use: [options.defaultLoaders.babel, { loader: "graphql-let/loader" }],
      });

      config.module.rules.push({
        test: /\.graphqls$/,
        exclude: /node_modules/,
        use: ["graphql-let/schema/loader"],
      });

      config.module.rules.push({
        test: /\.ya?ml$/,
        type: "json",
        use: "yaml-loader",
      });

      // Overload the Webpack config if it was already overloaded
      if (typeof nextConfig.webpack === "function") {
        return nextConfig.webpack(config, options);
      }

      return config;
    },
  });
};

module.exports = graphqlPlugin;
