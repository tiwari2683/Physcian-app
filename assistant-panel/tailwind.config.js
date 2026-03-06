/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    base: '#2563EB',
                    dark: '#1E40AF',
                    light: '#DBEAFE',
                },
                secondary: {
                    base: '#10B981',
                    dark: '#059669',
                    light: '#D1FAE5',
                },
                status: {
                    success: '#00C851',
                    error: '#FF4444',
                    warning: '#FFBB33',
                    info: '#33B5E5',
                },
                appBg: '#F3F4F6',
                cardBg: '#FFFFFF',
                borderColor: '#E5E7EB',
                type: {
                    heading: '#374151',
                    body: '#6B7280',
                    contrast: '#1F2937',
                }
            },
            boxShadow: {
                'tier-light': '0 2px 4px rgba(0, 0, 0, 0.1)',
                'tier-medium': '0 6px 12px rgba(0, 0, 0, 0.15)',
                'tier-dark': '0 10px 20px rgba(0, 0, 0, 0.25)',
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
