# pidlock

This is a vendored copy of https://github.com/rockstar/pidlock with some changes that are waiting to be upstreamed.

A library for working with pidfiles, with a lock-like API.

## Usage

```
extern crate pidlock;

fn main() {
    let mut lock = pidlock::Pidlock::new("/path/to/pidfile.pid".into());
    lock.acquire().unwrap();

    ...

    lock.release().unwrap();
}
```

## License

pidlock is licensed under the MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)
