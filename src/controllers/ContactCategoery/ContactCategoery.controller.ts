// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import ContactCategoeryService from "../../services/ContactCategoery/ContactCategoery.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class ContactCategoeryController {
  async Create(req: Request, res: Response, next: NextFunction) {
    const contactCategoeryService = new ContactCategoeryService();
    try {
      if (req.body.categoery && req.body.user_id) {
        let isCreated = await contactCategoeryService.insert(req.body);
        res.status(HttpStatus.OK).send({ success: true, message: "Categoery created successfuly" });
      } else {
        res.status(HttpStatus.BAD_REQUEST).send({ success: false, message: "Invalild data" });
      }
    } catch (err) {
      // let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetch(req: Request, res: Response, next: NextFunction) {
    const contactCategoeryService = new ContactCategoeryService();
    try {
      if (req.query.user_id) {
        let isCreated = await contactCategoeryService.getByUserId(req.query);
        res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
      }else{
        res.status(HttpStatus.BAD_REQUEST).send({ success: false, message: "Invalild data" });
      }
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetchById(req: Request, res: Response, next: NextFunction) {
    const contactCategoeryService = new ContactCategoeryService();
    try {
      if (req.query.id) {
        let isCreated = await contactCategoeryService.getByid(req.query); 
        res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
      }else{
        res.status(HttpStatus.BAD_REQUEST).send({ success: false, message: "Invalild data" });
      }

    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  } 

  async update(req: Request, res: Response, next: NextFunction) {
    const contactCategoeryService = new ContactCategoeryService();
    try {
      if (req.body.id) {
        let isCreated = await contactCategoeryService.update(req.body);
        res.status(HttpStatus.OK).send({ success: true, message: "Data is update", data: isCreated });
      }else{
        res.status(HttpStatus.BAD_REQUEST).send({ success: false, message: "Invalild data" });
      }
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  // async delete(req: Request, res: Response, next: NextFunction){
  //       const contactCategoeryService = new ContactCategoeryService();
  //       try {
  //         console.log(" req.body.id ",req.query.id);
  //         let isCreated = await contactCategoeryService.delete(req.query.id);
  //         res.status(HttpStatus.OK).send({ success: true, message: "Delete successfully", data: isCreated });
  //       } catch (err) {
  //         return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
  //       }
  // }

}