import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { chatApi, type ChatMode, type ChatProductCard } from "../../api/chat";
import { formatMMK } from "../../utils/format";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  products?: ChatProductCard[];
}

const SUPPORT_WELCOME =
  "Hi! I can explain how ShopNow works — accounts, cart, checkout, delivery, and orders. Ask a question or pick a suggestion below.";
const PRODUCT_WELCOME =
  "Ask whether a product is still available, its price, or what's in stock. I check the live catalog.";

const SUGGESTIONS: Record<ChatMode, string[]> = {
  SUPPORT: [
    "How do I use ShopNow?",
    "How do I place an order?",
    "How does delivery work?",
    "Where are my orders?",
  ],
  PRODUCT: [
    "What's in stock right now?",
    "What are the best sellers?",
    "What categories do you have?",
    "Is this still available?",
  ],
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("SUPPORT");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: SUPPORT_WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const switchMode = (next: ChatMode) => {
    if (next === mode) return;
    setMode(next);
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: "assistant",
        text: next === "SUPPORT" ? SUPPORT_WELCOME : PRODUCT_WELCOME,
      },
    ]);
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || loading) return;

    setInput("");
    const userMsg: ChatMessage = { id: newId(), role: "user", text: message };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await chatApi.send(message, mode);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: response.reply,
          products: response.products,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: "I could not reach support right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <section
          className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-surface-100 bg-white shadow-2xl dark:border-surface-800 dark:bg-surface-900 inset-x-3 bottom-3 top-16 md:inset-auto md:bottom-6 md:right-6 md:top-auto md:h-[min(36rem,calc(100dvh-5rem))] md:w-[380px]"
          aria-label="ShopNow chat"
        >
          <header className="border-b border-surface-100 px-4 py-3 dark:border-surface-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold">ShopNow Chat</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Support guide or live product stock
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 hover:bg-surface-100 dark:hover:bg-surface-800"
                aria-label="Close chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-xl bg-surface-50 p-1 dark:bg-surface-800">
              <button
                type="button"
                onClick={() => switchMode("SUPPORT")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === "SUPPORT"
                    ? "bg-white text-primary-600 shadow-sm dark:bg-surface-900"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
                }`}
              >
                Support
              </button>
              <button
                type="button"
                onClick={() => switchMode("PRODUCT")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === "PRODUCT"
                    ? "bg-white text-primary-600 shadow-sm dark:bg-surface-900"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
                }`}
              >
                Products
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-primary-500 text-white"
                      : "bg-surface-50 text-gray-800 dark:bg-surface-800 dark:text-gray-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.products && message.products.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {message.products.map((product) => (
                        <li key={product.id}>
                          <ProductChip product={product} onOpen={() => setOpen(false)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-surface-50 px-4 py-2 text-sm text-gray-400 dark:bg-surface-800">
                  Typing…
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-surface-100 px-4 py-3 dark:border-surface-800">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS[mode].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-surface-100 px-2.5 py-1 text-[11px] text-gray-600 hover:border-primary-300 hover:text-primary-600 dark:border-surface-800 dark:text-gray-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={400}
                placeholder={mode === "SUPPORT" ? "Ask how ShopNow works…" : "Is this product still available?"}
                className="w-full rounded-xl border border-surface-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-surface-800 dark:bg-surface-800"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-glow transition-all hover:scale-105 hover:bg-primary-600"
          aria-label="Open chat support"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.942L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}
    </>
  );
}

function ProductChip({
  product,
  onOpen,
}: {
  product: ChatProductCard;
  onOpen: () => void;
}) {
  return (
    <Link
      to={`/products/${product.id}`}
      onClick={onOpen}
      className="flex gap-2 rounded-xl bg-white/90 p-2 text-left shadow-sm ring-1 ring-black/5 hover:bg-white dark:bg-surface-900 dark:ring-white/10"
    >
      <img
        src={product.imageUrl || "https://placehold.co/80x80?text=Item"}
        alt=""
        className="h-14 w-14 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {product.name}
        </p>
        <p className="text-xs font-medium text-primary-600">{formatMMK(product.price)}</p>
        <p className={`text-[11px] ${product.available ? "text-green-600" : "text-red-500"}`}>
          {product.available ? `${product.stock} in stock` : "Out of stock"}
        </p>
      </div>
    </Link>
  );
}
