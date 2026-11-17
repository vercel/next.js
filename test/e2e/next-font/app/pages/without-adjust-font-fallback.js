import { Open_Sans } from 'next/font/google'
const openSans = Open_Sans({
  variable: '--open-sans-without-adjust',
  adjustFontFallback: false,
  subsets: ['latin'],
})

export default function WithoutAdjustFontFallback() {
  return (
    <div id="without-adjust-font-fallback" className={openSans.className}>
      {JSON.stringify(openSans)}
    </div>
  )
}
