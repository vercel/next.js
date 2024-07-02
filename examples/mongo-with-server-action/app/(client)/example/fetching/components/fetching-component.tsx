import { getExample } from 'app/server/example/action';

export default async function FetchingComponent() {
  const data = await getExample();

  return (
    <div className="">
      <h1>{data.title}</h1>
      <span>{data.description}</span>
    </div>
  );
}
