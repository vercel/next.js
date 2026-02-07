export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="w-full h-full">
      <body className={`w-full h-full`}>{children}</body>
    </html>
  )
}
