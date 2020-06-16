// third parties
import * as HttpStatus from 'http-status-codes';
import { NextFunction, Request, Response } from 'express';
import moment from 'moment';
import _ from 'lodash';

// locals
import { CommonService } from '../../services/common.service';
import MoodboardService from '../../services/moodboard/moodboard.service';
import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import { throwAnError } from '../../commonFunction/throwAnError';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import * as uploadFile from '../../commonFunction/fileUpload';
import { Not } from 'typeorm';
import { ProjectFiles } from '../../entities/ProjectFiles';


export async function createProject(req: Request, res: Response, next: NextFunction) {
    const commonService = new CommonService('project');
    try {
        // check name for one name for one user
        const ifExisting = await commonService.getByOptions({ where: { user_id: req.user.id, name: req.body.name } });
        if (ifExisting.length > 0) throw errors.PROJECT_NAME_ALREADY_USED;
        const project = await commonService.insert({
            name: req.body.name,
            description: req.body.description,
            address_line1: req.body.address_line1,
            address_line2: req.body.address_line2,
            city: req.body.city,
            pincode: req.body.pincode || null,
            owner: req.body.owner,
            property_type: req.body.property_type,
            layout: req.body.layout,
            area: req.body.area,
            user_id: req.user.id
        });
        return res.status(HttpStatus.OK).send({
            success: true,
            data: { name: project.name, id: project.id }
        });
    } catch (error) {
        throwAnError(error, res);
    }
}

export async function getAllNames(req: Request, res: Response, next: NextFunction) {
    try {
        const commonSer = new CommonService('project');
        const select: Array<string> = ['id', 'name'];
        const data = await commonSer.getByOptions({ where: { user_id: req.user.id }, select });
        res.status(HttpStatus.OK).send({ success: true, data });
    } catch (error) {
        throwAnError(error, res);
    }
}
export async function getProjectWithOrders(req: Request, res: Response, next: NextFunction) {
    try {
        const moodboardSer = new MoodboardService();
        const data: any = await moodboardSer.getProject(req.params.project_id, req.user.id);
        if (data.length < 1) throw errors.NO_PROJECT_DATA_FOUND;
        data.orderRef.map((el: any) => {
            el.order.map((secondEl: any) => {
                if (secondEl.quotationFiles.length > 0) {
                    secondEl.quotationFiles = secondEl.quotationFiles[0].file_url;
                } else {
                    secondEl.quotationFiles = null;
                }
            });
        });
        // making product attributes simplyfied
        data.orderRef.map((el: any) => {
            if (el.product.product_attribute.length > 0) {
                console.log('data.orderRef', el.product.product_attribute);
                el.product.product_attribute = _.without(el.product.product_attribute.map((secEl: any) => {
                    if (secEl.attributes.is_discoverable === "1") {
                        return {
                            attribute: secEl.attributes.name,
                            value: secEl.attribute_value ? secEl.attribute_value.attribute_value : null
                        };
                    } else return 0;
                }), 0);
            }
        });
        // now getting the aqsitbankdetails
        const commonService = new CommonService('AQSITBankDetails');
        let { 0: bankDetails } = await commonService.getLastEntry({});
        data.bankDetails = bankDetails;
        res.status(HttpStatus.OK).send({ success: true, data });
    } catch (error) {
        throwAnError(error, res);
    }
}

/**
 * upload a project file 
 */

export async function uploadAProjectFile(req: Request, res: Response, next: NextFunction) {
    try {
        const file = req.file;
        const commonSer = new CommonService('projectFiles');
        let savedFile: any = await uploadFile.uploadImgToS3(file);
        let pro_file: any;
        if (req.body.project_file_id) {
            const { 0: projectFile } = await commonSer.getByOptions({
                where: {
                    id: req.body.project_file_id,
                    user_id: req.user.id
                }
            });
            if (!projectFile) throw errors.NO_PROJECT_FILE;
            projectFile.file_name = file.originalname;
            projectFile.file_type = req.body.file_type;
            projectFile.file_url = savedFile.Location;
            projectFile.file_size = (file.size / 1000000) + 'MB';
            pro_file = await commonSer.update(projectFile);
        } else {
            pro_file = await commonSer.insert({
                file_name: file.originalname,
                file_type: req.body.file_type,
                file_url: savedFile.Location,
                file_size: (file.size / 1000000) + 'MB',
                project_id: req.body.project_id,
                user_id: req.user.id
            });
        }
        res.status(HttpStatus.OK).send({
            data: { file: pro_file.file_url },
            success: true
        });
    } catch (error) {
        throwAnError(error, res);
    }
}

