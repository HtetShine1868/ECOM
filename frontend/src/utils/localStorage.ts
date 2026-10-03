// ─── localStorage helpers for categories and delivery zones ─────────────────

export interface Category {
  id: string;
  name: string;
}

export interface DeliveryZone {
  id: string;
  town: string;
  fee: number;
}

// ── Default seed data ────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-1", name: "Electronics" },
  { id: "cat-2", name: "Kitchen" },
  { id: "cat-3", name: "Kids" },
  { id: "cat-4", name: "Clothing" },
  { id: "cat-5", name: "Food" },
  { id: "cat-6", name: "Beauty" },
  { id: "cat-7", name: "Sports" },
];

const DEFAULT_ZONES: DeliveryZone[] = [
  { id: "zone-1", town: "Hlaing", fee: 2000 },
  { id: "zone-2", town: "Dagon", fee: 1500 },
  { id: "zone-3", town: "Kamaryut", fee: 2500 },
  { id: "zone-4", town: "Sanchaung", fee: 2000 },
  { id: "zone-5", town: "Bahan", fee: 3000 },
  { id: "zone-6", town: "Thaketa", fee: 3500 },
  { id: "zone-7", town: "Insein", fee: 4000 },
];

// ── Keys ─────────────────────────────────────────────────────────────────────

const CATEGORIES_KEY = "shopnow_categories";
const ZONES_KEY = "shopnow_delivery_zones";

// ── Category helpers ─────────────────────────────────────────────────────────

export function getCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Category[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  // Seed defaults on first run
  saveCategories(DEFAULT_CATEGORIES);
  return DEFAULT_CATEGORIES;
}

export function saveCategories(cats: Category[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

// ── Delivery Zone helpers ─────────────────────────────────────────────────────

export function getDeliveryZones(): DeliveryZone[] {
  try {
    const raw = localStorage.getItem(ZONES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeliveryZone[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore parse errors
  }
  // Seed defaults on first run
  saveDeliveryZones(DEFAULT_ZONES);
  return DEFAULT_ZONES;
}

export function saveDeliveryZones(zones: DeliveryZone[]): void {
  localStorage.setItem(ZONES_KEY, JSON.stringify(zones));
}

// ── ID generator ─────────────────────────────────────────────────────────────

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
