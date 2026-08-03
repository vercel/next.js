'use client'
export default function Client({ label, blob }) {
  return (
    <b id="client">
      {label}
      {blob ? ` blob:${blob.length}` : ''}
    </b>
  )
}
