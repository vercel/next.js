import localFont from 'next/font/local'

const templateFont = localFont({ src: './template-font-nunito-sans.woff2' })

export default function Template({ children }) {
  return (
    <>
      <p id="template-with-fonts" className={templateFont.className}>
        {JSON.stringify(templateFont)}
      </p>
      {children}
    </>
  )
}
