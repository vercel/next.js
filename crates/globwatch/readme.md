# Globwatch

> Watch a set of globs

This library provides an async interface over notify and glob-match to
efficiently watch a list of globs. Where possible it attempts to minimize the
number of watched directories by registering watchers for the minimum possible
set of files / folders by breaking down the glob pattern into a list of folders.

This is exposed as a `Stream` and a `Sink`. The stream produces `notify` events,
whereas the `Sink` can be used to update the configuration on-the-fly.

For a basic example see the `examples/cancel.rs`.

```rust
let (watcher, mut config) = GlobWatcher::new("./flush").unwrap();
let stop = StopSource::new();
let mut stream = watcher.into_stream(stop.token());
config.include(Path::new("/app/css").into());
config.include(Path::new("/app/html").into());
while let Some(Ok(e)) = stream.next().await {
    debug!("received event: {:?}", e);

    // use the cancellation token to stop the watcher
    drop(stop);
}
```
