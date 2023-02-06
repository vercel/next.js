import { getExamplesBatch } from './getExamples'
import { testExample } from './testExample'

getExamplesBatch(0).forEach(testExample)
