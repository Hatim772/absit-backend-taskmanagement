// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import  ProjCreatectService  from "../../services/projectCreate/projectCreate.service";
import ClientBriefService from "../../services/clientBrief/clientBrief.service";

import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class projectCreateController {
  async projectCreateHandler(req: Request, res: Response, next: NextFunction) {
    const projCreatectService = new ProjCreatectService();
  try {
      let isCreated = await projCreatectService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Project created successfuly" });
  }catch (err){
    // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
    return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
  }
}

async projectCreatefetch(req: Request, res: Response, next: NextFunction) {
  const projCreatectService = new ProjCreatectService();
  const clientBriefService = new ClientBriefService();

try {
    let isCreated = await projCreatectService.getByUserId(req.query.user_id);
    let isCreated2 = await clientBriefService.getByUserId(req.query);
    for (let i = 0; i < isCreated.length; i++) {
      for (let j = 0; j < isCreated2.length; j++) {
          if(isCreated[i].id == isCreated2[j].project_id){
            isCreated[i].design = isCreated2[j].project_image;
            isCreated[i].budget = isCreated2[j].budget;
            isCreated[i].timeline = isCreated2[j].timeline;
          }else{
              isCreated[i].design = null;
              isCreated[i].budget = null;
              isCreated[i].timeline = null;
          }
      }
    }
    res.status(HttpStatus.OK).send({ success: true, message: "Data found" , data : isCreated});
}catch (err){
  return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
}


}




}