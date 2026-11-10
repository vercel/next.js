import { RevalidateButton } from './revalidate-button'

export default async function Page({ params }) {
  const { lang } = await params
  const generatedAt = new Date().toISOString()

  return (
    <div>
      <h1>Revalidation Test - {lang}</h1>
      <pre>
        Page generated at: <span id="generated-at">{generatedAt}</span>
      </pre>
      <RevalidateButton lang={lang} />
    </div>
  )
}
