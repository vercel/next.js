import StyledComponentsRegistry from './registry'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
}
