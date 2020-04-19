import middy from '@middy/core';

export interface LogMethods {
  debug: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
}
export const ioLoggingMiddleware = ({ log }: { log: LogMethods }) => {
  const before: middy.MiddlewareFunction<any, any> = async (handler) => {
    log.debug('invocation start', { event: handler.event });
  };
  const after: middy.MiddlewareFunction<any, any> = async (handler) => {
    log.debug('invocation end', { response: handler.response });
  };
  const onError: middy.MiddlewareFunction<any, any> = async (handler) => {
    // if there is a response, we must have handled the error already, so just log debug w/ response
    if (handler.response) {
      log.debug('invocation end', { response: handler.response });
      return handler.error;
    }

    // if no response, then never handled, log the error
    log.error('invocation end', { errorMessage: handler.error.message, stackTrace: handler.error.stack });
    return handler.error; // return error to pass it up the chain, since we're not handling it here
  };
  return {
    before,
    after,
    onError,
  };
};
