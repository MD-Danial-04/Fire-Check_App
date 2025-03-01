"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/app/providers/theme-provider"
import { Button } from "./button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const handleToggle = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className="rounded-full"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Sun className="h-5 w-5 text-neutral-700" />
      ) : (
        <Moon className="h-5 w-5 text-neutral-300" />
      )}
    </Button>
  )
} 