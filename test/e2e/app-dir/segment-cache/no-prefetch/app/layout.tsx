export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}
