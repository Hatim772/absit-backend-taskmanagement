// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import  ProjCreatectService  from "../../services/projectCreate/projectCreate.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class projectCreateController {
  async projectCreateHandler(req: Request, res: Response, next: NextFunction) {
    const projCreatectService = new ProjCreatectService();
  try {
      let projectCreateDataIs = _.pick(req.body, [
          'user_id',
          'project_image',
          'project_name',
      ]);
      let isCreated = await projCreatectService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Project created successfuly" });
  }catch (err){
    // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
    return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
  }
}

async projectCreatefetch(req: Request, res: Response, next: NextFunction) {
  const projCreatectService = new ProjCreatectService();
try {
    // let projectCreateDataIs = _.pick(req.body, [
    //     'user_id',
    //     'project_image',
    //     'project_name',
    // ]);
    let isCreated = await projCreatectService.getByUserId(req.body);
    res.status(HttpStatus.OK).send({ success: true, message: "Project created successfuly" });
}catch (err){
  // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
  return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
}
}




}