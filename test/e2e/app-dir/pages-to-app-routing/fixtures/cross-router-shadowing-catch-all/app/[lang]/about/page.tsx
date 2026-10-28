type Props = {
  params: Promise<{ lang: string }>
}

export default async function About({ params }: Props) {
  const { lang } = await params

  return <h1 id="page-title">App About: {lang}</h1>
}
