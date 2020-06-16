import bcrypt from 'bcryptjs';
import * as HttpStatus from 'http-status-codes';
import { NextFunction, Request, Response } from 'express';

import UserService from '../../services/users/users.service';
import NotificationsService from '../../services/notifications/notifications.service';

import config from '../../config/config';
import { AuthHandler } from '../../middlewares/authHandler';
import { ApiResponseError } from '../../resources/interfaces/ApiResponseError';
import { sendFailureResponse } from '../../commonFunction/Utills';

const { errors } = config;

export async function userLoginHandler(req: Request, res: Response, next: NextFunction) {
  const userService = new UserService();
  let user: any;

  try {
    if (req.body.username.includes('@')) {
      user = await userService.getByEmail(req.body.username);
      // if (user && user.activation_token !== '') throw errors.USER_EMAIL_IS_NOT_VERIFIED;
    } 
    else {
      user = await userService.getByOptions({ primary_mobile_number: req.body.username });
    }
    if (!user) throw errors.emailOrPhoneNumberNotFound;
    if(user.is_activate == '0') {
      throw errors.USER_NOT_ACTIVE;
    }
  } catch (error) {
    return sendFailureResponse(error, HttpStatus.BAD_REQUEST, false, res);
  }
  // now compare password
  const isPasswordCorrect = await bcrypt.compare(req.body.password, user.password);
  // generate token and return
  if (isPasswordCorrect) {
      if (user && user.otp) {
        return res.status(HttpStatus.OK).json({
              success: false,
              message: { userId: user.id, phoneNumber: user.primary_mobile_number, message: errors.USER_PHONE_IS_NOT_VERIFIED }
            });
        // throw { status:1, message: errors.USER_PHONE_IS_NOT_VERIFIED };
      }
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
          username: user.username ? user.username : user.first_name,
          email: user.email,
          profile_pic: user.profile_pic
        },
        notifications
      }
    });
  } else {
    // incorrect password
    const error: ApiResponseError = {
      code: HttpStatus.UNAUTHORIZED,
      errorObj: {
        message: errors.incorrectPassword
      }
    };
    return next(error);
  }
}
