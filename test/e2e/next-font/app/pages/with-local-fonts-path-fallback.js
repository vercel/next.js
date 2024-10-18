import localFont from 'next/font/local'

const myFont = localFont({
  src: [
    {
      path: '../fonts/my-font-3.woff2',
      pathFallback: ['../fonts/my-font-3.woff'],
      weight: '100',
      style: 'normal',
      declarations: [{ prop: 'unicode-range', value: 'U+000-5FF' }],
      preload: false,
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '100',
      style: 'italic',
      declarations: [{ prop: 'font-stretch', value: '50% 100%' }],
      preload: true,
    },
  ],
  declarations: [{ prop: 'ascent-override', value: '80%' }],
  adjustFontFallback: false,
})

export default function WithFonts() {
  return (
    <>
      <div id="first-local-font" className={myFont.className}>
        {JSON.stringify(myFont)}
      </div>
    </>
  )
}
