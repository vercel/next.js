export default function Page() {
  return (
    <div>
      <p>{'マルチバイト'.repeat(28)}</p>
    </div>
  )
}

export const config = { runtime: 'experimental-edge' }
