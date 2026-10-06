import { Link } from "react-router-dom";
import ShopMark from "./ShopMark";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-stone-200 bg-white pb-24 pt-12 dark:border-surface-800 dark:bg-surface-900 md:pb-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <ShopMark />
            <span className="font-display text-xl font-semibold">ShopNow</span>
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            A small neighborhood shop for kitchen tools, kids’ things, and the daily bits a house actually uses. Order online and get it delivered across town.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300">
            <li><Link className="hover:text-primary-700" to="/products">All products</Link></li>
            <li><Link className="hover:text-primary-700" to="/products?sort=popular">Popular this week</Link></li>
            <li><Link className="hover:text-primary-700" to="/products?inStock=true">In stock now</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Help</h2>
          <ul className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300">
            <li><Link className="hover:text-primary-700" to="/orders">Track an order</Link></li>
            <li><Link className="hover:text-primary-700" to="/login">Your account</Link></li>
            <li><span>Delivery by township at checkout</span></li>
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-7xl px-4 text-xs text-stone-400 md:px-6">
        {new Date().getFullYear()} ShopNow. Kitchen, kids, and everyday things.
      </p>
    </footer>
  );
}
