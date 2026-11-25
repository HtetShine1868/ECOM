import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import hero from "../assets/landing-hero.jpg";
import kitchen from "../assets/landing-kitchen.jpg";
import kids from "../assets/landing-kids.jpg";
import daily from "../assets/landing-daily.jpg";
import ShopMark from "../components/layout/ShopMark";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#1c120d] text-white">
      <img
        src={hero}
        alt=""
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#1c120d] via-[#1c120d]/78 to-[#1c120d]/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#1c120d]/80 via-transparent to-[#1c120d]/35" />
      <div className="landing-grain pointer-events-none absolute inset-0" />

      <header className="relative z-20 flex items-center justify-between gap-3 px-4 py-5 sm:px-5 md:px-10">
        <span className="flex items-center gap-2.5">
          <ShopMark className="h-10 w-10" />
          <span className="font-display text-2xl font-semibold tracking-tight">ShopNow</span>
        </span>
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-shop transition hover:bg-primary-700"
            >
              Go to Shop
            </Link>
            <button
              onClick={logout}
              className="rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-shop transition hover:bg-apricot-100"
          >
            Sign in
          </Link>
        )}
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-5.5rem)] max-w-7xl items-center gap-10 px-4 pb-10 pt-4 sm:px-5 md:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-16">
        <div className="max-w-xl animate-fade-in">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-apricot-500">
            Neighborhood shop, online
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl lg:text-[3.55rem]">
            Come in for kitchen, kids, and the daily bits.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-stone-200/90 sm:text-lg">
            {isAuthenticated
              ? `Welcome back, ${user?.name ?? ""}! Your shop is ready.`
              : "Sign in to see what's on the shelf, drop it in a bag, and have it brought to your township."}
          </p>
          {isAuthenticated ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-8 py-3.5 text-base font-semibold text-white shadow-glow transition hover:bg-primary-700 active:scale-[0.98]"
              >
                Continue shopping
                <span aria-hidden className="text-lg leading-none">→</span>
              </Link>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-8 py-3.5 text-base font-semibold text-white shadow-glow transition hover:bg-primary-700 active:scale-[0.98]"
              >
                Sign in to shop
                <span aria-hidden className="text-lg leading-none">
                  →
                </span>
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
              >
                Create account
              </Link>
            </div>
          )}
          <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-300/90">
            <li>Live stock</li>
            <li className="hidden sm:list-item">·</li>
            <li>Town delivery</li>
            <li className="hidden sm:list-item">·</li>
            <li>Kitchen · kids · daily</li>
          </ul>
        </div>

        <div className="relative mx-auto h-[18rem] w-full max-w-[28rem] min-[380px]:h-[22rem] sm:h-[30rem] sm:max-w-[34rem] lg:h-[36rem] lg:max-w-none">
          <Polaroid
            src={kitchen}
            alt="Kitchen bowls, fruit, and wooden spoons"
            caption="Kitchen"
            className="absolute left-[2%] top-[10%] w-[58%] [animation-delay:-1.4s]"
            tilt="-6deg"
          />
          <Polaroid
            src={kids}
            alt="Wooden toys and books in a play corner"
            caption="Kids"
            className="absolute right-[2%] top-0 w-[42%] [animation-delay:-3.2s]"
            tilt="7deg"
            aspect="aspect-[3/4]"
          />
          <Polaroid
            src={daily}
            alt="Towels, soap, and everyday household things"
            caption="Daily"
            className="absolute bottom-[2%] right-[10%] w-[52%] [animation-delay:-0.6s]"
            tilt="-2.5deg"
          />
        </div>
      </main>
    </div>
  );
}

function Polaroid({
  src,
  alt,
  caption,
  className,
  tilt,
  aspect = "aspect-[4/3]",
}: {
  src: string;
  alt: string;
  caption: string;
  className: string;
  tilt: string;
  aspect?: string;
}) {
  return (
    <figure
      className={`landing-float overflow-hidden rounded-[1.35rem] bg-white p-2 shadow-[0_18px_50px_rgba(20,10,6,0.35)] ${className}`}
      style={{ "--tilt": tilt } as CSSProperties}
    >
      <img src={src} alt={alt} className={`${aspect} w-full object-cover`} />
      <figcaption className="px-2 py-2 font-display text-sm text-stone-700">{caption}</figcaption>
    </figure>
  );
}
