// third parties
import * as HttpStatus from 'http-status-codes';
import { NextFunction, Request, Response } from 'express';
import moment from 'moment';
import _ from 'lodash';

// interfaces
// import { LeftJoinArrayEl, LeftJoinConfig } from '../../resources/interfaces/CommonServiceInterfaces';

// locals
import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import { sendEmailForQutationToUser, sendEmailForRequestForPricing } from '../../commonFunction/emailTemp';
import errors from '../../assets/i18n/en/errors';
import messages from '../../assets/i18n/en/messages';
import { throwAnError } from '../../commonFunction/throwAnError';
import config from '../../config/config';
import * as uploadFile from '../../commonFunction/fileUpload';

// entities
import { Orders } from '../../entities/Orders';
import { OrderBillingAddress } from '../../entities/OrderBillingAddress';
import { OrderShippingAddress } from '../../entities/OrderShippingAddress';
import { ProjectFiles } from '../../entities/ProjectFiles';

// services
import QuoteService from '../../services/quote/quote.service';
import { CommonService } from '../../services/common.service';
import { CatalogService } from '../../services/catalog/catalog.service';
import NotificationsService from '../../services/notifications/notifications.service';
import { number } from 'joi';
import { Mail } from '../../commonFunction/mail';

const notificationService = new NotificationsService();
const commSer = new CommonService();

export default class QuoteController {

    constructor() { }
    async uuidv4(): Promise<string> {
        let uuid = 'xxxxxxxx-4xxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        const commonSer = new CommonService('orders');
        const { 0: ifTableHaveOne } = await commonSer.getByOptions({
            where: { order_set_id: uuid }
        });
        if (ifTableHaveOne) {
            return await this.uuidv4();
        } return uuid;
    }
    async addProducts(req: Request, res: Response) {
        try {
            const commonService = new CommonService('orderReference');
            let alreadyAddedProducts: any = await commonService.getByOptions({
                where: {
                    user_id: req.user.id,
                    project_id: null
                }
            });
            let filteredProducts: any;
            if (alreadyAddedProducts.length > 0) {
                alreadyAddedProducts = alreadyAddedProducts.map((product: any) => { return product.product_id });
                const products = req.body.products;
                filteredProducts = [...alreadyAddedProducts, ...products];
                filteredProducts = filteredProducts.filter((el: any) => !alreadyAddedProducts.includes(el));
            } else {
                filteredProducts = req.body.products;
            }
            if (filteredProducts.length < 1) throw errors.DUPLICATE_PRODUCTS_TO_ADD_FOR_QUOTATION;
            filteredProducts = filteredProducts.map((el: any) => {
                return { product_id: el, user_id: req.user.id }
            });
            await commonService.bulkInsert('orders_reference', filteredProducts);
            sendSuccessResponse(messages.PRODUCTS_ADDED_FOR_QUOTATION, HttpStatus.CREATED, true, res);
        } catch (error) {
            if (error.code && error.code === 'ER_NO_REFERENCED_ROW_2') {
                error = "No product found.";
            }
            throwAnError(error, res);
        }
    }

