import { APIGatewayEventRequestContext } from 'aws-lambda';

import middy from '@middy/core';
import httpCors from '@middy/http-cors';
import httpRequestJsonBodyParser from '@middy/http-json-body-parser';
import httpSecurityHeaders from '@middy/http-security-headers';
import httpResponseSerializer from '@middy/http-response-serializer';

import { badRequestErrorMiddleware } from '../logic/middlewares/badRequestErrorMiddleware';
import { internalServiceErrorMiddleware } from '../logic/middlewares/internalServiceErrorMiddleware';
import { ioLoggingMiddleware } from '../logic/middlewares/ioLoggingMiddleware';
import { joiEventValidationMiddleware } from '../logic/middlewares/joiEventValidationMiddleware';
import { EventSchema, HandlerLogic, LogMethods } from '../model/general';

export type ApiGatewayHandlerLogic = HandlerLogic<
  { httpMethod: any; headers: any; body: any },
  { statusCode: 200; headers?: any; body: any },
  APIGatewayEventRequestContext
>;

interface CORSOptions {
  /**
   * Specifies which origins to accept, setting the `Access-Control-Allow-Origin` header.
   *
   * This header notifies clients (i.e., browsers) that this server expects and accounts for cross-origin-requests from specific domains.
   *
   * Requiring the server to "opt-in" to requests from specific origins protects the users from cross-site attacks.
   *  - for example
   *    - an attacker clones your website and publishes it at `evil.attacker.com`
   *      - without CORS, your user's browser would happily send requests to your server from `evil.attacker.com`
   *      - with CORS, your user's browser will see that your server does not expect requests from `evil.attacker.com` and will protect the user
   *
   * You should make the origin as restrictive as possible, to enable the browser to best help users.
   *
   * Special options:
   * - `*`, if set to `*`, the browser will be notified that this server expects requests from all origins, telling the browser that you have considered the cross-site-security concerns that CORS prevents and are ok with the risk
   *
   * Refs:
   * - https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
   */
  origins: '*' | string[];

  /**
   * When true, sets `Access-Control-Allow-Credentials=true` header, telling browsers to send/accept cookies to/from this server.
   *
   * This header notifies clients (i.e., browsers) that this server expects and accounts for cross-origin-request cookies (i.e., credentials) being sent or returned. Requiring the server to "opt-in" to setting and receiving cookies on browsers in cross-site requests protects the user from cross-site attacks.
   *
   * Special considerations:
   * - if the `origins` option is set to `*`, the `Access-Control-Allow-Origin` will be updated to match the request origin. (Browsers do not allow `*` as the origin with credentials turned on)
   *   - https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSNotSupportingCredentials
   *
   * refs
   *  - https://stackoverflow.com/a/24689738/3068233
   */
  withCredentials: boolean;

  /**
   * Specifies which HTTP headers can be used in CORS requests, by setting the `Access-Control-Allow-Headers` header.
   *
   * This response is used by preflight requests.
   *
   * Defaults to `content-type,authorization`
   * - `content-type` is present in most requests
   * - `authorization` is a standard header in JWT based authentication patterns
   */
  headers?: string;
}

const corsInputToCorsConfig = (cors: CORSOptions) => {
  return {
    origin: cors.origins === '*' ? '*' : undefined,
    origins: Array.isArray(cors.origins) ? cors.origins : undefined,
    credentials: cors.withCredentials,
    headers: cors.headers ?? 'content-type,authorization', // default to 'content-type,authorization'
    maxAge: undefined,
    cacheControl: undefined,
  };
};

const serializers = [
  {
    regex: /^application\/json$/,
    serializer: ({ body }: { body: any }) => JSON.stringify(body),
  },
];

export const createApiGatewayHandler = ({
  log,
  schema,
  logic,
  cors,
}: {
  logic: ApiGatewayHandlerLogic;
  schema: EventSchema; // for event validation
  log: LogMethods; // for standard logging
  cors?: CORSOptions; // for returning coors if desired; allows a subset of `httpCors` options
}) => {
  const middlewares = [
    badRequestErrorMiddleware({ apiGateway: true }), // handle BadRequestErrors appropriately (i.e., dont log it as an error, but report to the user what failed)
    internalServiceErrorMiddleware({ logError: log.error, apiGateway: true }), // log that we had an error loudly and cast it into a standard response
    ioLoggingMiddleware({ logDebug: log.debug }), // log the input and output to the lambda, for debugging
    ...(cors ? [httpCors(corsInputToCorsConfig(cors))] : []), // adds cors headers to response, if cors was requested
    httpSecurityHeaders(), // adds best practice headers to the request; (!) note, also handles any uncaught errors to return them as statusCode: 500 responses
    httpRequestJsonBodyParser(), // converts JSON body to object, when present; throws UnprocessableEntity (422 errors) for malformed json
    joiEventValidationMiddleware({ schema }), // validate the input against a schema
    httpResponseSerializer({ serializers, default: 'application/json' }),
  ];
  return middy(
    logic as any, // as any, since ApiGatewayHandlerLogic uses the, correctly, `APIGatewayEventRequestContext` - while middy expects the normal `Context` only (https://github.com/middyjs/middy/issues/540)
  ).use(middlewares);
};
