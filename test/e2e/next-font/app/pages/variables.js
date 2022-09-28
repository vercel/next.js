import { Fira_Code, Albert_Sans, Inter, Roboto } from '@next/font/google'
import localFont from '@next/font/local'

const firaCode = Fira_Code()
const albertSans = Albert_Sans({
  variant: 'variable-italic',
  adjustFontFallback: false,
})
const inter = Inter({ variant: '900', display: 'swap' }) // Don't preload by default when swap
const roboto = Roboto({
  variant: '100-italic',
  display: 'swap',
  preload: true,
})
const myFont = localFont({
  src: '../fonts/my-font.woff2',
  preload: false,
  variable: '--my-font',
})

export default function WithFonts() {
  return (
    <>
      {/* Fira Code Variable */}
      <div
        id="variables-fira-code"
        className={firaCode.variable}
        style={{ fontFamily: 'var(--next-font-fira-code)' }}
      >
        With variables
      </div>
      <div
        id="without-variables-fira-code"
        style={{ fontFamily: 'var(--next-font-fira-code)' }}
      >
        Without variables
      </div>

      {/* Albert Sant Variable Italic */}
      <div
        id="variables-albert-sans-italic"
        className={albertSans.variable}
        style={{ fontFamily: 'var(--next-font-albert-sans-italic)' }}
      >
        With variables
      </div>
      <div
        id="without-variables-albert-sans-italic"
        style={{ fontFamily: 'var(--next-font-albert-sans-italic)' }}
      >
        Without variables
      </div>

      {/* Inter 900 */}
      <div
        id="variables-inter-900"
        className={inter.variable}
        style={{ fontFamily: 'var(--next-font-inter-900)' }}
      >
        With variables
      </div>
      <div
        id="without-variables-inter-900"
        style={{ fontFamily: 'var(--next-font-inter-900)' }}
      >
        Without variables
      </div>

      {/* Roboto 100 Italic */}
      <div
        id="variables-roboto-100-italic"
        className={roboto.variable}
        style={{ fontFamily: 'var(--next-font-roboto-100-italic)' }}
      >
        With variables
      </div>
      <div
        id="without-variables-roboto-100-italic"
        style={{ fontFamily: 'var(--next-font-roboto-100-italic)' }}
      >
        Without variables
      </div>

      {/* Local font */}
      <div
        id="variables-local-font"
        className={myFont.variable}
        style={{ fontFamily: 'var(--my-font)' }}
      >
        With variables
      </div>
      <div
        id="without-variables-local-font"
        style={{ fontFamily: 'var(--my-font)' }}
      >
        Without variables
      </div>
    </>
  )
}
