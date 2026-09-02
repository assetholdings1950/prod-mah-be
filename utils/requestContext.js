const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

function runInRequestContext(context, next) {
    return requestContext.run(context, next);
}

function getRequestContext() {
    return requestContext.getStore();
}

module.exports = { runInRequestContext, getRequestContext };
