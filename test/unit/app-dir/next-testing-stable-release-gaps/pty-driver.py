"""Drive the public runner through a real POSIX terminal, retaining every byte."""
import json
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
try:
    waiting = read_until(r"(?:waiting|watching) for file changes")
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
        os.write(master, b"q")
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGTERM)
        child.wait(timeout=5)
finally:
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=5)
    os.close(master)
print(json.dumps({"completed": completed, "code": child.returncode,
                  "stages": stages, "raw": output}))
