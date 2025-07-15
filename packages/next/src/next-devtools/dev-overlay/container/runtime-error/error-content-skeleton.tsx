import { css } from '../../utils/css'

export function ErrorContentSkeleton() {
  return (
    <>
      <div data-nextjs-codeframe-skeleton>
        <div data-nextjs-codeframe-skeleton-header>
          <div data-nextjs-codeframe-skeleton-icon />
          <div
            data-nextjs-codeframe-skeleton-line
            data-nextjs-codeframe-skeleton-header-bar
          />
        </div>
        <div data-nextjs-codeframe-skeleton-content>
          <div
            data-nextjs-codeframe-skeleton-line
            data-nextjs-codeframe-skeleton-line-1
          />
          <div
            data-nextjs-codeframe-skeleton-line
            data-nextjs-codeframe-skeleton-line-2
          />
          <div
            data-nextjs-codeframe-skeleton-line
            data-nextjs-codeframe-skeleton-line-3
          />
        </div>
      </div>
      <div data-nextjs-call-stack-container>
        <div data-nextjs-call-stack-header>
          <p data-nextjs-call-stack-title>
            Call Stack{' '}
            <span
              data-nextjs-call-stack-count
              data-nextjs-call-stack-count-skeleton
            ></span>
          </p>
          <button
            data-nextjs-call-stack-ignored-list-toggle-button
            data-nextjs-call-stack-ignored-list-toggle-button-skeleton
            aria-hidden="true"
          >
            <div data-nextjs-call-stack-skeleton-bar />
          </button>
        </div>
      </div>
    </>
  )
}

export const ERROR_CONTENT_SKELETON_STYLES = css`
  [data-nextjs-codeframe-skeleton] {
    margin: 8px 0;
    border-radius: 8px;
    background-color: var(--color-background-200);
    border: 1px solid var(--color-gray-400);
    overflow: hidden;
  }

  [data-nextjs-codeframe-skeleton-header] {
    display: flex;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--color-gray-400);
    border-radius: 8px 8px 0 0;
    gap: 6px;
  }

  [data-nextjs-codeframe-skeleton-icon] {
    width: var(--size-16);
    height: var(--size-16);
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--color-gray-200) 25%,
      var(--color-gray-100) 50%,
      var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }

  [data-nextjs-codeframe-skeleton-header-bar] {
    width: 42.9%;
  }

  [data-nextjs-codeframe-skeleton-button] {
    width: var(--size-16);
    height: var(--size-16);
    border-radius: var(--rounded-full);
    background: linear-gradient(
      90deg,
      var(--color-gray-200) 25%,
      var(--color-gray-100) 50%,
      var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }

  [data-nextjs-codeframe-skeleton-content] {
    padding: 12px;
  }

  [data-nextjs-codeframe-skeleton-line] {
    height: var(--size-16);
    border-radius: 100px;
    background: linear-gradient(
      90deg,
      var(--color-gray-200) 25%,
      var(--color-gray-100) 50%,
      var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
    margin-bottom: 8px;
  }

  [data-nextjs-codeframe-skeleton-line]:last-child {
    margin-bottom: 0;
  }

  [data-nextjs-codeframe-skeleton-line-1] {
    width: 32.5%;
  }

  [data-nextjs-codeframe-skeleton-line-2] {
    width: 56.8%;
  }

  [data-nextjs-codeframe-skeleton-line-3] {
    width: 29.6%;
  }

  [data-nextjs-call-stack-container] {
    position: relative;
    margin-top: 8px;
  }

  [data-nextjs-call-stack-count-skeleton] {
    display: flex;
    justify-content: center;
    align-items: center;
    width: var(--size-20);
    height: var(--size-20);
    border-radius: var(--rounded-full);
    background: linear-gradient(
      90deg,
      var(--color-gray-200) 25%,
      var(--color-gray-100) 50%,
      var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  [data-nextjs-call-stack-ignored-list-toggle-button-skeleton] {
    all: unset;
    display: flex;
    align-items: center;
    border-radius: 6px;
    padding: 4px 6px;
    margin-right: -6px;
  }

  [data-nextjs-call-stack-skeleton-bar] {
    height: var(--size-12);
    width: 148px;
    border-radius: 100px;
    background: linear-gradient(
      90deg,
      var(--color-gray-200) 25%,
      var(--color-gray-100) 50%,
      var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  /* Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    [data-nextjs-codeframe-skeleton-icon],
    [data-nextjs-codeframe-skeleton-header-bar],
    [data-nextjs-codeframe-skeleton-button],
    [data-nextjs-codeframe-skeleton-line],
    [data-nextjs-call-stack-count-skeleton],
    [data-nextjs-call-stack-skeleton-bar] {
      animation: none;
      background: var(--color-gray-200);
    }
  }
`
