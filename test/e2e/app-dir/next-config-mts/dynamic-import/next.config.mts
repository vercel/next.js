import type { NextConfig } from 'next'

const nextConfig = async () => {
  const { foo } = await import('./foo')

  const nextConfig: NextConfig = {
    env: {
      foo,
    },
  }

  return nextConfig
}

export default nextConfig
