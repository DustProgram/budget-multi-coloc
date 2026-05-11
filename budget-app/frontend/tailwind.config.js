/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1F4E79',
          dark: '#163960',
          light: '#2F6BA8',
        },
      },
    },
  },
  plugins: [],
};
