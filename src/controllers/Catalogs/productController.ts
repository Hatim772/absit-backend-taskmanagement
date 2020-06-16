// third parties
import * as HttpStatus from 'http-status-codes';
import * as _ from 'lodash';
import { NextFunction, Request, Response } from 'express';
import { CatalogService } from '../../services/catalog/catalog.service';
import { CommonService } from '../../services/common.service';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import errors from '../../assets/i18n/en/errors';
import { throwAnError } from '../../commonFunction/throwAnError';

const catalogModel = new CatalogService();

export default class ProductController {

	constructor() { }

	async getAttributeList(req: Request, res: Response) {
		try {
			let data = _.pick(req.query, [
				'pageNo',
				'recordPerPage',
				'orderby',
				'groupBy',
				'orderbydirection'
			]);
			const product = await catalogModel.getAllAttributeByCatId(req.params.id);
			return success(product, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async getProductList(req: Request, res: Response) {
		try {
			let data = _.pick(req.query, [
				'pageNo',
				'recordPerPage',
				'orderby',
				'groupBy',
				'orderbydirection',
				'attribute_value_id',
				'priceRange'
			]);
			if (data.priceRange) data.priceRange = data.priceRange.split(',');
			const products = await catalogModel.getProductByCatId(req.params.id, data);
			return success(products, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}


	async getProductDetails(req: Request, res: Response) {
		try {
			let product = await catalogModel.getProductDetail(req.params.id);
			console.log(product);
			if (!product) {
				return failure(`Sorry product not found`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			} else {
				let productDetails: any = {};
				let tags = product.tags_sets.map((val: any) => {
					return {
						name: val.tags.name,
						id: val.tags.id
					};
				});
				let product_attribute: any = {};
				let other_attribute: any = {};
				product.product_attribute.forEach((val, index) => {
					if (val.attributes.is_discoverable === '1') {
						if (!other_attribute[val.attributes.name] && val.attribute_value) {
							other_attribute[val.attributes.name] = val.attribute_value.attribute_value;
						}
					}
					if (!product_attribute[val.attributes.attribute_titles.title]) {
						product_attribute[val.attributes.attribute_titles.title] = {};
					}
					if (val.value) {
						if (!(val.attributes.name in product_attribute[val.attributes.attribute_titles.title])) {
							product_attribute[val.attributes.attribute_titles.title][val.attributes.name] = '';
						}
						product_attribute[val.attributes.attribute_titles.title][val.attributes.name] = val.value;
					} else {
						if (!(val.attributes.name in product_attribute[val.attributes.attribute_titles.title])) {
							product_attribute[val.attributes.attribute_titles.title][val.attributes.name] = [];
						}
						let result = val.attribute_value ? val.attribute_value.attribute_value : '';
						product_attribute[val.attributes.attribute_titles.title][val.attributes.name].push(result);
					}
				});
				let product_attr = [];
				let other_attr: any = [];
				let i = 0;
				let ii = 0;
				for (let attr in product_attribute) {
					product_attr.push({
						title_name: attr,
						attributes: []
					});
					for (let attrs in product_attribute[attr]) {
						product_attr[i]['attributes'].push({
							attribute_name: attrs,
							attribute_id: ii,
							value: product_attribute[attr][attrs]
						})
						ii++;
					}
					i++;
				}

				for (let key in other_attribute) {
					if (other_attribute.hasOwnProperty(key)) {
						let obj = {
							attribute_name: key,
							val: other_attribute[key]
						}
						other_attr.push(obj);
					}
				}
				// faqs
				product.productsFaq = _.without(product.productsFaq.map((faq: any) => {
					if (_.isNull(faq.answerer)) return 0;
					faq.creator = _.pick(faq.creator, "username", "first_name");
					faq.answerer = _.pick(faq.answerer, "username", "first_name");
					return faq;
				}), 0);
				productDetails['name'] = product.name;
				productDetails['feature_image'] = product.feature_image;
				productDetails['slider_images'] = (!product.slider_images) ?  [] : product.slider_images.split(',');
				productDetails['price'] = product.price;
				productDetails['product_attribute'] = product_attr;
				productDetails['other_attribute'] = other_attr;
				productDetails['tags'] = tags;
				productDetails['faqs'] = product.productsFaq;
				productDetails['sku'] = product.sku;
				return success(productDetails, HttpStatus.OK, true, res);
			}
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async relatedMoodboards(req: Request, res: Response) {
		try {
			const data = await catalogModel.getRelatedMoodboards(req.params.product_id);
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	async similarItems(req: Request, res: Response) {
		try {
			const data = await catalogModel.getSimilarItems(req.params.product_id);
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	async insertProductFaq(req: Request, res: Response) {
		try {
			const productModel = new CommonService('products');
			const productFaq = new CommonService('productfaq')
			const product = await productModel.getById(req.body.productId);
			if (!product) {
				return failure(`Sorry product id not found`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			} else {
				const faqData = {
					question: req.body.question,
					asked_by: req.user.id,
					product_id: req.body.productId
				}
				await productFaq.insert(faqData);
				return success(`Success`, HttpStatus.OK, true, res);
			}
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async addAnswerToFaq(req: Request, res: Response) {
		try {
			if (req.user.user_role === '1') throw errors.NO_ADMIN_FOUND;
			const productFaqModel = new CommonService('productfaq')
			const productFaq = await productFaqModel.getById(req.body.faq_id);
			if (!productFaq) throw 'No Product FAQ found.'
			productFaq.answer = req.body.answer;
			productFaq.status = req.body.status;
			productFaq.answer_by = req.user.id;
			await productFaqModel.update(productFaq);
			return success(`FAQ answer added.`, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	async deleteFaqAnswer(req: Request, res: Response) {
		try {
			if (req.user.user_role === '1') throw errors.NO_ADMIN_FOUND;
			const productFaqModel = new CommonService('productfaq')
			const productFaq = await productFaqModel.getById(req.params.faq_id);
			if (!productFaq) throw 'No Product FAQ found.'
			await productFaqModel.remove(req.params.faq_id);
			success(`FAQ answer deleted.`, HttpStatus.OK, true, res);
		} catch (error) {
			let message = Object.prototype.hasOwnProperty.call(error, 'message') ? error.message : error;
			failure(message, Object.prototype.hasOwnProperty.call(error, 'message') ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST, false, res);
		}
	}

	async getComplementaryItems(req: Request, res: Response) {
		try {
			let data = await catalogModel.getComplementaryItems(req.params.product_id);
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	async getProductTags(req: Request, res: Response) {
		try {
			let data = await catalogModel.getProductTags(req.params.tag);
			data = data.filter((tag: any) => {
				return { tag_id: tag.tag_id, tag_name: tag.tags.name }
			});
			data = _.uniqBy(data, 'tag_name');
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	async getProductByTags(req: Request, res: Response) {
		try {
			const data = await catalogModel.getProductsByTag(req.params.tag_id);
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	async recommendedForMoodboard(req: Request, res: Response) {
		try {
			const data = await catalogModel.getRecommenededProducts(req.params.moodboard_id);
			success(data, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	async getProductSku(req: Request, res: Response) {
		try {
			let product = await catalogModel.getProductFromSku(req.params.id);
			if (!product) throw 'No Product found.';
			success(product, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

}