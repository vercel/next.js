export default async function Page() {
  console.log('This is a console log from a server component page')
  return (
    <div>
      This page uses a console.log that has been patched before Next.js runs to
      include a timestamp in the log line. It does not actually print the
      timestamp because we want the assertions to be stable but we are asserting
      that this sync IO does not interrupt the prerender when Cache Components
      are enabled
    </div>
  )
}
