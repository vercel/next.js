export const revalidate = 1

export default function Page() {
  console.log('rendering app-another')
  return (
    <>
      <p>/app-another</p>
      <p>Date: {Date.now()}</p>
    </>
  )
}
