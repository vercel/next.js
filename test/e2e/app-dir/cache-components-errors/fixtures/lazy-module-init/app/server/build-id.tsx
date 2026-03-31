export async function BuildID() {
  const buildID = require('./lazy-id').buildID
  await 1
  return (
    <dl>
      <dt>Build ID</dt>
      <dd id="id">{buildID}</dd>
    </dl>
  )
}
