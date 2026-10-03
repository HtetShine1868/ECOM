import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useTheme } from "../../hooks/useTheme";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/orders", label: "Orders" },
];

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { totalItems, setIsOpen, clearCart } = useCart();
  const { isDark, toggle } = useTheme();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-surface-100 dark:border-surface-800 bg-white/80 dark:bg-surface-900/80 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link
          to="/"
          className="font-display text-2xl font-bold bg-gradient-to-r from-primary-500 to-accent-500 bg-clip-text text-transparent"
        >
          ShopNow
        </Link>

        {/* Links */}
        <ul className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className={`text-sm font-medium transition-colors hover:text-primary-500 ${
                  location.pathname === link.to
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li>
              <Link
                to="/admin"
                className={`text-sm font-medium transition-colors hover:text-primary-500 ${
                  location.pathname === "/admin"
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                Admin
              </Link>
            </li>
          )}
        </ul>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="rounded-full p-2 text-gray-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Cart */}
          <button
            onClick={() => setIsOpen(true)}
            className="relative rounded-full p-2 text-gray-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Open cart"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white animate-scale-in">
                {totalItems}
              </span>
            )}
          </button>

          {/* Auth */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-200">
                {user?.name}
              </span>
              <button
                onClick={() => {
                  logout();
                  clearCart();
                }}
                className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-surface-100/80 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-glow hover:bg-primary-600 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
