import localFont from 'next/font/local'

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

const roboto = localFont({
  preload: false,
  src: [
    {
      path: '../fonts/roboto/roboto-100-italic.woff2',
      weight: '100',
      style: 'italic',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/roboto/roboto-400.woff2',
      weight: '400',
    },
    {
      path: '../fonts/my-font.woff2',
      style: 'italic',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
})

const robotoVar1 = localFont({
  preload: false,
  src: [
    {
      path: '../fonts/roboto/roboto-400.woff2',
      weight: '100 300',
      style: 'normal',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '100 300',
      style: 'italic',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '500 900',
      style: 'italic',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '500 900',
      style: 'normal',
    },
  ],
})

const robotoVar2 = localFont({
  preload: false,
  src: [
    {
      path: '../fonts/roboto/roboto-900.woff2',
      weight: '100 900',
      style: 'italic',
    },
    {
      path: '../fonts/roboto/roboto-400.woff2',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '300 399',
      style: 'italic',
    },
    {
      path: '../fonts/my-font.woff2',
      weight: '401 500',
      style: 'normal',
    },
  ],
})

const robotoWithPreload = localFont({
  src: [
    {
      path: '../fonts/roboto/roboto-100.woff2',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../fonts/roboto/roboto-900-italic.woff2',
      weight: '900',
      style: 'italic',
    },
    {
      path: '../fonts/roboto/roboto-100.woff2',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../fonts/roboto/roboto-100-italic.woff2',
      weight: '900',
      style: 'italic',
    },
  ],
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
      <div id="roboto-local-font" className={roboto.className}>
        {JSON.stringify(roboto)}
      </div>
      <div id="roboto-local-font-var1" className={robotoVar1.className}>
        {JSON.stringify(robotoVar1)}
      </div>
      <div id="roboto-local-font-var2" className={robotoVar2.className}>
        {JSON.stringify(robotoVar2)}
      </div>
      <div
        id="roboto-local-font-preload"
        className={robotoWithPreload.className}
      >
        {JSON.stringify(robotoWithPreload)}
      </div>
    </>
  )
}
