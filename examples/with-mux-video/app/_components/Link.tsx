import LibLink from "next/link";

/**
 *
 * @param className this component does not merge className with the default classes -- it only appends -- so beware of duplicates
 */
const Link = ({ className, ...rest }: React.ComponentProps<typeof LibLink>) => (
  <LibLink
    className={`underline hover:no-underline focus-visible:no-underline text-red-600 ${className}`}
    {...rest}
  />
);

export default Link;
