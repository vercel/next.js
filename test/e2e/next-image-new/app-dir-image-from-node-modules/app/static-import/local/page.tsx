import Image, { type StaticImageData } from 'next/image'
import localImage from './local.png'
import { describeImport } from '../describe-import'

// Control: an image from the project itself, not from node_modules.
const typedLocalImage: StaticImageData = localImage

export default function Page() {
  return (
    <main>
      <pre id="server-local">
        {JSON.stringify(describeImport(typedLocalImage))}
      </pre>
      <Image id="server-local-image" src={localImage} alt="" />
    </main>
  )
}
