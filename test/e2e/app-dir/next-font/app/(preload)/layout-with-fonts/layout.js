import localFont from 'next/font/local'

const layoutFont = localFont({ src: './layout-font-nunito-sans.woff2' })

export default function Layout({ children }) {
  return (
    <>
      <p id="layout-with-fonts" className={layoutFont.className}>
        {JSON.stringify(layoutFont)}
      </p>
      {children}
    </>
  )
}
