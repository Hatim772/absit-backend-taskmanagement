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


export default class ProjectMiddleware {
    constructor() { }

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
            if(req.user.user_role == '2'){
                where = { id: req.body.project_id };
            }
            const commonSer: any = new CommonService('project');
            const { 0: project } = await commonSer.getByOptions({where});
            if (!project) throw errors.NO_PROJECT_FOUND;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async isProjectFileOwner(req: Request, res: Response, next: NextFunction) {
        try {
            let where: any = { id: req.body.project_file_id, user_id: req.user.id };
            const commonSer: any = new CommonService('projectFiles');
            const { 0: projectFile } = await commonSer.getByOptions({where});
            if (!projectFile) throw errors.NO_PROJECT_FILE;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

}