'use client'

import { use } from 'react'

// Interactive variant switcher: every dimension of the route matrix is a
// control whose checked state derives from the server-rendered scenario
// (the current URL), and changing a control navigates to the equivalent
// URL with the new dimension value.
//
// Navigation is a FULL page load (window.location, not router.push): the
// badge paint scripts describe initial-HTML render provenance, and client
// navigations re-render content from flight data without re-executing
// them, which breaks the UI's coherence. This whole fixture is a test of
// initial HTML loading, so every control change reloads the document.
//
// - lang and category are RADIOS between their prerendered value (the one
//   generateStaticParams enumerates in the partial/fully matrices) and a
//   canonical non-prerendered value. A current value that is neither (e.g.
//   a probe-generated unique value) reads as non-prerendered.
// - the matrix is a three-way RADIO.
// - the branch (root params) and shell topology are CHECKBOXES.
//
// Every combination is navigable — including dynamic-param with root
// params, which lands on a tombstone page explaining that the combination
// cannot exist.
//
// This component unwraps params with use(), so it inherits the params'
// disposition exactly like the previous server-component links did: on
// empty-shell pages it renders in the deferred region; on non-empty pages
// it must be wrapped in its own Suspense boundary so the page shell stays
// param-free.
const MATRICES = [
  'partial-static-param',
  'fully-static-param',
  'dynamic-param',
] as const

const PRERENDERED_LANG = 'en'
const NOT_PRERENDERED_LANG = 'fr'
const PRERENDERED_CATEGORY = 'shoes'
const NOT_PRERENDERED_CATEGORY = 'toys'
const PRERENDERED_ID = '1'
const NOT_PRERENDERED_ID = '2'

type Matrix = (typeof MATRICES)[number]
type Branch = 'with-root-param' | 'without-root-param'

export function VariantControls({
  params,
  matrix,
  tree,
  branch,
}: {
  params: Promise<{ lang: string; category: string; id: string }>
  matrix: Matrix
  tree: string
  branch: Branch
}) {
  const { lang, category, id } = use(params)

  const current = { matrix, branch, tree, lang, category, id }

  function hrefFor(dims: typeof current) {
    // Trees that only exist in one place (e.g. empty-shell-dynamic in the
    // standalone app) map to their closest equivalent when any dimension
    // changes.
    const targetTree =
      dims.tree === tree && dims.matrix === matrix && dims.branch === branch
        ? dims.tree
        : dims.tree === 'empty-shell-dynamic'
          ? 'empty-shell'
          : dims.tree

    // Every route follows the same positional scheme —
    // /<scenario>/<root-param>/<shell>/<lang>/<category>/<id> — the
    // with/without-root-param distinction lives entirely in where each
    // branch's first layout sits (above [lang] or at [lang]).
    return `/${dims.matrix}/${dims.branch}/${targetTree}/${dims.lang}/${dims.category}/${dims.id}`
  }

  function push(patch: Partial<typeof current>) {
    window.location.assign(hrefFor({ ...current, ...patch }))
  }

  const langLabel = branch === 'with-root-param' ? 'root param' : 'lang'
  const langIsPrerendered = lang === PRERENDERED_LANG
  const categoryIsPrerendered = category === PRERENDERED_CATEGORY

  return (
    <nav
      style={{
        fontFamily: 'monospace',
        fontSize: 12,
        marginTop: 12,
        borderTop: '1px dashed #94a3b8',
        paddingTop: 8,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      <fieldset style={{ border: '1px solid #cbd5e1', padding: 6 }}>
        <legend>{langLabel}</legend>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="variant-lang"
            checked={langIsPrerendered}
            onChange={() => push({ lang: PRERENDERED_LANG })}
          />{' '}
          prerendered ({PRERENDERED_LANG})
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="variant-lang"
            checked={!langIsPrerendered}
            onChange={() => push({ lang: NOT_PRERENDERED_LANG })}
          />{' '}
          non-prerendered (
          {lang === PRERENDERED_LANG ? NOT_PRERENDERED_LANG : lang})
        </label>
      </fieldset>

      <fieldset style={{ border: '1px solid #cbd5e1', padding: 6 }}>
        <legend>category</legend>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="variant-category"
            checked={categoryIsPrerendered}
            onChange={() => push({ category: PRERENDERED_CATEGORY })}
          />{' '}
          prerendered ({PRERENDERED_CATEGORY})
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="variant-category"
            checked={!categoryIsPrerendered}
            onChange={() => push({ category: NOT_PRERENDERED_CATEGORY })}
          />{' '}
          non-prerendered (
          {category === PRERENDERED_CATEGORY
            ? NOT_PRERENDERED_CATEGORY
            : category}
          )
        </label>
      </fieldset>

      {/* Only the fully-static matrix enumerates an id value, so id
          prerender-ness is only a real dimension there — the radios stay
          visible but disabled elsewhere to teach exactly that. */}
      <fieldset
        style={{ border: '1px solid #cbd5e1', padding: 6 }}
        disabled={matrix !== 'fully-static-param'}
        title={
          matrix !== 'fully-static-param'
            ? 'id is never prerenderable outside the fully-static-param matrix'
            : undefined
        }
      >
        <legend>id</legend>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="variant-id"
            checked={id === PRERENDERED_ID}
            onChange={() => push({ id: PRERENDERED_ID })}
          />{' '}
          prerendered ({PRERENDERED_ID})
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="variant-id"
            checked={id !== PRERENDERED_ID}
            onChange={() => push({ id: NOT_PRERENDERED_ID })}
          />{' '}
          non-prerendered ({id === PRERENDERED_ID ? NOT_PRERENDERED_ID : id})
        </label>
      </fieldset>

      <fieldset style={{ border: '1px solid #cbd5e1', padding: 6 }}>
        <legend>matrix</legend>
        {MATRICES.map((variantMatrix) => (
          <label key={variantMatrix} style={{ display: 'block' }}>
            <input
              type="radio"
              name="variant-matrix"
              checked={matrix === variantMatrix}
              onChange={() => push({ matrix: variantMatrix })}
            />{' '}
            {variantMatrix}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ border: '1px solid #cbd5e1', padding: 6 }}>
        <legend>structure</legend>
        <label style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={branch === 'with-root-param'}
            onChange={(event) =>
              push({
                branch: event.target.checked
                  ? 'with-root-param'
                  : 'without-root-param',
              })
            }
          />{' '}
          root params
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={tree !== 'non-empty-shell'}
            onChange={(event) =>
              push({
                tree: event.target.checked ? 'empty-shell' : 'non-empty-shell',
              })
            }
          />{' '}
          empty shell
        </label>
      </fieldset>
    </nav>
  )
}
