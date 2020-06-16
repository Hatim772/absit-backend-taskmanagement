import { NextFunction, Request, Response } from 'express';
import * as HttpStatus from 'http-status-codes';
import * as bcrypt from 'bcryptjs';
import _ from 'lodash';

// entities
import { Users } from '../../entities/Users';
import { UsersVerificationDetails } from '../../entities/UsersVerificationDetails';
import { UsersShippingAddress } from '../../entities/UsersShippingAddress';
import { UserPersonalInformation } from '../../entities/UserPersonalInformation';

// services
import { CommonService } from '../../services/common.service';
import UserService from '../../services/users/users.service';
import NotificationsService from '../../services/notifications/notifications.service';

// other locals
import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import * as uploadFile from '../../commonFunction/fileUpload';
import { throwAnError } from '../../commonFunction/throwAnError';
import { Mail } from '../../commonFunction/mail';
import config from '../../config/config';

const notificationSer = new NotificationsService();
let common = new CommonService();

export default class UserDetailsController {
    constructor() { }
    // For admin
    async getUser(req: Request, res: Response) {
        try {
            const userSer = new UserService();
            const user = await userSer.getUserWithVerificationDetails(req.params.id);
            sendSuccessResponse(user, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * Get Export Users
     * @param req 
     * @param res 
     */
    async getExportUsers(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['startDate', 'endDate']);
            const userSer = new UserService();
            const users = await userSer.getExportUsers(query.startDate, query.endDate);
            sendSuccessResponse(users, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * Verify user
     * @param req 
     * @param res 
     */
    async verifyUser(req: Request, res: Response) {
        try {
            let status = req.body.status;
            common = new CommonService('users');
            const { 0: user }: Users[] = await common.getByOptions({
                where: { id: req.params.id },
                relations: ['projectManager']
            });
            if (!user) throw 'No user found.';
            //if (user.otp !== "") throw 'User has not verified mobile number yet.';
            //if (user.activation_token !== "") throw 'User has not verified email yet.';
            //if (_.isNull(user.projectManager)) throw 'User doesn\'t has Project manager yet.';

            // changing user status
            if (status === '1') {
                user.status = '1';
                await common.update(user);

                // notification : Verification Approved 
                await notificationSer.insert({
                    to: [req.params.id],
                    message: `Hey ${user.first_name}, your designer verification has been approved, start getting quotes and ordering samples now.`,
                    url: '/moodboard/my-moodboard',
                    isRead: [0]
                });

                sendSuccessResponse('User verified', HttpStatus.OK, true, res);
            } else if (status === '2') {
                user.status = '2';
                await common.update(user);

                // send email for designer verification not-enough
                const MailObj = new Mail();
                const mailData = {
                    logo: `${config.emailUrls.emailHeaderLogo}`,
                    team: `${config.emailUrls.emailFooterTeam}`,
                    name: user.first_name
                };
                const html_body = await MailObj.htmlGenerate(res, 'Need_more_information/not_enough', mailData);
                const subject = 'Aqsit need more information';
                const emailRes = await MailObj.sendEmail(res, user.email, subject, html_body);

                //send notification for not enough data
                sendSuccessResponse('Notification sent to user to submit more data', HttpStatus.OK, true, res);
            } else if (status === '3') {
                user.status = '3';
                await common.update(user);
                // send email for designer verification declined
                const MailObj = new Mail();
                const mailData = {
                    logo: `${config.emailUrls.emailHeaderLogo}`,
                    team: `${config.emailUrls.emailFooterTeam}`,
                    name: user.first_name
                };
                const html_body = await MailObj.htmlGenerate(res, 'Designer_verification_disapproved/disapproved', mailData);
                const subject = 'Aqsit designer verification disapproved';
                const emailRes = await MailObj.sendEmail(res, user.email, subject, html_body);

                sendSuccessResponse('User Request Decline', HttpStatus.OK, true, res);
            }

        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * Get user's verification details
     * @param req 
     * @param res 
     */
    async getVerificationDetails(req: Request, res: Response) {
        try {
            common = new CommonService('usersVerificationDetails');
            const data = await common.getByUserId(req.body.user_id);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    // /**
    //  * Searching by username, first_name, last_name
    //  * @param req 
    //  * @param res 
    //  */
    // async sarchUser(req: Request, res: Response) {
    //     try {
    //         const userService = new UserService();
    //         const user = await userService.userSearch(req.query);
    //         sendSuccessResponse(user, HttpStatus.OK, true, res);
    //     } catch (error) {
    //         throwAnError(error, res);
    //     }
    // }
    // For admin

    async deactivateAccount(req: Request, res: Response, next: NextFunction) {
        const userService = new UserService();
        try {
            let user = await userService.getById(req.user.id);
            const isPasswordCorrect = await bcrypt.compare(req.body.password, user.password);
            if (!isPasswordCorrect) throw errors.incorrectPassword;
            // success path
            user.is_activate = 0;
            await userService.update(user);
            sendSuccessResponse(messages.USER_DEACTIVATED, HttpStatus.OK, true, res);
        } catch (error) {
            let message = Object.prototype.hasOwnProperty.call(error, 'message') ? error.message : error;
            sendFailureResponse(message, Object.prototype.hasOwnProperty.call(error, 'message') ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST, false, res);
        }
    }

    async changeUsersStatus(req: Request, res: Response, next: NextFunction) {
        const userService = new UserService();
        try {
            const userId = req.params.userId;
            let user = await userService.getById(userId);
            const status = req.body.status;
            user.is_activate = status;
            await userService.update(user);
            sendSuccessResponse('Status Changed', HttpStatus.OK, true, res);
        } catch (error) {
            let message = Object.prototype.hasOwnProperty.call(error, 'message') ? error.message : error;
            sendFailureResponse(message, Object.prototype.hasOwnProperty.call(error, 'message') ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST, false, res);
        }
    }

    async updateBasicInfo(req: Request, res: Response, next: NextFunction) {
        try {
            const body = _.pick(req.body, [
                'first_name',
                'last_name',
                'secondary_mobile_number',
                'username',
                'email',
                'password',
                'business_name',
                'website',
                'verification',
                'shippingAddress',
                'personalInfo'
            ]);
            // update user details
            const userSer = new UserService();
            const user: Users = req.user;
            user.first_name = body.first_name;
            user.last_name = body.last_name;
            user.username = body.username;
            user.business_name = body.business_name;
            user.website = body.website;
            user.email = body.email ? body.email : user.email;
            if (body.password) {
                user.password = await Users.setPassword(body.password);
            }
            if (body.secondary_mobile_number) {
                user.secondary_mobile_number = body.secondary_mobile_number;
            }
            await userSer.update(user);

            // update / insert gst_number
            if (body.verification) {
                const commonSer = new CommonService('usersVerificationDetails');
                const { 0: verificationDetails }: UsersVerificationDetails[] = await commonSer.getByUserId(req.user.id);
                if (!verificationDetails) {
                    await commonSer.insert({
                        gst_number: body.verification.gst_number,
                        user_id: req.user.id
                    });
                } else {
                    verificationDetails.gst_number = body.verification.gst_number;
                    await commonSer.update(verificationDetails);
                }
            }

            // update / insert shippingAddress
            if (body.shippingAddress) {
                const commonSer = new CommonService('usersShippingAddress');
                const { 0: userShippingAddress }: UsersShippingAddress[] = await commonSer.getByUserId(req.user.id);
                if (!userShippingAddress) {
                    await commonSer.insert({
                        address_line1: body.shippingAddress.address_line1,
                        address_line2: body.shippingAddress.address_line2,
                        city: body.shippingAddress.city,
                        landmark: body.shippingAddress.landmark,
                        pin_code: body.shippingAddress.pin_code,
                        user_id: req.user.id
                    });
                } else {
                    userShippingAddress.address_line1 = body.shippingAddress.address_line1;
                    userShippingAddress.address_line2 = body.shippingAddress.address_line2 ? body.shippingAddress.address_line2 : userShippingAddress.address_line2;
                    userShippingAddress.city = body.shippingAddress.city;
                    userShippingAddress.landmark = body.shippingAddress.landmark;
                    userShippingAddress.pin_code = body.shippingAddress.pin_code;
                    await commonSer.update(userShippingAddress);
                }
            }

            // update / insert personalInfo
            if (body.personalInfo) {
                const commonSer = new CommonService('usersPersonalInfo');
                const { 0: userPersonalInfo }: UserPersonalInformation[] = await commonSer.getByUserId(req.user.id);
                if (!userPersonalInfo) {
                    commonSer.insert({
                        about: body.personalInfo.about,
                        facebookProfile: body.personalInfo.facebookProfile,
                        instagramProfile: body.personalInfo.instagramProfile,
                        linkedinProfile: body.personalInfo.linkedinProfile,
                        pinterestProfile: body.personalInfo.pinterestProfile,
                        twitterProfile: body.personalInfo.twitterProfile,
                        user_id: req.user.id
                    });
                } else {
                    userPersonalInfo.about = body.personalInfo.about;
                    userPersonalInfo.facebookProfile = body.personalInfo.facebookProfile;
                    userPersonalInfo.instagramProfile = body.personalInfo.instagramProfile;
                    userPersonalInfo.linkedinProfile = body.personalInfo.linkedinProfile;
                    userPersonalInfo.pinterestProfile = body.personalInfo.pinterestProfile;
                    userPersonalInfo.twitterProfile = body.personalInfo.twitterProfile;
                    await commonSer.update(userPersonalInfo);
                }
            }
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message: messages.USER_BASIC_PROFILE_UPDATED
            });
        } catch (error) {
            let messageArr = error.code == "ER_DUP_ENTRY" ? error.message.split(" ") : error;
            let message = messageArr[messageArr.length - 1].replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '').replace("_IDX", '') + " is taken";
            sendFailureResponse(message, error.code == "ER_DUP_ENTRY" ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async getBasicInfo(req: Request, res: Response, next: NextFunction) {
        try {
            const userSer = new UserService();
            const data = await userSer.getBasicInfo(req.user.id) || {};
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                data
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async updateUserAdditionalSettings(req: Request, res: Response, next: NextFunction) {
        // fetch setts
        const commonService = new CommonService('usersAdditionalSettings');
        try {
            const dataArr = await commonService.getByUserId(req.user.id);
            console.log('req.body', req.body);
            if (dataArr.length < 1) {
                // if not insert em
                let data = {
                    user_id: req.user.id,
                    new_product_notification: req.body.new_product_notification ? req.body.new_product_notification.join(', ') : null,
                    offer_sale_notification: req.body.offer_sale_notification ? req.body.offer_sale_notification.join(', ') : null,
                    order_update_notification: req.body.order_update_notification ? req.body.order_update_notification.join(', ') : null,
                    available_day: req.body.available_day ? req.body.available_day.join(', ') : null,
                    samplebox_available_day: req.body.samplebox_available_day ? req.body.samplebox_available_day.join(', ') : null,
                    available_from: req.body.available_from,
                    available_to: req.body.available_to,
                    samplebox_available_from: req.body.samplebox_available_from,
                    samplebox_available_to: req.body.samplebox_available_to,
                    is_confirmed: req.body.is_confirmed,
                    is_unsubscribe_all: req.body.unsubscribe_all ? req.body.unsubscribe_all : false,
                }
                if (req.body.unsubscribe_all) {
                    data.new_product_notification = null;
                    data.offer_sale_notification = null;
                    data.order_update_notification = null;
                }
                await commonService.insert(data);
            } else {
                // else update em
                let data = dataArr[0];
                data.new_product_notification = req.body.new_product_notification ? req.body.new_product_notification.join(',') : null;
                data.offer_sale_notification = req.body.offer_sale_notification ? req.body.offer_sale_notification.join(',') : null;
                data.order_update_notification = req.body.order_update_notification ? req.body.order_update_notification.join(',') : null;
                data.available_day = req.body.available_day ? req.body.available_day.join(',') : null;
                data.samplebox_available_day = req.body.samplebox_available_day ? req.body.samplebox_available_day.join(',') : null;
                data.available_from = req.body.available_from;
                data.available_to = req.body.available_to;
                data.samplebox_available_from = req.body.samplebox_available_from;
                data.samplebox_available_to = req.body.samplebox_available_to;
                data.is_confirmed = req.body.is_confirmed;
                data.is_unsubscribe_all = req.body.unsubscribe_all ? req.body.unsubscribe_all : false;
                if (req.body.unsubscribe_all) {
                    data.new_product_notification = null;
                    data.offer_sale_notification = null;
                    data.order_update_notification = null;
                }
                await commonService.update(data);
            }
            sendSuccessResponse(messages.USER_ADDITIONAL_SETTINGS_UPDATED, HttpStatus.OK, true, res);
        } catch (error) {
            let message = error.message.startsWith('ER_DUP_ENTRY') ? errors.USER_ADDITIONAL_SETTINGS_ALREADY_ADDED : error.message;
            sendFailureResponse(message, error.message.startsWith('ER_DUP_ENTRY') ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async getUserAdditionalSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const commonService = new CommonService('usersAdditionalSettings');
            const dataArr = await commonService.getByUserId(req.user.id);
            let data: any = dataArr[0] ? dataArr[0] : {};
            // filtering data manually
            data.new_product_notification = data.new_product_notification ? data.new_product_notification.split(',').map(Number) : null;
            data.offer_sale_notification = data.offer_sale_notification ? data.offer_sale_notification.split(',').map(Number) : null;
            data.order_update_notification = data.order_update_notification ? data.order_update_notification.split(',').map(Number) : null;
            data.available_day = data.available_day ? data.available_day.split(',') : null;
            data.samplebox_available_day = data.samplebox_available_day ? data.samplebox_available_day.split(',') : null;
            return res.status(HttpStatus.OK).send({
                success: true,
                data
            });
        } catch (error) {
            sendFailureResponse(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async userProfilePicture(req: Request, res: Response, next: NextFunction) {
        try {
            const file: any = req.file;
            if (!file) return sendFailureResponse(errors.NO_IMAGE_ATTACHED, HttpStatus.BAD_REQUEST, false, res);
            let error_s = uploadFile.validateSingleImg(file);
            if (error_s.length > 0) return sendFailureResponse(error_s[0], HttpStatus.INTERNAL_SERVER_ERROR, false, res);
            const userSer = new UserService();
            const user = await userSer.getById(req.user.id);
            const img: any = await uploadFile.uploadImgToS3(file);
            user.profile_pic = img.Location;
            await userSer.update(user);
            return res.status(HttpStatus.OK).send({
                success: true,
                data: { profile_pic: img.Location }
            });
        } catch (error) {
            sendFailureResponse(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async getUserProfilePicture(req: Request, res: Response, next: NextFunction) {
        try {
            const userSer = new UserService();
            const user = await userSer.getById(req.user.id);
            return res.status(HttpStatus.OK).send({
                success: true,
                data: { profile_pic: user.profile_pic }
            });
        } catch (error) {
            sendFailureResponse(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async isUserVerified(req: Request, res: Response, next: NextFunction) {
        try {
            const userSer = new UserService();
            const user: Users = await userSer.getById(req.user.id);
            let data: { status: number, message: string } = {
                status: 0,
                message: ''
            };
            if (user.status == '1') {
                data.status = 1;
                data.message = 'User is verified.';
            } else if (user.status == '0') {
                const commonService = new CommonService('usersVerificationDetails');
                const { 0: verfDetails } = await commonService.getByUserId(req.user.id);
                if (!verfDetails) {
                    data.status = 2;
                    data.message = 'User has not applied for verification yet.';
                } else {
                    data.status = 3;
                    data.message = 'User has already applied.';
                }
            }
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message: data.message,
                data: { status: data.status }
            });
        } catch (error) {
            sendFailureResponse(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async removeUserProfilePicture(req: Request, res: Response, next: NextFunction) {
        try {
            const userSer = new UserService();
            const user = await userSer.getById(req.user.id);
            user.profile_pic = null;
            await userSer.update(user);
            sendSuccessResponse(messages.USER_PROFILE_PICTURE_REMOVED, HttpStatus.OK, true, res);
        } catch (error) {
            sendFailureResponse(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async getUserSProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const userSer = new UserService();
            if (!req.user) {
                if ((!_.has(req.query, 'user_id') && !_.has(req.query, 'moodboard_id'))) throw errors.INVALID_REQUEST;
            }
            let data: any;
            if (_.has(req.query, 'moodboard_id')) {
                data = await userSer.getUserProfile(undefined, req.query.moodboard_id);
            } else {
                data = await userSer.getUserProfile(req.path === '/profile' ? req.user.id : (_.has(req.query, 'user_id') ? req.query.user_id : undefined));
            }
            if (!data) data = {};
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    //  Notifications
    async getAllNotifications(req: Request, res: Response) {
        try {
            const data = await notificationSer.getNotifications(req.user.id, req.query.isRead);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    //  Notifications
    async getUnreadNotificationCount(req: Request, res: Response) {
        try {
            console.log('req.query', req.query);
            const data = await notificationSer.getUnreadNotifications(req.user.id, req.query.isRead);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async readNotification(req: Request, res: Response) {
        try {
            await notificationSer.updateNotification(req.params.notification_id);
            sendSuccessResponse('Notification read.', HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async deleteNotification(req: Request, res: Response) {
        try {
            const result = await notificationSer.deleteNotification(req.params.notification_id);
            sendSuccessResponse(`${result.deletedCount} notification deleted.`, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * Verify user
     * @param req 
     * @param res 
     */
    async getUnVerifiedUsers(req: Request, res: Response) {
        try {
            const userSer = new UserService();
            let userList = await userSer.getUnverifiedUsers();
            console.log('userList', userList);
            sendSuccessResponse(userList, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
}