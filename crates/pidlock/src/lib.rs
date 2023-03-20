use std::{
    convert::TryInto,
    fs,
    io::{Read, Write},
    path::PathBuf,
    process,
};

use log::warn;

/// Errors that may occur during the `Pidlock` lifetime.
#[derive(Debug, PartialEq)]
pub enum PidlockError {
    #[doc = "A lock already exists"]
    LockExists,
    #[doc = "An operation was attempted in the wrong state, e.g. releasing before acquiring."]
    InvalidState,
}

/// A result from a Pidlock operation
type PidlockResult = Result<(), PidlockError>;

/// States a Pidlock can be in during its lifetime.
#[derive(Debug, PartialEq)]
enum PidlockState {
    #[doc = "A new pidlock, unacquired"]
    New,
    #[doc = "A lock is acquired"]
    Acquired,
    #[doc = "A lock is released"]
    Released,
}

/// Check whether a process exists, used to determine whether a pid file is
/// stale.
///
/// # Safety
///
/// This function uses unsafe methods to determine process existence. The
/// function itself is private, and the input is validated prior to call.
fn process_exists(pid: i32) -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        // If GetExitCodeProcess returns STILL_ACTIVE, then the process
        // doesn't have an exit code (...or exited with code 259)
        use windows_sys::Win32::{
            Foundation::{CloseHandle, STILL_ACTIVE},
            System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_INFORMATION},
        };
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid as u32);
        let mut code = 0;
        GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        code == STILL_ACTIVE as u32
    }

    #[cfg(not(target_os = "windows"))]
    unsafe {
        // From the POSIX standard: If sig is 0 (the null signal), error checking
        // is performed but no signal is actually sent. The null signal can be
        // used to check the validity of pid.
        let result = libc::kill(pid, 0);
        result == 0
    }
}

/// A pid-centered lock. A lock is considered "acquired" when a file exists on
/// disk at the path specified, containing the process id of the locking
/// process.
pub struct Pidlock {
    /// The current process id
    pid: u32,
    /// A path to the lock file
    path: PathBuf,
    /// Current state of the Pidlock
    state: PidlockState,
}

impl Pidlock {
    /// Create a new Pidlock at the provided path.
    pub fn new(path: PathBuf) -> Self {
        Pidlock {
            pid: process::id(),
            path,
            state: PidlockState::New,
        }
    }

    /// Check whether a lock file already exists, and if it does, whether the
    /// specified pid is still a valid process id on the system.
    fn check_stale(&self) {
        self.get_owner();
    }

    /// Acquire a lock.
    pub fn acquire(&mut self) -> PidlockResult {
        match self.state {
            PidlockState::New => {}
            _ => {
                return Err(PidlockError::InvalidState);
            }
        }
        self.check_stale();

        let mut file = match fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(self.path.clone())
        {
            Ok(file) => file,
            Err(_) => {
                return Err(PidlockError::LockExists);
            }
        };
        file.write_all(&format!("{}", self.pid).into_bytes()[..])
            .unwrap();

        self.state = PidlockState::Acquired;
        Ok(())
    }

    /// Returns true when the lock is in an acquired state.
    pub fn locked(&self) -> bool {
        self.state == PidlockState::Acquired
    }

    /// Release the lock.
    pub fn release(&mut self) -> PidlockResult {
        match self.state {
            PidlockState::Acquired => {}
            _ => {
                return Err(PidlockError::InvalidState);
            }
        }

        fs::remove_file(self.path.clone()).unwrap();

        self.state = PidlockState::Released;
        Ok(())
    }

