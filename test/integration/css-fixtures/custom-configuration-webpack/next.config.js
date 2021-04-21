module.exports = {
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  webpack(config) {
    modifyLoaderConfig(
      config.module.rules,
      [/(?<!\.module)\.css$/, /\.module\.css$/],
      (rule) => {
        if (!Array.isArray(rule.use)) return
        rule.use.forEach((u) => {
          if (u.options.postcssOptions) {
            u.options.postcssOptions.plugins = [
              require('postcss-short-size')({
                // Add a prefix to test that configuration is passed
                prefix: 'xyz',
              }),
            ]
          }
        })
      }
    )

    return config
  },
  future: { strictPostcssConfiguration: true },
}

function modifyLoaderConfig(rules, regexes, cb) {
  rules.forEach((rule) => {
    if (rule.oneOf) return modifyLoaderConfig(rule.oneOf, regexes, cb)
    regexes.forEach((regex) => {
      if (rule.test && rule.test.toString() === regex.toString()) cb(rule)
    })
  })
}
