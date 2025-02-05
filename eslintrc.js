module.exports = {
  root: true,
  parser: '@html-eslint/parser',
  plugins: ['@html-eslint', 'pado'],
  extends: ['plugin:@html-eslint/recommended'],
  rules: {
    'pado/no-mixed-content': 'error'
  },
  overrides: [
    {
      files: ['src/**/*.html'],
      parser: '@html-eslint/parser',
      plugins: ['@html-eslint', 'pado'],
      rules: {
        'pado/no-mixed-content': 'error'
      }
    }
  ]
}; 