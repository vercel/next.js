module.exports = {
  'presets': [
    ['@babel/preset-env', {
      targets: {
        node: 8
      }
    }],
    '@babel/preset-react',
    '@babel/preset-flow'
  ],
  'plugins': [
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
    // ['@babel/plugin-transform-runtime', {
    //   'corejs': 2
    // }],
    ['babel-plugin-transform-define', {
      'process.env.NEXT_VERSION': require('./package.json').version
    }]
  ]
}
