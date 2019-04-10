const withMDX = require("@zeit/next-mdx")({
  extension: /.mdx?$/,
  options: {
    // hastPlugins: [require("@mapbox/rehype-prism")]
    hastPlugins: [require("./mdx-prism/index")]
    // mdPlugins: [require("gatsby-remark-prismjs")]
  }
});

module.exports = withMDX({
  target: "serverless",
  pageExtensions: ["js", "jsx", "mdx", "md"],
  webpack: (config, { defaultLoaders }) => {
    // Fixes npm packages that depend on `fs` module
    config.node = {
      fs: "empty"
    };

    config.module.rules.push({
      test: /\.css$/,
      use: [
        defaultLoaders.babel,
        {
          loader: require("styled-jsx/webpack").loader,
          options: {
            type: "global"
          }
        }
      ]
    });

    return config;
  }
});
