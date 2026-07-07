export default function DynamicStyled({ color }) {
  return (
    <div>
      <style jsx>{`
        p {
          color: ${color};
        }
      `}</style>
      <p>dynamic styled</p>
    </div>
  )
}
