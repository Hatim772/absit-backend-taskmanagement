import { NextFunction, Request, Response } from 'express';
import * as HttpStatus from 'http-status-codes';
import UserService from '../../services/users/users.service';
import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import errors from '../../assets/i18n/en/errors';
import messages from '../../assets/i18n/en/messages';
import { sendOTP } from '../../commonFunction/mobileNumber';
import { AuthHandler } from '../../middlewares/authHandler';
import NotificationsService from '../../services/notifications/notifications.service';

export async function confirmMobile(req: Request, res: Response, next: NextFunction){
    const userService = new UserService();
    try {
        const user = await userService.getById(req.body.user_id);
        if(!user) return sendFailureResponse(errors.emailOrPhoneNumberNotFound, HttpStatus.BAD_REQUEST, false, res); 
        if(user.otp==='') return sendFailureResponse(errors.PHONE_NUMBER_ALREADY_VERIFIED, HttpStatus.BAD_REQUEST, false, res);
        // remove first condition in future
        // if(req.body.otp != 1234) throw errors.OTP_DOES_NOT_MATCH;
        if(req.body.otp != user.otp) throw errors.OTP_DOES_NOT_MATCH;
        user.otp='';
        await userService.update(user);
        const authHandler = new AuthHandler();
        const token = authHandler.generateToken(user, req.body.isSignedIn);
        const notificationSer = new NotificationsService();
        const notifications = await notificationSer.getNotifications(user.id);
        return res.status(HttpStatus.OK).json({
          success: true,
          data: {
            token,
            user_data: {
              id: user.id,
              username: `${ user.first_name} ${ user.last_name}`,
              email: user.email,
              profile_pic: user.profile_pic
            },
            notifications
          }
        });
        return sendSuccessResponse(messages.PHONE_NUMBER_VERIFIED, HttpStatus.OK, true, res);
    } catch (error) {
        return sendFailureResponse(error, (error.includes('mismatch')?HttpStatus.BAD_REQUEST:HttpStatus.INTERNAL_SERVER_ERROR), false, res);
    }
}

export async function resendOTP(req: Request, res: Response, next: NextFunction){
    const userService = new UserService();
    try {
        const user = await userService.getById(req.body.user_id);
        if(user.otp=='') throw errors.PHONE_NUMBER_ALREADY_VERIFIED;
        user.otp=Math.floor(Math.random()*9912919).toString();
        const userNew = await userService.update(user);
        await sendOTP(userNew).catch(async (err: any) => {
            return sendFailureResponse(err, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        });
        return sendSuccessResponse(messages.OTP_RESEND, HttpStatus.OK, true, res);
    } catch (error) {
        return sendFailureResponse(error, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
}

export async function confirmEmail(req: Request, res: Response, next: NextFunction) {
    const userService = new UserService();
    try {
        const user = await userService.getById(req.query.id);
        if(!user) return sendFailureResponse(errors.emailOrPhoneNumberNotFound, HttpStatus.BAD_REQUEST, false, res); 
        if(user.activation_token==='') return sendSuccessResponse(messages.EMAIL_ALREADY_VERIFIED, HttpStatus.OK, true, res);
        user.activation_token='';
        await userService.update(user);
        sendSuccessResponse(messages.EMAIL_VERIFIED, HttpStatus.OK, true, res);
    } catch (error) {
        return sendFailureResponse(error, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
}