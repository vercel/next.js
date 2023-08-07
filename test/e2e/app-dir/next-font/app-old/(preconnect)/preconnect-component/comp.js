import localFont from '@next/font/local'

const componentFont = localFont({ src: './comp.woff2', preload: false })

export default function Component() {
  return (
    <p className={componentFont.className}>{JSON.stringify(componentFont)}</p>
  )
}
