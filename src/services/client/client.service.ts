import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { ClientDetails } from '../../entities/Client';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ClientService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: ClientDetails): Promise<ClientDetails> {
    this.logger.info('Create a new client', data);
    const newUser = await getRepository(ClientDetails).create(data);
    return await getRepository(ClientDetails).save(newUser);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: string): Promise<any> {
    this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    return await getRepository(ClientDetails).find({where:{user_id : parseInt(id)}});
  }

  async getById(id: string): Promise<any> {
    console.log("  id  ",id);
    return await getRepository(ClientDetails).findOne(id);
  }

  async update(data: {
    id: null,
    client_name: null,
    email: null,
    expectation_of_project: null,
    mobile_no: null,
    categeory: null,
    address: null
  }): Promise<any> {

    console.log(" data ", data);

    // var results = await 
    getRepository(ClientDetails).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      

        if (data.client_name) {
          results.client_name = data.client_name;
        }
        if (data.email) {
          results.email = data.email;
        }
        if (data.mobile_no) {
          results.mobile_no = data.mobile_no;
        }
        if (data.categeory) {
          results.categeory = data.categeory;
        }
        if (data.address) {
          results.address = data.address;
        }
       
          getRepository(ClientDetails).save(results).then((ress)=>{
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
