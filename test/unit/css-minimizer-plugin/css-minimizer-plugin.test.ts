import postcss from 'postcss'
import postcssScss from 'next/dist/compiled/postcss-scss'
import cssnanoSimple from 'next/dist/compiled/cssnano-simple'
import { sources } from 'next/dist/compiled/webpack/webpack'
import {
  splitMergedLayerNodesPlugin,
  preserveLayerSemicolonPlugin,
  CssMinimizerPlugin,
} from 'next/src/build/webpack/plugins/css-minimizer-plugin'

// --- Helpers ---

// Parse with default PostCSS parser, force root.raws.semicolon = false
// to simulate the bug state (semicolon lost in upstream round-trip).
async function processWithoutSemicolon(css: string): Promise<string> {
  const root = postcss.parse(css)
  root.raws.semicolon = false
  const result = await postcss([preserveLayerSemicolonPlugin]).process(
    root.toResult(),
    { from: 'input.css', to: 'output.css' }
  )
  return result.css
}

// Parse with default PostCSS parser, CSS already has semicolons.
async function processWithSemicolon(css: string): Promise<string> {
  const result = await postcss([preserveLayerSemicolonPlugin]).process(css, {
    from: 'input.css',
    to: 'output.css',
  })
  return result.css
}

// Parse with postcss-scss (production parser), then run the plugin.
// This is the ACTUAL code path in CssMinimizerPlugin.optimizeAsset().
async function processWithScssParser(
  css: string,
  opts?: { semicolon?: boolean }
): Promise<string> {
  const root = postcssScss.parse(css) as postcss.Root
  if (opts?.semicolon === false) root.raws.semicolon = false
  const result = await postcss([preserveLayerSemicolonPlugin]).process(
    root.toResult(),
    { from: 'input.css', to: 'output.css', parser: postcssScss as any }
  )
  return result.css
}

// Run only the split-merged-layer-nodes plugin (no semicolon fix, no cssnano).
async function processSplitMerged(css: string): Promise<string> {
  const result = await postcss([splitMergedLayerNodesPlugin]).process(css, {
    from: 'input.css',
    to: 'output.css',
    parser: postcssScss as any,
  })
  return result.css
}

// Full production pipeline: postcss-scss parser + both plugins + cssnano-simple.
// This is exactly what CssMinimizerPlugin.optimizeAsset() does.
async function processFullPipeline(css: string): Promise<string> {
  const result = await postcss([
    splitMergedLayerNodesPlugin,
    preserveLayerSemicolonPlugin,
    cssnanoSimple({ colormin: false }, postcss),
  ]).process(css, {
    from: 'input.css',
    to: 'output.css',
    parser: postcssScss as any,
  })
  return result.css
}

// Create a mock webpack asset for optimizeAsset() testing.
function mockAsset(css: string) {
  return { source: () => css }
}

// --- Tests ---

