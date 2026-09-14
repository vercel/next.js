# ##########################################################################
# LZ4 programs - Makefile
# Copyright (C) Yann Collet 2016-2020
#
# GPL v2 License
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License along
# with this program; if not, write to the Free Software Foundation, Inc.,
# 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#
# You can contact the author at :
#  - LZ4 homepage : http://www.lz4.org
#  - LZ4 source repository : https://github.com/lz4/lz4
# ##########################################################################

VOID    := /dev/null
LZ4DIR  := ../include
LIBDIR  := ../static
DLLDIR  := ../dll

CFLAGS  ?= -O3   # can select custom flags. For example : CFLAGS="-O2 -g" make
CFLAGS  += -Wall -Wextra -Wundef -Wcast-qual -Wcast-align -Wshadow -Wswitch-enum \
           -Wdeclaration-after-statement -Wstrict-prototypes \
           -Wpointer-arith -Wstrict-aliasing=1
CFLAGS  += $(MOREFLAGS)
CPPFLAGS:= -I$(LZ4DIR) -DXXH_NAMESPACE=LZ4_
FLAGS   := $(CFLAGS) $(CPPFLAGS) $(LDFLAGS)


# Define *.exe as extension for Windows systems
ifneq (,$(filter Windows%,$(OS)))
EXT =.exe
else
EXT =
endif

.PHONY: default fullbench-dll fullbench-lib


default: all

all: fullbench-dll fullbench-lib


fullbench-lib: fullbench.c xxhash.c
	$(CC) $(FLAGS) $^ -o $@$(EXT) $(LIBDIR)/liblz4_static.lib

fullbench-dll: fullbench.c xxhash.c
	$(CC) $(FLAGS) $^ -o $@$(EXT) -DLZ4_DLL_IMPORT=1 $(DLLDIR)/liblz4.dll

clean:
	@$(RM) fullbench-dll$(EXT) fullbench-lib$(EXT) \
	@echo Cleaning completed
