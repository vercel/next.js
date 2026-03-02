# SPAA Specification v1.0

**Stack Profile for Agentic Analysis**

---

## 1. Purpose

**SPAA (Stack Profile for Agentic Analysis)** is a structured, lossless, AI-friendly file format for representing sampled performance stack traces from profiling tools like Linux `perf` and DTrace.

SPAA is designed to:

- Preserve full fidelity of profiler data across tools
- Represent **aggregated call stacks as first-class objects**
- Encode **explicit metric semantics** for each profiler
- Support deterministic analysis, flamegraph reconstruction, and agent reasoning
- Remain simple to parse, stream, compress, and diff

SPAA is **not** a streaming telemetry protocol.
It is an **offline analysis artifact** intended for humans, agents, and tooling.

---

## 2. File format

- Encoding: **UTF-8**
- Container: **NDJSON (newline-delimited JSON)**
- Compression: optional (`zstd` recommended)
- Ordering:
  - The header record MUST appear first
  - Dictionary records (dso, frame, thread) MUST appear before any records that reference them
  - Stack and sample records MAY appear in any order after dictionaries
  - This enables single-pass streaming parsers

Each line is a single JSON object with a mandatory `type` field.

---

## 3. Required record types

### 3.1 Header (exactly one)

```json
{
  "type": "header",
  "format": "spaa",
  "version": "1.0",
  "source_tool": "perf",
  "frame_order": "leaf_to_root",
  "events": [
    {
      "name": "cycles",
      "kind": "hardware",
      "sampling": {
        "mode": "period",
        "primary_metric": "period"
      }
    }
  ],
  "time_range": {
    "start": 12345.0,
    "end": 12405.0,
    "unit": "seconds"
  },
  "source": {
    "tool": "perf",
    "command": "perf record -F 99 -a -g",
    "tool_version": "6.1.0"
  },
  "stack_id_mode": "content_addressable"
}
```

#### Fields

- `frame_order`: MUST be `"leaf_to_root"` or `"root_to_leaf"`
- `events`: Array of event definitions (see below)
- `stack_id_mode`: MUST be `"content_addressable"` or `"local"` (see 4.1)

#### Event definition

Each event object MUST contain:

- `name`: Event identifier (e.g., `"cycles"`, `"profile-997"`, `"syscall::read:entry"`)
- `kind`: MUST be one of:
  - `"hardware"` - CPU hardware events (perf)
  - `"software"` - kernel software events (perf)
  - `"allocation"` - heap/memory allocation events
  - `"deallocation"` - memory deallocation events
  - `"timer"` - time-based sampling (DTrace profile provider)
  - `"probe"` - tracepoint or probe (DTrace providers, perf tracepoints)
- `sampling`: Object defining how samples were collected

#### Sampling modes

The `sampling` object MUST contain:

- `mode`: MUST be one of:
  - `"period"` - event-based sampling (perf: sample every N events)
  - `"frequency"` - time-based sampling (perf -F Hz, DTrace profile-N)
  - `"event"` - every occurrence traced (DTrace probes, perf tracepoints)
- `primary_metric`: The authoritative weight for aggregation

**Tool-specific sampling fields:**

For perf with `mode: "period"`:

```json
"sampling": {
  "mode": "period",
  "primary_metric": "period",
  "sample_period": 100000
}
```

For DTrace with `mode: "frequency"`:

```json
"sampling": {
  "mode": "frequency",
  "primary_metric": "samples",
  "frequency_hz": 997
}
```

For DTrace probes with `mode: "event"`:

```json
"sampling": {
  "mode": "event",
  "primary_metric": "count"
}
```

#### Normative rules

- Exactly **one** header MUST exist
- `frame_order` defines stack frame ordering for all stacks in the file
- Consumers MUST NOT assume wall-clock time per sample unless `sampling.mode` is `"frequency"` and frequency is specified

---

### 3.2 DSO dictionary

Represents binaries, shared libraries, and kernel images.

```json
{
  "type": "dso",
  "id": 12,
  "name": "/usr/bin/myapp",
  "build_id": "abcd1234567890abcdef",
  "is_kernel": false
}
```

