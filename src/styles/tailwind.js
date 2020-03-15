module.exports = {
    theme: {
        // Only two screens: mobile (default) & desktop
        screens: {
            'desktop': '640px',
        },
        fontFamily: {
            montserrat: [
                '"Montserrat"',
                'sans-serif',
            ],
        },
        // Extend default config
        // @see https://github.com/tailwindcss/tailwindcss/blob/master/stubs/defaultConfig.stub.js
        extend: {
            boxShadow: {
                'solid': '0 0 0 3px currentColor',
            },
            colors: {
                'kraken-lightest': '#fed7d7',
                'kraken-lighter': '#feb2b2',
                'kraken-light': '#f79e9e',
                'kraken-dark': '#f05252',
                'kraken-darker': '#e02c2c',
                'kraken-darkest': '#961f1f',
            },
            inset: theme => ({
                '10': theme('spacing.10'),
                '16': theme('spacing.16'),
                '1/2': '50%',
                'full': '100%',
            }),
            maxWidth: {
                '0': '0',
                'content': '900px',
            },
            gridTemplateColumns: theme => ({
                ...Object.entries(theme('spacing')).reduce((gridTemplateColumns, [key, value]) => {
                    gridTemplateColumns['fit-' + key] = `repeat(auto-fit, ${value})`;

                    return gridTemplateColumns;
                }, {}),
            }),
        },
    },
};
