#!/usr/bin/env node
/**
 * instant-lint (proof of concept)
 *
 * Static, conservative approximation of Cache Components' instant-navigation
 * validation (`packages/next/src/server/app-render/instant-validation/`).
 * Given an `app/` directory, it analyzes each route segment entry (page,
 * layout, default) without running a bundler or rendering:
 *
 *   1. builds a module graph from the segment entry via TypeScript module
 *      resolution (imports only — no compilation, no chunking),
 *   2. finds render-reachable `await` / `use()` expressions and classifies
 *      each one against the runtime's own taxonomy (runtime data, uncached
 *      dynamic IO, sync IO, client hooks — see
 *      packages/next/src/server/app-render/blocking-route-messages.ts),
 *   3. checks whether every potentially-blocking site is below a <Suspense>
 *      boundary or inside a `"use cache"` scope,
 *   4. emits the same remedy menu the dev overlay's Instant Insights fix
 *      cards use ([stream] / [cache] / [block] — see
 *      packages/next/src/next-devtools/dev-overlay/components/instant/instant-guidance-data.ts).
 *
 * Deliberate non-goals (this is where the runtime validator remains the
 * source of truth — see README.md "Where static analysis must give up"):
 * unresolvable promises (`new Promise`, promisify wrappers), conditional
 * paths that depend on request data, cacheLife thresholds, and cross-slot
 * interactions. Those are reported as explicit deopts, never guessed at.
 */

import ts from 'typescript'
import path from 'node:path'
import fs from 'node:fs'
import { parseArgs } from 'node:util'

const SEGMENT_ENTRIES = ['page', 'layout', 'default']
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']

// Matches the runtime classification: cookies()/headers()/draftMode() and
// params/searchParams hang in a static prerender but resolve in a runtime
// prefetch (makeRuntimeHangingPromise), so the [cache] remedy does not apply.
const RUNTIME_DATA_IMPORTS = new Map([
  ['next/headers', new Set(['cookies', 'headers', 'draftMode'])],
])
// connection() (and uncached fetch) hang in every prerender
// (makeDynamicHangingPromise).
const DYNAMIC_IMPORTS = new Map([['next/server', new Set(['connection'])]])
// Sync IO aborts the prerender with no `await` involved and cannot be
// silenced by `instant = false` (throwIfSyncIOUsed runs before the
// allowEmptyStaticShell bypass in dynamic-rendering.ts).
const SYNC_IO_GLOBALS = new Set([
  'Date.now',
  'Math.random',
  'crypto.randomUUID',
  'crypto.getRandomValues',
])
// URL data in client components blocks the SSR shell without Suspense
// (ClientHookDynamicError).
const BLOCKING_CLIENT_HOOKS = new Set(['useSearchParams'])

const MAX_CALL_DEPTH = 16

const REMEDIES = {
  stream: '[stream] Provide a placeholder with `<Suspense fallback={...}>`',
  cache: '[cache] Cache the data access with `"use cache"`',
  block: '[block] Set `export const instant = false` to allow a blocking route',
  connection: '[dynamic] Read the value after `await connection()`',
  client: '[client] Move the value into a Client Component',
}

const FINDING_KINDS = {
  runtime: {
    label: 'runtime data',
    remedies: ['stream', 'block'],
  },
  dynamic: {
    label: 'uncached data',
    remedies: ['stream', 'cache', 'block'],
  },
  unknown: {
    label: 'unclassified await (assumed dynamic)',
    remedies: ['stream', 'cache', 'block'],
  },
  'sync-io': {
    label: 'sync IO (not silenced by `instant = false`)',
    remedies: ['connection', 'cache', 'client'],
  },
  'client-hook': {
    label: 'URL data in a Client Component',
    remedies: ['stream', 'block'],
  },
}

// ---------------------------------------------------------------------------
// Module loading and indexing
// ---------------------------------------------------------------------------

const compilerOptions = {
  allowJs: true,
  jsx: ts.JsxEmit.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ESNext,
}

/** @type {Map<string, Module | null>} */
const moduleCache = new Map()

