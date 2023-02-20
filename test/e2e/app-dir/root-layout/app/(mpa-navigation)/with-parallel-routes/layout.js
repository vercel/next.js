// TODO-APP: remove after fixing filtering static flight data
export const revalidate = 0

export default function Root({ one, two }) {
  return (
    <html>
      <head>
        <title>Hello</title>
      </head>
      <body>
        {one}
        {two}
      </body>
    </html>
  )
}
