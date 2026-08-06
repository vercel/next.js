Turbopack models the user's code as it travels through Turbopack in multiple ways, each of which can be thought of as a layer in a larger system.

```text
┌───────────────┬──────────────────────────────┐
│    Sources    │                              │
├───────────────┘                              │
│                     What "the user wrote" as │
│                             application code │
└──────────────────────────────────────────────┘

┌───────────────┬──────────────────────────────┐
│    Modules    │                              │
├───────────────┘                              │
│        The "compiler's understanding" of the │
│                             application code │
└──────────────────────────────────────────────┘

┌───────────────┬──────────────────────────────┐
│ Output assets │                              │
├───────────────┘                              │
│ What the "target environment understands" as │
│                       executable application │
└──────────────────────────────────────────────┘
```

Each layer builds on the previous one: [`Source`]s are processed into [`Module`]s, and [`Module`]s are transformed into [`OutputAsset`]s. For a given set of entry points, the full module graph is discovered and analyzed before chunking into [`OutputAsset`]s.

[`Source`]: crate::source::Source
[`Module`]: crate::module::Module
[`OutputAsset`]: crate::output::OutputAsset

## Sources

[`Source`]s are content of code or files before they are analyzed and converted into [`Module`]s. They might be the original source file the user has written, or a virtual source code that was generated. They might also be transformed from other [`Source`] types, e.g. when using a preprocessor like Sass or webpack loaders.

Sources do **not** model references (the relationships between files like through `import`, `sourceMappingURL`, etc.).

Each Source has an identifier composed of file path, query, fragment, and other modifiers.

## Modules

[`Module`]s are the result of parsing, transforming and analyzing [`Source`]s. They include references to other modules as analyzed.

References can be followed to traverse a subgraph of the module graph. They implicitly form the module graph by exposing references.

Each [`Module`] has an identifier composed of file path, query, fragment, and other modifiers.

## Output Assets

[`OutputAsset`]s are artifacts that are understood by the target environment. They include references to other output assets.

[`OutputAsset`]s are usually the result of transforming one or more modules to a given output format. This can be a very simple transformation like copying the [`Source`] content (like with static assets like images), or a complex transformation like chunking and bundling modules (like with JavaScript or CSS).

[`OutputAsset`]s can be emitted to disk or served from the dev server.

Each [`OutputAsset`] has a file path.

## Common Supertrait: Asset

[`Source`]s and [`OutputAsset`]s both implement the [`Asset`] trait, which provides access to file content. [`Module`]s do not implement [`Asset`], as they represent the compiler's parsed understanding of code rather than raw file content.

[`Asset`]: crate::asset::Asset

## Example

<figure style="display: flex; flex-direction: column; justify-content: center;">
<img alt="An example of sources, modules, and output assets and how they refer to each other" width="800px" src="https://h8dxkfmaphn8o0p3.public.blob.vercel-storage.com/rustdoc-images/layers.excalidraw.png">
<!-- https://excalidraw.com/#json=5Ll5jG5OIcBUPrCdq3Zxu,Iw_HDeXFXuU8Pne3TAEIMA -->
</figure>
