export function errorHandler(err, req, res, next){
    console.error(`${req.method} ${req.originalUrl}`, err);

    if (res.headerSent) {
        return next(err);
    }

    const status = err.status ?? 500;
    res.status(status).json({
        error: status >= 500 ? 'Something went wrong' : err.message,
    });
}