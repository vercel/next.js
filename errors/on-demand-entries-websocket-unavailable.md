# onDemandEntries WebSocket unavailable

#### Why This Error Occurred

By default Next.js uses a random port to create a WebSocket to receive pings from the client letting it know to keep pages active. For some reason when the client tried to connect to this WebSocket the connection fails. 

#### Possible Ways to Fix It

If you don't mind the fetch requests in your network console then you don't have to do anything as the fallback to fetch works fine. If you do, then depending on your set up you might need configure settings using the below config options from `next.config.js`:

```js
module.exports = {
  onDemandEntries: {
    // optionally configure a port for the onDemandEntries WebSocket, not needed by default
    websocketPort: 3001,
    // optionally configure a proxy path for the onDemandEntries WebSocket, not need by default
    websocketProxyPath: '/hmr',
    // optionally configure a proxy port for the onDemandEntries WebSocket, not need by default
    websocketProxyPort: 7002,
  },
}
```

If you are using a custom server with SSL configured, you might want to take a look at [the example](https://github.com/zeit/next.js/tree/canary/examples/custom-server-proxy-websocket) showing how to proxy the WebSocket connection through your custom server

### Useful Links

- [onDemandEntries config](https://github.com/zeit/next.js#configuring-the-ondemandentries)
- [Custom server proxying example](https://github.com/zeit/next.js/tree/canary/examples/custom-server-proxy-websocket)