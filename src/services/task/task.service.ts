import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { Task } from '../../entities/Task';
import { ProjectCreateDetails } from '../../entities/ProjectCreate';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class TaskService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: Task): Promise<Task> {
    this.logger.info('Create a new task', data);
    const newTask = await getRepository(Task).create(data);
    return await getRepository(Task).save(newTask);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: string): Promise<any> {
    this.logger.info('Fetching details by id:  ============= ', parseInt(id));
    return await getRepository(Task).find({where:{user_id : parseInt(id)},relations:['project_id']});
  }

  async getByUserIdandProjectid(options: {} | any): Promise<any> {
    this.logger.info('Fetching details by id:  ============= ',options);
    return await getRepository(Task).find({where:options});
  }

}
