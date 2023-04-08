export const revalidate = 0

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?status=404',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then(async (res) => {
    return {
      status: res.status,
      text: await res.text(),
    }
  })

  return (
    <>
      <p id="page">/variable-revalidate/status-code</p>
      <p id="page-data">{JSON.stringify(data)}</p>
    </>
  )
}
