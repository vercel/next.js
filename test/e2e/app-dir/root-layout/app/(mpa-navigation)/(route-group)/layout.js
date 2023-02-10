// TODO-APP: remove after fixing filtering static flight data
export const revalidate = 0

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
