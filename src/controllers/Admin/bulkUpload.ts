// third parties
import * as HttpStatus from 'http-status-codes';
import { Request, Response } from 'express';
import _ from 'lodash';
import { getConnection, getRepository } from 'typeorm';

// locals
import { sendSuccessResponse } from '../../commonFunction/Utills';
import { throwAnError } from '../../commonFunction/throwAnError';
import config from '../../config/config';
import { Logger, ILogger } from '../../utils/logger';


// interfaces

// entities
import { Products } from '../../entities/Products';
import { Users } from '../../entities/Users';
import { UsersShippingAddress } from '../../entities/UsersShippingAddress';
import { ProductCategories } from '../../entities/ProductCategories';
import { ProductTags } from '../../entities/ProductTags';
import { ProductAttributes } from '../../entities/ProductAttributes';
import { ProductAttributeSet } from '../../entities/ProductAttributeSet';
import { AttributeSetCategoryRelations } from '../../entities/AttributeSetCategoryRelations';
import { ComplementryProducts } from '../../entities/ComplementryProducts';

// services

export default class BulkUpload {
    logger: ILogger;

    constructor() {
        this.logger = new Logger(__filename);
    }

    /**
     * Bulk upload for products
     * @param req 
     * @param res 
     */
    bulkUploadProducts = async (req: Request, res: Response) => {
        const products = req.body.products;
        const category_id = req.body.category_id;
        const attribute_set_id = req.body.attribute_set_id;

        // simple validation with separate try catch
        try {
            // if category_id is mismatched
            const category_mismatch_result = products.find((el: any) => el.category_id != category_id);
            if (!_.isUndefined(category_mismatch_result)) throw 'Category can\'t be mismatched.';

            // if attribute_set_id is mismatched
            const attribute_set_mismatch_result = products.find((el: any) => el.attribute_set_id != attribute_set_id);
            if (!_.isUndefined(attribute_set_mismatch_result)) throw 'Attribute set can\'t be mismatched.';

            // if category is not child
            const childCategory = await getRepository('categories')
                .createQueryBuilder('category')
                .where('category.id = :category_id', { category_id })
                .getRawOne();
            if (_.isUndefined(childCategory)) throw 'Invalid Category Id.'
            if (_.isNull(childCategory.category_parentId)) throw 'Only child category should be used as product\'s category.';
        } catch (error) {
            this.logger.error(`Error occured while checking for category, attribute_set mismatch and whether category is child or not:`, [error]);
            return throwAnError(error, res);
        }

        // get attribute_set
        const attribute_set = await getRepository('attribute_set_relations')
            .createQueryBuilder('attribute_set')
            .leftJoin('attribute_set.attributes', 'attr')
            .select([
                'attr.id AS attribute_id',
                'attr.name AS attribute_name',
            ])
            .where('attribute_set.attribute_set_id=:attribute_set_id', { attribute_set_id })
            .getRawMany();

        // check weather attribute_set has attributes or not
        if (attribute_set.length < 1) throw 'Attribute set has no atributes or violated. Please try again.';

        // create a queryRunner which can create a transaction
        const qR = await getConnection().createQueryRunner();

        // insert products with relation
        try {
            // returing response
            const returningResponse: any = {
                count: 0,
                insetedProductsIds: [],
                message: 'Bulk uploading products successful.'
            };

            // this.logger.info(`Started new transaction...`);
            // open a new transaction, which is helpful for rollbacking
            await qR.startTransaction();

            // adding attribute_set_category_relations
            const attribute_set_cat_result = await qR.manager.find('attribute_set_category_relations', {
                where: {
                    attribute_set_id,
                    category_id
                }
            });
            if (!attribute_set_cat_result || attribute_set_cat_result.length < 1) {
                const attribute_set_category_ralations = new AttributeSetCategoryRelations();
                attribute_set_category_ralations.attribute_set_id = attribute_set_id;
                attribute_set_category_ralations.category_id = category_id;
                await qR.manager.save(attribute_set_category_ralations);
            } else {
                this.logger.info(`Ignoring attribute_set_category_relation insert operation because there is already have one.`);
            }

            // looping through products that we can add data
            for await (const product of products) {
                // step-1: attribute operations
                let qb = getRepository('attribute_values').createQueryBuilder();
                if(product.tags) {
                    product.tags = product.tags.concat(`,${product.name}`);
                } else {
                    product.tags = product.name;
                }
                product.tags = product.tags.concat(`,${product.sku}`);
                // adding attribute_value_id in attributes array
                let attributes: any[] = [];
                for await (const attribute of product.attributes) {
                    if (!_.isNull(attribute.attribute_value) && !_.isUndefined(attribute.attribute_value)) {
                        attribute.attribute_id = attribute_set.find((el: any) => el.attribute_name == attribute.attribute_name).attribute_id;
                        let attributeList:any = [];
                        if(isNaN(attribute.attribute_value)) {
                            attributeList = attribute.attribute_value.split(',');
                        } else {
                            attributeList.push(attribute.attribute_value);
                        }
                        for(let attributeValue of attributeList) {
                            if(isNaN(attributeValue)){
				attributeValue = attributeValue.trim();
			    }
                            let attribute_value_id: any = await qb.where('attribute_value like :attr_val AND attribute_id = :attribute_id', {
                                attr_val: `%${attributeValue}%`,
                                attribute_id: attribute.attribute_id
                            })
                                .select('id')
                                .getRawOne();
                            // if no atribute_value found
                            if (!attribute_value_id) {
                                // Inerting attribute_value inside db with same reference attribute_value_id
                                attribute_value_id = await qb
                                    .insert()
                                    .into('attribute_values')
                                    .values({
                                        attribute_id: attribute.attribute_id,
                                        attribute_value: attributeValue,
                                    })
                                    .execute();

                                attribute_value_id['id'] = attribute_value_id.raw.insertId;

                                    console.log('inserted_attribute_value_id', attribute_value_id);
                            }
                            console.log('attribute_value_id', attribute_value_id.id)
                            // attribute.attribute_value_id = attribute_value_id.id;
                            let obj = {
                                attribute_value_id: attribute_value_id.id,
                                attribute_id: attribute.attribute_id
                            }
                            attributes.push(obj);
                        }
                    } else {
                        this.logger.info(`null or undefined attributes are ignored while added ${returningResponse.count} products.`);
                    }
                }
                console.log("attributes");
                console.log(attributes);
                product.attributes = attributes;
                // step-2: tag operations
                qb = getRepository('tags').createQueryBuilder();

                // adding tag ids in tags
                if (!_.isNull(product.tags) && !_.isUndefined(product.tags)) {
                    const tags = product.tags.split(',');
                    let tagS: any[] = [];
                    if (tags.length > 0) {
                        for await (const tag of tags) {
                            let tempTag = await qb.where('name like :tag_name', {
                                tag_name: `%${tag}%`
                            }).select('id').getRawOne();
                            // if no tag found
                            if (!tempTag) {
                                // inserting tag because there is no tag available with provided name
                                tempTag = await qb
                                    .insert()
                                    .into('tags')
                                    .values({
                                        name: tag
                                    })
                                    .execute();
                                tempTag = { id: tempTag.raw.insertId };
                            }
                            tagS.push({
                                id: tempTag.id,
                                tag
                            });
                        }
                        product.tags = tagS;
                    }
                } else {
                    this.logger.info(`null or undefined tags are ignored while added ${returningResponse.count} products.`);
                }

                // step-3: insert product
                const insertingProduct: Products = new Products();
                insertingProduct.name = product.name;
                insertingProduct.company_code = product.company_code;
                insertingProduct.dealer_price = product.dealer_price;
                insertingProduct.retailer_price = product.retailer_price;
                insertingProduct.feature_image = product.feature_image;
                if (!_.isNull(product.slider_images) && !_.isUndefined(product.slider_images)) {
                    insertingProduct.slider_images = product.slider_images.split(',').map((image: string) => image).join(',');
                } else {
                    this.logger.info(`null or undefined slider_images are ignored while added ${returningResponse.count} products.`);
                }
                insertingProduct.price = product.price;
                insertingProduct.sku = product.sku;

                // inserting product
                const inserted = await qR.manager.save(insertingProduct);

                // adding category
                const category: ProductCategories = new ProductCategories();
                category.category_id = category_id;
                category.product_id = inserted.id
                await qR.manager.save(category);
                // adding tags
                if (!_.isNull(product.tags) && !_.isUndefined(product.tags)) {
                    for await (const tag of product.tags) {
                        const productTags: ProductTags = new ProductTags();
                        productTags.product_id = inserted.id;
                        productTags.tag_id = tag.id;
                        await qR.manager.save(productTags);
                    }
                } else {
                    this.logger.info(`null or undefined tags are ignored while added ${returningResponse.count} products.`);
                }
                console.log("product");
                console.log(product);
                // adding product_attributes
                for await (const attribute of product.attributes) {
                    const productAttributes: ProductAttributes = new ProductAttributes();
                    productAttributes.product_id = inserted.id;
                    productAttributes.attribute_id = attribute.attribute_id;
                    productAttributes.attribute_value_id = attribute.attribute_value_id;
                    productAttributes.attribute_set_id = attribute_set_id;
                    // static for now
                    productAttributes.attribute_title_id = 5;
                    await qR.manager.save(productAttributes);
                }

                // adding product_attribute_set
                const productAttributeSet: ProductAttributeSet = new ProductAttributeSet();
                productAttributeSet.attribute_set_id = attribute_set_id;
                productAttributeSet.product_id = inserted.id;
                await qR.manager.save(productAttributeSet);

                // adding complementry products
                if (!_.isNull(product.complementry_products) && !_.isUndefined(product.complementry_products) && product.complementry_products != '') {
                    const skus = product.complementry_products.split(',');
                    for await (const sku of skus) {
                        const complementry_product: ComplementryProducts = new ComplementryProducts();
                        complementry_product.product_id = inserted.id;
                        complementry_product.product_sku = sku.trim();
                        await qR.manager.save(complementry_product);
                    }
                } else {
                    this.logger.info(`null or undefined complemtry_products are ignored while added ${returningResponse.count} products.`);
                }

                returningResponse.insetedProductsIds.push(inserted.id);
                returningResponse.count += 1;
            }
            this.logger.info(`Transaction commited...`);
            // commit transaction now
            await qR.commitTransaction();

            // successful entry return the response
            sendSuccessResponse(returningResponse, HttpStatus.OK, true, res);
        } catch (error) {
            let message = (error.code === 'ER_DUP_ENTRY') ? `Product SKU Already Exist` : error.message;
            this.logger.info(`Transaction rollbacked...`);
            // since we have errors lets rollback changes we made
            await qR.rollbackTransaction();
            this.logger.error(`Error occured while inserting multiple products:`, [error]);
            throwAnError(message, res);
        } finally {
            this.logger.info(`Connection released...`);
            // you need to release query runner which is manually created
            await qR.release();
        }
    }

