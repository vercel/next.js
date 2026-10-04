// Example of the most common docs family: a file tree mapped to URLs, with
// bracket arrows for layout scope, a muted "not routable" pill and status
// badges. Modelled on docs/light/nested-layouts.png and
// docs/light/project-organization-colocation.png. Not referenced by any mdx;
// it exists to show the primitives and to compare against the real images.

export default {
  name: 'example-file-tree',
  height: 760,
  draw(t, lib) {
    const s = []
    // Center the whole block: bracket reach + tree + arrows + pills + badges.
    const reach = 110,
      treeW = 400,
      gap = 180,
      urlW = 400,
      badgeGap = 30,
      badgeW = 162
    const treeX =
      Math.round(
        (1600 - (reach + treeW + gap + urlW + badgeGap + badgeW)) / 2
      ) + reach
    const top = 60
    const rows = [
      { label: 'app', icon: 'folder' },
      { label: 'layout.js', icon: 'layout', depth: 1 },
      { label: 'page.js', icon: 'file', depth: 1 },
      { label: 'blog', icon: 'folder', depth: 1 },
      { label: 'layout.js', icon: 'layout', depth: 2, bold: true, dot: true },
      { label: 'page.js', icon: 'file', depth: 2 },
      { label: 'nav.js', icon: 'file', depth: 2, bold: true, dot: true },
      { label: '...', icon: 'folder', depth: 2, muted: true },
    ]
    const tree = lib.treePanel(t, treeX, top, treeW, rows)
    s.push(tree.svg)

    // The root layout wraps everything below it; the blog layout wraps its routes.
    s.push(lib.bracketArrow(t, treeX, tree.rowY(1), tree.rowY(4), { reach }))
    s.push(
      lib.bracketArrow(t, treeX, tree.rowY(4), tree.rowY(5), { reach: 60 })
    )
    s.push(
      lib.bracketArrow(t, treeX, tree.rowY(4), tree.rowY(6), { reach: 60 })
    )

    // URL pills to the right, aligned to rows
    const urlX = treeX + treeW + gap
    const pill = (row, path, muted) => {
      const y = tree.rowY(row) - lib.TREE_ROW / 2
      s.push(lib.arrow(t, treeX + treeW + 50, urlX - 50, tree.rowY(row)))
      s.push(lib.urlPill(t, urlX, y, urlW, path, { muted }))
      s.push(
        lib.statusBadge(
          t,
          urlX + urlW + badgeGap,
          tree.rowY(row) - 17,
          muted ? 'Not Routable' : 'Routable',
          muted ? 'red' : 'green'
        )
      )
    }
    pill(2, '/')
    pill(5, '/blog')
    pill(6, '/blog/nav', true)

    return s.join('\n')
  },
}
