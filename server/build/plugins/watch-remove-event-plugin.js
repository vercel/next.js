
// watch and trigger file remove event
// see: https://github.com/webpack/webpack/issues/1533

export default class WatchRemoveEventPlugin {
  constructor () {
    this.removedFiles = []
  }

  apply (compiler) {
    compiler.removedFiles = []

    if (!compiler.watchFileSystem) return

    const { watchFileSystem } = compiler
    const { watch } = watchFileSystem

    watchFileSystem.watch = (files, dirs, missing, startTime, options, callback, callbackUndelayed) => {
      const result = watch.call(watchFileSystem, files, dirs, missing, startTime, options, (...args) => {
        compiler.removedFiles = this.removedFiles
        this.removedFiles = []
        callback(...args)
      }, callbackUndelayed)

      const watchpack = watchFileSystem.watcher
      watchpack.fileWatchers.forEach((w) => {
        w.on('remove', this.onRemove.bind(this, watchpack, w.path))
      })
      return result
    }
  }

  onRemove (watchpack, file) {
    this.removedFiles.push(file)
    watchpack.emit('remove', file)
    watchpack._onChange(file)
  }
}

// monkeypatching watchpack module to fix
// https://github.com/webpack/watchpack/pull/33

let DirectoryWatcher
try {
  DirectoryWatcher = require('webpack/node_modules/watchpack/lib/DirectoryWatcher')
} catch (err) {
  DirectoryWatcher = require('watchpack/lib/DirectoryWatcher')
}

/* eslint-disable */
var FS_ACCURENCY = 10000;

function withoutCase(str) {
	return str.toLowerCase();
}

DirectoryWatcher.prototype.setFileTime = function setFileTime(filePath, mtime, initial, type) {
	var now = Date.now();
	var old = this.files[filePath];

	this.files[filePath] = [initial ? Math.min(now, mtime) : now, mtime];

	// we add the fs accurency to reach the maximum possible mtime
	if(mtime)
		mtime = mtime + FS_ACCURENCY;

	if(!old) {
		if(mtime) {
			if(this.watchers[withoutCase(filePath)]) {
				this.watchers[withoutCase(filePath)].forEach(function(w) {
					if(!initial || w.checkStartTime(mtime, initial)) {
						w.emit("change", mtime);
					}
				});
			}
		}
	} else if(!initial && mtime && type !== "add") {
		if(this.watchers[withoutCase(filePath)]) {
			this.watchers[withoutCase(filePath)].forEach(function(w) {
				w.emit("change", mtime);
			});
		}
	} else if(!initial && !mtime) {
		delete this.files[filePath];
		if(this.watchers[withoutCase(filePath)]) {
			this.watchers[withoutCase(filePath)].forEach(function(w) {
				w.emit("remove");
			});
		}
	}
	if(this.watchers[withoutCase(this.path)]) {
		this.watchers[withoutCase(this.path)].forEach(function(w) {
			if(!initial || w.checkStartTime(mtime, initial)) {
				w.emit("change", filePath, mtime);
			}
		});
	}
};
/* eslint-enable */
