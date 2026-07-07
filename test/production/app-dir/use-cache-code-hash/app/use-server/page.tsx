export default function Page() {
  async function handle() {
    'use server'
    console.log('hi')
  }

  return (
    <p>
      <button onClick={handle} />
    </p>
  )
}
