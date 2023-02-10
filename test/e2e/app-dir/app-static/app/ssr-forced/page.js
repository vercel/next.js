export const revalidate = 0

export default function Page() {
  return (
    <>
      <p id="page">/ssr-forced</p>
      <p id="date">{Date.now()}</p>
    </>
  )
}
