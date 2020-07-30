import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { TaskComment } from '../../entities/TaskComments';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class TaskCommentService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: TaskComment): Promise<TaskComment> {
    this.logger.info('Create a new TaskComment', data);
    const newTaskComment = await getRepository(TaskComment).create(data);
    return await getRepository(TaskComment).save(newTaskComment);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: string): Promise<any> {
    // this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    console.log("  === id",id);
    
    return await getRepository(TaskComment).find({where:{user_id : parseInt(id)}});
  }

  async getByUserIdandProjectid(options: {} | any): Promise<any> {
    this.logger.info('Fetching details by id:  ============= ',options);
    return await getRepository(TaskComment).find({where:options});
  }


  async update(data: {
    id: null,
    comment: null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(TaskComment).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      
        if (data.comment) {
          results.comment = data.comment;
        }
          getRepository(TaskComment).save(results).then((ress)=>{
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
