import { Context } from 'aws-lambda';
import Joi from 'joi';

import middy from '@middy/core';

import { badRequestErrorMiddleware } from './badRequestErrorMiddleware';
import { ioLoggingMiddleware, LogMethods } from './ioLoggingMiddleware';
import { joiEventValidationMiddleware } from './joiEventValidationMiddleware';

type HandlerLogic = (event: any, context?: Context) => any;
type EventSchema = Joi.ObjectSchema | Joi.AnySchema;

export const createStandardHandler = ({
  logic,
  schema,
  log,
}: {
  logic: HandlerLogic;
  schema: EventSchema; // for event validation
  log: LogMethods; // for standard logging
}) => {
  return middy(logic).use(badRequestErrorMiddleware()).use(ioLoggingMiddleware({ log })).use(joiEventValidationMiddleware({ schema }));
};
