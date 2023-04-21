import React from 'react';
import classes from './index.module.scss';

export type VerticalPaddingOptions = 'large' | 'medium' | 'none';

type Props = {
  top?: VerticalPaddingOptions
  bottom?: VerticalPaddingOptions
  children: React.ReactNode
  className?: string
}

export const VerticalPadding: React.FC<Props> = ({
  top = 'medium',
  bottom = 'medium',
  className,
  children,
}) => {
  return (
    <div
      className={[
        className,
        classes[`top-${top}`],
        classes[`bottom-${bottom}`],
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
