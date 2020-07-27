// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import ExpenceService from "../../services/expence/expence.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class incomeController {
  async Create(req: Request, res: Response, next: NextFunction) {
    const expenceService = new ExpenceService();
    try {

      let isCreated = await expenceService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Income created successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetch(req: Request, res: Response, next: NextFunction) {
    const expenceService = new ExpenceService();
    try {
      let isCreated = await expenceService.getByUserId(req.query);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetchById(req: Request, res: Response, next: NextFunction) {
    const expenceService = new ExpenceService();
    try {
      let isCreated = await expenceService.getByid(req.query); 
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  } 

  async update(req: Request, res: Response, next: NextFunction) {
    const expenceService = new ExpenceService();
    try {
      let isCreated = await expenceService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data is update", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction){
        const expenceService = new ExpenceService();
        try {
          console.log(" req.body.id ",req.query.id);
          let isCreated = await expenceService.delete(req.query.id);
          res.status(HttpStatus.OK).send({ success: true, message: "Delete successfully", data: isCreated });
        } catch (err) {
          return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
        }
  }

}