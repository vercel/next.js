/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,
    turbopackFileSystemCacheForDev: true,
    swcPlugins: [
      ['./swc_plugin_config_check_a.wasm', { plugin: 'a', value: 'alpha' }],
      ['./swc_plugin_config_check_b.wasm', { plugin: 'b', value: 'beta' }],
      ['./swc_plugin_config_check_c.wasm', { plugin: 'c', value: 'gamma' }],
    ],
  },
}
