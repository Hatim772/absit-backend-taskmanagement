import { getRepository, getConnection, SelectQueryBuilder } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import _ from 'lodash';

import { Users } from '../../entities/Users';
import { UsersVerificationDetails } from '../../entities/UsersVerificationDetails';
import { Logger, ILogger } from '../../utils/logger';
import { generateRandomString } from '../../commonFunction/Utills';
import config from '../../config/config';
import errors from '../../assets/i18n/en/errors';
import { CommonService } from '../common.service';

export default class UserService {

  // userRepository: Repository<Users>;
  logger: ILogger;

  constructor() {
    this.logger = new Logger(__filename);
    // this.userRepository = getManager().getRepository(Users);
  }

  /**
   * Creates an instance of User.
   */
  async instantiate(data: Object) {
    return await getRepository(Users).create(data);
  }

  /**
   * Inserts a new User into the database.
   */
  async insert(data: Users): Promise<Users> {
    this.logger.info('Create a new user', data);
    const newUser = await getRepository(Users).create(data);
    return await getRepository(Users).save(newUser);
  }

  /**
   * Returns array of all users from db
   */
  async getAll(select?: any, options?: any): Promise<Users[]> {
    if (select && options) return await await getRepository(Users).find({ select, where: options });
    return await getRepository(Users).find();
  }

  /**
   * Returns array of all users from keys and values associated
   */
  async userSearch(values: any) {
    return await getRepository(Users).createQueryBuilder("user")
      .select([
        "user.full_name",
        "user.first_name",
        "user.last_name",
        "user.username",
        "user.email",
        "user.primary_mobile_number",
        "user.profile_pic",
        "user.is_activate",
        "user.user_role",
        "user.status",
        "user.createdDate"])
      .where("user.username = :username", { username: values.username })
      .orWhere("user.full_name = :full_name", { full_name: values.full_name })
      .orWhere("user.first_name = :first_name", { first_name: values.first_name })
      .orWhere("user.last_name = :last_name", { last_name: values.last_name })
      .getOne();
  }

  /**
   * Returns a user by given id
   */
  async getById(id: string | number, select?: any): Promise<Users | any> {
    this.logger.info('Fetching user by id: ', id);
    if (select && id) return await getRepository(Users).find({ select, where: { id } });
    if (id) return await getRepository(Users).findOne(id);
    return Promise.reject(false);
  }

  /**
   * Returns a user by email
   */
  async getByEmail(email: string): Promise<Users | undefined> {
    const users = await getRepository(Users).find({
      where: { email }
    });
    if (users && users.length > 0) {
      return users[0];  // typeorm find() returns array even if response is single object
    } else {
      return undefined;
    }
  }

  /**
   * Returns a user by email
   */
  async getByOptions(options: {} | any): Promise<Users | undefined> {
    const user = await getRepository(Users).find({ where: options });
    if (user && user.length > 0) {
      return user[0];
    } else {
      return undefined;
    }
  }

  /**
   * Returns a user by mobileNumber
   */
  async getByMobileNumber(mobileNumber: string): Promise<Users | undefined> {
    const users = await getRepository(Users).find({
      where: { primary_mobile_number: mobileNumber }
    });
    if (users && users.length > 0) {
      return users[0];  // typeorm find() returns array even if response is single object
    } else {
      return undefined;
    }
  }

  /**
   * Returns a user by token [basically we will extract userId from the token]
   */
  async getByToken(token: string): Promise<Users | undefined> {
    // extract id and return getById method
    const decoded: any = jwt.verify(token, config.auth.secretKey);
    return this.getById(decoded.id);
  }

