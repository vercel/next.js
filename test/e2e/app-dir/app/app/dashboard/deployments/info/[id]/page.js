export default function Page({ params }) {
  return (
    <>
      <p id="message">
        hello from app/dashboard/deployments/info/[id]. ID is: {params.id}
      </p>
    </>
  )
}
