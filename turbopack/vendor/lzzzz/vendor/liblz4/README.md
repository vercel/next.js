LZ4 - Library Files
================================

The `/lib` directory contains many files, but depending on project's objectives,
not all of them are required.
Limited systems may want to reduce the nb of source files to include
as a way to reduce binary size and dependencies.

Capabilities are added at the "level" granularity, detailed below.

#### Level 1 : Minimal LZ4 build

The minimum required is **`lz4.c`** and **`lz4.h`**,
which provides the fast compression and decompression algorithms.
They generate and decode data using the [LZ4 block format].


#### Level 2 : High Compression variant

For more compression ratio at the cost of compression speed,
the High Compression variant called **lz4hc** is available.
Add files **`lz4hc.c`** and **`lz4hc.h`**.
This variant also compresses data using the [LZ4 block format],
and depends on regular `lib/lz4.*` source files.


#### Level 3 : Frame support, for interoperability

In order to produce compressed data compatible with `lz4` command line utility,
it's necessary to use the [official interoperable frame format].
This format is generated and decoded automatically by the **lz4frame** library.
Its public API is described in `lib/lz4frame.h`.
In order to work properly, lz4frame needs all other modules present in `/lib`,
including, lz4 and lz4hc, and also **xxhash**.
So it's necessary to also include `xxhash.c` and `xxhash.h`.


#### Level 4 : File compression operations

As a helper around file operations,
the library has been recently extended with `lz4file.c` and `lz4file.h`
(still considered experimental at the time of this writing).
These helpers allow opening, reading, writing, and closing files
using transparent LZ4 compression / decompression.
As a consequence, using `lz4file` adds a dependency on `<stdio.h>`.

`lz4file` relies on `lz4frame` in order to produce compressed data
conformant to the [LZ4 Frame format] specification.
Consequently, to enable this capability,
it's necessary to include all `*.c` and `*.h` files from `lib/` directory.


#### Advanced / Experimental API

Definitions which are not guaranteed to remain stable in future versions,
are protected behind macros, such as `LZ4_STATIC_LINKING_ONLY`.
As the name suggests, these definitions should only be invoked
in the context of static linking ***only***.
Otherwise, dependent application may fail on API or ABI break in the future.
The associated symbols are also not exposed by the dynamic library by default.
Should they be nonetheless needed, it's possible to force their publication
by using build macros `LZ4_PUBLISH_STATIC_FUNCTIONS`
and `LZ4F_PUBLISH_STATIC_FUNCTIONS`.


#### Build macros

The following build macro can be selected to adjust source code behavior at compilation time :

- `LZ4_FAST_DEC_LOOP` : this triggers a speed optimized decompression loop, more powerful on modern cpus.
  This loop works great on `x86`, `x64` and `aarch64` cpus, and is automatically enabled for them.
  It's also possible to enable or disable it manually, by passing `LZ4_FAST_DEC_LOOP=1` or `0` to the preprocessor.
  For example, with `gcc` : `-DLZ4_FAST_DEC_LOOP=1`,
  and with `make` : `CPPFLAGS+=-DLZ4_FAST_DEC_LOOP=1 make lz4`.

- `LZ4_DISTANCE_MAX` : control the maximum offset that the compressor will allow.
  Set to 65535 by default, which is the maximum value supported by lz4 format.
  Reducing maximum distance will reduce opportunities for LZ4 to find matches,
  hence will produce a worse compression ratio.
  Setting a smaller max distance could allow compatibility with specific decoders with limited memory budget.
  This build macro only influences the compressed output of the compressor.

- `LZ4_DISABLE_DEPRECATE_WARNINGS` : invoking a deprecated function will make the compiler generate a warning.
  This is meant to invite users to update their source code.
  Should this be a problem, it's generally possible to make the compiler ignore these warnings,
  for example with `-Wno-deprecated-declarations` on `gcc`,
  or `_CRT_SECURE_NO_WARNINGS` for Visual Studio.
  This build macro offers another project-specific method
  by defining `LZ4_DISABLE_DEPRECATE_WARNINGS` before including the LZ4 header files.

- `LZ4_FORCE_SW_BITCOUNT` : by default, the compression algorithm tries to determine lengths
  by using bitcount instructions, generally implemented as fast single instructions in many cpus.
  In case the target cpus doesn't support it, or compiler intrinsic doesn't work, or feature bad performance,
  it's possible to use an optimized software path instead.
  This is achieved by setting this build macros.
  In most cases, it's not expected to be necessary,
  but it can be legitimately considered for less common platforms.

