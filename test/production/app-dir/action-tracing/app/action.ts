'use server'

try {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    require('fs').readFileSync(
      require('path').join(process.cwd(), 'data.txt'),
      'utf8'
    )
  }
} catch {}

export async function action() {
  return 'action'
}
