/* global describe, it, expect */

import { SameLoopPromise } from '../../dist/lib/dynamic'

describe('SameLoopPromise', () => {
  describe('basic api', () => {
    it('should support basic promise resolving', (done) => {
      const promise = new SameLoopPromise((resolve) => {
        setTimeout(() => {
          resolve(1000)
        }, 100)
      })

      promise.then((value) => {
        expect(value).toBe(1000)
        done()
      })
    })

    it('should support resolving in the same loop', () => {
      let gotValue = null
      const promise = new SameLoopPromise((resolve) => {
        resolve(1000)
      })

      promise.then((value) => {
        gotValue = value
      })

      expect(gotValue).toBe(1000)
    })

    it('should support basic promise rejecting', (done) => {
      const error = new Error('Hello Error')
      const promise = new SameLoopPromise((resolve, reject) => {
        setTimeout(() => {
          reject(error)
        }, 100)
      })

      promise.catch((err) => {
        expect(err).toBe(error)
        done()
      })
    })

    it('should support rejecting in the same loop', () => {
      const error = new Error('Hello Error')
      let gotError = null
      const promise = new SameLoopPromise((resolve, reject) => {
        reject(error)
      })

      promise.catch((err) => {
        gotError = err
      })

      expect(gotError).toBe(error)
    })
  })

  describe('complex usage', () => {
    it('should support a chain of promises', (done) => {
      const promise = new SameLoopPromise((resolve) => {
        setTimeout(() => {
          resolve(1000)
        }, 100)
      })

      promise
        .then((value) => value * 2)
        .then((value) => value + 10)
        .then((value) => {
          expect(value).toBe(2010)
          done()
        })
    })

    it('should handle the error inside the then', (done) => {
      const error = new Error('1000')
      const promise = new SameLoopPromise((resolve, reject) => {
        setTimeout(() => {
          reject(error)
        }, 100)
      })

      promise
        .then(
          () => 4000,
          (err) => parseInt(err.message)
        )
        .then((value) => value + 10)
        .then((value) => {
          expect(value).toBe(1010)
          done()
        })
    })

    it('should catch the error at the end', (done) => {
      const error = new Error('1000')
      const promise = new SameLoopPromise((resolve, reject) => {
        setTimeout(() => {
          reject(error)
        }, 100)
      })

      promise
        .then((value) => value * 2)
        .then((value) => value + 10)
        .catch((err) => {
          expect(err).toBe(error)
          done()
        })
    })

    it('should catch and proceed', (done) => {
      const error = new Error('1000')
      const promise = new SameLoopPromise((resolve, reject) => {
        setTimeout(() => {
          reject(error)
        }, 100)
      })

      promise
        .then((value) => value * 2)
        .then((value) => value + 10)
        .catch((err) => {
          expect(err).toBe(error)
          return 5000
        })
        .then((value) => {
          expect(value).toBe(5000)
          done()
        })
    })
  })
})
