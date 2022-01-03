export const config = { amp: true }

export default function Page() {
  return (
    <div>
      <p id="invalid-amp">Invalid AMP Page</p>
      <amp-video src="/cats.mp4" layout="responsive" />
    </div>
  )
}
