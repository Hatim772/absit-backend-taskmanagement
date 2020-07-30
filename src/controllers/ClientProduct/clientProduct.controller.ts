// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';
import _ from 'lodash';

import ClientProductService from "../../services/clientProduct/clientProduct.service";
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';


export default class ClientProductController {
  async add(req: Request, res: Response, next: NextFunction) {
    const clientProductService = new ClientProductService();
    try {
		  let file: any = req.file;

      console.log("  ==  ",file);
      console.log("  ==  ",req.body);
      
      // let isCreated = await clientProductService.insert(req.body);
      // res.status(HttpStatus.OK).send({ success: true, message: "Client product created successfuly" ,isCreated :isCreated});
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async fetch(req: Request, res: Response, next: NextFunction) {
    const clientProductService = new ClientProductService();
    try {
      let isCreated = await clientProductService.getByUserId(req.query);
      res.status(HttpStatus.OK).send({ success: true, message: "Data found", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    const clientProductService = new ClientProductService();
    try {
      let isCreated = await clientProductService.update(req.body);
      res.status(HttpStatus.OK).send({ success: true, message: "Data update", data: isCreated });
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.BAD_REQUEST, false, res);
    }
  }

}