export default function Page() {
  return (
    <>
      <p>
        This test does some hacky stuff to cause a `Math.random()` call to
        happen during the component tree creation which happens before the RSC
        render. Before the fix that this test accompanied landed this kind of
        sync IO was reported as a problem in Dev and in runtime during start. In
        practice this would be because of an OTEL span generation during
        create-component-tree. With this fix in place the create-component-tree
        function will not leak any sync IO results into the final prerender.
      </p>
      <p>
        In the long run we ought to move create-component-tree into the render
        itself and ensure the tree structure comports with CacheComponent rules.
        This test can be deleted at that time.
      </p>
    </>
  )
}
