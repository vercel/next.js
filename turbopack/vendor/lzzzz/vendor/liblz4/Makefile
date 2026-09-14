# ################################################################
# LZ4 library - Makefile
# Copyright (C) Yann Collet 2011-2023
# All rights reserved.
#
# This Makefile is validated for Linux, macOS, *BSD, Hurd, Solaris, MSYS2 targets
#
# BSD license
# Redistribution and use in source and binary forms, with or without modification,
# are permitted provided that the following conditions are met:
#
# * Redistributions of source code must retain the above copyright notice, this
#   list of conditions and the following disclaimer.
#
# * Redistributions in binary form must reproduce the above copyright notice, this
#   list of conditions and the following disclaimer in the documentation and/or
#   other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
# ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#
# You can contact the author at :
#  - LZ4 source repository : https://github.com/lz4/lz4
#  - LZ4 forum froup : https://groups.google.com/forum/#!forum/lz4c
# ################################################################
SED ?= sed

# Version numbers
LIBVER_MAJOR_SCRIPT:=`$(SED) -n '/define[[:blank:]][[:blank:]]*LZ4_VERSION_MAJOR/s/.*[[:blank:]]\([0-9][0-9]*\).*/\1/p' < ./lz4.h`
LIBVER_MINOR_SCRIPT:=`$(SED) -n '/define[[:blank:]][[:blank:]]*LZ4_VERSION_MINOR/s/.*[[:blank:]]\([0-9][0-9]*\).*/\1/p' < ./lz4.h`
LIBVER_PATCH_SCRIPT:=`$(SED) -n '/define[[:blank:]][[:blank:]]*LZ4_VERSION_RELEASE/s/.*[[:blank:]]\([0-9][0-9]*\).*/\1/p' < ./lz4.h`
LIBVER_SCRIPT:= $(LIBVER_MAJOR_SCRIPT).$(LIBVER_MINOR_SCRIPT).$(LIBVER_PATCH_SCRIPT)
LIBVER_MAJOR := $(shell echo $(LIBVER_MAJOR_SCRIPT))
LIBVER_MINOR := $(shell echo $(LIBVER_MINOR_SCRIPT))
LIBVER_PATCH := $(shell echo $(LIBVER_PATCH_SCRIPT))
LIBVER  := $(shell echo $(LIBVER_SCRIPT))

BUILD_SHARED:=yes
BUILD_STATIC:=yes

CPPFLAGS+= -DXXH_NAMESPACE=LZ4_
USERCFLAGS:= -O3 $(CFLAGS)
DEBUGFLAGS:= -Wall -Wextra -Wcast-qual -Wcast-align -Wshadow \
             -Wswitch-enum -Wdeclaration-after-statement -Wstrict-prototypes \
             -Wundef -Wpointer-arith -Wstrict-aliasing=1
CFLAGS   = $(DEBUGFLAGS) $(USERCFLAGS)
ALLFLAGS = $(CFLAGS) $(CPPFLAGS) $(LDFLAGS)

SRCFILES := $(sort $(wildcard *.c))

include ../Makefile.inc

# OS X linker doesn't support -soname, and use different extension
# see : https://developer.apple.com/library/mac/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/DynamicLibraryDesignGuidelines.html
ifeq ($(TARGET_OS), Darwin)
	SHARED_EXT = dylib
	SHARED_EXT_MAJOR = $(LIBVER_MAJOR).$(SHARED_EXT)
	SHARED_EXT_VER = $(LIBVER).$(SHARED_EXT)
	SONAME_FLAGS = -install_name $(libdir)/liblz4.$(SHARED_EXT_MAJOR) -compatibility_version $(LIBVER_MAJOR) -current_version $(LIBVER) -dynamiclib
else
	ifeq ($(WINBASED),yes)
		SHARED_EXT = dll
		SHARED_EXT_VER = $(SHARED_EXT)
	else  # posix non-mac
		SONAME_FLAGS = -Wl,-soname=liblz4.$(SHARED_EXT).$(LIBVER_MAJOR)
		SHARED_EXT = so
		SHARED_EXT_MAJOR = $(SHARED_EXT).$(LIBVER_MAJOR)
		SHARED_EXT_VER = $(SHARED_EXT).$(LIBVER)
	endif
