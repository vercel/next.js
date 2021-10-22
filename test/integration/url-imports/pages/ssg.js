import value from 'http://localhost:12345/value1.js'

export async function getStaticProps() {
  return {
    props: {
      value,
    },
  }
}

export default function Index({ value: staticValue }) {
  return (
    <div>
      Hello {staticValue}+{value}
    </div>
  )
}
