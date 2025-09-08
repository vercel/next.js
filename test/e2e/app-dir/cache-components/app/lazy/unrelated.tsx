'use client'

export default function UnrelatedComponent() {
  let x = '12345'
  console.log('Unrelated Component ' + x)
  return <section>Unrelated Component {x}</section>
}
