import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { Expence } from '../../entities/Expence';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ExpenceService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: Expence): Promise<Expence> {
    this.logger.info('Create a new Expence', data);
    const newExpence = await getRepository(Expence).create(data);
    return await getRepository(Expence).save(newExpence);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id : {} | any): Promise<any> {
    // this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    console.log("  === id",id);
    
    return await getRepository(Expence).find({where:id});
  }

  async getByid(options: {} | any): Promise<any> {
    console.log('Fetching details by id:  ============= ',options);
    return await getRepository(Expence).findOne(options.id);
  }


  async update(data: {
    id: null,
    amount: null,
    income_name: null,
    expence_date: null,
    hash_tag : null,
    categoery : null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(Expence).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      
        if (data.amount) {
          results.amount = data.amount;
        }
        if (data.income_name) {
          results.income_name = data.income_name;
        }
        if (data.expence_date) {
          results.expence_date = data.expence_date;
        }

        if (data.hash_tag) {
          results.hash_tag = data.hash_tag;
        }
        if (data.categoery) {
          results.categoery = data.categoery;
        }
          getRepository(Expence).save(results).then((ress)=>{
            return ress;
          })
          .catch((error)=>{
            return error;
          })
    })
    .catch((err)=>{
        return err;
    })
  }

  async delete(id : string): Promise<any> {
    console.log('Fetching details by id:  ============= ',id);
    var deletes = await getRepository(Expence).findOne(id);    
    return await getRepository(Expence).remove(deletes);
  }


}