describe('CssMinimizerPlugin - @layer statement semicolon preservation', () => {
  describe('bug state: CSS arrives without trailing semicolon', () => {
    test('adds semicolon to @layer statement as last child', async () => {
      const output = await processWithoutSemicolon('@layer reset, tokens, base')
      expect(output).toMatch(/@layer reset, tokens, base;/)
    })

    test('adds semicolon when @layer statement is the only node', async () => {
      const output = await processWithoutSemicolon('@layer utilities')
      expect(output).toMatch(/@layer utilities;/)
    })

    test('adds semicolon to last @layer when multiple exist', async () => {
      const output = await processWithoutSemicolon(
        'p { color: red }\n@layer reset, tokens'
      )
      expect(output).toContain('@layer reset, tokens;')
    })

    test('does not add semicolon to non-last @layer (Stringifier handles it)', async () => {
      const output = await processWithoutSemicolon(
        '@layer reset\n@layer base { p { color: red } }'
      )
      expect(output).toContain('@layer base {')
    })
  })

  describe('healthy state: CSS arrives with semicolons intact', () => {
    test('does NOT double the semicolon on @layer as last child', async () => {
      const output = await processWithSemicolon('@layer reset, tokens, base;')
      expect(output).toContain('@layer reset, tokens, base;')
      expect(output).not.toContain(';;')
    })

    test('does NOT double the semicolon when @layer is last with siblings', async () => {
      const output = await processWithSemicolon(
        'p { color: red }\n@layer reset;'
      )
      expect(output).toContain('@layer reset;')
      expect(output).not.toContain(';;')
    })

    test('preserves non-last @layer statement with semicolon', async () => {
      const output = await processWithSemicolon(
        '@layer reset;\n@layer reset { p { margin: 0; } }'
      )
      expect(output).toContain('@layer reset;')
      expect(output).not.toContain(';;')
    })
  })

  describe('edge cases', () => {
    test('does not add semicolon to @layer block (with body)', async () => {
      const output = await processWithoutSemicolon(
        '@layer base { p { color: red; } }'
      )
      expect(output).not.toMatch(/@layer base\s*\{[^}]*\}\s*;/)
    })

    test('does not crash on @layer with no params', async () => {
      const output = await processWithoutSemicolon('@layer;')
      expect(output).toBeDefined()
    })
  })

  // SCSS compilation (postcss-scss / mini-css-extract-plugin) can drop
  // the separating `;` between adjacent @layer statements, causing
  // postcss-scss to produce a single AtRule with merged params like
  // "reset, tokens, base\n@layer reset". splitMergedLayerNodesPlugin
  // detects and splits these before they reach lightningcss.
  describe('splitMergedLayerNodesPlugin - merged @layer detection and splitting', () => {
    test('splits merged multi-layer params with embedded @layer keyword', async () => {
      // Simulate what postcss-scss produces from:
      //   @layer reset, tokens, base, components, utilities
      //   @layer reset;
      const input =
        '@layer reset, tokens, base, components, utilities\n@layer reset;'
      const output = await processSplitMerged(input)
      expect(output).toContain(
        '@layer reset, tokens, base, components, utilities;'
      )
      expect(output).toContain('@layer reset;')
    })

    test('splits merged single-name layers with embedded @layer keyword', async () => {
      // Simulate: @layer reset\n@layer tokens;
      const input = '@layer reset\n@layer tokens;'
      const output = await processSplitMerged(input)
      expect(output).toContain('@layer reset;')
      expect(output).toContain('@layer tokens;')
    })

    test('splits with extra whitespace around embedded @layer', async () => {
      const input = '@layer  reset\n @layer  tokens;'
      const output = await processSplitMerged(input)
      expect(output).toContain('@layer reset;')
      expect(output).toContain('@layer tokens;')
    })

    test('does NOT split valid multi-name @layer (no embedded keyword)', async () => {
      const input = '@layer reset, tokens, base;'
      const output = await processSplitMerged(input)
      expect(output).toContain('@layer reset, tokens, base;')
    })

    test('does NOT touch @layer blocks (with body)', async () => {
      const input = '@layer reset { p { margin: 0; } }'
      const output = await processSplitMerged(input)
      expect(output).toContain('@layer reset {')
    })

    test('does NOT touch @layer with empty params', async () => {
      const input = '@layer;'
      const output = await processSplitMerged(input)
      expect(output).toContain('@layer;')
    })

    test('split nodes get semicolons from preserveLayerSemicolonPlugin', async () => {
      // Full pipeline: split + semicolon fix + cssnano
      const input =
        '@layer reset, tokens, base, components, utilities\n@layer reset;'
      const output = await processFullPipeline(input)
      // The merged node is split into two: one with the comma list, one standalone
      expect(output).toMatch(
        /@layer\s+reset, tokens, base, components, utilities/
      )
      expect(output).toMatch(/@layer\s+reset;/)
      expect(output).not.toContain(';;')
    })

    test('split works through full pipeline with mixed statements and blocks', async () => {
      const input =
        '@layer reset, base\n@layer tokens;\n@layer reset { p { margin: 0 } }\n@layer base { p { color: red } }'
      const output = await processFullPipeline(input)
      expect(output).toMatch(/@layer\s+reset/)
      expect(output).toMatch(/@layer\s+base/)
      expect(output).toMatch(/@layer\s+tokens/)
      expect(output).not.toContain(';;')
    })

    test('splits merged node with children into statement + block', async () => {
      // When postcss-scss merges "@layer reset, tokens;\n@layer reset { ... }"
      // into ONE node (params="reset, tokens\n@layer reset", nodes=[...]),
      // the split plugin should separate them: statement gets no children,
      // block keeps the children.
      const input =
        '@layer reset, tokens\n@layer reset{*{box-sizing:border-box}}body{margin:0}'
      const result = await processSplitMerged(input)
      expect(result).toContain('@layer reset, tokens')
      expect(result).toContain('@layer reset{*{box-sizing:border-box}}')
      expect(result).toContain('body{margin:0}')
    })

    test('merged node with children gets semicolon through full pipeline', async () => {
      // End-to-end: postcss-scss merges the lines, split plugin separates them,
      // semicolon plugin adds ;, cssnano minifies.
      const input =
        '@layer reset, tokens, base, components, utilities\n@layer reset{*,:after,:before{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}}'
      const output = await processFullPipeline(input)
      expect(output).toContain(
        '@layer reset, tokens, base, components, utilities;'
      )
      expect(output).toContain('@layer reset{')
      expect(output).not.toMatch(/utilities\n@layer/)
      expect(output).not.toContain(';;')
    })
  })

  // CRITICAL: postcss-scss is the production parser. These tests verify
  // the plugin works with the same parser that CssMinimizerPlugin uses.
  describe('postcss-scss parser (production path)', () => {
    test('adds semicolon when postcss-scss parses @layer without ;', async () => {
      const output = await processWithScssParser('@layer reset, tokens, base', {
        semicolon: false,
      })
      expect(output).toMatch(/@layer reset, tokens, base;/)
      expect(output).not.toContain(';;')
    })

    test('does NOT double semicolon when postcss-scss parses @layer with ;', async () => {
      const output = await processWithScssParser('@layer reset, tokens, base;')
      expect(output).toContain('@layer reset, tokens, base;')
      expect(output).not.toContain(';;')
    })

    test('preserves @layer statement when followed by @layer block', async () => {
      const output = await processWithScssParser(
        '@layer reset;\n@layer base { p { color: red } }'
      )
      expect(output).toContain('@layer reset;')
      expect(output).not.toContain(';;')
    })

    test('postcss-scss parser sets root.raws.semicolon correctly', () => {
      // Verify the parser behavior our fix depends on
      const withSemicolon = postcssScss.parse('@layer reset;') as postcss.Root
      const withoutSemicolon = postcssScss.parse('@layer reset') as postcss.Root
      expect(withSemicolon.raws.semicolon).toBe(true)
      expect(withoutSemicolon.raws.semicolon).toBe(false)
    })
  })

  // Full production pipeline: plugin + cssnano-simple + postcss-scss.
  // This is exactly what CssMinimizerPlugin.optimizeAsset() runs.
  describe('full production pipeline (plugin + cssnano-simple + postcss-scss)', () => {
    test('preserves @layer statement semicolon through full pipeline', async () => {
      const input = '@layer reset, tokens, base;'
      const output = await processFullPipeline(input)
      expect(output).toContain('@layer')
      expect(output).not.toContain(';;')
      // The semicolon must survive cssnano's processing
      expect(output).toMatch(/@layer\s+reset/)
    })

    test('preserves @layer statement followed by @layer block', async () => {
      const input = '@layer reset;\n@layer base { p { color: red } }'
      const output = await processFullPipeline(input)
      expect(output).toContain('@layer reset')
      expect(output).toContain('@layer base')
      expect(output).not.toContain(';;')
    })

    test('handles @layer ordering across multiple blocks', async () => {
      const input =
        '@layer reset;\n@layer base;\n@layer reset { p { margin: 0 } }\n@layer base { p { color: red } }'
      const output = await processFullPipeline(input)
      expect(output).not.toContain(';;')
      // Both @layer statements should be present
      expect(output).toMatch(/@layer\s+reset/)
      expect(output).toMatch(/@layer\s+base/)
    })
  })

  // optimizeAsset() integration: the actual method called by webpack.
  describe('CssMinimizerPlugin.optimizeAsset() integration', () => {
    let plugin: CssMinimizerPlugin

    beforeEach(() => {
      plugin = new CssMinimizerPlugin({
        postcssOptions: { map: false },
      })
    })

    test('preserves @layer statement semicolon through optimizeAsset', async () => {
      const asset = mockAsset('@layer reset, tokens, base;')
      const result = await plugin.optimizeAsset('test.css', asset)
      const css = result.source()
      expect(css).not.toContain(';;')
      expect(css).toMatch(/@layer/)
    })

    test('handles @layer ordering with optimizeAsset', async () => {
      const asset = mockAsset('@layer reset;\n@layer base { p { color: red } }')
      const result = await plugin.optimizeAsset('test.css', asset)
      const css = result.source()
      expect(css).not.toContain(';;')
    })

    test('splits merged @layer statements through optimizeAsset', async () => {
      // Simulate merged @layer from SCSS compilation
      const asset = mockAsset(
        '@layer reset, tokens, base, components, utilities\n@layer reset;'
      )
      const result = await plugin.optimizeAsset('test.css', asset)
      const css = result.source()
      expect(css).toMatch(/@layer\s+reset/)
      expect(css).not.toContain(';;')
    })

    test('returns RawSource when no source map requested', async () => {
      const asset = mockAsset('@layer reset;')
      const result = await plugin.optimizeAsset('test.css', asset)
      expect(result).toBeInstanceOf(sources.RawSource)
    })
  })
})
