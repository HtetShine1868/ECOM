import { useCart } from "../../context/CartContext";
import { formatMMK } from "../../utils/format";
import { useNavigate } from "react-router-dom";

export default function CartDrawer() {
  const {
    items,
    totalItems,
    totalPrice,
    isOpen,
    setIsOpen,
    removeItem,
    updateQuantity,
  } = useCart();
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white dark:bg-surface-900 shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-100 dark:border-surface-800 px-6 py-4">
          <h2 className="font-display text-xl font-bold">
            Cart
            {totalItems > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({totalItems} {totalItems === 1 ? "item" : "items"})
              </span>
            )}
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-2 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Close cart"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              <p className="text-lg font-medium">Your cart is empty</p>
              <p className="mt-1 text-sm">Start shopping to add items</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.product.id}
                  className="flex gap-4 rounded-xl bg-surface-50 dark:bg-surface-800/50 p-3 animate-fade-in"
                >
                  <img
                    src={item.product.imageUrl ?? "https://via.placeholder.com/80"}
                    alt={item.product.name}
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">
                      {item.product.name}
                    </h3>
                    <p className="text-sm text-primary-600 font-medium mt-1">
                      {formatMMK(item.product.price)}
                    </p>
                    {/* Quantity control */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                        className="h-7 w-7 rounded-full border border-surface-100 dark:border-surface-800 flex items-center justify-center text-sm hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                      >
                        −
                      </button>
                      <span className="text-sm font-medium w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                        disabled={item.quantity >= item.product.stock}
                        className="h-7 w-7 rounded-full border border-surface-100 dark:border-surface-800 flex items-center justify-center text-sm hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="self-start p-1 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-surface-100 dark:border-surface-800 px-6 py-4 space-y-3">
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary-600">{formatMMK(totalPrice)}</span>
            </div>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate("/checkout");
              }}
              className="w-full rounded-xl bg-primary-500 py-3 text-sm font-semibold text-white shadow-glow hover:bg-primary-600 transition-colors"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
