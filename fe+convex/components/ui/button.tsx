import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] border text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/20 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[#0A0A0A] bg-[#0A0A0A] text-[#FFFFFF] hover:bg-[#1F1F1F]",
        outline: "border-[#E0E0E0] bg-[#FFFFFF] text-[#111111] hover:bg-[#F4F4F4]",
        secondary: "border-[#E0E0E0] bg-[#F4F4F4] text-[#111111] hover:bg-[#EBEBEB]",
        ghost: "border-transparent bg-transparent text-[#555555] hover:bg-[#F4F4F4] hover:text-[#111111]",
        destructive: "border-[#111111] bg-[#111111] text-[#FFFFFF] hover:bg-[#222222]",
        link: "h-auto border-transparent px-0 py-0 text-[#111111] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        xs: "h-8 px-3 text-[12px]",
        sm: "h-10 px-3.5",
        lg: "h-11 px-5",
        icon: "size-11",
        "icon-xs": "size-8",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
