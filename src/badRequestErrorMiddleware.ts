/**
 * Errors that this service can produce, generically, come in two flavors:
 * - BadRequestErrors:
 *  - i.e., either in user validation or in business logic, we decide that this is a bad request.
 * - Everything else (i.e., InternalServiceErrors)
 *
 * For BadRequestErrors
 *  - we SHOULD NOT report that this lambda execution failed.
 *     - it did not. there was nothing wrong with how the lambda was executing.
 *     - i.e., there is no reason to debug this service. its the consumer who is wrong
 *
 * For InternalServiceErrors (i.e., any error other than "BadRequestError")
 *  - we SHOULD report that this lambda execution failed.
 *    - i.e., for some reason, we were not able to handle a request - and we should look into it
 */
import middy from '@middy/core';

export class BadRequestError extends Error {} // purpose: `if (error instanceof BadRequestError) then { return error } else { throw error }`

export const badRequestErrorMiddleware = () => {
  const onError: middy.MiddlewareFunction<any, any> = async (handler) => {
    // 1. check if the error was due to a bad request from the user. if it was, just return the error object, so its not reported as our lambda breaking in aws cloudwatch
    if (handler.error instanceof BadRequestError) {
      // since its a bad request, only report the error to the user, through the response
      // eslint-disable-next-line no-param-reassign
      handler.response = {
        errorMessage: handler.error.message,
        errorType: handler.error.name,
        stackTrace: handler.error.stack,
      };
      return; // and return nothing so that middy knows we handled it - and so no one tells cloudwatch about it
    }

    // 2. since the error was not due to bad input, do nothing; it will be treated like a lambda invocation error that we will see in cloudwatch
    // eslint-disable-next-line consistent-return
    return handler.error; // return error to pass it up the chain, since we're not handling it here
  };
  return {
    onError,
  };
};
