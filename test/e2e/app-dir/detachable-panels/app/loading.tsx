export default function Loading() {
  return (
    <div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
          .skeleton-container {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          .skeleton-header {
            height: 32px;
            background-color: #e5e7eb;
            border-radius: 4px;
            margin-bottom: 16px;
          }
          .skeleton-content {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .skeleton-line {
            height: 16px;
            background-color: #e5e7eb;
            border-radius: 4px;
          }
          .skeleton-line-75 {
            width: 75%;
          }
          .skeleton-line-50 {
            width: 50%;
          }
          .skeleton-line-83 {
            width: 83%;
          }
        `,
        }}
      />
      <div className="skeleton-container">
        <div className="skeleton-header"></div>
        <div className="skeleton-content">
          <div className="skeleton-line skeleton-line-75"></div>
          <div className="skeleton-line skeleton-line-50"></div>
          <div className="skeleton-line skeleton-line-83"></div>
        </div>
      </div>
    </div>
  )
}
