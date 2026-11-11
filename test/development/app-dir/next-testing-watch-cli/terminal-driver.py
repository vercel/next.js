"""Exercise the public CLI through a real POSIX terminal, without pty dependencies."""
import errno
import fcntl
import json
import os
import pathlib
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time


root = pathlib.Path.cwd()
config_path = root / 'next.test.config.json'
original_config = config_path.read_bytes()
snapshot_dir = root / 'terminal-fixtures/__snapshots__'
snapshot_path = snapshot_dir / 'alpha.ts.snap'
busy_path = root / '.terminal-busy'
event_path = pathlib.Path(os.environ['NEXT_TEST_EVENT_AUDIT'])
audit_path = pathlib.Path(os.environ['NEXT_TEST_NATIVE_AUDIT'])
ansi = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
output = b''
child = None
master = slave = None
owned = set()
deadline = time.monotonic() + 150


def records(path):
    if not path.exists():
        return []
    # Ignore an incomplete final append.
    return [json.loads(line) for line in path.read_text().split('\n')[:-1] if line]


def pump():
    global output
    if time.monotonic() > deadline:
        raise AssertionError('PTY scenario deadline exceeded')
    if select.select([master], [], [], 0.05)[0]:
        try:
            output += os.read(master, 65536)
        except OSError as error:
            if error.errno != errno.EIO:
                raise
    owned.update(int(pid) for pid in re.findall(rb'WATCH_FILE_PID=(\d+)', output))
    owned.update(item['pid'] for item in records(audit_path))


def text():
    return ansi.sub('', output.decode(errors='replace')).replace('\r', '')


def wait_for(predicate, description):
    end = min(deadline, time.monotonic() + 35)
    while not predicate():
        pump()
        if child.poll() is not None:
            raise AssertionError('CLI exited while waiting for ' + description)
        if time.monotonic() > end:
            raise AssertionError('Timed out waiting for ' + description)


def send(value):
    os.write(master, value.encode())


def generation(key=None, expected=None):
    offset = len(text())
    before = len([event for event in records(event_path) if event['type'] == 'run-end'])
    if key is not None:
        send(key)
    wait_for(lambda: len([e for e in records(event_path) if e['type'] == 'run-end']) > before
             and ('Waiting for file changes...' in text()[offset:]
                  or 'Watching for file changes...' in text()[offset:]), 'completed watch generation')
    events = records(event_path)
    end = [event for event in events if event['type'] == 'run-end'][-1]
    if expected is not None:
        assert end['status'] == expected, end
    return [event for event in events if event['runId'] == end['runId']]


def passed(events):
    return sorted(event['name'] for event in events
                  if event['type'] == 'case-end' and event['status'] == 'passed')


def settle_snapshot_notifications():
    # Snapshot commits can enqueue a read-only filesystem rerun. Wait for actual
    # run-end/idle output and a quiet terminal; every new byte restarts this
    # debounce, so a slower compile is never mistaken for a fixed sleep ending.
    end = min(deadline, time.monotonic() + 35)
    changed = time.monotonic()
    previous = (len(output), len(records(event_path)))
    while time.monotonic() < end:
        pump()
        events = records(event_path)
        current = (len(output), len(events))
        if current != previous:
            changed = time.monotonic()
            previous = current
        lifecycle = [e for e in events if e['type'] in ('run-start', 'run-end')]
        idle = ('Waiting for file changes...' in text().split('RERUN')[-1]
                or 'Watching for file changes...' in text().split('RERUN')[-1])
        if (lifecycle and lifecycle[-1]['type'] == 'run-end' and idle
                and time.monotonic() - changed >= 0.3):
            assert lifecycle[-1]['status'] == 'passed', lifecycle[-1]
            return
    raise AssertionError('Snapshot notifications did not settle to an idle passing run')


def filtered(key, prompt, value, expected):
    offset = len(text())
    send(key)
    wait_for(lambda: prompt in text()[offset:], prompt)
    events = generation(value + '\r', 'passed')
    assert passed(events) == expected, passed(events)


def resize(columns):
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, columns, 0, 0))
    if child is not None:
        os.kill(child.pid, signal.SIGWINCH)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def exit_with(key, code):
    send(key)
    end = time.monotonic() + 15
    while child.poll() is None and time.monotonic() < end:
        pump()
    assert child.poll() == code, ('exit', child.poll(), code)
    pump()
    assert termios.tcgetattr(slave) == original_terminal, 'CLI left terminal in raw mode'
    assert b'\x1b[?25l' in output and b'\x1b[?25h' in output, 'cursor not restored'
    assert output.rfind(b'\x1b[?25h') > output.rfind(b'\x1b[?25l')
    assert not [pid for pid in owned if alive(pid)], 'CLI left owned workers alive'


