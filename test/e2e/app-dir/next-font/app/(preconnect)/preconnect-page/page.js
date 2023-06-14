'use client'
import localFont from 'next/font/local'

const pageFont = localFont({ src: './page.woff2', preload: false })

export default function Page() {
  return (
    <>
      <p className={pageFont.className}>{JSON.stringify(pageFont)}</p>
    </>
  )
}
