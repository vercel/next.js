'use client'

import React from 'react'
import { Page } from '../../payload-types'
import { HeavyHero } from './Heavy'
import { MediumHero } from './Medium'
import { LightHero } from './Light'

const heroes = {
  heavy: HeavyHero,
  medium: MediumHero,
  light: LightHero,
}

export const Hero: React.FC<Page['hero']> = (props) => {
  const { type } = props
  const HeroToRender = heroes[type]

  if (!HeroToRender) return null
  return <HeroToRender {...props} />
}
