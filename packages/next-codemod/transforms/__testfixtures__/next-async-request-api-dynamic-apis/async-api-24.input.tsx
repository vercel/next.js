import { cookies } from 'next/headers'

function useHook() {}

export default function Page() {
  useHook()
  const c = cookies();
}

export function generateMetadata() {
  cookies()
}