class Module {
  constructor(filePath, sourceFile) {
    this.path = filePath
    this.sourceFile = sourceFile
    /** 'client' | 'cache' | 'server' | null */
    this.directive = getDirective(sourceFile)
    /** local name -> { specifier, importedName, resolvedPath } */
    this.imports = new Map()
    /** exported name -> { local } | { reexport: { specifier, name } } */
    this.exports = new Map()
    /** local top-level binding name -> ts.Node (function-like or initializer) */
    this.locals = new Map()
    this.defaultExport = null
    /** value of `export const instant`, if statically extractable */
    this.instantConfig = undefined
    indexModule(this)
  }
}

function loadModule(filePath) {
  const resolved = fs.existsSync(filePath) ? fs.realpathSync(filePath) : null
  if (!resolved) return null
  if (moduleCache.has(resolved)) return moduleCache.get(resolved)
  const text = fs.readFileSync(resolved, 'utf8')
  const sourceFile = ts.createSourceFile(
    resolved,
    text,
    ts.ScriptTarget.ESNext,
    true,
    resolved.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX
  )
  const mod = new Module(resolved, sourceFile)
  moduleCache.set(resolved, mod)
  return mod
}

function resolveImport(fromPath, specifier) {
  const result = ts.resolveModuleName(
    specifier,
    fromPath,
    compilerOptions,
    ts.sys
  )
  const resolved = result.resolvedModule?.resolvedFileName
  if (!resolved) return null
  if (resolved.includes(`${path.sep}node_modules${path.sep}`)) return null
  return resolved
}

function getDirective(node) {
  const body = ts.isSourceFile(node) ? node.statements : node.body?.statements
  if (!body) return null
  for (const statement of body) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      const text = statement.expression.text
      if (text === 'use client') return 'client'
      if (text === 'use cache' || text.startsWith('use cache:')) return 'cache'
      if (text === 'use server') return 'server'
      continue
    }
    break
  }
  return null
}

function indexModule(mod) {
  for (const statement of mod.sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier.text
      const clause = statement.importClause
      if (!clause) continue
      const resolvedPath = resolveImport(mod.path, specifier)
      if (clause.name) {
        mod.imports.set(clause.name.text, {
          specifier,
          importedName: 'default',
          resolvedPath,
        })
      }
      const bindings = clause.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          mod.imports.set(element.name.text, {
            specifier,
            importedName: (element.propertyName ?? element.name).text,
            resolvedPath,
          })
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        mod.imports.set(bindings.name.text, {
          specifier,
          importedName: '*',
          resolvedPath,
        })
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      mod.locals.set(statement.name.text, statement)
      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
          mod.defaultExport = statement
        } else {
          mod.exports.set(statement.name.text, { local: statement.name.text })
        }
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      mod.defaultExport = statement
    } else if (ts.isVariableStatement(statement)) {
      const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const name = decl.name.text
        if (decl.initializer) mod.locals.set(name, decl.initializer)
        if (isExported) {
          mod.exports.set(name, { local: name })
          if (name === 'instant') {
            mod.instantConfig = extractLiteral(decl.initializer)
          }
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      mod.defaultExport = statement.expression
    } else if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier?.text
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const exportedName = element.name.text
          const sourceName = (element.propertyName ?? element.name).text
          mod.exports.set(
            exportedName,
            specifier
              ? { reexport: { specifier, name: sourceName } }
              : { local: sourceName }
          )
        }
      }
    }
  }
}

function hasModifier(node, kind) {
  return node.modifiers?.some((m) => m.kind === kind) ?? false
}

function extractLiteral(node) {
  if (!node) return undefined
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isObjectLiteralExpression(node)) return 'object'
  return undefined
}

// ---------------------------------------------------------------------------
// Reference resolution (identifier -> function body, across modules)
// ---------------------------------------------------------------------------

/**
 * Resolves an identifier in a module to a callable definition, following
 * imports and re-exports. Returns:
 *   { kind: 'local', mod, node }        — a function body we can analyze
 *   { kind: 'special', source, name }   — a known next/react API
 *   { kind: 'external', specifier }     — outside the resolvable graph
 *   null                                — not found
 */
