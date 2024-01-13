module.exports = {
  experimental: {
    turbo: {
      rules: {
        "*.react.svg": {
          loaders: ["@svgr/webpack"],
          as: "*.js",
        },
        "*.styl": {
          loaders: ["stylus-loader"],
          as: "*.css",
        },
      },
    },
  },
};
