import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ShopMark from "./ShopMark";

export default function Footer() {
  const { isAuthenticated } = useAuth();

  return (
    <footer
      className={`mt-auto border-t border-stone-200 bg-white pt-6 dark:border-surface-800 dark:bg-surface-900 md:pt-10 ${
        isAuthenticated ? "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12" : "pb-8 md:pb-10"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {isAuthenticated ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 md:gap-10">
            <div className="col-span-2 md:col-span-2">
              <Brand />
              <p className="mt-3 hidden max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-300 md:block">
                A small neighborhood shop for kitchen tools, kids’ things, and the daily bits a house actually uses.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Shop</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-300 md:mt-3 md:space-y-2">
                <li><Link className="hover:text-primary-700" to="/products">All products</Link></li>
                <li><Link className="hover:text-primary-700" to="/products?sort=popular">Popular this week</Link></li>
                <li><Link className="hover:text-primary-700" to="/products?inStock=true">In stock now</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Help</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-300 md:mt-3 md:space-y-2">
                <li><Link className="hover:text-primary-700" to="/orders">Track an order</Link></li>
                <li><span>Delivery by township at checkout</span></li>
              </ul>
            </div>
          </div>
        ) : (
          <Brand />
        )}
        <p className="mt-5 text-xs text-stone-500 dark:text-stone-400 md:mt-8">
          <span className="md:hidden">{new Date().getFullYear()} ShopNow</span>
          <span className="hidden md:inline">{new Date().getFullYear()} ShopNow. Kitchen, kids, and everyday things.</span>
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
