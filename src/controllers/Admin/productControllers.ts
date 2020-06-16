import { NextFunction, Request, Response, Router } from 'express';
import * as HttpStatus from 'http-status-codes';
import _ from 'lodash';
import config from '../../config/config';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import CommonService from '../../services/admin/common.service';
import CatalogServices from '../../services/admin/catalog.service';
import * as uploadFile from '../../commonFunction/fileUpload';
import { throwAnError } from '../../commonFunction/throwAnError';
import { ComplementryProducts } from '../../entities/ComplementryProducts';

const commonModel = new CommonService();
const catalogModel = new CatalogServices();

export default class ProductController {
	constructor() {

	}
	/**
	 * Get attribute list by set id
	 */
	async getAttributeList(req: Request, res: Response) {
		const entites = await commonModel.customQueryWithWhereCondition('attribute_set', {
			is_deleted: '0'
		}, ['id', 'name']);
		return success(entites, HttpStatus.OK, true, res);
	}

	/**
	 * Get attribute list by set id
	 */
	async getAttributeSetInfo(req: Request, res: Response) {
		const attribute = await catalogModel.getAttributeSet(req.params.id);
		return success(attribute, HttpStatus.OK, true, res);
	}

	/**
	* Add product
	*/
	async addProduct(req: Request, res: Response) {
		try {
			let files: any = req.files;
			let error = uploadFile.validateProjectImg(files);
			if (error.length) {
				return failure(error[0], HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			}
			let productData = _.pick(req.body, [
				'name',
				'category',
				'attributes',
				'attribute_set_relations',
				'tags',
				'price',
				'complementry_products'
			]);

			const isParent = await catalogModel.checkIsParentById(productData.category);
			if (!isParent.parentId) {
				return failure("Please select subCategory from category", HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			}

			// Validate attribute with attribute title
			let validateAttr = await catalogModel.validateAttributeTitle(JSON.parse(productData.attributes));
			if (!validateAttr) {
				return failure(`You can't change attribute title`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			}
			const product = await catalogModel.insertProduct(productData);


			/// Insert product category
			await commonModel.insertEntity('product_categories', { product_id: product.identifiers[0].id, category_id: productData.category });
			/// Insert product attribute set
			await commonModel.insertEntity('product_attribute_set', { product_id: product.identifiers[0].id, attribute_set_id: productData.attribute_set_relations });
			/// Insert attribute_set_category_ralation
			/// check if already've one
			const attrCatRelation = { category_id: productData.category, attribute_set_id: productData.attribute_set_relations };
			const attribute_set_category_relation = await commonModel.findByOptions('attribute_set_category_relations', attrCatRelation);
			if (attribute_set_category_relation.length < 1) {
				await commonModel.insertEntity('attribute_set_category_relations', attrCatRelation);
			}

			// add complementry
			if (!_.isNull(productData.complementry_products) && !_.isUndefined(productData.complementry_products) && productData.complementry_products.length > 0) {
				const skus = productData.complementry_products.split(',').filter((el: any) => el);
				for await (const sku of skus) {
					const complementryProduct: ComplementryProducts = new ComplementryProducts();
					complementryProduct.product_sku = sku;
					complementryProduct.product_id = product.raw.insertId;
					await commonModel.insertEntity('complementry_products', complementryProduct);
				}
			}

			/// Check if attribute id exists for specific attribute set
			/// Insert product attribute
			await catalogModel.insertProductAttributeSet(JSON.parse(productData.attributes), productData.attribute_set_relations, product.identifiers[0].id);
			// Insert product tags
			await catalogModel.insertTag(JSON.parse(productData.tags), product.identifiers[0].id);
			// Insert product image
			let sliderImg: any = [];
			let featureImg = '';
			if (files) {
				for (let imgName in files) {
					let img: any = await uploadFile.uploadImgToS3(files[imgName][0]);
					if (config.s3Details.sliderImgArray.includes(imgName)) {
						sliderImg.push(img.Location);
					} else if (imgName === 'feature_image') {
						featureImg = img.Location;
					}
				}
				let featureImage = (featureImg) ? (featureImg) : '';
				let sliderImage = (sliderImg.length) ? sliderImg.join(',') : '';
				await commonModel.updateEntity('products', {
					feature_image: featureImage,
					slider_images: sliderImage
				}, product.identifiers[0].id);
			}

			return success(`Success`, HttpStatus.OK, true, res);
		} catch (err) {
			let message = (err.code === 'ER_DUP_ENTRY') ? `Product name or slug already exists` : err.message;
			return failure(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	/**
	 * List product
	 */
	async listProduct(req: Request, res: Response) {
		let data = _.pick(req.query, ['pageNo', 'recordPerPage', 'orderby', 'groupBy', 'orderbydirection', 'search_text']);
		try {
			const categories = await catalogModel.listProduct(data);
			return success(categories, HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

	/**
	 * Update product
	 */
	async updateProduct(req: Request, res: Response) {
		try {
			const files: any = req.files;
			if (_.size(files) > 6) throw `You can not upload more then 6 images`;
			console.log('files');
			console.log(files);
			let body = _.pick(req.body, [
				'id',
				'name',
				'category',
				'attributes',
				'attribute_set_relations',
				'tags',
				'price',
				'deleted_ids',
				'deleted_feature_image',
				'delete_slider_image',
				'feature_image',
				'slider_images'
			]);
			const isParent = await catalogModel.checkIsParentById(body.category);
			if (!isParent.parentId) {
				return failure("Please select subCategory from category", HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			}
			// Update product info
			const productDetails = await catalogModel.viewProduct(req.params.id);
			if (!productDetails) throw `Product with id: ${req.params.id} doesn't exist. Try another.`;
			await catalogModel.updateProduct({
				name: body.name,
				price: body.price,
			}, productDetails.id);

			// Update product cateogry
			await commonModel.updateProductCategory('product_categories', {
				product_id: req.params.id,
				category_id: body.category
			}, req.params.id);

			// Update attribute cateogry relation 
			const attrCatRelation = { category_id: body.category, attribute_set_id: body.attribute_set_relations };
			const attribute_set_category_relation = await commonModel.findByOptions('attribute_set_category_relations', attrCatRelation);
			if (attribute_set_category_relation.length < 1) {
				await commonModel.insertEntity('attribute_set_category_relations', attrCatRelation);
			}
			
			// await commonModel.updateProductCatAttr('product_attribute_set', {
			// 	product_id: req.params.id,
			// 	attribute_set_id: productData.attribute_set_relations
			// },
			// 	req.params.id);
			// Check attribute set
			// if (productDetails.attribute_sets[0].attribute_set_id !== productData.attribute_set_relations) {
			// 	// Delete attribute sets and attribute relations
			// 	await commonModel.deleteEntity('productattributes', 'product_id', productDetails.id);
			// 	await catalogModel.insertProductAttributeSet(JSON.parse(productData.attributes), productData.attribute_set_relations, productDetails.id);
			// } else {
			// Update & delete product attribute set
			body.attributes = JSON.parse(body.attributes);
			body.deleted_ids = JSON.parse(body.deleted_ids);
			if (body.deleted_ids.length) {
				await catalogModel.deleteProductAttributeSet(body.deleted_ids, req.params.id);
			}
			await catalogModel.updateProductAttributeSets(body.attributes, req.params.id, body.attribute_set_relations);
			// }
			await catalogModel.updateTags(JSON.parse(body.tags), productDetails.id);

			// Update feature image
			if (body.deleted_feature_image) {
				await uploadFile.deleteFileFromS3(body.deleted_feature_image);
				await catalogModel.updateProduct({ feature_image: null }, productDetails.id);
			}

			// Update slider image
			body.delete_slider_image = JSON.parse(body.delete_slider_image);
			if (body.delete_slider_image.length > 0) {
				for(let key of body.delete_slider_image) {
					await uploadFile.deleteFileFromS3(key);
					console.log(body.slider_images)
					await catalogModel.updateProduct({ slider_images: body.slider_images }, productDetails.id);
				}
			}

			// Upload feature image and update feature image

			let sliderImg: any = [];
			let featureImg;
			if (files) {
				for (let imgName in files) {
					let img: any = await uploadFile.uploadImgToS3(files[imgName][0]);
					console.log(img);
					if (config.s3Details.sliderImgArray.includes(imgName)) {
						body.slider_images = body.slider_images ?body.slider_images.concat(`,${img.key}`) : img.key;
						console.log(body.slider_images);
						await commonModel.updateEntity('products', {
							slider_images: body.slider_images,
						}, productDetails.id);
					} else if (imgName === 'feature_image') {
						featureImg = img.key;
						await commonModel.updateEntity('products', {
							feature_image: featureImg,
						}, productDetails.id);
					}
				}
				
			}
			success(`Product with id: ${req.params.id} updated.`, HttpStatus.OK, true, res);
		} catch (error) {
			throwAnError(error, res);
		}
	}

	/**
	 * View product by id
	 */
	async viewProduct(req: Request, res: Response) {
		try {
			const product = await catalogModel.viewProduct(req.params.id);
			if (!product) {
				return failure(`product not found`, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
			} else {
				let obj: any = {};
				product.product_attribute.forEach((val: any, index: number) => {
					if (!obj[val.attribute_id]) {
						obj[val.attribute_id] = [];
					}
					if (!val.attribute_value_id) {
						obj[val.attribute_id] = val.value;
					} else {
						obj[val.attribute_id].push(val.attribute_value_id);
					}
				});
				let product_attrs = [];
				for (let key in obj) {
					product_attrs.push({ id: key, value: obj[key] });
				}
				let tags = product.tags_sets.map((val: any) => {
					return val.tags.name;
				});
				let productData: any = {};
				productData['id'] = product.id;
				productData['name'] = product.name;
				// productData['status'] = product.status;
				productData['attribute_set_relations'] = product.attribute_sets[0].attribute_set_id;
				productData['attributes'] = product_attrs;
				productData['category'] = product.product_category.category_id;
				productData['slider_images'] = (product.slider_images) ? (product.slider_images.split(',')) : [];
				productData['feature_image'] = product.feature_image;
				productData['price'] = product.price;
				productData['tags'] = tags;
				return success(productData, HttpStatus.OK, true, res);
			}

		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, true, res);
		}
	}

	/**
	 * List product
	 */
	async deleteProduct(req: Request, res: Response) {
		let productId = req.params.id;
		try {
			const products = await catalogModel.deleteProduct(productId);
			const productsTags = await catalogModel.deleteProductTags(productId);
			return success("product deleted successfully", HttpStatus.OK, true, res);
		} catch (err) {
			return failure(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
		}
	}

}