/**
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 * */
export default function Root({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