endif

.PHONY: default
default: lib-release

# silent mode by default; verbose can be triggered by V=1 or VERBOSE=1
$(V)$(VERBOSE).SILENT:

.PHONY:lib-release
lib-release: DEBUGFLAGS :=
lib-release: lib liblz4.pc

.PHONY: lib
lib: liblz4.a liblz4

.PHONY: all
all: lib liblz4.pc

.PHONY: all32
all32: CFLAGS+=-m32
all32: all

CLEAN += liblz4.a
liblz4.a: $(SRCFILES)
ifeq ($(BUILD_STATIC),yes)  # can be disabled on command line
	@echo compiling static library
	$(COMPILE.c) $^
	$(AR) rcs $@ *.o
endif

ifeq ($(WINBASED),yes)

CLEAN += $(liblz4-dll.rc)
liblz4-dll.rc: liblz4-dll.rc.in
	@echo creating library resource
	$(SED) -e 's|@LIBLZ4@|$(LIBLZ4_NAME)|' \
         -e 's|@LIBVER_MAJOR@|$(LIBVER_MAJOR)|g' \
         -e 's|@LIBVER_MINOR@|$(LIBVER_MINOR)|g' \
         -e 's|@LIBVER_PATCH@|$(LIBVER_PATCH)|g' \
          $< >$@

liblz4-dll.o: liblz4-dll.rc
	$(WINDRES) -i liblz4-dll.rc -o liblz4-dll.o

CLEAN += $(LIBLZ4_EXP)
$(LIBLZ4): $(SRCFILES) liblz4-dll.o
  ifeq ($(BUILD_SHARED),yes)
	@echo compiling dynamic library $(LIBVER)
	$(CC) $(ALLFLAGS) -DLZ4_DLL_EXPORT=1 -shared $^ -o $@ -Wl,--out-implib,$(LIBLZ4_EXP)
  endif

else   # not windows

$(LIBLZ4): $(SRCFILES)
  ifeq ($(BUILD_SHARED),yes)
	@echo compiling dynamic library $(LIBVER)
	$(CC) $(ALLFLAGS) -shared $^ -fPIC -fvisibility=hidden $(SONAME_FLAGS) -o $@
	@echo creating versioned links
	$(LN_SF) $@ liblz4.$(SHARED_EXT_MAJOR)
	$(LN_SF) $@ liblz4.$(SHARED_EXT)
  endif

endif
CLEAN += $(LIBLZ4)

.PHONY: liblz4
liblz4: $(LIBLZ4)

CLEAN += liblz4.pc
liblz4.pc: liblz4.pc.in Makefile
	@echo creating pkgconfig
	$(SED) -e 's|@PREFIX@|$(prefix)|' \
           -e 's|@LIBDIR@|$(libdir)|' \
           -e 's|@INCLUDEDIR@|$(includedir)|' \
           -e 's|@VERSION@|$(LIBVER)|' \
           -e 's|=${prefix}/|=$${prefix}/|' \
           $< >$@

.PHONY: clean
clean:
ifeq ($(WINBASED),yes)
	$(RM) *.rc
endif
	$(RM) $(CLEAN) core *.o *.a
	$(RM) *.$(SHARED_EXT) *.$(SHARED_EXT_MAJOR) *.$(SHARED_EXT_VER)
	@echo Cleaning library completed

#-----------------------------------------------------------------------------
# make install is validated only for Linux, OSX, BSD, Hurd and Solaris targets
#-----------------------------------------------------------------------------
ifeq ($(POSIX_ENV),Yes)

.PHONY: listL120
listL120:  # extract lines >= 120 characters in *.{c,h}, by Takayuki Matsuoka (note : $$, for Makefile compatibility)
	find . -type f -name '*.c' -o -name '*.h' | while read -r filename; do awk 'length > 120 {print FILENAME "(" FNR "): " $$0}' $$filename; done

