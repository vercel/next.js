import ClientComponent from './ClientComponent'

export default async function Page() {
  const reference = {
    id: 3,
  }

  const dataObject = new Map([[3, reference]])

  return (
    <div>
      <ClientComponent propA={reference} propB={dataObject} />
    </div>
  )
}
