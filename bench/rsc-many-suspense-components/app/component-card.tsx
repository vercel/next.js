import { Suspense } from 'react'
import {
  fetchComponentDetails,
  fetchComponentMeta,
  fetchComponentPayload,
  type ComponentSeed,
} from '../testdata'

async function AsyncPayload({ id }: { id: ComponentSeed['id'] }) {
  const payload = await fetchComponentPayload(id)

  return (
    <ul>
      {payload.tags.map((tag) => (
        <li key={tag}>{tag}</li>
      ))}
    </ul>
  )
}

async function AsyncDetails({ id }: { id: ComponentSeed['id'] }) {
  const details = await fetchComponentDetails(id)

  return (
    <p>
      {details.detail} | {details.checksum}
    </p>
  )
}

function PayloadFallback() {
  return (
    <ul>
      <li>loading-tag-0</li>
      <li>loading-tag-1</li>
    </ul>
  )
}

function DetailsFallback() {
  return <p>loading-details</p>
}

async function AsyncCardBody({ id }: { id: ComponentSeed['id'] }) {
  const meta = await fetchComponentMeta(id)

  return (
    <article data-id={id}>
      <h2>{meta.name}</h2>
      <p>{meta.group}</p>
      <Suspense fallback={<DetailsFallback />}>
        <AsyncDetails id={id} />
      </Suspense>
      <Suspense fallback={<PayloadFallback />}>
        <AsyncPayload id={id} />
      </Suspense>
    </article>
  )
}

export function AsyncComponentCard({ id }: { id: ComponentSeed['id'] }) {
  return (
    <Suspense fallback={<DetailsFallback />}>
      <AsyncCardBody id={id} />
    </Suspense>
  )
}
