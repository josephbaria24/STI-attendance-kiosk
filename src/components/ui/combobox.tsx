"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { HugeIcon } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

type ComboboxProps = {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
};

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  className,
  triggerClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-left text-sm text-slate-800 outline-none transition",
            "hover:border-slate-300 focus:border-[var(--accent-sky)] focus:ring-2 focus:ring-[var(--accent-sky)]/20",
            !selected && "text-slate-400",
            triggerClassName
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.label : placeholder}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            className="shrink-0 text-slate-400"
            aria-hidden
          >
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m6 9 6 6 6-6"
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", className)}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.description || ""}`}
                    onSelect={() => {
                      onValueChange(option.value === value ? "" : option.value);
                      setOpen(false);
                    }}
                  >
                    <HugeIcon
                      name="check"
                      size={14}
                      className={cn(
                        "shrink-0 text-teal-600",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="block truncate text-[11px] text-slate-500">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
