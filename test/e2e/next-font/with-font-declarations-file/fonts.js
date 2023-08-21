import localFont from 'next/font/local'
import {
  Open_Sans,
  Source_Code_Pro,
  Abel,
  Inter,
  Roboto,
} from 'next/font/google'

const openSans = Open_Sans({ subsets: ['latin'] })
const sourceCodePro = Source_Code_Pro({ display: 'swap', preload: false })
const abel = Abel({ weight: '400', display: 'optional', preload: false })

export const inter = Inter({
  display: 'block',
  preload: true,
  subsets: ['latin'],
})
export const roboto = Roboto({ weight: '400', subsets: ['latin'] })

export const myLocalFont = localFont({
  src: './my-font.woff2',
})

export { openSans, sourceCodePro, abel }
