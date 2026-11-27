self.onconnect = (e) => e.ports[0].postMessage('hello from global-this-worker')
