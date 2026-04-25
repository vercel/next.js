import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Version 0',
    short_name: 'v0',
    start_url: '/',
    display: 'standalone',
  }
}
