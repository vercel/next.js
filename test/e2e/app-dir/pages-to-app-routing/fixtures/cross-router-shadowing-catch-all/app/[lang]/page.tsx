type Props = {
  params: Promise<{ lang: string }>
}

export default async function Lang({ params }: Props) {
  const { lang } = await params

  return <h1 id="page-title">App Lang: {lang}</h1>
}
