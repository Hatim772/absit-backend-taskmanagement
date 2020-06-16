import _ from 'lodash';
import { Logger, ILogger } from '../../utils/logger';
import { getRepository, getConnection, Column, Entity, getManager } from 'typeorm';
import { Users } from '../../entities/Users';
import { Attributes } from '../../entities/Attributes';
import { Categories } from '../../entities/Categories';
import { ProductAttributes } from '../../entities/ProductAttributes';
import { ProductCategories } from '../../entities/ProductCategories';
import { Products } from '../../entities/Products';
import { UsersAdditionalSettings } from '../../entities/UsersAdditionalSettings';
import { OrderBillingAddress } from '../../entities/OrderBillingAddress';
import { UsersShippingAddress } from '../../entities/UsersShippingAddress';
import { UsersVerificationDetails } from '../../entities/UsersVerificationDetails';
import { retriveOrderBy, retriveOrderByDirection } from '../../commonFunction/Utills';
import { AttributeValues } from '../../entities/AttributeValue';
import { AttributeSet } from '../../entities/AttributeSet';
import { AttributeSetRelations } from '../../entities/AttribteSetRelations';
import { AttributeSetCategoryRelations } from '../../entities/AttributeSetCategoryRelations';
import { ProductAttributeSet } from '../../entities/ProductAttributeSet';
import { AttributeTitles } from '../../entities/AttributeTitles';

export default class CommonService {
	logger: ILogger;
	companyRepo: any;
	constructor() {
		this.logger = new Logger(__filename);
	}
	async getEntities(entityName: string) {
		let entity: any;
		switch (entityName) {
			case 'users':
				entity = Users;
				break;
			case 'attributes':
				entity = Attributes;
				break;
			case 'attribute_set':
				entity = AttributeSet;
				break;
			case 'attribute_set_relations':
				entity = AttributeSetRelations;
				break;
			case 'categories':
				entity = Categories;
				break;
			case 'productattributes':
				entity = ProductAttributes;
				break;
			case 'products':
				entity = Products;
				break;
			case 'usersadditionalsetting':
				entity = UsersAdditionalSettings;
				break;
			case 'orderBillingAddress':
				entity = OrderBillingAddress;
				break;
			case 'usersshippingaddress':
				entity = UsersShippingAddress;
				break;
			case 'usersverificationdetails':
				entity = UsersVerificationDetails;
				break;
			case 'attribute_values':
				entity = AttributeValues;
				break;
			case 'product_categories':
				entity = ProductCategories;
				break;
			case 'product_attribute_set':
				entity = ProductAttributeSet;
				break;
			case 'attribute_titles':
				entity = AttributeTitles;
				break;
			case 'attribute_set_category_relations':
				entity = AttributeSetCategoryRelations;
				break;
			default:
				throw new Error('No entity provided in CommonService');
				break;
		}
		return entity;
	}
	async insertEntity(entityName: any, data: any): Promise<any> {
		let entity = await this.getEntities(entityName);
		return await getConnection()
			.createQueryBuilder()
			.insert()
			.into(entity)
			.values(data)
			.execute();
	}

	async listEntity(entityName: string, data: any) {
		let entity = await this.getEntities(entityName);
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
		// let totalCount = await getManager().count(entity);
		let db = await getConnection()
			.getRepository(entity)
			.createQueryBuilder(entityName)
			.where('is_deleted=:is_deleted', { is_deleted: '0' });
		if (column && search_text) {
			db.where(`${column} =: searchText`, {
				searchText: search_text
			});
		}
		let totalCount = await db.getCount();
		let result = await db.skip(offset).take(recordPerPage).getMany();
		return { data: result, totalCount: totalCount };
	}

	async listEntityWithRelations(entityName: string, data: any, relatedTable: any) {
		let entity = await this.getEntities(entityName);
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
		// let totalCount = await getManager().count(entity);
		let db = await getConnection()
			.getRepository(entity)
			.createQueryBuilder(entityName)
			.where('is_deleted=:is_deleted', { is_deleted: '0' });
		if (column && search_text) {
			db.where(`${column} =: searchText`, {
				searchText: search_text
			});
		}
		if (relatedTable) {
			db.leftJoin(`${entityName}.${relatedTable}`, `${relatedTable}`);
		}
		let totalCount = await db.getCount();
		let result = await db.skip(offset).take(recordPerPage).getMany();
		return { data: result, totalCount: totalCount };
	}


	async updateEntity(entityName: any, data: any, entityId: number): Promise<void> {
		let entity = await this.getEntities(entityName);
		await getConnection()
			.createQueryBuilder()
			.update(entity)
			.set(data)
			.where('id = :entityId', { entityId: entityId })
			.execute();
	}

