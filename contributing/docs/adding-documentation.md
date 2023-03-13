# Updating Documentation Paths

Our documentation currently leverages a [manifest file](/docs/manifest.json), which is how documentation entries are checked.

When adding a new entry under an existing category you only need to add an entry with `{title: '', path: '/docs/path/to/file.md'}`. The "title" is what is shown on the sidebar.

When moving the location/url of an entry, the "title" field can be removed from the existing entry and the ".md" extension removed from the "path", then a "redirect" field with the shape of `{permanent: true/false, destination: '/some-url'}` can be added. A new entry should be added with the "title" and "path" fields if the document is renamed within the [`docs` folder](/docs) that points to the new location in the folder, e.g. `/docs/some-url.md`

Example of moving documentation file:

Before:

```json
[
  {
    "path": "/docs/original.md",
    "title": "Hello world"
  }
]
```

After:

```json
[
  {
    "path": "/docs/original",
    "redirect": {
      "permanent": false,
      "destination": "/new"
    }
  },
  {
    "path": "/docs/new.md",
    "title": "Hello world"
  }
]
```

Note: the manifest is checked automatically in the "lint" step in CI when opening a PR.
