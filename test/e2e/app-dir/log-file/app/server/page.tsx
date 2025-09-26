export default async function Page() {
  // Logging in RSC render
  console.log('RSC: This is a log message from server component')
  console.error('RSC: This is an error message from server component')
  console.warn('RSC: This is a warning message from server component')

  return <p>hello world</p>
}
