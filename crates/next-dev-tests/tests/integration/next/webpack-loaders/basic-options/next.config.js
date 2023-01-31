module.exports = {
  experimental: {
    turbopackLoaders: {
      ".replace": [{ loader: "replace-loader", options: { defaultExport: 3 } }],
    },
  },
};
