import Joi from 'joi';
import { Context } from 'aws-lambda';

export type HandlerLogic<I, O, C = Context> = (event: I, context: C) => Promise<O>;

export type EventSchema = Joi.ObjectSchema | Joi.AnySchema;

export interface LogMethods {
  debug: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
}
