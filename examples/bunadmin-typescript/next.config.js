const path = require("path")
const bunadminPlugin = require("@bunred/bunadmin/plugin")

module.exports = () => {
  return {
    poweredByHeader: false,
    generateBuildId: async () => {
      return "bunadmin-" + require("./package.json").version
    },
    webpack: (config, { isServer }) => {
      /**
       * fix npm packages that depend on `fs` module
       */
      if (!isServer) {
        config.node = {
          fs: "empty"
        }
      } else {
        const modulesPath = path.resolve(__dirname, "./node_modules")
        const dynamicPath = path.resolve(__dirname, "./.bunadmin/dynamic")
        const pluginsPath = path.resolve(__dirname, "./plugins")
        bunadminPlugin({ modulesPath, dynamicPath, pluginsPath })
      }
      /**
       * ignore
       */
      config.module.rules.push({
        test: /\.md$|LICENSE$|\.yml$|\.lock$|\.jpg$/,
        use: [{ loader: "ignore-loader" }]
      })

      return config
    }
  }
}
