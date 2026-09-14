/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5b28d6',
          50: '#f3efff',
          100: '#e7deff',
          200: '#cdbcf5',
          300: '#a98fe8',
          500: '#5b28d6',
          600: '#5325c0',
          700: '#4a1fae',
        },
        gold: { DEFAULT: '#d99a2b', soft: '#f7efe0' },
        ink: 'rgb(var(--ink) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,24,0.04), 0 6px 20px rgba(16,16,24,0.05)',
      },
      keyframes: {
        floatUp: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-160px) scale(1.4)', opacity: '0' },
        },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        splashPop: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        splashFadeUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        floatUp: 'floatUp 2.2s ease-out forwards',
        slideUp: 'slideUp .18s ease-out',
        splashPop: 'splashPop .55s cubic-bezier(.34,1.56,.64,1) both',
        splashFadeUp: 'splashFadeUp .5s ease-out both',
        fadeIn: 'fadeIn .4s ease-out both',
      },
    },
  },
  plugins: [],
}
