import type { NextConfig } from 'next'

const rules = {
  '*.requestgen': { loaders: ['./loaders/generate.cjs'], as: '*.js' },
  '*.configured.js': { loaders: ['./loaders/configured.cjs'] },
  '*.pitch-request': {
    loaders: [
      './loaders/pitch.cjs',
      { loader: './loaders/value.cjs', options: { label: '#fff' } },
    ],
    as: '*.js',
  },
  '*.pitch-string-request': {
    loaders: ['./loaders/pitch.cjs', './loaders/value.cjs?label=before#after'],
    as: '*.js',
  },
  '*.string-style': {
    loaders: [
      'to-string-loader',
      { loader: 'css-loader', options: { esModule: false, modules: false } },
    ],
    as: '*.js',
  },
  '*.browser-style': {
    loaders: [
      'style-loader',
      { loader: 'css-loader', options: { modules: false } },
    ],
    as: '*.js',
  },
  '*.global-script': { loaders: ['script-loader'], as: '*.js' },
  '*.exposed': {
    loaders: [
      { loader: 'expose-loader', options: { exposes: 'inlineLoaderExposed' } },
    ],
    as: '*.js',
  },
  '*.isomorphic-style': {
    loaders: [
      'isomorphic-style-loader',
      { loader: 'css-loader', options: { esModule: false, modules: false } },
    ],
    as: '*.js',
  },
  '*.universal-style': {
    loaders: [
      'universal-style-loader',
      {
        loader: 'css-loader',
        options: { esModule: false, modules: false, exportType: 'string' },
      },
    ],
    as: '*.js',
  },
  '*.web-component-style': {
    loaders: [
      'react-web-component-style-loader',
      {
        loader: 'css-loader',
        options: { esModule: false, modules: false, sourceMap: false },
      },
    ],
    as: '*.js',
  },
  '*.hot-style': {
    loaders: [
      'css-hot-loader',
      {
        loader: 'css-loader',
        options: { esModule: false, modules: false, exportType: 'string' },
      },
    ],
    as: '*.js',
  },
}

const nextConfig: NextConfig = {
  serverExternalPackages: ['to-string-loader'],
  turbopack: { rules },
  webpack(config) {
    for (const [glob, rule] of Object.entries(rules)) {
      config.module.rules.push({
        test: new RegExp(glob.replace('*', '').replaceAll('.', '\\.') + '$'),
        type: 'javascript/auto',
        use: rule.loaders,
      })
    }
    return config
  },
}

export default nextConfig
