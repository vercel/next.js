import { noop as css } from '../../../helpers/noop-template'

export type ErrorOverlayBottomStacksProps = {
  errorsCount: number
  activeIdx: number
}

export function ErrorOverlayBottomStacks({
  errorsCount,
  activeIdx,
}: ErrorOverlayBottomStacksProps) {
  return (
    <div className="error-overlay-bottom-stacks-wrapper">
      {errorsCount - activeIdx >= 2 && (
        <div className="error-overlay-bottom-stack-1" aria-hidden="true" />
      )}

      {errorsCount - activeIdx >= 3 && (
        <div className="error-overlay-bottom-stack-2" aria-hidden="true" />
      )}
    </div>
  )
}

export const styles = css`
  .error-overlay-bottom-stacks-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-right: auto;
    margin-left: auto;
    outline: none;

    @media (min-width: 576px) {
      max-width: 540px;
    }

    @media (min-width: 768px) {
      max-width: 720px;
    }

    @media (min-width: 992px) {
      max-width: 960px;
    }
  }

  .error-overlay-bottom-stack-1,
  .error-overlay-bottom-stack-2 {
    padding: 0.75rem;
    align-self: center;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    margin-top: -1rem; /* 16px */
    box-shadow: var(--shadow-md);
    background: var(--color-background-200);
  }

  .error-overlay-bottom-stack-1 {
    z-index: 49;
    width: calc(100% - 1.5rem); /* 24px */
  }

  .error-overlay-bottom-stack-2 {
    z-index: 48;
    width: calc(100% - 4rem); /* 64px */
  }
`
