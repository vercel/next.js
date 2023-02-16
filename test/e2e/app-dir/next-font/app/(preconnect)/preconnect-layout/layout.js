import localFont from 'next/font/local'

const layoutFont = localFont({ src: './layout.woff2', preload: false })

export default function Layout({ children }) {
  return (
    <>
      <p className={layoutFont.className}>{JSON.stringify(layoutFont)}</p>
      {children}
    </>
  )
}
