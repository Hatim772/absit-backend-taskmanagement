import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { ContactCategoery } from '../../entities/ContactCategoery';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ContactCategoeryService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: ContactCategoery): Promise<ContactCategoery> {
    this.logger.info('Create a new ContactCategoery', data);
    const newContactCategoery = await getRepository(ContactCategoery).create(data);
    return await getRepository(ContactCategoery).save(newContactCategoery);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id : {} | any): Promise<any> {
    // this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    console.log("  === id",id);
    
    return await getRepository(ContactCategoery).find({where:id});
  }

  async getByid(options: {} | any): Promise<any> {
    console.log('Fetching details by id:  ============= ',options);
    return await getRepository(ContactCategoery).findOne(options.id);
  }


  async update(data: {
    id: null,
    categoery: null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(ContactCategoery).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      
        if (data.categoery) {
          results.categoery = data.categoery;
        }
          getRepository(ContactCategoery).save(results).then((ress)=>{
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

  // async delete(id : string): Promise<any> {
  //   console.log('Fetching details by id:  ============= ',id);
  //   var deletes = await getRepository(ContactCategoery).findOne(id);    
  //   return await getRepository(ContactCategoery).remove(deletes);
  // }


}
