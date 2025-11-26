'use client'

export default function Page() {
  return <p>hello world</p>
}

export const metadata = {
  title: 'Metadata',
}

export function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
