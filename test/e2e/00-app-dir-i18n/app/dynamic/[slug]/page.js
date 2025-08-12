export default function Page({ params: { slug } }) {
  return <p>dynamic page {slug}</p>
}

export function generateStaticParams() {
  return [
    {
      slug: 'first',
    },
    {
      slug: 'second',
    },
  ]
}
