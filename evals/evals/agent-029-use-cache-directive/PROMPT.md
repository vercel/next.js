You are building an admin product catalog page for an e-commerce team.

The catalog is read-heavy and should feel fast for day-to-day browsing, so avoid re-querying product data on every request.

Admins can trigger a "Sync latest catalog" action from the page when upstream ERP/PIM data changes (pricing, inventory, availability). After submitting, they should be able to continue working immediately, even if the product list is briefly stale.

The expected behavior is that product data is refreshed in the background and becomes up to date shortly after, across any views that depend on the same catalog data.

Implement the sync trigger as a regular HTML form that uses an inline Server Action in the page.
Use the cache tag name `"products"` consistently for catalog caching and invalidation.

In practice, sync jobs can touch thousands of SKUs, so operators prioritize a responsive admin experience and eventual consistency across catalog views over forcing every request to block on freshly recomputed data.
