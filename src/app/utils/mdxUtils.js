import fs from 'fs'
import path from 'path'

// This function can be used at build time to generate a mapping of MDX files
export function getMdxFiles(dir) {
  const mdxDir = path.join(process.cwd(), dir)
  const filenames = fs.readdirSync(mdxDir)
  const mdxFiles = filenames.filter((name) => name.endsWith('.mdx'))

  return mdxFiles.map((filename) => ({
    filename,
    path: `${dir}/${filename}`,
  }))
}
