export default function Page() {
  return (
    <div className="space-y-4">
      <div className="text-xl font-medium text-zinc-500">Client Context</div>

      <div className="space-y-4">
        <ul className="list-disc space-y-2 pl-4 text-sm text-zinc-300">
          <li>
            Pass context <strong>between Client Components</strong> that cross
            the Server/Client Component boundary.
          </li>
          <li>Click the counter and navigate between pages.</li>
          <li>
            Because the context provider is above the nested layouts and pages
            the number of clicks remains constant even between navigations.
          </li>
        </ul>
      </div>

      <div>
        <a
          className="font-medium text-zinc-300 hover:text-white"
          href="https://beta.nextjs.org/docs/rendering/server-and-client-components#using-context"
        >
          Learn more
        </a>
      </div>
    </div>
  );
}