    bulkUploadUsers = async (req: Request, res: Response) => {
        const userData = req.body.userData;
        console.log("test1");
        const qR = await getConnection().createQueryRunner();
        try {
            await qR.startTransaction();
            for await (const users of userData) {
                let insertingUsers: Users = new Users();
                insertingUsers.first_name = users.userData.first_name;
                insertingUsers.last_name = users.userData.last_name;
                insertingUsers.email = users.userData.email;
                insertingUsers.password = users.userData.password;
                insertingUsers.primary_mobile_number = users.userData.primary_mobile_number;
                insertingUsers.secondary_mobile_number = users.userData.secondary_mobile_number;
                insertingUsers.user_role = '1';
                insertingUsers.status = '1';
                insertingUsers.is_activate = '1';
                let insertResult:any = await qR.manager.save(insertingUsers);
                
                if(users.userAddress.address_line1) { 
                    const userAddress: UsersShippingAddress = new UsersShippingAddress();
                    userAddress.address_line1 = users.userAddress.address_line1;
                    userAddress.address_line2 = users.userAddress.address_line2;
                    userAddress.city = users.userAddress.city;
                    userAddress.pin_code = users.userAddress.pincode;
                    userAddress.user_id = insertResult.id;
                    await qR.manager.save(userAddress);
                }
            }
            await qR.commitTransaction();
            // successful entry return the response
            sendSuccessResponse('Success', HttpStatus.OK, true, res);

        } catch(error) {
            await qR.rollbackTransaction();
            this.logger.error(`Error occured while inserting multiple users:`, [error]);
            throwAnError(error, res);
        } finally {
            this.logger.info(`Connection released...`);
            // you need to release query runner which is manually created
            await qR.release();
        }
    }
}

