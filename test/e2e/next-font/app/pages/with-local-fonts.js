import localFont from '@next/font/local'

const myFont1 = localFont({
  src: '../fonts/my-font.woff2',
  style: 'italic',
  weight: '100',
  fallback: ['system-ui'],
  adjustFontFallback: 'Times New Roman',
})
const myFont2 = localFont({
  src: '../fonts/my-other-font.woff2',
  preload: false,
  variable: '--my-font',
})

export default function WithFonts() {
  return (
    <>
      <div id="first-local-font" className={myFont1.className}>
        {JSON.stringify(myFont1)}
      </div>
      <div id="second-local-font" className={myFont2.className}>
        {JSON.stringify(myFont2)}
      </div>
    </>
  )
}
