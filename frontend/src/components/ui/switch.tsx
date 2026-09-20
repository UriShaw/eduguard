"use client"

import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

/** Công tắc kiểu macOS: rãnh viên thuốc, núm trắng trượt có quán tính. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group peer inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[2px] outline-none transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        "bg-muted shadow-[inset_0_1px_2px_oklch(0.2_0.02_264/18%)] data-[state=checked]:bg-primary dark:bg-white/15 dark:data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-[0_0_0_0.5px_oklch(0_0_0/10%),0_2px_4px_oklch(0_0_0/25%)] transition-[translate,width] duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1.12)] data-[state=checked]:translate-x-4 group-active:w-[22px] group-active:data-[state=checked]:translate-x-3"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
