'use client'

import { useState } from 'react'

const TASKS = [
  {
    id: 'profile',
    title: 'Complete your profile',
    description:
      'Add your company name, shipping address and a contact email so our team can reach you about orders. You can change any of these details later from your account settings page.',
    instructions:
      'Open Settings, choose Profile, fill in each field and press Save. If your company uses single sign-on, ask your administrator to add you before you continue with this step.',
  },
  {
    id: 'feedback',
    title: 'Tell us about your store',
    description:
      'A short note about what you sell helps us recommend the right plan and the help articles most useful to you. This is optional, and nothing you write here is shown publicly.',
    prompt:
      'What are you hoping to get done with Acme this month? For example, you might be moving from another platform, launching a new product line or setting up your first storefront.',
  },
]

export function SetupChecklist() {
  const [open, setOpen] = useState(TASKS[0].id)

  return (
    <section aria-label="Setup checklist">
      {TASKS.map((task) => (
        <details key={task.id} open={open === task.id}>
          <summary onClick={() => setOpen(task.id)}>{task.title}</summary>
          <p>{task.description}</p>
          {'instructions' in task && <p>{task.instructions}</p>}
          {'prompt' in task && <textarea placeholder={task.prompt} />}
        </details>
      ))}
    </section>
  )
}
