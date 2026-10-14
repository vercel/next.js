# Turbopack trace server

Serve a trace over the viewer's local WebSocket protocol:

```sh
cargo run -p turbopack-trace-server --bin turbo-trace-server -- <trace-file> 5747
```

## Timeline view

Set `viewRect.viewMode` to `"timeline"` in a `view-rect` request. Timeline uses individual spans' actual start and end, relative to the store's trace origin, instead of corrected durations or accumulated CPU work. It places overlapping intervals in separate flat lanes, including parent/child intervals, and excludes the synthetic root container. Per-span flame-layout overrides and value modes do not change Timeline geometry.

Timeline detail queries use these same lifecycle timestamps. Original start/end records are retained separately from subtree extents: children can outlive their parent, and an asynchronous span can end after its last CPU exit. Existing flame extents and CPU/corrected accounting are unchanged.

Lane assignment is deterministic for a fixed store generation and cached across viewport/search changes. Search dims nonmatches without moving intervals; the usual `!` focus suffix does not hide spans in this view. Dense sub-pixel runs in one lane become counted placeholders; zoom in to obtain the individual spans and IDs. Zero-duration events use one-tick display markers.

Only the requested time/row window (plus overscan) is transmitted. `view-lines-count.count` is the total number of lanes, not the number of transmitted rows, and `max` is the latest elapsed interval end across all lanes.

### Capability negotiation

Every `view-lines-count` response includes two additive fields:

```json
{
  "type": "view-lines-count",
  "count": 8,
  "max": 1000000,
  "viewModes": ["timeline"],
  "viewMode": "timeline"
}
```

`viewModes` advertises Timeline support; `viewMode` identifies the response's requested layout so clients can discard in-flight rows from an older layout. Existing clients can ignore these fields. No new unsolicited message type is introduced. Clients must not send Timeline to legacy servers without positive support confirmation: those servers interpret an unknown view mode as aggregation.

Span-detail queries and the existing `ack` / `check-for-more-data` flow are unchanged. Store-generation changes invalidate the chronological cache so appended trace data appears on subsequent updates.
