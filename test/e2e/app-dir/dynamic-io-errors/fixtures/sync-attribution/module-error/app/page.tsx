import { ClientComponent } from './client'

export default async function Page() {
  return (
    <main>
      <section>
        <p>
          This module calls `new Date()` in module scope. it then errors. We
          expect to see the module error and not a sync IO error in build logs
          and dev error overlays
        </p>
      </section>
      <section>
        <ClientComponent />
      </section>
    </main>
  )
}
