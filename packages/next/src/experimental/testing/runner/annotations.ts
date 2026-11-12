import { createHash } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { getContentType } from '../../../server/serve-static'
import type { TestAttachment } from './tasks'

/** Pinned 5.0.4 validation/encoding contract, without its worker/controller. */
export function prepareAnnotationAttachment(attachment: TestAttachment) {
  if (attachment.body == null && !attachment.path)
    throw new TypeError(
      'Test attachment requires "body" or "path" to be set. Both are missing.'
    )
  if (attachment.body && attachment.path)
    throw new TypeError(
      'Test attachment requires only one of "body" or "path" to be set. Both are specified.'
    )
  if (attachment.path && attachment.bodyEncoding)
    throw new TypeError(
      'Test attachment with "path" should not have "bodyEncoding" specified.'
    )
  if (attachment.body instanceof Uint8Array)
    attachment.body = Buffer.from(attachment.body).toString('base64')
  if (attachment.body != null) attachment.bodyEncoding ??= 'base64'
}

/** Inline bodies and URLs remain inline; local files survive worker disposal. */
export async function retainAnnotationAttachment(
  attachment: TestAttachment,
  message: string,
  options: { projectDir: string; attachmentsDir?: string }
) {
  if (!attachment.path || /^https?:\/\//.test(attachment.path)) return
  const source = resolve(options.projectDir, attachment.path)
  const hash = createHash('sha1').update(source).digest('hex')
  // Same normalization as the target's sanitizeFilePath helper.
  const name = message.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x2C\x2E\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g,
    '-'
  )
  const directory = resolve(
    options.projectDir,
    options.attachmentsDir ?? '.vitest/attachments'
  )
  const target = resolve(
    directory,
    `${name ? `${name}-` : ''}${hash}${extname(source)}`
  )
  await mkdir(directory, { recursive: true })
  await copyFile(source, target)
  attachment.path = target
  attachment.contentType =
    attachment.contentType ??
    getContentType(extname(source).slice(1)) ??
    undefined
}
