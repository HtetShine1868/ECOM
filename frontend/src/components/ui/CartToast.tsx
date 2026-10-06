import { useCart } from "../../context/CartContext";

export default function CartToast() {
  const { notice, setIsOpen } = useCart();
  if (!notice) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4 md:top-24">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2.5 shadow-shop animate-fade-in dark:border-surface-800 dark:bg-surface-800">
        <p className="text-sm text-stone-700 dark:text-stone-100">{notice}</p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          View bag
        </button>
      </div>
    </div>
  );
}
