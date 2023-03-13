import dynamic from 'next/dynamic'

import camelcaseKeys from 'camelcase-keys'

import Preloader from '@/components/preloader'
import MissingSection from './missing-section'

export default function LandingPageSection({ type, sectionData }) {
  const sectionsComponentPaths = () => ({
    hero: dynamic(
      () =>
        import('@/components/landing-page-sections/hero').catch(
          () => () => MissingSection
        ),
      {
        loading: Preloader,
      }
    ),
    two_column_with_image: dynamic(
      () =>
        import(
          '@/components/landing-page-sections/two-column-with-image'
        ).catch(() => () => MissingSection),
      {
        loading: Preloader,
      }
    ),
    features: dynamic(
      () =>
        import('@/components/landing-page-sections/features').catch(
          () => () => MissingSection
        ),
      {
        loading: Preloader,
      }
    ),
    testimonials: dynamic(
      () =>
        import('@/components/landing-page-sections/testimonials').catch(
          () => () => MissingSection
        ),
      {
        loading: Preloader,
      }
    ),
  })
  const SectionComponent = sectionsComponentPaths()[type] || MissingSection

  return <SectionComponent type={type} {...camelcaseKeys(sectionData)} />
}
