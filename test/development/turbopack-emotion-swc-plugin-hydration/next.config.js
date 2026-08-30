/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  compiler: {
    emotion: true,
  },
  experimental: {
    swcPlugins: [
      [
        '@swc/plugin-react-remove-properties',
        { properties: ['^data-custom-attribute$'] },
      ],
    ],
  },
}
