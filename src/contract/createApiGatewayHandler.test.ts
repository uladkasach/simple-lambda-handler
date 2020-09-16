import { Context } from 'aws-lambda';
import Joi from 'joi';

import middy from '@middy/core';

import { BadRequestError } from '../logic/middlewares/badRequestErrorMiddleware';
import { promiseHandlerInvocation } from '../logic/testUtil/promiseHandlerInvocation';
import { createApiGatewayHandler } from './createApiGatewayHandler';

describe('createApiGatewayHandler', () => {
  beforeEach(() => jest.resetAllMocks());
  let exampleHandler: middy.Middy<any, any, Context>;
  it('should be possible to instantiate a handler', () => {
    exampleHandler = createApiGatewayHandler({
      logic: async (event: { body: { throwInternalError: boolean; throwBadRequestError: boolean } }) => {
        if (event.body.throwInternalError) throw new Error('internal service error');
        if (event.body.throwBadRequestError) throw new BadRequestError('bad request');
        return { statusCode: 200, body: 'success' };
      },
      schema: Joi.object().keys({
        httpMethod: Joi.string().required(),
        body: Joi.object()
          .keys({
            // expects body to be an object, which is ok, because we serialize json bodies before validating
            throwInternalError: Joi.boolean().required(),
            throwBadRequestError: Joi.boolean().required(),
          })
          .required(),
      }),
      log: {
        debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
        error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
      },
      cors: true,
    });
  });
  describe('successful invocations', () => {
    it('should return result of handler', async () => {
      const result = await promiseHandlerInvocation({
        event: { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: false } },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({ statusCode: 200, body: 'success' });
    });
    it('should log input and output', async () => {
      const consoleLogMock = jest.spyOn(console, 'log');
      const event = { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: false } };
      await promiseHandlerInvocation({
        event,
        handler: exampleHandler,
      });
      expect(consoleLogMock).toHaveBeenCalledTimes(2);
      expect(consoleLogMock).toHaveBeenNthCalledWith(1, 'handler.input', { event });
      expect(consoleLogMock).toHaveBeenNthCalledWith(
        2,
        'handler.output',
        expect.objectContaining({
          response: expect.objectContaining({
            body: 'success',
            statusCode: 200,
          }),
        }),
      );
    });
  });
  describe('error handling', () => {
    it('should return an error response, without details, to api gateway when an internal server error occurs', async () => {
      /**
       * without details because we dont want to risk leaking details.
       *
       * NOTE: this is different to the standard handler as the standard handler actually throws, in order to register as an error in cloudwatch.
       *  In this case though, API Gateway does that for us because we still need to share _a_ response with the user
       */
      const result = await promiseHandlerInvocation({
        event: { httpMethod: 'POST', body: { throwInternalError: true, throwBadRequestError: false } },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({ statusCode: 500 });
      expect(result).not.toHaveProperty('body'); // no body -> without details
    });
    it('should log a warning when an error occurs', async () => {
      const consoleWarnMock = jest.spyOn(console, 'warn');
      await promiseHandlerInvocation({
        event: { httpMethod: 'POST', body: { throwInternalError: true, throwBadRequestError: false } },
        handler: exampleHandler,
      });
      expect(consoleWarnMock).toHaveBeenCalledTimes(1);
      expect(consoleWarnMock).toHaveBeenNthCalledWith(1, 'handler.error', expect.objectContaining({ errorMessage: 'internal service error' }));
    });
    it('should return an error response, with details, to api gateway when a bad request error occurs', async () => {
      /**
       * with details because we want to help the user unblock themselves
       * - and since its a `BadRequestError` that means that we thought about the message to return
       */
      const result = await promiseHandlerInvocation({
        event: { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: true } },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({ statusCode: 400 });
      expect(result).toHaveProperty('body');
      expect(result.body).toMatchObject({ errorMessage: 'bad request', errorType: 'BadRequestError' });
    });
    it('should not log a warning if a BadRequestError occurs', async () => {
      const consoleWarnMock = jest.spyOn(console, 'warn');
      await promiseHandlerInvocation({
        event: { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: true } },
        handler: exampleHandler,
      });
      expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    });
  });
  describe('cors', () => {
    it('should return correct cors headers when cors is requested - successful response', async () => {
      const result = await promiseHandlerInvocation({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { throwInternalError: false, throwBadRequestError: false },
        },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({
        headers: {
          'Access-Control-Allow-Origin': '*', // Tells browser that all these origins are accepted; TODO: update to support an 'allowlist' of origins, to make it more secure (E.g., `ahbode.com`, `localhost:3000`, `192.168...`)
          'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
        },
      });
    });
    it('should return correct cors headers when cors is requested - error response', async () => {
      const result = await promiseHandlerInvocation({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { throwInternalError: true, throwBadRequestError: false },
        },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({
        headers: {
          'Access-Control-Allow-Origin': '*', // Tells browser that all these origins are accepted; TODO: update to support an 'allowlist' of origins, to make it more secure (E.g., `ahbode.com`, `localhost:3000`, `192.168...`)
          'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
        },
      });
    });
  });
  describe('validation', () => {
    it('should not throw an error when the validation schema expects the body property to be an object, since it should be serialized before validation', async () => {
      const result = await promiseHandlerInvocation({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { throwInternalError: false, throwBadRequestError: false },
        },
        handler: exampleHandler,
      });
      expect(result.statusCode).toEqual(200); // sanity check that it succeeded
    });
    it('should throw an error if the parsed body object does not match validation, which should be returned as an httpError response', async () => {
      const result = await promiseHandlerInvocation({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { something: 'unexpected' },
        },
        handler: exampleHandler,
      });
      expect(result.statusCode).toEqual(400); // should return as a BadRequestError
    });
  });
});
