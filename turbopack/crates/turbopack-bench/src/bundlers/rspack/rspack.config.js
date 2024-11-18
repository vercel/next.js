const path = require("path");

module.exports = {
  entry: {
    main: "./src/index.jsx",
  },
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    port: 0,
  },
};
