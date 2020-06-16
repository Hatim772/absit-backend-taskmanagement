// third parties
import * as HttpStatus from 'http-status-codes';
import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';
import { CatalogService } from '../../services/catalog/catalog.service';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import CommonService from '../../services/admin/common.service';
import { throwAnError } from '../../commonFunction/throwAnError';

const catalogModel = new CatalogService();

export default class CategoryController {


	constructor() {}

	/*  Get category list
	 */
	async getCategoryList(req: Request, res: Response) {
		try {
			let category: any = await catalogModel.getCategoryList();
			return success(category, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async getSubCategory(req: Request, res: Response) {
		try {
			let subCategory: any = await catalogModel.getSubCategory(req.params.id);
			let data: any = {};
			if (subCategory.length < 1) {
				const commonSer = new CommonService();
				let { 0: cat } = await commonSer.customQueryWithMultiJoin('categories', { id: req.params.id }, [], ['id', 'name']);
				if (!cat) data = [];
				else {
					data.categoryName = cat.name;
					data.subCategory = [];
				}
			} else {
				data = { categoryName: subCategory[0].parent.name, subCategory }
			}
			return success(data, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	/*  Get category list
	 */
	async getCategoryListWithItemCount(req: Request, res: Response) {
		try {
			let category:any = await catalogModel.getCategoryListWithItemCount();
			return success(category, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}
	async getCategoryListWithProductCount(req: Request, res: Response) {
		try {
			const data = await catalogModel.getCategoriesWithProductCount();
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}
}