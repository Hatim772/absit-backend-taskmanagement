// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import  ProjCreatectService  from "../../services/projectCreate/projectCreate.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';

export async function projectCreateHandler(req: Request, res: Response, next: NextFunction) {
    const projCreatectService = new ProjCreatectService();
  try {
    let projectCreateDataIs = _.pick(req.body, [
        'user_id',
        'project_image',
        'project_name',
    ]);
	const iscreated = await projCreatectService.insert(projectCreateDataIs);
    

  }catch (err){
    let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
    return sendFailureResponse(message, HttpStatus.BAD_REQUEST, false, res);
  }
}