import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Keep width descriptors equal to the file's width. The small sizes value
    // on density-rounded then exposes truncation of the natural dimensions.
    deviceSizes: [820],
    imageSizes: [],
    localPatterns: [
      { pathname: '/sample.png' },
      { pathname: '/fractional*.svg' },
    ],
  },
}

export default nextConfig
