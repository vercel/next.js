module.exports = {
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
        condition: {
          path: /abc/,
        },
      },
    },
  },
};
