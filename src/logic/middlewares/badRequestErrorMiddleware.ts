/**
 * Errors that ta service can produce, generically, come in two flavors:
 * - BadRequestErrors:
 *  - i.e., either in user validation or in business logic, we decide that this is a bad request.
 * - InternalServiceErrors
 *  - i.e., everything else
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

/**
 * BadRequestError.
 *
 * For situations where the request is invalid and should be reported to the client as such. Used in situations where the business logic proactively rejects this request.
 *
 * The purpose of distinguishing this type of error is that it will not show up in CloudWatch, when used with [standard-lambda-handler](https://github.com/uladkasach/standard-lambda-handler).
 *
 * Why? because a BadRequestError means that the problem is with the client's request, not the internal workings of this service. I.e., this service is functioning as intended and any debugging needs to be done in the client who called this.
 *
 * Tip: Use a lambda client like [simple-lambda-client](https://github.com/uladkasach/simple-lambda-client) to hydrate the error client side if invoking a lambda directly. Otherwise, if invoking an api-gateway backed lambda through rest, your typical rest client will hydrate the error when it sees statusCode != 200.
 */
export class BadRequestError extends Error {
  statusCode = 400;
}

export const badRequestErrorMiddleware = (opts?: { apiGateway?: boolean }) => {
  const onError: middy.MiddlewareFunction<any, any> = async (handler) => {
    // 1. check if the error was due to a bad request from the user. if it was, just return the error object, so its not reported as our lambda breaking in aws cloudwatch
    if (handler.error instanceof BadRequestError) {
      // determine how to format the response, based on whether the response is for api gateway or standard invocation
      const response = opts?.apiGateway
        ? {
            statusCode: 400,
            body: {
              errorMessage: handler.error.message,
              errorType: 'BadRequestError',
            },
          }
        : {
            errorMessage: handler.error.message,
            errorType: 'BadRequestError',
            stackTrace: handler.error.stack,
          };

      // report the error to the user in the response
      handler.response = response; // eslint-disable-line no-param-reassign

      // and return nothing so that middy knows we handled the error -> so no one tells cloudwatch about the error
      return;
    }

    // 2. since the error was not due to bad input, do nothing; it will be treated like a lambda invocation error that we will see in cloudwatch
    // eslint-disable-next-line consistent-return
    return handler.error; // return error to pass it up the chain, since we're not handling it here
  };
  return {
    onError,
  };
};
