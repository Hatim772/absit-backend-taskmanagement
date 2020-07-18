// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import TaskService from "../../services/task/task.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class taskController {
  async taskCreate(req: Request, res: Response, next: NextFunction) {
    const taskService = new TaskService();
    try {
      // let projectCreateDataIs = _.pick(req.body, [
      //   'user_id',
      //   'project_image',
      //   'project_name',
      // ]);
      // projectCreateDataIs = JSON.parse(JSON.stringify(projectCreateDataIs));
      let isCreated = await taskService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Task created successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async taskfetch(req: Request, res: Response, next: NextFunction) {
    const taskService = new TaskService();
    try {
      let isCreated = await taskService.getByUserId(req.query.user_id);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async taskAccordingProjectFetch(req: Request, res: Response, next: NextFunction) {
    const taskService = new TaskService();
    try {
      let isCreated = await taskService.getByUserIdandProjectid(req.query);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  } 

  async taskUpdate(req: Request, res: Response, next: NextFunction) {
    const taskService = new TaskService();
    try {
      let isCreated = await taskService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

}