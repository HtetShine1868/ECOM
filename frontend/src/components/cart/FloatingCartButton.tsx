import { useCart } from "../../context/CartContext";

export default function FloatingCartButton() {
  const { totalItems, setIsOpen } = useCart();

  if (totalItems === 0) return null;

  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-24 right-6 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-5 py-3 text-white shadow-glow transition-all hover:scale-105 hover:bg-primary-700 animate-scale-in"
      aria-label="Open cart"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
      <span className="text-sm font-bold">{totalItems}</span>
    </button>
  );
}
