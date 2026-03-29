import ErrorWrapper from './catch-error-wrapper'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ErrorWrapper>{children}</ErrorWrapper>
      <footer id="footer">Footer content</footer>
    </>
  )
}
