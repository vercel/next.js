import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, options) => {
    if (!options.isServer) {
      config.plugins.push(
        new MonacoWebpackPlugin({
          // you can add other languages here as needed
          // (list of languages: https://github.com/microsoft/monaco-editor/tree/main/src/basic-languages)
          languages: ['javascript', 'typescript', 'php', 'python'],
          filename: 'static/[name].worker.[contenthash].js',
        })
      )
    }
    return config
  },
}

export default nextConfig
