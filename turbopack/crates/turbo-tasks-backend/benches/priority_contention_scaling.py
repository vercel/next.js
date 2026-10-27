#!/usr/bin/env python3
"""Capture CPU-scaling data for the `priority_contention` benchmark on this machine.

Builds the `turbo-tasks-backend` bench executable once (with the committed bench settings) and
runs the `priority_contention` benchmark group repeatedly, each time restricted to a different
number of logical CPUs. Tokio and turbo-tasks size their default worker pools from the CPUs the
process may run on (CPU quotas, e.g. of containers, can limit them further), so this sweeps the
number of workers. The script only captures data: there is no before/after comparison and no
plotting (Criterion runs with `--noplot`). To compare commits, run it once per commit.

Best on Linux (uses `os.sched_setaffinity`, `/proc/stat` and `/sys/devices/system/cpu`). Where
CPU affinity is unavailable (e.g. macOS), the script instead sets `TOKIO_WORKER_THREADS` and
`TURBO_TASKS_AVAILABLE_PARALLELISM` to each count. That limits the worker count, but the process
may still run on all CPUs, so the results are not directly comparable to pinned runs. Only the
Python 3 standard library is required.

Usage (from anywhere in the repository):

    python3 turbopack/crates/turbo-tasks-backend/benches/priority_contention_scaling.py
    python3 .../priority_contention_scaling.py --passes 1 --cpu-counts 1,4,16 --output out.csv
    python3 .../priority_contention_scaling.py --dry-run

CPU selection: the CPUs available to this process (`sched_getaffinity`) are ordered one logical
CPU per physical core first (by package, core and CPU id), then their SMT siblings. A run with
`n` CPUs uses the first `n` of that order. The default counts are 1, 2, 4, ... below the number
of available CPUs, plus that number. The topology is the one the OS reports; in a VM it may not
match the host. Without CPU affinity the counts are taken from `os.cpu_count()` and nothing is
ordered.

CSV columns (one row per pass x CPU count x benchmark variant):

    pass, cpus, cpu_list, limit, variant,
    median_ns, median_ci_lower_ns, median_ci_upper_ns, mean_ns, ci_confidence_level,
    steal_pct, git_commit, git_dirty, timestamp_utc

`cpus` is the number of allowed logical CPUs (not a measured worker count). `limit` is how it was
applied: `affinity` (CPU pinning, `cpu_list` names the CPUs) or `workers` (the env vars above,
`cpu_list` is empty). `median_*` and
`mean_ns` are Criterion's estimates of the time per iteration. `steal_pct` is the share of steal
time in all CPU time of the whole machine (all CPUs, `/proc/stat`) during the run; it is empty
when unavailable. High steal (e.g. on shared VMs) makes the results unreliable. Rows are
written as soon as a run finishes, so an interrupted capture keeps its completed runs.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import math
import os
import pathlib
import signal
import subprocess
import sys
from typing import Iterable, Optional, Sequence

GROUP = "turbo_tasks_backend_priority_contention"
EXPECTED_VARIANTS = 4
OVERRIDE_ENV_VARS = ("TOKIO_WORKER_THREADS", "TURBO_TASKS_AVAILABLE_PARALLELISM")
CSV_COLUMNS = [
    "pass",
    "cpus",
    "cpu_list",
    "limit",
    "variant",
    "median_ns",
    "median_ci_lower_ns",
    "median_ci_upper_ns",
    "mean_ns",
    "ci_confidence_level",
    "steal_pct",
    "git_commit",
    "git_dirty",
    "timestamp_utc",
]
REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


class ScalingError(Exception):
    pass


def cpu_counts(available: int) -> list[int]:
    """1, 2, 4, ... below `available`, then `available`."""
    counts = []
    n = 1
    while n < available:
        counts.append(n)
        n *= 2
    counts.append(available)
    return counts


def parse_cpu_counts(value: str, available: int) -> list[int]:
    """Parses a comma-separated list of CPU counts (deduplicated and sorted)."""
    counts = set()
    for part in value.split(","):
        part = part.strip()
        try:
            count = int(part)
        except ValueError:
            raise ScalingError(f"invalid CPU count {part!r}") from None
        if not 1 <= count <= available:
            raise ScalingError(f"CPU count {count} is not between 1 and {available}")
        counts.add(count)
    return sorted(counts)


def order_cpus(cpus: Iterable[int], sysfs: pathlib.Path) -> tuple[list[int], bool]:
    """Orders CPUs one per physical core first, then the SMT siblings.

    Returns the order and whether the topology could be read (otherwise numeric order)."""
    cpus = sorted(cpus)
    keys = {}
    for cpu in cpus:
        topology = sysfs / f"cpu{cpu}" / "topology"
        try:
            package = int((topology / "physical_package_id").read_text().strip())
            core = int((topology / "core_id").read_text().strip())
        except (OSError, ValueError):
            return cpus, False
        keys[cpu] = (package, core)
    first, siblings, seen = [], [], set()
    for cpu in sorted(cpus, key=lambda c: (keys[c], c)):
        if keys[cpu] in seen:
            siblings.append(cpu)
        else:
            seen.add(keys[cpu])
            first.append(cpu)
    siblings.sort(key=lambda c: (keys[c], c))
    return first + siblings, True


def find_bench_executable(cargo_json_lines: Iterable[str]) -> str:
    """Finds the `mod` bench executable of turbo-tasks-backend in Cargo's JSON messages."""
    for line in cargo_json_lines:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("reason") != "compiler-artifact" or not message.get("executable"):
            continue
        target = message.get("target", {})
        package_id = message.get("package_id", "")
        if (
            target.get("name") == "mod"
            and "bench" in target.get("kind", [])
            and "turbo-tasks-backend" in package_id
        ):
            return message["executable"]
    raise ScalingError("cargo did not report a turbo-tasks-backend `mod` bench executable")


