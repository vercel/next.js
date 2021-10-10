import cn from 'clsx';
import Link from 'next/link'

function NavigationItem({
  active,
  children,
  className,
  href,
  onClick,
  customLink,
  dataText,
  as,
}) {
  return (
    <span className={cn({ active }, className, 'navigation-item')}>
      {customLink ? (
        children
      ) : (
        <Link href={href} as={as}>
          <a onClick={onClick} data-text={dataText}>
            {children}
          </a>
        </Link>
      )}
      <style jsx>{`
        .navigation-item,
        .navigation-item > :global(span) {
          display: flex;
          align-items: center;
        }

        .navigation-item :global(a) {
          color: var(--accents-5);
          display: inline-block;
          font-size: var(--font-size-small);
          line-height: var(--line-height-small);
          font-weight: normal;
          padding: 0 10px;
          text-decoration: none;
          text-transform: capitalize;
          transition: color 0.2s ease;
          vertical-align: middle;
        }

        .navigation-item.active :global(a),
        .navigation-item :global(a:hover) {
          color: var(--geist-foreground);
          text-decoration: none;
        }

        .navigation-item.active :global(a) {
          font-weight: 500;
          display: block;
        }

        .navigation-item :global(a)::after {
          content: attr(data-text);
          content: attr(data-text) / '';
          height: 0;
          display: block;
          visibility: hidden;
          overflow: hidden;
          user-select: none;
          pointer-events: none;
          font-weight: 500;
        }

        @media speech {
          .navigation-item:not(.active) :global(a) {
            display: none;
          }
        }

        @media screen and (max-width: 950px) {
          .navigation-item :global(a) {
            font-size: var(--font-size-small);
            line-height: var(--line-height-small);
          }
        }
      `}</style>
    </span>
  );
}

export default NavigationItem;
