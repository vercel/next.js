---
name: spaa
description: |
  Guidance for interpreting SPAA (Stack Profile for Agentic Analysis) files.
  Provides information on the file format, as well as tips on how to use it to identify performance
  bottlenecks, memory leaks, or opportunities for optimization.
  Use when the user is trying to read a .spaa file to understand the performance of an application.
allowed-tools: Bash(head:*) Bash(tail:*) Bash(grep:*) Bash(jq:*) Read
---

# Analyzing SPAA Files

SPAA (Stack Profile for Agentic Analysis) is an NDJSON file format for representing sampled performance stack traces. Each line is a self-contained JSON object with a `type` field.

**Before analyzing an SPAA file, read the full specification at [references/SPEC.md](references/SPEC.md).**

## Quick Start

### 1. Examine the header

The first line is always the header. It tells you what profiler generated the data and how to interpret metrics:

```bash
head -1 profile.spaa | jq .
```

Key header fields:

- `source_tool`: The profiler that generated this data (e.g., "perf", "dtrace")
- `frame_order`: Either `"leaf_to_root"` or `"root_to_leaf"` - determines how to read stack frames
- `events[].sampling.primary_metric`: The authoritative metric for weighting (e.g., "period" for perf, "samples" for DTrace)

### 2. Understand the record types

```bash
# Count records by type
grep -o '"type":"[^"]*"' profile.spaa | sort | uniq -c | sort -rn
```

Common types:

- `header` - File metadata (exactly one, always first)
- `dso` - Shared libraries and binaries
- `frame` - Individual stack frame definitions
- `thread` - Thread/process info
- `stack` - Aggregated call stacks with weights (the main data)
- `sample` - Individual sample events (optional, for temporal analysis)

### 3. Find performance hotspots

Extract the heaviest stacks by the primary metric:

```bash
# For perf data (uses "period" metric)
grep '"type":"stack"' profile.spaa | \
  jq -s 'sort_by(-.weights[] | select(.metric=="period") | .value) | .[0:10]'

# For DTrace data (uses "samples" metric)
grep '"type":"stack"' profile.spaa | \
  jq -s 'sort_by(-.weights[] | select(.metric=="samples") | .value) | .[0:10]'
```

### 4. Find hot functions (exclusive time)

Exclusive time shows where the CPU actually spent time, not just functions on the call path:

```bash
grep '"type":"stack"' profile.spaa | \
  jq -s '[.[] | select(.exclusive) | {frame: .exclusive.frame, value: (.exclusive.weights[] | select(.metric=="period") | .value)}] | group_by(.frame) | map({frame: .[0].frame, total: (map(.value) | add)}) | sort_by(-.total) | .[0:20]'
```

Then look up the frame IDs to get function names:

```bash
# Get frame details for a specific ID
grep '"type":"frame"' profile.spaa | jq 'select(.id == 101)'
```

## Analyzing Memory Profiles

SPAA also supports heap/allocation profilers. Memory events use different metrics:

```bash
# Find top allocation sites by bytes allocated
grep '"type":"stack"' profile.spaa | \
  jq -s '[.[] | select(.weights[] | .metric == "alloc_bytes")] | sort_by(-.weights[] | select(.metric=="alloc_bytes") | .value) | .[0:10]'

# Find potential memory leaks (high live_bytes)
grep '"type":"stack"' profile.spaa | \
  jq -s '[.[] | select(.weights[] | .metric == "live_bytes")] | sort_by(-.weights[] | select(.metric=="live_bytes") | .value) | .[0:10]'
```

Key memory metrics:

- `alloc_bytes` / `alloc_count` - Total allocations
- `live_bytes` / `live_count` - Currently unreleased memory (potential leaks)
- `peak_bytes` - High-water mark

## Reconstructing Call Stacks

Stack records contain frame IDs. To see the actual function names:

```bash
# Extract a stack and resolve its frames
STACK_FRAMES=$(grep '"type":"stack"' profile.spaa | head -1 | jq -r '.frames | @csv')

# Build a frame lookup table, then query it
grep '"type":"frame"' profile.spaa | jq -s 'INDEX(.id)' > /tmp/frames.json
echo $STACK_FRAMES | tr ',' '\n' | while read fid; do
  jq --arg id "$fid" '.[$id] | "\(.func) (\(.srcline // "unknown"))"' /tmp/frames.json
done
```

## Common Analysis Patterns

### Filter by thread/process

```bash
grep '"type":"stack"' profile.spaa | jq 'select(.context.tid == 4511)'
```

### Filter by event type

```bash
grep '"type":"stack"' profile.spaa | jq 'select(.context.event == "cycles")'
```

### Find kernel vs userspace time

```bash
# Kernel stacks
grep '"type":"stack"' profile.spaa | jq 'select(.stack_type == "kernel")'

# Or check frame kinds
grep '"type":"frame"' profile.spaa | jq 'select(.kind == "kernel")' | head -20
```

### Temporal analysis (if sample records exist)

```bash
# Check if raw samples are included
grep -c '"type":"sample"' profile.spaa

# Plot sample distribution over time
grep '"type":"sample"' profile.spaa | jq -s 'group_by(.timestamp | floor) | map({time: .[0].timestamp | floor, count: length})'
```

## Tips for Performance Analysis

1. **Start with the header** - Understand the profiler, sampling mode, and time range
2. **Check the primary metric** - Use `period` for perf, `samples` for DTrace
3. **Look at exclusive time first** - This shows actual hotspots, not just callers
4. **Cross-reference frame IDs** - Build a lookup table for readable output
5. **Filter by context** - Narrow down by thread, CPU, or event type
6. **For memory issues** - Focus on `live_bytes` to find leaks, `alloc_bytes` for churn
