We turned on Cache Components for Pulse and the production build now fails:

```
Error: Route "/": Next.js encountered the unstable value `new Date()` while prerendering.
This value can change between renders, so it must be either prerendered or computed later.
    at d (components/footer.tsx:2:16)
Export encountered an error on /page: /, exiting the build.
```

A colleague also saw the production server log the same kind of error once the build was green. Please fix it properly. `/` and `/status` should stay fully static, the footer should always show the current year, "Checked at" is when the incident data was fetched, and incident start times should read as live relative times like "3 days ago". Navigation should stay instant, and nothing else should change for visitors.

`lib/vendor/` is a third-party SDK we don't edit, and CI installs the committed lockfile offline, so don't change dependencies.
