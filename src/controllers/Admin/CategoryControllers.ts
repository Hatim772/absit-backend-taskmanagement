import { NextFunction, Request, Response, Router } from 'express';
import * as HttpStatus from 'http-status-codes';
import * as _ from 'lodash';
import config from '../../config/config';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import CommonService from '../../services/admin/common.service';
import CatalogServices from '../../services/admin/catalog.service';
import * as uploadFile from '../../commonFunction/fileUpload';
const { errors } = config;
const commonModel = new CommonService();
const catalogModel = new CatalogServices();

export default class Category {
	constructor() {

	}

	async addCategory(req: Request, res: Response) {
		let file: any = req.file;

		let data = _.pick(req.body, ['name', 'slug', 'parentId', 'max_single_cat_products', 'max_multiple_cat_products']);
		try {
			let error = uploadFile.validateSingleImg(file);
			if (error.length) {
				return failure(error[0], HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			}
			// if (data.parentId) {
			// 	let isChild = await catalogModel.checkIsChild(0, data.parentId, data.name);
			// 	if (isChild) {
			// 		return failure(`Sorry child category already exist with same name`, HttpStatus.INTERNAL_SERVER_ERROR,
			// 			false, res);
			// 	}
			// } else {
			// 	let checkParent = await catalogModel.checkIsParent(0, data.name);
			// 	if (checkParent) {
			// 		return failure(`Sorry parent category already exist with same name`, HttpStatus.INTERNAL_SERVER_ERROR,
			// 			false, res);
			// 	}
			// }
			const category = await catalogModel.addCategory(data);
			// Add image
			if (req.file) {
				let img: any = await uploadFile.uploadImgToS3(req.file);
				await commonModel.updateEntity('categories', {
					category_image: img.Location
				}, category.id);
			}
			return success(`Success`, HttpStatus.OK, true, res);
		} catch (err) {
			let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
			return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async listCategoryItems(req: Request, res: Response) {
		const parentCat = await catalogModel.getCategoryHiearchy();
		return success(parentCat, HttpStatus.OK, true, res);
	}

	async listCategories(req: Request, res: Response) {
		let data = _.pick(req.query, ['pageNo', 'recordPerPage', 'orderby', 'groupBy', 'orderbydirection', 'search_text']);
		try {
			const categories = await catalogModel.listCategory(data);
			return success(categories, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}

	}

	async getCategories(req: Request, res: Response) {
		try {
			let categorie = await catalogModel.getCategories(req.params.id);
			if (!categorie) {
				return failure(`Category not exists`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			} else {
				return success(categorie, HttpStatus.OK, true, res);
			}
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async updateCategoies(req: Request, res: Response) {
		let data = _.pick(req.body, ['id', 'name', 'slug', 'parentId', 'max_single_cat_products', 'max_multiple_cat_products']);
		let image = req.file;
		try {
			if (!data.parentId) {
				let isChild = await catalogModel.checkIsChild(data.id, data.parentId, data.name);
				if (isChild) {
					return failure(`Sorry child category already exist with same name`, HttpStatus.INTERNAL_SERVER_ERROR,
						false, res);
				}
			} else {
				let checkParent = await catalogModel.checkIsParent(req.params.id, data.name);
				if (checkParent) {
					return failure(`Sorry parent category already exist with same name`, HttpStatus.INTERNAL_SERVER_ERROR,
						false, res);
				}
			}
			await catalogModel.updateCategory(data.id, data);
			if (req.file) {
				let img: any = await uploadFile.uploadImgToS3(req.file);
				await commonModel.updateEntity('categories', {
					category_image: img.Location
				}, data.id);
			}
			// Update image
			return success(`Success`, HttpStatus.OK, true, res);
		} catch (err) {
			let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
			return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async viewCategories(req: Request, res: Response) {
		try {
			let entity = await catalogModel.getCategoryById(req.params.id);
			if (!entity) {
				return failure(`Category not exist`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			} else {
				return success(entity, HttpStatus.OK, true, res);
			}
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async deleteCategory(req: Request, res: Response) {
		try {
			const cat_id = req.params.id;
			const categoryProducts:any = await catalogModel.checkCategoryProduct(cat_id);
			console.log(categoryProducts);
			if (categoryProducts.children.length > 0) {
				return failure(`You can not delete parent category without deleteing child category`, HttpStatus.INTERNAL_SERVER_ERROR,
					false, res);
			}
			const childProductCount = categoryProducts.children.reduce((total: number, el: any) => { return total + el.productCount }, 0);
			if(categoryProducts.productCount > 0) {
				return failure('Can not delete category.Category is used in product.', HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			} else if(childProductCount){
				return failure("Can not delete category.It's SubCategory is used in product.", HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			}else {
				await catalogModel.removeCategory(cat_id);
				success('success', HttpStatus.OK, true, res);
			}
		} catch (error) {
			return failure(error.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}
}