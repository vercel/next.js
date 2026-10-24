"""Tests for priority_contention_scaling.py. Run: python3 -m unittest priority_contention_scaling_test"""

import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

import priority_contention_scaling as scaling


def write_topology(root: pathlib.Path, cpu: int, package: int, core: int) -> None:
    topology = root / f"cpu{cpu}" / "topology"
    topology.mkdir(parents=True)
    (topology / "physical_package_id").write_text(f"{package}\n")
    (topology / "core_id").write_text(f"{core}\n")


def write_estimates(root: pathlib.Path, variant: str, median: float, content=None) -> None:
    path = root / scaling.GROUP / variant / "new" / "estimates.json"
    path.parent.mkdir(parents=True)
    if content is None:
        interval = {"lower_bound": median - 1, "upper_bound": median + 1, "confidence_level": 0.95}
        content = json.dumps(
            {
                "median": {"point_estimate": median, "confidence_interval": interval},
                "mean": {"point_estimate": median + 0.5, "confidence_interval": interval},
            }
        )
    path.write_text(content)


VARIANTS = ["warm/32x2048", "initial/32x2048", "warm/128x512", "initial/128x512"]


class CpuCountsTest(unittest.TestCase):
    def test_default_counts(self):
        self.assertEqual(scaling.cpu_counts(1), [1])
        self.assertEqual(scaling.cpu_counts(6), [1, 2, 4, 6])
        self.assertEqual(scaling.cpu_counts(32), [1, 2, 4, 8, 16, 32])

    def test_explicit_counts(self):
        self.assertEqual(scaling.parse_cpu_counts("4, 1,4,2", 8), [1, 2, 4])
        for bad in ["0", "9", "x", "1,,2", ""]:
            with self.assertRaises(scaling.ScalingError):
                scaling.parse_cpu_counts(bad, 8)


