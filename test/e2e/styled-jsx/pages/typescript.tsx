interface Props {
  color: string
}

function Test(p: Props) {
  return (
    <div>
      <button>test</button>
      <style jsx>{`
        button {
          color: ${p.color};
        }
      `}</style>
    </div>
  )
}

export default function Page() {
  return <Test color="red" />
}
