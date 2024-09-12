export default async function Page({ searchParams: asyncSearchParams } : { searchParams: Promise<{ [key: string]: string }> }) {
  const searchParams = await asyncSearchParams;
  globalThis.f1(searchParams);
  globalThis.f2(searchParams);
}
