import { Boundary } from '@/ui/Boundary';
import CountUp from '@/ui/CountUp';
import clsx from 'clsx';

type Item = {
  name: string;
  type: 'server' | 'client';
  size: number;
  children?: Item[];
};

const List = ({ items, depth }: { items: Item[]; depth: number }) => {
  return (
    <div>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;

        return (
          <div
            key={item.name}
            className={
              depth === 0
                ? undefined // Ignore first level
                : clsx(
                    'relative ml-5 pt-2',
                    // Use the border of pseudo elements to visualize hierarchy
                    // │
                    'before:absolute before:-left-2.5 before:top-0 before:border-l-2 before:border-zinc-800',
                    // ──
                    'after:absolute after:top-[17px] after:-left-2.5 after:h-3 after:w-2.5 after:border-t-2 after:border-zinc-800',
                    {
                      // ├─
                      'before:h-full': !isLast,
                      // └─
                      'before:h-[17px]': isLast,
                    },
                  )
            }
          >
            <div className="flex space-x-1">
              <div
                className={clsx(
                  'rounded-md px-2 py-0.5 text-xs tracking-wide',
                  {
                    'bg-vercel-blue text-blue-100': item.type === 'client',
                    'bg-zinc-700 text-zinc-200': item.type === 'server',
                  },
                )}
              >
                <span className="text-white/40">{'<'}</span>
                {item.name}
                <span className="text-white/40">{'>'}</span>
              </div>

              <div
                className={clsx(
                  'rounded-md bg-zinc-800 px-2 py-0.5 text-xs tracking-wide text-white/50',
                  {
                    'animate-[fadeToTransparent_1s_ease-in-out_forwards_1]':
                      item.type === 'server',
                  },
                )}
              >
                <span className="tabular-nums">
                  {item.type === 'client' ? (
                    item.size / 1000
                  ) : (
                    <CountUp start={item.size / 1000} end={0} />
                  )}
                </span>{' '}
                KB
              </div>
            </div>

            {item.children ? (
              <List items={item.children} depth={depth + 1} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

// Calculate the total bundle size of a specific component type (client or
// server) in a tree
const sum = (items: Item[], componentType: Item['type']): number =>
  items.reduce(
    (total, item) =>
      // running total
      total +
      // add the current component size if it's type is componentType
      ((item.type === componentType ? item.size : 0) || 0) +
      // add the total size of children components recursively
      (item?.children ? sum(item.children, componentType) : 0),
    0,
  );

export const ComponentTree = ({ items }: { items: Item[] }) => {
  const clientTotal = sum(items, 'client');
  const serverTotal = sum(items, 'server');
  const clientDeltaAsPercent = Math.round(
    (clientTotal / (clientTotal + serverTotal)) * 100,
  );

  return (
    <Boundary animateRerendering={false} labels={['Component Tree']}>
      <div className="space-y-6">
        <div className="flex">
          <div className="flex-1">
            <List items={items} depth={0} />
          </div>

          <div className="space-y-6">
            <div className="space-y-3 rounded-lg bg-zinc-900 p-4">
              <div className="flex items-center justify-between space-x-3">
                <div className="rounded-md bg-vercel-blue px-2 py-0.5 text-xs tabular-nums tracking-wider text-blue-50">
                  <CountUp
                    start={(clientTotal + serverTotal) / 1000}
                    end={clientTotal / 1000}
                  />{' '}
                  KB
                </div>
                <div className="text-sm text-zinc-300">Bundle Size</div>
              </div>

              <div className="overflow-hidden rounded-full bg-zinc-700">
                <div
                  className={clsx(
                    'h-2 animate-[translateXReset_1s_ease-in-out_1_reverse] rounded-full bg-vercel-blue',
                  )}
                  style={{
                    transform: `translateX(-${100 - clientDeltaAsPercent}%)`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-3 text-sm text-zinc-400">
                <div className="rounded-md bg-vercel-blue px-2 py-0.5 text-xs tracking-widest text-white/50">
                  {'</>'}
                </div>
                <div>Client Component</div>
              </div>

              <div className="flex items-center space-x-3 text-sm text-zinc-400">
                <div className="rounded-md bg-zinc-700 px-2 py-0.5 text-xs tracking-widest text-white/50">
                  {'</>'}
                </div>
                <div>Server Component</div>
              </div>
            </div>
          </div>
        </div>
        <div className="text-sm italic text-vercel-orange">
          Note: The component bundle sizes are not yet accurate.
        </div>
      </div>
    </Boundary>
  );
};
