// Third parties
import { Request, Response, NextFunction } from "express";
import * as HttpStatus from 'http-status-codes';

// services
import { CommonService } from "../services/common.service";

// locals
import errors from "../assets/i18n/en/errors";
import { sendFailureResponse } from "../commonFunction/Utills";
import { throwAnError } from "../commonFunction/throwAnError";
import * as uploadFile from '../commonFunction/fileUpload';

export default class QuoteMiddleware {
    constructor() { }

    async isOrderOwner(req: Request, res: Response, next: NextFunction) {
        try {
            const commonSer = new CommonService('orders');
            const { 0: order } = await commonSer.getByOptions({
                where: { id: req.body.order_id },
                relations: ['orderRef']
            });
            if (order.orderRef.user_id != req.user.id) {
                return sendFailureResponse(errors.NO_ORDER_FOUND, HttpStatus.BAD_REQUEST, false, res);
            } return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async hasFile(req: Request, res: Response, next: NextFunction) {
        try {
            const file = req.file;
            if (!file) {
                return sendFailureResponse(errors.NO_FILE_ATTACHED, HttpStatus.BAD_REQUEST, false, res);
            } else {
                const fileError = uploadFile.validatePdf(file);
                if (fileError.length > 0) throw fileError;
            } return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async doesProjectExists(req: Request, res: Response, next: NextFunction) {
        try {
            let where: any = { id: req.body.project_id, user_id: req.user.id };
            if (req.user.user_role == '2') {
                where = { id: req.body.project_id };
            }
            const commonSer: any = new CommonService('project');
            const { 0: project } = await commonSer.getByOptions({ where });
            if (!project) throw errors.NO_PROJECT_FOUND;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

}