/*
Modified version of taskr.watch that uses watchpack instead of chokidar

https://github.com/lukeed/taskr/blob/7a50e6e8c1fb8c01c0020d9f0e4d8897ccc4cc28/license
The MIT License (MIT)

Copyright (c) 2015 Jorge Bucaran (https://github.com/JorgeBucaran)
Copyright (c) 2016 Luke Edwards (https://github.com/lukeed)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
const path = require('path')
// eslint-disable-next-line import/no-extraneous-dependencies
const Watchpack = require('watchpack')
const toArr = (val) => (Array.isArray(val) ? val : val == null ? [] : [val])

module.exports = function (Taskr, _utils) {
  Taskr.plugin(
    'watch',
    { every: false, files: false },
    // eslint-disable-next-line require-yield
    function* (_, directory, names, opts) {
      const wp = new Watchpack({
        aggregateTimeout: 5,
        followSymlinks: true,
        ignored: '**/.git',
      })

      names = toArr(names)
      opts = opts || {}

      const dirToWatch = path.join(__dirname, directory)
      wp.watch({
        directories: [dirToWatch],
        startTime: Date.now() - 10000,
      })

      wp.on('aggregated', function (_changes, _removals) {
        // No matter if there's a removal or change the task has to run
        return Taskr.serial(names, opts)
      })

      return
    }
  )
}
