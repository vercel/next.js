import localFont from 'next/font/local'

export const font1 = localFont({ src: './font1.woff2', variable: '--font-1' })
export const font2 = localFont({ src: 'font2.woff2', variable: '--font-2' })
export const font3 = localFont({
  src: './font3.woff2',
  weight: '900',
  style: 'italic',
})
export const font4 = localFont({ src: './font4.woff2', weight: '100' })
export const font5 = localFont({
  src: './test/font5.woff2',
  style: 'italic',
  preload: false,
})
export const font6 = localFont({ src: 'test/font6.woff2' })
