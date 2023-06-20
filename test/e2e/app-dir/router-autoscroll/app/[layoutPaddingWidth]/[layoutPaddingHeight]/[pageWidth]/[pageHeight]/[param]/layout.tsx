import React from 'react'

export default function Layout({
  children,
  params: { layoutPaddingHeight, layoutPaddingWidth, pageWidth, pageHeight },
}: {
  children: React.ReactNode
  params: {
    layoutPaddingWidth: string
    layoutPaddingHeight: string
    pageWidth: string
    pageHeight: string
  }
}) {
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
      {children}
    </div>
  )
}