def build_bench() -> str:
    command = [
        "cargo",
        "bench",
        "-p",
        "turbo-tasks-backend",
        "--bench",
        "mod",
        "--no-run",
        "--message-format=json-render-diagnostics",
    ]
    print("building:", " ".join(command), file=sys.stderr)
    # Cargo's progress goes to stderr; compiler diagnostics are JSON messages on stdout.
    try:
        result = subprocess.run(command, cwd=REPO_ROOT, stdout=subprocess.PIPE, text=True)
    except OSError as error:
        raise ScalingError(f"could not run cargo: {error}") from None
    if result.returncode != 0:
        for diagnostic in rendered_diagnostics(result.stdout.splitlines()):
            print(diagnostic, file=sys.stderr, end="" if diagnostic.endswith("\n") else "\n")
        raise ScalingError(f"cargo bench --no-run failed with exit code {result.returncode}")
    return find_bench_executable(result.stdout.splitlines())


def rendered_diagnostics(cargo_json_lines: Iterable[str]) -> list[str]:
    """The rendered compiler diagnostics in Cargo's JSON messages."""
    diagnostics = []
    for line in cargo_json_lines:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(message, dict) and message.get("reason") == "compiler-message":
            rendered = (message.get("message") or {}).get("rendered")
            if rendered:
                diagnostics.append(rendered)
    return diagnostics


def read_estimates(criterion_home: pathlib.Path) -> dict[str, dict]:
    """Reads `<group>/<kind>/<size>/new/estimates.json` for every variant of the group."""
    group_dir = criterion_home / GROUP
    files = sorted(group_dir.glob("*/*/new/estimates.json"))
    if len(files) != EXPECTED_VARIANTS:
        raise ScalingError(
            f"expected {EXPECTED_VARIANTS} variants in {group_dir}, found {len(files)}"
        )
    estimates = {}
    for path in files:
        variant = "/".join(path.relative_to(group_dir).parts[:2])
        try:
            data = json.loads(path.read_text())
            median = data["median"]
            interval = median["confidence_interval"]
            values = {
                "median_ns": float(median["point_estimate"]),
                "median_ci_lower_ns": float(interval["lower_bound"]),
                "median_ci_upper_ns": float(interval["upper_bound"]),
                "mean_ns": float(data["mean"]["point_estimate"]),
                "ci_confidence_level": float(interval["confidence_level"]),
            }
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ScalingError(f"invalid estimates in {path}: {error}") from None
        problem = validate_estimate(values)
        if problem:
            raise ScalingError(f"invalid estimates in {path}: {problem}")
        estimates[variant] = values
    return estimates


