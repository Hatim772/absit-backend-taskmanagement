// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import TaskService from "../../services/task/task.service";
import ProjectCreateDetails from "../../services/projectCreate/projectCreate.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class taskController {
  async taskCreate(req: Request, res: Response, next: NextFunction) {
    const taskService = new TaskService();
    try {

      let isCreated = await taskService.insert(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Task created successfuly" });
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async taskfetch(req: Request, res: Response, next: NextFunction) {
    const taskService = new TaskService();
    const projectcreate = new ProjectCreateDetails();
    try {
      let isCreated = await taskService.getByUserId(req.query.user_id);
      let projectts = await projectcreate.getByUserId(req.query.user_id);
      console.log("  projectts",projectts);
      for (let i = 0; i < isCreated.length; i++) {
        for (let j = 0; j < projectts.length; j++) {
              if (isCreated[i].project_id == projectts[j].id) {
                  isCreated[i].project_id =   projectts[j];
                  break;
              }
        }
      }
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