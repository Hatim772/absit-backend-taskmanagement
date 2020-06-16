// Third parties
import { Request, Response, NextFunction } from "express";
import _ from "lodash";
import * as HttpStatus from 'http-status-codes';

// services
import { CommonService } from "../services/common.service";

// locals
import errors from "../assets/i18n/en/errors";
import { throwAnError } from "../commonFunction/throwAnError";

export default class MoodboardMiddleware {
    constructor() { }

    async isMoodboardOwner(req: Request, res: Response, next: NextFunction) {
        try {
            let where: any = { id: req.body.moodboard_id, user_id: req.user.id };
            if (req.user.user_role == '2') {
                where = { id: req.body.moodboard_id };
            }
            const commonSer: any = new CommonService('moodboard');
            const { 0: moodboard } = await commonSer.getByOptions({ where });
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async isMoodboardOwnerWhileCloning(req: Request, res: Response, next: NextFunction) {
        try {
            const commonSer: any = new CommonService('moodboard');
            const { 0: moodboard } = await commonSer.getByOptions({
                id: req.params.moodboard_id,
                user_id: req.user.id
            });
            if (moodboard) throw errors.USER_CANT_CLONE_ITS;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async isMoodboardItemOwner(req: Request, res: Response, next: NextFunction) {
        try {
            const commonSer = new CommonService('moodboardItems');
            const { 0: moodboardItem } = await commonSer.getByOptions({
                where: { id: req.body.item_id },
                relations: ['moodboard']
            });
            if (!moodboardItem) throw errors.NO_MOODBOARD_ITEM_FOUND;
            if (moodboardItem.moodboard.user_id != req.user.id) throw errors.NO_MOODBOARD_ITEM_FOUND;
            if (_.isNull(moodboardItem.product_id)) throw errors.NO_MOODBOARD_PRODUCT_FOUND;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async isSampleOrderAuthenticated(req: Request, res: Response, next: NextFunction) {
        try {
            const commonSer = new CommonService('moodboardOrders');
            const { 0: sampleOrder } = await commonSer.getByOptions({
                where: { id: req.body.sample_order_id, user_id: req.user.id }
            });
            if (!sampleOrder) throw errors.NO_SAMPLE_ORDER_FOUND;
            return next();
        } catch (error) {
            throwAnError(error, res);
        }
    }

}