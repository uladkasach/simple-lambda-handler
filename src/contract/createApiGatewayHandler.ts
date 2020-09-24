import { APIGatewayEventRequestContext } from 'aws-lambda';

import middy from '@middy/core';
import httpCors from '@middy/http-cors';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpSecurityHeaders from '@middy/http-security-headers';

import { badRequestErrorMiddleware } from '../logic/middlewares/badRequestErrorMiddleware';
import { internalServiceErrorMiddleware } from '../logic/middlewares/internalServiceErrorMiddleware';
import { ioLoggingMiddleware } from '../logic/middlewares/ioLoggingMiddleware';
import { joiEventValidationMiddleware } from '../logic/middlewares/joiEventValidationMiddleware';
import { EventSchema, HandlerLogic, LogMethods } from '../model/general';

export type ApiGatewayHandlerLogic = HandlerLogic<
  { httpMethod: any; headers: any; body: any },
  { statusCode: 200; body: any },
  APIGatewayEventRequestContext
>;

const corsInputToCorsConfig = (cors?: boolean | { origins: string[] }) => {
  const corsConfig = cors === true ? undefined : cors; // `cors` is either the config object, or just a `true`. if not `true`, then it must be config
  const corsDefaults = { credentials: true };
  return { ...corsDefaults, ...corsConfig };
};

export const createApiGatewayHandler = ({
  log,
  schema,
  logic,
  cors = false,
}: {
  logic: ApiGatewayHandlerLogic;
  schema: EventSchema; // for event validation
  log: LogMethods; // for standard logging
  cors?: boolean | { origins: string[] }; // for returning coors if desired; allows a subset of `httpCors` options
}) => {
  const middlewares = [
    badRequestErrorMiddleware({ apiGateway: true }), // handle BadRequestErrors appropriately (i.e., dont log it as an error, but report to the user what failed)
    internalServiceErrorMiddleware({ logError: log.error, apiGateway: true }), // log that we had an error loudly and cast it into a standard response
    ...(cors ? [httpCors(corsInputToCorsConfig(cors))] : []), // adds cors headers to response, if cors was requested
    httpSecurityHeaders(), // adds best practice headers to the request; (!) note, also handles any uncaught errors to return them as statusCode: 500 responses
    ioLoggingMiddleware({ logDebug: log.debug }), // log the input and output to the lambda, for debugging
    httpJsonBodyParser(), // converts JSON body to object, when present; throws UnprocessableEntity (422 errors) for malformed json
    joiEventValidationMiddleware({ schema }), // validate the input against a schema
  ];
  return middy(
    logic as any, // as any, since ApiGatewayHandlerLogic uses the, correctly, `APIGatewayEventRequestContext` - while middy expects the normal `Context` only (https://github.com/middyjs/middy/issues/540)
  ).use(middlewares);
};
