const withSass = require('@zeit/next-sass')
const resourcesLoader = {
  loader: 'sass-resources-loader',
  options: {
    resources: ['./styles/colors.scss'], // place your global imports here
  },
}
module.exports = withSass({
  webpack: (config, options) => {
    config.module.rules.map(rule => {
      if (
        rule.test.source.includes('scss') ||
        rule.test.source.includes('sass')
      ) {
        rule.use.push(resourcesLoader)
      }
    })
    return config
  },
})