  /**
   * Updates a user
   */
  async update(user: Users): Promise<Users | undefined> {
    try {
      const updatedUser = await getRepository(Users).save(user);
      return updatedUser;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async signupUser(data: any): Promise<Users> {
    this.logger.info('Create a new user', data);
    const userRepo = await getConnection().getRepository(Users);
    const names: Array<string> = data.full_name.split(' ');
    return await userRepo.save(await userRepo.create({
      first_name: names[0],
      last_name: names[1],
      email: data.email,
      password: data.password,
      primary_mobile_number: data.primary_mobile_number,
      activation_token: generateRandomString(1),
      otp: Math.floor(Math.random() * 9912919).toString()
    }));
  }

  async getBasicInfo(user_id: number) {
    this.logger.info('Getting user\'s basic info by id', [user_id]);
    const result: any = await getRepository("users")
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.userVerificationDetails", "verification")
      .leftJoinAndSelect("user.userPersonalInformation", "personalInfo")
      .leftJoinAndSelect("user.usersShippingAddress", "shippingAddress")
      .select([
        "user.first_name",
        "user.last_name",
        "user.primary_mobile_number",
        "user.secondary_mobile_number",
        "user.email",
        "user.username",
        "user.website",
        "user.profile_pic",
        "user.business_name",
        "verification.gst_number",
        "shippingAddress.address_line1",
        "shippingAddress.address_line2",
        "shippingAddress.city",
        "shippingAddress.landmark",
        "shippingAddress.pin_code",
        "shippingAddress.city",
        "personalInfo.about",
        "personalInfo.facebookProfile",
        "personalInfo.linkedinProfile",
        "personalInfo.instagramProfile",
        "personalInfo.twitterProfile",
        "personalInfo.pinterestProfile",
      ])
      .where("user.id=:user_id", { user_id })
      .getOne();
    return Promise.resolve({
      first_name: result.first_name,
      last_name: result.last_name,
      primary_mobile_number: result.primary_mobile_number,
      secondary_mobile_number: result.secondary_mobile_number,
      email: result.email,
      username: result.username,
      website: result.website,
      profile_pic: result.profile_pic,
      business_name: result.business_name,
      verification: result.userVerificationDetails,
      shippingAddress: result.usersShippingAddress,
      personalInfo: result.userPersonalInformation
    });
  }

  async customQueryWithMultiJoin(where: any, relations: any): Promise<any> {
    return await getRepository(Users).find({ where, relations });
  }

  async deactivateUser(id: string): Promise<Users> {
    this.logger.info('Deactivating user because user\'s verification details are altered of user-id:', id);
    const user = await this.getById(id);
    user.status = '0';
    return await await getRepository(Users).save(user);
  }

  async isUserVerified(id: string | number): Promise<string> {
    this.logger.info('Checking if user is authorized by admin as well as is activate', id);
    const user = await this.getById(id);
    if (user.status == '0') return Promise.reject(errors.USER_IS_NOT_VERFIED);
    if (user.is_activate == '0') return Promise.reject(errors.USER_IS_NOT_ACTIVATE);
    return Promise.resolve('user is okay');
  }

  async getUserProfile(id: number, moodboard_id?: number): Promise<any> {
    moodboard_id ? this.logger.info('Getting user profile by moodboard_id', moodboard_id) : this.logger.info('Getting user profile', id);
    const repo = moodboard_id ? await getRepository('moodboard').createQueryBuilder("moodboard") : await getRepository('users').createQueryBuilder("userDetails");
    const select: Array<string> = [
      "userDetails.id",
      "userDetails.first_name",
      "userDetails.last_name",
      "userDetails.business_name",
      "userDetails.profile_pic",
      "userDetails.website",
      "userDetails.primary_mobile_number",
      "userDetails.email",
      "personalInfo.about",
      "personalInfo.facebookProfile",
      "personalInfo.linkedinProfile",
      "personalInfo.instagramProfile",
      "personalInfo.twitterProfile",
      "personalInfo.pinterestProfile"
    ];
    if (moodboard_id) {
      repo
        .leftJoinAndSelect("moodboard.user", "userDetails")
        .leftJoinAndSelect("userDetails.userPersonalInformation", "personalInfo")
        .where("moodboard.status=:status AND moodboard.id=:moodboard_id", { moodboard_id, status: '1' })
        .andWhere("userDetails.user_role=:role", { role: '1' });
      select.push("moodboard.id");
    } else {
      repo
        .leftJoinAndSelect("userDetails.userPersonalInformation", "personalInfo")
        .where("userDetails.id=:user_id AND userDetails.user_role=:role", { user_id: id, role: '1' });
    }
    return await repo.select(select).getOne();
  }

  async getUserSampleOrderAddr(user_id: number | string): Promise<any> {
    try {
      return await getRepository('users')
        .createQueryBuilder("user")
        .leftJoinAndSelect("user.usersShippingAddress", "userShippingAddr")
        .select([
          "user.business_name",
          "user.primary_mobile_number",
          "user.secondary_mobile_number",
          "userShippingAddr.address_line1",
          "userShippingAddr.address_line2",
          "userShippingAddr.landmark",
          "userShippingAddr.city",
          "userShippingAddr.pin_code"
        ])
        .where("user.id=:user_id", { user_id })
        .getOne();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getUser(email: string, type: string) {
    let whereClause: any = { email, user_role: type };
    if (type !== '1') {
      whereClause.is_activate = '1';
      whereClause.status = '1';
    }
    return await getConnection().getRepository(Users).findOne(whereClause);
  }

  getExportUsers = async (startDate: Date, endDate: Date) => {
    let filters: any = {};
    if (startDate && endDate) {
      filters = {
        before: new Date(endDate).toISOString() as any,
        after: new Date(startDate).toISOString() as any,
        // before,
        // after
      };
      console.log("filters", filters);
    }
    const query = getRepository('users')
      .createQueryBuilder('user')
      .leftJoin('user.userVerificationDetails', 'verified')
      .leftJoin('user.projectManager', 'pm')
      .select([
        'user.id AS id',
        'user.first_name AS first_name',
        'user.last_name AS last_name',
        'user.website as website',
        'user.email as email',
        'user.primary_mobile_number as phone',
        'user.business_name as business_name',
        'user.status as status',
        'user.is_activate as is_active',
        'pm.first_name As project_manager',
        'verified.gst_number AS gst_number'
      ])
      .where('user.user_role=:role', { role: '1' })
    if (startDate && endDate) {
      query.andWhere('user.createdDate >= :after')
      query.andWhere('user.createdDate < :before')
      query.setParameters(filters)
    }
    query.orderBy('user.createdDate', 'ASC');

    return query.getRawMany();

  }

  getUsers = async (startDate: Date, endDate: Date) => {
    console.log("startDate", startDate);
    // const pageNumber = parseInt(option.pageNumber) || 1;
    // const recordPerPage = parseInt(option.recordPerPage) || 20;
    // const offset = (pageNumber - 1) * recordPerPage;
    // const query = getRepository('users')
    //   .createQueryBuilder('user')
    //   .leftJoin('user.userVerificationDetails', 'verified')
    //   .leftJoin('user.projectManager', 'pm')
    //   .select([
    //     'user.id AS id',
    //     'user.first_name AS first_name',
    //     'user.last_name AS last_name',
    //     'user.status AS status',
    //     'user.website as website',
    //     'user.email as email',
    //     'user.primary_mobile_number as phone',
    //     'user.business_name as business_name',
    //     'pm.first_name As project_manager',
    //     'verified.gst_number AS gst_number'
    //   ])
    //   .addSelect((subQuery: SelectQueryBuilder<any>) => {
    //     subQuery.from(Users, 'users')
    //       .select('COUNT(DISTINCT users.id)', 'userCount')
    //       .where('user.user_role=:role', { role: '1' })
    //     // if (option.status) {
    //     //   subQuery.leftJoin('users.userVerificationDetails', 'verified')
    //     //    // .andWhere('user.status=:sts AND (verified.gst_number IS NOT NULL OR verified.portfolio_file IS NOT NULL)', { sts: option.status });
    //     // }

    //     // if (option.status) {
    //     //   subQuery.where('users.status=:status', { status: option.status });
    //     // }
    //     // if (option.verification) {
    //     //   subQuery.leftJoin('users.userVerificationDetails', 'verified');
    //     //   if (option.verification == '1') {
    //     //     subQuery.andWhere('verified.gst_number IS NOT NULL OR verified.portfolio_file IS NOT NULL');
    //     //   } else if (option.verification == '0') {
    //     //     subQuery.andWhere('verified.gst_number IS NULL AND verified.portfolio_file IS NULL');
    //     //   }
    //     // }
    //     return subQuery;
    //   }, 'userCount')
    //   .limit(recordPerPage)
    //   .offset(offset)
    //   .where('user.user_role=:role', { role: '1' });
    // // if (option.status) {
    // //   query.andWhere('user.status=:sts AND (verified.gst_number IS NOT NULL OR verified.portfolio_file IS NOT NULL)', { sts: option.status, role: '1' });
    // // }
    // if (option.orderBy) {
    //   const order = option.orderBy == 'A' ? 'ASC' : 'DESC';
    //   query.orderBy('user.createdDate', order);
    // }
    // const data = await query.getRawMany();
    // if (data.length > 0) {
    //   return await this.createPagination(parseInt(data[0].userCount), pageNumber, recordPerPage, data.map(el => _.omit(el, 'userCount')));
    // } else {
    //   return await this.createPagination(data.length, pageNumber, recordPerPage, data);
    // }
  }

  getUserWithVerificationDetails(user_id: number): Promise<any> {
    return getRepository('users')
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userVerificationDetails', 'verification')
      .leftJoinAndSelect('user.projectManager', 'pm')
      .leftJoinAndSelect('user.usersShippingAddress', 'userAddress')
      .select([
        'user.username',
        'user.first_name',
        'user.last_name',
        'user.website',
        'user.email',
        'user.primary_mobile_number',
        'user.profile_pic',
        'user.is_activate',
        'user.status',
        'user.createdDate',
        'pm.first_name',
        'pm.last_name',
        'userAddress',

        'verification.gst_number',
        'verification.portfolio_file'
      ])
      .where('user.id=:user_id', { user_id })
      .getOne();
  }


  private createPagination(totalRecord: number, pageNumber: number, recordPerPage: number, data: any) {
    let pages = Math.ceil(totalRecord / recordPerPage);
    return {
      total: totalRecord,
      currentPage: pageNumber,
      recordPerPage,
      previous: pageNumber > 0 ? (pageNumber == 1 ? null : (pageNumber - 1)) : null,
      pages,
      next: pageNumber < pages ? pageNumber + 1 : null,
      data
    };
  }

  getUnverifiedUsers(): Promise<any> {
    return getRepository('UsersVerificationDetails')
      .createQueryBuilder('verifyuser')
      .leftJoinAndSelect('verifyuser.user', 'user')
      .select([
        'user.id',
        'user.first_name',
        'user.last_name',
        'user.website',
        'user.status',
        'user.project_manager_id',
        'verifyuser.id',
        'verifyuser.portfolio_file'
      ])
      .where('user.status = :status', { status: '0' })
      .orWhere('user.project_manager_id IS NULL')
      .getMany();
  }

}
