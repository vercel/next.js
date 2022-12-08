import React from 'react'

export default function Layout({
  children,
  params: { layoutPaddingHeight, layoutPaddingWidth },
}: {
  children: React.ReactNode
  params: { layoutPaddingWidth: string; layoutPaddingHeight: string }
}) {
  return (
    <div
      style={{
        paddingTop: Number(layoutPaddingHeight),
        paddingBottom: Number(layoutPaddingHeight),
        paddingLeft: Number(layoutPaddingWidth),
        paddingRight: Number(layoutPaddingWidth),
        background: 'pink',
      }}
    >
      {children}
    </div>
  )
}
