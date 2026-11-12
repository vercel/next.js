export const unstable_paramMatching = { lang: 'not-found' }
export function generateStaticParams() {
  return [{ lang: 'en' }]
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
