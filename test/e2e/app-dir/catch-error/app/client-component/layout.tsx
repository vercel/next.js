import ErrorWrapper from './catch-error-wrapper'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ErrorWrapper title="client-catch-error">{children}</ErrorWrapper>
}