- `LZ4_ALIGN_TEST` : alignment test ensures that the memory area
  passed as argument to become a compression state is suitably aligned.
  This test can be disabled if it proves flaky, by setting this value to 0.

- `LZ4_USER_MEMORY_FUNCTIONS` : replace calls to `<stdlib.h>`'s `malloc()`, `calloc()` and `free()`
  by user-defined functions, which must be named `LZ4_malloc()`, `LZ4_calloc()` and `LZ4_free()`.
  User functions must be available at link time.

- `LZ4_STATIC_LINKING_ONLY_DISABLE_MEMORY_ALLOCATION` :
  Remove support of dynamic memory allocation.
  For more details, see description of this macro in `lib/lz4.c`.

- `LZ4_STATIC_LINKING_ONLY_ENDIANNESS_INDEPENDENT_OUTPUT` : experimental feature aimed at producing the same
  compressed output on platforms of different endianness (i.e. little-endian and big-endian).
  Output on little-endian platforms shall remain unchanged, while big-endian platforms will start producing
  the same output as little-endian ones. This isn't expected to impact backward- and forward-compatibility
  in any way.

- `LZ4_FREESTANDING` : by setting this build macro to 1,
  LZ4/HC removes dependencies on the C standard library,
  including allocation functions and `memmove()`, `memcpy()`, and `memset()`.
  This build macro is designed to help use LZ4/HC in restricted environments
  (embedded, bootloader, etc).
  For more details, see description of this macro in `lib/lz4.h`.

- `LZ4_HEAPMODE` : Select how stateless compression functions like `LZ4_compress_default()`
  allocate memory for their hash table,
  in memory stack (0:default, fastest), or in memory heap (1:requires malloc()).

- `LZ4HC_HEAPMODE` :  Select how stateless HC compression functions like `LZ4_compress_HC()`
  allocate memory for their workspace:
  in stack (0), or in heap (1:default).
  Since workspace is rather large, stack can be inconvenient, hence heap mode is recommended.

- `LZ4F_HEAPMODE` : selects how `LZ4F_compressFrame()` allocates the compression state,
  either on stack (default, value 0) or using heap memory (value 1).


#### Makefile variables

The following `Makefile` variables can be selected to alter the profile of produced binaries :
- `BUILD_SHARED` : generate `liblz4` dynamic library (enabled by default)
- `BUILD_STATIC` : generate `liblz4` static library (enabled by default)


#### Amalgamation

lz4 source code can be amalgamated into a single file.
One can combine all source code into `lz4_all.c` by using following command:
```
cat lz4.c lz4hc.c lz4frame.c > lz4_all.c
```
(`cat` file order is important) then compile `lz4_all.c`.
All `*.h` files present in `/lib` remain necessary to compile `lz4_all.c`.


#### Windows : using MinGW+MSYS to create DLL

DLL can be created using MinGW+MSYS with the `make liblz4` command.
This command creates `dll\liblz4.dll` and the import library `dll\liblz4.lib`.
To override the `dlltool` command when cross-compiling on Linux, just set the `DLLTOOL` variable. Example of cross compilation on Linux with mingw-w64 64 bits:
```
make BUILD_STATIC=no CC=x86_64-w64-mingw32-gcc DLLTOOL=x86_64-w64-mingw32-dlltool OS=Windows_NT
```
The import library is only required with Visual C++.
The header files `lz4.h`, `lz4hc.h`, `lz4frame.h` and the dynamic library
`dll\liblz4.dll` are required to compile a project using gcc/MinGW.
The dynamic library has to be added to linking options.
It means that if a project that uses LZ4 consists of a single `test-dll.c`
file it should be linked with `dll\liblz4.dll`. For example:
```
    $(CC) $(CFLAGS) -Iinclude/ test-dll.c -o test-dll dll\liblz4.dll
```
The compiled executable will require LZ4 DLL which is available at `dll\liblz4.dll`.


#### Miscellaneous

Other files present in the directory are not source code. They are :

 - `LICENSE` : contains the BSD license text
 - `Makefile` : `make` script to compile and install lz4 library (static and dynamic)
 - `liblz4.pc.in` : for `pkg-config` (used in `make install`)
 - `README.md` : this file

[official interoperable frame format]: ../doc/lz4_Frame_format.md
[LZ4 Frame format]: ../doc/lz4_Frame_format.md
[LZ4 block format]: ../doc/lz4_Block_format.md


#### License

All source material within __lib__ directory are BSD 2-Clause licensed.
See [LICENSE](LICENSE) for details.
The license is also reminded at the top of each source file.
