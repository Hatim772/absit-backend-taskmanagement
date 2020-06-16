import { Request, Response, NextFunction } from "express";
import { Users } from "../entities/Users";
import errors from '../assets/i18n/en/errors';
import * as HttpStatus from 'http-status-codes';


export async function isAdmin(req: Request, res: Response, next: NextFunction) {
    const user: Users = req.user;
    if (user.user_role !== '2') {
        return res.status(HttpStatus.UNAUTHORIZED).send({
            code: HttpStatus.UNAUTHORIZED,
            message: errors.NO_ADMIN_FOUND
        });
    } return next();
}