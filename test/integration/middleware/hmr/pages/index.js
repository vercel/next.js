import magicValue from 'shared-package'
if (magicValue !== 42) throw new Error('shared-package problem')

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
    </div>
  )
}
