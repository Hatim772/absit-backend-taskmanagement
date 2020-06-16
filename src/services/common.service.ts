// third parties
import { getManager, getRepository } from 'typeorm';

// locals
import { ILogger, Logger } from '../utils/logger';

// entities
import { UsersAdditionalSettings } from "../entities/UsersAdditionalSettings";
import { OrderBillingAddress } from "../entities/OrderBillingAddress";
import { UsersShippingAddress } from "../entities/UsersShippingAddress";
import { UsersVerificationDetails } from "../entities/UsersVerificationDetails";
import { Moodboard } from '../entities/Moodboard';
import { Products } from '../entities/Products';
import { MoodboardOrders } from '../entities/MoodboardOrders';
// import { ProjectManager } from '.././entities/ProjectManager';
import { MoodboardOrderProducts } from '../entities/MoodboardOrderProducts';
import { Projects } from '../entities/Project';
import { OrdersReference } from '../entities/OrdersReference';
import { Orders } from '../entities/Orders';
import { MoodboardViews } from '../entities/MoodboardViews';
import { MoodboardItems } from '../entities/MoodboardItems';
import { RequestForPricing } from '../entities/RequestForPricing';
import { OrderShippingAddress } from '../entities/OrderShippingAddress';
import { ProjectFiles } from '../entities/ProjectFiles';
import { ProductFaq } from '../entities/ProductFaq';
import { Images } from '../entities/Images';
import { Colors } from '../entities/Colors';
import { Labels } from '../entities/Labels';
import { Categories } from '../entities/Categories';
import { MoodboardTags } from '../entities/MoodboardTags';
import { Tags } from '../entities/Tags';
import { OrderTransactions } from '../entities/OrderTransactions';
import { UserPersonalInformation } from '../entities/UserPersonalInformation';
import { AQSITBankDetails } from '../entities/AQSITBankDetails';
import { Users } from '../entities/Users';

export class CommonService {
  logger: ILogger;
  entityRepository: any;

  constructor(Entity?: string) {
    if (Entity) this.entitySelector(Entity);
    this.logger = new Logger(__filename);
  }

  /**
   * For setting up entityRepository 
   * @param Entity 
   */
  entitySelector(Entity: string): any {
    switch (Entity) {
      case 'users':
        this.entityRepository = Users;
        break;
      case 'usersAdditionalSettings':
        this.entityRepository = UsersAdditionalSettings;
        break;
      case 'usersShippingAddress':
        this.entityRepository = UsersShippingAddress;
        break;
      case 'usersVerificationDetails':
        this.entityRepository = UsersVerificationDetails;
        break;
      case 'usersPersonalInfo':
        this.entityRepository = UserPersonalInformation;
        break;
      case 'moodboard':
        this.entityRepository = Moodboard;
        break;
      case 'moodboardOrders':
        this.entityRepository = MoodboardOrders;
        break;
      case 'moodboardViews':
        this.entityRepository = MoodboardViews;
        break;
      case 'moodboardOrderProducts':
        this.entityRepository = MoodboardOrderProducts;
        break;
      case 'moodboardItems':
        this.entityRepository = MoodboardItems;
        break;
      case 'moodboardTags':
        this.entityRepository = MoodboardTags;
        break;
      case 'products':
        this.entityRepository = Products;
        break;
      case 'requestForPricing':
        this.entityRepository = RequestForPricing;
        break;
      case 'project':
        this.entityRepository = Projects;
        break;
      case 'orderReference':
        this.entityRepository = OrdersReference;
        break;
      case 'orderBillingAddress':
        this.entityRepository = OrderBillingAddress;
        break;
      case 'orders':
        this.entityRepository = Orders;
        break;
      case 'orderTransaction':
        this.entityRepository = OrderTransactions;
        break;
      case 'AQSITBankDetails':
        this.entityRepository = AQSITBankDetails;
        break;
      case 'projectFiles':
        this.entityRepository = ProjectFiles;
        break;
      case 'productfaq':
        this.entityRepository = ProductFaq;
        break;
      case 'orderShippingAddress':
        this.entityRepository = OrderShippingAddress;
        break;
      case 'image':
        this.entityRepository = Images;
        break;
      case 'color':
        this.entityRepository = Colors;
        break;
      case 'label':
        this.entityRepository = Labels;
        break;
      case 'category':
        this.entityRepository = Categories;
        break;
      case 'tags':
        this.entityRepository = Tags;
        break;
      default:
        this.logger.error('No entity provided');
        break;
    }
    this.entityRepository = getManager().getRepository(this.entityRepository);
  }

  /**
   * Inserts a new data
   * @param data
   */
  async insert(data: any): Promise<any> {
    this.logger.info('Inserting a data', data);
    const insertedData = this.entityRepository.create(data);
    return await this.entityRepository.save(insertedData);
  }

  /**
   * Inserts multiple data
   * @param data
   */
  async insertMany(data: any): Promise<any> {
    this.logger.info('Inserting multiple data', data);
    return await this.entityRepository.save(data);
  }

  /**
   * Used as insertMany function
   * @param entity 
   * @param data 
   */
  async bulkInsert(entity: string, data: Array<any>) {
    return await getRepository(entity)
      .createQueryBuilder()
      .insert()
      .values(data)
      .execute();
  }

  /**
   * Updates a data
   * @param data
   */
  async update(data: any): Promise<any> {
    this.logger.info('Updating data', data);
    return await this.entityRepository.save(data);
  }

