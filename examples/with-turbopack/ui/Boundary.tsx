import clsx from 'clsx';
import React from 'react';

const Label = ({
  children,
  animateRerendering,
  color,
}: {
  children: React.ReactNode;
  animateRerendering?: boolean;
  color?: 'default' | 'pink' | 'blue' | 'violet' | 'cyan' | 'orange';
}) => {
  return (
    <div
      className={clsx('rounded-full px-1.5 shadow-[0_0_1px_4px_black]', {
        'bg-zinc-800 text-zinc-500': color === 'default',
        'bg-vercel-pink text-pink-100': color === 'pink',
        'bg-vercel-blue text-blue-100': color === 'blue',
        'bg-vercel-cyan text-cyan-100': color === 'cyan',
        'bg-vercel-violet text-violet-100': color === 'violet',
        'bg-vercel-orange text-orange-100': color === 'orange',
        'animate-[highlight_1s_ease-in-out_1]': animateRerendering,
      })}
    >
      {children}
    </div>
  );
};
export const Boundary = ({
  children,
  labels = ['children'],
  size = 'default',
  color = 'default',
  animateRerendering = true,
}: {
  children: React.ReactNode;
  labels?: string[];
  size?: 'small' | 'default';
  color?: 'default' | 'pink' | 'blue' | 'violet' | 'cyan' | 'orange';
  animateRerendering?: boolean;
}) => {
  return (
    <div
      className={clsx('relative rounded-xl border border-dashed', {
        'p-5': size === 'small',
        'p-9': size === 'default',
        'border-zinc-700': color === 'default',
        'border-vercel-pink': color === 'pink',
        'border-vercel-blue': color === 'blue',
        'border-vercel-cyan': color === 'cyan',
        'border-vercel-violet': color === 'violet',
        'border-vercel-orange': color === 'orange',
        'animate-[rerender_1s_ease-in-out_1] text-vercel-pink':
          animateRerendering,
      })}
    >
      <div
        className={clsx(
          'absolute -top-2.5 flex space-x-1 text-[9px] uppercase leading-4 tracking-widest',
          {
            'left-5': size === 'small',
            'left-9': size === 'default',
          },
        )}
      >
        {labels.map((label) => {
          return (
            <Label
              key={label}
              color={color}
              animateRerendering={animateRerendering}
            >
              {label}
            </Label>
          );
        })}
      </div>

      {children}
    </div>
  );
};
