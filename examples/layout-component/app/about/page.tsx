export default function Home() {
  return (
    <section>
      <h2>Layout Example (About)</h2>
      <p>
        You can define a layout by default exporting a React component from a
        layout.js file. The component should accept a children prop that will be
        populated with a child layout (if it exists) or a page during rendering.
      </p>
      <p>
        When navigating between pages, we want to persist page state (input
        values, scroll position, etc.) for a Single-Page Application (SPA)
        experience.
      </p>
      <p>
        This layout pattern will allow for state persistence because the React
        component tree is persisted between page transitions. To preserve state,
        we need to prevent the React component tree from being discarded between
        page transitions.
      </p>
      <h3>Try It Out</h3>
      <p>
        To visualize this, try tying in the search input in the{" "}
        <code>Sidebar</code> and then changing routes. You'll notice the input
        state is persisted.
      </p>
    </section>
  );
}
