import localFont from 'next/font/local'

export const font1 = localFont({
  src: './font1_roboto.woff2',
  variable: '--font-1',
})
export const font2 = localFont({
  src: 'font2_roboto-mono-regular.woff2',
  variable: '--font-2',
})
export const font3 = localFont({
  src: './font3_inter-regular.woff2',
  weight: '900',
  style: 'italic',
})
export const font4 = localFont({
  src: './font4_workbench-regular.woff2',
  weight: '100',
})
export const font5 = localFont({
  src: './test/font5_open-sans-regular.woff2',
  style: 'italic',
  preload: false,
})
export const font6 = localFont({ src: 'test/font6_single-day-regular.woff2' })
