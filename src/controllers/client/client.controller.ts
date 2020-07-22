// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import ClientService from "../../services/client/client.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class clientController {
  async clientCreateHandler(req: Request, res: Response, next: NextFunction) {
    const clientService = new ClientService();
    try {
      let projectCreateDataIs = _.pick(req.body, [
        'user_id',
        'client_name',
        'email',
        'mobile_no',
        'categeory'
      ]);
      // projectCreateDataIs = JSON.parse(JSON.stringify(projectCreateDataIs));
      let isCreated = await clientService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Client added successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async clientfetch(req: Request, res: Response, next: NextFunction) {
    const clientService = new ClientService();
    try {
      let isCreated = await clientService.getByUserId(req.query.user_id);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetchClientById(req: Request, res: Response, next: NextFunction) {
    const clientService = new ClientService();
    try {
      let isCreated = await clientService.getById(req.query.client_id);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async clientUpdate(req: Request, res: Response, next: NextFunction) {
    const clientService = new ClientService();
    try {
      let isCreated = await clientService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data update"});
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }




}