DESTDIR     ?=
# directory variables : GNU conventions prefer lowercase
# see https://www.gnu.org/prep/standards/html_node/Makefile-Conventions.html
# support both lower and uppercase (BSD), use lower in script
PREFIX      ?= /usr/local
prefix      ?= $(PREFIX)
EXEC_PREFIX ?= $(prefix)
exec_prefix ?= $(EXEC_PREFIX)
BINDIR      ?= $(exec_prefix)/bin
bindir      ?= $(BINDIR)
LIBDIR      ?= $(exec_prefix)/lib
libdir      ?= $(LIBDIR)
INCLUDEDIR  ?= $(prefix)/include
includedir  ?= $(INCLUDEDIR)

  ifneq (,$(filter $(TARGET_OS),OpenBSD FreeBSD NetBSD DragonFly MidnightBSD))
PKGCONFIGDIR ?= $(prefix)/libdata/pkgconfig
  else
PKGCONFIGDIR ?= $(libdir)/pkgconfig
  endif
pkgconfigdir ?= $(PKGCONFIGDIR)

.PHONY: install
install: lib liblz4.pc
	$(MAKE_DIR) $(DESTDIR)$(pkgconfigdir)/ $(DESTDIR)$(includedir)/ $(DESTDIR)$(libdir)/ $(DESTDIR)$(bindir)/
	$(INSTALL_DATA) liblz4.pc $(DESTDIR)$(pkgconfigdir)/
	@echo Installing libraries in $(DESTDIR)$(libdir)
  ifeq ($(BUILD_STATIC),yes)
	$(INSTALL_DATA) liblz4.a $(DESTDIR)$(libdir)/liblz4.a
	$(INSTALL_DATA) lz4frame_static.h $(DESTDIR)$(includedir)/lz4frame_static.h
	$(INSTALL_DATA) lz4file.h $(DESTDIR)$(includedir)/lz4file.h
  endif
  ifeq ($(BUILD_SHARED),yes)
# Traditionally, one installs the DLLs in the bin directory as programs
# search them first in their directory. This allows to not pollute system
# directories (like c:/windows/system32), nor modify the PATH variable.
    ifeq ($(WINBASED),yes)
	$(INSTALL_PROGRAM) $(LIBLZ4) $(DESTDIR)$(bindir)
	$(INSTALL_PROGRAM) $(LIBLZ4_EXP) $(DESTDIR)$(libdir)
    else
	$(INSTALL_PROGRAM) liblz4.$(SHARED_EXT_VER) $(DESTDIR)$(libdir)
	$(LN_SF) liblz4.$(SHARED_EXT_VER) $(DESTDIR)$(libdir)/liblz4.$(SHARED_EXT_MAJOR)
	$(LN_SF) liblz4.$(SHARED_EXT_VER) $(DESTDIR)$(libdir)/liblz4.$(SHARED_EXT)
    endif
  endif
	@echo Installing headers in $(DESTDIR)$(includedir)
	$(INSTALL_DATA) lz4.h $(DESTDIR)$(includedir)/lz4.h
	$(INSTALL_DATA) lz4hc.h $(DESTDIR)$(includedir)/lz4hc.h
	$(INSTALL_DATA) lz4frame.h $(DESTDIR)$(includedir)/lz4frame.h
	@echo lz4 libraries installed

.PHONY: uninstall
uninstall:
	$(RM) $(DESTDIR)$(pkgconfigdir)/liblz4.pc
  ifeq (WINBASED,yes)
	$(RM) $(DESTDIR)$(bindir)/$(LIBLZ4)
	$(RM) $(DESTDIR)$(libdir)/$(LIBLZ4_EXP)
  else
	$(RM) $(DESTDIR)$(libdir)/liblz4.$(SHARED_EXT)
	$(RM) $(DESTDIR)$(libdir)/liblz4.$(SHARED_EXT_MAJOR)
	$(RM) $(DESTDIR)$(libdir)/liblz4.$(SHARED_EXT_VER)
  endif
	$(RM) $(DESTDIR)$(libdir)/liblz4.a
	$(RM) $(DESTDIR)$(includedir)/lz4.h
	$(RM) $(DESTDIR)$(includedir)/lz4hc.h
	$(RM) $(DESTDIR)$(includedir)/lz4frame.h
	$(RM) $(DESTDIR)$(includedir)/lz4frame_static.h
	$(RM) $(DESTDIR)$(includedir)/lz4file.h
	@echo lz4 libraries successfully uninstalled

endif
