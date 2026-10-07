import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ShopMark from "./ShopMark";

export default function Footer() {
  const { isAuthenticated } = useAuth();

  return (
    <footer
      className={`mt-auto border-t border-stone-200 bg-white pt-10 dark:border-surface-800 dark:bg-surface-900 ${
        isAuthenticated ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-12" : "pb-10"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {isAuthenticated ? (
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 md:grid-cols-4">
            <div className="md:col-span-2">
              <Brand />
              <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                A small neighborhood shop for kitchen tools, kids’ things, and the daily bits a house actually uses.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Shop</h2>
              <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300">
                <li><Link className="hover:text-primary-700" to="/products">All products</Link></li>
                <li><Link className="hover:text-primary-700" to="/products?sort=popular">Popular this week</Link></li>
                <li><Link className="hover:text-primary-700" to="/products?inStock=true">In stock now</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Help</h2>
              <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300">
                <li><Link className="hover:text-primary-700" to="/orders">Track an order</Link></li>
                <li><span>Delivery by township at checkout</span></li>
              </ul>
            </div>
          </div>
        ) : (
          <Brand />
        )}
        <p className="mt-8 text-xs text-stone-500 dark:text-stone-400">
          {new Date().getFullYear()} ShopNow. Kitchen, kids, and everyday things.
        </p>
      </div>
    </footer>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <ShopMark />
      <span className="font-display text-xl font-semibold">ShopNow</span>
    </div>
  );
}
