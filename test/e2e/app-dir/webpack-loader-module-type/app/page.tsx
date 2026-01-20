import svgUrl from './test.svg'

export default function Page() {
  return (
    <div>
      <p id="svg-url">{svgUrl}</p>
      <img src={svgUrl} alt="test svg" />
    </div>
  )
}
