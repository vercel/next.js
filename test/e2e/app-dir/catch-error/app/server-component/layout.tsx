import ErrorWrapper from './catch-error-wrapper'

export default function Layout({ children }: { children: React.ReactNode }) {
  // A prop can be passed from the RSC to the error component
  const title = 'server-catch-error'
  return <ErrorWrapper title={title}>{children}</ErrorWrapper>
}
