import Head from 'next/head'

export default function ErrorMessage({ title, description }) {
  return (
    <article>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <h1>{title}</h1>
      <p>{description}</p>
    </article>
  )
}
