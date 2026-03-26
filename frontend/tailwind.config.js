/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        body:    ['var(--font-body)'],
        mono:    ['var(--font-mono)'],
      },
      colors: {
        bg:       'var(--color-bg)',
        surface:  'var(--color-surface)',
        surface2: 'var(--color-surface2)',
        border:   'var(--color-border)',
        foreground: 'var(--color-text)',
        
        // Semantic mapping from previously hardcoded Gold to the new Blue Accent
        gold:     'var(--color-accent)',
        'gold-light': 'var(--color-accent-light)',
        
        cyan:     '#4fd1c5',
        green:    '#5af0a0',
        red:      '#fc6b6b',
        
        muted:    'var(--color-text-muted)',
        dim:      'var(--color-text-dim)',
      },
    },
  },
  plugins: [],
}