function resolveReference(mod, name, seen = new Set()) {
  for (const [source, names] of RUNTIME_DATA_IMPORTS) {
    const imported = mod.imports.get(name)
    if (imported?.specifier === source && names.has(imported.importedName)) {
      return { kind: 'special', source, name: imported.importedName }
    }
  }
  for (const [source, names] of DYNAMIC_IMPORTS) {
    const imported = mod.imports.get(name)
    if (imported?.specifier === source && names.has(imported.importedName)) {
      return { kind: 'special', source, name: imported.importedName }
    }
  }
  const imported = mod.imports.get(name)
  if (imported) {
    if (imported.specifier === 'react') {
      return { kind: 'special', source: 'react', name: imported.importedName }
    }
    if (!imported.resolvedPath) {
      return { kind: 'external', specifier: imported.specifier }
    }
    const target = loadModule(imported.resolvedPath)
    if (!target) return { kind: 'external', specifier: imported.specifier }
    return resolveExport(target, imported.importedName, seen)
  }
  const local = mod.locals.get(name)
  if (local) return { kind: 'local', mod, node: local }
  return null
}

function resolveExport(mod, exportedName, seen = new Set()) {
  const key = `${mod.path}#${exportedName}`
  if (seen.has(key)) return null
  seen.add(key)
  if (exportedName === 'default') {
    if (!mod.defaultExport) return null
    if (ts.isIdentifier(mod.defaultExport)) {
      return resolveReference(mod, mod.defaultExport.text, seen)
    }
    return { kind: 'local', mod, node: mod.defaultExport }
  }
  const entry = mod.exports.get(exportedName)
  if (!entry) return null
  if (entry.reexport) {
    const resolvedPath = resolveImport(mod.path, entry.reexport.specifier)
    if (!resolvedPath) {
      return { kind: 'external', specifier: entry.reexport.specifier }
    }
    const target = loadModule(resolvedPath)
    if (!target)
      return { kind: 'external', specifier: entry.reexport.specifier }
    return resolveExport(target, entry.reexport.name, seen)
  }
  // Re-resolve through imports so `import { x } from './a'; export { x }`
  // keeps following the graph.
  return resolveReference(mod, entry.local, seen)
}

// ---------------------------------------------------------------------------
// Function analysis
// ---------------------------------------------------------------------------

/**
 * A finding: { kind, file, line, snippet, chain }
 * A deopt:   { reason, file, line, snippet }
 */
const analysisCache = new Map()

function analyzeCallable(mod, fnNode, depth, stack) {
  const cacheKey = `${mod.path}#${fnNode.pos}`
  if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey)
  if (stack.has(cacheKey) || depth > MAX_CALL_DEPTH) {
    return { findings: [], deopts: [], suspenseCovered: [] }
  }
  stack.add(cacheKey)

  const result = { findings: [], deopts: [], suspenseCovered: [] }
  // A "use cache" scope (function directive or whole-module directive) is a
  // boundary like Suspense: its body replays from the resume-data-cache in
  // the final prerender, so awaits inside it don't block the shell. The
  // cacheLife caveat (revalidate: 0 / short expire still block) is runtime
  // data this analysis cannot see; noted in README.
  const fnDirective = isFunctionLike(fnNode) ? getDirective(fnNode) : null
  if (fnDirective === 'cache' || mod.directive === 'cache') {
    analysisCache.set(cacheKey, result)
    stack.delete(cacheKey)
    return result
  }
  if (mod.directive === 'client') {
    analyzeClientComponent(mod, fnNode, result)
    analysisCache.set(cacheKey, result)
    stack.delete(cacheKey)
    return result
  }

  const paramNames = collectParamNames(fnNode)
  walkRenderPath(mod, fnNode, {
    result,
    depth,
    stack,
    paramNames,
    suspenseDepth: 0,
  })

  analysisCache.set(cacheKey, result)
  stack.delete(cacheKey)
  return result
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  )
}

function collectParamNames(fnNode) {
  const names = new Map() // name -> 'params' | 'searchParams' | 'other'
  if (!isFunctionLike(fnNode)) return names
  for (const param of fnNode.parameters) {
    if (ts.isIdentifier(param.name)) {
      names.set(param.name.text, 'other')
    } else if (ts.isObjectBindingPattern(param.name)) {
      for (const element of param.name.elements) {
        if (!ts.isIdentifier(element.name)) continue
        const propName = (element.propertyName ?? element.name).text
        names.set(
          element.name.text,
          propName === 'params' || propName === 'searchParams'
            ? propName
            : 'other'
        )
      }
    }
  }
  return names
}

