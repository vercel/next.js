export default function manifest() {
  return {
    name: 'Northfold Supply',
    short_name: 'Northfold',
    description: 'Durable goods for work and the outdoors.',
    start_url: '/en',
    display: 'standalone',
    background_color: '#f4f1ea',
    theme_color: '#1d2a26',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
