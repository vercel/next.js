import { YouTubeEmbed } from '@next/third-parties/google'

const Page = () => {
  return (
    <div className="container">
      <h1>Youtube Embed</h1>
      <YouTubeEmbed videoid="ogfYd705cRs" height={400} />
    </div>
  )
}

export default Page
