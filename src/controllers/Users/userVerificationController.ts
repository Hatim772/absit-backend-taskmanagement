import { NextFunction, Request, Response } from 'express';
import * as HttpStatus from 'http-status-codes';

import UserService from '../../services/users/users.service';
import NotificationsService from '../../services/notifications/notifications.service';
import { CommonService } from '../../services/common.service';

import errors from '../../assets/i18n/en/errors';
import messages from '../../assets/i18n/en/messages';

import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import * as uploadFile from '../../commonFunction/fileUpload';
import { throwAnError, throwAnIndexedError } from '../../commonFunction/throwAnError';
import { Mail } from '../../commonFunction/mail';
import config from '../../config/config';
const commSer = new CommonService();

export async function userVerficationDetails(req: Request, res: Response, next: NextFunction) {
    const commonService = new CommonService('usersVerificationDetails');
    try {
        const file: any = req.file;
        let savedFile: any;
        if (file) {
            let { 0: error_s } = uploadFile.validatePdf(file);
            if (error_s) throw error_s;
            savedFile = await uploadFile.uploadImgToS3(file);
        } else if (!req.body.website) {
            throw 'Value must be valid format for website';
        }
        // update user
        req.body.business_name = req.body.business_name ? req.body.business_name : null;
        const userSer = new UserService();
        const user = await userSer.getById(req.body.user_id ? req.body.user_id : req.user.id);
        user.business_name = req.body.business_name;
        user.website = req.body.website;
        await userSer.update(user);
        // update user data
        const userData = {
            portfolio_file: req.file ? savedFile.Location : null,
            user_id: req.body.user_id,
            //gst_number: req.body.gst_number,
        };
        await commonService.insert(userData);
        // insert notification
        const notificationSer = new NotificationsService();
        await notificationSer.insert({
            to: [req.body.user_id],
            message: `${user.first_name} has updated verification details.`,
            url: config.notificationDefaultUrl.url,
            isRead: [0]
        });
        // insert notification for admin
        const adminIds = commSer.getAdminIds();
        await notificationSer.insert({
            to: [adminIds],
            message: `${user.first_name} has updated verification details.`,
            url: config.notificationDefaultUrl.url,
            isRead: [0]
        });
        sendSuccessResponse(messages.VERIFICATION_DETAILS_UPDATED, HttpStatus.CREATED, true, res);

        //send email to admin
        process.nextTick(async () => {
            const MailObj = new Mail();
            let lastName = user.last_name ? user.last_name : '';
            let adminEmails = await commSer.getAdminEmail();
            adminEmails = adminEmails.split(',');
            const emailData = {
                logo: `${config.emailUrls.emailHeaderLogo}`,
                team: `${config.emailUrls.emailFooterTeam}`,
                userName: `${user.first_name} ${lastName}`,
                business_name : req.body.business_name,
                website : req.body.website,
                email: user.email,
                portfolio_file: req.file ? savedFile.Location : null
            }
            const admin_template = await MailObj.htmlGenerate(res, 'activate_account/user-verification-admin-notify', emailData);
            const mailSubject = 'Aqsit designer verification';
            MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);
        });
    } catch (error) {
        throwAnIndexedError(error, res);
    }
}