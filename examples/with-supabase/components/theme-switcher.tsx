"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();
  const [position, setPosition] = React.useState("bottom");

  const ICON_SIZE = 16;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={"icon"}>
          {theme === "light" ? (
            <Sun size={ICON_SIZE} className={"text-muted-foreground"} />
          ) : theme === "dark" ? (
            <Moon size={ICON_SIZE} className={"text-muted-foreground"} />
          ) : (
            <Laptop size={ICON_SIZE} className={"text-muted-foreground"} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-content" align="start">
        <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
          <DropdownMenuRadioItem
            className="flex gap-2"
            value="top"
            onClick={() => setTheme("light")}
          >
            <Sun size={ICON_SIZE} className="text-muted-foreground" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            className="flex gap-2"
            value="bottom"
            onClick={() => setTheme("dark")}
          >
            <Moon size={ICON_SIZE} className="text-muted-foreground" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            className="flex gap-2"
            value="right"
            onClick={() => setTheme("system")}
          >
            <Laptop size={ICON_SIZE} className="text-muted-foreground" /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
