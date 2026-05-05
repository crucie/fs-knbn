
//This class has been created to handle errors in a consistent way across the application,
// allowing us to return a structured error response to the client.

class ApiError extends Error{
    constructor(
        statusCode,
        message= "Something Went Wrong",
        errors = [],
        stack = ""
    ){
        super("message")
        this.statusCode = statusCode
        this.message = message
        this.data = null
        this.errors = errors
        this.success = false;

        if(stack){
            this.stack = stack
        } else{
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export {ApiError}