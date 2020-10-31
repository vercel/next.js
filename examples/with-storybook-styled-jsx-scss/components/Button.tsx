import React from 'react'

export interface ButtonProps {
  /**
   * Is this the principal call to action on the page?
   */
  primary?: boolean
  /**
   * What background color to use
   */
  backgroundColor?: string
  /**
   * How large should the button be?
   */
  size?: 'small' | 'medium' | 'large'
  /**
   * Button contents
   */
  label: string
  /**
   * Optional click handler
   */
  onClick?: () => void
}

/**
 * Primary UI component for user interaction
 */
export const Button: React.FC<ButtonProps> = ({
  primary = false,
  size = 'medium',
  backgroundColor,
  label,
  ...props
}) => {
  const mode = primary
    ? 'storybook-button--primary'
    : 'storybook-button--secondary'
  return (
    <>
      <button
        type="button"
        className={['storybook-button', `storybook-button--${size}`, mode].join(
          ' '
        )}
        style={{ backgroundColor }}
        {...props}
      >
        {label}
      </button>
      <style jsx>{`
        .storybook-button {
          font-family: 'Nunito Sans', 'Helvetica Neue', Helvetica, Arial,
            sans-serif;
          font-weight: 700;
          border: 0;
          border-radius: 3em;
          cursor: pointer;
          display: inline-block;
          line-height: 1;
        }
        .storybook-button--primary {
          color: white;
          background-color: #1ea7fd;
        }
        .storybook-button--secondary {
          color: #333;
          background-color: transparent;
          box-shadow: rgba(0, 0, 0, 0.15) 0px 0px 0px 1px inset;
        }
        .storybook-button--small {
          font-size: 12px;
          padding: 10px 16px;
        }
        .storybook-button--medium {
          font-size: 14px;
          padding: 11px 20px;
        }
        .storybook-button--large {
          font-size: 16px;
          padding: 12px 24px;
        }
      `}</style>
    </>
  )
}
