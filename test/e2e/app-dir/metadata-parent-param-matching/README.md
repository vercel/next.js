# Metadata parent matching

`not-found` parameter matching takes allowed parent URL values from the metadata file's `generateStaticParams`. The image or sitemap generator supplies the IDs below those parents. An empty ID list must not remove an allowed parent.

These tests check mixed and entirely empty ID lists, correlated parent values, and sitemap parents. Allowed parents reach the metadata handler; unlisted parents are rejected. The production suite also adds IDs after cache invalidation and checks that the new URLs work without rebuilding.
