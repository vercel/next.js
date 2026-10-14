export function generateStaticParams() {
  return [{ category: 'a' }, { category: 'b' }]
}
export default function Layout({ children }) {
  return children
}
