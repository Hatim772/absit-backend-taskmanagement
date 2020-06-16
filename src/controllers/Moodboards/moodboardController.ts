// third parties
import * as HttpStatus from 'http-status-codes';
import { Request, Response } from 'express';
import _ from 'lodash';

// entities
import { Colors } from '../../entities/Colors';

// locals
import config from '../../config/config';
import { sendFailureResponse, sendSuccessResponse } from '../../commonFunction/Utills';
import { throwAnError } from '../../commonFunction/throwAnError';
import * as uploadFile from '../../commonFunction/fileUpload';

// services
import { CommonService } from '../../services/common.service';
import MoodboardService from '../../services/moodboard/moodboard.service';
import NotificationsService from '../../services/notifications/notifications.service';

import { Moodboard } from '../../entities/Moodboard';
import { Tags } from '../../entities/Tags';
import { MoodboardItems } from '../../entities/MoodboardItems';
import { getRepository } from 'typeorm';
import * as fs from "fs";
import { Mail } from '../../commonFunction/mail';

// literals
const { messages, errors } = config;
const moodboardSer = new MoodboardService();
const notificationService = new NotificationsService();
const commSer = new CommonService();

export default class MoodboardController {
    constructor() { }
    // Create a blank moodboard
    async createMoodboard(req: Request, res: Response) {
        try {
            let commonService = new CommonService('moodboard');
            const moodboard: Moodboard = await commonService.insert({
                name: req.body.moodboard_name,
                description: req.body.moodboard_description,
                user_id: req.user.id
            });

            // create moodboard's named tag
            commonService = new CommonService('tags');
            const tag: Tags = await commonService.insert({ name: moodboard.name });

            // relate with moodboard
            commonService = new CommonService('moodboardTags');
            await commonService.insert({
                moodboard_id: moodboard.id,
                tag_id: tag.id
            });

            res.status(HttpStatus.CREATED).send({
                success: true,
                message: messages.MOODBOARD_CREATION,
                code: HttpStatus.CREATED,
                data: { moodboard_id: moodboard.id }
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Add image in moodboard
    async addImageToMoodboard(req: Request, res: Response) {
        const file: any = req.file;
        const image_url = req.body.moodboard_imageurl;
        let upload_image:any;
        let img:any;
        if (!file && !image_url) return sendFailureResponse(errors.NO_IMAGE_ATTACHED, HttpStatus.BAD_REQUEST, false, res);
        if(file) {
            let error_s = uploadFile.validateSingleImg(file);
            if (error_s.length > 0) return sendFailureResponse(error_s[0], HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        }
        try {
            let commonService = new CommonService('moodboard');
            const moodboard = await commonService.getByOptions({ where: { user_id: req.user.id, id: req.body.moodboard_id } });
            if (!moodboard[0]) throw errors.NO_MOODBOARD_FOUND;
            commonService = new CommonService('image');
            if(file) {
                img = await uploadFile.uploadImgToS3(file);
                upload_image = img.Location
            } else {
                upload_image = image_url;
            }
            const image = await commonService.insert({
                image_url: upload_image
            });
            commonService = new CommonService('moodboardItems');
            await commonService.insert({
                image_id: image.id,
                moodboard_id: req.body.moodboard_id
            });
            sendSuccessResponse(messages.MOODBOARD_ADD_IMAGE, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Add color in moodboard
    async addColorToMoodboard(req: Request, res: Response) {
        try {
            let commonService = new CommonService('moodboard');
            const moodboard = await commonService.getByOptions({ where: { user_id: req.user.id, id: req.body.moodboard_id } });
            if (!moodboard[0]) throw errors.NO_MOODBOARD_FOUND;

            // commonService = new CommonService('moodboardColors');
            // const moodboardColors = await commonService.getByOptions({where: {moodboard_id: req.body.moodboard_id}});
            // if(moodboardColors && moodboardColors.length >= 5) throw errors.MOODBOARD_COLORS_LIMIT;

            let data: any = _.pick(req.body, ['moodboard_id', 'moodboard_colors']);
            data = data.moodboard_colors.map((color: any) => {
                let clr = new Colors();
                clr.color = color;
                return clr;
            });
            commonService = new CommonService('color');
            let result = await commonService.insertMany(data);
            commonService = new CommonService('moodboardItems');
            result = result.map((clr: any) => {
                return {
                    moodboard_id: req.body.moodboard_id,
                    color_id: clr.id,
                }
            });
            await commonService.bulkInsert('moodboard_items', result);
            sendSuccessResponse(messages.MOODBOARD_ADD_COLOR, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Rename a moodboard
    async renameMoodboard(req: Request, res: Response) {
        try {
            const commonService = new CommonService('moodboard');
            const { 0: moodboard } = await commonService.getByOptions({
                where: {
                    id: req.body.moodboard_id,
                    user_id: req.user.id
                }
            });
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            // change tag
            await moodboardSer.changeMoodboardNameTag(req.body.moodboard_id, req.body.moodboard_name, moodboard.name);
            // now update the moodboard
            moodboard.name = req.body.moodboard_name;
            moodboard.description = req.body.moodboard_description ? req.body.moodboard_description : moodboard.description;
            await commonService.update(moodboard);
            sendSuccessResponse(messages.MOODBOARD_RENAMED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Add product in moodboard
    async addProductToMoodboard(req: Request, res: Response) {
        try {
            let commonService = new CommonService('moodboard');
            const moodboard = await commonService.getByOptions({ where: { user_id: req.user.id, id: req.body.moodboard_id } });
            if (!moodboard[0]) throw errors.NO_MOODBOARD_FOUND;
            commonService = new CommonService('moodboardItems');
            const { 0: ifGot }: any = await commonService.getByOptions({
                where: {
                    moodboard_id: req.body.moodboard_id,
                    product_id: req.body.product_id
                }
            });
            if (ifGot) throw errors.PRODUCT_ALREADY_ADDED_TO_MOODBOARD;
            // add tags
            await moodboardSer.addProductSTagToMoodboard(req.body.product_id, req.body.moodboard_id);
            // add product
            await commonService.insert({
                moodboard_id: req.body.moodboard_id,
                product_id: req.body.product_id
            });
            sendSuccessResponse(messages.MOODBOARD_ADD_PRODUCT, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // remove moodboard Items
    removeMoodboardItem = async (req: Request, res: Response) => {
        try {
            const commonSer = new CommonService('moodboard');
            const result: any = await this.getMoodboardItems(req.body.moodboard_id, req.body.item_ids);
            // removing product's tag from moodboard
            if (result.productIds.length > 0) {
                await moodboardSer.removeProductSTagFromMoodboard(result.productIds, req.body.moodboard_id);
            }
            // removing items from moodboard
            await commonSer.removeMultipleFromEntity('moodboard_items', result.items);
            sendSuccessResponse(messages.MOODBOARD_REMOVED_ITEM, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Favourite a moodboard's Items
    async favouriteProduct(req: Request, res: Response) {
        try {
            const commonService = new CommonService('moodboardItems');
            const item: MoodboardItems = await commonService.getById(req.body.item_id);
            item.is_favourite = req.body.is_favourite;
            await commonService.update(item);
            sendSuccessResponse(req.body.is_favourite === '0' ? messages.MOODBOARD_PRODUCT_UNFAVOURITE : messages.MOODBOARD_PRODUCT_FAVOURITE, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // [NOLONGERNEEDED]Favourite a moodboard
    // async favouriteMoodboard(req: Request, res: Response){
    //     try {
    //         let commonService = new CommonService('moodboard');
    //         const moodboard = await commonService.getById(req.body.moodboard_id);
    //         if(!moodboard) throw errors.NO_MOODBOARD_FOUND;
    //         moodboard.is_favourite = req.body.is_favourite;
    //         await commonService.update(moodboard);
    //         sendSuccessResponse(req.body.is_favourite==='0'?messages.MOODBOARD_UNFAVOURITE:messages.MOODBOARD_FAVOURITE, HttpStatus.OK, true, res);
    //     } catch (error) {
    //         throwAnError(error, res);
    //     }
    // }
    // Delete a moodboard
    async deleteMoodboard(req: Request, res: Response) {
        try {
            const commonService = new CommonService('moodboard');
            const { 0: moodboard } = await commonService.getByOptions({ where: { user_id: req.user.id, id: req.body.moodboard_id } });
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            await commonService.remove(req.body.moodboard_id);
            sendSuccessResponse(messages.MOODBOARD_DELETED, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Request for moodboard status public
    async requestForMoodboardPublic(req: Request, res: Response) {
        try {
            // check user
            if (req.user.status !== '1') throw errors.USER_IS_NOT_VERFIED;
            // check user's moodboard
            const commonSer = new CommonService('moodboard');
            const { 0: moodboard } = await commonSer.getByOptions({
                where: {
                    id: req.body.moodboard_id,
                    user_id: req.user.id
                }
            });
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            if (moodboard.requested_for_public == '1') throw errors.ALREADY_REQUESTED_FOR_MOODBOARD_PUBLICITY;
            moodboard.requested_for_public = '1';
            await commonSer.update(moodboard);

            // inserting notification
            await notificationService.insert({
                to: [req.user.id],
                message: `your request for ${moodboard.name} has been send successfully to admin for public.`,
                //message: `You've requested to public the moodboard with id:${moodboard.id}.`,
                // params: [{
                //     moodboard_id: moodboard.id
                // }],
                url: config.notificationDefaultUrl.url,
                isRead: [0]
            });

            // inserting notification for admin
            const adminIds = commonSer.getAdminIds();
            await notificationService.insert({
                to: [adminIds],
                message: `${req.user.first_name} ${req.user.last_name} has sent you request to make ${moodboard.name} public`,
                // params: [{
                //     moodboard_id: moodboard.id
                // }]
                url: config.notificationDefaultUrl.url,
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
                moodboardName: moodboard.name
            }
            const admin_template = await MailObj.htmlGenerate(res, 'Moodboard/request-public-admin-notify', mailData);
            const mailSubject = 'Aqsit designer requset to make moodboard public';
            MailObj.sendEmail(res, adminEmails, mailSubject, admin_template);

            sendSuccessResponse(messages.REQUESTED_FOR_PUBLIC, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // [ADMIN]Make moodboard public
    async getAllTrendingMoodboard(req: Request, res: Response) {
        try {
            if (req.user.user_role !== '2') throw errors.NO_ADMIN_FOUND;
            // check user's moodboard
            const commonSer = new CommonService('moodboard');
            const moodboards = await commonSer.getByOptions({ where: { is_trending: '1' } });
            sendSuccessResponse(moodboards, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // [ADMIN]Make moodboard to tranding 
    async makeMoodboardTrending(req: Request, res: Response) {
        try {
            // check user's moodboard
            const commonSer = new CommonService('moodboard');
            if (req.body.status === '1') {
                const moodboardCount = await new CommonService('moodboard').getCount('moodboard', { where: 'is_trending=:is_trending ', params: { is_trending: '1' } });
                if (moodboardCount >= 10) {
                    throw errors.LIMIT_REACHED_MOODBOARD_TRENDING;
                }
            }
            const moodboard = await commonSer.getById(req.params.moodboard_id);
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            let status = '0';
            let message = messages.MOODBOARD_TRENDED;
            if (req.body.status === '1') {
                status = req.body.status;
                message = messages.MOODBOARD_REMOVE_FROM_TRENDED;
            }
            moodboard.is_trending = status;
            await commonSer.update(moodboard);
            sendSuccessResponse(message, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // [ADMIN]Make moodboard public
    async makeMoodboardPublic(req: Request, res: Response) {
        try {
            // check user's moodboard
            const commonSer = new CommonService('moodboard');
            // const moodboard = await commonSer.getById(req.body.moodboard_id);
            const { 0: moodboard } = await commonSer.customQueryWithMultiJoin('moodboard', {
                id: req.body.moodboard_id
            }, ['user']);
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            let messageNotification;
            let returnMessage;
            if (req.body.status === '1') {
                moodboard.requested_for_public = '0';
                moodboard.status = req.body.status;
                messageNotification = ` Hey ${moodboard.user.first_name} ${moodboard.user.last_name}, Congrats! Your moodboard ${moodboard.name} has been made public.`;
                returnMessage = messages.MOODBOARD_CHANGED_TO_PUBLIC
            } else if (req.body.status === '2') {
                moodboard.requested_for_public = '0';
                returnMessage = messages.MOODBOARD_CHANGED_TO_DECLINED;
            } else if(req.body.status === '0') {
                moodboard.status = req.body.status;
                returnMessage = messages.MOODBOARD_CHANGED_TO_PRIVATE
            }
            await commonSer.update(moodboard);
            if(req.body.status === '1') {
            // inserting notification
                await notificationService.insert({
                    to: [moodboard.user_id],
                    message: messageNotification,
                    // params: [{
                    //     moodboard_id: moodboard.id
                    // }]
                    url: `/moodboard/edit/${moodboard.id}`,
                    isRead: [0]
                });
            }
            sendSuccessResponse(returnMessage, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // [ADMIN] Get all requested for public
    async getAllRequestedForPublic(req: Request, res: Response) {
        try {
            const body = _.pick(req.query, ['pageNumber', 'recordPerPage']);
            const data = await moodboardSer.getAllRequestedForPublic(body);

            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Show all user's moodboards or collections
    async getUserSMoodboardsOrCollections(req: Request, res: Response) {
        try {
            if (!Object.prototype.hasOwnProperty.call(req.query, 'type')
                || (req.query.type !== '1' && req.query.type !== '2')) throw "Invalid request!";
            let data: any;
            if (req.path.startsWith('/getAll')) {
                data = await moodboardSer.getUserSMoodboardsOrCollections(req.user.id, req.query.type);
            } else {
                data = await moodboardSer.getUserSMoodboardsOrCollections(req.user.id, req.query.type, true);
            }
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Show user's moodboard
    getById = async (req: Request, res: Response) => {
        try {
            const commonService = new CommonService('moodboard');
            const moodBoard = await commonService.getById(req.params.moodboard_id);
            if (!moodBoard) throw errors.NO_MOODBOARD_FOUND;
            if (req.path.startsWith('/getById')) {
                if (moodBoard && (moodBoard.user_id !== req.user.id)) throw errors.NO_MOODBOARD_FOUND;
            } else {
                // if (moodBoard.status !== '1') throw errors.NO_MOODBOARD_FOUND;
                // update moodboard's views
                await this.updateMoodboardView(req.ip, req.params.moodboard_id);
            }
            // step-2: get moodboard
            let data: any = await moodboardSer.getMoodboardData(req.params.moodboard_id);
            if (data.moodboardItem.length > 0) {
                data.moodboardItem.map((item: any) => {
                    if (item.product && item.product.product_category.length < 1) {
                        item.product.product_category = null;
                        return;
                    }
                    if (item.product && item.product.product_category.length > 0) {
                        item.product.product_category = item.product.product_category[0].category_id;
                    }
                });
                let moodboardItem = data.moodboardItem;
                data.moodboardItem = { LABELED: [], UNLABELED: [] };
                data.moodboardItem.UNLABELED = moodboardItem.filter((item: any) => item.label.id == 1);
                // remove label from unlabeled
                data.moodboardItem.UNLABELED = data.moodboardItem.UNLABELED.map((item: any) => _.omit(item, "label"));
                let groupedBy = moodboardItem.filter((item: any) => item.label.id !== 1);
                groupedBy = _.groupBy(groupedBy, (item: any) => item.label.label);
                Object.keys(groupedBy).forEach((key: any) => {
                    data.moodboardItem.LABELED.push({
                        labelId: groupedBy[key][0].label.id,
                        labelName: groupedBy[key][0].label.label,
                        items: groupedBy[key].map((el: any) => _.omit(el, "label"))
                    });
                });
            }
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Get all public moodboards 
    async listPublicMoodboards(req: Request, res: Response) {
        try {
            let data: any;
            if (req.body.sortBy) {
                data = await moodboardSer.getPublicMoodboards(req.body.pageNumber, req.body.recordPerPage, req.body.sortBy);
            } else {
                data = await moodboardSer.getPublicMoodboards(req.body.pageNumber, req.body.recordPerPage);
            }
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * Get moodboards by listview
    */
    async getByListView(req: Request, res: Response) {
        try {
            const body = _.pick(req.query, ['pageNumber', 'recordPerPage', 'keyword']);
            const data = await moodboardSer.getListView(body);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Get moodboard's titles 
    async getAllMoodboardTitles(req: Request, res: Response) {
        try {
            const commonService = new CommonService('moodboard');
            const data = await commonService.getByOptions({ where: { user_id: req.user.id }, select: ['id', 'name'] });
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // get moodboards by user_id [used for other users]
    async getUserSMoodboards(req: Request, res: Response) {
        try {
            const data = await moodboardSer.getUserSMoodboardsOrCollections(req.params.user_id, undefined, undefined, true) || [];
            res.status(HttpStatus.OK).send({
                success: true,
                code: HttpStatus.OK,
                data
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    async getMoodboardTags(req: Request, res: Response) {
        try {
            let data: any;
            // check weather user is attached to request
            if (req.user) {
                if (!req.query.type && (req.query.type != '1' || req.query.type != '2')) throw errors.INVALID_REQUEST;
                let options = {
                    user_id: req.user.id,
                    type: req.query.type
                }
                data = await moodboardSer.getMoodboardsTags(req.params.tag, options);
            } else {
                data = await moodboardSer.getMoodboardsTags(req.params.tag);
            }
            data = data.map((tag: any) => {
                return { tag_id: tag.tag_id, tag_name: tag.tag.name }
            });
            data = _.uniqBy(data, 'tag_name');
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    async findMoodboardByTag(req: Request, res: Response) {
        try {
            let data: any;
            let options: any = {
                pageNumber: req.body.pageNumber,
                recordPerPage: req.body.recordPerPage
            };
            if (req.user) {
                options.user_id = req.user.id;
                if (!req.query.type && (req.query.type != '1' || req.query.type != '2')) throw errors.INVALID_REQUEST;
                options.type = req.query.type;
            }
            if (req.body.sortBy) {
                options.sortBy = req.body.sortBy;
                data = await moodboardSer.getMoodboardsByTag(req.body.tag_id, options);
            } else {
                data = await moodboardSer.getMoodboardsByTag(req.body.tag_id, options);
            }
            sendSuccessResponse(data.data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Clone a moodboard [????  add moodboard tags too ????]
    async cloneAMoodboard(req: Request, res: Response) {
        try {
            const cloneSuccess = await moodboardSer.cloneAMoodboard(req.user.id, req.params.moodboard_id);
            sendSuccessResponse(cloneSuccess, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Create a label for moodboard
    async createAlabel(req: Request, res: Response) {
        try {
            let commonService = new CommonService('moodboard');
            const moodboard = await commonService.getByOptions({
                where: {
                    user_id: req.user.id,
                    id: req.body.moodboard_id
                }
            });
            if (moodboard.length < 1) throw errors.NO_MOODBOARD_FOUND;
            commonService = new CommonService('label');
            const { 0: label } = await commonService.getByOptions({
                label: req.body.moodboard_label,
                moodboard_id: req.body.moodboard_id,
                user_id: req.user.id
            });
            if (label) throw errors.MOODBOARD_LABEL_ALREADY_CREATED;
            const labelData  = await commonService.insert({
                label: req.body.moodboard_label,
                moodboard_id: req.body.moodboard_id,
                user_id: req.user.id
            });
            sendSuccessResponse(labelData.id , HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Add label
    async addLabelToProducts(req: Request, res: Response) {
        try {
            // check if label is generated by same user
            let commonService: any = new CommonService('moodboard');
            const { 0: moodBoard }: any = await commonService.getByOptions({
                where: { id: req.body.moodboard_id, user_id: req.user.id }
            });
            if (!moodBoard) throw errors.NO_MOODBOARD_FOUND;
            commonService = new CommonService('label');
            if (req.body.label_id !== 1) {
                const { 0: label } = await commonService.getByOptions({
                    where: {
                        user_id: req.user.id,
                        id: req.body.label_id
                    }
                });
                if (!label) throw errors.NO_MOODBOARD_LABEL_FOUND;
            }
            const data = await moodboardSer.labelMoodboardProducts(req.body.label_id, req.body.items);
            if (data.raw.affectedRows === 0) throw errors.NO_MOODBOARD_PRODUCTS_PROVIDED;
            sendSuccessResponse(messages.LABEL_ATTACHED_TO_MOODBOARD_PRODUCTS, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Rename a label
    async renameLabel(req: Request, res: Response) {
        try {
            let commonService = new CommonService('label');
            const label = await commonService.getById(req.body.moodboard_label_id);
            if (!label) throw errors.NO_MOODBOARD_LABEL_FOUND;
            label.label = req.body.moodboard_label;
            const renamedLabel = await commonService.update(label);
            res.status(HttpStatus.OK).send({
                success: true,
                message: messages.LABEL_RENAMED,
                data: { moodboard_label: renamedLabel.moodboard_label }
            });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    // Delete a label
    async deleteLabel(req: Request, res: Response) {
        try {
            let commonService = new CommonService('label');
            const label = await commonService.getById(req.body.moodboard_label_id);
            console.log('dsfsfsdfsdfsffsfsdfds', label);
            if (!label) throw errors.NO_MOODBOARD_LABEL_FOUND;
            // update moodboard_label_id to all moodboard_products with 1
            await moodboardSer.updateMoodboardLabelId(1, label.moodboard_id);
            await commonService.remove(label);
            sendSuccessResponse(messages.LABEL_REMOVED, HttpStatus.OK, true, res);
        } catch (error) {
            console.log(error);
            throwAnError(error, res);
        }
    }
    // Get all labels
    async getLabels(req: Request, res: Response) {
        try {
            let data = await moodboardSer.getLabels(req.params.moodboard_id, req.user.id);
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * Top search
     */
    async mainSearch(req: Request, res: Response) {
        try {
            const data = await moodboardSer.mainSearch(req.query.tag);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * Top search
     */
    async getByTags(req: Request, res: Response) {
        try {
            let body = _.pick(req.query, ['tag_ids']);
            body.tag_ids = body.tag_ids.split(',');
            const data = await moodboardSer.getByTags(body.tag_ids);
            sendSuccessResponse(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
    /**
     * [PRIVATE] Utility functions 
     */
    private async updateMoodboardView(ip: string, moodboard_id: number | string) {
        try {
            const commonService = new CommonService('moodboardViews');
            const view = await commonService.getByOptions({ where: { ip, moodboard_id } });
            if (view[0]) return Promise.resolve();
            await commonService.insert({ ip, moodboard_id });
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }
    private async getMoodboardItems(moodboard_id: number, ids: Array<number>): Promise<{ items: Array<number>, productIds: Array<number> } | string> {
        try {
            let moodboardData: any = await getRepository('moodboard_items')
                .createQueryBuilder('m_item')
                .select(['m_item.id', 'm_item.product_id'])
                .whereInIds(ids)
                .andWhere("moodboard_id=:mb_id", { mb_id: moodboard_id })
                .getMany();
            if (moodboardData.length < 1) throw errors.NO_MOODBOARD_DATA_FOUND;
            // prductIds for tags related operations
            let productIds: Array<number> = _.without(moodboardData.map((el: any) => {
                if (!_.isNull(el.product_id)) return el.product_id;
                else return 0;
            }), 0);
            // editing moodboardData for id only
            moodboardData = moodboardData.map((el: any) => el.id);
            const items: Array<number> = _.intersection(moodboardData, ids);
            if (items.length < 1) throw errors.NO_MOODBOARD_DATA_FOUND;
            return Promise.resolve({ items, productIds });
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async searchListView(req: Request, res: Response) {
        try {
            const moodboardSer = new MoodboardService();
            let data = [];
            let userData = await moodboardSer.searchListViewUsers(req.query.text);
            userData = userData.map((user: any) => {
                let last_name = user.user.last_name ? user.user.last_name : '';
                return { "tag_name": user.user.first_name + ' ' + last_name, "tag_id": user.user.first_name + ' ' + last_name };
            });
            let moodboardData = await moodboardSer.searchListViewMoodboards(req.query.text);
            moodboardData = moodboardData.map((moodboard: any) => {
                return { "tag_name": moodboard.name, "tag_id": moodboard.name };
            });
            data = moodboardData.concat(userData);
            res.status(HttpStatus.OK).send({ success: true, result: data });
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async getTrendingMoodboards(req: Request, res: Response) {
        try {
            const moodboardSer = new MoodboardService();
            let trendingMoodboard = await moodboardSer.getTrendingMoodboards();

            res.status(HttpStatus.OK).send({ success: true, result: trendingMoodboard });
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // [ADMIN]All record of moodboard orders to get csv
    async getCsvRecordOfMoodboardOrders(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['startDate', 'endDate']);
            const moodboardSer = new MoodboardService();
            const moodboard = await moodboardSer.getAllRecordsOfOrder(query);
            // console.log('moodboard', moodboard);
            if (!moodboard) throw errors.NO_MOODBOARD_FOUND;
            sendSuccessResponse(moodboard, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    // moodboard details for Only Admin
    getMoodboardDetail = async (req: Request, res: Response) => {
        try {
            console.log('req.params.moodboard_id', req.params.moodboard_id);
            let data: any = await moodboardSer.getMoodboardData(req.params.moodboard_id);
            if (data.moodboardItem.length > 0) {
                data.moodboardItem.map((item: any) => {
                    if (item.product && item.product.product_category.length < 1) {
                        item.product.product_category = null;
                        return;
                    }
                    if (item.product && item.product.product_category.length > 0) {
                        item.product.product_category = item.product.product_category[0].category_id;
                    }
                });
                let moodboardItem = data.moodboardItem;
                data.moodboardItem = { LABELED: [], UNLABELED: [] };
                data.moodboardItem.UNLABELED = moodboardItem.filter((item: any) => item.label.id == 1);
                // remove label from unlabeled
                data.moodboardItem.UNLABELED = data.moodboardItem.UNLABELED.map((item: any) => _.omit(item, "label"));
                let groupedBy = moodboardItem.filter((item: any) => item.label.id !== 1);
                groupedBy = _.groupBy(groupedBy, (item: any) => item.label.label);
                Object.keys(groupedBy).forEach((key: any) => {
                    data.moodboardItem.LABELED.push({
                        labelId: groupedBy[key][0].label.id,
                        labelName: groupedBy[key][0].label.label,
                        items: groupedBy[key].map((el: any) => _.omit(el, "label"))
                    });
                });
            }
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    // Get all public moodboards (For Admin)
    async getAllPublicMoodboard(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['pageNumber', 'recordPerPage']);
            let data: any;
            data = await moodboardSer.getAllPublicMoodboards(query);
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    // Get all public moodboards (For Admin)
    async getAllMoodboards(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['pageNumber', 'recordPerPage']);
            let data: any;
            if (req.body.sortBy) {
                data = await moodboardSer.getAllMoodboards(query);
            } else {
                data = await moodboardSer.getAllMoodboards(query);
            }
            res.status(HttpStatus.OK).send({ success: true, data });
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async insertUpdateThumbnailImage(req: Request, res: Response) {
        try {
            const moodboard_id = req.params.moodboard_id;
            const buf = new Buffer(req.body.image.replace(/^data:image\/\w+;base64,/, ""),'base64');
            const key = `thumbnail-${moodboard_id}`;
            const delete_result = await uploadFile.deleteFileFromS3(key);
            console.log(delete_result);
            const img: any = await uploadFile.updateImgToS3(buf, key);
            res.status(HttpStatus.OK).send({ success: true, data : 'data'});
        } catch (error) {
            throwAnError(error, res);
        }
    }
}