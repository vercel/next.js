export const dynamic = "force-dynamic";

async function getData() {
  return new Date().toISOString();
}

export default async function Page() {
  const time = await getData();

  return (
    <main>
      <h1>SSR Caching with Next.js</h1>
      <time dateTime={time}>{time}</time>
    </main>
  );
}
