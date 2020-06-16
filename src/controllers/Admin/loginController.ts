import { NextFunction, Request, Response, Router } from 'express';
import * as HttpStatus from 'http-status-codes';
import * as bcrypt from 'bcrypt';
import config from '../../config/config';
import { AuthHandler } from '../../middlewares/authHandler';
import UserService from '../../services/users/users.service';
import { getConnection } from 'typeorm';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';
const loginRouter: Router = Router();
const adminLoginRouter: Router = Router();
const { errors } = config;
const { messages } = config;
// on routes that end in /login
// -----------------------------
loginRouter.route('/')
  .post(async (req: Request, res: Response, next: NextFunction) => {
    // try {
    //   const developer = await new UserService().checkDeveloperCredential(connection, req.body);
    //   if (!developer) {
    //     return sendFailureResponse(errors.INVALID_LOGIN_CREDENTIALS, HttpStatus.NOT_FOUND, false, res);
    //   } else if (developer.is_activate !== '1' && developer.activation_token !== '') {
    //     return sendFailureResponse(errors.ACITVATE_ACCOUNT, HttpStatus.NOT_FOUND, false, res);
    //   } else {
    //     const authHandler = new AuthHandler();
    //     const token = authHandler.generateToken(developer);
    //     const userResponse = {
    //       token: token,
    //       name: developer.name,
    //       email: developer.email,
    //       type: developer.types
    //     };
    //     return sendSuccessResponse(userResponse, HttpStatus.OK, true, res);
    //   }
    // } catch (err) {
    //   return sendFailureResponse(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    // }
  });
adminLoginRouter.route('/')
  .post(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const admin = await new UserService().getUser(req.body.email, '2');
      if (admin) {
        let isCorrect = await bcrypt.compare(req.body.password, admin.password);
        if (!isCorrect) {
          return sendFailureResponse(errors.INVALID_PASSWORD, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
        } else {
          return sendSuccessResponse({
            token: new AuthHandler().generateToken(admin, true)
          },
            HttpStatus.OK,
            true,
            res);
        }
      } else {
        return sendFailureResponse(errors.INVALID_LOGIN, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
      }
    } catch (err) {
      return sendFailureResponse(err.message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    }
  });
const loginRouters = { adminLoginRouter, loginRouter };
export default loginRouters;
