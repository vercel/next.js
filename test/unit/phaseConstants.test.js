/* global fixture, test */
import 'testcafe'
import {
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER
} from 'next/constants'

fixture('phaseConstants')

test('should set phases correctly', async t => {
  await t.expect(PHASE_EXPORT).eql('phase-export')
  await t.expect(PHASE_PRODUCTION_BUILD).eql('phase-production-build')
  await t.expect(PHASE_PRODUCTION_SERVER).eql('phase-production-server')
  await t.expect(PHASE_DEVELOPMENT_SERVER).eql('phase-development-server')
})
