# Invalid Layout or Page Export

#### Why This Error Occurred

Your [layout](https://beta.nextjs.org/docs/api-reference/file-conventions/layout) or [page](https://beta.nextjs.org/docs/api-reference/file-conventions/page) inside the app directory exports an invalid field. In these files, it’s only allowed to export a default component, or Next.js configuration options for layout and pages, such as `revalidate`, `generateStaticParams`, etc.

Other custom export fields are not allowed to avoid typos, as well as using names that can be used as new options by Next.js in the future.

#### Possible Ways to Fix It

You can create a new file and co-locate it with the page or layout. In the new file, you can export any custom fields and import it from anywhere.
