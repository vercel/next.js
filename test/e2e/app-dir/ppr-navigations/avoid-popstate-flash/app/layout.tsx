import { ShouldFallbackThrowContainer } from './some-page/client'

export default function Root({ children }) {
  return (
    <html>
      <body>
        <ShouldFallbackThrowContainer>{children}</ShouldFallbackThrowContainer>
      </body>
    </html>
  )
}
