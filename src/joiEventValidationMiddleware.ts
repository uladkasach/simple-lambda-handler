import Joi from 'joi';

import middy from '@middy/core';

import { BadRequestError } from './badRequestErrorMiddleware';

interface EventValidationErrorDetail {
  message: string;
  path: string;
  type: string;
}
class EventValidationError extends BadRequestError {
  public details: EventValidationErrorDetail[];
  public event: any;

  constructor({ error, event }: { error: Joi.ValidationError; event: any }) {
    const details = error.details.map((detail) => ({
      message: detail.message,
      path: detail.path.join('.'),
      type: detail.type,
    }));

    const message = `
Errors on ${Object.keys(details).length} properties were found while validating properties for lambda invocation event:
${JSON.stringify(details, null, 2)}

Event:
${JSON.stringify(event, null, 2)}
    `.trim();
    super(message);

    this.details = details;
    this.event = event;
  }
}

export const joiEventValidationMiddleware = ({ schema }: { schema: Joi.ObjectSchema | Joi.AnySchema }) => {
  const before: middy.MiddlewareFunction<any, any> = async (handler) => {
    // validate the event
    const result = schema.validate(handler.event);

    // if event is invalid, throw error
    if (result.error) throw new EventValidationError({ error: result.error, event: handler.event });
  };
  return {
    before,
  };
};