/**
 * Walks everything that executes during this function's render: its own
 * statements and all JSX expressions, but NOT nested function bodies (those
 * only run if called — calls are classified separately) and NOT the bodies
 * of child components (those are followed through resolveReference with
 * Suspense-boundary awareness).
 */
function walkRenderPath(mod, fnNode, ctx) {
  const body = isFunctionLike(fnNode) ? fnNode.body : fnNode
  if (!body) return
  visit(body, ctx.suspenseDepth)

  function visit(node, suspenseDepth) {
    if (isFunctionLike(node) && node !== body) return // runs only if called
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return

    if (ts.isAwaitExpression(node)) {
      classifyAwaitedExpression(mod, node.expression, node, ctx, suspenseDepth)
      // keep walking: `await fn(await g())`
    }

    if (ts.isCallExpression(node)) {
      checkSyncIO(mod, node, ctx, suspenseDepth)
      checkReactUse(mod, node, ctx, suspenseDepth)
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      (node.arguments?.length ?? 0) === 0
    ) {
      addFinding(ctx, suspenseDepth, {
        kind: 'sync-io',
        node,
        mod,
        chain: ['new Date()'],
      })
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      visitJsx(node, suspenseDepth)
      return
    }

    ts.forEachChild(node, (child) => visit(child, suspenseDepth))
  }

  function visitJsx(node, suspenseDepth) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node
    const tag = opening.tagName
    const isSuspense = isSuspenseTag(mod, tag)

    // The tag itself may be a component we should follow.
    if (!isSuspense) {
      followComponentTag(mod, tag, node, ctx, suspenseDepth)
    }

    for (const attr of opening.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.initializer) {
        // Attributes always evaluate at the parent's depth. In particular a
        // Suspense boundary does NOT cover its own fallback: the fallback
        // renders into the shell, so a blocking component there still blocks.
        if (
          ts.isJsxExpression(attr.initializer) &&
          attr.initializer.expression
        ) {
          visit(attr.initializer.expression, suspenseDepth)
        } else if (
          ts.isJsxElement(attr.initializer) ||
          ts.isJsxSelfClosingElement(attr.initializer)
        ) {
          visitJsx(attr.initializer, suspenseDepth)
        }
      }
    }

    if (ts.isJsxElement(node)) {
      const childDepth = isSuspense ? suspenseDepth + 1 : suspenseDepth
      for (const child of node.children) {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          visitJsx(child, childDepth)
        } else if (ts.isJsxExpression(child) && child.expression) {
          // Expressions inside JSX children evaluate during THIS component's
          // render — `<Suspense>{await getData()}</Suspense>` still blocks
          // the parent. Only child *component execution* is deferred, so we
          // pass childDepth solely to component tags, handled in visit().
          visitChildExpression(child.expression, suspenseDepth, childDepth)
        }
      }
    }
  }

  // Expression children need two depths: plain expressions (awaits) evaluate
  // at the parent's depth; component tags inside the expression render at
  // the child depth.
  function visitChildExpression(node, parentDepth, childDepth) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      visitJsx(node, childDepth)
      return
    }
    if (ts.isAwaitExpression(node)) {
      classifyAwaitedExpression(mod, node.expression, node, ctx, parentDepth)
    }
    if (ts.isCallExpression(node)) {
      checkSyncIO(mod, node, ctx, parentDepth)
      checkReactUse(mod, node, ctx, parentDepth)
    }
    if (isFunctionLike(node)) return
    ts.forEachChild(node, (child) =>
      visitChildExpression(child, parentDepth, childDepth)
    )
  }

  function followComponentTag(tagMod, tag, jsxNode, ctx2, suspenseDepth) {
    let ref = null
    if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)) {
      ref = resolveReference(tagMod, tag.text)
    } else if (
      ts.isPropertyAccessExpression(tag) &&
      ts.isIdentifier(tag.expression)
    ) {
      const ns = tagMod.imports.get(tag.expression.text)
      if (ns?.importedName === '*' && ns.resolvedPath) {
        const target = loadModule(ns.resolvedPath)
        if (target) ref = resolveExport(target, tag.name.text)
      }
    }
    if (!ref) return
    if (ref.kind === 'external') return // third-party components: assumed safe (documented limitation)
    if (ref.kind === 'special') return
    if (ref.kind === 'local') {
      const child = analyzeCallable(
        ref.mod,
        ref.node,
        ctx2.depth + 1,
        ctx2.stack
      )
      for (const finding of child.findings) {
        addPropagatedFinding(ctx2, suspenseDepth, finding, tag.getText())
      }
      for (const deopt of child.deopts) {
        if (suspenseDepth === 0) ctx2.result.deopts.push(deopt)
      }
    }
  }

  function isSuspenseTag(tagMod, tag) {
    if (ts.isIdentifier(tag)) {
      const imported = tagMod.imports.get(tag.text)
      return (
        imported?.specifier === 'react' && imported.importedName === 'Suspense'
      )
    }
    if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression)) {
      const ns = tagMod.imports.get(tag.expression.text)
      return (
        ns?.specifier === 'react' &&
        (ns.importedName === '*' || ns.importedName === 'default') &&
        tag.name.text === 'Suspense'
      )
    }
    return false
  }
}

