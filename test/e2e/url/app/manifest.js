import icon from '../public/vercel.png'

export default function manifest() {
  return {
    short_name: 'Next.js',
    name: 'Next.js',
    icons: [
      {
        src: icon.src,
        type: 'image/png',
        sizes: '512x512',
      },
    ],
  }
}
