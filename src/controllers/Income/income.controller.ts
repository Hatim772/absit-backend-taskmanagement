// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import IncomeService from "../../services/income/income.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class incomeController {
  async Create(req: Request, res: Response, next: NextFunction) {
    const incomeService = new IncomeService();
    try {

      let isCreated = await incomeService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Task created successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetch(req: Request, res: Response, next: NextFunction) {
    const incomeService = new IncomeService();
    try {
      let isCreated = await incomeService.getByUserId(req.query.user_id);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetchById(req: Request, res: Response, next: NextFunction) {
    const incomeService = new IncomeService();
    try {
      let isCreated = await incomeService.getByid(req.query);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  } 

  async update(req: Request, res: Response, next: NextFunction) {
    const incomeService = new IncomeService();
    try {
      let isCreated = await incomeService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction){
        const incomeService = new IncomeService();
        try {
          let isCreated = await incomeService.delete(req.body);
          res.status(HttpStatus.OK).send({ success: true, message: "Delete successfully", data: isCreated });
        } catch (err) {
          return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
        }
  }

}