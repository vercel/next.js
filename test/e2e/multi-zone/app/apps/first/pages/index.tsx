export default function Page() {
  // this variable is edited by the test to verify HMR
  const editedContent = ''
  return (
    <>
      <p>hello from first app</p>
      <div>{editedContent}</div>
      <div id="now">{Date.now()}</div>
    </>
  )
}
