Deploy/Build instructions for `apps/docs`

1. Add required secrets to your repository or Vercel project:
   - `VERCEL_TOKEN` (for GitHub Actions deploy)
   - `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (optional; helps target the right Vercel project)

2. To build locally:

```bash
pnpm install
pnpm --filter=apps/docs build
``` 

3. To run locally:

```bash
pnpm --filter=apps/docs dev
```

4. The GitHub Actions workflow `.github/workflows/deploy-docs.yml` will build and deploy to Vercel when pushed.

If you want me to open a PR with these changes, eu posso criar o branch, commitar e abrir o PR automaticamente.