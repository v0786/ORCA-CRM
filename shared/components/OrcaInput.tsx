import type { InputHTMLAttributes } from "react";

export default function OrcaInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
  }
) {
  const { label, className, ...rest } = props;
  return (
    <label className="block">
      {label ? (
        <div className="mb-1 text-xs text-white/70">{label}</div>
      ) : null}
      <input
        className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 ${className ?? ""}`}
        {...rest}
      />
    </label>
  );
}

