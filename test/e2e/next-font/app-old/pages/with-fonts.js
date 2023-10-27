import CompWithFonts from '../components/CompWithFonts'
import { openSans } from './_app'

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