try:
    config_path.write_text(json.dumps({'projects': [{
        'name': 'terminal', 'environment': 'node',
        'include': ['terminal-fixtures/*.ts'], 'fileTimeout': 30000,
    }]}))
    if sys.argv[3] == 'interrupt':
        busy_path.write_text('busy')
    event_path.write_text('')
    master, slave = pty.openpty()
    original_terminal = termios.tcgetattr(slave)
    resize(100)
    env = os.environ.copy()
    env.pop('CI', None)
    env.pop('NO_COLOR', None)
    env['TERM'] = 'xterm-256color'
    env['FORCE_COLOR'] = '1'
    child = subprocess.Popen([sys.argv[1], sys.argv[2], 'test', str(root), '--watch'],
                             cwd=root, env=env, stdin=slave, stdout=slave,
                             stderr=slave, start_new_session=True)
    owned.add(child.pid)
    if sys.argv[3] == 'interrupt':
        wait_for(lambda: 'PTY_BUSY_STARTED' in text(), 'running case before Ctrl+C')
        exit_with('\x03', 130)
        print('PTY_INTERRUPT_VERIFIED')
    else:
        generation(expected='failed')
        assert not snapshot_path.exists(), 'watch created a snapshot without explicit u'
        offset = len(text())
        send('h')
        wait_for(lambda: 'Watch Usage' in text()[offset:], 'keyboard help')
        for key in ['a', 'r', 'f', 'u', 't', 'p', 'w', 'q']:
            assert 'press ' + key in text()[offset:]
        events = generation('f', 'failed')
        assert not any(e['type'] == 'case-start' and e['name'] == 'beta busy' for e in events)
        assert not snapshot_path.exists(), 'failed rerun wrote a snapshot'
        generation('u', 'passed')
        assert 'interactive snapshot' in snapshot_path.read_text()
        settle_snapshot_notifications()
        snapshot = snapshot_path.read_bytes()
        all_cases = ['alpha secondary', 'alpha snapshot', 'beta busy']
        assert passed(generation('a', 'passed')) == all_cases
        filtered('t', 'Test name pattern', '^alpha secondary$', ['alpha secondary'])
        assert passed(generation('r', 'passed')) == ['alpha secondary']
        assert passed(generation('a', 'passed')) == all_cases
        filtered('p', 'Filename filter', 'beta.ts', ['beta busy'])
        filtered('p', 'Filename filter', '', all_cases)
        filtered('w', 'Project name', 'terminal', all_cases)
        resize(32)
        assert passed(generation('r', 'passed')) == all_cases
        assert 'PTY_ALPHA_LOG' in text() and 'PTY_STDERR_LOG' in text()
        assert re.search(rb'\x1b\[\d+A\r\x1b\[0J', output), 'missing live erase and cursor movement'
        assert 'Test Files' in text() and 'Duration' in text(), 'missing summary text'
        assert snapshot_path.read_bytes() == snapshot, 'ordinary keys changed snapshots'
        # A busy key cancels the active run without interpreting it as an idle rerun.
        busy_path.write_text('busy')
        offset = len(text())
        send('r')
        wait_for(lambda: 'PTY_BUSY_STARTED' in text()[offset:], 'running case')
        raw_offset = len(output)
        resize(47)
        wait_for(lambda: re.search(rb'\x1b\[\d+A\r\x1b\[0J', output[raw_offset:]), 'redraw after live resize')
        generation(' ', 'cancelled')
        busy_path.unlink()
        generation('a', 'passed')
        exit_with('q', 0)
        print('PTY_WATCH_VERIFIED=' + json.dumps({'keys': 'h f u a t r p w q',
              'rawModeRestored': True, 'snapshotUpdated': True, 'ownedPids': sorted(owned)}))
except BaseException:
    sys.stderr.write(text()[-20000:] + '\n')
    raise
finally:
    # Include detached compiler/worker processes observed before a failure.
    owned.update(item['pid'] for item in records(audit_path))
    for pid in owned:
        for target in [-pid, pid]:
            try:
                os.kill(target, signal.SIGKILL)
            except ProcessLookupError:
                pass
    if child is not None:
        child.wait(timeout=5)
    if slave is not None:
        termios.tcsetattr(slave, termios.TCSANOW, original_terminal)
        os.close(slave)
    if master is not None:
        os.close(master)
    config_path.write_bytes(original_config)
    busy_path.unlink(missing_ok=True)
    snapshot_path.unlink(missing_ok=True)
    if snapshot_dir.exists():
        snapshot_dir.rmdir()
