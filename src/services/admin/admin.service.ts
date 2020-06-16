import _ from 'lodash';
import { getRepository, SelectQueryBuilder } from "typeorm";

import { Logger, ILogger } from '../../utils/logger';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import { Users } from '../../entities/Users';

export default class AdminService {
    logger: ILogger;

    constructor() {
        this.logger = new Logger(__filename);
    }

    /**
     * Used to get users with project managers
     */
    async getUsersWithPMs(): Promise<any> {
        return await getRepository('users')
            .createQueryBuilder('user')
            .leftJoin('user.projectManager', 'pm')
            .select([
                'user.id',
                'user.username',
                'user.first_name',
                'pm.id',
                'pm.full_name',
                'pm.email',
                'pm.phone_number',
            ])
            .getMany();
    }

    getProjectManagerListForUser() {
        const query = getRepository('users')
            .createQueryBuilder('user')
            .select([
                'user.id AS id',
                'user.first_name AS first_name',
                'user.last_name AS last_name',
            ])
            .where('user.user_role=:role', { role: '3' })
        return query.getRawMany();
    }

    getProjectManagers = async (options: any) => {
        const pageNumber = options.pageNumber || 1;
        const recordPerPage = options.recordPerPage || 10;
        const offset = (pageNumber - 1) * recordPerPage;
        const query = getRepository('users')
            .createQueryBuilder('user')
            .select([
                'user.id AS id',
                'user.first_name AS first_name',
                'user.last_name AS last_name',
                'user.email as email',
                'user.primary_mobile_number as phone_number',
            ])
        // adding count in every objects
        query.addSelect((subQuery: SelectQueryBuilder<any>) => {
            subQuery.from(Users, 'user')
                .select('COUNT(DISTINCT user.id)', 'count');
            subQuery.where('user.user_role=:role', { role: '3' });
            return subQuery;
        }, 'count')
            .limit(recordPerPage)
            .offset(offset)
            .where('user.user_role=:role', { role: '3' })
            .orderBy('user.createdDate', 'DESC')
        const data = await query.getRawMany();
        if (data.length > 0) {
            return this.createPagination(parseInt(data[0].count), pageNumber, recordPerPage, data.map(el => _.omit(el, 'count')));
        } else {
            return this.createPagination(data.length, pageNumber, recordPerPage, data);
        }
    }

    async checkIfPMNotAssign(id?: string | number): Promise<any> {
        const query = getRepository('users')
            .createQueryBuilder('user')
            .where('user.project_manager_id=:id', { id: id })
        return await query.getCount();
    }

    createPagination(totalRecords: number, pageNumber: number, recordPerPage: number, data: any) {
        let pages = Math.ceil(totalRecords / recordPerPage);
        return {
            totalRecords,
            currentPage: pageNumber,
            recordPerPage,
            previous: pageNumber > 0 ? (pageNumber == 1 ? null : (pageNumber - 1)) : null,
            pages,
            next: pageNumber < pages ? pageNumber + 1 : null,
            data,
        };
    }
}