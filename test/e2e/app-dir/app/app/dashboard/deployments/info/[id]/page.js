export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <p id="message">
        hello from app/dashboard/deployments/info/[id]. ID is: {params.id}
      </p>
    </>
  )
}
