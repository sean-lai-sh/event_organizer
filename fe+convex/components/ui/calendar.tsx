"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  ...props
}: CalendarProps) {
  const defaultClassNames = {
    months: "relative flex flex-col gap-4 sm:flex-row",
    month: "w-full",
    month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center",
    caption_label: "text-[13px] font-medium text-[#111111]",
    nav: "absolute top-0 flex w-full justify-between",
    button_previous: cn(
      buttonVariants({ variant: "ghost", size: "icon-xs" }),
      "h-8 w-8 border-none p-0 text-[#7B7B7B] hover:bg-[#F4F4F4] hover:text-[#111111]"
    ),
    button_next: cn(
      buttonVariants({ variant: "ghost", size: "icon-xs" }),
      "h-8 w-8 border-none p-0 text-[#7B7B7B] hover:bg-[#F4F4F4] hover:text-[#111111]"
    ),
    weekdays: "mt-1 flex",
    weekday: "w-9 p-0 text-center text-[11px] font-medium text-[#999999]",
    week: "mt-1 flex w-max",
    day: "group h-9 w-9 p-0 text-[12px]",
    day_button:
      "flex h-9 w-9 items-center justify-center rounded-[8px] p-0 text-[#111111] outline-none transition hover:bg-[#F4F4F4] group-data-[selected]:bg-[#0A0A0A] group-data-[selected]:text-[#FFFFFF] group-data-[outside]:text-[#BBBBBB] group-data-[disabled]:text-[#BBBBBB]",
    today:
      "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:h-[3px] after:w-[3px] after:-translate-x-1/2 after:rounded-full after:bg-[#0A0A0A] [&[data-selected]>button]:after:bg-[#FFFFFF]",
    outside: "text-[#BBBBBB]",
    hidden: "invisible",
  };

  const mergedClassNames: typeof defaultClassNames = Object.keys(defaultClassNames).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key as keyof typeof classNames]
        ? cn(
            defaultClassNames[key as keyof typeof defaultClassNames],
            classNames[key as keyof typeof classNames]
          )
        : defaultClassNames[key as keyof typeof defaultClassNames],
    }),
    {} as typeof defaultClassNames
  );

  const defaultComponents = {
    Chevron: (props: {
      className?: string;
      size?: number;
      disabled?: boolean;
      orientation?: "up" | "down" | "left" | "right";
    }) => {
      if (props.orientation === "left") {
        return <ChevronLeft aria-hidden="true" size={16} strokeWidth={2} />;
      }
      return <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />;
    },
  };

  const mergedComponents = {
    ...defaultComponents,
    ...userComponents,
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={mergedClassNames}
      components={mergedComponents}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
