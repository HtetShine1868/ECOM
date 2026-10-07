import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useTheme } from "../../hooks/useTheme";
import ShopMark from "./ShopMark";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Shop" },
  { to: "/orders", label: "Orders" },
];

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { totalItems, setIsOpen, clearCart } = useCart();
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const search = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/products?search=${encodeURIComponent(value)}` : "/products");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-surface-50/90 backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/90">
      <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <ShopMark className="h-9 w-9" />
          <span className="font-display text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            ShopNow
          </span>
        </Link>

        {isAuthenticated && (
          <>
            <ul className="hidden items-center gap-5 md:flex">
              {navLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={`text-sm font-semibold ${
                      location.pathname === link.to
                        ? "text-primary-700"
                        : "text-stone-600 hover:text-primary-700 dark:text-stone-300"
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
                    className={`text-sm font-semibold ${
                      location.pathname === "/admin" ? "text-primary-700" : "text-stone-600 hover:text-primary-700"
                    }`}
                  >
                    Admin
                  </Link>
                </li>
              )}
            </ul>

            <form onSubmit={search} className="hidden min-w-0 flex-1 md:flex">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search kitchen, kids, daily..."
                className="field"
              />
            </form>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={toggle}
            className="rounded-full p-2 text-stone-500 hover:bg-white dark:hover:bg-surface-800"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {isAuthenticated ? (
            <>
              <button
                onClick={() => setIsOpen(true)}
                className="relative hidden rounded-full p-2 text-stone-600 hover:bg-white md:inline-flex dark:text-stone-300 dark:hover:bg-surface-800"
                aria-label="Open bag"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 016 0v2" />
                </svg>
                {totalItems > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white animate-pop">
                    {totalItems}
                  </span>
                )}
              </button>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="max-w-[8rem] truncate text-sm font-medium text-stone-700 dark:text-stone-200">
                  {user?.name}
                </span>
                <button
                  onClick={() => {
                    logout();
                    clearCart();
                    navigate("/");
                  }}
                  className="btn-secondary px-3 py-1.5"
                >
                  Log out
                </button>
              </div>
            </>
          ) : (
            location.pathname !== "/login" && (
              <Link to="/login" className="btn-primary px-5 py-2">
                Sign in
              </Link>
            )
          )}
        </div>
      </nav>
    </header>
  );
}
