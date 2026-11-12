"""Drive the public runner through a real POSIX terminal, retaining every byte."""
import json
import hashlib
import os
import pty
import re
import select
import signal
import subprocess
import sys
import time

options = json.loads(sys.argv[1])
environment = {**os.environ, "NODE_ENV": "development",
               "NEXT_TELEMETRY_DISABLED": "1", "FORCE_COLOR": "0",
               "TERM": "xterm-256color"}
if options.get("ordinaryTerminal"):
    # Vitest 5.0.4/std-env 4.3.0 disables default watch in agent environments.
    # Exercise an ordinary terminal independently of the process driving it.
    for name in ("AI_AGENT", "CLAUDECODE", "CLAUDE_CODE", "REPL_ID", "GEMINI_CLI",
                 "CODEX_SANDBOX", "CODEX_THREAD_ID", "OPENCODE", "AUGMENT_AGENT",
                 "GOOSE_PROVIDER", "JUNIE_DATA", "JUNIE_SHIM_PATH", "COPILOT_AGENT",
                 "COPILOT_CLI", "CURSOR_AGENT"):
        environment.pop(name, None)
    environment["PATH"] = os.pathsep.join(
        part for part in environment.get("PATH", "").split(os.pathsep)
        if not re.search(r"\.pi[\\/]agent", part))
    if "devin" in environment.get("EDITOR", ""):
        environment.pop("EDITOR", None)
environment.update(options.get("environment", {}))
master, slave = pty.openpty()
child = subprocess.Popen(options["args"], cwd=options["cwd"], stdin=slave,
                         stdout=slave, stderr=slave, start_new_session=True,
                         env=environment)
os.close(slave)
output = ""
stages = []
ansi = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]")


def read_until(pattern, timeout=12):
    global output
    start = len(output)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        current = ansi.sub("", output[start:])
        if re.search(pattern, current, re.I):
            stages.append(current)
            return True
        if child.poll() is not None:
            break
        readable, _, _ = select.select([master], [], [], min(0.1, deadline-time.monotonic()))
        if readable:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            output += data.decode("utf-8", errors="replace")
    stages.append(ansi.sub("", output[start:]))
    return False


completed = False
coverage_stages = []
transform_stages = []
driver_error = None
unpublished_initial = None


def coverage_snapshot(label):
    root = os.path.realpath(options["cwd"])
    with open(os.path.join(root, "result.json"), encoding="utf-8") as file:
        report = json.load(file)
    with open(os.path.join(root, "coverage", "coverage-final.json"), encoding="utf-8") as file:
        coverage = json.load(file)
    with open(os.path.join(root, "coverage", "lcov.info"), encoding="utf-8") as file:
        lcov = file.read()
    sources = {}
    # Only the two known fixture sources, never paths supplied by a report.
    selected_sources = options.get("coverageSources", ["subject.mjs", "unimported.mjs"])
    if selected_sources not in (["subject.mjs", "unimported.mjs"], ["subject.ts", "unimported.ts"]):
        raise ValueError("Unexpected coverage fixture source inventory")
    for source in selected_sources:
        with open(os.path.join(root, source), "rb") as file:
            data = file.read()
        sources[source] = {"sha256": hashlib.sha256(data).hexdigest(),
                           "source": data.decode("utf-8")}
    coverage_stages.append({"label": label, "report": report, "coverage": coverage,
                            "lcov": lcov, "sources": sources})


def transform_snapshot(label, failed):
    root = os.path.realpath(options["cwd"])
    with open(os.path.join(root, "result.json"), encoding="utf-8") as file:
        report = json.load(file)
    if report["numTotalTests"] != 1 or report["numFailedTests"] != failed or report["numPassedTests"] != 1 - failed:
        raise ValueError("Unexpected compiler transform watch outcome: " + json.dumps(report))
    if report["numPendingTests"] != 0 or report["numTodoTests"] != 0:
        raise ValueError("Compiler transform watch skipped a case")
    fingerprint = [(item.get("startTime"), item.get("endTime")) for item in report["testResults"]]
    if transform_stages and fingerprint == transform_stages[-1]["fingerprint"]:
        raise ValueError("Compiler transform watch reused a stale report")
    sources = {}
    for source in ("contract.case.mjs", "subject.mjs", "transform-helper.mjs", "vitest.config.mjs"):
        with open(os.path.join(root, source), "rb") as file:
            data = file.read()
        sources[source] = {"sha256": hashlib.sha256(data).hexdigest(), "source": data.decode("utf-8")}
    if transform_stages:
        for source in ("contract.case.mjs", "subject.mjs"):
            if sources[source] != transform_stages[0]["sources"][source]:
                raise ValueError("Compiler transform authored fixture changed")
    transform_stages.append({"label": label, "report": report, "sources": sources, "fingerprint": fingerprint})


