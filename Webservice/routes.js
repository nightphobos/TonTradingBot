const ROUTES = [
    {
        url: '/',
        auth: false,
        creditCheck: false,
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            max: 5
        },
        proxy: {
            target: "https://web.ton-rocket.com/trade",
            changeOrigin: true,
            pathRewrite: {
                [`^/`]: '',
            },
        }
    }
]

exports.ROUTES = ROUTES;