import { Boundary } from '@/ui/Boundary';

export default function Page({ children }: { children: React.ReactNode }) {
  return <Boundary>{children}</Boundary>;
}
