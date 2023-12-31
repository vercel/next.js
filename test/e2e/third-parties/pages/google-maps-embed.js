import { GoogleMapsEmbed } from '@next/third-parties/google'

const Page = () => {
  return (
    <div class="container">
      <h1>Google Maps Embed</h1>
      <GoogleMapsEmbed
        apiKey="XYZ"
        height={200}
        width="100%"
        mode="place"
        q="Brooklyn+Bridge,New+York,NY"
      />
    </div>
  )
}

export default Page
