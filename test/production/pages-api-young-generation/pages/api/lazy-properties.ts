import type { NextApiRequest, NextApiResponse } from 'next'
import { inYoungGeneration } from '../../lib/in-young-generation'

const lazyProperties = ['cookies', 'previewData', 'preview', 'draftMode']

let previousAccessors: (PropertyDescriptor | undefined)[] | undefined

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const accessors = lazyProperties.map((name) =>
    Object.getOwnPropertyDescriptor(req, name)
  )
  const lazy = accessors.every(
    (accessor) =>
      typeof accessor?.get === 'function' && typeof accessor.set === 'function'
  )
  const sameAsPreviousRequest =
    previousAccessors !== undefined &&
    accessors.every(
      (accessor, index) =>
        accessor?.get === previousAccessors![index]?.get &&
        accessor?.set === previousAccessors![index]?.set
    )
  previousAccessors = accessors

  // The object that holds the getters of the lazy properties is the value of
  // a symbol-keyed property of the request and refers back to the request.
  const record = Object.getOwnPropertySymbols(req)
    .map(
      (symbol) => (req as unknown as Record<symbol, { req?: unknown }>)[symbol]
    )
    .find((value) => value?.req === req)

  // Reading a lazy property and assigning to one both turn it into a plain
  // property of this request.
  const cookies = req.cookies
  req.draftMode = true

  res.status(200).json({
    lazy,
    sameAsPreviousRequest,
    cookies,
    cookiesAfterRead: Object.getOwnPropertyDescriptor(req, 'cookies'),
    draftModeAfterAssignment: Object.getOwnPropertyDescriptor(req, 'draftMode'),
    preview: req.preview ?? null,
    recordInYoungGeneration: record ? inYoungGeneration(record) : null,
  })
}
