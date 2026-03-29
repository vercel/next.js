import ErrorWrapper from './error-boundary-wrapper'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ErrorWrapper>{children}</ErrorWrapper>
}
