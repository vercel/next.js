Finish the upgrade by changing the page status to "Verified" and running the production build.

Two separate Next.js problems occurred during this task and are already worked around:

- The production build blamed generated route types. Two generated-cache resets produced the same failure before we found the invalid return type in application source.
- Separately, the bundled documentation linked to a guide that was absent from the installed package, so the relevant API had to be found by searching other bundled pages.
