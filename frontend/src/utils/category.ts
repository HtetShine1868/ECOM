export function categoryKind(name?: string | null) {
  const value = (name || "").toLowerCase();
  if (/kid|child|toy|baby|play/.test(value)) return "kids";
  if (/kitchen|cook|home|house|pan/.test(value)) return "kitchen";
  if (/food|grocery|snack|eat/.test(value)) return "food";
  if (/beauty|care|soap|skin/.test(value)) return "care";
  if (/cloth|wear|shirt|dress/.test(value)) return "wear";
  if (/sport|fit/.test(value)) return "sport";
  return "daily";
}

export function categoryLabel(kind: string) {
  switch (kind) {
    case "kids":
      return "For kids";
    case "kitchen":
      return "Kitchen";
    case "food":
      return "Food";
    case "care":
      return "Care";
    case "wear":
      return "Wear";
    case "sport":
      return "Sports";
    default:
      return "Daily";
  }
}

export function categoryChipClass(name?: string | null) {
  switch (categoryKind(name)) {
    case "kids":
      return "bg-apricot-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100";
    case "kitchen":
      return "bg-primary-100 text-primary-800 dark:bg-primary-400/20 dark:text-primary-100";
    case "food":
      return "bg-accent-100 text-accent-700 dark:bg-accent-400/20 dark:text-emerald-100";
    default:
      return "bg-stone-100 text-stone-700 dark:bg-surface-800 dark:text-stone-200";
  }
}
