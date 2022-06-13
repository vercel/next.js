export default function Page() {
  return (
    <div>
      <style jsx>{`
        p {
          color: blue;
        }
      `}</style>
      <p>index</p>
    </div>
  )
}

export const config = { runtime: 'edge' }
