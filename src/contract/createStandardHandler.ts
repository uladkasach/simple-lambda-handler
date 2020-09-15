import middy from '@middy/core';

import { badRequestErrorMiddleware } from '../logic/middlewares/badRequestErrorMiddleware';
import { ioLoggingMiddleware } from '../logic/middlewares/ioLoggingMiddleware';
import { joiEventValidationMiddleware } from '../logic/middlewares/joiEventValidationMiddleware';
import { EventSchema, HandlerLogic, LogMethods } from '../model/general';
import { internalServiceErrorMiddleware } from '../logic/middlewares/internalServiceErrorMiddleware';

export const createStandardHandler = ({
  logic,
  schema,
  log,
}: {
  logic: HandlerLogic<any, any>;
  schema: EventSchema; // for event validation
  log: LogMethods; // for standard logging
}) => {
  return middy(logic)
    .use(badRequestErrorMiddleware()) // return an error object, instead of the lambda throwing an error, if it is a "bad request error"
    .use(internalServiceErrorMiddleware({ logError: log.error })) // log that we had an error loudly, if we had an error
    .use(ioLoggingMiddleware({ logDebug: log.debug })) // log the input and output to the lambda, for debugging
    .use(joiEventValidationMiddleware({ schema })); // validate the input against a schema
};
