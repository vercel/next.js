"""Drive the real Next -> background harness boundary inside the disposable sandbox.

No prompt substitution or headless harness wrapper. If onboarding, authentication,
permissions or terminal behavior prevents progress, preserve it as a setup gap.
"""
import glob
import fcntl
import json
import os
import pty
import re
import select
import signal
import subprocess
import struct
import sys
import time
import termios
import pyte

root = '/tmp/next-upgrade-tools'
input_data = json.load(open(sys.argv[1]))
harness = input_data['harness']
env = dict(os.environ)
for name in ('CODEX_THREAD_ID', 'CODEX_CI', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'AGENT', 'AGENT_NAME'):
    env.pop(name, None)
env['TERM'] = 'xterm-256color'
# Only the eval transport translates native model IDs to Gateway routing IDs.
env['NEXT_UPGRADE_EVAL_CLI_MODEL'] = str((input_data.get('extra') or {}).get('cliModel') or input_data['model'])
# The sandbox is already provisioned with this run's single harness and model.
if harness == 'codex':
    profile = os.path.expanduser('~/.codex/default.config.toml')
    if os.path.exists(profile):
        with open(os.path.expanduser('~/.codex/config.toml'), 'w') as target:
            # Match the native agent-eval runner's execution authority, only in
            # this disposable Vercel VM. Next itself never sets these policies.
            target.write('approval_policy = "never"\nsandbox_mode = "danger-full-access"\n')
            target.write(open(profile).read())
            target.write('\n[projects.' + json.dumps(input_data['cwd']) + ']\ntrust_level = "trusted"\n')
    key = env.get('AI_GATEWAY_API_KEY') or env.get('OPENAI_API_KEY')
    if key:
        login = subprocess.run(['codex', 'login', '--with-api-key'], input=key, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, timeout=30)
        if login.returncode:
            raise RuntimeError('SETUP_BLOCKED: Codex sandbox authentication failed')
else:
    env['ANTHROPIC_MODEL'] = input_data['model']
    # Provision the already-onboarded, trusted harness that this entrypoint
    # assumes. These settings live only in the disposable VM's home directory.
    state_path = os.path.expanduser('~/.claude.json')
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}
    state.update({'hasCompletedOnboarding': True, 'theme': 'dark'})
    state.setdefault('projects', {}).setdefault(input_data['cwd'], {})['hasTrustDialogAccepted'] = True
    with open(state_path, 'w') as file:
        json.dump(state, file)
    os.makedirs(os.path.expanduser('~/.claude'), exist_ok=True)
    with open(os.path.expanduser('~/.claude/settings.json'), 'w') as file:
        json.dump({
            'permissions': {'defaultMode': 'bypassPermissions'},
            'skipDangerousModePermissionPrompt': True,
        }, file)

pid, master = pty.fork()
if pid == 0:
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    os.chdir(input_data['cwd'])
    os.execvpe('next', ['next', 'upgrade', '--experimental-agent', '--experimental-agent-dry-run'], env)

os.set_blocking(master, False)
class TerminalScreen(pyte.Screen):
    def write_process_input(self, data):
        os.write(master, data.encode())

# Emulate the terminal (including cursor/device reports), not user input.
# A PTY alone cannot answer the startup queries emitted by a native TUI.
screen = TerminalScreen(120, 40)
stream = pyte.ByteStream(screen)
output = bytearray()
terminal_log = open(root + '/terminal-output.log', 'wb', buffering=0)
started = time.monotonic()
started_wall = time.time()
completed_at = None
launcher_status = None
session = None
events_path = None
worker_pid = None
failure = None
last_logs = 0
pty_open = True

def receipt():
    plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output.decode(errors='replace'))
    match = re.search(r'(?:Codex|Claude Code) (?:running in background|exited)\s*·\s*([a-zA-Z0-9_-]+)', plain)
    logs = re.search(r'^\s*Logs\s+(/[^\r\n]+)', plain, re.MULTILINE)
    stop = re.search(r'kill -TERM -- -(\d+)', plain)
    return (match.group(1) if match else None, logs.group(1).strip() if logs else None, int(stop.group(1)) if stop else None)

def codex_finished():
    if not events_path or not os.path.isfile(events_path):
        return False
    events = []
    for line in open(events_path):
        try:
            events.append(json.loads(line))
        except ValueError:
            pass
    for event in events:
        if event.get('type') in ('turn.failed', 'error'):
            raise RuntimeError('Background Codex failed: ' + json.dumps(event))
    return any(event.get('type') == 'turn.completed' for event in events)

