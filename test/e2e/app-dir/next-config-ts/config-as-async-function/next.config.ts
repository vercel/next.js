import { defineConfig } from 'next/config'

const nextConfigAsyncFunction = async (phase, { defaultConfig }) => {
  const nextConfig = defineConfig({
    ...defaultConfig,
    env: {
      foo: phase ? 'foo' : 'bar',
    },
  })
  return nextConfig
}

export default nextConfigAsyncFunction
