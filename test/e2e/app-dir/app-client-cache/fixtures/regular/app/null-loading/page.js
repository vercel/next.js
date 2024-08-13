export const dynamic = 'force-dynamic'

export default async function Page() {
  const randomNumber = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(Math.random())
    }, 1000)
  })

  return (
    <div>
      Page Data! <div id="random-number">{randomNumber}</div>
    </div>
  )
}
