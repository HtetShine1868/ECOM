import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import kitchen from "../../assets/landing-kitchen.jpg";
import ShopMark from "../layout/ShopMark";

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden lg:block">
        <img src={kitchen} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1c120d]/80 via-[#1c120d]/20 to-[#1c120d]/30" />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="font-display text-4xl font-semibold leading-tight text-white">
            Kitchen, kids, and the daily bits a house uses.
          </p>
          <p className="mt-3 text-sm text-stone-200/90">Sign in and the shop opens.</p>
        </div>
      </aside>
      <div className="linen flex flex-col">
        <div className="flex items-center px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <ShopMark className="h-9 w-9" />
            <span className="font-display text-xl font-semibold text-stone-900 dark:text-stone-50">
              ShopNow
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
