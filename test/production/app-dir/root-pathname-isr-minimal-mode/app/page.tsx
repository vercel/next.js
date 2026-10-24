// Make the root page ISR-enabled so the test exercises regeneration.
export const revalidate = 1

export default function Page() {
  return <p id="page">hello world</p>
}
