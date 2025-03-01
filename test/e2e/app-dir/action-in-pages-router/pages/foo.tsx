import { actionFoo } from '../actions'

export default function Page() {
  return (
    <button
      onClick={() => {
        actionFoo().then((v) => console.log(v))
      }}
    >
      hello
    </button>
  )
}

// Keep route as dynamic
export async function getServerSideProps() {
  return { props: {} }
}
