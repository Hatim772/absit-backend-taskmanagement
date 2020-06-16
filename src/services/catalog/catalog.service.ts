import { getManager, In, getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import _ from 'lodash';
import { Products } from '../../entities/Products';
import { ProductAttributes } from '../../entities/ProductAttributes';
import { ProductCategories } from '../../entities/ProductCategories';
import { Categories } from '../../entities/Categories';
import { retriveOrderBy, retriveOrderByDirection } from '../../commonFunction/Utills';
import { RequestForPricing } from '../../entities/RequestForPricing';
import { ComplementryProducts } from '../../entities/ComplementryProducts';

export class CatalogService {

	constructor() { }

	async getCategoryList() {
		return await getManager().getTreeRepository(Categories).findTrees();
	}

	async getSubCategory(parentId: number) {
		return await getRepository(Categories)
			.createQueryBuilder('categories')
			.innerJoinAndSelect("categories.parent", "parent_category")
			.select([
				"categories.id",
				"categories.name",
				"parent_category.name"
			])
			.where('categories.parentId = :id && categories.is_deleted=:is_deleted', { id: parentId, is_deleted: '0' })
			.getMany();
	}

	/**
	 * Get product list by category id
	 */

	async getAllAttributeByCatId(categoryId: number) {

		// const getCat = await getConnection().query(`SELECT GROUP_CONCAT(id) AS all_id FROM
		// 	(SELECT id,parentId FROM categories ORDER BY parentId, id) categories,
  //    		(SELECT @pv := ${categoryId}) initialisation WHERE FIND_IN_SET(parentId, @pv) > 0 
  //    		and @pv := concat(@pv, ',', id )`);
		// const catId = (!getCat[0].all_id) ? categoryId : getCat[0].all_id.split(',');
		// if (_.isArray(catId)) catId.push(categoryId);

		// get attribute_set from category_id / s
		let attributeSetList = await getRepository('attribute_set_category_relations')
			.createQueryBuilder('attrSet_cat_relation')
			.select('GROUP_CONCAT(attrSet_cat_relation.attribute_set_id) AS attribute_set_ids')
			.where('attrSet_cat_relation.category_id IN (:catIds)', { catIds: categoryId })
			.getRawOne();
		// getting unique array from string
		attributeSetList = attributeSetList.attribute_set_ids == null ? [] : _.uniq(attributeSetList.attribute_set_ids.split(','));


		let attributes: any = [];
		if (attributeSetList.length > 0) {
			let { 0: attributeValueList } = await getConnection().query(`SELECT
			(SELECT GROUP_CONCAT(DISTINCT product_attributes.attribute_id) FROM product_attributes WHERE product_attributes.attribute_set_id IN(${attributeSetList})) AS attribute_ids,
			(SELECT GROUP_CONCAT(DISTINCT product_attributes.attribute_value_id) FROM product_attributes WHERE product_attributes.attribute_set_id IN(${attributeSetList})) AS attribute_value_ids
			FROM product_attributes LIMIT 1`);

			attributeValueList.attribute_ids = (attributeValueList.attribute_ids.length > 0) ? _.uniq(attributeValueList.attribute_ids.split(',')) : [];
			attributeValueList.attribute_value_ids = (attributeValueList.attribute_value_ids.length > 0) ? _.uniq(attributeValueList.attribute_value_ids.split(',')) : [];

			attributes = await getRepository('attributes')
				.createQueryBuilder('attribute')
				.leftJoin('attribute.attribute_value', 'attrValue')
				.select(['attribute.id', 'attribute.name', 'attrValue.id', 'attrValue.attribute_value'])
				.where('attribute.id IN (:attribute_ids) AND attrValue.id IN (:attribute_value_ids) AND is_searchable= :is_searchable AND is_deleted= :is_deleted', { attribute_value_ids: attributeValueList.attribute_value_ids, attribute_ids: attributeValueList.attribute_ids, is_searchable: '1', is_deleted: '0' })
				.cache(60000)
				.getMany();
		}

		//Get Max Product Price range
		const priceRange:any = await getRepository(ProductCategories)
			.createQueryBuilder('product_categories')
			.leftJoinAndSelect('product_categories.products','products')
			.select('MAX(products.price)', 'max_price')
			.addSelect('MIN(products.price)', 'min_price')
			.where('category_id = :categoryIds', { categoryIds: categoryId })
			.getRawMany();
		return Promise.resolve({
			attributes,
			maxPrice: priceRange[0].max_price,
			minPrice: priceRange[0].min_price
		});

	}
	
	async getProductByCatId(categoryId: number, data: any) {
		
		if(data.attribute_value_id){
			data.attribute_value_id = JSON.parse(data.attribute_value_id);
		}

		let finalProducts: any = [];
		const catProductId = await getRepository(ProductCategories)
			.createQueryBuilder('product_categories')
			.select('product_id')
			.where('category_id IN (:categoryIds)', { categoryIds: categoryId })
			.getRawMany();
		const catProducts = catProductId.map((el) => { return  el.product_id.toString() });
		// console.log("category Products");
		// console.log(catProducts);
		finalProducts = _.union(finalProducts, catProducts);
		if (data.attribute_value_id) {
			let attributProductId;
			let filteredProductIds: any = []; 
			let value = 0;
			for(let key of data.attribute_value_id) {
				attributProductId = await getRepository(ProductAttributes)
				.query(`SELECT GROUP_CONCAT(DISTINCT product_id) AS product_ids
				FROM product_attributes
				WHERE attribute_value_id IN (?)`,
					[key]);
				filteredProductIds[value] = attributProductId[0].product_ids.split(',');
				console.log(attributProductId[0].product_ids.split(','));
				value++;
			}
			console.log(filteredProductIds);
			let resultIds = _.intersection(...filteredProductIds);
			// console.log('filteredProductIds###################');
			// console.log(resultIds);
			finalProducts = [];
			finalProducts = _.intersection(catProducts, resultIds);
			// console.log("finalProducts**************");
			// console.log(finalProducts);
		}
		let pageNo = parseInt(data.pageNo) || 1;
		let recordPerPage = parseInt(data.recordPerPage) || 10;
		let offset = (pageNo - 1) * recordPerPage;
		// Filter order by
		if (finalProducts.length < 1) return Promise.resolve([]);
		
		// Get product list
		let qbd = await getRepository(Products)
			.createQueryBuilder('products')
			.leftJoinAndSelect('products.product_attribute', 'product_attribute')
			.leftJoinAndSelect('product_attribute.attributes', 'attributes', 'attributes.is_discoverable= "1"')
			.leftJoinAndSelect('product_attribute.attribute_value', 'attribute_value')
			.whereInIds(finalProducts)
			.andWhere('products.is_deleted = :is_deleted ', { is_deleted: '0' })
			//.andWhere('attributes.is_discoverable = :is_discoverable ', { is_discoverable: '1' })
			.orderBy('products.id', 'ASC');
		const totalProducts = await qbd.getCount();

		if (data.priceRange) {
			let minPrice = parseInt(data.priceRange[0]);
			let maxPrice = parseInt(data.priceRange[1]);
			if (!_.isNaN(minPrice) && !_.isNaN(maxPrice)) {
				qbd.andWhere('products.price >= :minPrice AND products.price <= :maxPrice', { minPrice, maxPrice });
			}
		}
		qbd.skip(offset).take(recordPerPage)
		let products = await qbd.getMany();
		if (products.length > 0) {
			products.map((item: any, index: any) => {
				let product_attr = [];
				if (_.isNull(item.product_attribute)) return [];
				product_attr = _.without(item.product_attribute.map((el: any) => {
					if (_.isNull(el.attributes)) return 0;
					el.attribute_name = el.attributes.name;
					if (_.isNull(el.attributes && el.attribute_value)) return 0;
					el.attribute_value = el.attribute_value.attribute_value;
					delete el.attributes;
					const ele = _.omit(el, ['id', 'attribute_id', 'product_id',
						'attribute_value_id', 'attribute_set_id', 'value', 'attribute_title_id', 'createdDate', 'updatedDate']);
					return ele;
				}), 0);
				delete item.product_attribute;
				item['product_attributes'] = product_attr
			})
		} else {
			products = [];
		}

		const sendingData = {
			totalProducts,
			products
		}
		return Promise.resolve(this.createPagination(totalProducts, pageNo, recordPerPage, sendingData));
	}
/**	async getProductByCatId(categoryId: number, data: any) {
		
		if(data.attribute_value_id){
			data.attribute_value_id = JSON.parse(data.attribute_value_id);
		}

		let productId: any = [];
		// Get category ids
		const childCategory = await getConnection().query(`SELECT GROUP_CONCAT(id) AS all_id FROM
			(SELECT id,parentId FROM categories ORDER BY parentId, id) categories,
	//		(SELECT @pv := ${categoryId}) initialisation WHERE FIND_IN_SET(parentId, @pv) > 0 
			and @pv := concat(@pv, ',', id )`);
		const catId = (!childCategory[0].all_id) ? categoryId : childCategory[0].all_id.split(',');
		if (_.isArray(catId)) catId.push(categoryId);
		const catProductId = await getRepository(ProductCategories)
			.createQueryBuilder('product_categories')
			//.select('GROUP_CONCAT(product_id) AS product_ids')	
			.select('product_id')
			.where('category_id = (:categoryIds)', { categoryIds: categoryId })
			.getRawMany();
		console.log(catProductId);
		//const catProducts = (catProductId.product_ids) ? catProductId.product_ids.split(',') : [];
		const catProducts:any = catProductId.map((el:any) => { return el.product_id });
		productId = _.union(productId, catProducts);
		console.log(catProducts);
		// If get attribute

		const catProductId = await getRepository(ProductCategories)
			.createQueryBuilder('product_categories')
			.select('product_id')
			.where('category_id IN (:categoryIds)', { categoryIds: categoryId })
			.getRawMany();
		const catProducts = catProductId.map((el) => { return  el.product_id.toString() });
		console.log("category Products");
		console.log(catProducts);
		finalProducts = _.union(finalProducts, catProducts);
		if (data.attribute_value_id) {
			let attributProductId;
			let filteredProductIds: any = []; 
			let value = 0;
			for(let key of data.attribute_value_id) {
				attributProductId = await getRepository(ProductAttributes)
				.query(`SELECT GROUP_CONCAT(DISTINCT product_id) AS product_ids
				FROM product_attributes
				WHERE attribute_value_id IN (?)`,
					[key]);
				filteredProductIds[value] = attributProductId[0].product_ids.split(',');
				console.log(attributProductId[0].product_ids.split(','));
				value++;
			}
			console.log(filteredProductIds);
			let resultIds = _.intersection(...filteredProductIds);
			console.log('filteredProductIds###################');
			console.log(resultIds);
			finalProducts = [];
			finalProducts = _.intersection(catProducts, resultIds);
			console.log("finalProducts**************");
			console.log(finalProducts);
		}
		let pageNo = parseInt(data.pageNo) || 1;
		let recordPerPage = parseInt(data.recordPerPage) || 10;
		let offset = (pageNo - 1) * recordPerPage;
		// Filter order by
		if (finalProducts.length < 1) return Promise.resolve([]);
		
		// Get product list
		let qbd = await getRepository(Products)
			.createQueryBuilder('products')
			.leftJoinAndSelect('products.product_attribute', 'product_attribute')
			.leftJoinAndSelect('product_attribute.attributes', 'attributes', 'attributes.is_discoverable= "1"')
			.leftJoinAndSelect('product_attribute.attribute_value', 'attribute_value')
			.whereInIds(finalProducts)
			.andWhere('products.is_deleted = :is_deleted ', { is_deleted: '0' })
			//.andWhere('attributes.is_discoverable = :is_discoverable ', { is_discoverable: '1' })
			.orderBy('products.id', 'ASC');
		const totalProducts = await qbd.getCount();

		if (data.priceRange) {
			let minPrice = parseInt(data.priceRange[0]);
			let maxPrice = parseInt(data.priceRange[1]);
			if (!_.isNaN(minPrice) && !_.isNaN(maxPrice)) {
				qbd.andWhere('products.price >= :minPrice AND products.price <= :maxPrice', { minPrice, maxPrice });
			}
		}
		qbd.skip(offset).take(recordPerPage)
		let products = await qbd.getMany();
		if (products.length > 0) {
			products.map((item: any, index: any) => {
				let product_attr = [];
				if (_.isNull(item.product_attribute)) return [];
				product_attr = _.without(item.product_attribute.map((el: any) => {
					if (_.isNull(el.attributes)) return 0;
					el.attribute_name = el.attributes.name;
					if (_.isNull(el.attributes && el.attribute_value)) return 0;
					el.attribute_value = el.attribute_value.attribute_value;
					delete el.attributes;
					const ele = _.omit(el, ['id', 'attribute_id', 'product_id',
						'attribute_value_id', 'attribute_set_id', 'value', 'attribute_title_id', 'createdDate', 'updatedDate']);
					return ele;
				}), 0);
				delete item.product_attribute;
				item['product_attributes'] = product_attr
			})
		} else {
			products = [];
		}

		const sendingData = {
			totalProducts,
			products
		}
		return Promise.resolve(this.createPagination(totalProducts, pageNo, recordPerPage, sendingData));
	}*/
	async getProductDetail(productId: number) {
		return await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')
			.where('products.id = :productId', {
				productId: productId
			})
			.leftJoinAndSelect('products.product_attribute', 'product_attribute')
			.leftJoinAndSelect('product_attribute.attributes', 'attributes')
			.leftJoinAndSelect('product_attribute.attribute_value', 'attribute_values')
			.leftJoinAndSelect('attributes.attribute_titles', 'attribute_titles')
			.leftJoinAndSelect('products.productsFaq', 'product_faqs')
			.leftJoinAndSelect('product_faqs.creator', 'faq_creator')
			.leftJoinAndSelect('product_faqs.answerer', 'faq_answerer')
			.leftJoinAndSelect('products.tags_sets', 'tags_sets')
			.leftJoinAndSelect('tags_sets.tags', 'tags')
			.getOne();
	}

	async getSimilarProduct(productId: number) {
		return await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')

			.leftJoinAndSelect(query => {
				return query
					.from(ProductAttributes, 'product_attributes')
					.where('product_attributes.product_id != :productId', {
						productId: productId
					})
					.select('DISTINCT(GROUP_CONCAT(product_id)) AS productId')

			}, 'product_attributes')
			.getOne()
	}

	async getProduct(productId: number) {
		return await getConnection()
			.getRepository(Products)
			.createQueryBuilder('products')
			.where('id = :productId', {
				productId: productId
			})
			.getOne();
	}

	// Deep code

	async getQuotationProducts(user_id: number | string): Promise<any> {
		return await getConnection().getRepository('orders_reference')
			.createQueryBuilder('orders')
			.leftJoinAndSelect('orders.product', "products")
			.leftJoinAndSelect('products.product_attribute', "product_attribute")
			.leftJoinAndSelect('product_attribute.attributes', "attribute")
			.leftJoinAndSelect('product_attribute.attribute_value', "attribute_values")
			.select([
				"orders.id",
				"products.feature_image",
				"products.name",
				"product_attribute.id",
				"attribute.name",
				"attribute_values.attribute_value"
			])
			.where("user_id=:user_id AND project_id IS NULL", { user_id })
			.getManyAndCount();
	}

	async getComplementaryItems(product_id: number) {
		let attribute_value_id: any = await getRepository('product_attributes')
			.createQueryBuilder('proAttr')
			.leftJoinAndSelect('proAttr.attribute_value', 'attrVal')
			.where('proAttr.product_id=:product_id AND proAttr.attribute_id=:attribute_id', {
				product_id,
				attribute_id: 2
			}).select(['proAttr.id', 'attrVal.id']).getOne();
		if (!attribute_value_id) return Promise.resolve([]);
		attribute_value_id = attribute_value_id.attribute_value.id;
		return await getRepository('product_attributes')
			.createQueryBuilder('proAttr')
			.leftJoinAndSelect('proAttr.products', 'product')
			.where('NOT proAttr.product_id=:product_id AND proAttr.attribute_value_id=:attribute_value_id', { product_id, attribute_value_id })
			.select(['proAttr.id', 'product.id', 'product.feature_image'])
			.orderBy('proAttr.createdDate', 'DESC')
			.limit(3)
			.getMany();
	}

	async getProductTags(tag: string): Promise<any> {
		return await getRepository('product_tags')
			.createQueryBuilder('proTags')
			.leftJoin('proTags.tags', 'tag')
			// COLLATE utf8_general_ci
			.where('tag.name LIKE :tag', { tag: `%${tag}%` })
			.select([
				'proTags.tag_id',
				'tag.name'
			])
			.cache(60000)
			.getMany();
	}

	async getProductsByTag(tag_id: number): Promise<any> {
		let data = await getRepository('product_tags')
			.createQueryBuilder('proTag')
			.leftJoin('proTag.products', 'product')
			.select([
				'proTag.id',
				'product.id',
				'product.name',
				'product.feature_image',
				'product.price'
			])
			.where('proTag.tag_id=:tag_id', { tag_id })
			.getManyAndCount();
		if (data[1] < 1) return Promise.resolve([]);
		let count = data[1];
		let products = data[0].map((el: any) => el.products);
		return Promise.resolve({ count, products });
	}

	async getRecommenededProducts(moodboard_id: any): Promise<any> {
		const { 0: rawData }: any = await getRepository('moodboard_items')
			.createQueryBuilder('m_items')
			.leftJoin('m_items.product', 'products')
			.leftJoin('products.product_attribute', 'proAttr', 'proAttr.attribute_id=:attrId', { attrId: 3 })
			.leftJoin('proAttr.attribute_value', 'attrVal')
			.select([
				'attrVal.attribute_value',
				'products.price',
			])
			.where('m_items.product_id IS NOT NULL AND m_items.moodboard_id=:moodboard_id', { moodboard_id })
			.limit(1)
			.getRawMany();
		if (!rawData) return Promise.resolve([]);
		let not_in_product_ids: any = await getRepository('moodboard_items')
			.createQueryBuilder('m_items')
			.select('GROUP_CONCAT(m_items.product_id) as product_ids')
			.where('m_items.product_id IS NOT NULL AND m_items.moodboard_id=:moodboard_id', { moodboard_id })
			.getRawOne();
		if (_.isNull(not_in_product_ids.product_ids)) return Promise.resolve([]);
		not_in_product_ids = not_in_product_ids.product_ids.split(',').map((el: string) => parseInt(el));
		return await getRepository('products')
			.createQueryBuilder('product')
			.leftJoin('product.product_attribute', 'proAttr')
			.leftJoin('proAttr.attribute_value', 'attrVal')
			.where('attrVal.attribute_value=:clr', { clr: rawData.attrVal_attribute_value })
			.andWhere('product.price >= :minPrice AND product.price <= :maxPrice', { minPrice: rawData.products_min_price, maxPrice: rawData.products_max_price })
			.andWhere('product.id NOT IN (:product_ids)', { product_ids: not_in_product_ids })
			.limit(3)
			.getMany();
	}

	async getRelatedMoodboards(product_id: number): Promise<any> {

		let moodboard_ids = await getRepository('moodboard_items')
			.createQueryBuilder('m_items')
			.leftJoinAndSelect('m_items.moodboard', 'mb')
			.select('GROUP_CONCAT(m_items.moodboard_id) as moodboard_ids')
			.where('m_items.product_id=:product_id', { product_id })
			.andWhere('mb.status=:sts', { sts: '1' })
			.getRawOne();

		if (moodboard_ids.moodboard_ids) {
			moodboard_ids = moodboard_ids.moodboard_ids.split(',').slice(0, 3);
		} else {
			return Promise.resolve([]);
		}
		let data: any = await getRepository('moodboard')
			.createQueryBuilder('mb')
			.leftJoinAndSelect('mb.moodboardItem', 'm_items')
			.leftJoinAndSelect('mb.user', 'usr')
			.leftJoinAndSelect('m_items.color', 'clrs')
			.leftJoinAndSelect('m_items.image', 'imgs')
			.leftJoinAndSelect('m_items.product', 'prods')
			.loadRelationCountAndMap('mb.views', 'mb.moodboardViews')
			.whereInIds(moodboard_ids)
			.getMany();
		data = data.map((moodboard: any) => {
			let images = this.simpleArrayMapper(moodboard.moodboardItem, 'image');
			let productImages = this.simpleArrayMapper(moodboard.moodboardItem, 'product');
			let colors = this.simpleArrayMapper(moodboard.moodboardItem, 'color');
			moodboard.items = {
				images: {
					type: 'images',
					data: images
				},
				productImages: {
					type: 'productImages',
					data: productImages
				},
				colors: {
					type: 'colors',
					data: colors
				}
			}
			moodboard.user = _.pick(moodboard.user, ['username', 'first_name', 'last_name']);
			return _.pick(moodboard, [
				'id',
				'name',
				'user',
				'views',
				'items'
			]);
		});
		return Promise.resolve(data);
	}

	async getCategoryListWithItemCount() {
		return await getRepository(Categories)
			.createQueryBuilder('categories')
			.leftJoinAndSelect("categories.parent", "parent_category")
			// .leftJoinAndSelect('parent_category.product_category', 'catproduct')
			// .leftJoinAndSelect('parent_category.product_category', 'catproduct')
			.select([
				"categories.id",
				"categories.name",
				"parent_category.id"
			])
			// .addSelect("COUNT(catproduct.product_id) as product_count")
			// .addGroupBy("categories.id")
			// .addGroupBy("parent_category.id")
			// .where('categories.parentId IS NULL')
			.getRawMany();
	}
	async getCategoriesWithProductCount(): Promise<any> {
		let categoriesGroupedByParent = await getRepository('categories')
			.createQueryBuilder('category')
			.leftJoin('category.children', 'children')
			.loadRelationCountAndMap('category.productCount', 'category.product_category')
			.loadRelationCountAndMap('children.productCount', 'children.product_category')
			.where('category.parentId IS NULL')
			.select([
				'category.id',
				'category.name',
				'category.category_image',
				'children.id'
			])
			.getMany();
		categoriesGroupedByParent = categoriesGroupedByParent.map((el: any) => {
			if (el.children.length > 0) {
				el.productCount += (el.children.map((secondEl: any) => secondEl.productCount)).reduce((accumulator: number, currentValue: number) => accumulator + currentValue, 0);
			}
			return _.omit(el, ['children']);
		});
		return categoriesGroupedByParent;
	}

	/**
	* Return similar products
	* @param product_id 
	* @creator Deep Chudasama
	* Please read comments carefully before working
	*/
	async getSimilarItems(product_id: number): Promise<any> {
		// step-1: get product cat
		const cat = await getRepository('product_categories')
			.createQueryBuilder()
			.select(['category_id'])
			.where('product_id=:product_id', { product_id })
			.getRawOne();
		// step-2: get product attributes
		/**
		*	currently predicting attributes by it's slug, 
		*	which needs to be with exact ids 
		*/
		const product_attributes = await getRepository('product_attributes')
			.createQueryBuilder('pro_attr')
			.leftJoin('pro_attr.attributes', 'attr')
			.leftJoin('pro_attr.attribute_value', 'attrVal')
			.select([
				'pro_attr.attribute_id',
				'attrVal.attribute_value',
				'attrVal.id',
				'attr.name'
			])
			.where('pro_attr.product_id=:product_id AND FIND_IN_SET(lower(attr.name), :slugs)', { product_id, slugs: ['color,brand'] })
			.getRawMany();
		console.log(product_attributes);
		// worst case scenario
		if (product_attributes.length < 1) return Promise.resolve([]);
		const brand = product_attributes.find(el => (el.attr_name).toLowerCase() == 'brand');
		const color = product_attributes.find(el => el.attr_name.toLowerCase() == 'color');

		if (!_.isUndefined(color) && !_.isUndefined(brand)) {
			// step-3: get products with same color and different brand
			const products = await getRepository('products')
				.createQueryBuilder('product')
				.leftJoinAndSelect('product.product_category', 'pro_cat')
				.leftJoinAndSelect('product.product_attribute', 'pro_attr')
				.leftJoinAndSelect('pro_attr.attributes', 'attr')
				.leftJoinAndSelect('pro_attr.attribute_value', 'attr_val')
				.where('pro_cat.category_id=:cat AND product.id <> :product_id', {
					cat: cat.category_id,
					product_id
				})
				.andWhere('lower(attr.name) =:slg AND attr_val.attribute_value <> :attrVal', {
					slg: 'brand',
					attrVal: brand.attrVal_attribute_value
				})
				// .andWhere('lower(attr.name) =:slgs AND attr_val.attribute_value = :attrVals', {
				// 	slgs: 'color',
				// 	attrVals: color.attrVal_attribute_value
				// })

				// .where('pro_attr.attribute_value_id IN (:attrVals)', {
				// 	attrVals: [46, 18]
				// })
				.getMany();
			return Promise.resolve(products);
		} else return Promise.resolve([]);
	}

	/**
	 * Get request for pricings
	 * @param req 
	 * @param res 
	 */
	async getAllPricing(options: GetAllPricings) {
		const status = options.status || '1';
		const pageNumber = parseInt(options.pageNumber) || 1;
		const recordPerPage = parseInt(options.recordPerPage) || 20;
		const offset = (pageNumber - 1) * recordPerPage;
		const qb: SelectQueryBuilder<any> = await getRepository('request_for_pricing').createQueryBuilder('request_for_pricing');
		// const data = await qb.where('status=:status', { status })
		qb.leftJoinAndSelect('request_for_pricing.product', 'product')
		qb.leftJoinAndSelect('request_for_pricing.user', 'users')
		qb.select([
			'request_for_pricing.id as id',
			'product.name',
			'product.sku',
			'product.id',
			'users.first_name as first_name',
			'users.last_name as last_name',
			'users.id as id',
			'request_for_pricing.quantity as quantity',
			'request_for_pricing.price as price',
			'request_for_pricing.status as status',
			'request_for_pricing.createdDate as createdDate',
			'request_for_pricing.updatedDate as updatedDate',
		])
		qb.addSelect((subQuery: SelectQueryBuilder<any>) => {
			subQuery.from(RequestForPricing, 'requestForPricing')
				.select('COUNT(DISTINCT requestForPricing.id)', 'count');
			return subQuery;
		}, 'count')

		// const data = await qb.orderBy('request_for_pricing.createdDate', 'DESC')
		// 					.limit(recordPerPage)
		// 					.offset(offset)
		// 					.getManyAndCount();
		const data = await qb.orderBy('request_for_pricing.createdDate', 'DESC')
			.limit(recordPerPage)
			.offset(offset)
			.getRawMany();
		if (data.length > 0) {
			return this.createPagination(parseInt(data[0].count), pageNumber, recordPerPage, data.map(el => _.omit(el, 'count')));
		} else {
			return this.createPagination(data.length, pageNumber, recordPerPage, data);
		}
	}




	private createPagination(totalRecord: number, pageNumber: number, recordPerPage: number, data: any) {
		let pages = Math.ceil(totalRecord / recordPerPage);
		return {
			currentPage: pageNumber,
			recordPerPage,
			previous: pageNumber > 0 ? (pageNumber == 1 ? null : (pageNumber - 1)) : null,
			pages,
			next: pageNumber < pages ? pageNumber + 1 : null,
			data,
		};
	}
	private simpleArrayMapper(data: Array<any>, type: string): Array<any> {
		if (data.length < 1) return [];
		return _.without(data.map((item: any) => {
			if (type == 'image') {
				if (!_.isNull(item.image)) {
					return item.image.image_url;
				} return 0;
			}
			else if (type == 'product') {
				if (!_.isNull(item.product)) {
					return item.product.feature_image;
				} return 0;
			}
			else if (type == 'color') {
				if (!_.isNull(item.color)) {
					return item.color.color;
				} return 0;
			}
		}), 0, '');
	}

	async getProductFromSku(productId: number) {
		return await getConnection().query(`SELECT products.name,products.feature_image, products.id FROM complementry_products JOIN products ON complementry_products.product_sku = products.sku WHERE complementry_products.product_id = ${productId}`);
	}

	async getProductSku(productIds: any) {
		return getRepository('products')
			.createQueryBuilder()
			.select(['sku'])
			.where('id In (:productIds)', { productIds: productIds })
			.getRawMany();
	}

}

// interfaces
interface GetAllPricings {
	status?: '0' | '1',
	pageNumber?: string,
	recordPerPage?: string,
	orderBy?: 'A' | 'D'
}
