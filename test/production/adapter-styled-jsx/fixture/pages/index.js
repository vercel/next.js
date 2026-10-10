export default function Page({ color }) {
  return (
    <div>
      <p className="hello">hello styled-jsx</p>
      <style jsx>{`
        .hello {
          color: ${color};
        }
      `}</style>
    </div>
  )
}

export function getServerSideProps() {
  return { props: { color: 'rebeccapurple' } }
}
