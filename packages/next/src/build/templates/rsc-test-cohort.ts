// One AppPage graph owns the explicitly ordered RSC spec roots.
// Native internal assets retain real source modules; this entry never imports them eagerly.
export async function loadTestModule(index: number): Promise<unknown> {
  switch (index) {
    // INJECT_RAW:__next_test_cohort_load__
    default:
      throw new Error('Unknown compiled test cohort index')
  }
}
