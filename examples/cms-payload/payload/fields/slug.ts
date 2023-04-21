import { Field } from 'payload/types';
import formatSlug from '../utilities/formatSlug';
import deepMerge from '../utilities/deepMerge';

type Slug = (fieldToUse?: string, overrides?: Partial<Field>) => Field

export const slugField: Slug = (fieldToUse = 'title', overrides) => deepMerge<Field, Partial<Field>>(
  {
    name: 'slug',
    label: 'Slug',
    type: 'text',
    index: true,
    admin: {
      position: 'sidebar',
    },
    hooks: {
      beforeValidate: [
        formatSlug(fieldToUse),
      ],
    },
  },
  overrides || {},
);
