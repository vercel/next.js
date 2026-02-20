export default function Loading() {
  return (
    <div data-testid="loading-shell">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #eee 25%, #ddd 50%, #eee 75%);
          background-size: 800px 100%;
          animation: shimmer 1.5s ease-in-out infinite;
          border-radius: 4px;
        }
      `}</style>
      <div
        className="skeleton"
        style={{ width: 160, height: 28, marginBottom: 12 }}
      />
      <div
        className="skeleton"
        style={{ width: '100%', height: 14, marginBottom: 8 }}
      />
      <div
        className="skeleton"
        style={{ width: '80%', height: 14, marginBottom: 24 }}
      />
      <div
        className="skeleton"
        style={{ width: 100, height: 20, marginBottom: 16 }}
      />
      <div
        style={{
          border: '1px solid #eee',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ padding: '0.75rem', borderBottom: '1px solid #eee' }}
          >
            <div className="skeleton" style={{ width: 80, height: 14 }} />
            <div
              className="skeleton"
              style={{ width: '90%', height: 14, marginTop: 8 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
