import type { Metadata } from "next"
import React from "react"

export const metadata: Metadata = {
  title: "Parallel Routes Script Execution Test",
  description: "Test for script execution with parallel routes",
}

// Mock LocalizedStringProvider to simulate React Aria behavior
function LocalizedStringProvider({ locale }: { locale: string }) {
  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `window[Symbol.for('react-aria.i18n.locale')] = '${locale}';`,
      }}
    />
  )
}

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ padding: "1rem" }}>
        <LocalizedStringProvider locale="en" />
        {children}
        {modal}
      </body>
    </html>
  )
}
