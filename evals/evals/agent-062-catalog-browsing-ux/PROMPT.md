Finish the browsing experience for the Ridgeline shop at /products.

Search and category filters should stay usable while products load. Show
loading feedback, and make sure the results match the latest selection even
when requests finish out of order. Keep keyboard focus in the control the
customer is using.

Show a useful empty state when nothing matches. If the catalog request fails,
show an error and let the customer retry without losing their search or filter.
Opening a product and using its Back to products link should return to the
same search and category. All of this should work with the keyboard too.
Announce loading, empty results, and errors to assistive technology.

Keep the existing product data, catalog API (q and category parameters), routes,
and accessible control names. You can change the implementation and styling.

Start the development server with npm run dev at http://localhost:3100. Browser
tools are installed. If the next-dev-loop Skill is installed, use it for this
task. Otherwise use your usual workflow. Do not install additional Skills.
