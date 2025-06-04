interface PageProps {
  params: {
    id: string
    name: string
  }
}

export default function Page({ params: { id, name } }: PageProps) {
  globalThis.f1(id)
  globalThis.f2(name)
}
