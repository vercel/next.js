import ErrorWrapper from './catch-error-wrapper'

export default function Layout({ children }: { children: React.ReactNode }) {
  const title = 'ssr-catch-error'
  return <ErrorWrapper title={title}>{children}</ErrorWrapper>
}
