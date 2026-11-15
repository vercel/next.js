Make the dashboard useful immediately while its data loads. The Dashboard heading should appear in the initial shell, and the summary cards, revenue chart, and latest invoices should reveal independently as each section becomes ready instead of hiding the entire page behind one loading screen.

Keep Cache Components enabled. Preserve the three independent data loaders in `app/data.ts` and their data, and start their work concurrently. Finish with a production build.
