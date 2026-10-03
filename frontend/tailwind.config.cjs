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
          50:  "hsl(221,100%,96%)",
          100: "hsl(221,90%,90%)",
          200: "hsl(221,80%,80%)",
          300: "hsl(221,70%,70%)",
          400: "hsl(221,65%,60%)",
          500: "hsl(221,83%,53%)",
          600: "hsl(221,83%,45%)",
          700: "hsl(221,83%,37%)",
          800: "hsl(221,83%,29%)",
          900: "hsl(221,83%,21%)"
        },
        accent: {
          400: "hsl(280,70%,65%)",
          500: "hsl(280,70%,55%)",
          600: "hsl(280,70%,45%)"
        },
        surface: {
          50:  "hsl(220,20%,97%)",
          100: "hsl(220,20%,94%)",
          800: "hsl(220,25%,14%)",
          900: "hsl(220,28%,10%)",
          950: "hsl(220,30%,7%)"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        display: ["Outfit", "Inter", "ui-sans-serif"]
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31,38,135,0.18)",
        glow:  "0 0 24px 0 hsl(221,83%,53%,0.35)"
      },
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          "0%":   { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        }
      },
      animation: {
        "fade-in":  "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out"
      }
    }
  },
  plugins: []
}
