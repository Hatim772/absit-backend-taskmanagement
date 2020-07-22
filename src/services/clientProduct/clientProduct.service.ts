import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash';

import { ClientProductDetails } from '../../entities/clientProduct';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ClientProductService {
  logger: ILogger;
  constructor() {
    this.logger = new Logger(__filename);
  }

  /**
* Inserts a new User into the database.
*/
  async insert(data: ClientProductDetails): Promise<ClientProductDetails> {
    this.logger.info('Create a new project', data);
    const newUser = await getRepository(ClientProductDetails).create(data);
    return await getRepository(ClientProductDetails).save(newUser);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: {}): Promise<any> {
    this.logger.info('Fetching de tails by id:  ============= ', id);
    console.log("id ",id);
    
    return await getRepository(ClientProductDetails).find({ where: id });
  }

  async update(data: {
    id: null,
    product_name: null,
    price: null,
    categoery: null,
    product_pic: null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(ClientProductDetails).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      

        if (data.product_name) {
          results.product_name = data.product_name;
        }
        if (data.price) {
          results.price = data.price;
        }
        if (data.categoery) {
          results.categoery = data.categoery;
        }
        if (data.product_pic) {
          results.product_pic = data.product_pic;
        }
        getRepository(ClientProductDetails).save(results).then((ress)=>{
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

}
