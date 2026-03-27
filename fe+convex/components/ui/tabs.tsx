"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex flex-col gap-3", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "inline-flex w-fit items-center rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] p-1 text-[#555555]",
  {
    variants: {
      variant: {
        default: "h-11",
        line: "h-auto gap-2 border-transparent bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full min-w-[120px] flex-1 items-center justify-center rounded-[6px] px-3 text-[13px] font-medium text-[#555555] transition-colors focus-visible:ring-2 focus-visible:ring-[#111111]/20 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-active:bg-[#0A0A0A] data-active:text-[#FFFFFF]",
        "group-data-[variant=line]/tabs-list:h-10 group-data-[variant=line]/tabs-list:min-w-0 group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-[8px] group-data-[variant=line]/tabs-list:border group-data-[variant=line]/tabs-list:border-[#E0E0E0] group-data-[variant=line]/tabs-list:bg-[#FFFFFF] group-data-[variant=line]/tabs-list:data-active:border-[#0A0A0A]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
