import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash';

import { ProductCategoery } from '../../entities/ProductCategoery';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';

export default class ProductCategoeryService {
  logger: ILogger;
  constructor() {
    this.logger = new Logger(__filename);
  }

  /**
* Inserts a new User into the database.
*/
  async insert(data: ProductCategoery): Promise<ProductCategoery> {
    const newIncome = await getRepository(ProductCategoery).create(data);
    return await getRepository(ProductCategoery).save(newIncome);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: {} | any): Promise<any> {
    return await getRepository(ProductCategoery).find({ where: id });
  }

  async getByid(options: {} | any): Promise<any> {
    console.log('Fetching details by id:  ============= ',options);
    return await getRepository(ProductCategoery).findOne(options.id);
  }


  async update(data: {
    id: null,
    categoery: null
  }): Promise<any> {
    getRepository(ProductCategoery).findOne(data.id).then((results) => {
      if (data.categoery) {
        results.categoery = data.categoery;
      }
      getRepository(ProductCategoery).save(results).then((ress) => {
        return ress;
      })
        .catch((error) => {
          return error;
        })
    })
      .catch((err) => {
        return err;
      })
  }
  // async delete(id : string): Promise<any> {
  //   console.log('Fetching details by id:  ============= ',id);
  //   var deletes = await getRepository(ProductCategoery).findOne(id);    
  //   return await getRepository(ProductCategoery).remove(deletes);
  // }
}
