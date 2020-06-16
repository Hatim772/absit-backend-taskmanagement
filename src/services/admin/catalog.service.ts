import _ from 'lodash';
import { Logger, ILogger } from '../../utils/logger';
import { getRepository, getConnection, getManager } from "typeorm";
import { Attributes } from '../../entities/Attributes';
import { Categories } from '../../entities/Categories';
import { ProductAttributes } from '../../entities/ProductAttributes';
import { ProductAttributeSet } from '../../entities/ProductAttributeSet';
import { Products } from '../../entities/Products';
import { retriveOrderBy, retriveOrderByDirection } from '../../commonFunction/Utills';
import { AttributeValues } from '../../entities/AttributeValue';
import { AttributeSet } from '../../entities/AttributeSet';
import { AttributeSetRelations } from '../../entities/AttribteSetRelations';
import { Tags } from '../../entities/Tags';
import { ProductTags } from '../../entities/ProductTags';
import { ProductCategories } from '../../entities/ProductCategories';

export default class CatalogServices {
	logger: ILogger;
	companyRepo: any;
	constructor() {
		this.logger = new Logger(__filename);
	}

	async isParentCat(id: number) {
		return await getRepository(Categories).find({
			where: { id: id }
		});

	}

	async addCategory(data: any): Promise<any> {
		const manager = getManager();
		const cat = new Categories();
		cat.name = data.name;
		cat.slug = data.slug;
		cat.max_single_cat_products = data.max_single_cat_products;
		cat.max_multiple_cat_products = data.max_multiple_cat_products;
		// cat.status = data.status;
		if (data.parentId) {
			const temp = new Categories();
			temp.id = data.parentId;
			cat.parent = temp;
		}
		return await manager.save(cat);

	}

	async updateCategory(id: number, data: any): Promise<void> {
		const manager = getManager();
		const cat = new Categories();
		cat.name = data.name;
		cat.slug = data.slug;
		cat.max_single_cat_products = data.max_single_cat_products;
		cat.max_multiple_cat_products = data.max_multiple_cat_products;
		// cat.status = data.status;
		// if (data.parentId) {
		// 	cat.parent = data.parentId;
		// }
		await manager.update(Categories, id, cat);
	}

	async listCategory(data: any) {
		let pageNo = data.pageNo || 1;
		let recordPerPage = data.recordPerPage || 10;
		let offset = (pageNo - 1) * recordPerPage;
		let column = data.column || '';
		let search_text = data.search_text || '';
		// orderby filter
		let orderByArray: Array<any> = ['id', 'name', 'slug', 'created_date'];
		let orderBy = data.orderBy || 'id';
		let orderByField = retriveOrderBy(orderByArray, orderBy, 1);
		let OrderByDirection: any = retriveOrderByDirection(data.orderbydirection) === 'A' ? 'ASC' : 'DESC';
		let db = await getConnection()
			.getRepository(Categories)
			.createQueryBuilder('categories')
			.where('categories.is_deleted=:is_deleted', { is_deleted: '0' })
			.select(['categories.id', 'categories.name', 'categories.max_single_cat_products', 'categories.max_multiple_cat_products'])
		if (column && search_text) {
			db.where(`${column} =: searchText`, {
				searchText: search_text
			});
		}
		let totalCount = await db.getCount();
		console.log(totalCount);
		let result = await db.skip(offset).take(recordPerPage).getRawMany();
		return { data: result, totalCount: totalCount };
	}

	async deleteAttributeValues(deletedId: any) {
		await getRepository(AttributeValues)
			.createQueryBuilder("attribute_values")
			.delete()
			.where('id IN (:InAttributeId)', {
				InAttributeId: deletedId
			})
			.execute();
	}

	async deleteAttributeSetRelation(deletedId: any, setId: number) {
		await getRepository(AttributeSetRelations)
			.createQueryBuilder("attribute_set_relations")
			.delete()
			.where('attribute_id IN (:InAttributeId)', {
				InAttributeId: deletedId
			})
			.andWhere('attribute_set_id = :AttrSetId', {
				AttrSetId: setId
			})
			.execute();
	}

	async updateAttributeValues(attributeValues: any, attributeId: number) {
		attributeValues.values.map(async (val: any) => {
			const attribute = await getRepository(AttributeValues).find({
				where: {
					attribute_id: attributeId,
					attribute_value: val
				}
			});
			if (attribute.length) {
				await getConnection()
					.createQueryBuilder()
					.update(AttributeValues)
					.set({ attribute_value: val })
					.where('id = :entityId', { entityId: attribute[0].id })
					.execute();
			} else {
				await getConnection()
					.createQueryBuilder()
					.insert()
					.into(AttributeValues)
					.values({ attribute_value: val, attribute_id: attributeId })
					.execute();
			}
		});
	}

