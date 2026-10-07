export default function Badge({ children }) {
  return (
    <span className="inline-block rounded-full bg-primary-600 px-3 py-1 text-xs font-medium text-white">
      {children}
    </span>
  )
}
