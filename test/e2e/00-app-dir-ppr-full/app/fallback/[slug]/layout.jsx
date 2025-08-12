export default function Layout({ children }) {
  return children
}

export async function generateStaticParams() {
  return [{ slug: 'static-01' }, { slug: 'static-02' }]
}
