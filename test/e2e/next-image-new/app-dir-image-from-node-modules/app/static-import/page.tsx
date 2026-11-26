import Image, { type StaticImageData } from 'next/image'
import dependencyImage from 'my-cool-image/marker.png'
import { describeImport } from './describe-import'
import { ClientImageLoader } from './client-image-loader'

// These assignments make `next build` type-check the declared shape of the
// imports: `StaticImageData` with a string `src`.
const typedDependencyImage: StaticImageData = dependencyImage
const dependencyImageSrc: string = dependencyImage.src

export default function Page() {
  return (
    <main>
      <pre id="server-dependency">
        {JSON.stringify(describeImport(typedDependencyImage))}
      </pre>
      <p id="server-dependency-src">{dependencyImageSrc}</p>
      <Image id="server-dependency-image" src={dependencyImage} alt="" />
      <ClientImageLoader />
    </main>
  )
}
