import { Context, Handler } from 'aws-lambda';

/**
 * strip down event, like normal request would
 *
 * (e.g., remove any "Class" or non stringifiable data on the event. Only things representable as JSON are sent over the wire)
 */
const stripInvocationEvent = (event: any) => JSON.parse(JSON.stringify(event));

/**
 * to make it easy to invoke your lambdas, swapping callback syntax to promise syntax
 */
export const promiseHandlerInvocation = async <E, R extends any>({
  event,
  context = {},
  handler,
}: {
  event: E;
  context?: Record<string, any>;
  handler: Handler;
}): Promise<R> =>
  new Promise((resolve, reject) => {
    handler(
      stripInvocationEvent(event),
      context as Context, // cast "as Context", since Context could have more keys than the ones defined here. also, if there is less, for usage to invoke handler functions there is no con
      (error: any, result: R) => {
        if (error) return reject(error);
        return resolve(result);
      },
    );
  });
