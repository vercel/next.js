type Props = {
  params: Promise<{ locale: string }>
}

export default async function About({ params }: Props) {
  const { locale } = await params

  return <h1 id="page-title">App About: {locale}</h1>
}