	async findEntity(entityName: any, id: number): Promise<any> {
		let entity = await this.getEntities(entityName);
		return await getConnection().getRepository(entity).findOne(id);
	}

	/**
	   * Get by options like where, select, order etc.
	   * @param options 
	   */
	async findByOptions(entityName: string | any, options: {} | any): Promise<any> {
		return await getRepository(entityName).find(options);
	}

	async deleteEntity(entityName: any, column: any, id: number) {
		let entity = await this.getEntities(entityName);
		await getConnection()
			.createQueryBuilder()
			.delete()
			.from(entity)
			.where(`${column} = :deletedId`, {
				deletedId: id
			})
			.execute();
	}


	async findEntityMulti(entityName: any, condition: any): Promise<any> {
		let entity = await this.getEntities(entityName);
		return await getConnection().getRepository(entity).find({
			where: condition
		});
	}

	async likeQueryWithWhereCondition(Enitity: any, likeText: any, selectColumn: any, where: any, isSingleRecord: boolean): Promise<any> {
		let entity: any = await this.getEntities(Enitity);
		let text: any = '';
		let db = await getRepository(entity)
			.createQueryBuilder(Enitity)
			.select(selectColumn);
		if (likeText.length) {
			db.where(`${likeText[0]} like: searchText`, {
				searchText: '%' + likeText[1] + '%'
			});
		}
		if (where) {
			Object.keys(where).forEach(keys => {
				if (text) {
					text += ' AND ';
				}
				text += `${keys} = : ${keys}`;
			});
		}
		if (text) {
			db.andWhere(text, where);
		}
		return (isSingleRecord) ? await db.getRawOne() : await db.getRawMany();
	}

	async likeQueryWithNotIn(Enitity: any, likeText: any, notInCondition: any, selectColumn: any, where: any, isSingleRecord: boolean): Promise<any> {
		let entity: any = await this.getEntities(Enitity);
		let text: any = '';
		let db = await getRepository(entity)
			.createQueryBuilder(Enitity)
			.select(selectColumn);
		if (likeText.length) {
			db.where(`${likeText[0]} like: searchText`, {
				searchText: '%' + likeText[1] + '%'
			});
		}
		if (where) {
			db.andWhere(`${where[0]} = :columns`, {
				columns: where[1]
			});
		}
		if (notInCondition) {
			db.andWhere(`${notInCondition[0]} IN (:notInArray)`, {
				notInArray: notInCondition[1]
			});
		}
		return (isSingleRecord) ? db.getRawOne() : db.getRawMany();
	}

	async insertChunkData(data: any) {
		let entityData = data.values.map((val: any) => {
			let temp = new AttributeValues();
			temp.attribute_id = data.attribute_id;
			temp.attribute_value = val;
			return temp;
		});
		await getConnection().getRepository(AttributeValues).save(entityData, { chunk: 1000 });
	}

	async insertChunkDataForAttributeSet(data: any) {
		let entityData = data.attribute_ids.map((val: any) => {
			let temp = new AttributeSetRelations();
			temp.attribute_id = val;
			temp.attribute_set_id = data.attribute_set_id;
			return temp;
		});
		await getConnection().getRepository(AttributeSetRelations).save(entityData, { chunk: 1000 });
	}

	async customQueryWithMultiJoin(Enitity: any, whereCondition: any, realations: any, select?: Array<string>): Promise<any> {
		let entity: any = await this.getEntities(Enitity);
		return await getRepository(entity)
			.find({
				where: whereCondition,
				relations: realations,
				select
			});
	}


	async customQueryWithWhereCondition(Entity: any, whereCondition: any, selectColumn: any) {
		let entity: any = await this.getEntities(Entity);
		return await getRepository(entity)
			.find({
				where: whereCondition,
				select: selectColumn
			});
	}

	async joinQueryWithWhere(Entity: any, selectColumn: any, relations: any) {
		let entity: any = await this.getEntities(Entity);
		return await getRepository(entity)
			.createQueryBuilder(Entity)
			.select(selectColumn)
			.leftJoinAndSelect(`${Entity}.${relations}`, `${relations}`)
			.getMany();
	}

	async updateProductCategory(entityName: any, data: any, entityId: number): Promise<void> {
		let entity = await this.getEntities(entityName);
		await getConnection()
			.createQueryBuilder()
			.update(entity)
			.set(data)
			.where('product_id = :entityId', { entityId: entityId })
			.execute();
	}

	async getCustomeQueryToGetCount(entityName: any, condition: any): Promise<any> {
		let entity = await this.getEntities(entityName);
		return await getRepository(entity).count({
			where: condition
		});
	}



}