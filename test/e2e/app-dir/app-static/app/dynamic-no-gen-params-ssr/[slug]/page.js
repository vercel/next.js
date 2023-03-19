export const revalidate = 0

export default function Page({ params }) {
  return (
    <>
      <p id="page">/dynamic-no-gen-params-ssr</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
