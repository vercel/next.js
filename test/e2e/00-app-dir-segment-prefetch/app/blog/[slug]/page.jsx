import { Component } from '../../component'

export default function Page() {
  return <Component />
}

export async function generateStaticParams() {
  return [{ slug: 'hello-world' }]
}
