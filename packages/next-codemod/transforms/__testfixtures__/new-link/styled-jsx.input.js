import Link from 'next/link';

const CustomLink = ({
  href,
  title,
  children,
}) => {
  return (
    <span className="link-container">
      <Link href={href}>
        <a className="link" title={title}>
          {children}
        </a>
      </Link>
      <style jsx>{`
        .link {
          text-decoration: none;
          color: var(--geist-foreground);
          font-weight: 500;
        }
      `}</style>
    </span>
  );
};

export default CustomLink;