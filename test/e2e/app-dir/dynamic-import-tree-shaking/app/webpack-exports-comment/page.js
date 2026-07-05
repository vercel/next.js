export default async function Page() {
  const { commentUsed } = await import(
    /* webpackExports: ["commentUsed"] */ '../../lib/comment-module'
  )
  return <div>{commentUsed()}</div>
}
