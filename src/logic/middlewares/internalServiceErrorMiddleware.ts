import middy from '@middy/core';

import { LogMethods } from '../../model/general';
import { BadRequestError } from './badRequestErrorMiddleware';

/**
 * as documented in `./badRequestErrorMiddleware.ts`, all errors that are not `BadRequestError` are `InternalServiceError`
 *
 * because of this, there is no need to explicitly distinguish an `InternalServiceError` class. By not being a `BadRequestError`, it is an InternalServiceError
 */

export const internalServiceErrorMiddleware = ({ logError, apiGateway }: { logError: LogMethods['error']; apiGateway?: boolean }) => {
  const onError: middy.MiddlewareFunction<any, any> = async (handler) => {
    // 1. check if the error was due to a bad request from the user. if it was, then do nothing - as this was not an internal service error
    if (handler.error instanceof BadRequestError) return handler.error; // return error to pass it up the chain, since we're not handling it here

    // 2. log the error
    logError('handler.error', { errorMessage: handler.error.message, stackTrace: handler.error.stack });

    // 3. if we're in the api gateway context, then we want to handle this error and return a standard api gateway response for it
    if (apiGateway) {
      // build the response object
      const response = {
        statusCode: 500,
        // note: we dont include any error message or details, as we dont want to leak secrets or internal info for internal service errors
      };

      // set the response
      handler.response = response; // eslint-disable-line no-param-reassign

      // and return nothing so that middy knows we handled the error -> so no one tells cloudwatch about the error
      return; // eslint-disable-line consistent-return, no-useless-return
    }

    // 4. if we didn't handle the error above, then the error will be unhandled
    return handler.error; // return error to pass it up the chain, since we're not handling it here
  };
  return {
    onError,
  };
};
