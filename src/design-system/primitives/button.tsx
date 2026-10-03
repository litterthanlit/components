import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-key font-medium transition-[background-color,color,box-shadow,transform,opacity,filter] duration-(--duration-exit) ease-out hover:duration-(--duration-enter) disabled:pointer-events-none disabled:opacity-50";

/*
 * Primary and secondary are keys (see --key-* in tokens.css): they sit on a
 * 2px base and sink onto it while pressed, with lettering cut into the face.
 * Ghost stays flat; it is the quiet option.
 */
const press = "hover:brightness-[1.06] active:translate-y-[2px] active:duration-75";

const variants: Record<Variant, string> = {
  primary: `[background:var(--key-primary-face)] text-(--key-primary-ink) [text-shadow:var(--key-primary-engrave)] shadow-(--key-primary-shadow) active:shadow-(--key-primary-shadow-pressed) ${press}`,
  secondary: `[background:var(--key-face)] text-(--key-ink) [text-shadow:var(--key-engrave)] shadow-(--key-shadow) active:shadow-(--key-shadow-pressed) ${press}`,
  ghost: "text-muted hover:bg-panel hover:text-ink active:scale-[0.97]",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-meta",
  md: "h-9 px-3.5 text-body",
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
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
      {...props}
    />
  );
}
