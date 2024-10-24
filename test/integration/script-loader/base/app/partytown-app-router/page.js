import Script from 'next/script'

const PartytownAppRouter = () => {
  return (
    <div class="container">
      <div>Partytown App Router</div>
      <Script strategy="worker">console.log("inline script!");</Script>
    </div>
  )
}

export default PartytownAppRouter