function classifyAwaitedExpression(mod, expr, awaitNode, ctx, suspenseDepth) {
  // await <identifier>
  if (ts.isIdentifier(expr)) {
    const paramKind = ctx.paramNames.get(expr.text)
    if (paramKind === 'params' || paramKind === 'searchParams') {
      addFinding(ctx, suspenseDepth, {
        kind: 'runtime',
        node: awaitNode,
        mod,
        chain: [`await ${paramKind}`],
      })
      return
    }
    if (paramKind === 'other') {
      // A promise handed in by the caller. Whether it blocks depends on the
      // caller — exactly the `await navigation()` problem. If it's under
      // Suspense it can't block the shell either way; otherwise report it
      // as unclassified rather than guessing.
      addFinding(ctx, suspenseDepth, {
        kind: 'unknown',
        node: awaitNode,
        mod,
        chain: [`await ${expr.text} (promise passed in by caller)`],
      })
      return
    }
    const ref = resolveReference(mod, expr.text)
    if (ref?.kind === 'local' && !isFunctionLike(ref.node)) {
      classifyAwaitedExpression(
        ref.mod,
        ref.node,
        awaitNode,
        ctx,
        suspenseDepth
      )
      return
    }
    addFinding(ctx, suspenseDepth, {
      kind: 'unknown',
      node: awaitNode,
      mod,
      chain: [`await ${expr.text}`],
    })
    return
  }

  // await something(...)
  if (ts.isCallExpression(expr)) {
    classifyAwaitedCall(mod, expr, awaitNode, ctx, suspenseDepth)
    return
  }

  // await new Promise(...) — the documented hard limit. Report a deopt: the
  // runtime validator is the only thing that can classify this.
  if (
    ts.isNewExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'Promise'
  ) {
    addDeopt(ctx, suspenseDepth, {
      reason:
        'awaits a hand-constructed Promise; static analysis cannot know when it settles — rely on runtime validation for this site',
      node: awaitNode,
      mod,
    })
    return
  }

  if (ts.isPropertyAccessExpression(expr)) {
    addFinding(ctx, suspenseDepth, {
      kind: 'unknown',
      node: awaitNode,
      mod,
      chain: [`await ${expr.getText().slice(0, 60)}`],
    })
    return
  }

  // await (a ? b : c), await (x, y), parenthesized, etc. — walk inside.
  ts.forEachChild(expr, (child) => {
    classifyAwaitedExpression(mod, child, awaitNode, ctx, suspenseDepth)
  })
}