#### Rules

- `id` MUST be unique within the file
- Kernel DSOs MUST set `is_kernel=true`
- `build_id` SHOULD be included when available
- `build_id` format: lowercase hex string, no separators (matches perf format)

---

### 3.3 Frame dictionary

Represents a single stack frame identity.

```json
{
  "type": "frame",
  "id": 101,
  "func": "mycrate::parse::parse_file",
  "func_resolved": true,
  "dso": 12,
  "ip": "0x401234",
  "symoff": "0x54",
  "srcline": "src/parse.rs:214",
  "srcline_resolved": true,
  "inlined": false,
  "kind": "user"
}
```

#### Rules

- Frames MUST reference a valid `dso`
- `kind` MUST be one of:
  - `user` - userspace code
  - `kernel` - kernel code
  - `unknown` - cannot determine
- `func_resolved` (optional, default `true`): whether `func` is a resolved symbol
  - When `false`, `func` SHOULD contain the raw IP as hex string
- `srcline_resolved` (optional, default `true`): whether source location was available
- `symoff` (optional): symbol offset as hex string
  - Present for perf with DWARF info
  - Often absent for DTrace
- `inlined` (optional, default `false`): whether this is a compiler-inlined frame
  - Only applicable for perf with DWARF unwinding
  - DTrace does not provide inlining information

#### Inlined frames (perf-specific)

When perf DWARF unwinding exposes inlining, multiple logical frames share the same IP:

```json
[
  {
    "type": "frame",
    "id": 201,
    "func": "mycrate::parse::check_bounds",
    "dso": 12,
    "ip": "0x401234",
    "srcline": "src/parse.rs:89",
    "inlined": true,
    "inline_depth": 2,
    "kind": "user"
  },
  {
    "type": "frame",
    "id": 202,
    "func": "mycrate::parse::validate_token",
    "dso": 12,
    "ip": "0x401234",
    "srcline": "src/parse.rs:142",
    "inlined": true,
    "inline_depth": 1,
    "kind": "user"
  },
  {
    "type": "frame",
    "id": 203,
    "func": "mycrate::parse::parse_file",
    "dso": 12,
    "ip": "0x401234",
    "srcline": "src/parse.rs:214",
    "inlined": false,
    "inline_depth": 0,
    "kind": "user"
  }
]
```

Rules for inlined frames:

- `inline_depth` (optional): 0 = physical frame, 1+ = inline nesting level
- All inlined frames at the same IP SHOULD share `dso`, `ip`, and `symoff`
- Frames MUST be ordered by inline depth (deepest first in leaf-to-root)

---

### 3.4 Thread dictionary (optional but recommended)

```json
{
  "type": "thread",
  "pid": 4242,
  "tid": 4511,
  "comm": "myapp"
}
```

- `tid`: Thread ID (required; unique within the file for lookup purposes)
- `pid`: Process ID (required)
- `comm`: Command/thread name at time of profiling (optional)

Parsers MAY use (`pid`, `tid`) pairs for cross-file thread correlation. Within a single file, `tid` alone is sufficient for lookups.

---

## 4. Stack records (core payload)

Each stack record represents **one unique call stack**, aggregated across samples.

```json
{
  "type": "stack",
  "id": "0xdeadbeef",
  "frames": [101, 77, 12, 3],
  "stack_type": "unified",
  "context": {
    "pid": 4242,
    "tid": 4511,
    "cpu": 3,
    "event": "cycles"
  },
  "weights": [
    { "metric": "samples", "value": 18342 },
    { "metric": "period", "value": 987654321, "unit": "events" }
  ],
  "exclusive": {
    "frame": 101,
    "weights": [{ "metric": "period", "value": 123456789 }]
  }
}
```

### 4.1 Stack identity

Stack `id` values MUST follow the mode declared in the header:

**Content-addressable** (recommended):

- A deterministic hash of the frame sequence
- Enables diffing across profile runs
- Can be hex string (`"0xdeadbeef"`) or numeric hash
- Hashing algorithm is implementation-defined

