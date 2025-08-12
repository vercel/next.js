export async function generateStaticParams() {
  return [{ slug: 'static-01' }, { slug: 'static-02' }]
}

export default function Layout({ children }) {
  return children
}
