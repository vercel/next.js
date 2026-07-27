import { LinkAccordion } from '../components/link-accordion'

export default async function Page() {
  const randomNumber = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(Math.random())
    }, 1000)
  })

  return (
    <div id="dynamic-page">
      <LinkAccordion href="/">Back to Home</LinkAccordion>
      <div id="random-number">{randomNumber}</div>
    </div>
  )
}
