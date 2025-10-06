/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    swcPlugins: [
      [
        '@swc/plugin-react-remove-properties',
        {
          properties: ['^data-custom-attribute$'],
        },
      ],
    ],
  },
}
