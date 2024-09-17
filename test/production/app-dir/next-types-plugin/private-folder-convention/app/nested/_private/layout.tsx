// not exported as default, so is not following convention of layout.tsx file
// which would throw at type check if was not _private
export function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