	async updateAttributeSetValues(data: any) {
		data.attribute_ids.map(async (val: any) => {
			const attributeSet = await getRepository(AttributeSetRelations).find({
				where: {
					attribute_id: val,
					attribute_set_id: data.id
				}
			});

			if (!attributeSet.length) {
				await getConnection()
					.createQueryBuilder()
					.insert()
					.into(AttributeSetRelations)
					.values({ attribute_id: val, attribute_set_id: data.id })
					.execute();
			}
		});
	}

	async getCategories(categoryId: number) {
		const treeRepo = await getManager().getTreeRepository(Categories).findOne(categoryId);
		const childrensTree = await getManager()

			.getTreeRepository(Categories)

			.findDescendantsTree(treeRepo);
		return treeRepo;
	}

	async customQueryWithSelect(id: number) {
		return await getRepository(AttributeSet)
			.createQueryBuilder('attribute_set')
			.where('attribute_set.id = :setId', {
				setId: id
			})
			.leftJoinAndSelect('attribute_set.attribute_set_relation', 'attribute_set_relation', 'attribute_set_relation.id')
			.select(['attribute_set.id AS id', 'attribute_set.name AS name', 'attribute_set.slug AS slug', "GROUP_CONCAT(attribute_set_relation.attribute_id) AS attribute_ids"])
			.getRawOne();
	}

	async getCategoryHiearchy() {
		return await getManager().getTreeRepository(Categories).findTrees();
	}

	async checkIsParent(cateid: number, catName: string) {
		let db = await getRepository(Categories)
			.createQueryBuilder('categories');
		if (cateid) {
			db.where('id != :catId', {
				catId: cateid
			});
		}
		return await db.andWhere('name = :catName AND parentId = :parentIds', {
			catName: catName, parentIds: null
		}).getCount();

	}

	async checkIsChild(cateId: number, parentIds: number, catName: string) {
		let db = await getRepository(Categories)
			.createQueryBuilder('categories');
		if (cateId) {
			db.where('id != :catId', {
				catId: cateId
			});
		}
		return await db.andWhere('name = :catName AND parentId = :parentIds', {
			catName: catName, parentIds: parentIds
		}).getCount();
	}

	async getCategoryById(id: number) {
		return await getRepository(Categories)
			.createQueryBuilder('categories')
			.where('categories.id = :ids', {
				ids: id
			})
			.leftJoinAndSelect('categories.parent', 'parent')
			.select(['categories.id AS id', 'categories.name AS name', 'categories.slug AS slug',
				'categories.max_single_cat_products AS max_single_cat_products',
				'categories.max_multiple_cat_products AS max_multiple_cat_products',
				'categories.parentId AS parentId',
				'categories.category_image AS category_image',
				'parent.name AS parent_name'])
			.getRawOne();
	}

	async getAttributeSet(id: number) {
		return await getRepository(AttributeSetRelations)
			.createQueryBuilder('attribute_set_relation')
			.leftJoinAndSelect('attribute_set_relation.attributes', 'attributes')
			.leftJoinAndSelect('attributes.attribute_value', 'attribute_value')
			.where('attribute_set_id = :attId', { attId: id })
			.andWhere('attributes.is_deleted = :is_deleteds', { is_deleteds: '0' })
			.getMany();
	}

	async insertProduct(data: any) {
		return await getRepository(Products)
			.createQueryBuilder('products')
			.insert()
			.into(Products)
			.values(data)
			.execute();
	}

	async updateProduct(data: any, productId: number) {
		await getConnection()
			.createQueryBuilder()
			.update(Products)
			.set(data)
			.where('id = :entityId', { entityId: productId })
			.execute();
	}

	async insertProductAttributeSet(data: any, setId: number, productId: number) {
		let productAttrs: any = [];
		data.map(async (val: any) => {
			if (Array.isArray(val.value)) {
				val.value.map((vals: any) => {
					productAttrs.push({
						attribute_id: val.id,
						product_id: productId,
						attribute_value_id: vals,
						attribute_set_id: setId,
						attribute_title_id: val.attribute_title_id
					});
				});
			} else {
				productAttrs.push({
					attribute_id: val.id,
					product_id: productId,
					attribute_value_id: null,
					value: val.value,
					attribute_set_id: setId,
					attribute_title_id: val.attribute_title_id
				});
			}
		});
		await getConnection()
			.createQueryBuilder()
			.insert()
			.into(ProductAttributes)
			.values(productAttrs)
			.execute();
	}