def validate_estimate(values: dict) -> Optional[str]:
    """Returns why the estimate values are implausible, or None."""
    if not all(math.isfinite(value) for value in values.values()):
        return "non-finite value"
    if min(values["median_ns"], values["median_ci_lower_ns"], values["mean_ns"]) <= 0:
        return "non-positive time"
    if not values["median_ci_lower_ns"] <= values["median_ns"] <= values["median_ci_upper_ns"]:
        return "median outside its confidence interval"
    if not 0 < values["ci_confidence_level"] < 1:
        return "confidence level not between 0 and 1"
    return None


def read_cpu_ticks(proc_stat: pathlib.Path = pathlib.Path("/proc/stat")) -> Optional[tuple[int, int]]:
    """(total ticks, steal ticks) of the aggregate `cpu` line, or None when unavailable."""
    try:
        for line in proc_stat.read_text().splitlines():
            fields = line.split()
            if fields and fields[0] == "cpu":
                # user nice system idle iowait irq softirq steal [guest guest_nice]
                values = [int(v) for v in fields[1:9]]
                if len(values) < 8:
                    return None
                return sum(values), values[7]
    except (OSError, ValueError):
        return None
    return None


def steal_pct(before: Optional[tuple[int, int]], after: Optional[tuple[int, int]]) -> Optional[float]:
    if before is None or after is None:
        return None
    total = after[0] - before[0]
    steal = after[1] - before[1]
    if total <= 0 or not 0 <= steal <= total:
        return None
    return 100.0 * steal / total


def git_info() -> tuple[str, str]:
    def git(*args: str) -> Optional[str]:
        try:
            result = subprocess.run(
                ["git", *args], cwd=REPO_ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
            )
        except OSError:
            return None
        return result.stdout if result.returncode == 0 else None

    commit = (git("rev-parse", "HEAD") or "").strip()
    status = git("status", "--porcelain")
    dirty = "" if status is None else ("true" if status.strip() else "false")
    return commit, dirty


def can_pin_cpus() -> bool:
    return hasattr(os, "sched_setaffinity") and hasattr(os, "sched_getaffinity")


def check_environment(env: dict) -> None:
    set_vars = [name for name in OVERRIDE_ENV_VARS if name in env]
    if set_vars:
        raise ScalingError(
            f"{', '.join(set_vars)} is set; the worker count would not follow the CPU restriction"
        )


