export default function Page() {
  return <p>Deployment ID: {process.env.NEXT_DEPLOYMENT_ID}</p>
}