    async deleteProduct(req: Request, res: Response) {
        try {
            let commonService = new CommonService('orderReference');

            // Order deletion
            await commonService.remove(req.body.order_reference_id);
            sendSuccessResponse(messages.ORDER_PRODUCT_REMOVED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async quotationProducts(req: Request, res: Response) {
        try {
            const catalogService = new CatalogService();
            let data: any = await catalogService.getQuotationProducts(req.user.id);
            let sendingData: { product_count: number, projectProducts: Array<any> } = {
                product_count: 0,
                projectProducts: []
            }
            sendingData.product_count = data[1];
            sendingData.projectProducts = data[0].map((el: any) => {
                let product_attributes: Array<any> = [];
                if (el.product.product_attribute.length > 0) {
                    product_attributes = _.without(el.product.product_attribute.map((attr: any) => {
                        let attr_type: number = 0;
                        switch (attr.attributes.name) {
                            case 'Company name':
                                attr_type = 0;
                                break;
                            case 'Collection':
                                attr_type = 1;
                                break;
                            case 'Dimensions':
                                attr_type = 2;
                                break;
                            case 'SKU':
                                attr_type = 3;
                                break;
                            case 'Units':
                                attr_type = 4;
                                break;
                            default:
                                attr_type = -1;
                                break;
                        }
                        if (attr_type === -1) return 0;
                        if (_.isNull(attr.attribute_value)) return 0;
                        return {
                            product_attr_id: attr.id,
                            attr_name: attr.attributes.name,
                            attr_value: attr.attribute_value.attribute_value,
                            attr_type
                        }
                    }), 0);
                }
                const product_units: Array<any> = _.without(product_attributes.map((attr: any) => {
                    if (attr.attr_type == 4) {
                        return {
                            label: attr.attr_value,
                            value: attr.attr_value,
                        };
                    }
                    else return 0;
                }), 0);
                return {
                    order_ref_id: el.id,
                    product: {
                        name: el.product.name,
                        feature_image: el.product.feature_image,
                        product_units,
                        product_attributes
                    }
                }
            });
            res.status(HttpStatus.OK).send({ success: true, data: sendingData });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    createAnOrder = async (req: Request, res: Response) => {
        try {
            // step-1: check wheather user is verified or not
            if (req.user.status !== '1') throw errors.USER_IS_NOT_VERFIED;
            const data = _.pick(req.body, ['orders', 'project_id']);
            // const data = _.pick(req.body, ['orders', 'project_id', 'shippingAddress']);
            // step-2: check for project is user's or not
            let commonService = new CommonService('project');
            const { 0: project } = await commonService.getByOptions({
                user_id: req.user.id,
                id: data.project_id
            });
            if (!project) throw errors.NO_PROJECT_FOUND;

            // step-3: insert shipping address for every orders
            commonService = new CommonService('orderShippingAddress');
            // const shipping_addresses: Array<any> = [];
            // data.shippingAddress.user_id = req.user.id;
            //data.orders.filter((el: any) => shipping_addresses.push(data.shippingAddress));
            // const insertedShippingAddress: any = await commonService.insertMany(shipping_addresses);
            // const insertedShippingAddress: any = await commonService.bulkInsert('order_shipping_address', shipping_addresses);
            //const insertedShippingAddress: any = await commonService.bulkInsertWithForOf('orderShippingAddress', shipping_addresses);

            // step-4: removing redundant order_refereces
            const quoteSer = new QuoteService();
            const sameOrderRef: { filteredOrderRef: Array<number | string>, sameOrderRef: Array<any> } = await quoteSer.checkingForSameOrderRef(data.orders, req.user.id, req.body.project_id);
            if (sameOrderRef.filteredOrderRef.length > 0) {
                // step-5: updating orders with project_id if got unique
                await commonService.updateMultiple('orders_reference', sameOrderRef.filteredOrderRef, { project_id: data.project_id });
            }

            // step-6: inserting order_products
            const eta = moment().add('7', 'd').toDate();
            const order_set_id = await this.uuidv4();
            let orders: Array<any> = data.orders.map((order: any) => {
                let order_ref_id = order.order_ref_id;
                let ifGot = sameOrderRef.sameOrderRef.find(x => x.for_id == order.order_ref_id);
                if (ifGot) {
                    order_ref_id = ifGot.order_ref_id;
                }
                return {
                    order_ref_id,
                    quantity: order.quantity,
                    unit: order.unit,
                    special_instructions: order.special_instructions,
                    eta,
                    order_set_id
                }
            });
            
            console.log(orders);
            const insertedOrders: any = await commonService.bulkInsertWithForOf('orders', orders, true);
            console.log('insertedOrders', insertedOrders);
            const order_data = {
                order_id: order_set_id
            }

            // inserting notification
            await notificationService.insert({
                to: [req.user.id],
                message: `${req.user.first_name} requested for quote with order_id: ${order_set_id}`,
                url: config.notificationDefaultUrl.url,
                isRead: [0]
            });

            // inserting notification for admin
            const commSer = new CommonService();
            const adminIds = commSer.getAdminIds();
            await notificationService.insert({
                to: [adminIds],
                message: `${req.user.first_name} requested for quote with order_id: ${order_set_id}`,
                url: config.notificationDefaultUrl.url,
                isRead: [0]
            });

            res.status(HttpStatus.CREATED).send({
                success: true,
                message: messages.ORDER_PLACED,
                code: HttpStatus.CREATED,
                data: order_data
            });

            // step-7: sending a mail to admin
            let adminEmails = await commSer.getAdminEmail();
            process.nextTick(async () => {
                const quoteService = new QuoteService();
                const orderDetails = await quoteService.getOrderBySetId(order_set_id);
                console.log(JSON.stringify(orderDetails));
                const MailObj = new Mail();
                adminEmails = adminEmails.split(',');
                const adminData = {
                    logo: `${config.emailUrls.emailHeaderLogo}`,
                    team: `${config.emailUrls.emailFooterTeam}`,
                    userName: orderDetails[0].orderRef.user.first_name,
                    data: orderDetails,
                    designerId: orderDetails[0].orderRef.user.id
                    // productIds: user.primary_mobile_number
                }
                const admin_template = await MailObj.htmlGenerate(res, 'quotation/quotation-request-admin-notify', adminData);
                const mailSubject = 'Aqsit designer request for quotation';
                MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);
            });
        } catch (error) {
            console.log('error', error);
            throwAnError(error, res);
        }
    }


    async placeAnOrder(req: Request, res: Response) {
        try {
            const body = _.pick(req.body, ['order_id', 'transaction_id']);
            const where = { order_id: body.order_id };
            let errorArray: string[] = [];
            let commonSer = new CommonService('orderBillingAddress');
            // check if order has billing address
            const { 0: billingAddrs } = await commonSer.getByOptions({ where });
            if (!billingAddrs) errorArray.push(errors.NO_ORDER_BILING_ADDRESS_FOUND);
            // insert transaction_id
            commonSer = new CommonService('orderTransaction');
            await commonSer.insert({
                transaction_id: body.transaction_id,
                order_id: body.order_id,
                by_admin: req.user.user_role == '2' ? '1' : '0'
            });
            // update order_status
            commonSer = new CommonService('orders');
            const data: Orders = await commonSer.getById(body.order_id);
            data.order_status = '3';
            await commonSer.update(data);

            // inserting notification
            await notificationService.insert([
                {
                    to: [req.user.id],
                    message: `${req.user.first_name} place an order: ${body.order_id}`,
                    url: config.notificationDefaultUrl.url,
                    isRead: [0]
                }, {
                    to: [req.user.id],
                    message: `${req.user.first_name} has added transaction id with ${body.transaction_id} to order: ${body.order_id}`,
                    url: config.notificationDefaultUrl.url,
                    isRead: [0]
                }
            ]);

            // inserting notification for admin
            const adminIds = commSer.getAdminIds();
            await notificationService.insert([
                {
                    to: [adminIds],
                    message: `${req.user.first_name} place an order: ${body.order_id}`,
                    url: config.notificationDefaultUrl.url,
                    isRead: [0]
                }, {
                    to: [adminIds],
                    message: `${req.user.first_name} has added transaction id with ${body.transaction_id} to order: ${body.order_id}`,
                    url: config.notificationDefaultUrl.url,
                    isRead: [0]
                }
            ]);

            // send response
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message: messages.ORDER_PLACED_SUCCESSFULLY,
                data
            });

            // step-7: sending a mail to admin
            let adminEmails = await commSer.getAdminEmail();
            process.nextTick(async () => {
                let lastName = req.user.last_name ? req.user.last_name : '';
                const MailObj = new Mail();
                adminEmails = adminEmails.split(',');
                const adminData = {
                    logo: `${config.emailUrls.emailHeaderLogo}`,
                    team: `${config.emailUrls.emailFooterTeam}`,
                    userName: `${req.user.first_name} ${lastName}`,
                    transactionId: body.transaction_id,
                    orderId: body.order_id
                }
                const admin_template = await MailObj.htmlGenerate(res, 'quotation/transactionId-admin-notify', adminData);
                const mailSubject = 'Aqsit designer updated transactionId';
                MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async requestForPricing(req: Request, res: Response) {
        try {
            // get product
            const commonService = new CommonService('requestForPricing');
            const { 0: product } = await commonService.getByOptions({
                where: {
                    product_id: req.body.product_id,
                    user_id: req.user.id,
                    status: '0'
                }
            });
            if (product) throw errors.ALREADY_ASKED_FOR_PRICING;
            // insert
            await commonService.insert({
                product_id: req.body.product_id,
                user_id: req.user.id,
                quantity: req.body.quantity
            });
            // insert notification
            await notificationService.insert({
                to: [req.user.id],
                message: `${req.user.first_name} has asked for pricing of the product: ${req.body.product_id}`,
                url: `${config.notificationUrls.productDetailPage}${req.body.product_id}`,
                isRead: [0]
            });

            //get ProductData
            const productSer = new CommonService('products');
            const { 0: productDetails } = await productSer.getByOptions({
                where: {
                    id: req.body.product_id
                }
            });
            
            // insert notification for admin
            const adminIds = commSer.getAdminIds();
            await notificationService.insert({
                to: [adminIds],
                message: `${req.user.first_name} has asked for pricing of the product: ${req.body.product_id}`,
                url: `${config.notificationUrls.productDetailPage}${req.body.product_id}`,
                isRead: [0]
            });
            // send mail to admin
            let adminEmails = await commSer.getAdminEmail();
            const MailObj = new Mail();
            adminEmails = adminEmails.split(',');
            const mailData = {
                logo: `${config.emailUrls.emailHeaderLogo}`,
                team: `${config.emailUrls.emailFooterTeam}`,
                userName: req.user.first_name,
                productname: productDetails.name,
                sku: productDetails.sku,
                quantity: req.body.quantity
            }
            const admin_template = await MailObj.htmlGenerate(res, 'RFP/rfp-admin-notify', mailData);
            const mailSubject = 'Aqsit designer requset for pricing';
            MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);

            sendSuccessResponse(messages.REQUESTED_FOR_PRICING, HttpStatus.CREATED, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }


    async getAllPricing(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['status', 'pageNumber', 'recordPerPage', 'orderBy']);
            const data = await new CatalogService().getAllPricing(query);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async sendPricing(req: Request, res: Response) {
        try {
            const commonService = new CommonService('requestForPricing');
            const { 0: pricing } = await commonService.customQueryWithMultiJoin('RequestForPricing', {
                id: req.body.pricing_id
            }, ['user', 'product']);
            if (!pricing) throw errors.NO_REQUEST_FOR_PRICING_FOUND;
            pricing.price = req.body.price;
            pricing.status = '1';
            const newPricing = await commonService.update(pricing);
            process.nextTick(async () => {
                await sendEmailForRequestForPricing({ user: pricing.user, pricing: newPricing });
            });
            console.log(pricing);
            await notificationService.insert({
                to: [pricing.user.id],
                message: `Hey ${pricing.user.first_name} ${pricing.user.first_name}, the pricing for the ${pricing.product.name} has been sent on your mail`,
                url: '/product-detail/{{pricing.product.id}}',
                isRead: [0]
            });
            sendSuccessResponse(messages.PRICING_SENT, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async exposeOrder(req: Request, res: Response) {
        try {
            const quoteService = new QuoteService();
            let raw_data = await quoteService.getOrderBySetId(req.params.order_id);
            if (!raw_data) throw errors.NO_ORDER_FOUND;
            if (raw_data[0].orderRef.user.id !== req.user.id) throw errors.NO_ORDER_FOUND;

            const data: any = {
                products: raw_data.map((el: any) => {
                    return el.orderRef.product
                }),
                user: raw_data[0].orderRef.user,
                shippingAddress: raw_data[0].orderShippingAddress,
                eta: raw_data[0].eta
            };
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async saveBillingAddress(req: Request, res: Response) {
        try {
            const data = _.pick(req.body, ['contact_person_name', 'address_line1', 'address_line2', 'landmark', 'city', 'pin_code', 'phone_number', 'order_id']);
            let commonSer = new CommonService('orderBillingAddress');
            // check if already added billingAddress
            const { 0: billingAddress }: OrderBillingAddress[] = await commonSer.getByOptions({
                where: { order_id: data.order_id }
            });
            let message: string = messages.ORDER_BILLING_ADDRESS_INSERTED;
            let result: any;
            // if not than insert
            if (!billingAddress) {
                result = await commonSer.insert(data);
            } else {
                // else update
                billingAddress.address_line1 = data.address_line1;
                billingAddress.address_line2 = data.address_line2;
                billingAddress.city = data.city;
                billingAddress.contact_person_name = data.contact_person_name;
                billingAddress.landmark = data.landmark;
                billingAddress.phone_number = data.phone_number;
                billingAddress.pin_code = data.pin_code;

                result = await commonSer.update(billingAddress);
                message = messages.ORDER_BILLING_ADDRESS_UPDATED;
            }
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message,
                data: result
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async updateShippingAddress(req: Request, res: Response) {
        try {
            const sippping_addressId = req.body.order_shipping_address_id;
            const commonSer = new CommonService('orderShippingAddress');
            let data:any = {};
            if(sippping_addressId) {
                const { 0: shippin_addr }: OrderShippingAddress[] = await commonSer.getByOptions({
                    where: {
                        user_id: req.user.id,
                        id: req.body.order_shipping_address_id
                    }
                });
                shippin_addr.business_name = req.body.business_name;
                shippin_addr.address_line1 = req.body.address_line1;
                shippin_addr.address_line2 = req.body.address_line2 ? req.body.address_line2 : shippin_addr.address_line2;
                shippin_addr.city = req.body.city;
                shippin_addr.pin_code = req.body.pin_code;
                shippin_addr.primary_mobile_number = req.body.primary_mobile_number;
                shippin_addr.secondary_mobile_number = req.body.secondary_mobile_number ? req.body.secondary_mobile_number : shippin_addr.secondary_mobile_number;
                shippin_addr.landmark = req.body.landmark;
                shippin_addr.contact_person_name = req.body.contact_person_name;
                data = await commonSer.update(shippin_addr);
            } else {
                req.body.user_id = req.user.id;
                data = await commonSer.bulkInsert('order_shipping_address', req.body);
                commonSer.updateMultiple('orders',  [req.body.order_id], { order_shipping_id: data.raw.insertId });
            }
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message: messages.ORDER_SHIPPING_ADDRESS_UPDATED,
                data
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async billingSameAsShippingAddress(req: Request, res: Response) {
        try {
            // check weather shipping address is available
            let commonSer = new CommonService('orderShippingAddress');
            const { 0: orderShippingAddrs }: OrderShippingAddress[] = await commonSer.getByOptions({
                where: {
                    id: req.body.shipping_address_id,
                    user_id: req.user.id
                }
            });
            if (!orderShippingAddrs) throw errors.NO_ORDER_SHIPPING_ADDRESS_FOUND;
            if (_.isNull(orderShippingAddrs.contact_person_name)) throw errors.ADD_CONTACT_PERSON_NAME_IN_ORDR_SHIPPING_ADDRS;
            // check weather billing address is available
            commonSer = new CommonService('orderBillingAddress');
            let shippingAddress: any = {
                contact_person_name: orderShippingAddrs.contact_person_name,
                address_line1: orderShippingAddrs.address_line1,
                address_line2: orderShippingAddrs.address_line2,
                landmark: orderShippingAddrs.landmark,
                city: orderShippingAddrs.city,
                pin_code: orderShippingAddrs.pin_code,
                phone_number: orderShippingAddrs.primary_mobile_number,
                order_id: req.body.order_id
            }
            const { 0: billingAddress }: any = await commonSer.getByOptions({
                where: { order_id: req.body.order_id }
            });
            let data: any;
            // insert case
            if (!billingAddress) {
                data = await commonSer.insert(shippingAddress);
            } else { // update case
                const billingAddressKeys: Array<string> = Object.keys(billingAddress);

                billingAddressKeys.forEach((key: string) => {
                    if (key !== 'order_id' && Object.prototype.hasOwnProperty.call(shippingAddress, key)) {
                        billingAddress[key] = shippingAddress[key];
                    }
                });
                await commonSer.update(billingAddress);
                data = billingAddress;
            }
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                message: messages.ORDER_BILLING_ADDRESS_IS_COPIED,
                data
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    // For admin only
    async getOrders(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['status', 'pageNumber', 'recordPerPage']);
            const quoteSer = new QuoteService();
            const orders = await quoteSer.getOrders(query);
            sendSuccessResponse(orders, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * Get Order Details
     * @param req order id
     * @param res
     */
    async getOrderDetails(req: Request, res: Response) {
        try {
            const quoteService = new QuoteService();
            let raw_data = await quoteService.getOrderDetails(req.params.id);
            if (!raw_data) throw errors.NO_ORDER_FOUND;
            // raw_data['slider_images'] = (raw_data.slider_images.length > 0) ? raw_data.slider_images.split(',') : [];
            sendSuccessResponse(raw_data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /** 
     * Set Quote Order with amount and status = 2
     * @param req quotationAmount = price, status = 2
     * @param res 
     */
    async quoteOrder(req: Request, res: Response) {
        try {

            const commonSer = new CommonService('orders');
            const order: Orders = await commonSer.getById(req.body.order_id);

            if (!order) throw errors.NO_ORDER_FOUND;
            order.quotationAmount = req.body.quotationAmount;
            order.order_status = '2';
            await commonSer.update(order);

            // send email to user of quotation with pricing [START] ***********
            const quoteService = new QuoteService();
            let orderDdata = await quoteService.getOrderQuote(req.body.order_id);
            if (orderDdata) {
                console.log('req.body.quotationAmount', orderDdata);
                const orderData = orderDdata;
                const product_name = orderDdata.orderRef.product.name;
                const feature_image = orderDdata.orderRef.product.feature_image;
                const user_first_name = orderDdata.orderRef.user.first_name;
                const user_email = orderDdata.orderRef.user.email;
                const date = moment(orderDdata.updatedDate).format('DD MMM YYYY');

                // const orders_quotationAmount = req.body.quotationAmount;
                const orders_quantity = orderDdata.quantity;

                let productAttribute = orderDdata.orderRef.product.product_attribute;
                const productAttributes = productAttribute.find((el: any) => el.attributes.name === 'Brand');

                let brand = '';
                if (productAttributes) {
                    brand = productAttributes.attribute_value.attribute_value
                }
                let per_sheet: any = orderDdata.quotationAmount / orderDdata.quantity;
                per_sheet = Number.parseFloat(per_sheet).toFixed(2)
                const MailObj = new Mail();
                const mailData = {
                    logo: `${config.emailUrls.emailHeaderLogo}`,
                    //team: `${config.emailUrls.emailFooterTeam}`,
                    name: user_first_name,
                    productimage: feature_image,
                    productname: product_name,
                    brand: brand,
                    persheet: per_sheet,
                    date: date,
                    quantity: orders_quantity,
                    placeorderlink: `${config.emailUrls.quotationlink}`,
                    herelink: `${config.emailUrls.herelink}`
                };
                const html_body = await MailObj.htmlGenerate(res, 'Pricing_request/pricing_quote', mailData);
                const subject = 'Aqsit pricing request';
                const emailRes = await MailObj.sendEmail(res, user_email, subject, html_body);
            }
            /*************** Email STOP *************/

            sendSuccessResponse(messages.ORDER_PRODUCT_QOTATION_APPLIED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /** 
     * Set Quote Order with eta and status = 4
     * @param req eta = date, status = 4
     * @param res 
     */
    async setorderDeliveryStatus(req: Request, res: Response) {
        try {
            const commonSer = new CommonService('orders');
            const order: Orders = await commonSer.getById(req.body.order_id);
            if (!order) throw errors.NO_ORDER_FOUND;
            // const eta = moment(req.body.eta).format();
            // order.eta = String(eta);
            order.order_status = '4';
            await commonSer.update(order);
            sendSuccessResponse(messages.ORDER_PRODUCT_QOTATION_APPLIED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /** 
     * Set Quote Order with status = 5 to define order delivered
     * @param req status = 5 
     * @param res 
     */
    async setorderDelivered(req: Request, res: Response) {
        try {
            const commonSer = new CommonService('orders');
            const order: Orders = await commonSer.getById(req.params.id);
            if (!order) throw errors.NO_ORDER_FOUND;
            order.order_status = '5';
            await commonSer.update(order);
            sendSuccessResponse(messages.ORDER_DELIVERED_UPDATED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }


    /**
     * Adds transaction id by admin
     * @param req 
     * @param res 
     */
    async addTransactionId(req: Request, res: Response) {
        try {
            const commonSer = new CommonService('orderTransaction');
            await commonSer.insert({
                order_id: req.body.order_id,
                transaction_id: req.body.transaction_id,
                by_admin: '1'
            });
            sendSuccessResponse('Transaction ID added.', HttpStatus.CREATED, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /** [ADMIN]All record of quotation (orders) to get csv */
    async getCsvQuotation(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['startDate', 'endDate']);
            const quoteService = new QuoteService();
            let raw_data = await quoteService.getCsvQuotation(query);
            if (!raw_data) throw errors.NO_ORDER_FOUND;
            sendSuccessResponse(raw_data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /** [ADMIN]All record of order (orders) to get csv */
    async getCsvOrder(req: Request, res: Response) {
        try {
            const quoteService = new QuoteService();
            let raw_data = await quoteService.getCsvOrder();
            if (!raw_data) throw errors.NO_ORDER_FOUND;
            sendSuccessResponse(raw_data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async adminUploadFile(req: Request, res: Response, next: NextFunction) {
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
                //if (req.body.file_type == '3') {
                if (!req.body.order_id) throw errors.NO_ORDERS_SELECTED_WHILE_UPLOADING_QUOTATION;
                projectFile.order_id = Number(req.body.order_id);
                //}
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
                    user_id: req.body.user_id
                }
                //if (req.body.file_type == '3') {
                if (!req.body.order_id) throw errors.NO_ORDERS_SELECTED_WHILE_UPLOADING_QUOTATION;
                pdf['order_id'] = Number(req.body.order_id);
                //}
                console.log('pdf', pdf);
                pro_file = await commonSer.insert(pdf);
            }
            // res.status(HttpStatus.OK).send({
            //     data: { file: pro_file.file_url },
            //     success: true
            // });
            sendSuccessResponse(messages.PROJECT_FILE_UPLOADED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async adminDeleteFile(req: Request, res: Response) {
        try {
            const project_file_id = req.params.id;
            const commonSer = new CommonService('projectFiles');
            let raw_data = await commonSer.getById(project_file_id);

            const splitedfileUrl = raw_data.file_url.split("/");
            let fileName = '';
            if (splitedfileUrl.length) {
                fileName = splitedfileUrl[splitedfileUrl.length - 1];
            }
            if (!fileName) throw errors.NO_PROJECT_FILE;

            const deletedFile = await uploadFile.deleteFileFromS3(fileName);
            if (!deletedFile) throw errors.NO_PROJECT_FILE;
            let delete_data = await commonSer.remove(project_file_id);

            sendSuccessResponse(messages.PROJECT_FILE_DELETED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

}