	async validateAttributeTitle(data: any) {
		let error = true;
		data.map(async (val: any) => {
			let attribute = await getRepository(Attributes).find({
				where: {
					id: val.id,
					attribute_title_id: val.attribute_title_id
				}
			});
			if (!attribute.length) {
				error = false;
			}
		});
		return error;
	}
	async insertTag(data: any, productId: number) {
		let entity: any = data.map(async (val: any) => {
			let temp = await getRepository(Tags).find({
				where: {
					name: val.toLowerCase().replace(/ /g, '')
				}
			});
			if (!temp.length) {
				let insertRecord: any = await getRepository(Tags).save({
					name: val.toLowerCase().replace(/ /g, '')
				});
				return insertRecord.id;
			} else {
				return temp[0].id;
			}
		});
		const tagsIds = await Promise.all(entity);
		const tags = tagsIds.map((tagID: any) => {
			let tempTag = new ProductTags();
			tempTag.product_id = productId;
			tempTag.tag_id = tagID;
			return tempTag;
		});
		await getRepository(ProductTags).save(tags);
	}

	async listProduct(data: any) {
		let pageNo = data.pageNo || 1;
		let recordPerPage = data.recordPerPage || 10;
		let offset = (pageNo - 1) * recordPerPage;
		// let column = data.column || '';
		let search_text = data.search_text || '';
		// orderby filter
		let orderByArray: Array<any> = ['id', 'name', 'slug', 'created_date'];
		let orderBy = data.orderBy || 'id';
		let orderByField = retriveOrderBy(orderByArray, orderBy, 1);
		let OrderByDirection: any = retriveOrderByDirection(data.orderbydirection) === 'A' ? 'ASC' : 'DESC';
		// let totalCount = await getManager().count(Products, { is_deleted: '0' });
		let whereColumn: any;
		// switch (column) {
		// 	case "id":
		// 		whereColumn = 'products.id';
		// 		break;
		// 	case "name":
		// 		whereColumn = 'products.name';
		// 		break;
		// 	// case "status":
		// 	// 	whereColumn = 'products.status';
		// 	// 	break;
		// 	case "category_name":
		// 		whereColumn = 'categories.name';
		// 		break;
		// 	case "attribute_set_name":
		// 		whereColumn = 'product_attribute_set.name';
		// 		break;
		// }

		let db = await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')
		if (search_text) {
			db.where(`products.name LIKE :searchTexts or products.sku LIKE :searchTexts`, {
				searchTexts: `%${search_text}%`
			});
		}
		db.leftJoinAndSelect('products.product_category', 'product_category');
		db.leftJoinAndSelect('product_category.categories', 'categories')
		db.leftJoinAndSelect('products.attribute_sets', 'attribute_sets');
		db.leftJoinAndSelect('attribute_sets.product_attribute_sets', 'product_attribute_set')
		db.andWhere('products.is_deleted = :is_deleted ', { is_deleted: '0' })
		db.select(['products.id AS id', 'products.name AS name',
			'categories.name AS category_name', 'product_attribute_set.name AS attribute_set_name',
			'products.createdDate AS createdAt','products.sku AS sku'
		]);
		await db.orderBy(orderBy, OrderByDirection);
		await db.limit(recordPerPage).offset(offset);
		const totalCount = await db.getCount();
		const result = await db.getRawMany();
		return { data: result, totalCount: totalCount };
	}

	async viewProduct(productID: number) {
		return await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')
			.where('products.id = :productId', {
				productId: productID
			})
			.leftJoinAndSelect('products.product_category', 'product_category')
			.leftJoinAndSelect('product_category.categories', 'categories')
			.leftJoinAndSelect('products.attribute_sets', 'attribute_sets')
			.leftJoinAndSelect('attribute_sets.product_attribute_sets', 'product_attribute_set')
			.leftJoinAndSelect('products.product_attribute', 'product_attribute')
			.leftJoinAndSelect('products.tags_sets', 'tags_sets')
			.leftJoinAndSelect('tags_sets.tags', 'tags')
			.getOne();
	}

