/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        arabic: ['Tajawal', 'Cairo', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a5f',
        },
        sidebar: {
          DEFAULT: '#1a2332',
          light:   '#243447',
          border:  '#2d3f55',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
