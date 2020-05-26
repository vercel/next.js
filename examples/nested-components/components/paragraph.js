export default function Paragraph({ children }) {
  return (
    <p>
      {children}
      <style jsx>{`
        p {
          font: 13px Helvetica, Arial;
          margin: 10px 0;
        }
      `}</style>
    </p>
  )
}
