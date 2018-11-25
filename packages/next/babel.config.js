module.exports = {
  'presets': [
    '@babel/preset-env',
    '@babel/preset-react'
  ],
  'plugins': [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
    ['@babel/plugin-transform-runtime', {
      'corejs': 2
    }],
    ['babel-plugin-transform-define', {
      'process.env.NEXT_VERSION': require('./package.json').version
    }]
  ]
}
