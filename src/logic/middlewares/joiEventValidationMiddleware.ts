import Joi from 'joi';

import middy from '@middy/core';

import { validateAgainstSchema } from '../validation/validateAgainstSchema';

export const joiEventValidationMiddleware = ({ schema }: { schema: Joi.ObjectSchema | Joi.AnySchema }) => {
  const before: middy.MiddlewareFunction<any, any> = async (handler) => validateAgainstSchema({ event: handler.event, schema });
  return {
    before,
  };
};