  /**
   * Update multiple
   * @param entity 
   * @param ids 
   * @param updationValue 
   */
  async updateMultiple(entity: string, ids: Array<number | string>, updationValue: any): Promise<any> {
    this.logger.info('Updating multiple values where entity, ids:', [entity, ids]);
    return await getRepository(entity)
      .createQueryBuilder()
      .update()
      .set(updationValue)
      .whereInIds(ids)
      .execute();
  }

  /** 
    * Removes data
    * @param id
    */
  async remove(id: string | number): Promise<any> {
    this.logger.info('Deleting the data from: ' + this.entityRepository + ' with id: ' + id);
    let dataTobeRemoved = await this.entityRepository.findOne(id);
    if (!dataTobeRemoved) return Promise.reject('No value found for remove');
    return await this.entityRepository.remove(dataTobeRemoved);
  }

  /**
   * Get by options like where, select, order etc.
   * @param options 
   */
  async getByOptions(options: {} | any): Promise<any> {
    return await this.entityRepository.find(options);
  }

  /**
   * Get in ids
   * @param entity 
   * @param ids 
   */
  async getInIds(entity: string, ids: Array<number | string>): Promise<any> {
    return await getRepository(entity)
      .createQueryBuilder()
      .whereInIds(ids)
      .getMany();
  }

  /**
   * Returns array of all data from db
   * @param id
   * @param options 
   */
  async getAll(id?: string | number, options?: {}): Promise<any[]> {
    if (options) return await this.entityRepository.find(options);
    if (id) return await this.entityRepository.find({ user_id: id });
    return await this.entityRepository.find();
  }

  /**
   * Returns a data by given id
   * @param id
   */
  async getById(id: string | number): Promise<any> {
    this.logger.info('Fetching details by id: ', id);
    if (id) return await this.entityRepository.findOne(id);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: string | number, options?: {}): Promise<any> {
    this.logger.info('Fetching details by id: ', id);
    if (options) {
      return await this.entityRepository.find(options);
    } else if (id) {
      return await this.entityRepository.find({ user_id: id });
    }
  }

  /**
   * Get lasst entry 
   * @param condition 
   */
  async getLastEntry(condition: any): Promise<any> {
    this.logger.info('Getting last entry of provided condition: ', condition);
    return await this.entityRepository.find({ where: condition, order: { 'createdDate': 'DESC' }, take: 1 });
  }

  async customQueryWithMultiJoin(Entity: any, whereCondition: any, relations: any): Promise<any> {
    return await getRepository(Entity)
      .find({
        where: whereCondition,
        relations: relations
      });
  }

  async getCount(entity: string, condition?: { where: string, params?: {} }): Promise<any> {
    const qb = getRepository(entity).createQueryBuilder();
    if (condition) {
      qb.where(condition.where, condition.params);
    }
    return await qb.getCount();
  }


  /**
   * remove moodboard colors
   * default alias is entity
   */
  async removeMultipleFromEntity(entity: string, ids: Array<number | string>, andWhere?: { condition: string, params: any }): Promise<any> {
    const qb = getRepository(entity)
      .createQueryBuilder()
      .delete()
      .whereInIds(ids);
    if (andWhere) {
      qb.andWhere(andWhere.condition, andWhere.params);
    }
    return await qb.execute();
  }

  /**
   * This method is only for returning array of id while typeorm issue: https://github.com/typeorm/typeorm/issues/4176 
   * @params entity: same as query selector in commonService
   */
  async bulkInsertWithForOf(entity: string, insertionValues: Array<any>, uuid?: boolean): Promise<any> {
    this.logger.info("Inserting multiple for resolving current bug of getting last id only");
    let ids: number[] = [];
    let uuids: string[] = [];
    this.entitySelector(entity);
    for (let el of insertionValues) {
      el = this.entityRepository.create(el);
      let raw = await this.entityRepository.save(el);
      ids.push(raw.id);
      if (uuid) {
        uuids.push(raw.order_uuid);
      }
    }
    if (uuid) {
      return Promise.resolve({ ids, uuids });
    }
    return Promise.resolve(ids);
  }

  /**
   * For creating pagination
   * @param totalRecords 
   * @param pageNumber 
   * @param recordPerPage 
   * @param data 
   */
  createPagination(totalRecords: number, pageNumber: number, recordPerPage: number, data: any) {
    let pages = Math.ceil(totalRecords / recordPerPage);
    return {
      totalRecords,
      currentPage: pageNumber,
      recordPerPage,
      previous: pageNumber > 0 ? (pageNumber == 1 ? null : (pageNumber - 1)) : null,
      pages,
      next: pageNumber < pages ? pageNumber + 1 : null,
      data,
    };
  }

  async getAdminIds(): Promise<any> {
    const adminUsers = await getRepository(Users).createQueryBuilder().
      select(['GROUP_CONCAT(DISTINCT(id)) as ids']).where('user_role=:user_role', { user_role: '2' }).getRawOne();
    return adminUsers.ids;
  }

  async getAdminEmail(): Promise<any> {
    const adminUsers = await getRepository(Users).createQueryBuilder().
      select(['GROUP_CONCAT(DISTINCT(email)) as emails']).where('user_role=:user_role', { user_role: '2' }).getRawOne();
    return adminUsers.emails;
  }
}