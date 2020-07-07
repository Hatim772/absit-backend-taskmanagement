import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash'; 

import { ProjectCreateDetails } from '../../entities/ProjectCreate';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ProjCreatectService {
    logger: ILogger;
    constructor() {
        this.logger = new Logger(__filename);
    }

       /**
   * Inserts a new User into the database.
   */
  async insert(data: ProjectCreateDetails): Promise<ProjectCreateDetails> {
    this.logger.info('Create a new project', data);
    const newUser = await getRepository(ProjectCreateDetails).create(data);
    return await getRepository(ProjectCreateDetails).save(newUser);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: string | number, options?: {}): Promise<any> {
    this.logger.info('Fetching details by id: ', id);
    // if (options) {
    //   return await this.entityRepository.find(options);
    // } else if (id) {
    //   return await this.entityRepository.find({ user_id: id });
    // }
  }

}
