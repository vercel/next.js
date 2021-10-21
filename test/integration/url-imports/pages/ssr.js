import value from 'http://localhost:12345/value2.js'

export function getServerSideProps() {
  return {
    props: {
      value,
    },
  }
}

export default function Index({ value: serverValue }) {
  return (
    <div>
      Hello {serverValue}+{value}
    </div>
  )
}
