import { connection } from 'next/server'
import { lang, locale } from 'next/root-params'

export default async function Page({ params }) {
  await connection()
  const { slug } = await params
  return (
    <div>
      <p id="dynamic-params">{slug}</p>
      <p id="root-params">
        {JSON.stringify({
          lang: await lang(),
          locale: await locale(),
        })}
      </p>
    </div>
  )
}
