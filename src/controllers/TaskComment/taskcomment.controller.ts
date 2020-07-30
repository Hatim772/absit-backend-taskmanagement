// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import TaskCommentService from "../../services/taskComments/taskComments.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class taskCommentController {
  async create(req: Request, res: Response, next: NextFunction) {
    const taskCommentService = new TaskCommentService();
    try {
      let file: any = req.file;

      console.log("  ==  ",file);      
      let isCreated = await taskCommentService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Task created successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetch(req: Request, res: Response, next: NextFunction) {
    const taskCommentService = new TaskCommentService();
    try {
      let isCreated = await taskCommentService.getByUserId(req.query.user_id);

      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }


  async update(req: Request, res: Response, next: NextFunction) {
    const taskCommentService = new TaskCommentService();
    try {
      let isCreated = await taskCommentService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

}