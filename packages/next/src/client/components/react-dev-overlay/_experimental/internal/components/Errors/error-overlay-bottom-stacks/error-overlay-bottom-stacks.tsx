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
      {errorsCount > 1 && (
        <div
          className={`error-overlay-bottom-stack-1 ${
            errorsCount - activeIdx > 1 ? '' : 'stack-slide-up'
          }`}
          aria-hidden="true"
        />
      )}

      {errorsCount > 2 && (
        <div
          className={`error-overlay-bottom-stack-2 ${
            errorsCount - activeIdx > 2 ? '' : 'stack-slide-up'
          }`}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

export const styles = css`
  .error-overlay-bottom-stacks-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    outline: none;
    z-index: -1;
    position: fixed;
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
    padding: var(--size-3);
    align-self: center;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-md);
    background: var(--color-background-200);
    animation: stack-slide-down 0.3s ease-out forwards;
  }

  .error-overlay-bottom-stack-1 {
    width: calc(100% - var(--size-6));
    margin-top: calc(-1 * var(--size-3));
  }

  .error-overlay-bottom-stack-2 {
    width: calc(100% - var(--size-12));
    margin-top: calc(-1 * var(--size-3_5));
    z-index: -2;
  }

  @keyframes stack-slide-down {
    from {
      opacity: 0;
      transform: translateY(-50%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .stack-slide-up {
    animation: stack-slide-up 0.3s ease-out forwards;
  }

  @keyframes stack-slide-up {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-50%);
    }
  }
`
