// `turbopackModuleType` without `turbopackLoader` overrides the built-in image
// handling for this import only.
import rawSvg from './logo.svg' with { turbopackModuleType: 'raw' }
// A plain import of the same file still gets the built-in image handling
import imageSvg from './logo.svg'
// `.txt` has no built-in rule, `turbopackModuleType` alone sets its module type
import rawText from './notes.txt' with { turbopackModuleType: 'raw' }

export default function Page() {
  return (
    <div>
      <p id="raw-svg">
        {typeof rawSvg === 'string' ? rawSvg : JSON.stringify(rawSvg)}
      </p>
      <p id="image-svg">{JSON.stringify(imageSvg)}</p>
      <p id="raw-txt">{rawText}</p>
    </div>
  )
}
