import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { Income } from '../../entities/Income';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class IncomeService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: Income): Promise<Income> {
    this.logger.info('Create a new Income', data);
    const newIncome = await getRepository(Income).create(data);
    return await getRepository(Income).save(newIncome);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id : {} | any): Promise<any> {
    // this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    console.log("  === id",id);
    
    return await getRepository(Income).find({where:id});
  }

  async getByid(options: {} | any): Promise<any> {
    console.log('Fetching details by id:  ============= ',options);
    return await getRepository(Income).findOne(options.id);
  }


  async update(data: {
    id: null,
    amount: null,
    income_name: null,
    incomedate: null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(Income).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      
        if (data.amount) {
          results.amount = data.amount;
        }
        if (data.income_name) {
          results.income_name = data.income_name;
        }
        if (data.incomedate) {
          results.incomedate = data.incomedate;
        }
          getRepository(Income).save(results).then((ress)=>{
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
    var deletes = await getRepository(Income).findOne(id);    
    return await getRepository(Income).remove(deletes);
  }


}
