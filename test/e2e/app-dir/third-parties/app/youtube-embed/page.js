import { YoutubeEmbed } from '@next/third-parties/google'

const Page = () => {
  return (
    <div class="container">
      <h1>Youtube Embed</h1>
      <YoutubeEmbed videoid="ogfYd705cRs" height={400} />
    </div>
  )
}

export default Page