// format to send
// {
//     "products": [
//         {
//             "name": "product1",
//             "description": "any",
//             "feature_image": "sample.png",
//             "slider_images": "sample1.png, sample2.png",
//             "company_code": "88070-2",
//             "dealer_price": 3000,
//             "retailer_price": 4000,
//             "max_price": 100,
//             "min_price": 0,
//             "sku": "wp0001",
//             "tags": "tag1, tag2",
//             "attribute_set_id": 5,
//             "category_id": 2,
//             "attributes": [
//                 {
//                     "attribute_name": "Color",
//                     "attribute_value": "red"
//                 },
//                 {
//                     "attribute_name": "Size",
//                     "attribute_value": "M"
//                 },
//                 {
//                     "attribute_name": "Units",
//                     "attribute_value": null
//                 }
//             ]
//         },
//         {
//             "name": "product2",
//             "description": "any",
//             "feature_image": "sample.png",
//             "slider_images": "sample1.png, sample2.png",
//             "company_code": "88070-2",
//             "dealer_price": 3000,
//             "retailer_price": 4000,
//             "max_price": 100,
//             "min_price": 0,
//             "sku": "wp0001",
//             "tags": "tag1, tag2",
//             "attribute_set_id": 5,
//             "category_id": 2,
//             "attributes": [
//                 {
//                     "attribute_name": "Color",
//                     "attribute_value": "red"
//                 },
//                 {
//                     "attribute_name": "Size",
//                     "attribute_value": null
//                 },
//                 {
//                     "attribute_name": "Units",
//                     "attribute_value": "yards"
//                 }
//             ]
//         }],
//         "category_id": 2,
//         "attribute_set_id": 5
// }

// fake products

// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product2",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product3",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": null
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// },
// {
//     "name": "product1",
//     "description": "any",
//     "feature_image": "sample.png",
//     "slider_images": "sample1.png, sample2.png",
//     "company_code": "88070-2",
//     "dealer_price": 3000,
//     "retailer_price": 4000,
//     "max_price": 100,
//     "min_price": 0,
//     "sku": "wp0001",
//     "tags": "tag1, tag2",
//     "attribute_set_id": 5,
//     "category_id": 2,
//     "attributes": [
//         {
//             "attribute_name": "Color",
//             "attribute_value": "red"
//         },
//         {
//             "attribute_name": "Size",
//             "attribute_value": "M"
//         },
//         {
//             "attribute_name": "Units",
//             "attribute_value": "yards"
//         }
//     ]
// }
