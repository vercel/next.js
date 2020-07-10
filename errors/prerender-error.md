# Prerender Error

#### Why This Error Occurred

While prerendering a page an error occurred. This can occur for many reasons from adding non-pages e.g. `components` to your `pages` folder or expecting props to be populated which are not.

#### Possible Ways to Fix It

- Make sure to move any non-pages out of the `pages` folder
- Check for any code that assumes a prop is available even when it might not be. e.g., have default data for all dynamic pages' props.
- Check for any out of date modules that you might be relying on
