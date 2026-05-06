#!/usr/bin/env python3
"""
Cache Effectiveness Analysis Script

This script analyzes task statistics to identify which tasks are not getting
significant benefit from caching and would be candidates for removing the
caching layer.

To use this script, run a build with `NEXT_TURBOPACK_TASK_STATISTICS=path/to/stats.json` set

Then run this script with the path to the stats.json file to get a report on cache effectiveness.

The JSON format contains entries like:
  { "task_name": { "cache_hit": N, "cache_miss": N } }
"""

import json
import sys
from typing import List, Tuple
from dataclasses import dataclass


@dataclass
class TaskStats:
    name: str
    cache_hit: int
    cache_miss: int

    @property
    def total_operations(self) -> int:
        return self.cache_hit + self.cache_miss

    @property
    def cache_hit_rate(self) -> float:
        if self.total_operations == 0:
            return 0.0
        return self.cache_hit / self.total_operations


def load_task_stats(file_path: str) -> List[TaskStats]:
    """Load and parse task statistics from JSON file."""
    with open(file_path, 'r') as f:
        data = json.load(f)

    tasks = []
    for task_name, stats in data.items():
        task = TaskStats(
            name=task_name,
            cache_hit=stats["cache_hit"],
            cache_miss=stats["cache_miss"],
        )
        tasks.append(task)

    return tasks


def analyze_tasks(tasks: List[TaskStats]) -> List[TaskStats]:
    """Analyze all tasks and return sorted by wasted cache overhead.

    Tasks with the most wasted overhead are ranked first. Wasted overhead is
    estimated as cache misses (each miss pays lookup cost but gets no benefit)
    plus cache hits weighted by their relative cheapness compared to a miss.

    In practice this sorts by: most cache misses first, breaking ties by lower
    hit rate.
    """
    # Sort by cache_miss descending, then by hit rate ascending
    tasks.sort(key=lambda t: (-t.cache_miss, t.cache_hit_rate))
    return tasks


def print_analysis(tasks: List[TaskStats]):
    """Print the analysis results."""
    print("Tasks ranked by cache effectiveness (worst first)")
    print()

    if not tasks:
        print("No tasks found.")
        return

    # Print header
    header = (f"{'Hit Rate':<10} {'Hits':<10} {'Misses':<10} "
             f"{'Total':<10} {'Task Name'}")
    print(header)
    print("-" * len(header))

    total_hits = 0
    total_misses = 0
    low_hit_rate_count = 0

    # Print results
    for task in tasks:
        hit_rate_str = f"{task.cache_hit_rate:.1%}"
        hits_str = f"{task.cache_hit:,}"
        misses_str = f"{task.cache_miss:,}"
        total_str = f"{task.total_operations:,}"

        print(f"{hit_rate_str:<10} {hits_str:<10} {misses_str:<10} "
              f"{total_str:<10} {task.name}")

        total_hits += task.cache_hit
        total_misses += task.cache_miss
        if task.cache_hit_rate < 0.5:
            low_hit_rate_count += 1

    total_ops = total_hits + total_misses
    overall_hit_rate = total_hits / total_ops if total_ops > 0 else 0.0

    # Print summary
    print()
    print(f"Total functions: {len(tasks)}")
    print(f"Total cache misses: {total_misses:,}")
    print(f"Overall cache hit rate: {overall_hit_rate:.1%} ({total_hits:,} hits / {total_ops:,} total)")
    print(f"Tasks with <50% hit rate: {low_hit_rate_count}")


def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze_cache_effectiveness.py <stats.json>")
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        tasks = load_task_stats(file_path)
        tasks = analyze_tasks(tasks)
        print_analysis(tasks)

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
