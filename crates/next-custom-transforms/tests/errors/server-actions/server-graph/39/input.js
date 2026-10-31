export async function foo() {
  for (;;) {
    'use server'
  }

  switch (true) {
    case true:
      'use cache'
  }

  label: {
    'use client'
  }
}

if (true) 'use server'

while (false) 'use cache'
