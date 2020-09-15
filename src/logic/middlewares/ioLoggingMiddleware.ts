import middy from '@middy/core';
import { LogMethods } from '../../model/general';

/**
 * ioLoggingMiddleware simply logs a debug message for the input and output of a lambda
 */
export const ioLoggingMiddleware = ({ logDebug }: { logDebug: LogMethods['debug'] }) => {
  const before: middy.MiddlewareFunction<any, any> = async (handler) => {
    logDebug('handler.input', { event: handler.event });
  };
  const after: middy.MiddlewareFunction<any, any> = async (handler) => {
    logDebug('handler.output', { response: handler.response });
  };
  const onError: middy.MiddlewareFunction<any, any> = async (handler) => {
    // if there is a response, we must have handled the error already, so just log debug w/ response
    if (handler.response) {
      logDebug('handler.output', { response: handler.response });
      return handler.error; // return error to pass it up the chain, since we're not handling it here
    }

    // if no response, then never handled, log the error
    logDebug('handler.output', { errorMessage: handler.error.message, stackTrace: handler.error.stack });
    return handler.error; // return error to pass it up the chain, since we're not handling it here
  };
  return {
    before,
    after,
    onError,
  };
};
