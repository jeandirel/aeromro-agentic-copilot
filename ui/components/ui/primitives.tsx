import { Tooltip as RTooltip, ToggleGroup } from "radix-ui";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-72 rounded-sm bg-ink px-2.5 py-1.5 text-xs leading-relaxed text-canvas shadow-pop"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse-soft rounded-sm bg-sunken", className)} />;
}

interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex h-10 items-stretch rounded-md border border-line bg-surface-2 p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className="ident relative inline-flex min-w-11 items-center justify-center gap-1.5 rounded-sm px-2.5 text-[0.8rem] text-ink-2 transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(15_34_54/0.08)]"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label: string; hideLabel?: boolean }>(
  function SelectField({ label, hideLabel, className, id, children, ...props }, ref) {
    const fieldId = id ?? `select-${label.replace(/\W+/g, "-").toLowerCase()}`;
    return (
      <div className={cn("flex min-w-0 flex-col gap-1", className)}>
        <label htmlFor={fieldId} className={cn("text-xs font-medium text-ink-2", hideLabel && "sr-only")}>
          {label}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            className="h-10 w-full min-w-0 appearance-none rounded-md border border-control/70 bg-surface pl-3 pr-9 text-[0.9rem] text-ink transition-colors hover:border-ink-2"
            {...props}
          >
            {children}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        </div>
      </div>
    );
  },
);

export const SearchField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(function SearchField(
  { label, className, id, ...props },
  ref,
) {
  const fieldId = id ?? "search-field";
  return (
    <div className={cn("relative min-w-0", className)}>
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={ref}
        id={fieldId}
        type="search"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full rounded-md border border-control/70 bg-surface pl-9 pr-3 text-[0.9rem] text-ink placeholder:text-ink-3 hover:border-ink-2"
        {...props}
      />
    </div>
  );
});

/** A titled region of a page. The heading level is explicit so outlines stay correct. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  as: Heading = "h2",
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "h2" | "h3";
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} id={id} className={cn("rounded-lg border border-line bg-surface", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0 max-w-[68ch]">
          <Heading id={headingId} className="text-lg font-semibold text-ink">
            {title}
          </Heading>
          {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ident rounded-xs border border-line-strong bg-surface-2 px-1 text-[0.7rem] text-ink-2">{children}</kbd>;
}
