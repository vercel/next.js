export const dynamicParams = false

export function generateStaticParams() {
  return [{ variant: 'a' }, { variant: 'b' }]
}

export default async function RootLayout({ children, params }) {
  return (
    <html lang="en">
      <body>
        <p>variant: {(await params).variant}</p>
        {children}
      </body>
    </html>
  )
}
