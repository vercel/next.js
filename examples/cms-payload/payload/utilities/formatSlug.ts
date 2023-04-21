import { FieldHook } from 'payload/types';

const format = (val: string): string => val.replace(/ /g, '-').replace(/[^\w-]+/g, '').toLowerCase();

const formatSlug = (fallback: string): FieldHook => ({ operation, value, originalDoc, data }) => {
  if (typeof value === 'string') {
    return format(value);
  }

  if (operation === 'create') {
    const fallbackData = (data && data[fallback]) || (originalDoc && originalDoc[fallback]);

    if (fallbackData && typeof fallbackData === 'string') {
      return format(fallbackData);
    }
  }

  return value;
};

export default formatSlug;
