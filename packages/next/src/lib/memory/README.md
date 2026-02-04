# Debug Memory Usage

This directory contains a number of utilities to help in debugging
memory usage.

When enabled, code in this directory will:

- Periodically print out memory usage statistics
- Print a report with a summary of memory usage and suggestions for how to
  improve.
- Generate heap snapshots automatically when too much memory is being consumed
- Monitor garbage collection events for long running GCs
