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
          50:  "hsl(16, 85%, 97%)",
          100: "hsl(16, 78%, 93%)",
          200: "hsl(14, 74%, 84%)",
          300: "hsl(12, 72%, 72%)",
          400: "hsl(10, 76%, 58%)",
          500: "hsl(8, 78%, 50%)",
          600: "hsl(8, 76%, 40%)",
          700: "hsl(8, 72%, 32%)",
          800: "hsl(8, 64%, 24%)",
          900: "hsl(8, 54%, 16%)"
        },
        accent: {
          100: "hsl(152, 46%, 92%)",
          300: "hsl(152, 42%, 62%)",
          400: "hsl(152, 44%, 46%)",
          500: "hsl(152, 50%, 34%)",
          600: "hsl(152, 54%, 26%)",
          700: "hsl(152, 56%, 20%)"
        },
        apricot: {
          100: "hsl(36, 95%, 91%)",
          500: "hsl(32, 92%, 56%)"
        },
        surface: {
          50:  "hsl(30, 50%, 98%)",
          100: "hsl(28, 32%, 94%)",
          200: "hsl(26, 18%, 86%)",
          800: "hsl(18, 14%, 16%)",
          900: "hsl(18, 16%, 10%)",
          950: "hsl(18, 18%, 7%)"
        }
      },
      fontFamily: {
        sans: ["Nunito Sans", "ui-sans-serif", "system-ui"],
        display: ["Fraunces", "Georgia", "serif"]
      },
      boxShadow: {
        glass: "0 8px 24px rgba(120, 36, 18, 0.08)",
        glow:  "0 10px 22px rgba(184, 56, 32, 0.28)",
        shop:  "0 10px 28px rgba(90, 32, 16, 0.08)"
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
