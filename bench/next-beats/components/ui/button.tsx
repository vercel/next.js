'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Boundary } from '@/components/demo/boundary';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'default' | 'sm' | 'icon';

type Props = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50';

const sizes: Record<Size, string> = {
  default: 'px-5 py-2 text-sm',
  icon: 'h-9 w-9 rounded-full',
  sm: 'px-3 py-1.5 text-xs',
};
const variants: Record<Variant, string> = {
  ghost: 'text-gray hover:bg-card hover:text-black dark:hover:bg-card-dark dark:hover:text-white',
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary:
    'border border-divider bg-white text-black hover:bg-card dark:border-divider-dark dark:bg-black dark:text-white dark:hover:bg-card-dark',
};

export function Button({
  children,
  variant = 'primary',
  size = 'default',
  className,
  type = 'button',
  disabled,
  ...props
}: Props) {
  const { pending } = useFormStatus();
  const isSubmit = type === 'submit';
  const isDisabled = disabled || (isSubmit && pending);

  return (
    <Boundary label="Button">
      <button
        type={type}
        disabled={isDisabled}
        className={cn(base, sizes[size], variants[variant], className)}
        {...props}
      >
        {isSubmit && pending && <Spinner />}
        {children}
      </button>
    </Boundary>
  );
}
