export default function Pid({ text }) {
  return <div>{`query: ${text}`}</div>
}

export function getServerSideProps({ params }) {
  return {
    props: {
      text: params.dynamic,
    },
  }
}