	async deleteProductAttributeSet(data: any, productId: number) {
		console.log(data);
		data.map(async (val: any) => {
			if (Array.isArray(val.value)) {
				// Delete attribute set
				let temp: any = [];
				val.value.map((ids: any) => {
					temp.push(ids);
				});
				await getConnection()
					.createQueryBuilder()
					.delete()
					.from(ProductAttributes)
					.where('attribute_value_id IN (:attrValId)', {
						attrValId: temp
					})
					.andWhere('attribute_id = :attrId', {
						attrId: val.id
					})
					.andWhere('product_id = :productId', {
						productId: productId
					})
					.execute();
			} else {
				// Delete attribute value ids
				await getConnection()
					.createQueryBuilder()
					.delete()
					.from(ProductAttributes)
					.where('value = :Val', {
						Val: val.value
					})
					.andWhere('attribute_id = :attrId', {
						attrId: val.id
					})
					.andWhere('product_id = :productId', {
						productId: productId
					})
					.execute();
			}
		});
	}

	async updateProductAttributeSets(data: any, productId: number, attribute_set_relations:string) {
		data.map(async (val: any) => {
			if (Array.isArray(val.value)) {
				// Delete attribute set
				let temp: any = [];
				val.value.map(async (ids: any) => {
					let entityTemp = await getRepository(ProductAttributes).find({
						where: {
							product_id: productId,
							attribute_value_id: ids,
							attribute_id: val.id
						}
					});
					if (!entityTemp.length) {
						let attr = new ProductAttributes();
						attr.attribute_id = val.id;
						attr.product_id = productId;
						attr.attribute_value_id = ids;
						attr.attribute_set_id = parseInt(attribute_set_relations);
						await getConnection().getRepository(ProductAttributes).save(attr, { chunk: 1000 });
					}
				});

			} else {

				let attrVal = await getRepository(ProductAttributes)
					.find({
						where: {
							attribute_id: val.id,
							product_id: productId,
							attribute_value_id: null
						}
					});
				if (attrVal.length) {
					await getConnection()
						.createQueryBuilder()
						.update(ProductAttributes)
						.set({
							value: val.value
						})
						.where('id = :ids', {
							ids: attrVal[0].id
						})
						.execute();
				} else {
					await getConnection()
						.createQueryBuilder()
						.insert()
						.into(ProductAttributes)
						.values({
							attribute_id: val.id,
							product_id: productId,
							attribute_value_id: null,
							value: val.value
						})
						.execute();
				}
			}
		});
	}

	async updateTags(data: any, productId: number) {
		let entity: any = data.map(async (val: any) => {
			let temp = await getRepository(Tags).find({
				where: {
					name: val.toLowerCase().replace(/ /g, '')
				}
			});
			if (!temp.length) {
				let insertRecord: any = await getRepository(Tags).save({
					name: val.toLowerCase().replace(/ /g, '')
				});
				return insertRecord.id;
			} else {
				return temp[0].id;
			}
		});
		const tagsIds = await Promise.all(entity);
		const getAllTags = await getRepository(ProductTags).find({
			where: {
				product_id: productId
			},
			select: ['tag_id']
		});
		const allTags = getAllTags.map((ids: any) => {
			return ids.tag_id;
		});
		const tags = tagsIds.map(async (tagID: any) => {
			let productTags = await getRepository(ProductTags)
				.find({
					where: {
						product_id: productId,
						tag_id: tagID
					}
				});
			if (!productTags.length) {
				await getRepository(ProductTags).save({ product_id: productId, tag_id: tagID });
			}
		});
	}

	async test() {
		const t = await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')
			.where('products.id = :productId', {
				productId: 4
			})
			.leftJoinAndSelect('products.product_attribute', 'product_attribute')
			.leftJoinAndSelect('product_attribute.attributes', 'attributes')
			.leftJoinAndSelect('product_attribute.attribute_value', 'attribute_values')
			.leftJoinAndSelect('product_attribute.attribute_titles', 'attribute_titles')
			.leftJoinAndSelect('products.tags_sets', 'tags')
			.getOne();
		let obj: any = {};
		t.product_attribute.forEach((val, index) => {
			if (!obj[val.attribute_titles.title]) {
				obj[val.attribute_titles.title] = {};
			}

			if (val.value) {
				if (!(val.attributes.name in obj[val.attribute_titles.title])) {
					obj[val.attribute_titles.title][val.attributes.name] = '';
				}
				obj[val.attribute_titles.title][val.attributes.name] = val.value;
			} else {
				if (!(val.attributes.name in obj[val.attribute_titles.title])) {
					obj[val.attribute_titles.title][val.attributes.name] = [];
				}
				obj[val.attribute_titles.title][val.attributes.name].push(val.attribute_value.attribute_value);
			}

		});
		return t;
	}

