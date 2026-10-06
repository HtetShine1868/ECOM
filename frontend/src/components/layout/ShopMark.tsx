export default function ShopMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect width="48" height="48" rx="12" className="fill-primary-50 dark:fill-surface-800" />
      <path
        d="M12 16h24l-2.2 18.4A4 4 0 0 1 29.85 38H18.15a4 4 0 0 1-3.95-3.6L12 16Z"
        className="fill-primary-600"
      />
      <path
        d="M18 16V13.5A6 6 0 0 1 24 7.5 6 6 0 0 1 30 13.5V16"
        className="stroke-stone-700 dark:stroke-stone-200"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
