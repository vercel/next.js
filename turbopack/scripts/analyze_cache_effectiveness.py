#!/usr/bin/env python3
"""
Cache Effectiveness Analysis Script

This script analyzes task statistics to identify which tasks are not getting
significant benefit from caching and would be candidates for removing the
caching layer.

To use this script, run: a build with `NEXT_TURBOPACK_TASK_STATISTICS=path/to/stats.json` set

Then run this script with the path to the stats.json file to get a report on optimization opportunities.

Based on benchmarking data from the `turbopack/crates/turbo-tasks-backend/benches/overhead.rs` benchmark we have the following estimates:
- Cache hit cost: 200-500ns
- Execution overhead: 4-6us
- Measurement overhead: 260ns-750ns

This script assumes the best case scenario and reports on the potential time savings from removing the caching layer.
"""

import json
import sys
from typing import Dict, List, Tuple
from dataclasses import dataclass


@dataclass
class TaskStats:
    name: str
    cache_hit: int
    cache_miss: int
    executions: int
    duration_ns: int

    @property
    def total_operations(self) -> int:
        return self.cache_hit + self.cache_miss

    @property
    def cache_hit_rate(self) -> float:
        if self.total_operations == 0:
            return 0.0
        return self.cache_hit / self.total_operations

    @property
    def avg_execution_time_ns(self) -> int:
        MEASUREMENT_OVERHEAD =   750 # OVerhead implicit in the reported duration
        if self.executions == 0:
            return 0
        return max(0, (self.duration_ns  - MEASUREMENT_OVERHEAD * self.executions) // self.executions)


def parse_duration(duration_dict: Dict) -> int:
    """Convert duration dict to nanoseconds."""
    return duration_dict.get("secs", 0) * 1_000_000_000 + duration_dict.get("nanos", 0)


def load_task_stats(file_path: str) -> List[TaskStats]:
    """Load and parse task statistics from JSON file."""
    with open(file_path, 'r') as f:
        data = json.load(f)

    tasks = []
    for task_name, stats in data.items():
        duration_ns = parse_duration(stats["duration"])
        task = TaskStats(
            name=task_name,
            cache_hit=stats["cache_hit"],
            cache_miss=stats["cache_miss"],
            executions=stats["executions"],
            duration_ns=duration_ns
        )
        tasks.append(task)

    return tasks


def calculate_cache_effectiveness(task: TaskStats) -> float:
    """
    Calculate the effectiveness of caching for a task.

    Returns:
        Time savings from removing caching (negative means caching is beneficial)
    """
    # Constants based on benchmarking
    # These are optimistic estimates
    CACHE_HIT_COST_NS = 500  # Average of 200-500ns
    EXECUTION_OVERHEAD_NS = 6000  # Average of 4-6us (caching layer overhead)
    MEASUREMENT_OVERHEAD =   750 # OVerhead implicit in the reported duration

    if task.total_operations == 0:
        return 0.0

    # Current cost with caching
    # Cache hits: just the cache lookup cost
    # Cache misses: cache overhead + actual execution time
    cache_hit_cost = task.cache_hit * CACHE_HIT_COST_NS
    cache_miss_cost = task.cache_miss * (EXECUTION_OVERHEAD_NS + task.avg_execution_time_ns)
    current_total_cost = cache_hit_cost + cache_miss_cost

    # Cost without caching (all operations would be direct executions, no overhead)
    no_cache_cost = task.total_operations * task.avg_execution_time_ns

    # Time savings from removing caching (positive means we save time by removing cache)
    time_savings = current_total_cost - no_cache_cost

    return time_savings


def analyze_tasks(tasks: List[TaskStats]) -> List[Tuple[TaskStats, float]]:
    """Analyze all tasks and return sorted by potential time savings."""
    results = []

    for task in tasks:
        results.append((task, calculate_cache_effectiveness(task)))

    # Sort by time savings (descending - highest savings first)
    results.sort(key=lambda x: x[1], reverse=True)

    return results


def format_time(nanoseconds: float) -> str:
    """Format time in appropriate units (ns, μs, ms, s)."""
    sign = "-" if nanoseconds < 0 else ""
    nanoseconds = abs(nanoseconds)
    if nanoseconds >= 1_000_000_000:  # >= 1 second
        return f"{sign}{nanoseconds / 1_000_000_000:.2f}s"
    elif nanoseconds >= 1_000_000:  # >= 1 millisecond
        return f"{sign}{nanoseconds / 1_000_000:.2f}ms"
    elif nanoseconds >= 1_000:  # >= 1 microsecond
        return f"{sign}{nanoseconds / 1_000:.1f}μs"
    else:  # nanoseconds
        return f"{sign}{nanoseconds:.0f}ns"


def print_analysis(results: List[Tuple[TaskStats, float]]):
    """Print the analysis results."""
    print("Tasks ranked by estimated time savings from removing caching layer")
    print()

    if not results:
        print("No tasks would benefit from removing caching.")
        return
    # Print header
    header = (f"{'Savings':<10} {'Hit Rate':<8} {'Exec Time':<10} "
             f"{'Operations':<10} {'Task Name'}")
    print(header)
    print("-" * len(header))

    # Print results
    for (task, time_savings) in results:
        savings_str = format_time(time_savings)
        hit_rate_str = f"{task.cache_hit_rate:.1%}"
        exec_time_str = format_time(task.avg_execution_time_ns)
        operations_str = f"{task.total_operations:,}"

        print(f"{savings_str:<10} {hit_rate_str:<8} {exec_time_str:<10} "
              f"{operations_str:<10} {task.name}")

    # Print summary
    total_savings = sum(time_savings if time_savings > 0 else 0 for _, time_savings in results)
    print()
    print(f"Summary: {sum(1 if time_savings > 0 else 0 for _, time_savings in results)} tasks would benefit from removing caching")
    print(f"Total potential savings: {format_time(total_savings)}")
    print()
    print("Legend:")
    print("- Savings: Time saved by removing caching layer")
    print("- Hit Rate: Percentage of operations that were cache hits")
    print("- Exec Time: Average execution time per operation")
    print("- Operations: Total number of cache hits + misses")



def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze_cache_effectiveness.py <stats-durations.json>")
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        tasks = load_task_stats(file_path)
        results = analyze_tasks(tasks)
        print_analysis(results)

    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
