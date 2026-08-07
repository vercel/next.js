# Watching the filesystem

`turbo-tasks-fs` watches the project directory and invalidates the Turbo-Engine functions that read
a path when that path changes. The watcher lives in
[`turbopack/crates/turbo-tasks-fs/src/watcher.rs`](../../turbopack/crates/turbo-tasks-fs/src/watcher.rs).

Events arrive from [`notify`][notify] and are collected into a batch, which is flushed a few
milliseconds after the last event. Batching keeps a file that is written several times in quick
succession from invalidating its readers several times, and avoids reading a file while it is still
being written.

## Environment variables

These are debugging and experimentation knobs, not supported configuration. They are read once, when
the process starts.

### `TURBO_TASKS_FORCE_WATCH_MODE`

Overrides how the project directory is watched. Accepts `recursive` or `nonrecursive`.

By default macOS and Windows watch recursively, because both have an efficient recursive watcher and
filtering the resulting events is cheaper than tracking each file. Linux watches non-recursively,
because `inotify` is not recursive and `notify`'s emulation of it is more expensive than tracking the
files we know we care about.

### `TURBO_TASKS_SUPPRESS_UNCHANGED_WRITES`

Set to `1` or `true` to skip invalidation for a write that leaves a file's contents unchanged.

Tools produce these writes routinely: a formatter that reformatted nothing, a code generator that
reran, a `git checkout` that restored identical bytes, or an editor that saves on focus loss. The
filesystem reports every one of them, because the mtime really did move, so everything that read the
file is invalidated and the work downstream of it runs again to arrive at the same output.

With this enabled, the watcher hashes each changed file when it flushes a batch and drops the
invalidation for any file whose contents and permissions match what they were the last time that
file was invalidated. The trade is one read and one hash of each changed file against the work an
invalidation would have caused.

It is deliberately conservative. A file is only eligible when the batch holds nothing for it but a
content modification, so these all keep their invalidations:

- creates, removals, and renames, which change a directory listing and whether a path exists;
- writes to a symlink, since `read_link` resolves the link itself rather than what it points at;
- permission changes, which `metadata()` observes even when no byte moved;
- the first write to a file after the process starts, which has no previous contents to be compared
  against;
- anything that cannot be read, so an error can never be mistaken for "unchanged".

Editors that save atomically, writing a temp file and renaming it over the target, produce a create
alongside the modification, so their saves are not eligible either.

[notify]: https://docs.rs/notify