export async function renameAProjectFile(req: Request, res: Response, next: NextFunction) {
    try {
        const commosSer = new CommonService('projectFiles');
        const projectFile: ProjectFiles = await commosSer.getById(req.body.project_file_id);
        projectFile.file_name = req.body.file_name;
        await commosSer.update(projectFile);
        res.status(HttpStatus.OK).send({
            success: true,
            code: HttpStatus.OK,
            messages: messages.PROJECT_FILE_RENAMED
        });
    } catch (error) {
        throwAnError(error, res);
    }
}

export async function getAllProjectFiles(req: Request, res: Response, next: NextFunction) {
    try {
        const commonSer = new CommonService("projectFiles");
        let where: any;
        let select: Array<string> = ['id', 'file_name', 'file_type', 'file_url', 'file_size', 'updatedDate'];
        if (req.query.downloads === 'true') {
            where = { user_id: Not(req.user.id), project_id: req.query.project_id };
        } else {
            where = { user_id: req.user.id, project_id: req.query.project_id };
        }
        const data: any = await commonSer.getByOptions({ where, select });
        res.status(HttpStatus.OK).send({
            success: true,
            type: req.query.downloads ? 'Downloads' : 'Uploads',
            data
        });
    } catch (error) {
        throwAnError(error, res);
    }
}

export async function deleteProjectFile(req: Request, res: Response, next: NextFunction) {
    try {
        const commonSer = new CommonService('projectFiles');
        const { 0: projectFile } = await commonSer.getByOptions({ where: { id: req.query.id, user_id: req.user.id } });
        if (!projectFile) throw errors.NO_PROJECT_FILE;
        await commonSer.remove(req.query.id);
        sendSuccessResponse(messages.PROJECT_FILE_REMOVED, HttpStatus.OK, true, res);
    } catch (error) {
        throwAnError(error, res);
    }
}


// admin only
export async function adminUploadFile(req: Request, res: Response, next: NextFunction) {
    try {
        const file = req.file;
        const commonSer = new CommonService('projectFiles');
        let savedFile: any = await uploadFile.uploadImgToS3(file);
        let pro_file: any;
        if (req.body.project_file_id) {
            const { 0: projectFile }: ProjectFiles[] = await commonSer.getByOptions({
                where: { id: req.body.project_file_id }
            });
            if (!projectFile) throw errors.NO_PROJECT_FILE;
            if (req.body.file_type == '3') {
                if (!req.body.order_id) throw errors.NO_ORDERS_SELECTED_WHILE_UPLOADING_QUOTATION;
                projectFile.order_id = req.body.order_id;
            }
            projectFile.file_name = file.originalname;
            projectFile.file_type = req.body.file_type;
            projectFile.file_url = savedFile.Location;
            projectFile.file_size = (file.size / 1000000) + 'MB';
            pro_file = await commonSer.update(projectFile);
        } else {
            let pdf: any = {
                file_name: file.originalname,
                file_type: req.body.file_type,
                file_url: savedFile.Location,
                file_size: (file.size / 1000000) + 'MB',
                project_id: req.body.project_id,
                user_id: req.user.id
            }
            if (req.body.file_type == '3') {
                if (!req.body.order_id) throw errors.NO_ORDERS_SELECTED_WHILE_UPLOADING_QUOTATION;
                pdf.order_id = req.body.order_id;
            }
            pro_file = await commonSer.insert(pdf);
        }
        res.status(HttpStatus.OK).send({
            data: { file: pro_file.file_url },
            success: true
        });
    } catch (error) {
        throwAnError(error, res);
    }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
        const commonSer = new CommonService();
        const orderId = req.params.orderId;
        if(!orderId) throw "OrderId missing";
        const data = await commonSer.updateMultiple('orders', [orderId], {order_status: "5"});
        res.status(HttpStatus.OK).send({
            data: "status changed",
            success: true
        });
    } catch(error) {
        throwAnError(error, res);
    }
   
}