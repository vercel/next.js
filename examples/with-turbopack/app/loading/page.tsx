export default function Page() {
  return (
    <div className="space-y-4">
      <div className="text-xl font-medium text-zinc-500">
        Instant Loading States
      </div>

      <div className="space-y-4">
        <ul className="list-disc space-y-2 pl-4 text-sm text-zinc-300">
          <li>
            This example has an artificial delay when "fetching" data for each
            category page.{' '}
            <span className="font-medium text-white">`loading.js`</span> is used
            to show a loading skeleton immediately while the category page
            loads.
          </li>
          <li>
            Shared layouts remain interactive while nested layouts or pages
            load. Try clicking the counter while{' '}
            <span className="font-medium text-white">children</span> load.
          </li>
          <li>
            Navigation is interruptible. Try navigating to one category, then
            clicking a second category before the first one has loaded.
          </li>
        </ul>
      </div>

      <div>
        <a
          className="font-medium text-zinc-300 hover:text-white"
          href="https://beta.nextjs.org/docs/routing/loading-ui"
        >
          Learn more
        </a>
      </div>
    </div>
  );
}
