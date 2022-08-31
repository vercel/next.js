import { SliceZone } from '@prismicio/react'
import { components } from '../slices'

/**
 * @param {object} props
 * @param {import('../types.generated').PostDocument['data']['slices']} props.slices
 */
export default function PostBody({ slices }) {
  return (
    <div className="max-w-2xl mx-auto">
      <SliceZone slices={slices} components={components} />
    </div>
  )
}