def claude_finished():
    # Use the native session transcript's terminal assistant turn, not the
    # launcher's exit status. Tool-use turns are not completion.
    paths = glob.glob(os.path.expanduser('~/.claude/projects/**/*.jsonl'), recursive=True)
    latest = None
    latest_time = 0
    for path in paths:
        modified = os.path.getmtime(path)
        if modified < started_wall or modified < latest_time:
            continue
        for line in open(path):
            try:
                event = json.loads(line)
                if event.get('type') == 'assistant':
                    latest = event.get('message', {})
                    latest_time = modified
            except ValueError:
                pass
    return latest is not None and latest.get('stop_reason') in ('end_turn', 'stop_sequence')

try:
    # Reserve budget for setup and withheld runtime assertions.
    while time.monotonic() - started < 900:
        if pty_open:
            readable, _, _ = select.select([master], [], [], 0.25)
            if readable:
                try:
                    block = os.read(master, 65536)
                    if not block:
                        pty_open = False
                    else:
                        output.extend(block)
                        terminal_log.write(block)
                        stream.feed(block)
                        with open(root + '/terminal-screen.txt', 'w') as snapshot:
                            snapshot.write('\n'.join(screen.display))
                except OSError:
                    pty_open = False
        else:
            time.sleep(0.25)
        if launcher_status is None:
            ended, status = os.waitpid(pid, os.WNOHANG)
            if ended:
                launcher_status = os.waitstatus_to_exitcode(status)
        session, events_path, worker_pid = receipt()
        if launcher_status is not None and launcher_status != 0:
            failure = 'SETUP_BLOCKED: Next background launcher exited ' + str(launcher_status)
            break
        if launcher_status == 0 and not pty_open and not session:
            failure = 'SETUP_BLOCKED: Next returned without a background session receipt'
            break
        if session and harness == 'claude' and time.monotonic() - last_logs > 5:
            logs = subprocess.run(['claude', 'logs', session], env=env, capture_output=True, text=True, timeout=20)
            with open(root + '/background-output.log', 'w') as target:
                target.write(logs.stdout + logs.stderr)
            last_logs = time.monotonic()
        # A successful report alone is insufficient: wait for the native turn
        # to finish and let withheld assertions inspect the resulting commits.
        try:
            packets = [json.loads(line) for line in open(root + '/packets.jsonl') if line.strip()]
            reports = [os.path.join(os.path.dirname(packet['contextPath']), 'RESULT.md') for packet in packets]
            report = '\n'.join(open(path).read() for path in reports if os.path.exists(path))
            finished = codex_finished() if harness == 'codex' else claude_finished()
            if finished and session and launcher_status == 0:
                head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=input_data['cwd'], text=True).strip()
                baseline = json.load(open(root + '/baseline.json'))['head']
                if 'verified-local' in report.lower() and head != baseline:
                    completed_at = time.monotonic()
                else:
                    failure = 'Background agent finished without verified local commits'
                break
        except (OSError, ValueError, KeyError):
            pass
    if completed_at is None and failure is None:
        failure = 'Background upgrade timed out before verified local completion'
except (RuntimeError, subprocess.TimeoutExpired) as error:
    failure = str(error)
finally:
    terminal_log.close()
    with open(root + '/background-session.json', 'w') as target:
        json.dump({'harness': harness, 'session': session, 'launcherExitCode': launcher_status, 'eventsPath': events_path, 'completed': completed_at is not None, 'error': failure}, target)
    if harness == 'codex' and worker_pid:
        try:
            os.killpg(worker_pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    elif harness == 'claude' and session:
        try:
            subprocess.run(['claude', 'stop', session], env=env, capture_output=True, timeout=20)
        except subprocess.TimeoutExpired:
            pass
    if launcher_status is None:
        try:
            os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    os.close(master)

transcripts = glob.glob(os.path.expanduser('~/.codex/sessions/**/*.jsonl'), recursive=True) if harness == 'codex' else glob.glob(os.path.expanduser('~/.claude/projects/**/*.jsonl'), recursive=True)
if events_path and os.path.exists(events_path):
    with open(root + '/background-output.log', 'w') as target:
        target.write(open(events_path).read())
transcript = '\n'.join(open(file).read() for file in transcripts if os.path.getmtime(file) >= time.time() - (time.monotonic() - started) - 2)
observed_model = None
for line in transcript.splitlines():
    try:
        event = json.loads(line)
        if harness == 'codex' and event.get('type') == 'turn_context':
            observed_model = event.get('payload', {}).get('model') or observed_model
        if harness == 'claude' and event.get('type') == 'assistant':
            observed_model = event.get('message', {}).get('model') or observed_model
    except (ValueError, AttributeError):
        pass
result = {
    'ok': completed_at is not None,
    # Raw screen redraws can dwarf the transcript and exhaust the classifier's
    # context. Keep the rendered screen here and the native transcript separately.
    'output': '\n'.join(screen.display) + ('\n' + open(root + '/background-output.log').read()[-32768:] if os.path.exists(root + '/background-output.log') else ''),
    'transcript': transcript or None,
    'observedModel': observed_model,
    'error': failure,
}
with open(root + '/terminal-result.json', 'w') as file:
    json.dump(result, file)
