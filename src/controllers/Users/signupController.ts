// Thir parties
import { NextFunction, Request, Response } from 'express';
import HttpStatus from 'http-status-codes';

// locals
import UserService from '../../services/users/users.service';
import NotificationsService from '../../services/notifications/notifications.service';
import config from '../../config/config';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';
import { sendOTP } from '../../commonFunction/mobileNumber';
import { sendEmail } from '../../commonFunction/emailTemp';
import { INotifications } from '../../models/Notifications';
import { CommonService } from '../../services/common.service';
import { json } from 'body-parser';
import { Mail } from '../../commonFunction/mail';

const notificationService = new NotificationsService();
const commSer = new CommonService();

export async function userSignupHandler(req: Request, res: Response, next: NextFunction) {
  const userService = new UserService();
  try {
    const user = await userService.signupUser(req.body);
    // Admin send notification
    const adminIds = await commSer.getAdminIds();
    const adminNotifications = await notificationService.insert({
      to: [adminIds],
      message: `${req.body.full_name} have signed up successfully.`,
      url: '',
      isRead: [0]
    });
    // Add default additional settings 
    const commService = new CommonService('users');
    const dataArr = await commService.getById(user.id);
    if (dataArr) {
      const commServices = new CommonService('usersAdditionalSettings');
      const arrayAdd = [0, 1, 2];
      let dev = arrayAdd.join(', ');
      dev = dev.toString();
      let data = {
        user_id: user.id,
        new_product_notification: dev,
        offer_sale_notification: dev,
        order_update_notification: dev
      }
      await commServices.insert(data);
    }

    // send notification
    // const notifications = await notificationService.insert({
    //   to: [user.id],
    //   message: `${req.body.full_name} have signed up successfully.`,
    //   url: '',

    // });
    res.status(HttpStatus.CREATED).send({
      success: true,
      message: messages.USER_SIGNUP,
      data: { user_id: user.id, first_name: user.first_name, last_name: user.last_name }
    });
    // send otp and mail
    process.nextTick(async () => {
      // send OTP
      await sendOTP(user);
      // send Email
      const MailObj = new Mail();
      const mailData = {
        logo: `${config.emailUrls.emailHeaderLogo}`,
        team: `${config.emailUrls.emailFooterTeam}`,
        name: user.first_name, url: `${config.emailUrls.userConfirmation + user.activation_token + '&id=' + user.id}`
      };
      const html_body = await MailObj.htmlGenerate(res, 'activate_account/verify', mailData);
      const subject = 'Aqsit activate account';
      const emailRes = await MailObj.sendEmail(res, user.email, subject, html_body);
      //await sendEmail(user);

      // send email to admin
      let lastName = user.last_name ? user.last_name : '';
      let adminEmails = await commSer.getAdminEmail();
      adminEmails = adminEmails.split(',');
      const adminData = {
        logo: `${config.emailUrls.emailHeaderLogo}`,
        team: `${config.emailUrls.emailFooterTeam}`,
        name: `${user.first_name} ${lastName}`,
        email: user.email,
        phonenumber: user.primary_mobile_number
      }
      const admin_template = await MailObj.htmlGenerate(res, 'activate_account/admin-email', adminData);
      const mailSubject = 'Aqsit new user signed up';
      MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);
    });
  } catch (err) {
    let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
    return sendFailureResponse(message, HttpStatus.BAD_REQUEST, false, res);
  }
}