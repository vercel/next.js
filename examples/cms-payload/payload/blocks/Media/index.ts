import { Block } from 'payload/types'
import { backgroundColor } from '../../fields/backgroundColor'
import { slateEditor } from '@payloadcms/richtext-slate'

export const MediaBlock: Block = {
  slug: 'mediaBlock',
  fields: [
    {
      type: 'row',
      fields: [
        backgroundColor({ overrides: { name: 'mediaBlockBackgroundColor' } }),
        {
          name: 'position',
          type: 'select',
          defaultValue: 'default',
          options: [
            {
              label: 'Default',
              value: 'default',
            },
            {
              label: 'Fullscreen',
              value: 'fullscreen',
            },
          ],
        },
      ],
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      editor: slateEditor({
        admin: {
          elements: ['link'],
        },
      }),
    },
  ],
}
