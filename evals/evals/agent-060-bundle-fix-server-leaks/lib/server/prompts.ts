export const ticketSchema = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      title: 'Subject',
      description:
        'A short summary of the problem so the support team can identify your request.',
    },
    details: {
      type: 'string',
      title: 'Details',
      description:
        'Describe what happened, what you expected and which order or product was affected.',
    },
  },
  required: ['subject', 'details'],
} as const

export type TicketField = keyof typeof ticketSchema.properties