def open_csv(path: pathlib.Path, force: bool):
    """Creates the CSV file and writes the header. Without `force`, an existing file is an error."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        handle = path.open("w" if force else "x", newline="")
    except FileExistsError:
        raise ScalingError(f"{path} already exists (use --force to overwrite)") from None
    except OSError as error:
        raise ScalingError(f"could not create {path}: {error}") from None
    writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    handle.flush()
    return handle, writer


def run_bench(
    executable: str,
    cpus: Optional[Sequence[int]],
    workers: int,
    criterion_home: pathlib.Path,
    log_path: pathlib.Path,
) -> None:
    """Runs the benchmark group with its output in `log_path`.

    Restricted to `cpus` when given, otherwise to `workers` workers through the env vars."""
    env = dict(os.environ, CRITERION_HOME=str(criterion_home))
    preexec_fn = None
    if cpus is not None:
        preexec_fn = lambda: os.sched_setaffinity(0, cpus)
    else:
        env.update({name: str(workers) for name in OVERRIDE_ENV_VARS})
    with log_path.open("w") as log:
        try:
            process = subprocess.Popen(
                [executable, "--bench", "priority_contention", "--noplot"],
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                preexec_fn=preexec_fn,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ScalingError(f"could not start {executable}: {error}") from None
        try:
            returncode = process.wait()
        except KeyboardInterrupt:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise
    if returncode != 0:
        raise ScalingError(f"benchmark exited with code {returncode}, see {log_path}")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--passes", type=int, default=3, help="number of passes (default: 3)")
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=pathlib.Path("priority_contention_scaling.csv"),
        help="CSV output path (default: ./priority_contention_scaling.csv)",
    )
    parser.add_argument(
        "--work-dir",
        type=pathlib.Path,
        help="directory for Criterion data and logs (default: <output>.d)",
    )
    parser.add_argument("--cpu-counts", help="comma-separated CPU counts instead of 1,2,4,...,N")
    parser.add_argument("--bench-binary", help="use this bench executable instead of building")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, build/run nothing")
    parser.add_argument(
        "--force", action="store_true", help="overwrite an existing output, reuse an existing work dir"
    )
    args = parser.parse_args(argv)
    if args.passes < 1:
        parser.error("--passes must be at least 1")
    return args


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    check_environment(os.environ)

    pin = can_pin_cpus()
    if pin:
        order, topology_ok = order_cpus(os.sched_getaffinity(0), pathlib.Path("/sys/devices/system/cpu"))
        if not topology_ok:
            print("warning: CPU topology unavailable, using numeric CPU order", file=sys.stderr)
        available = len(order)
    else:
        print(
            "warning: CPU affinity unavailable, limiting workers with "
            f"{' and '.join(OVERRIDE_ENV_VARS)} instead (the process may still use all CPUs)",
            file=sys.stderr,
        )
        order = None
        available = os.cpu_count() or 1
    if args.cpu_counts is not None:
        counts = parse_cpu_counts(args.cpu_counts, available)
    else:
        counts = cpu_counts(available)
    if order is not None:
        print(f"CPU order: {' '.join(map(str, order))}")
    print(f"CPU counts: {','.join(map(str, counts))}")
    if args.dry_run:
        for count in counts:
            plan = " ".join(map(str, order[:count])) if order is not None else f"workers={count}"
            print(f"  {count}: {plan}")
        return 0

    work_dir = args.work_dir or args.output.with_name(args.output.name + ".d")
    if args.output.exists() and not args.force:
        raise ScalingError(f"{args.output} already exists (use --force to overwrite)")
    if args.output.is_dir():
        raise ScalingError(f"{args.output} is a directory")
    if work_dir.resolve() == args.output.resolve():
        raise ScalingError("--work-dir must differ from --output")
    if work_dir.exists() and not (args.force and work_dir.is_dir()):
        raise ScalingError(f"{work_dir} already exists (use --force to reuse a directory)")
    executable = args.bench_binary or build_bench()
    commit, dirty = git_info()
    handle, writer = open_csv(args.output, args.force)
    # Unique per invocation, so reusing the work dir with --force never mixes runs.
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    run_id += f"-{os.getpid()}"
    try:
        for pass_index in range(1, args.passes + 1):
            for count in counts:
                cpus = order[:count] if order is not None else None
                run_dir = work_dir / run_id / f"pass{pass_index}-cpus{count}"
                try:
                    run_dir.mkdir(parents=True)
                except OSError as error:
                    raise ScalingError(f"could not create {run_dir}: {error}") from None
                print(f"pass {pass_index}/{args.passes}, {count} CPUs ...", file=sys.stderr)
                before = read_cpu_ticks()
                run_bench(executable, cpus, count, run_dir / "criterion", run_dir / "bench.log")
                steal = steal_pct(before, read_cpu_ticks())
                timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
                for variant, values in sorted(read_estimates(run_dir / "criterion").items()):
                    writer.writerow(
                        {
                            "pass": pass_index,
                            "cpus": count,
                            "cpu_list": " ".join(map(str, cpus)) if cpus is not None else "",
                            "limit": "affinity" if cpus is not None else "workers",
                            "variant": variant,
                            **values,
                            "steal_pct": "" if steal is None else f"{steal:.3f}",
                            "git_commit": commit,
                            "git_dirty": dirty,
                            "timestamp_utc": timestamp,
                        }
                    )
                handle.flush()
    finally:
        handle.close()
    print(f"wrote {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except ScalingError as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)
