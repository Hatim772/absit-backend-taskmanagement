// Third parties
import { Request, Response } from 'express';
import * as HttpStatus from 'http-status-codes';
import _ from 'lodash';

// Locals
import config from '../../config/config';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import { throwAnError } from '../../commonFunction/throwAnError';

// entities
// import { ProjectManager } from '../../entities/ProjectManager';
import { Users } from '../../entities/Users';

// services
import AdminService from '../../services/admin/admin.service';
import { CommonService } from '../../services/common.service';
const { errors } = config;
let common: CommonService = new CommonService();
let admin: AdminService = new AdminService();

export default class UserController {
    constructor() { }

    async addProjectManager(req: Request, res: Response) {
        try {
            const body = _.pick(req.body, ['email', 'first_name', 'last_name', 'primary_mobile_number', 'primary_mobile_number', 'password', 'id', 'is_activate', 'user_role', 'status']);
            common = new CommonService('users');
            let message: string = 'Project manager added.';
            if (req.body.id) {
                // update case
                const pm: Users = await common.getById(body.id);
                pm.first_name = body.first_name;
                pm.last_name = body.last_name;
                pm.email = body.email;
                pm.primary_mobile_number = body.primary_mobile_number;
                if (body.password) {
                    pm.password = await Users.setPassword(body.password);
                }
                await common.update(pm);
                message = 'Project manager updated.';
            } else {
                if (req.body.primary_mobile_number) {
                    body['primary_mobile_number'] = req.body.primary_mobile_number;
                }
                body['status'] = 1;
                body['user_role'] = 3;
                body['is_activate'] = 1;
                // insert case
                await common.insert(body);
            }
            success(message, (req.body.id ? HttpStatus.OK : HttpStatus.CREATED), true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async deleteProjectManager(req: Request, res: Response) {
        try {
            const body = _.pick(req.query, ['id']);
            common = new CommonService('users');
            let message: string = 'Project manager deleted.';
            if (body.id) {
                // delete case
                const checkIfPmNotAssign: any = await admin.checkIfPMNotAssign(body.id);
                if (checkIfPmNotAssign) throw errors.PROJECT_MANAGER_IS_ASSIGNED;
                await common.remove(body.id);
                message = 'Project manager deleted.';
            } else {
                throw errors.INVALID_REQUEST;
            }
            success(message, (req.body.id ? HttpStatus.OK : HttpStatus.CREATED), true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async getAllProjectManagers(req: Request, res: Response) {
        try {
            const query = _.pick(req.query, ['pageNumber', 'recordPerPage', 'orderBy']);
            const data = await admin.getProjectManagers(query);
            success(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    /**
     * This method is used get
     * PM with full_name and id
     * @param req 
     * @param res 
     */
    async getPMs(req: Request, res: Response) {
        try {
            const data = await admin.getProjectManagerListForUser();
            success(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async listUsersWithProjectManagers(req: Request, res: Response) {
        try {
            const data = await admin.getUsersWithPMs();
            success(data, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async updateUsersPM(req: Request, res: Response) {
        try {
            common = new CommonService('users');
            const user: Users = await common.getById(req.body.user_id);
            user.project_manager_id = parseInt(req.body.project_manager_id);
            await common.update(user);
            success(`User with id:${req.body.user_id} is now assigned to PM with id:${req.body.project_manager_id}`, HttpStatus.OK, true, res);
        } catch (error) {
            // if p_m_id is not right one
            if (error.code == 'ER_NO_REFERENCED_ROW_2') error = `There's no project manager available with id: ${req.body.project_manager_id}. Please try another.`;
            throwAnError(error, res);
        }
    }

    async getManagerById(req: Request, res: Response) {
        try {
            common = new CommonService('users');
            const user: Users = await common.getById(req.params.userId);
            let pm = {
                first_name : user.first_name,
                last_name : user.last_name,
                email : user.email,
                primary_mobile_number : user.primary_mobile_number
            };
            success(pm, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }

    async updateManagerById(req: Request, res: Response) {
        try {
            common = new CommonService('users');
            const user: Users = await common.getById(req.params.userId);
            user.first_name = req.body.first_name || user.first_name;
            user.last_name = req.body.last_name || user.last_name;
            user.email = req.body.email || user.email;
            user.primary_mobile_number = req.body.primary_mobile_number || user.primary_mobile_number;
            await common.update(user);
            success('pm updated successfully', HttpStatus.OK, true, res);
        } catch (err) {
            let message = err.message.startsWith('ER_DUP_ENTRY') ? (err.message.includes('@') ? errors.DUPLICATE_SIGNUP_EMAIL : errors.DUPLICATE_SIGNUP_PHONE_NUMBER) : err.message;
            throwAnError(message, res);
        }
    }

}
