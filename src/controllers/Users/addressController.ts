import { NextFunction, Request, Response, Router } from 'express';
import * as HttpStatus from 'http-status-codes';

import messages from '../../assets/i18n/en/messages';
import errors from '../../assets/i18n/en/errors';
import { CommonService } from '../../services/common.service';
import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
export default class AddressController {
    async insertOrUpdateShippingAndBillingAddress(req: Request, res: Response, next: NextFunction) {
        try {
            const commonService = req.path==='/shippingAddress'
            ? new CommonService('usersShippingAddress')
            : new CommonService('usersBillingAddress');
            const {0: address} = await commonService.getByUserId(req.user.id);
            // update case
            if(address) {
                address.address_line1 = req.body.address_line1;
                address.address_line2 = req.body.address_line2?req.body.address_line2:null;
                address.landmark = req.body.landmark;
                address.city = req.body.city;
                address.pin_code = req.body.pin_code;
                if(req.body.shippingSameAsBilling && req.path==='/billingAddress'){
                    address.shipping_is_same_billing = '1';
                } else if(!req.body.shippingSameAsBilling && req.path==='/billingAddress'){
                    address.shipping_is_same_billing = '0';
                }
                const updatedAddress = await commonService.update(address);
                if(req.body.shippingSameAsBilling && req.path==='/billingAddress') {
                    const commonService = new CommonService('usersShippingAddress');
                    const {0: address} = await commonService.getByUserId(req.user.id);
                    if(!address) {
                        updatedAddress.shipping_is_same_billing = updatedAddress.shipping_is_same_billing=='0'?false:true;
                        updatedAddress.shippingAddress = await commonService.insert({
                            address_line1: req.body.address_line1,
                            address_line2: req.body.address_line2?req.body.address_line2:null,
                            landmark: req.body.landmark,
                            pin_code: req.body.pin_code,
                            city: req.body.city,
                            user_id: req.user.id
                        });
                        return res.status(HttpStatus.OK).send({
                            success: true,
                            message: messages.BILLING_ADDRESS_UPDATED_AND_SHIPPING_ADDRESS_ADDED,
                            data: updatedAddress
                        });
                    } else {
                        address.address_line1 = req.body.address_line1;
                        address.address_line2 = req.body.address_line2?req.body.address_line2:null;
                        address.landmark = req.body.landmark;
                        address.pin_code = req.body.pin_code;
                        address.city = req.body.city;
                        updatedAddress.shippingAddress = await commonService.update(address);
                        updatedAddress.shipping_is_same_billing = updatedAddress.shipping_is_same_billing=='0'?false:true;
                        return res.status(HttpStatus.OK).send({
                            success: true,
                            message: messages.BOTH_ADDRESS_UPDATED,
                            data: updatedAddress
                        });
                    }
                }
                updatedAddress.shipping_is_same_billing = updatedAddress.shipping_is_same_billing?(updatedAddress.shipping_is_same_billing=='0'?false:true):false;
                return res.status(HttpStatus.OK).send({
                    success: true,
                    message: req.path==='/shippingAddress'?messages.SHIPPING_ADDRESS_UPDATED:messages.BILLING_ADDRESS_UPDATED,
                    data: updatedAddress
                });
            } else {
                // insert case
                let data: any = {
                    address_line1: req.body.address_line1,
                    address_line2: req.body.address_line2?req.body.address_line2:null,
                    landmark: req.body.landmark,
                    city: req.body.city,                    
                    pin_code: req.body.pin_code,
                    user_id: req.user.id
                }
                if(req.body.shippingSameAsBilling && req.path==='/billingAddress'){
                    data.shipping_is_same_billing = '1';
                }
                await commonService.insert(data);
                if(req.body.shippingSameAsBilling && req.path==='/billingAddress') {
                    const commonService = new CommonService('usersShippingAddress');
                    await commonService.insert({
                        address_line1: req.body.address_line1,
                        address_line2: req.body.address_line2?req.body.address_line2:null,
                        landmark: req.body.landmark,
                        pin_code: req.body.pin_code,
                        city: req.body.city,
                        user_id: req.user.id
                    });
                    return sendSuccessResponse(messages.BOTH_ADDRESS_ADDED, HttpStatus.OK, true, res);
                }
                return sendSuccessResponse(req.path==='/shippingAddress'?messages.SHIPPING_ADDRESS_ADDED:messages.BILLING_ADDRESS_ADDED, HttpStatus.OK, true, res);
            }
        } catch (error) {
            let message = error.message.startsWith('ER_DUP_ENTRY')?(req.path==='/shippingAddress'?errors.USER_ALREADY_ADDED_SHIPPING_ADDRESS:errors.USER_ALREADY_ADDED_BILLING_ADDRESS):error.message;
            return sendFailureResponse(message, error.message.startsWith('ER_DUP_ENTRY')?HttpStatus.BAD_REQUEST:HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
    }

    async getShippingAndBillingAddress(req: Request, res: Response, next: NextFunction) {
        try {
            const commonService = req.path==='/shippingAddress'?new CommonService('usersShippingAddress'):new CommonService('usersBillingAddress');
            const {0: address} = await commonService.getByUserId(req.user.id);
            if(req.path==='/billingAddress' && address){
                address.shipping_is_same_billing = address.shipping_is_same_billing == '0'? false : true;
            }
            res.status(HttpStatus.OK).send({
                success: true,
                data: address?address:{}
            });
        } catch (error) {
            sendFailureResponse(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);        
        }    
    }
}