	async getSimilarProduct(productId: number) {
		return await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')
			.leftJoinAndSelect(query => {
				return query
					.from(ProductAttributes, 'product_attributes')
					.select('')
					.where('product_attributes.product_id != :productId', {
						productId: productId
					})

			}, 'product_attributes', 'product_attributes.product_id = products.id')
			.getOne()
	}

	async getFeaturedProducts() {
		return await getConnection()
	}

	async checkIsParentById(cateid: number) {
		return await getConnection().
			getRepository(Categories)
			.createQueryBuilder()
			.where('id = :id', {
				id: cateid
			})
			.select('parentId')
			.getRawOne();
	}

	/**
	 * delete product
	 */
	async deleteProduct(productId: number) {
		let qb:any = getConnection();
			qb.createQueryBuilder()
			.update(Products)
			.set({
				is_deleted: '1',
				sku: null
			})
			.where('id = :id', {
				id: productId
			})
			.execute()
		return await qb;
	}

	async deleteProductTags(productId: number) {

		await getRepository('ProductTags')
			.createQueryBuilder()
			.delete()
			.where('product_id = :productId', { productId: productId })
			.execute();
	}

	async checkCategoryProduct(cat_id: number) {
		return await getRepository('Categories')
			.createQueryBuilder('category')
			.leftJoin('category.children', 'children', 'children.is_deleted = "0"')
			.leftJoin('category.product_category', 'product_category')
			// .leftJoin('product_category.products', 'products')
			.loadRelationCountAndMap('category.productCount', 'category.product_category', 'rc', qb => {
				qb.leftJoin('rc.products', 'products');
				return qb.andWhere('products.is_deleted=:is_deleted', { is_deleted: '0' });
			})
			.loadRelationCountAndMap('children.productCount', 'children.product_category', 'rc1', qb => {
				qb.leftJoin('rc1.products', 'products1');
				return qb.andWhere('products1.is_deleted=:is_deleted', { is_deleted: '0' });
			})
			.where('category.id=:cat_id', { cat_id: cat_id })
			.select([
				'category.id',
				'category.name',
				'category.category_image',
				'children.id'
			])
			.getOne();
	}

	async removeCategory(cat_id: number) {
		return await getRepository('Categories')
			.createQueryBuilder('catrgory')
			.update()
			.set({
				is_deleted: '1'
			})
			.where('id=:cat_id', { cat_id })
			.execute();
	}

	async checkAttributeInSet(attr_id: number) {
		return await getRepository('AttributeSetRelations')
			.createQueryBuilder('atr')
			.leftJoinAndSelect('atr.attribute_sets', 'attributeSets')
			.where('atr.attribute_id = :attr_id && attributeSets.is_deleted=:is_deleted', { attr_id: attr_id, is_deleted: '0' })
			.getCount();
	}

	async removeAttribute(attr_id: number) {
		return await getRepository('Attributes')
			.createQueryBuilder('Attributes')
			.update()
			.set({
				is_deleted: '1'
			})
			.where('id=:attr_id', { attr_id })
			.execute();
	}

	async removeAttributeValue(attr_id: number) {
		return await getRepository('AttributeValues')
			.createQueryBuilder()
			.update()
			.set({
				is_deleted: '1'
			})
			.where('attribute_id=:attr_id', { attr_id })
			.execute();
	}

	async checkAttributeSetProduct(set_id: number) {
		return await getRepository('ProductAttributeSet')
			.createQueryBuilder('pAttrSet')
			.leftJoinAndSelect('pAttrSet.products', 'products')
			.where('attribute_set_id = :set_id && products.is_deleted = :is_deleted', { set_id: set_id, is_deleted: '0' })
			.getCount();
	}

	async removeAttributeSet(set_id: number) {
		// await getRepository('AttributeSetRelations')
		// 	.createQueryBuilder()
		// 	.delete()
		// 	.where('attribute_set_id = :set_id', { set_id })
		// 	.execute();

		await getRepository('AttributeSet')
			.createQueryBuilder()
			.update()
			.set({
				is_deleted: '1'
			})
			.where('id = :set_id', { set_id })
			.execute();
	}

	async testInsert(data: any) {

		return await getRepository('Tags')
			.createQueryBuilder()
			.insert()
			.into(Tags)
			.values([
				{ name: "Umed Khudoiberdiev" },
				{ name: "Bakhrom Baubekov" },
				{ name: "Bakhodur Kandikov" },
			])
			.returning("INSERTED.*")
			.execute();
	}

}