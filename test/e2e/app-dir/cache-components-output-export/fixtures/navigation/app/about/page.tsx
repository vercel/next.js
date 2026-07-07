async function getAbout() {
  'use cache'
  return 'About page content'
}

export default async function Page() {
  return <h1 id="about">{await getAbout()}</h1>
}