try:
    waiting = read_until(r"(?:waiting|watching) for file changes", options.get("waitTimeout", 12))
    if waiting:
        if options["action"] == "default":
            completed = True
        elif options["action"] == "help":
            os.write(master, b"h")
            completed = read_until(r"(?:filter|pattern)")
        elif options["action"] == "filter":
            os.write(master, b"t")
            prompted = read_until(r"(?:test name|testname|pattern)")
            if prompted:
                os.write(master, b"second\r")
                completed = read_until(r"(?:waiting|watching) for file changes")
        elif options["action"] == "transform-config-watch":
            try:
                transform_snapshot("initial", 0)
                completed = True
                for step in options["steps"]:
                    if "file" in step or "changes" in step:
                        for change in step.get("changes", [step]):
                            if change["file"] not in ("transform-helper.mjs", "vitest.config.mjs"):
                                raise ValueError("Unexpected compiler config input")
                            root = os.path.realpath(options["cwd"])
                            with open(os.path.join(root, change["file"]), "w", encoding="utf-8") as file:
                                file.write(change["source"])
                    elif step.get("key") == "r":
                        os.write(master, b"r")
                    else:
                        raise ValueError("Unexpected compiler config watch action")
                    if not read_until(r"(?:waiting|watching) for file changes", options.get("waitTimeout", 12)):
                        completed = False
                        break
                    transform_snapshot(step["label"], step["failed"])
                    if step["failed"] and not re.search(r"(?:FAIL|failed)", stages[-1], re.I):
                        raise ValueError("Failed compiler config watch stage lacked its terminal status")
            except Exception as error:
                driver_error = str(error)
                completed = False
        elif options["action"] == "coverage-watch":
            try:
                if options.get("initialUnpublished"):
                    root = os.path.realpath(options["cwd"])
                    with open(os.path.join(root, "result.json"), encoding="utf-8") as file:
                        initial_report = json.load(file)
                    absent = all(not os.path.exists(os.path.join(root, "coverage", name))
                                 for name in ("coverage-final.json", "lcov.info"))
                    if not absent:
                        raise ValueError("failed initial generation published coverage")
                    unpublished_initial = {"report": initial_report, "coverageFilesAbsent": absent}
                else:
                    coverage_snapshot("initial")
                completed = True
                for step in options.get("steps", []):
                    if "file" in step or "changes" in step:
                        root = os.path.realpath(options["cwd"])
                        for change in step.get("changes", [step]):
                            target = os.path.abspath(os.path.join(root, change["file"]))
                            if os.path.commonpath((root, target)) != root:
                                raise ValueError("coverage probe write escapes fixture")
                            with open(target, "w", encoding="utf-8") as file:
                                file.write(change["source"])
                    else:
                        os.write(master, step["key"].encode("utf-8"))
                    if not read_until(r"(?:waiting|watching) for file changes", options.get("waitTimeout", 12)):
                        completed = False
                        break
                    coverage_snapshot(step["label"])
            except Exception as error:
                driver_error = str(error)
                completed = False
        os.write(master, b"q")
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        driver_error = driver_error or "runner did not exit within 5 seconds after terminal completion"
        completed = False
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            driver_error += "; SIGTERM cleanup also timed out"
finally:
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=5)
    os.close(master)
result = {"completed": completed, "code": child.returncode,
                  "stages": stages, "raw": output, "coverageStages": coverage_stages, "transformStages": transform_stages, "error": driver_error}
if unpublished_initial is not None:
    result["unpublishedInitial"] = unpublished_initial
print(json.dumps(result))
