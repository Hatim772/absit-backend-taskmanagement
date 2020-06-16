import { NextFunction, Request, Response, Router } from 'express';
import * as jwt from 'jsonwebtoken';
import moment from 'moment';

import * as HttpStatus from 'http-status-codes';
import UserService from '../../services/users/users.service';
import config from '../../config/config';
import { sendEmailForForgotPassword } from '../../commonFunction/emailTemp';
import { Users } from '../../entities/Users';
import { Mail } from '../../commonFunction/mail';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';
import { AuthHandler } from '../../middlewares/authHandler';

export async function sendEmail(req: Request, res: Response, next: NextFunction) {
    // fetch user
    const userService = new UserService();
    // if user sendEmail
    try {
        const user = await userService.getByEmail(req.body.email);
        if (!user) throw 'no user found';
        // generate token with email, user_id as payload and 1h expiration
        const token = jwt.sign({ email: user.email, id: user.id }, config.auth.secretKey, {
            expiresIn: '365d'
        });
        // send it to emailTemp.ts's sendEmailForForgotPassword with token and user.email
        // await sendEmailForForgotPassword(user.email, token).catch(async (err) => {
        //     return res.status(HttpStatus.BAD_REQUEST).send({
        //         success: false,
        //         code: HttpStatus.INTERNAL_SERVER_ERROR,
        //         message: err
        //     });
        // });

        const MailObj = new Mail();
        const mailData = { logo: `${config.emailUrls.emailHeaderLogo}`, team: `${config.emailUrls.emailFooterTeam}`, name: user.first_name, url: `${config.emailUrls.forgotPassword + token}` };
        const html_body = await MailObj.htmlGenerate(res, 'reset-password/reset', mailData);
        const subject = 'Aqsit password recovery';
        const emailRes = await MailObj.sendEmail(res, user.email, subject, html_body);
        // await sendEmail(user);
        sendSuccessResponse('mail sent to user', HttpStatus.OK, true, res);

    } catch (error) {
        console.log('error', error);
        res.status(HttpStatus.BAD_REQUEST).send({
            success: false,
            message: error
        });
    }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
    const token: any = req.body.token;
    if (token && req.body.password) {
        const userService = new UserService();
        let decoded: any;
        try {
            decoded = jwt.verify(token, config.auth.secretKey);
            // fetch user and change password
            const user = await userService.getById(decoded.id);
            // password update once a day
            // let today = moment().format('YYYY-MM-DD');
            // if (moment(today).isSame(user.lastPasswordChangeDate)) {
            //     return res.status(HttpStatus.BAD_REQUEST).send({
            //         success: false,
            //         message: 'user can update password once a day'
            //     });
            // }
            user.password = await Users.setPassword(req.body.password);
            user.lastPasswordChangeDate = new Date();
            await userService.update(user);
            const authHandler = new AuthHandler();
            const logintoken = authHandler.generateToken(user, req.body.isSignedIn);
            const last_name = user.last_name ? user.last_name : ''
            res.status(HttpStatus.OK).send({
                success: true,
                message: 'user password successfully changed',
                data: {
                    logintoken,
                    user_data: {
                      id: user.id,
                      username: `${user.first_name} ${last_name}`,
                      email: user.email,
                      profile_pic: user.profile_pic
                    }
                  }
            });
        } catch (error) {
            console.log(error);
            res.status(HttpStatus.BAD_REQUEST).send({
                success: false,
                message: "Session Time Out."
            });
        }
    } else {
        res.status(HttpStatus.BAD_REQUEST).send({
            success: false,
            message: 'invalid request'
        });
    }
}