function classifyAwaitedCall(mod, call, awaitNode, ctx, suspenseDepth) {
  const callee = call.expression

  // Promise.all / allSettled / race — classify each element.
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Promise' &&
    ['all', 'allSettled', 'race', 'any'].includes(callee.name.text)
  ) {
    const arg = call.arguments[0]
    if (arg && ts.isArrayLiteralExpression(arg)) {
      for (const element of arg.elements) {
        classifyAwaitedExpression(mod, element, awaitNode, ctx, suspenseDepth)
      }
    } else {
      addFinding(ctx, suspenseDepth, {
        kind: 'unknown',
        node: awaitNode,
        mod,
        chain: [`await Promise.${callee.name.text}(…) with non-literal list`],
      })
    }
    return
  }

  if (ts.isIdentifier(callee)) {
    // fetch(): uncached fetch is dynamic; explicit force-cache (or a positive
    // revalidate) is cached. Mirrors patch-fetch.ts.
    if (callee.text === 'fetch') {
      if (isCachedFetch(call)) return
      addFinding(ctx, suspenseDepth, {
        kind: 'dynamic',
        node: awaitNode,
        mod,
        chain: [`await fetch(…) without a cache configuration`],
      })
      return
    }

    const ref = resolveReference(mod, callee.text)
    if (ref?.kind === 'special') {
      if (ref.source === 'next/headers') {
        addFinding(ctx, suspenseDepth, {
          kind: 'runtime',
          node: awaitNode,
          mod,
          chain: [`await ${ref.name}()`],
        })
        return
      }
      if (ref.source === 'next/server' && ref.name === 'connection') {
        addFinding(ctx, suspenseDepth, {
          kind: 'dynamic',
          node: awaitNode,
          mod,
          chain: ['await connection()'],
        })
        return
      }
      return
    }
    if (ref?.kind === 'local' && isFunctionLike(ref.node)) {
      const inner = analyzeCallable(ref.mod, ref.node, ctx.depth + 1, ctx.stack)
      for (const finding of inner.findings) {
        addPropagatedFinding(ctx, suspenseDepth, finding, `${callee.text}()`)
      }
      for (const deopt of inner.deopts) {
        if (suspenseDepth === 0) ctx.result.deopts.push(deopt)
      }
      return
    }
    if (ref?.kind === 'external') {
      addFinding(ctx, suspenseDepth, {
        kind: 'unknown',
        node: awaitNode,
        mod,
        chain: [`await ${callee.text}() from '${ref.specifier}'`],
      })
      return
    }
    addFinding(ctx, suspenseDepth, {
      kind: 'unknown',
      node: awaitNode,
      mod,
      chain: [`await ${callee.text}()`],
    })
    return
  }

  // Reading the body of an already-awaited Response is a follow-on of the
  // fetch that produced it; reporting it separately would point at the last
  // await in a sequence instead of the first (the same attribution mistake
  // the runtime validator fixed in #96343).
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    ['json', 'text', 'arrayBuffer', 'blob', 'formData', 'bytes'].includes(
      callee.name.text
    )
  ) {
    return
  }

  // member calls (db.query(...), sql`...`, etc.) — arbitrary IO we cannot
  // resolve. Dynamic-by-default is the Cache Components contract, so report
  // as unknown/assumed-dynamic.
  addFinding(ctx, suspenseDepth, {
    kind: 'unknown',
    node: awaitNode,
    mod,
    chain: [`await ${callee.getText().slice(0, 60)}(…)`],
  })
}

function isCachedFetch(call) {
  const init = call.arguments[1]
  if (!init || !ts.isObjectLiteralExpression(init)) return false
  for (const prop of init.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue
    if (
      prop.name.text === 'cache' &&
      ts.isStringLiteral(prop.initializer) &&
      prop.initializer.text === 'force-cache'
    ) {
      return true
    }
    if (
      prop.name.text === 'next' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      for (const nested of prop.initializer.properties) {
        if (
          ts.isPropertyAssignment(nested) &&
          ts.isIdentifier(nested.name) &&
          nested.name.text === 'revalidate' &&
          ts.isNumericLiteral(nested.initializer) &&
          Number(nested.initializer.text) > 0
        ) {
          return true
        }
      }
    }
  }
  return false
}

function checkSyncIO(mod, call, ctx, suspenseDepth) {
  const callee = call.expression
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression)
  ) {
    const name = `${callee.expression.text}.${callee.name.text}`
    if (SYNC_IO_GLOBALS.has(name)) {
      addFinding(ctx, suspenseDepth, {
        kind: 'sync-io',
        node: call,
        mod,
        chain: [`${name}()`],
      })
    }
  }
}

function checkReactUse(mod, call, ctx, suspenseDepth) {
  const callee = call.expression
  if (!ts.isIdentifier(callee) || callee.text !== 'use') return
  const imported = mod.imports.get(callee.text)
  if (imported?.specifier === 'react' && imported.importedName === 'use') {
    const arg = call.arguments[0]
    if (arg) classifyAwaitedExpression(mod, arg, call, ctx, suspenseDepth)
  }
}

