type Props = {
  params: Promise<{ slug: string }>
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  return <div>Hello {slug}</div>
}

export function generateStaticParams() {
  return [
    { slug: 'a' },
    { slug: 'b' },
    { slug: 'c' },
    { slug: 'd' },
    { slug: 'e' },
    { slug: 'f' },
  ]
}