class OrderCpusTest(unittest.TestCase):
    def test_cores_first_then_siblings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            # package 0: cores 0,1 with siblings (0,4) (1,5); package 1: core 0 with (2,6), core 1 with (3,7)
            for cpu, package, core in [(0, 0, 0), (4, 0, 0), (1, 0, 1), (5, 0, 1), (2, 1, 0), (6, 1, 0), (3, 1, 1), (7, 1, 1)]:
                write_topology(root, cpu, package, core)
            order, ok = scaling.order_cpus(range(8), root)
            self.assertTrue(ok)
            self.assertEqual(order, [0, 1, 2, 3, 4, 5, 6, 7])

    def test_sparse_mask_and_interleaved_siblings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for cpu in range(8):
                write_topology(root, cpu, 0, cpu // 2)  # siblings (0,1) (2,3) ...
            order, ok = scaling.order_cpus({1, 2, 3, 6}, root)
            self.assertTrue(ok)
            self.assertEqual(order, [1, 2, 6, 3])

    def test_fallback_to_numeric_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            write_topology(root, 0, 0, 0)
            order, ok = scaling.order_cpus({3, 0, 1}, root)
            self.assertFalse(ok)
            self.assertEqual(order, [0, 1, 3])


class CargoJsonTest(unittest.TestCase):
    def test_finds_bench_executable(self):
        lines = [
            "Compiling something",
            json.dumps({"reason": "compiler-artifact", "package_id": "path+file:///x/turbo-tasks#0.1.0",
                        "target": {"name": "turbo_tasks", "kind": ["lib"]}, "executable": None}),
            json.dumps({"reason": "compiler-artifact", "package_id": "path+file:///x/turbo-tasks-backend#0.1.0",
                        "target": {"name": "mod", "kind": ["bench"]}, "executable": "/t/mod-abc"}),
            json.dumps({"reason": "build-finished", "success": True}),
        ]
        self.assertEqual(scaling.find_bench_executable(lines), "/t/mod-abc")

    def test_missing_executable(self):
        with self.assertRaises(scaling.ScalingError):
            scaling.find_bench_executable([json.dumps({"reason": "build-finished"})])

    def test_rendered_diagnostics(self):
        lines = [
            "not json",
            json.dumps({"reason": "compiler-message", "message": {"rendered": "error[E0425]: x\n"}}),
            json.dumps({"reason": "compiler-message", "message": {"rendered": None}}),
            json.dumps({"reason": "build-finished", "success": False}),
        ]
        self.assertEqual(scaling.rendered_diagnostics(lines), ["error[E0425]: x\n"])


class EstimatesTest(unittest.TestCase):
    def test_reads_all_variants(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for i, variant in enumerate(VARIANTS):
                write_estimates(root, variant, 1000.0 * (i + 1))
            estimates = scaling.read_estimates(root)
            self.assertEqual(sorted(estimates), sorted(VARIANTS))
            warm = estimates["warm/32x2048"]
            self.assertEqual(warm["median_ns"], 1000.0)
            self.assertEqual(warm["median_ci_lower_ns"], 999.0)
            self.assertEqual(warm["mean_ns"], 1000.5)
            self.assertEqual(warm["ci_confidence_level"], 0.95)

    def test_missing_variant(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for variant in VARIANTS[:3]:
                write_estimates(root, variant, 1.0)
            with self.assertRaises(scaling.ScalingError):
                scaling.read_estimates(root)

    def test_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for variant in VARIANTS[:3]:
                write_estimates(root, variant, 1.0)
            write_estimates(root, VARIANTS[3], 1.0, content="{not json")
            with self.assertRaises(scaling.ScalingError):
                scaling.read_estimates(root)

    def test_implausible_values(self):
        good = {
            "median_ns": 10.0,
            "median_ci_lower_ns": 9.0,
            "median_ci_upper_ns": 11.0,
            "mean_ns": 10.5,
            "ci_confidence_level": 0.95,
        }
        self.assertIsNone(scaling.validate_estimate(good))
        for key, value in [
            ("median_ns", float("nan")),
            ("mean_ns", float("inf")),
            ("median_ci_lower_ns", 0.0),
            ("median_ci_upper_ns", 9.5),
            ("ci_confidence_level", 1.0),
        ]:
            self.assertIsNotNone(scaling.validate_estimate(dict(good, **{key: value})), key)
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            for variant in VARIANTS[:3]:
                write_estimates(root, variant, 1000.0)
            write_estimates(root, VARIANTS[3], -5.0)
            with self.assertRaises(scaling.ScalingError):
                scaling.read_estimates(root)


class StealAndEnvTest(unittest.TestCase):
    def test_steal(self):
        with tempfile.TemporaryDirectory() as tmp:
            stat = pathlib.Path(tmp) / "stat"
            stat.write_text("cpu  10 0 10 70 0 0 0 10 0 0\ncpu0 1 0 1 7 0 0 0 1 0 0\n")
            before = scaling.read_cpu_ticks(stat)
            self.assertEqual(before, (100, 10))
            stat.write_text("cpu  20 0 20 140 0 0 0 20 0 0\n")
            self.assertAlmostEqual(scaling.steal_pct(before, scaling.read_cpu_ticks(stat)), 10.0)
        self.assertIsNone(scaling.read_cpu_ticks(pathlib.Path("/nonexistent/stat")))
        self.assertIsNone(scaling.steal_pct(None, (1, 1)))
        self.assertIsNone(scaling.steal_pct((100, 10), (200, 5)))

    def test_override_env_refused(self):
        scaling.check_environment({})
        for name in scaling.OVERRIDE_ENV_VARS:
            for value in ["4", ""]:
                with self.assertRaises(scaling.ScalingError):
                    scaling.check_environment({name: value})


class CsvTest(unittest.TestCase):
    def test_header_and_refusal(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "out.csv"
            handle, writer = scaling.open_csv(path, force=False)
            writer.writerow({column: "x" for column in scaling.CSV_COLUMNS})
            handle.close()
            lines = path.read_text().splitlines()
            self.assertEqual(lines[0], ",".join(scaling.CSV_COLUMNS))
            self.assertEqual(len(lines), 2)
            with self.assertRaises(scaling.ScalingError):
                scaling.open_csv(path, force=False)
            handle, _ = scaling.open_csv(path, force=True)
            handle.close()
            self.assertEqual(len(path.read_text().splitlines()), 1)


# A fake bench executable: writes estimates for all variants into $CRITERION_HOME, or fails
# with exit code 3 when it may use more CPUs (or workers, when the env vars set them) than
# $FAKE_MAX_CPUS.
FAKE_BENCH = f"""#!{sys.executable}
import json, os, pathlib, sys
assert sys.argv[1:] == ["--bench", "priority_contention", "--noplot"], sys.argv
workers = [os.environ.get(name) for name in {scaling.OVERRIDE_ENV_VARS!r}]
if workers[0] is not None:
    assert workers[0] == workers[1], workers
    count = int(workers[0])
else:
    count = len(os.sched_getaffinity(0))
if count > int(os.environ["FAKE_MAX_CPUS"]):
    sys.exit(3)
root = pathlib.Path(os.environ["CRITERION_HOME"]) / {scaling.GROUP!r}
for variant in {VARIANTS!r}:
    path = root / variant / "new" / "estimates.json"
    path.parent.mkdir(parents=True)
    interval = {{"lower_bound": 9.0, "upper_bound": 11.0, "confidence_level": 0.95}}
    path.write_text(json.dumps({{
        "median": {{"point_estimate": 10.0, "confidence_interval": interval}},
        "mean": {{"point_estimate": 10.0, "confidence_interval": interval}},
    }}))
"""


def available_cpus() -> int:
    return len(os.sched_getaffinity(0)) if scaling.can_pin_cpus() else os.cpu_count() or 1


class MainTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = pathlib.Path(tmp.name)
        self.bench = self.tmp / "fake-bench"
        self.bench.write_text(FAKE_BENCH)
        self.bench.chmod(0o755)
        env = mock.patch.dict(os.environ, {"FAKE_MAX_CPUS": "1"})
        env.start()
        self.addCleanup(env.stop)
        for name in scaling.OVERRIDE_ENV_VARS:
            os.environ.pop(name, None)

    def run_main(self, *args):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return scaling.main(list(args))

    def test_dry_run_builds_nothing(self):
        with mock.patch.object(scaling, "build_bench") as build, mock.patch.object(
            scaling, "run_bench"
        ) as run:
            self.assertEqual(self.run_main("--dry-run", "--output", str(self.tmp / "o.csv")), 0)
        build.assert_not_called()
        run.assert_not_called()
        self.assertFalse((self.tmp / "o.csv").exists())

    def test_rows_of_completed_runs_survive_a_failure(self):
        if available_cpus() < 2:
            self.skipTest("needs 2 CPUs")
        output = self.tmp / "o.csv"
        with self.assertRaises(scaling.ScalingError):
            self.run_main(
                "--passes", "1", "--cpu-counts", "1,2", "--output", str(output),
                "--bench-binary", str(self.bench),
            )
        lines = output.read_text().splitlines()
        self.assertEqual(len(lines), 1 + len(VARIANTS))
        self.assertTrue(all(line.startswith("1,1,") for line in lines[1:]))

    def test_full_run_and_refusals(self):
        os.environ["FAKE_MAX_CPUS"] = "1000"
        output = self.tmp / "o.csv"
        args = ["--passes", "2", "--cpu-counts", "1", "--output", str(output),
                "--bench-binary", str(self.bench)]
        self.assertEqual(self.run_main(*args), 0)
        self.assertEqual(len(output.read_text().splitlines()), 1 + 2 * len(VARIANTS))
        with self.assertRaises(scaling.ScalingError):
            self.run_main(*args)
        # --force overwrites the CSV and reuses the work dir with a new run directory
        self.assertEqual(self.run_main(*args, "--force"), 0)
        self.assertEqual(len(list((self.tmp / "o.csv.d").iterdir())), 2)
        with self.assertRaises(scaling.ScalingError):
            self.run_main("--cpu-counts", "", "--output", str(self.tmp / "empty.csv"),
                          "--bench-binary", str(self.bench))
        self.assertFalse((self.tmp / "empty.csv").exists())
        with self.assertRaises(scaling.ScalingError):
            self.run_main("--cpu-counts", "1", "--output", str(self.tmp / "same"),
                          "--work-dir", str(self.tmp / "same"), "--bench-binary", str(self.bench))

    def test_worker_limit_without_affinity(self):
        output = self.tmp / "o.csv"
        with mock.patch.object(scaling, "can_pin_cpus", return_value=False):
            with self.assertRaises(scaling.ScalingError):
                self.run_main("--passes", "1", "--cpu-counts", "1,2", "--output", str(output),
                              "--bench-binary", str(self.bench))
        rows = output.read_text().splitlines()[1:]
        self.assertEqual(len(rows), len(VARIANTS))
        self.assertTrue(all(row.startswith("1,1,,workers,") for row in rows))

    def test_missing_executable(self):
        with self.assertRaises(scaling.ScalingError):
            self.run_main("--cpu-counts", "1", "--output", str(self.tmp / "o.csv"),
                          "--bench-binary", str(self.tmp / "missing"))


if __name__ == "__main__":
    unittest.main()
