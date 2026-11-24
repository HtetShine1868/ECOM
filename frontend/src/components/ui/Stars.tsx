import { useState } from "react";

const STAR = "M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z";

function Star({ fill, size }: { fill: number; size: number }) {
  // fill: 0..1, drawn as a grey star with a clipped amber star on top
  const id = `s${Math.round(fill * 100)}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path d={STAR} className="fill-stone-300 dark:fill-stone-600" />
      <path d={STAR} className="fill-amber-400" clipPath={`url(#${id})`} />
    </svg>
  );
}

/** Read-only star row. `value` is 0-5 and may be fractional. */
export function Stars({ value, size = 14, label }: { value: number; size?: number; label?: string }) {
  const v = Math.max(0, Math.min(5, value || 0));
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${v.toFixed(1)} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.max(0, Math.min(1, v - i))} size={size} />
      ))}
    </span>
  );
}

/** Interactive 1-5 selector (keyboard and touch friendly). */
export function StarInput({ value, onChange, size = 30 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const labels = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  return (
    <div>
      <div className="inline-flex gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            className="rounded p-0.5 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <Star fill={n <= shown ? 1 : 0} size={size} />
          </button>
        ))}
      </div>
      <p className="mt-1 h-4 text-xs text-stone-500">{labels[shown] ?? ""}</p>
    </div>
  );
}
