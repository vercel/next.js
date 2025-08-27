type Params = {
  params: {
    slug: string;
  };
};

export async function generateMetadata({ params }: Params) {
  return { title: `Post: ${params.slug}` };
}

export default function Page({ params }: Params) {
  return <>
    <h1>Slug: {params.slug}</h1>
    <p>lorem ipsum</p>
    <p>pretend to update</p>
    <p>another update</p>
    <p>another another update</p>
    <p>this line is really special</p>
  </>;
}
