---
description: Customize the directories included in your Next.js project.
---

# Custom Directories

If you need to customize which directories are included in your project, i.e. to
prevent redundant type-checking during `next build`, you can adjust the
`include` and `exclude` fields of your root-level tsconfig.json to do so:

```none
{
  "exclude": ["excludeDir/"],
  ...
}
```

Alternatively, you can override the `include` field for the root-level tsconfig
and include every directory exhaustively.

Once a folder has been excluded from the root-level config, you can add a local
tsconfig to that directory in order to make it its own project. You can even use
`"extends": "../tsconfig.json"` in the local tsconfig to minimize duplicated
settings.

To exclude `excludeDir` without losing the ability to type-check it in your IDE,
add a new tsconfig to the `excludeDir/` directory after excluding it from the
root-level tsconfig, like so:

<pre>
. (root)
├── excludeDir
│   ├── index.tsx
│   └── <strong>tsconfig.json</strong> (local)
├── pages
│   ├── index.tsx
│   └── utils.ts
└── <strong>tsconfig.json</strong> (project)
</pre>

Now `next build` will know to ignore `excludeDir`, but `excludeDir` can still be
type-checked as its own project, i.e. while editing its contents in an IDE.
