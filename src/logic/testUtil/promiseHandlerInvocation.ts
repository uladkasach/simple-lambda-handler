import { Context, Handler } from 'aws-lambda';

/*
  testing utils
*/
const testContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: '__functionName__',
  functionVersion: '__functionVersion__',
  invokedFunctionArn: '__invokedFunctionArn__',
  memoryLimitInMB: 512,
  awsRequestId: '__awsRequestId__',
  logGroupName: '__logGroupName__',
  logStreamName: '__logStreamName__',

  getRemainingTimeInMillis: () => 12,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

/**
 * strip down event, like normal request would
 *
 * (e.g., remove any "Class" or non stringifiable data on the event. Only things representable as JSON are sent over the wire)
 */
const stripInvocationEvent = (event: any) => JSON.parse(JSON.stringify(event));

/**
 * to make it easy to invoke your lambdas, swapping callback syntax to promise syntax
 */
export const promiseHandlerInvocation = async <E, R extends any>({ event, handler }: { event: E; handler: Handler }): Promise<R> =>
  new Promise((resolve, reject) => {
    handler(stripInvocationEvent(event), testContext, (error: any, result: R) => {
      if (error) return reject(error);
      return resolve(result);
    });
  });
