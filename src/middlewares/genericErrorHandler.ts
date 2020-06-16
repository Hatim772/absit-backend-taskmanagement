import * as HttpStatus from 'http-status-codes';
import { Request, Response, NextFunction } from 'express';
import { sendFailureResponse, sendSuccessResponse } from '../commonFunction/Utills';
import * as constant from '../commonFunction/const';
import config from '../config/config';

import { Logger } from '../utils/logger';
const { errors } = config;
/**
 * Generic error response middleware for internal server errors.
 *
 * @param  {any} err
 * @param  {Request} req
 * @param  {Response} res
 * @param  {NextFunction} next
 * @returns void
 */
export default function genericErrorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  const logger = new Logger(__filename);
  logger.error(`Error: ${JSON.stringify(err)}`);

  const errCode = err.status || err.code || 500;
  let errorMsg = '';

  if (err.errorObj) {
    errorMsg = err.errorObj ? err.errorObj.message + ' ' + (err.errorObj.detail || '') : err.message;
  }

  if (err.errorsArray) {
    errorMsg = err.errorsArray.map((e: any) => e.param + ': ' + e.msg).toString();
  }

  if (errorMsg.length < 1) {
    errorMsg = err.message;
  }

  res.status((errCode)).json({
    success: false,
    code: errCode,
    message: errorMsg
  });
}

/**
 * Validate POST method content type validation
 */
export function validateContentType(req: Request, res: Response, next: NextFunction) {
  let contype = req.headers['content-type'];
  if (!contype || contype.indexOf('application/json')) {
    return sendSuccessResponse(errors.INVALID_CONTENT_TYPE_MESSAGE, HttpStatus.BAD_REQUEST, false, res);
  } else {
    next();
  }
}