**File-local** (`stack_id_mode: "local"`):

- An arbitrary unique identifier within this SPAA file
- No cross-file stability guarantees
- MUST NOT be relied upon for comparison between files

### 4.2 Stack type

`stack_type` (optional, default `"unified"`):

- `"unified"` - single stack with kernel and user frames (typical perf)
- `"user"` - user-space only (DTrace ustack())
- `"kernel"` - kernel-space only (DTrace kstack())

When DTrace captures both user and kernel stacks for the same sample, they SHOULD be separate stack records with `related_stacks` linking them:

```json
{
  "type": "stack",
  "id": "0xaaa",
  "stack_type": "user",
  "frames": [101, 102],
  "related_stacks": ["0xbbb"],
  "context": { "event": "profile-997", ... }
}
{
  "type": "stack",
  "id": "0xbbb",
  "stack_type": "kernel",
  "frames": [201, 202],
  "related_stacks": ["0xaaa"],
  "context": { "event": "profile-997", ... }
}
```

### 4.3 Context

The `context` object contains sample metadata. Required fields:

- `event`: Event name (must match one from header `events`)

Optional standard fields:

- `pid`, `tid`: process/thread ID
- `cpu`: CPU number
- `comm`: command name

**Tool-specific context extensions:**

DTrace probes MAY include:

```json
"context": {
  "event": "syscall::read:entry",
  "probe": {
    "provider": "syscall",
    "module": "",
    "function": "read",
    "name": "entry"
  },
  "execname": "myapp",
  "uid": 1000,
  "zonename": "global"
}
```

Perf tracepoints MAY include:

```json
"context": {
  "event": "sched:sched_switch",
  "trace_fields": {
    "prev_comm": "myapp",
    "next_comm": "idle",
    "prev_pid": 1234
  }
}
```

**Extensibility:**

- Unknown context keys SHOULD be preserved by parsers
- Custom keys SHOULD use namespace prefixes (e.g., `"x_vendor_key"`)

### 4.4 Weights

`weights` is an array of metric measurements for this aggregated stack.

MUST include the event's `primary_metric` from the header.

**Perf-derived weights:**

- `samples` - count of samples
- `period` - sum of perf sample period (authoritative for event-based sampling)

**DTrace-derived weights:**

- `samples` or `count` - number of times this stack was observed
- Custom quantize/aggregation functions MAY appear as metrics

**Optional derived metrics:**

- `cpu_time_ns` - ONLY if derivation is documented and valid
- `cache_misses`, `branch_misses` - hardware counter values
- Tool-specific metrics with clear semantics

**Critical rule:** Derived metrics MUST NOT replace tool-native metrics. Perf profiles must retain `period`, DTrace profiles must retain `samples`/`count`.

### 4.5 Exclusive weights

`exclusive` (optional but strongly recommended) attributes weights to the **logical leaf frame** - the first frame in the `frames` array according to `frame_order`.

```json
"exclusive": {
  "frame": 101,
  "weights": [
    { "metric": "period", "value": 123456789 }
  ]
}
```

- `frame`: MUST match the leaf frame ID from the `frames` array
- `weights`: SHOULD include the same metrics as the stack's `weights`

**Inlined frame handling:** When the leaf frame is an inlined function, exclusive weights are attributed to that inlined frame, not the physical instruction address. This reflects where the CPU was logically executing.

**Rationale:** Flamegraph tools and hotspot analysis need to know _which function_ was hot, not which instruction address. Inlined functions are real code; attributing time to them enables accurate optimization decisions.

---

## 5. Optional record types

### 5.1 Raw samples

```json
{
  "type": "sample",
  "timestamp": 12345.6789,
  "pid": 4242,
  "tid": 4511,
  "cpu": 3,
  "event": "cycles",
  "period": 123456,
  "stack_id": "0xdeadbeef",
  "context": {}
}
```

Used for:

- Phase detection
- Anomaly analysis
- Temporal correlation

Rules:

- `stack_id` MUST reference a valid stack record
- `timestamp`: Absolute time in the same unit and epoch as `header.time_range`
- To compute relative offset from profile start, subtract `header.time_range.start`

