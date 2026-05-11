import type { ButtonHTMLAttributes } from "react";

export default function OrcaButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary";
  }
) {
  const { variant = "primary", className, ...rest } = props;
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "secondary"
      ? "bg-white/10 border border-white/15 hover:bg-white/15 text-white"
      : "bg-orange-500 hover:bg-orange-400 text-black";

  return <button className={`${base} ${styles} ${className ?? ""}`} {...rest} />;
}

