import CompWithFonts from '../components/CompWithFonts'
import { Open_Sans } from 'next/font/google'
const openSans = Open_Sans({ variable: '--open-sans', subsets: ['latin'] })

export default function WithFonts() {
  return (
    <>
      <CompWithFonts />
      <div id="with-fonts-open-sans" className={openSans.className}>
        {JSON.stringify(openSans)}
      </div>
      <div id="with-fonts-open-sans-style" style={openSans.style} />
    </>
  )
}
