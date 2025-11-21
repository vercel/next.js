export default function Root({ children }) {
  return (
    <html>
      <head>
        <title>Hello</title>
      </head>
      <body>{children}</body>
    </html>
  )
}

export const revalidate = 0
export async function generateStaticParams() {
  return [{ slug: ['slug'] }]
}
