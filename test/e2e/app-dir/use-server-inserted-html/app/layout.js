import RootStyleRegistry from './root-style-registry'

export default function Root({ children }) {
  return (
    <html>
      <body>
        <RootStyleRegistry>{children}</RootStyleRegistry>
      </body>
    </html>
  )
}