    /// Gets the owner of this lockfile, returning the pid. If the lock file
    /// doesn't exist, or the specified pid is not a valid process id on the
    /// system, it clears it.
    pub fn get_owner(&self) -> Option<u32> {
        let mut file = match fs::OpenOptions::new().read(true).open(self.path.clone()) {
            Ok(file) => file,
            Err(_) => {
                return None;
            }
        };

        let mut contents = String::new();
        if file.read_to_string(&mut contents).is_err() {
            warn!("corrupted/invalid pid file at {:?}", self.path);
            return None;
        }

        match contents.trim().parse::<i32>() {
            Ok(pid) if process_exists(pid) => {
                Some(pid.try_into().expect("if a pid exists it is a valid u32"))
            }
            Ok(_) => {
                warn!("stale pid file at {:?}", self.path);
                None
            }
            Err(_) => {
                warn!("nonnumeric pid file at {:?}", self.path);
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write, path::PathBuf};

    use rand::{distributions::Alphanumeric, thread_rng, Rng};

    use super::{Pidlock, PidlockError, PidlockState};

    // This was removed from the library itself, but retained here
    // to assert backwards compatibility with std::process::id
    fn getpid() -> u32 {
        unsafe { libc::getpid() as u32 }
    }

    fn make_pid_path() -> (tempdir::TempDir, PathBuf) {
        let tmp = tempdir::TempDir::new("pidlock").unwrap();
        let path = tmp.path().join("pidfile");
        (tmp, path)
    }

    #[test]
    fn test_new() {
        let (_tmp, pid_path) = make_pid_path();
        let pidfile = Pidlock::new(pid_path.clone());

        assert_eq!(pidfile.pid, getpid());
        assert_eq!(pidfile.path, pid_path);
        assert_eq!(pidfile.state, PidlockState::New);
    }

    #[test]
    fn test_acquire_and_release() {
        let (_tmp, pid_path) = make_pid_path();
        let mut pidfile = Pidlock::new(pid_path);
        pidfile.acquire().unwrap();

        assert_eq!(pidfile.state, PidlockState::Acquired);

        pidfile.release().unwrap();

        assert_eq!(pidfile.state, PidlockState::Released);
    }

    #[test]
    fn test_acquire_lock_exists() {
        let (_tmp, pid_path) = make_pid_path();
        let mut orig_pidfile = Pidlock::new(pid_path);
        orig_pidfile.acquire().unwrap();

        let mut pidfile = Pidlock::new(orig_pidfile.path.clone());
        match pidfile.acquire() {
            Err(err) => {
                orig_pidfile.release().unwrap();
                assert_eq!(err, PidlockError::LockExists);
            }
            _ => {
                orig_pidfile.release().unwrap();
                panic!("Test failed");
            }
        }
    }

    #[test]
    fn test_acquire_already_acquired() {
        let (_tmp, pid_path) = make_pid_path();
        let mut pidfile = Pidlock::new(pid_path);
        pidfile.acquire().unwrap();
        match pidfile.acquire() {
            Err(err) => {
                pidfile.release().unwrap();
                assert_eq!(err, PidlockError::InvalidState);
            }
            _ => {
                pidfile.release().unwrap();
                panic!("Test failed");
            }
        }
    }

    #[test]
    fn test_release_bad_state() {
        let (_tmp, pid_path) = make_pid_path();
        let mut pidfile = Pidlock::new(pid_path);
        match pidfile.release() {
            Err(err) => {
                assert_eq!(err, PidlockError::InvalidState);
            }
            _ => {
                panic!("Test failed");
            }
        }
    }

    #[test]
    fn test_locked() {
        let (_tmp, pid_path) = make_pid_path();
        let mut pidfile = Pidlock::new(pid_path);
        pidfile.acquire().unwrap();
        assert!(pidfile.locked());
    }

    #[test]
    fn test_locked_not_locked() {
        let (_tmp, pid_path) = make_pid_path();
        let pidfile = Pidlock::new(pid_path);
        assert!(!pidfile.locked());
    }

    #[test]
    fn test_stale_pid() {
        let (_tmp, path) = make_pid_path();
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path.clone())
            .expect("Could not open file for writing");

        file.write_all(&format!("{}", thread_rng().gen::<i32>()).into_bytes()[..])
            .unwrap();

        drop(file);

        let mut pidfile = Pidlock::new(path);
        assert_eq!(pidfile.acquire(), Err(PidlockError::LockExists));
    }

    #[test]
    fn test_stale_pid_invalid_contents() {
        let (_tmp, path) = make_pid_path();
        let contents: String = thread_rng()
            .sample_iter(&Alphanumeric)
            .take(20)
            .map(char::from)
            .collect();
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path.clone())
            .expect("Could not open file for writing");

        file.write_all(&contents.into_bytes()).unwrap();

        drop(file);

        let mut pidfile = Pidlock::new(path);

        assert_eq!(pidfile.acquire(), Err(PidlockError::LockExists));
    }

    #[test]
    fn test_stale_pid_corrupted_contents() {
        let (_tmp, path) = make_pid_path();
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path.clone())
            .expect("Could not open file for writing");

        file.write_all(&rand::thread_rng().gen::<[u8; 32]>())
            .unwrap();

        drop(file);

        let mut pidfile = Pidlock::new(path);
        assert_eq!(pidfile.acquire(), Err(PidlockError::LockExists));
    }
}
