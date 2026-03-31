import React, { Suspense } from 'react'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{
    layoutPaddingWidth: string
    layoutPaddingHeight: string
    pageWidth: string
    pageHeight: string
  }>
}) {
  const { layoutPaddingHeight, layoutPaddingWidth, pageWidth, pageHeight } =
    await params
  return (
    <div
      style={{
        height: Number(pageHeight),
        width: Number(pageWidth),
        paddingTop: Number(layoutPaddingHeight),
        paddingBottom: Number(layoutPaddingHeight),
        paddingLeft: Number(layoutPaddingWidth),
        paddingRight: Number(layoutPaddingWidth),
        background: 'pink',
        display: 'flex',
      }}
    >
      <Suspense fallback={<div id="loading">loading...</div>}>
        {children}
      </Suspense>
    </div>
  )
}
