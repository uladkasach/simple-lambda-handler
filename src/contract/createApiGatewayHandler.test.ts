import { Context } from 'aws-lambda';
import Joi from 'joi';
import { invokeHandlerForTesting } from 'simple-lambda-testing-methods';

import middy from '@middy/core';

import { BadRequestError } from '../logic/middlewares/badRequestErrorMiddleware';
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
        headers: Joi.object(),
        body: Joi.object()
          .keys({
            // expects body to be an object, which is ok, because we serialize json bodies before validating
            throwInternalError: Joi.boolean().required(),
            throwBadRequestError: Joi.boolean().required(),
          })
          .required(),
      }),
      log: {
        // note: we JSON.parse(JSON.stringify((...)) so that the log metadata is accessed by value, not reference (otherwise, expect to have been called with object changes over time, even after the log message results, if mocking or spying on it)
        debug: (message, metadata) => console.log(message, JSON.parse(JSON.stringify(metadata))), // eslint-disable-line no-console
        error: (message, metadata) => console.warn(message, JSON.parse(JSON.stringify(metadata))), //  eslint-disable-line no-console
      },
      cors: true,
    });
  });
  describe('successful invocations', () => {
    it('should return result of handler', async () => {
      const result = await invokeHandlerForTesting({
        event: { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: false } },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({ statusCode: 200, body: '"success"' });
    });
    it('should log input and output', async () => {
      const consoleLogMock = jest.spyOn(console, 'log');
      const event = { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: false } };
      await invokeHandlerForTesting({
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
            body: '"success"',
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
      const result = await invokeHandlerForTesting({
        event: { httpMethod: 'POST', body: { throwInternalError: true, throwBadRequestError: false } },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({ statusCode: 500 });
      expect(result.body).toEqual(undefined); // no body -> without details
    });
    it('should log a warning when an error occurs', async () => {
      const consoleWarnMock = jest.spyOn(console, 'warn');
      await invokeHandlerForTesting({
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
      const result = await invokeHandlerForTesting({
        event: { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: true } },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({ statusCode: 400 });
      expect(result).toHaveProperty('body');
      expect(result.body).toEqual(JSON.stringify({ errorMessage: 'bad request', errorType: 'BadRequestError' }));
    });
    it('should not log a warning if a BadRequestError occurs', async () => {
      const consoleWarnMock = jest.spyOn(console, 'warn');
      await invokeHandlerForTesting({
        event: { httpMethod: 'POST', body: { throwInternalError: false, throwBadRequestError: true } },
        handler: exampleHandler,
      });
      expect(consoleWarnMock).toHaveBeenCalledTimes(0);
    });
  });
  describe('cors', () => {
    it('should return correct cors headers when cors is requested - successful response', async () => {
      const result = await invokeHandlerForTesting({
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
      const result = await invokeHandlerForTesting({
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
    it('should target the accessControlAllowOrigin to the request.origin, if request.origin is defined', async () => {
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          headers: {
            origin: 'https://www.ahbode.com',
          },
          body: { throwInternalError: false, throwBadRequestError: false },
        },
        handler: exampleHandler,
      });
      expect(result).toMatchObject({
        headers: {
          'Access-Control-Allow-Origin': 'https://www.ahbode.com', // note that it now targets ahbode.com specifically, not '*'
        },
      });
    });
    it('should include cors headers in the io log output', async () => {
      const debugMock = jest.fn();
      const errorMock = jest.fn();
      const handler = createApiGatewayHandler({
        logic: async () => {
          return { statusCode: 200, body: 'success' };
        },
        schema: Joi.object(),
        log: {
          debug: (message, metadata) => debugMock(message, JSON.parse(JSON.stringify(metadata))), // eslint-disable-line no-console
          error: (message, metadata) => errorMock(message, JSON.parse(JSON.stringify(metadata))), //  eslint-disable-line no-console
        },
        cors: true,
      });
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
        },
        handler,
      });
      expect(result.statusCode).toEqual(200);
      expect(result.headers['Access-Control-Allow-Origin']).toEqual('*');
      expect(debugMock).toHaveBeenNthCalledWith(1, 'handler.input', { event: { httpMethod: 'POST' } });
      expect(debugMock).toHaveBeenNthCalledWith(2, 'handler.output', {
        response: {
          statusCode: 200,
          body: '"success"',
          headers: expect.objectContaining({
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Origin': '*',
          }),
        },
      });
      expect(debugMock).toHaveBeenCalledTimes(2);
    });
  });
  describe('validation', () => {
    it('should not throw an error when the validation schema expects the body property to be an object, since it should be serialized before validation', async () => {
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { throwInternalError: false, throwBadRequestError: false },
        },
        handler: exampleHandler,
      });
      expect(result.statusCode).toEqual(200); // sanity check that it succeeded
    });
    it('should throw an error if the parsed body object does not match validation, which should be returned as an httpError response', async () => {
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { something: 'unexpected' },
        },
        handler: exampleHandler,
      });
      expect(result.statusCode).toEqual(400); // should return as a BadRequestError
    });
  });
  describe('headers', () => {
    test('a handler should be able to access the Authorization header of an event payload - which is a common use case for flows using jwt', async () => {
      const handler = createApiGatewayHandler({
        logic: async (event: { headers: { Authorization: string }; body: string }) => ({
          statusCode: 200,
          body: `${event.headers.Authorization}:${event.body}`,
        }),
        schema: Joi.object().keys({
          httpMethod: Joi.string().required(),
          headers: Joi.object()
            .keys({
              Authorization: Joi.string().required(),
            })
            .required()
            .unknown(), // allow other headers, since there always are
          body: Joi.string().required(),
        }),
        log: {
          debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
          error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
        },
      });
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          headers: {
            Authorization: 'Bearer __TOKEN_GOES_HERE__',
          },
          body: 'hello!',
        },
        handler,
      });
      expect(result.body).toEqual('"Bearer __TOKEN_GOES_HERE__:hello!"');
    });
    test('a handler should be able to set custom headers in the response', async () => {
      const handler = createApiGatewayHandler({
        logic: async () => ({
          statusCode: 200,
          headers: {
            'Set-Cookie': 'authorization=__JWT__',
          },
          body: `hello!`,
        }),
        schema: Joi.object().keys({
          body: Joi.string().required(),
        }),
        log: {
          debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
          error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
        },
      });
      const result = await invokeHandlerForTesting({
        event: { body: JSON.stringify({}) },
        handler,
      });
      expect(result.headers).toEqual(
        expect.objectContaining({
          'Set-Cookie': 'authorization=__JWT__',
        }),
      );
    });
  });
  describe('context', () => {
    test('a handler should be able to use context.authorizer.claims - which is a common use case for flows using jwt authorizers', async () => {
      // per https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
      const handler = createApiGatewayHandler({
        logic: async (event: { body: string }, context) => ({
          statusCode: 200,
          body: `${context.authorizer!.claims.sub}:${event.body}`,
        }),
        schema: Joi.object().keys({
          httpMethod: Joi.string().required(),
          body: Joi.string().required(),
        }),
        log: {
          debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
          error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
        },
      });
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: 'hello!',
        },
        context: {
          authorizer: {
            // per the docs, the authorizers spit out the claims here: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
            claims: {
              sub: 'beefbeef-beef-beef-beef-beefbeefbeef', // some user id
            },
          },
        },
        handler,
      });
      expect(result.body).toEqual('"beefbeef-beef-beef-beef-beefbeefbeef:hello!"');
    });
  });
  describe('serialization', () => {
    test('handler serializes the response body', async () => {
      // otherwise, api gateway will throw an error saying "Lambda body contains the wrong type for field "body""
      const handler = createApiGatewayHandler({
        logic: async (event: { body: { throwBadRequestError?: boolean } }) => {
          if (event.body.throwBadRequestError) throw new BadRequestError('you asked for it, bud');
          return {
            statusCode: 200,
            body: { hello: 'there' },
          };
        },
        schema: Joi.object().keys({
          httpMethod: Joi.string().required(),
          body: Joi.string().required(),
        }),
        log: {
          debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
          error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
        },
      });
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: 'hello!',
        },
        handler,
      });
      expect(result.body).toEqual('{"hello":"there"}');
    });
    test('a handler serializes the response body even for bad request errors', async () => {
      // otherwise, api gateway will throw an error saying "Lambda body contains the wrong type for field "body""
      const handler = createApiGatewayHandler({
        logic: async (event: { body: { throwBadRequestError?: boolean } }) => {
          if (event.body.throwBadRequestError) throw new BadRequestError('you asked for it, bud');
          return {
            statusCode: 200,
            body: { hello: 'there' },
          };
        },
        schema: Joi.object().keys({
          httpMethod: Joi.string().required(),
          body: Joi.any(),
        }),
        log: {
          debug: (message, metadata) => console.log(message, metadata), // eslint-disable-line no-console
          error: (message, metadata) => console.warn(message, metadata), //  eslint-disable-line no-console
        },
      });
      const result = await invokeHandlerForTesting({
        event: {
          httpMethod: 'POST', // cors only get set if there is a `httpMethod` in the request
          body: { throwBadRequestError: true },
        },
        handler,
      });
      expect(result.body).toEqual('{"errorMessage":"you asked for it, bud","errorType":"BadRequestError"}');
    });
  });
});
