const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        messsage: err.message,
        errors: err.errors || [],
        stack: process.env.NODE_ENV === "developement" ? err.stack : undefined,
    });
};

export default errorHandler;