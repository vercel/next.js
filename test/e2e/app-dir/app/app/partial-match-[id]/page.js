export default async function DeploymentsPage(props) {
  return (
    <>
      <p>hello from app/partial-match-[id]. ID is: {(await props.params).id}</p>
    </>
  )
}
