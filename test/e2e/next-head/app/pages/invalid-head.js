import Head from 'next/head'

export default function InvalidHeadPage() {
  return (
    <div>
      <Head>
        <html lang="en" />
        <title>Invalid Head</title>
      </Head>
      <h1>Invalid head example</h1>
    </div>
  )
}