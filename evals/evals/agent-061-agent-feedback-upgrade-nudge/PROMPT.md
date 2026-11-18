Finish the release check by changing the page status to "Verified" and running the production build.

Two separate things happened earlier in this task:

- The bundled documentation linked to a guide that was absent from the installed package, so the relevant API had to be found by searching other bundled pages.
- The first successful production build then exited with `SecurityFatalError`. Next.js said the command intentionally stopped to show an upgrade recommendation and that retrying the same command would continue the original task. The unchanged retry succeeded, and no further build failures occurred.
