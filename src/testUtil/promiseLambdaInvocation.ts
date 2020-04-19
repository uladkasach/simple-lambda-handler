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

interface PromiseLambdaInvocationParams {
  event: any;
  handler: Handler;
}

/**
 * to make it easy to invoke your lambdas, swapping callback syntax to promise syntax
 */
export const promiseLambdaInvocation = async ({ event, handler }: PromiseLambdaInvocationParams): Promise<any> =>
  new Promise((resolve, reject) => {
    handler(event, testContext, (error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
  });
