import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "../../types";
import { useCart } from "../../context/CartContext";
import { formatMMK } from "../../utils/format";
import { productImageSrc } from "../../utils/image";
import { categoryKind } from "../../utils/category";

const FALLBACK = "https://placehold.co/800x600?text=No+Image";

interface PopularShowcaseProps {
  products: Product[];
  loved: boolean;
  onSeeAll: () => void;
}

export default function PopularShowcase({ products, loved, onSeeAll }: PopularShowcaseProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const suppressClick = useRef(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const update = () => {
      setCanPrev(el.scrollLeft > 8);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [products]);

  const scrollByDir = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    const card = el.querySelector("article");
    const gap = parseFloat(window.getComputedStyle(el).columnGap) || 12;
    const cardWidth = card?.getBoundingClientRect().width || 248;
    const stride = cardWidth + gap;
    const visible = Math.max(1, Math.floor((el.clientWidth + gap) / stride));
    const amount = stride * Math.max(1, visible - 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * amount, behavior: reduce ? "auto" : "smooth" });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const el = scroller.current;
    if (!el) return;
    drag.current = { active: true, startX: event.clientX, scrollLeft: el.scrollLeft, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = scroller.current;
    if (!el) return;
    const dx = event.clientX - drag.current.startX;
    if (!drag.current.moved && Math.abs(dx) > 6) {
      drag.current.moved = true;
      el.classList.add("is-dragging");
      el.setPointerCapture(event.pointerId);
    }
    if (drag.current.moved) el.scrollLeft = drag.current.scrollLeft - dx;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || !drag.current.active) return;
    if (drag.current.moved) suppressClick.current = true;
    drag.current.active = false;
    drag.current.moved = false;
    el.classList.remove("is-dragging");
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[#2a1812] text-white shadow-shop">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary-500/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-apricot-500/20 blur-3xl" />

      <div className="relative flex flex-wrap items-end justify-between gap-3 px-5 pt-6 sm:px-7">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-apricot-500">
            {loved ? "Loved nearby" : "On the shelf"}
          </p>
          <h2 id="popular-heading" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            {loved ? "Popular right now" : "Start with these"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-stone-300">
            {loved
              ? "The ones people keep adding to their bag."
              : "A few things worth opening first."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {products.length > 1 && (
            <div className="flex items-center gap-1.5">
              <RailButton label="Previous popular products" disabled={!canPrev} onClick={() => scrollByDir(-1)}>
                <Chevron dir="left" />
              </RailButton>
              <RailButton label="Next popular products" disabled={!canNext} onClick={() => scrollByDir(1)}>
                <Chevron dir="right" />
              </RailButton>
            </div>
          )}
          <button
            type="button"
            onClick={onSeeAll}
            className="rounded-full bg-white px-3.5 py-2 text-xs font-bold text-stone-900 transition hover:bg-apricot-100 sm:px-4 sm:text-sm"
          >
            See all
          </button>
        </div>
      </div>

      <div className="relative mt-5">
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#2a1812] to-transparent transition-opacity ${
            canPrev ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#2a1812] to-transparent transition-opacity ${
            canNext ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          ref={scroller}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
          role="region"
          aria-labelledby="popular-heading"
          className="rail-scroll flex cursor-grab items-stretch gap-3 overflow-x-auto overscroll-x-contain px-5 pb-6 sm:gap-4 sm:px-7"
        >
          {products.map((product, index) => (
            <PopularCard key={product.id} product={product} rank={index + 1} featured={index === 0 && loved} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PopularCard({ product, rank, featured }: { product: Product; rank: number; featured: boolean }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const soldOut = product.stock === 0;
  const sold = product.unitsSold ?? 0;
  const lowStock = !soldOut && product.stock <= 5;

  const handleAdd = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (soldOut) return;
    addItem(product, 1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article
      className="w-[15.5rem] shrink-0 snap-start animate-fade-in motion-reduce:animate-none sm:w-60"
      style={{ animationDelay: `${Math.min(rank - 1, 6) * 40}ms`, animationFillMode: "backwards" }}
    >
      <Link
        to={`/products/${product.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white text-stone-900 shadow-[0_12px_28px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-0.5"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
          <img
            src={productImageSrc(product.imageUrl, FALLBACK)}
            alt={product.name}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
            onError={(event) => {
              const img = event.currentTarget;
              if (img.dataset.fallback === "1") return;
              img.dataset.fallback = "1";
              img.src = FALLBACK;
            }}
          />
          <span className="absolute left-2.5 top-2.5 rounded-full bg-[#2a1812] px-2.5 py-1 text-[11px] font-bold text-apricot-100">
            {featured ? "Top" : `#${rank}`}
          </span>
          {lowStock && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-amber-800">
              {product.stock} left
            </span>
          )}
          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-stone-900/45">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-800">Sold out</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3.5">
          <div className="h-5">
            {product.category && (
              <span className={`block w-fit max-w-full truncate rounded-full px-2.5 text-[11px] font-semibold leading-5 ${lightChip(product.category)}`}>
                {product.category}
              </span>
            )}
          </div>
          <h3 className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
            {product.name}
          </h3>
          <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-stone-500">
            {product.description || " "}
          </p>
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold text-primary-700">
                {formatMMK(product.price)}
              </p>
              <p className="truncate text-[11px] text-stone-500">
                {sold > 0
                  ? `${sold} sold`
                  : product.cargoPrice > 0
                    ? `+${formatMMK(product.cargoPrice)} cargo`
                    : soldOut
                      ? "Unavailable"
                      : `${product.stock} in stock`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={soldOut}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-white transition active:scale-[0.98] ${
                added ? "bg-accent-500" : "bg-primary-600 hover:bg-primary-700"
              } disabled:opacity-40`}
            >
              {soldOut ? "Sold out" : added ? "Added" : "Add"}
            </button>
          </div>
        </div>
      </Link>
    </article>
  );
}

function lightChip(name?: string | null) {
  switch (categoryKind(name)) {
    case "kids":
      return "bg-apricot-100 text-amber-900";
    case "kitchen":
      return "bg-primary-100 text-primary-800";
    case "food":
      return "bg-accent-100 text-accent-700";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

function RailButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      {dir === "left" ? (
        <path d="M14 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M10 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
