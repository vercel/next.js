'use client'

const SkeletonCard = () => (
  <>
    <div className="skeleton">
      <div className="skeleton-img" />
      <div className="skeleton-btn" />
      <div className="skeleton-line-one" />
      <div className="skeleton-line-two" />
    </div>
    <style jsx>{`
      .skeleton {
        padding: 1rem /* 16px */;
        border-radius: 1rem /* 16px */;
        background-color: rgb(24 24 27 / 0.8);
      }

      .skeleton-img,
      .skeleton-btn,
      .skeleton-line-one,
      .skeleton-line-two {
        border-radius: 0.5rem /* 8px */;
      }

      .skeleton-img {
        height: 3.5rem /* 56px */;
        background-color: rgb(63 63 70 / 1);
      }

      .skeleton-btn,
      .skeleton-line-one,
      .skeleton-line-two {
        margin-top: 0.75rem /* 12px */;
        height: 0.75rem /* 12px */;
      }

      .skeleton-btn {
        background-color: rgb(0 112 243 / 1);
        width: 25%;
      }

      .skeleton-line-one,
      .skeleton-line-two {
        background-color: rgb(63 63 70 / 1);
      }

      .skeleton-line-one {
        width: 91.666667%;
      }

      .skeleton-line-two {
        width: 66.666667%;
      }
    `}</style>
  </>
)

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-gray-400/80">
        Styled with Styled JSX
      </h1>
      <div className="container">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <style jsx>{`
        .container {
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: 1.5rem /* 24px */;
        }

        @media (min-width: 1024px) {
          .container {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