---

### 5.2 Time windows

```json
{
  "type": "window",
  "id": "w1",
  "start": 10.0,
  "end": 11.0,
  "unit": "seconds",
  "by_stack": [
    {
      "stack_id": "0xdeadbeef",
      "weights": [{ "metric": "period", "value": 930000000 }]
    }
  ]
}
```

Windows MAY overlap and are not required to partition the time range.

---

## 6. Tool support matrix

| Feature              | perf              | DTrace           |
| -------------------- | ----------------- | ---------------- |
| Sampling modes       | period, frequency | frequency, event |
| Primary metric       | period            | samples/count    |
| Inlined frames       | Yes (DWARF)       | No               |
| Symbol offsets       | Yes               | Rarely           |
| Kernel+user unified  | Yes               | No (separate)    |
| Multiple events/file | Rare              | Common           |
| Probe context        | Limited           | Rich             |
| Memory profiling     | Via eBPF          | Via providers    |

---

## 7. Validation rules

A conforming parser MUST reject files where:

- Header is not first record
- Frame references non-existent DSO
- Stack references non-existent frame
- Stack's primary metric is missing from weights
- Frame order doesn't match header declaration

A conforming parser SHOULD warn when:

- Unknown `source_tool` value
- Unknown context keys (but preserve them)
- Suspicious metric values (e.g., period = 0)

---

## 8. Guarantees

A valid SPAA file MUST allow:

- Exact flamegraph reconstruction with correct weights
- Stable stack identity across transformations (if content-addressable)
- Deterministic aggregation
- Tool-agnostic analysis where possible
- Lossless round-trip from native formats

---

## 9. Memory profiling

SPAA supports heap and allocation profilers (heaptrack, tcmalloc, jemalloc pprof, etc.) through allocation-specific events and metrics.

### 9.1 Event definition

```json
{
  "name": "malloc",
  "kind": "allocation",
  "sampling": {
    "mode": "event",
    "primary_metric": "alloc_bytes"
  },
  "allocation_tracking": {
    "tracks_frees": true,
    "has_timestamps": true
  }
}
```

- `kind`: Use `"allocation"` for malloc/new events, `"deallocation"` for free/delete events
- `sampling.mode`: Typically `"event"` (every allocation traced) or `"period"` (sampled every N bytes)
- `allocation_tracking` (optional): Metadata about what the profiler captured

### 9.2 Standard allocation metrics

Converters SHOULD use these metric names for interoperability:

| Metric        | Description                       | Unit  |
| ------------- | --------------------------------- | ----- |
| `alloc_bytes` | Cumulative bytes allocated        | bytes |
| `alloc_count` | Number of allocation calls        | count |
| `free_bytes`  | Cumulative bytes freed            | bytes |
| `free_count`  | Number of deallocation calls      | count |
| `live_bytes`  | Bytes allocated minus bytes freed | bytes |
| `live_count`  | Allocations minus deallocations   | count |
| `peak_bytes`  | High-water mark for this stack    | bytes |

### 9.3 Example stack record

```json
{
  "type": "stack",
  "id": "0xmemstack1",
  "frames": [101, 77, 12],
  "context": {
    "event": "malloc",
    "tid": 4511
  },
  "weights": [
    { "metric": "alloc_bytes", "value": 104857600, "unit": "bytes" },
    { "metric": "alloc_count", "value": 1024 },
    { "metric": "live_bytes", "value": 52428800, "unit": "bytes" },
    { "metric": "live_count", "value": 512 }
  ],
  "exclusive": {
    "frame": 101,
    "weights": [
      { "metric": "alloc_bytes", "value": 104857600, "unit": "bytes" }
    ]
  }
}
```

### 9.4 Correlation with CPU profiles

A single SPAA file MAY contain both CPU and memory events. Stacks are distinguished by `context.event`. This enables unified analysis, for example: identifying functions that are both CPU-hot and allocation-heavy.

When combining profiles, converters SHOULD ensure `time_range` encompasses all events and that stack IDs remain unique across event types.
