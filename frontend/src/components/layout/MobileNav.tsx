import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

export default function MobileNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { totalItems, setIsOpen } = useCart();

  const itemClass = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
      active ? "text-primary-700" : "text-stone-500"
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-surface-800 dark:bg-surface-900/95">
      <div className="flex items-stretch">
        <Link to="/" className={itemClass(location.pathname === "/")}>
          <HomeIcon />
          Home
        </Link>
        <Link to="/products" className={itemClass(location.pathname.startsWith("/products"))}>
          <ShopIcon />
          Shop
        </Link>
        <button type="button" onClick={() => setIsOpen(true)} className={itemClass(false)}>
          <span className="relative">
            <BagIcon />
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] text-white">
                {totalItems}
              </span>
            )}
          </span>
          Bag
        </button>
        <Link to="/orders" className={itemClass(location.pathname.startsWith("/orders"))}>
          <OrdersIcon />
          Orders
        </Link>
        <Link
          to={isAuthenticated ? "/orders" : "/login"}
          className={itemClass(location.pathname === "/login" || location.pathname === "/register")}
        >
          <UserIcon />
          {isAuthenticated ? "You" : "Sign in"}
        </Link>
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
    </svg>
  );
}
function ShopIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16l-1.2 12.2A2 2 0 0116.81 21H7.19a2 2 0 01-1.99-1.8L4 7zm4 0V5a4 4 0 018 0v2" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 016 0v2" />
    </svg>
  );
}
function OrdersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />
    </svg>
  );
}
