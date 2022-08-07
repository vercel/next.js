export default function Comp() {
  return (
    <div>
      <style jsx>{`
        h3 {
          color: purple;
        }
        .box {
          padding: 8px;
          border: 2px solid purple;
        }
      `}</style>
      <div className="box">
        <h3>styled-jsx</h3>
        <p>This area is rendered by styled-jsx</p>
      </div>
    </div>
  )
}
