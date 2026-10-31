/** @param {string} name */
function scale(name) {
  return {
    50: `rgb(var(--${name}-50) / <alpha-value>)`,
    100: `rgb(var(--${name}-100) / <alpha-value>)`,
    200: `rgb(var(--${name}-200) / <alpha-value>)`,
    300: `rgb(var(--${name}-300) / <alpha-value>)`,
    400: `rgb(var(--${name}-400) / <alpha-value>)`,
    500: `rgb(var(--${name}-500) / <alpha-value>)`,
    600: `rgb(var(--${name}-600) / <alpha-value>)`,
    700: `rgb(var(--${name}-700) / <alpha-value>)`,
    800: `rgb(var(--${name}-800) / <alpha-value>)`,
    900: `rgb(var(--${name}-900) / <alpha-value>)`,
    950: `rgb(var(--${name}-950) / <alpha-value>)`
  }
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ]
      },
      fontSize: {
        'page-title': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.035em', fontWeight: '600' }],
        metric: ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
        section: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '600' }],
        'card-title': ['1.125rem', { lineHeight: '1.35', fontWeight: '600' }],
        tab: ['1rem', { lineHeight: '1.4', fontWeight: '500' }],
        body: ['1rem', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['0.9375rem', { lineHeight: '1.4', fontWeight: '400' }],
        micro: ['0.8125rem', { lineHeight: '1.35', fontWeight: '500' }]
      },
      colors: {
        zinc: scale('zinc'),
        amber: scale('amber'),
        red: scale('red'),
        emerald: scale('emerald'),
        sky: scale('sky'),
        primary: scale('primary')
      }
    }
  },
  plugins: []
}
