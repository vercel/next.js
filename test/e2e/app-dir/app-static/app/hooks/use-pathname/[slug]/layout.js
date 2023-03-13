export default function Layout({ children }) {
  return children
}

export function generateStaticParams() {
  return [{ slug: 'slug' }]
}
