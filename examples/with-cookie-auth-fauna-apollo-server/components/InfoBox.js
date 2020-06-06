export default function InfoBox({ children }) {
  return (
    <div className="info">
      <style jsx>{`
        .info {
          padding-top: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #ececec;
        }
      `}</style>
      {children}
    </div>
  )
}
