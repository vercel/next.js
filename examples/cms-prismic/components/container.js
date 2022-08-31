/**
 * @param {object} props
 * @param {import("react").ReactNode} props.children
 */
export default function Container({ children }) {
  return <div className="container mx-auto px-5">{children}</div>
}
