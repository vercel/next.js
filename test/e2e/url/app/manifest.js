import icon from '../public/vercel.png'
const url = new URL('../public/vercel.png', import.meta.url).toString()

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
    description: url,
  }
}
