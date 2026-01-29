// @ts-expect-error - SVG with ?url query returns string URL
import svgUrl from './icon.svg?url'

export default function Page() {
  return (
    <div>
      <p id="svg-url" data-url={svgUrl}>
        SVG URL: {svgUrl}
      </p>
      <img src={svgUrl} alt="Icon" width={24} height={24} />
    </div>
  )
}
