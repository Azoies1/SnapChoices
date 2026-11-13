import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-snap text-ink active:brightness-90",
  secondary: "bg-panel text-fg border border-line active:bg-line",
  ghost: "text-mute active:text-fg",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-14 w-full rounded-2xl px-4 text-lg font-semibold transition disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** One phone-sized screen: optional header, scrolling body, actions pinned at thumb height. */
export function Screen({
  header,
  footer,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {header}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      {footer ? <div className="flex flex-col gap-3 pt-4">{footer}</div> : null}
    </div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">{children}</div>;
}
