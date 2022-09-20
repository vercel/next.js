const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

module.exports = {
  mode: "development",
  resolve: {
    extensions: [".jsx", "..."],
  },
  module: {
    unsafeCache: true,
    rules: [
      {
        test: /\.jsx$/,
        loader: "swc-loader",
        options: {
          jsc: {
            parser: {
              syntax: "ecmascript",
              jsx: true,
              dynamicImport: true,
              privateMethod: true,
              functionBind: true,
              classPrivateProperty: true,
              exportDefaultFrom: true,
              exportNamespaceFrom: true,
              decorators: true,
              decoratorsBeforeExport: true,
              importMeta: true,
            },
            externalHelpers: true,
            transform: {
              react: {
                runtime: "automatic",
                refresh: true,
              },
            },
          },
        },
      },
    ],
  },
  devServer: {
    hot: true,
  },
  cache: {
    type: "filesystem",
  },
  node: {
    global: true,
  },
  experiments: {
    futureDefaults: true,
  },
  plugins: [new ReactRefreshWebpackPlugin()],
};
