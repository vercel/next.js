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

Usage:
  analyze_cache_effectiveness.py <stats.json>
  analyze_cache_effectiveness.py --diff <before.json> <after.json> [--top N]

In --diff mode, the script reports the tasks whose hits or misses changed the
most between the two runs — useful for evaluating the impact of removing or
adding `turbo_tasks` caching on specific functions.
"""

import argparse
import json
import sys
from typing import Dict, List
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


def load_task_stats_map(file_path: str) -> Dict[str, TaskStats]:
    return {t.name: t for t in load_task_stats(file_path)}


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


@dataclass
class TaskDiff:
    name: str
    before_hit: int
    after_hit: int
    before_miss: int
    after_miss: int

    @property
    def delta_hit(self) -> int:
        return self.after_hit - self.before_hit

    @property
    def delta_miss(self) -> int:
        return self.after_miss - self.before_miss

    @staticmethod
    def _rate(hit: int, miss: int) -> float:
        total = hit + miss
        return hit / total if total > 0 else 0.0

    @property
    def before_rate(self) -> float:
        return self._rate(self.before_hit, self.before_miss)

    @property
    def after_rate(self) -> float:
        return self._rate(self.after_hit, self.after_miss)

    @property
    def delta_rate(self) -> float:
        return self.after_rate - self.before_rate


def compute_diff(
    before: Dict[str, TaskStats], after: Dict[str, TaskStats]
) -> List[TaskDiff]:
    names = set(before) | set(after)
    diffs = []
    zero = TaskStats(name="", cache_hit=0, cache_miss=0)
    for name in names:
        b = before.get(name, zero)
        a = after.get(name, zero)
        diffs.append(
            TaskDiff(
                name=name,
                before_hit=b.cache_hit,
                after_hit=a.cache_hit,
                before_miss=b.cache_miss,
                after_miss=a.cache_miss,
            )
        )
    return diffs


def _print_diff_section(
    title: str, diffs: List[TaskDiff], key, top: int, reverse: bool
):
    print("=" * 100)
    print(title)
    print("=" * 100)
    ordered = sorted(diffs, key=key, reverse=reverse)
    header = (
        f"{'Δhit':>12} {'Δmiss':>12} {'hit b→a':>22} {'miss b→a':>22} "
        f"{'rate b→a':>18}  Task"
    )
    print(header)
    print("-" * len(header))
    shown = 0
    for d in ordered:
        # Stop once the signed delta crosses zero in the direction we care about.
        v = key(d)
        if reverse and v <= 0:
            break
        if not reverse and v >= 0:
            break
        hit_str = f"{d.before_hit:,}→{d.after_hit:,}"
        miss_str = f"{d.before_miss:,}→{d.after_miss:,}"
        rate_str = f"{d.before_rate:.0%}→{d.after_rate:.0%}"
        print(
            f"{d.delta_hit:>+12,} {d.delta_miss:>+12,} "
            f"{hit_str:>22} {miss_str:>22} {rate_str:>18}  {d.name}"
        )
        shown += 1
        if shown >= top:
            break
    if shown == 0:
        print("(none)")
    print()


def print_diff(
    before: Dict[str, TaskStats], after: Dict[str, TaskStats], top: int
):
    diffs = compute_diff(before, after)

    before_hits = sum(t.cache_hit for t in before.values())
    after_hits = sum(t.cache_hit for t in after.values())
    before_misses = sum(t.cache_miss for t in before.values())
    after_misses = sum(t.cache_miss for t in after.values())
    before_total = before_hits + before_misses
    after_total = after_hits + after_misses
    before_rate = before_hits / before_total if before_total > 0 else 0.0
    after_rate = after_hits / after_total if after_total > 0 else 0.0

    only_before = set(before) - set(after)
    only_after = set(after) - set(before)

    print("Cache statistics diff (before → after)")
    print()
    print(
        f"Hits:     {before_hits:>12,} → {after_hits:>12,}  "
        f"({after_hits - before_hits:+,})"
    )
    print(
        f"Misses:   {before_misses:>12,} → {after_misses:>12,}  "
        f"({after_misses - before_misses:+,})"
    )
    print(
        f"Hit rate: {before_rate:>11.2%} → {after_rate:>11.2%}  "
        f"({(after_rate - before_rate) * 100:+.2f} pp)"
    )
    print(
        f"Tasks:    {len(before):>12,} → {len(after):>12,}  "
        f"(only in before: {len(only_before)}, only in after: {len(only_after)})"
    )
    print()

    _print_diff_section(
        f"Top {top} INCREASES IN HITS (after > before)",
        diffs,
        key=lambda d: d.delta_hit,
        top=top,
        reverse=True,
    )
    _print_diff_section(
        f"Top {top} INCREASES IN MISSES (after > before)",
        diffs,
        key=lambda d: d.delta_miss,
        top=top,
        reverse=True,
    )
    _print_diff_section(
        f"Top {top} DECREASES IN HITS (after < before)",
        diffs,
        key=lambda d: d.delta_hit,
        top=top,
        reverse=False,
    )
    _print_diff_section(
        f"Top {top} DECREASES IN MISSES (after < before)",
        diffs,
        key=lambda d: d.delta_miss,
        top=top,
        reverse=False,
    )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Analyze turbo_tasks cache effectiveness, or diff two stats files "
            "to see which tasks gained or lost hits/misses."
        ),
    )
    parser.add_argument(
        "--diff",
        action="store_true",
        help="Diff mode: compare two stats files and report largest changes.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=25,
        help="Number of entries to show per section in --diff mode (default: 25).",
    )
    parser.add_argument(
        "files",
        nargs="+",
        help=(
            "Path to stats JSON. In default mode, one file. "
            "In --diff mode, two files: <before> <after>."
        ),
    )

    args = parser.parse_args()

    try:
        if args.diff:
            if len(args.files) != 2:
                parser.error("--diff requires exactly two files: <before> <after>")
            before = load_task_stats_map(args.files[0])
            after = load_task_stats_map(args.files[1])
            print_diff(before, after, args.top)
        else:
            if len(args.files) != 1:
                parser.error("default mode requires exactly one stats file")
            tasks = load_task_stats(args.files[0])
            tasks = analyze_tasks(tasks)
            print_analysis(tasks)

    except FileNotFoundError as e:
        print(f"Error: File not found: {e.filename}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
