/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        text: token('text'),
        muted: token('muted'),
        border: token('border'),
        accent: token('accent'),
        'accent-text': token('accent-text'),
        'accent-soft': token('accent-soft'),
        danger: token('danger'),
        success: token('success'),
        chip: token('chip'),
      },
      borderRadius: { card: '18px' },
    },
  },
  plugins: [],
};
