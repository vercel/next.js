import dynamic from 'next/dynamic'

const Button = dynamic(() =>
  import('./client').then((mod) => {
    return { default: mod.Button }
  })
)

export default function Page() {
  return <Button id="client-button">this is a client button</Button>
}
