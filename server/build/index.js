import webpack from './webpack'
import clean from './clean'

export default async function build (dir) {
  const [compiler] = await Promise.all([
    webpack(dir),
    clean(dir)
  ])

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) return reject(err)

      const jsonStats = stats.toJson()
      if (jsonStats.errors.length > 0) {
        const error = new Error(jsonStats.errors[0])
        error.errors = jsonStats.errors
        error.warnings = jsonStats.warnings
        return reject(error)
      }

      resolve()
    })
  })
}
