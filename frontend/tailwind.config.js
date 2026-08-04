/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        oled: {
          black: '#050505',
          card: '#0a0a0a',
          border: 'rgba(255, 255, 255, 0.08)',
          glow: 'rgba(99, 102, 241, 0.15)',
        },
        brand: {
          purple: '#6366f1',
          emerald: '#10b981',
          slate: '#0f172a'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Outfit', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.32, 0.72, 0, 1) forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0', filter: 'blur(4px)' },
          '100%': { transform: 'translateY(0)', opacity: '1', filter: 'blur(0)' }
        }
      },
      transitionTimingFunction: {
        'spring-custom': 'cubic-bezier(0.32, 0.72, 0, 1)',
      }
    },
  },
  plugins: [],
}
