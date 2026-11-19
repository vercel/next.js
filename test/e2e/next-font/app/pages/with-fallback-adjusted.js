import { Open_Sans } from 'next/font/google'
const openSans = Open_Sans({
  fallback: ['system-ui', 'Arial'],
  subsets: ['latin'],
})

export default function WithFallbackAdjusted() {
  return (
    <div id="with-fallback-adjusted" className={openSans.className}>
      {JSON.stringify(openSans)}
    </div>
  )
}
