import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { chatApi, type ChatAction, type ChatProductCard } from "../../api/chat";
import { useCart } from "../../context/CartContext";
import { formatMMK } from "../../utils/format";
import { productImageSrc } from "../../utils/image";
import type { Product } from "../../types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  products?: ChatProductCard[];
  suggestions?: string[];
  actions?: ChatAction[];
}

const STORAGE_KEY = "shopnow-chat";

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hi! I'm the ShopNow assistant. Ask me anything in your own words: find a product, check stock or prices, track your order, see what's in your bag, or ask about delivery.",
  suggestions: ["What's new?", "Track my last order", "What's in my bag?", "Something for kids under 20000", "How much is delivery?"],
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadSaved(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.slice(-40) : [WELCOME];
  } catch {
    return [WELCOME];
  }
}

function cardToProduct(card: ChatProductCard): Product {
  const now = new Date().toISOString();
  return {
    id: card.id,
    name: card.name,
    description: card.description ?? "",
    price: card.price,
    stock: card.stock,
    cargoPrice: 0,
    imageUrl: card.imageUrl,
    categoryName: card.categoryName,
    createdAt: now,
    updatedAt: now,
  };
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadSaved);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setIsOpen: openBag } = useCart();

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // storage unavailable: the conversation just won't survive a reload
    }
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { id: newId(), role: "user", text: message }]);
    setLoading(true);
    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 400) }));
      const res = await chatApi.send(message, "SUPPORT", history);
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: res.reply, products: res.products, suggestions: res.suggestions, actions: res.actions },
      ]);
    } catch (err) {
      const rateLimited = (err as { code?: string })?.code === "RATE_LIMITED";
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: rateLimited ? "You're asking faster than I can keep up. Give me a few seconds and try again." : "I couldn't reach the shop just now. Please try again in a moment.",
          suggestions: [message],
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const runAction = (action: ChatAction) => {
    if (action.href === "#bag") {
      openBag(true);
      setOpen(false);
      return;
    }
    navigate(action.href);
    setOpen(false);
  };

  const reset = () => {
    setMessages([WELCOME]);
    setInput("");
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <>
      {open && (
        <section
          className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-shop inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] top-[max(4rem,env(safe-area-inset-top))] dark:border-surface-800 dark:bg-surface-900 md:inset-auto md:bottom-6 md:right-6 md:top-auto md:h-[min(40rem,calc(100dvh-5rem))] md:w-[min(400px,calc(100vw-2rem))]"
          aria-label="ShopNow assistant"
        >
          <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 dark:border-surface-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200" aria-hidden="true">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold leading-tight">Shop assistant</h2>
              <p className="text-xs text-stone-500">Products, orders, your bag, delivery</p>
            </div>
            <button type="button" onClick={reset} className="rounded-full px-2.5 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-surface-800 dark:hover:text-stone-100">
              New chat
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-stone-100 dark:hover:bg-surface-800" aria-label="Close chat">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-md bg-primary-600 text-white"
                      : "rounded-bl-md bg-stone-100 text-stone-800 dark:bg-surface-800 dark:text-stone-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                </div>

                {message.products && message.products.length > 0 && (
                  <ul className="mt-2 w-full max-w-[88%] space-y-2">
                    {message.products.map((product) => (
                      <li key={product.id}>
                        <ProductRow product={product} onOpen={() => setOpen(false)} />
                      </li>
                    ))}
                  </ul>
                )}

                {message.actions && message.actions.length > 0 && (
                  <div className="mt-2 flex max-w-[88%] flex-wrap gap-1.5">
                    {message.actions.map((action) => (
                      <button
                        key={action.label + action.href}
                        type="button"
                        onClick={() => runAction(action)}
                        className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 dark:bg-white dark:text-stone-900 dark:hover:bg-primary-100"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                {message === lastAssistant && !loading && message.suggestions && message.suggestions.length > 0 && (
                  <div className="mt-2 flex max-w-[95%] flex-wrap gap-1.5">
                    {message.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800 hover:border-primary-400 dark:border-primary-900 dark:bg-primary-950/40 dark:text-primary-200"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start" aria-label="Assistant is typing">
                <div className="flex gap-1 rounded-2xl rounded-bl-md bg-stone-100 px-4 py-3 dark:bg-surface-800">
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${dot * 120}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            className="flex gap-2 border-t border-stone-100 px-3 py-3 dark:border-surface-800"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <input
              id="chat-input"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={400}
              placeholder="Ask anything about the shop…"
              autoComplete="off"
              className="w-full rounded-full border border-stone-200 bg-surface-50 px-4 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-800 dark:bg-surface-800"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </section>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary-700 text-white shadow-shop transition hover:bg-primary-800 md:bottom-6 md:right-6 md:h-14 md:w-14"
          aria-label="Open shop assistant"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.942L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}
    </>
  );
}

function ProductRow({ product, onOpen }: { product: ChatProductCard; onOpen: () => void }) {
  const { addItem } = useCart();
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");

  const add = async () => {
    setState("adding");
    const ok = await addItem(cardToProduct(product), 1);
    setState(ok ? "added" : "idle");
    if (ok) window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white p-2 dark:border-surface-800 dark:bg-surface-900">
      <Link to={`/products/${product.id}`} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5">
        <img
          src={productImageSrc(product.imageUrl, "https://placehold.co/80x80?text=Item")}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{product.name}</p>
          <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">{formatMMK(product.price)}</p>
          <p className={`text-[11px] ${product.available ? "text-accent-600 dark:text-accent-300" : "text-red-600 dark:text-red-400"}`}>
            {product.available ? (product.stock <= 5 ? `Only ${product.stock} left` : "In stock") : "Out of stock"}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => void add()}
        disabled={!product.available || state === "adding"}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-40 ${state === "added" ? "bg-accent-500" : "bg-primary-600 hover:bg-primary-700"}`}
      >
        {state === "added" ? "Added" : state === "adding" ? "…" : "Add"}
      </button>
    </div>
  );
}
