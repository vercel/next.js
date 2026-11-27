'use client'

import Image, { type StaticImageData } from 'next/image'
import dependencyImage from 'my-cool-image/marker.png'
import { describeImport } from './describe-import'

const typedDependencyImage: StaticImageData = dependencyImage

export default function ClientImage() {
  return (
    <>
      <pre id="client-dependency">
        {JSON.stringify(describeImport(typedDependencyImage))}
      </pre>
      <Image id="client-dependency-image" src={dependencyImage} alt="" />
    </>
  )
}
