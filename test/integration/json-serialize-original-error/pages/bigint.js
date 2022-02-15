export async function getStaticProps() {
  return {
    props: {
      topics: [
        {
          number: '22',
        },
      ],
    },
  }
}

export default function Repro(props) {
  props.topics[0].number = 22n // basically what happened in https://github.com/blitz-js/babel-plugin-superjson-next/issues/63
  return <></>
}
