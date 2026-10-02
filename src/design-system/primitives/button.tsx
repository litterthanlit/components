import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-(--duration-exit) ease-out hover:duration-(--duration-enter) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-canvas hover:opacity-85",
  secondary: "bg-surface text-ink shadow-sm hover:shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(0_0_0/0.04)]",
  ghost: "text-muted hover:bg-panel hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-7 rounded-sm px-2.5 text-meta",
  md: "h-9 rounded-md px-3.5 text-body",
};

export function buttonClass({ variant = "secondary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}

type IconButtonProps = ComponentPropsWithoutRef<"button"> & { label: string; size?: Size };

/** Square, icon-only button. `label` becomes the accessible name. */
export function IconButton({ label, size = "md", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        base,
        variants.ghost,
        size === "sm" ? "size-7 rounded-sm" : "size-9 rounded-md",
        className,
      )}
      {...props}
    />
  );
}
