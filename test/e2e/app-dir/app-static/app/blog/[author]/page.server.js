export const config = {
  dynamicParams: false,
}

export default function Page({ params }) {
  return (
    <>
      <p id="page">/blog/[author]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="date">{Date.now()}</p>
    </>
  )
}
