const content = await Promise.resolve("hi y'all")

export default function Custom404() {
  return <h1 id="content-404">{content}</h1>
}
