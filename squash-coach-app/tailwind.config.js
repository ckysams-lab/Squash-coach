/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // We can add custom animations or keyframes here later
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['monospace'],
      },
    },
  },
  //  ▼▼▼ THIS IS THE CRITICAL UPDATE ▼▼▼
  plugins: [
    require("tailwindcss-animate")
  ],
}
