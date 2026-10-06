module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "hsl(18, 55%, 96%)",
          100: "hsl(18, 50%, 90%)",
          200: "hsl(17, 48%, 80%)",
          300: "hsl(16, 46%, 68%)",
          400: "hsl(16, 48%, 54%)",
          500: "hsl(16, 52%, 44%)",
          600: "hsl(16, 54%, 36%)",
          700: "hsl(16, 52%, 30%)",
          800: "hsl(16, 46%, 24%)",
          900: "hsl(16, 40%, 18%)"
        },
        accent: {
          100: "hsl(148, 22%, 90%)",
          400: "hsl(148, 20%, 48%)",
          500: "hsl(148, 22%, 36%)",
          600: "hsl(148, 24%, 28%)"
        },
        apricot: {
          100: "hsl(28, 70%, 92%)",
          500: "hsl(28, 58%, 58%)"
        },
        surface: {
          50:  "hsl(36, 42%, 96%)",
          100: "hsl(32, 28%, 90%)",
          200: "hsl(30, 20%, 82%)",
          800: "hsl(24, 14%, 16%)",
          900: "hsl(24, 16%, 10%)",
          950: "hsl(24, 18%, 7%)"
        }
      },
      fontFamily: {
        sans: ["Nunito Sans", "ui-sans-serif", "system-ui"],
        display: ["Fraunces", "Georgia", "serif"]
      },
      boxShadow: {
        glass: "0 8px 24px rgba(74, 42, 24, 0.06)",
        glow:  "0 8px 18px rgba(156, 68, 36, 0.18)",
        shop:  "0 10px 30px rgba(74, 42, 24, 0.08)"
      },
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          "0%":   { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        pop: {
          "0%":   { transform: "scale(0.7)" },
          "70%":  { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" }
        }
      },
      animation: {
        "fade-in":  "fade-in 0.28s ease-out",
        "slide-in": "slide-in 0.28s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        pop: "pop 0.35s ease-out"
      }
    }
  },
  plugins: []
}
