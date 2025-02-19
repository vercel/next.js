import { noop as css } from '../../../../helpers/noop-template'

export function DevToolsInfo({
  title,
  children,
  learnMoreLink,
  setIsOpen,
  setPreviousOpen,
  ...props
}: {
  title: string
  children: React.ReactNode
  learnMoreLink: string
  setIsOpen: (isOpen: boolean) => void
  setPreviousOpen: (isOpen: boolean) => void
}) {
  return (
    <div data-info-popover {...props}>
      <div className="dev-tools-info-container">
        <h1 className="dev-tools-info-title">{title}</h1>
        {children}
        <div className="dev-tools-info-button-container">
          <button
            className="dev-tools-info-close-button"
            onClick={() => {
              setIsOpen(false)
              setPreviousOpen(true)
            }}
          >
            Close
          </button>
          <a
            className="dev-tools-info-learn-more-button"
            href={learnMoreLink}
            target="_blank"
            rel="noreferrer noopener"
          >
            Learn More
          </a>
        </div>
      </div>
    </div>
  )
}

export const DEV_TOOLS_INFO_STYLES = css`
  [data-info-popover] {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: var(--color-background-100);
    border: 1px solid var(--color-gray-alpha-400);
    background-clip: padding-box;
    box-shadow: var(--shadow-menu);
    border-radius: var(--rounded-xl);
    position: absolute;
    font-family: var(--font-stack-sans);
    z-index: 1000;
    overflow: hidden;
    opacity: 0;
    outline: 0;
    min-width: 350px;
    transition: opacity var(--animate-out-duration-ms)
      var(--animate-out-timing-function);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }
  }

  .dev-tools-info-container {
    padding: var(--size-1_5);
  }

  .dev-tools-info-title {
    padding: var(--size-2) var(--size-1_5);
    color: var(--color-gray-1000);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    margin: 0;
  }

  .dev-tools-info-article {
    padding: var(--size-2) var(--size-1_5);
    color: var(--color-gray-1000);
    font-size: 14px;
    line-height: 20px;
    margin: 0;
  }
  .dev-tools-info-paragraph {
    &:last-child {
      margin-bottom: 0;
    }
  }

  .dev-tools-info-button-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--size-2) var(--size-1_5);
  }

  .dev-tools-info-close-button {
    padding: 0 var(--size-2);
    height: 28px;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    transition: background var(--duration-short) ease;
    color: var(--color-gray-1000);
    border-radius: var(--rounded-md-2);
    border: 1px solid var(--color-gray-alpha-400);
    background: var(--color-background-200);
  }

  .dev-tools-info-close-button:hover {
    background: var(--color-gray-400);
  }

  .dev-tools-info-learn-more-button {
    align-content: center;
    padding: 0 var(--size-2);
    height: 28px;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    transition: background var(--duration-short) ease;
    color: var(--color-background-100);
    border-radius: var(--rounded-md-2);
    border: 1px solid var(--color-gray-1000);
    background: var(--color-gray-1000);
  }

  .dev-tools-info-learn-more-button:hover {
    text-decoration: none;
    color: var(--color-background-100);
    opacity: 0.9;
  }
`
