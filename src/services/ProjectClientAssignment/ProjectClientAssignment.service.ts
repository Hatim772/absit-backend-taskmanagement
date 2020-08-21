import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { ProjectClientAssignment } from '../../entities/ProjectClientAssignment';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ProjectClientAssignmentService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: ProjectClientAssignment): Promise<ProjectClientAssignment> {
    this.logger.info('Create a new ProjectClientAssignment', data);
    const newProjectClientAssignment = await getRepository(ProjectClientAssignment).create(data);
    return await getRepository(ProjectClientAssignment).save(newProjectClientAssignment);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id : {} | any): Promise<any> {
    // this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    console.log("  === id",id);
    
    return await getRepository(ProjectClientAssignment).find({where:id});
  }

  async getByid(options: {} | any): Promise<any> {
    console.log('Fetching details by id:  ============= ',options);
    return await getRepository(ProjectClientAssignment).findOne(options.id);
  }


  async update(data: {
    id: null,
    client_id: null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(ProjectClientAssignment).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      
        if (data.client_id) {
          results.client_id = data.client_id;
        }
          getRepository(ProjectClientAssignment).save(results).then((ress)=>{
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
  //   var deletes = await getRepository(ProjectClientAssignment).findOne(id);    
  //   return await getRepository(ProjectClientAssignment).remove(deletes);
  // }


}