function analyzeClientComponent(mod, fnNode, result) {
  // Server-data classification stops at the client boundary; the one thing
  // we still check is URL data via client hooks (useSearchParams), which
  // blocks the SSR shell without Suspense (ClientHookDynamicError).
  const body = isFunctionLike(fnNode) ? fnNode.body : fnNode
  if (!body) return
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      BLOCKING_CLIENT_HOOKS.has(node.expression.text)
    ) {
      const imported = mod.imports.get(node.expression.text)
      if (imported?.specifier === 'next/navigation') {
        result.findings.push(
          makeFinding({
            kind: 'client-hook',
            node,
            mod,
            chain: [`${node.expression.text}()`],
          })
        )
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
}

// ---------------------------------------------------------------------------
// Finding plumbing
// ---------------------------------------------------------------------------

function makeFinding({ kind, node, mod, chain }) {
  const { line, character } = ts.getLineAndCharacterOfPosition(
    mod.sourceFile,
    node.getStart()
  )
  const lineText = mod.sourceFile.text.split('\n')[line]?.trim() ?? ''
  return {
    kind,
    file: mod.path,
    line: line + 1,
    column: character + 1,
    snippet: lineText.slice(0, 100),
    chain,
  }
}

function addFinding(ctx, suspenseDepth, spec) {
  const finding = makeFinding(spec)
  if (suspenseDepth > 0 && spec.kind !== 'sync-io') {
    // Below a Suspense boundary: this is an intentional dynamic hole (PPR),
    // not a blocker. Sync IO is never OK — it aborts the prerender outright.
    ctx.result.suspenseCovered.push(finding)
    return
  }
  ctx.result.findings.push(finding)
}

function addPropagatedFinding(ctx, suspenseDepth, finding, via) {
  if (suspenseDepth > 0 && finding.kind !== 'sync-io') {
    ctx.result.suspenseCovered.push(finding)
    return
  }
  ctx.result.findings.push({
    ...finding,
    chain: [`<${via}>`, ...finding.chain],
  })
}

function addDeopt(ctx, suspenseDepth, { reason, node, mod }) {
  if (suspenseDepth > 0) return
  const { line } = ts.getLineAndCharacterOfPosition(
    mod.sourceFile,
    node.getStart()
  )
  ctx.result.deopts.push({
    reason,
    file: mod.path,
    line: line + 1,
    snippet: mod.sourceFile.text.split('\n')[line]?.trim().slice(0, 100) ?? '',
  })
}

// ---------------------------------------------------------------------------
// Segment discovery and reporting
// ---------------------------------------------------------------------------

function findSegmentEntries(appDir) {
  const entries = []
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        if (item.name === 'node_modules') continue
        walk(full)
      } else {
        const parsed = path.parse(item.name)
        if (
          SEGMENT_ENTRIES.includes(parsed.name) &&
          SOURCE_EXTENSIONS.includes(parsed.ext)
        ) {
          entries.push(full)
        }
      }
    }
  }
  walk(appDir)
  return entries.sort()
}

