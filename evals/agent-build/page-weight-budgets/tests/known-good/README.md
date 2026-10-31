# Known-good solutions

Reviewed passing solutions from screening runs, kept so the grader has to
accept implementations shaped differently from the reference. Each script
applies its recorded files to the untouched fixture and must receive reward 1.

| Script               | Approach                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `next-image.sh`      | `next/image` components, slim card props, an icon context with only the used icons, a shared star def |
| `get-image-props.sh` | `getImageProps` from `next/image` on plain `<img>` elements, an icon sprite, split client islands     |
