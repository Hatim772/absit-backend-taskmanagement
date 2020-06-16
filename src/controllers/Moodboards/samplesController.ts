// third parties
import * as HttpStatus from 'http-status-codes';
import { Request, Response } from 'express';
import moment from 'moment';
import _ from 'lodash';

// locals
import { CommonService } from '../../services/common.service';
import UserService from '../../services/users/users.service';
import MoodboardService from '../../services/moodboard/moodboard.service';
import NotificationsService from '../../services/notifications/notifications.service';
import { CatalogService } from '../../services/catalog/catalog.service';

import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { MoodboardOrders } from '../../entities/MoodboardOrders';
import { throwAnError } from '../../commonFunction/throwAnError';
import { Users } from '../../entities/Users';
import config from '../../config/config';
import { Mail } from '../../commonFunction/mail';

const notificationService = new NotificationsService();
const commServ = new CommonService();
const catalogModel = new CatalogService();

export default class SampleOrderController {
    constructor() { }

    /**
     * Used for creating a sample order
     * @param req 
     * @param res
     */

    /*
    1. Moodboard should have at least 6 products in order to order samples. 
    2. User should be authorized by admin.
    3. User should have been included shipping address in it's profile if not then have to include it.
    4. Once per week.
   */
    async makeSampleOrder(req: Request, res: Response) {
        try {
            // manually checking for minimum five products
            let products: Array<any> = req.body.products;
            products = _.flattenDepth(products.map((product: { cat_id: number, products: Array<number> }) => product.products), 1);
            if (products.length < 5) throw `Minimum 5 products is required for sample ordering and current is: ${products.length}`;

            let common = new CommonService('moodboard');
            const moodboard = await common.getByOptions({ user_id: req.user.id, id: req.body.moodboard_id });
            if (moodboard.length < 1) throw errors.NO_MOODBOARD_FOUND;

            const userService = new UserService();
            const user = await userService.customQueryWithMultiJoin({ id: req.user.id }, ['projectManager', 'usersShippingAddress']);
            if (user[0].status == '0') throw errors.USER_IS_NOT_VERFIED;
            // if (user[0].is_activate == '0') throw errors.USER_IS_NOT_ACTIVATE;
            if (!user[0].usersShippingAddress) throw errors.USER_HAS_NOT_PROVIDED_SHIPPING_ADDRESS;
            //if (!user[0].project_manager_id) throw errors.NO_PROJECT_MANAGER;

            // once per week
            common = new CommonService('moodboardOrders');
            const userLastOrder = await common.getLastEntry({ user_id: req.user.id });
            if (userLastOrder.length > 0 && moment().diff(userLastOrder[0].createdDate, 'days') <= 7) throw errors.USER_ORDERED_SAMPLE_IN_SAME_WEEK;

            // limit products by categories
            const moodboardSer = new MoodboardService();
            const moodboardCategoriesLength = await moodboardSer.getMoodboardCategory(req.body.moodboard_id);
            const categoryWiseChecking = await moodboardSer.checkMoodboardSamplingProducts(moodboardCategoriesLength, req.body.products);
            // saving order
            // estimated_delivery_date 4 days of delivery date
            const estimated_delivery_date = moment().add('4', 'd').toDate();
            // estimated_return_date 7 days of return date
            const estimated_return_date = moment().add('11', 'd').toDate();
            common = new CommonService('moodboardOrders');
            const order: MoodboardOrders = await common.insert({
                shipping_address: user[0].usersShippingAddress.id,
                user_id: req.user.id,
                moodboard_id: req.body.moodboard_id,
                estimated_delivery_date,
                estimated_return_date
            });
            // save ordering product
            let finalproducts = products.map((product_id: number) => {
                return {
                    product_id,
                    moodboard_id: req.body.moodboard_id,
                    moodboard_order_id: order.id
                }
            });

            // bulk inserting the products
            await common.bulkInsert('MoodboardOrderProducts', finalproducts);

            let productSku:any = await catalogModel.getProductSku(products);

            // inserting notification
            await notificationService.insert({
                to: [req.user.id],
                message: `${req.user.first_name} has made a sample order: ${order.order_id}`,
                url: `${config.notificationUrls.sampleOrderPage}${order.id}`,
                isRead: [0]
            });

            // inserting notification for admin
            const adminIds = commServ.getAdminIds();
            await notificationService.insert({
                to: [adminIds],
                message: `${req.user.first_name} has made a sample order: ${order.order_id}`,
                url: `${config.notificationUrls.sampleOrderPage}${order.id}`,
                isRead: [0]
            });

            res.status(HttpStatus.CREATED).send({
                success: true,
                message: messages.USER_SAMPLE_ORDER_SUCCESS,
                data: {
                    raw_order_id: order.id,
                    order_id: order.order_id
                }
            });

            //send email to admin
            process.nextTick(async () => {
                const MailObj = new Mail();
                let lastName = req.user.last_name ? req.user.last_name : '';
                let adminEmails = await commServ.getAdminEmail();
                adminEmails = adminEmails.split(',');
                const adminData = {
                    logo: `${config.emailUrls.emailHeaderLogo}`,
                    team: `${config.emailUrls.emailFooterTeam}`,
                    userName: `${req.user.first_name} ${lastName}`,
                    swatchkitId: order.order_id,
                    productData: productSku
                }
                const admin_template = await MailObj.htmlGenerate(res, 'Sample_order/admin-order-notify', adminData);
                const mailSubject = 'Aqsit designer placed sample order';
                MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * Get a sample order
     * @param req 
     * @param res 
     */
    async getById(req: Request, res: Response) {
        try {
            let common = new CommonService('moodboardOrders');
            if (req.path.startsWith('/getSampleOrder')) {
                const { 0: order } = await common.getByOptions({ user_id: req.user.id, id: req.params.order_id });
                if (!order) throw 'No sample order found!';
            }
            const moodboardSer = new MoodboardService();
            let order: any;
            if (req.params.order_id) {
                order = await moodboardSer.getSampleOrder(req.params.order_id);
            } else {
                order = await moodboardSer.getSampleOrder(undefined, req.user.id);
            }
            res.status(HttpStatus.OK).send({ success: true, data: order });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * User shipping address withother details 
     * @param req 
     * @param res
     */
    async getSamplingInfo(req: Request, res: Response) {
        try {
            let common = new CommonService('moodboardOrders');
            const userSer = new UserService();
            const data = await userSer.getUserSampleOrderAddr(req.user.id);
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                data: data || {}
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * @returns Sets user's shipping address 
     * @param req 
     * @param res 
     * @param next 
     */
    async setSamplingInfo(req: Request, res: Response) {
        try {
            const userSer = new UserService();
            const data: any = _.pick(req.body, ['address_line1', 'address_line2', 'landmark', 'city', 'pin_code', 'business_name', 'secondary_mobile_number']);

            // updating user
            const user: Users = await userSer.getById(req.user.id);
            user.business_name = data.business_name;
            user.secondary_mobile_number = data.secondary_mobile_number;
            await userSer.update(user);

            // updating user's address
            let common = new CommonService('usersShippingAddress');
            const { 0: shippingAddrs } = await common.getByUserId(req.user.id);
            if (!shippingAddrs) {
                await common.insert({
                    address_line1: data.address_line1,
                    address_line2: data.address_line2,
                    landmark: data.landmark,
                    city: data.city,
                    pin_code: data.pin_code,
                    user_id: req.user.id
                });
            } else {
                shippingAddrs.address_line1 = data.address_line1;
                shippingAddrs.address_line2 = data.address_line2;
                shippingAddrs.landmark = data.landmark;
                shippingAddrs.city = data.city;
                shippingAddrs.pin_code = data.pin_code;
                await common.update(shippingAddrs);
            }

            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message: messages.USER_SAMPLE_ADDRESS_UPDATION_SUCCESS
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * Used for creating 
     * the request of 
     * extending return date 
     * @param req 
     * @param res
     */
    async requestForExtendDate(req: Request, res: Response) {
        try {
            let common = new CommonService('moodboardOrders');
            const body = _.pick(req.body, ['sample_order_id', 'requested_return_date']);
            const sampleOrder: MoodboardOrders = await common.getById(body.sample_order_id);

            // validating if sample order is delivered or not.
            if (sampleOrder.request_to_extend_return_date != '0') throw "Already asked for extending return date!";
            if (sampleOrder.order_status !== '3') throw errors.SAMPLE_ORDER_EXTEND_ONLY_ON_STATUS_3;
            sampleOrder.request_to_extend_return_date = '1';
            await common.update(sampleOrder);

            // inserting notification
            await notificationService.insert({
                to: req.user.id,
                message: `Your Request for extend sample order Sent Successfully to admin.`,
                // message: `${req.user.first_name} asked to extend the return date of sample order: ${sampleOrder.order_id}`,
                // params: [{
                //     order_raw_id: sampleOrder.id,
                //     order_id: sampleOrder.order_id
                // }]
                url: config.notificationDefaultUrl.url,
                isRead: [0]
            });

            // insert notification for admin
            const adminIds = commServ.getAdminIds();
            await notificationService.insert({
                to: [adminIds],
                // message: `Your sample order ${sampleOrder.order_id} has been extended to date: ${sampleOrder.estimated_return_date.toLocaleDateString()}.`,
                message: `${req.user.first_name} has Request You To extend sample order Date.`,
                // params: [{
                //     order_raw_id: order.id,
                //     order_id: order.order_id
                // }]
                url: config.notificationDefaultUrl.url,
                isRead: [0]
            });
            sendSuccessResponse(messages.REQUESTED_FOR_RETURN_DATE_EXTEND, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    // ** 
    // Admin authenticated 
    // **
    async showAllSampleOrders(req: Request, res: Response) {
        try {
            const pageNumber = req.query.pageNumber;
            const recordPerPage = req.query.recordPerPage;
            const moodboardSer = new MoodboardService();
            let orders = await moodboardSer.getAdminSampleOrder(pageNumber, recordPerPage);
            sendSuccessResponse(orders, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async getSampleOrder(req: Request, res: Response) {
        try {
            const mbSer = new MoodboardService();
            let order = await mbSer.getSampleOrder(req.params.id);
            sendSuccessResponse(order, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * Used for getting list of Requests for extend date
     * @param req 
     * @param res 
     */
    async listRequests(req: Request, res: Response) {
        try {
            const pageNumber = req.query.pageNumber;
            const recordPerPage = req.query.recordPerPage;
            const mbSer = new MoodboardService();
            let orders = await mbSer.getExtendOrderList(pageNumber, recordPerPage);
            sendSuccessResponse(orders, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async changeSampleOrderSStatus(req: Request, res: Response) {
        try {

            let common = new CommonService('moodboardOrders');
            const order = await common.getById(req.body.order_id);
            if (!order) throw errors.NO_SAMPLE_ORDER_FOUND;
            order.order_status = req.body.order_status;
            await common.update(order);
            if (req.body.order_status === '2') {
                // send email to sample order is confirmed
                const mbSer = new MoodboardService();
                let orders = await mbSer.getSamepleOrderDetails(req.body.order_id);

                if (orders) {
                    let estimated_delivery_date = orders.moodboard_orders_estimated_delivery_date;
                    estimated_delivery_date = moment(estimated_delivery_date).format('DD MMM YYYY')
                    const moodboard_name = orders.moodboard_name;
                    const users_shipping_address = `${orders.users_shipping_address_address_line1},${orders.users_shipping_address_address_line2},${orders.users_shipping_address_landmark},${orders.users_shipping_address_city},${orders.users_shipping_address_pin_code}`;
                    const countItem = orders.countItem;
                    const users_email = orders.users_email;
                    // send email to sample order is confirmed
                    const MailObj = new Mail();
                    const mailData = {
                        logo: `${config.emailUrls.emailHeaderLogo}`,
                        link: `${config.emailUrls.emailHeaderLogo} `,
                        team: `${config.emailUrls.emailFooterTeam} `,
                        countItem: countItem,
                        estimated_delivery_date: estimated_delivery_date,
                        moodboard_name: moodboard_name,
                        users_shipping_address: users_shipping_address,
                        swatchkitId: order.order_id
                    };
                    const html_body = await MailObj.htmlGenerate(res, 'Sample_order_confirmed/confirmed', mailData);
                    const subject = 'Aqsit sample order confirmed';
                    const emailRes = await MailObj.sendEmail(res, users_email, subject, html_body);
                }
                //send notification to user
                await notificationService.insert({
                    to: orders.users_id,
                    message: `${orders.users_first_name} your sample order with order id ${order.order_id} is out for delivery.`,
                    url: config.notificationDefaultUrl.url,
                    isRead: [0]
                });
            }

            if (req.body.order_status === '3') {
                // send email to sample order is delivered
                const mbSer = new MoodboardService();
                let orders = await mbSer.getSamepleOrderDetails(req.body.order_id);

                if (orders) {
                    let estimated_delivery_date = orders.moodboard_orders_estimated_delivery_date;
                    estimated_delivery_date = moment(estimated_delivery_date).format('DD MMM YYYY')
                    const moodboard_name = orders.moodboard_name;
                    const users_shipping_address = `${orders.users_shipping_address_address_line1}, ${orders.users_shipping_address_address_line2}, ${orders.users_shipping_address_landmark}, ${orders.users_shipping_address_city}, ${orders.users_shipping_address_pin_code} `;
                    const countItem = orders.countItem;
                    const users_email = orders.users_email;
                    // send email to sample order is confirmed
                    const MailObj = new Mail();
                    const mailData = {
                        logo: `${config.emailUrls.emailHeaderLogo} `,
                        team: `${config.emailUrls.emailFooterTeam} `,
                        countItem: countItem,
                        estimated_delivery_date: estimated_delivery_date,
                        moodboard_name: moodboard_name,
                        users_shipping_address: users_shipping_address,
                        swatchkitId: order.order_id
                    };
                    const html_body = await MailObj.htmlGenerate(res, 'Sample_delivered/delivered', mailData);
                    const subject = 'Aqsit sample delivered';
                    const emailRes = await MailObj.sendEmail(res, users_email, subject, html_body);
                    //send notification to user
                    await notificationService.insert({
                        to: orders.users_id,
                        message: `${orders.users_first_name} your sample order with order id ${order.order_id} is delivered.`,
                        url: config.notificationDefaultUrl.url,
                        isRead: [0]
                    });
                }
            }

            sendSuccessResponse(messages.SAMPLE_ORDER_STATUS_CHANGED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async extendSampleOrderReturnDate(req: Request, res: Response) {
        try {
            let common = new CommonService('moodboardOrders');
            const order: MoodboardOrders = await common.getById(req.body.sample_order_id);
            const status = req.body.status;
            let notificationMessage;

            if (!order) throw errors.NO_SAMPLE_ORDER_FOUND;
            if (status == '2') {
                if (order.order_status !== '3') throw errors.SAMPLE_ORDER_EXTEND_ONLY_ON_STATUS_3;
                if (order.request_to_extend_return_date != '1') throw "Sample order can't extend more than once.";

                const today = new Date();
                const orders_return_date = new Date(order.estimated_return_date);
                if (today >= orders_return_date) throw "Sample order's return date is already Passed.";

                // extend date with adding 7 days
                order.estimated_return_date = new Date(moment(order.estimated_return_date).utc(true).add(7, 'days').format('YYYY-MM-DD'));
                order.request_to_extend_return_date = status;
                await common.update(order);

                notificationMessage = `Your request to extend sample order date for order id ${ order.order_id } has been approved and date has been extended till ${ order.estimated_return_date.toLocaleDateString() } date.`;

            } else if (status == '3') {
                order.request_to_extend_return_date = status;
                await common.update(order);
                notificationMessage = `Sorry, we are unable to extend sample order date for order id ${ order.order_id }`;
            }

            await notificationService.insert({
                to: [order.user_id],
                message: notificationMessage,
                url: config.notificationDefaultUrl.url,
                isRead: [0]
            });

            sendSuccessResponse(messages.SAMPLE_ORDER_ESTIMATED_RETURN_CHANGED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async rejectSampleOrderDateExtendRequest(req: Request, res: Response) {
        try {
            let common = new CommonService('moodboardOrders');
            const order: MoodboardOrders = await common.getById(req.body.order_id);
            if (!order) throw errors.NO_SAMPLE_ORDER_FOUND;
            if (order.request_to_extend_return_date == '3') throw "Request already rejected";
            if (order.request_to_extend_return_date != '2') throw "User haven't applied yet!";
            // now update it to '2'
            order.request_to_extend_return_date = '2';
            await common.update(order);
            sendSuccessResponse("Sample order extending return date request is rejected.", HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
}