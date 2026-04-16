/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    swcPlugins: [['./swc_plugin_env_check.wasm', {}]],
  },
}
