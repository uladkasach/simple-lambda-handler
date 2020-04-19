import { Context } from 'aws-lambda';
import Joi from 'joi';

import middy from '@middy/core';

import { BadRequestError } from './badRequestErrorMiddleware';
import { createStandardHandler } from './createStandardHandler';
import { promiseLambdaInvocation } from './testUtil/promiseLambdaInvocation';

describe('createStandardHandler', () => {
  beforeEach(() => jest.clearAllMocks());
  let exampleHandler: middy.Middy<any, unknown, Context>;
  it('should be possible to instantiate a handler', () => {
    exampleHandler = createStandardHandler({
      logic: async (event: { throwInternalError: boolean; throwBadRequestError: boolean }) => {
        if (event.throwInternalError) throw new Error('internal service error');
        if (event.throwBadRequestError) throw new BadRequestError('bad request');
        return 'success';
      },
      schema: Joi.object().keys({ throwInternalError: Joi.boolean().required(), throwBadRequestError: Joi.boolean().required() }),
      log: {
        debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
        error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
      },
    });
  });
  it('should be possible to get the result of a handler', async () => {
    const result = await promiseLambdaInvocation({
      event: { throwInternalError: false, throwBadRequestError: false },
      handler: exampleHandler,
    });
    expect(result).toEqual('success');
  });
  it('should log the input and output of a lambda', async () => {
    const consoleLogMock = jest.spyOn(console, 'log');
    const event = { throwInternalError: false, throwBadRequestError: false };
    await promiseLambdaInvocation({
      event,
      handler: exampleHandler,
    });
    expect(consoleLogMock).toHaveBeenCalledTimes(2);
    expect(consoleLogMock).toHaveBeenNthCalledWith(1, 'invocation start', { event });
    expect(consoleLogMock).toHaveBeenNthCalledWith(2, 'invocation end', { response: 'success' });
  });
  it('should log an error, if an error was thrown', async () => {
    const consoleWarnMock = jest.spyOn(console, 'warn');
    try {
      await promiseLambdaInvocation({
        event: { throwInternalError: true, throwBadRequestError: false },
        handler: exampleHandler,
      });
      throw new Error('should not reach here');
    } catch (error) {
      expect(error.message).toContain('internal service error');
      expect(consoleWarnMock).toHaveBeenCalledTimes(1);
      expect(consoleWarnMock).toHaveBeenNthCalledWith(1, 'invocation end', expect.objectContaining({ errorMessage: 'internal service error' }));
    }
  });
  it('should not report BadRequestErrors as lambda invocation errors and should not log them as an error either', async () => {
    const consoleLogMock = jest.spyOn(console, 'log');
    const consoleWarnMock = jest.spyOn(console, 'warn');
    const result = await promiseLambdaInvocation({
      event: { throwInternalError: false, throwBadRequestError: true },
      handler: exampleHandler,
    });
    expect(result).toMatchObject({ errorMessage: 'bad request' });
    expect(consoleWarnMock).not.toHaveBeenCalled();
    expect(consoleLogMock).toHaveBeenCalledTimes(2); // start and end
  });
  it('should return a BadRequestError when joi event validation fails', async () => {
    const result = await promiseLambdaInvocation({
      event: { bananas: true },
      handler: exampleHandler,
    });
    expect(result.errorMessage).toContain('Errors on 1 properties were found while validating properties for lambda invocation event');
  });
});