function analyzeSegment(entryPath, appDir) {
  const mod = loadModule(entryPath)
  const rel = path.relative(appDir, entryPath)
  const segmentKind = path.parse(entryPath).name
  const report = {
    segment: rel,
    kind: segmentKind,
    instant: mod?.instantConfig,
    verdict: 'instant',
    findings: [],
    suspenseCovered: [],
    deopts: [],
    notes: [],
  }
  if (!mod) {
    report.verdict = 'error'
    report.notes.push('could not load module')
    return report
  }

  // loading.tsx covers the page below it (the LoadingBoundary remounts fresh
  // in the changed subtree), but not the layout that owns it.
  const hasLoading =
    segmentKind === 'page' &&
    SOURCE_EXTENSIONS.some((ext) =>
      fs.existsSync(path.join(path.dirname(entryPath), `loading${ext}`))
    )

  const componentRef = resolveExport(mod, 'default')
  if (!componentRef || componentRef.kind !== 'local') {
    report.verdict = 'unknown'
    report.notes.push('default export is not statically resolvable')
    return report
  }

  const analysis = analyzeCallable(
    componentRef.mod,
    componentRef.node,
    0,
    new Set()
  )
  report.suspenseCovered = analysis.suspenseCovered
  report.deopts = analysis.deopts

  const blocking = analysis.findings.filter((f) => f.kind !== 'sync-io')
  const syncIO = analysis.findings.filter((f) => f.kind === 'sync-io')

  if (hasLoading && blocking.length > 0) {
    report.notes.push(
      `${blocking.length} potentially-blocking site(s) are covered by loading.tsx in this segment`
    )
  }
  const effectiveBlocking = hasLoading ? [] : blocking

  // Sync IO is reported regardless of instant config or loading.tsx: it is a
  // hard prerender abort (throwIfSyncIOUsed) that neither can silence.
  report.findings = [...effectiveBlocking, ...syncIO]

  if (mod.instantConfig === false) {
    if (syncIO.length > 0) {
      report.verdict = 'blocking'
      report.notes.push(
        '`instant = false` does not silence sync IO — it aborts the prerender regardless'
      )
      report.findings = syncIO
    } else if (effectiveBlocking.length === 0 && analysis.deopts.length === 0) {
      report.verdict = 'remove-instant-false'
      report.notes.push(
        'segment declares `instant = false` but no blocking site was found — the opt-out looks unnecessary and disables validation for this subtree'
      )
      report.findings = []
    } else {
      report.verdict = 'blocking-allowed'
      report.notes.push(
        '`instant = false` allows this segment to block; remove it once the sites below are fixed'
      )
      report.findings = [] // suppressed by the opt-out
    }
    return report
  }

  if (report.findings.length > 0) {
    report.verdict = 'blocking'
  } else if (report.deopts.length > 0) {
    report.verdict = 'unknown'
  }
  return report
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const { values, positionals } = parseArgs({
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
  })
  const target = positionals[0]
  if (!target) {
    console.error('Usage: node analyze.mjs <app-dir> [--json]')
    process.exit(2)
  }
  const appDir = path.resolve(target)
  const entries = findSegmentEntries(appDir)
  const reports = entries.map((entry) => analyzeSegment(entry, appDir))

  if (values.json) {
    console.log(JSON.stringify(reports, null, 2))
  } else {
    printReports(reports, appDir)
  }
  const failed = reports.some(
    (r) =>
      r.verdict === 'blocking' || r.findings.some((f) => f.kind === 'sync-io')
  )
  process.exit(failed ? 1 : 0)
}

function printReports(reports, appDir) {
  const icons = {
    instant: '✓',
    blocking: '✗',
    'blocking-allowed': '◦',
    'remove-instant-false': '!',
    unknown: '?',
    error: '✗',
  }
  for (const report of reports) {
    console.log(
      `\n${icons[report.verdict]} ${report.segment} — ${verdictLabel(report)}`
    )
    for (const note of report.notes) {
      console.log(`    note: ${note}`)
    }
    for (const finding of report.findings) {
      const kindInfo = FINDING_KINDS[finding.kind]
      console.log(
        `    ${kindInfo.label}: ${finding.chain.join(' → ')}` +
          `\n      at ${path.relative(appDir, finding.file)}:${finding.line}  ${finding.snippet}`
      )
      for (const remedy of kindInfo.remedies) {
        console.log(`        ${REMEDIES[remedy]}`)
      }
    }
    for (const deopt of report.deopts) {
      console.log(
        `    deopt: ${deopt.reason}\n      at ${path.relative(appDir, deopt.file)}:${deopt.line}  ${deopt.snippet}`
      )
    }
    if (report.suspenseCovered.length > 0 && report.verdict === 'instant') {
      console.log(
        `    ${report.suspenseCovered.length} dynamic hole(s) correctly deferred behind <Suspense>`
      )
    }
  }
  console.log()
}

function verdictLabel(report) {
  switch (report.verdict) {
    case 'instant':
      return 'no blocking sites found'
    case 'blocking':
      return `${report.findings.length} blocking site(s)`
    case 'blocking-allowed':
      return 'blocking allowed by `instant = false`'
    case 'remove-instant-false':
      return '`instant = false` appears unnecessary'
    case 'unknown':
      return 'could not fully classify (see deopts)'
    default:
      return report.verdict
  }
}

main()
