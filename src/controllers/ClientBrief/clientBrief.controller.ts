// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import ClientBriefService from "../../services/clientBrief/clientBrief.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class ClientBriefController {
  async clientBriefHandler(req: Request, res: Response, next: NextFunction) {
    const clientBriefService = new ClientBriefService();
    try {
      let clientBriefDataIs = _.pick(req.body, [
        'user_id',
        'project_image',
        'project_name',
      ]);
      // clientBriefDataIs = JSON.parse(JSON.stringify(clientBriefDataIs));
      let isCreated = await clientBriefService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Client Brief created successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async clientBrieffetch(req: Request, res: Response, next: NextFunction) {
    const clientBriefService = new ClientBriefService();
    try {
      let isCreated = await clientBriefService.getByUserId(req.query);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async clientBriefUpdate(req: Request, res: Response, next: NextFunction) {
    const clientBriefService = new ClientBriefService();
    try {
      let isCreated = await clientBriefService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data update", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

}