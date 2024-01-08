import {
  RichTextElement,
  FieldProps,
  RichTextLeaf,
  slateEditor,
} from '@payloadcms/richtext-slate'
import { RichTextField } from 'payload/types'
import deepMerge from '../../utilities/deepMerge'
import elements from './elements'
import leaves from './leaves'

type RichText = (
  overrides?: Partial<FieldProps>,
  additions?: {
    elements?: RichTextElement[]
    leaves?: RichTextLeaf[]
  }
) => RichTextField

const richText: RichText = (
  overrides,
  additions = {
    elements: [],
    leaves: [],
  }
) => {
  const base = deepMerge<FieldProps, Partial<FieldProps>>(
    {
      name: 'richText',
      required: true,
      editor: slateEditor({
        admin: {
          elements: [...elements, ...(additions.elements || [])],
          leaves: [...leaves, ...(additions.leaves || [])],
        },
      }),
    },
    overrides || {}
  )

  return {
    ...base,
    type: 'richText',
  }
}

export default richText
