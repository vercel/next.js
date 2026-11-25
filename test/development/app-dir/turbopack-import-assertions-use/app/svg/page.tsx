// `turbopackModuleType` without `turbopackLoader` overrides the built-in image
// handling for this import only.
import rawSvg from '../../icon.svg' with { turbopackModuleType: 'raw' }
import textSvg from '../../icon.svg' with { turbopackModuleType: 'text' }
// A plain import of the same file still gets the built-in image handling
import imageSvg from '../../icon.svg'

export default function Page() {
  return (
    <div>
      <p id="raw-svg">
        {typeof rawSvg === 'string' ? rawSvg : JSON.stringify(rawSvg)}
      </p>
      <p id="text-svg">
        {typeof textSvg === 'string' ? textSvg : JSON.stringify(textSvg)}
      </p>
      <p id="image-svg">{JSON.stringify(imageSvg)}</p>
    </div>
  )
}
