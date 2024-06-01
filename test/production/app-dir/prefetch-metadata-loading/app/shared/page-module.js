export async function generateMetadata() {
  // console.log("generateMetadata");
  // const data = await fetch("https://swapi.dev/api/people/1");
  // const json = await data.json();
  await new Promise((resolve) => setTimeout(resolve, 2000))

  return {
    title: 'test',
  }
}

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return (
    <div>
      <h1>Page content</h1>
      <p>This is the about page.</p>
    </div>
  )
}
