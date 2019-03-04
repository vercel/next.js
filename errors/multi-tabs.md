# Multiple Tabs

#### Why This Error Occurred

In development mode Next.js creates 2 persistent connections to the server to receive hot updates and to keep pages active. Each browser has their own limit for the number of concurrent connections to a specific server a site is allowed to have so if you open the same Next.js site in multiple tabs of the same browser you could exceed your browser's limit.

More info here: https://tools.ietf.org/html/rfc6202#section-5.1

#### Possible Ways to Fix It

- Don't have too many tabs open to the same Next.js site open in development in the same browser at the same time. 
- If using Firefox you can increase this limit by navigating to `about:config` and setting `network.http.max-persistent-connections-per-server` to a higher number

