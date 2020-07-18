import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash';

import { ClientBrief } from '../../entities/ClientBrief';
import { Logger, ILogger } from '../../utils/logger';
import errors from '../../assets/i18n/en/errors';
import config from '../../config/config';
import { CommonService } from '../common.service';


export default class ClientBriefService {
  logger: ILogger;
  constructor() {
    this.logger = new Logger(__filename);
  }

  /**
* Inserts a new User into the database.
*/
  async insert(data: ClientBrief): Promise<ClientBrief> {
    this.logger.info('Create a new project', data);
    const newUser = await getRepository(ClientBrief).create(data);
    return await getRepository(ClientBrief).save(newUser);
  }

  /**
   * Returns a data by given user_id
   * @param id 
   * @param options 
   */
  async getByUserId(id: {}): Promise<any> {
    this.logger.info('Fetching de tails by id:  ============= ', id);
    return await getRepository(ClientBrief).find({ where: id });
  }

  async update(data: {
    id: null,
    user_id: null,
    project_id: null,
    client_id: null,
    expectation_of_project: null,
    budget: null,
    project_image: null,
    timeline: null,
    question_Answer: null
  }): Promise<any> {

    // console.log(" data ", data);

    // var results = await 
    getRepository(ClientBrief).findOne(data.id).then((results)=>{
      console.log(" results ",results);
      

        if (data.client_id) {
          results.client_id = data.client_id;
        }
        if (data.expectation_of_project) {
          results.expectation_of_project = data.expectation_of_project;
        }
        if (data.budget) {
          results.budget = data.budget;
        }
        if (data.project_image) {
          results.project_image = data.project_image;
        }
        if (data.timeline) {
          results.timeline = data.timeline;
        }
        if (data.question_Answer) {
          results.question_Answer = data.question_Answer;
        }
          getRepository(ClientBrief).save(results).then((ress)=>{
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
